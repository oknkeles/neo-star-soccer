/**
 * "Press any key to begin": the first real key / tap sends { kind: 'start' } and nothing else;
 * held keys never start it; the Action (stamina) bar helpers.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ControlCommand } from '../../../core/types';
import { Controls } from '../controls';
import { staminaColor, TiredWatch, TIRED_AT, startInfo } from '../startPrompt';

class FakeTarget {
  private map = new Map<string, Set<(e: unknown) => void>>();
  addEventListener(ev: string, fn: (e: unknown) => void) { (this.map.get(ev) ?? this.map.set(ev, new Set()).get(ev)!).add(fn); }
  removeEventListener(ev: string, fn: (e: unknown) => void) { this.map.get(ev)?.delete(fn); }
  fire(ev: string, e: unknown) { this.map.get(ev)?.forEach((f) => f(e)); }
}

const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let win: FakeTarget;

beforeAll(() => {
  for (const k of ['window', 'HTMLElement', 'HTMLCanvasElement', 'matchMedia']) saved[k] = g[k];
  win = new FakeTarget();
  g.window = win;
  g.HTMLElement = class {};
  g.HTMLCanvasElement = class {};
  g.matchMedia = () => ({ matches: false });
});
afterAll(() => { for (const k of Object.keys(saved)) g[k] = saved[k]; });

function make(awaiting: boolean) {
  const sent: ControlCommand[] = [];
  const state = {
    awaitingStart: awaiting, phase: 'live', players: [{ id: 'u', isUser: true, side: 'us', pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, stamina: 1 }],
    ball: { pos: { x: 0.5, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, ownerId: 'u' },
  };
  const engine = {
    state,
    setup: { userId: 'u' },
    input: (c: ControlCommand) => { sent.push(c); if (c.kind === 'start') state.awaitingStart = false; },
    canKick: () => true,
  };
  const surface = new FakeTarget();
  const controls = new Controls(engine as never, surface as never, { toWorld: () => ({ x: 0, y: 0 }), enabled: () => true, controlMode: 'calm' });
  return { controls, sent, state, surface };
}
const key = (code: string, extra: Record<string, unknown> = {}) => ({ code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: null, preventDefault() {}, ...extra });

describe('press any key to begin', () => {
  it('SPACE only starts the moment (no aim, no kick)', () => {
    const { controls, sent } = make(true);
    win.fire('keydown', key('Space'));
    expect(sent).toEqual([{ kind: 'start' }]);
    controls.update(0.016, 1);
    expect(sent.some((c) => c.kind === 'aimStart' || c.kind === 'kick')).toBe(false);
    controls.dispose();
  });

  it('modifier keys, M, held-key repeats and shortcuts do not start it', () => {
    const { controls, sent, state } = make(true);
    for (const code of ['ShiftLeft', 'ControlLeft', 'KeyM', 'KeyV', 'Tab', 'F5']) win.fire('keydown', key(code));
    win.fire('keydown', key('KeyW', { repeat: true }));
    win.fire('keydown', key('KeyR', { ctrlKey: true }));
    expect(sent).toEqual([]);
    expect(state.awaitingStart).toBe(true);
    controls.dispose();
  });

  it('sends nothing but the start while holding (update is silent) and run keys carry on afterwards', () => {
    const { controls, sent } = make(true);
    win.fire('keydown', key('KeyD', { repeat: true })); // held from before: remembered, never starts
    controls.update(0.016, 1);
    expect(sent).toEqual([]);
    win.fire('keydown', key('KeyF')); // any real key starts; F does not also pass / call
    expect(sent).toEqual([{ kind: 'start' }]);
    controls.update(0.016, 1.02);
    expect(sent.some((c) => c.kind === 'moveDir')).toBe(true);
    expect(sent.some((c) => c.kind === 'callForBall' || c.kind === 'aimStart' || c.kind === 'kick')).toBe(false);
    controls.dispose();
  });

  it('a click or tap on the surface starts it (and only starts it)', () => {
    const { controls, sent, surface } = make(true);
    surface.fire('pointerdown', { target: surface, pointerType: 'mouse', button: 0 });
    expect(sent).toEqual([{ kind: 'start' }]); // the click only starts: no run-to-point
    expect(controls.tryStart()).toBe(false);
    controls.dispose();
  });

  it('is inert when the engine does not hold the moment (awaitingStart undefined / false)', () => {
    const a = make(false);
    win.fire('keydown', key('KeyW'));
    expect(a.sent.some((c) => c.kind === 'start')).toBe(false);
    expect(a.controls.tryStart()).toBe(false);
    a.controls.dispose();
    const b = make(true);
    delete (b.state as { awaitingStart?: boolean }).awaitingStart;
    expect(b.controls.awaitingStart()).toBe(false);
    b.controls.dispose();
  });
});

describe('Action bar helpers', () => {
  it('colour goes green → amber → red', () => {
    const rgb = (s: string) => s.match(/\d+/g)!.map(Number);
    const [gr, gg] = rgb(staminaColor(1));
    const [ar, ag] = rgb(staminaColor(0.4));
    const [rr, rg] = rgb(staminaColor(0.05));
    expect(gg).toBeGreaterThan(gr * 1.3);       // green dominant
    expect(ar).toBeGreaterThan(200); expect(ag).toBeGreaterThan(180); // amber
    expect(rr).toBeGreaterThan(rg * 2.5);       // red dominant
  });

  it('the tired hint shows once per drain and re-arms after a recovery', () => {
    const w = new TiredWatch();
    expect(w.update(0.6, 0)).toBe(0);
    expect(w.update(TIRED_AT - 0.01, 1)).toBeGreaterThan(0.9);
    expect(w.low).toBe(true);
    expect(w.update(0.1, 4.5)).toBe(0);          // expired, not shown again while still drained
    expect(w.update(0.5, 5)).toBe(0);
    expect(w.low).toBe(false);
    expect(w.update(0.1, 6)).toBeGreaterThan(0.9); // re-armed
  });

  it('start copy comes from the moment strings, TR + tap variant', () => {
    const k = startInfo('open_play', false);
    const tp = startInfo('open_play', true);
    expect(k.title.length).toBeGreaterThan(2);
    expect(k.tip.length).toBeGreaterThan(5);
    expect(k.key).not.toBe(tp.key);
  });
});
