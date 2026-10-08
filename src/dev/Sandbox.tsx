/**
 * Developer sandbox (open the app with #sandbox). Owner: view agent.
 * Mounts a moment in the 3D (default) or 2D view with every moment type, difficulty, weather,
 * camera / zoom and quality combination, playable with the keyboard. Uses the real engine
 * when it works and falls back to a small mock engine. Hash params: type, v=2d|3d, diff=easy|normal|hard,
 * kind, time, cam, q, shadows, help, panel. `window.__sandbox` exposes { engine, handle } for debugging.
 */
import { useEffect, useRef, useState } from 'react';
import { t } from '../core/i18n';
import type { CameraMode, MomentResult, MomentType, Weather } from '../core/types';
import { audio } from '../audio/api';
import { createMoment, type MomentEngine } from '../match/engine/api';
import { mountMomentView, mountStadiumBackdrop, type MomentViewHandle } from '../match/view/api';
import { mountMomentView2D } from '../match/view2d/api';
import '../match/view/strings';
import { createMockMoment } from './mockEngine';
import { makeSandboxSetup } from './sandboxSetup';

const TYPES: MomentType[] = [
  'open_play', 'counter', 'one_on_one', 'cross_receive', 'wing_cross', 'build_up', 'defend',
  'free_kick', 'penalty', 'corner', 'drill_free_kick', 'drill_finishing', 'drill_passing',
];
const VIEWS = ['2d', '3d'] as const;
const DIFFS = ['easy', 'normal', 'hard'] as const;
const DIFF_VALUE: Record<(typeof DIFFS)[number], number> = { easy: 0.3, normal: 0.5, hard: 0.72 };
const KINDS: Weather['kind'][] = ['clear', 'cloudy', 'rain', 'snow', 'fog'];
const TIMES: Weather['time'][] = ['day', 'dusk', 'night'];
const CAMS: CameraMode[] = ['behind', 'broadcast', 'top'];
const QUALITIES = ['low', 'medium', 'high'] as const;

function readHash(): Record<string, string> {
  const q = location.hash.split('?')[1] ?? '';
  return Object.fromEntries(new URLSearchParams(q));
}

export default function Sandbox() {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<MomentViewHandle | null>(null);
  const h = readHash();
  const [type, setType] = useState<MomentType>((h.type as MomentType) ?? 'one_on_one');
  const [view, setView] = useState<(typeof VIEWS)[number]>(h.v === '2d' ? '2d' : '3d');
  const [diff, setDiff] = useState<(typeof DIFFS)[number]>((DIFFS as readonly string[]).includes(h.diff) ? (h.diff as 'easy') : 'easy');
  const [kind, setKind] = useState<Weather['kind']>((h.kind as Weather['kind']) ?? 'clear');
  const [time, setTime] = useState<Weather['time']>((h.time as Weather['time']) ?? 'night');
  const [cam, setCam] = useState<CameraMode>((h.cam as CameraMode) ?? 'behind');
  const [quality, setQuality] = useState<(typeof QUALITIES)[number]>((h.q as 'low') ?? 'medium');
  const [shadows, setShadows] = useState(h.shadows !== '0');
  const [backdrop, setBackdrop] = useState(h.backdrop === '1');
  const [help, setHelp] = useState(h.help === '1');
  const [run, setRun] = useState(0);
  const [engineKind, setEngineKind] = useState<'real' | 'mock'>('mock');
  const [result, setResult] = useState<MomentResult | null>(null);
  const [panel, setPanel] = useState(h.panel !== '0');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (backdrop && view === '3d') {
      const b = mountStadiumBackdrop(el, { time });
      return () => b.dispose();
    }
    const weather: Weather = { kind, time, wind: { x: 1.5, y: -2.2 }, temperature: kind === 'snow' ? -2 : 16 };
    const setup = makeSandboxSetup(type, weather);
    setup.difficulty = DIFF_VALUE[diff];
    if (type.startsWith('drill_')) {
      setup.drill = { attempts: 4 };
      if (type === 'drill_free_kick') setup.spot = { x: 52.5 - 24, y: -6 };
      if (type === 'drill_finishing') setup.spot = { x: 52.5 - 24, y: 0 };
    }
    let engine: MomentEngine;
    try {
      engine = createMoment(setup);
      engine.step(0);
      setEngineKind('real');
    } catch {
      engine = createMockMoment(setup);
      setEngineKind('mock');
    }
    setResult(null);
    const mount = view === '3d' ? mountMomentView : mountMomentView2D;
    const v = mount(el, engine, setup, {
      camera: cam, quality, shadows, showHelp: help,
      onFinished: () => { try { setResult(engine.result()); } catch { /* engine */ } },
    });
    handle.current = v;
    (window as unknown as { __sandbox?: unknown }).__sandbox = { engine, handle: v, setup };
    return () => { handle.current = null; v.dispose(); };
    // camera changes go through setCamera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, view, diff, kind, time, quality, shadows, backdrop, run]);

  useEffect(() => { handle.current?.setCamera(cam); }, [cam]);

  const sel = <T extends string>(label: string, value: T, options: readonly T[], set: (v: T) => void, name: (v: T) => string) => (
    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-dim">
      {label}
      <select value={value} onChange={(e) => set(e.target.value as T)}
        className="rounded-lg bg-black/60 border border-white/10 px-2 py-1.5 text-sm normal-case tracking-normal text-ink">
        {options.map((o) => <option key={o} value={o}>{name(o)}</option>)}
      </select>
    </label>
  );

  return (
    <div className="fixed inset-0 bg-black text-ink" onPointerDown={() => audio.unlock()}>
      <div ref={host} className="absolute inset-0" />
      <button onClick={() => setPanel(!panel)}
        className="absolute z-20 left-3 bottom-[124px] h-9 px-3 rounded-xl bg-black/60 border border-white/10 text-xs font-semibold">
        {t('view.sb.title')}
      </button>
      {panel && (
        <div className="absolute z-20 left-3 top-3 w-[min(92vw,250px)] max-h-[calc(100%-180px)] overflow-auto rounded-2xl bg-black/70 backdrop-blur border border-white/10 p-3 flex flex-col gap-2">
          <div className="font-display text-xl text-accent leading-none">{t('view.sb.title')}</div>
          <div className="text-[11px] text-ink-mute">{t('view.sb.engine')}: {engineKind === 'real' ? t('view.sb.engineReal') : t('view.sb.engineMock')}</div>
          {sel(t('view.sb.moment'), type, TYPES, setType, (v) => { const k = t(`view.type.${v}`); return k.startsWith('view.type') ? v : k; })}
          {sel('2D / 3D', view, VIEWS, setView, (v) => v.toUpperCase())}
          {sel('Zorluk / Difficulty', diff, DIFFS, setDiff, (v) => v)}
          {sel(t('view.sb.weather'), kind, KINDS, setKind, (v) => t(`view.w.${v}`))}
          {sel(t('view.sb.time'), time, TIMES, setTime, (v) => t(`view.t.${v}`))}
          {sel(t('view.sb.camera'), cam, CAMS, setCam, (v) => t(`view.cam.${v}`))}
          {sel(t('view.sb.quality'), quality, QUALITIES, setQuality, (v) => t(`view.q.${v}`))}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shadows} onChange={(e) => setShadows(e.target.checked)} />{t('view.sb.shadows')}</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={backdrop} onChange={(e) => setBackdrop(e.target.checked)} />{t('view.sb.backdrop')}</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={help} onChange={(e) => setHelp(e.target.checked)} />{t('view.sb.help')}</label>
          <div className="flex gap-2">
            <button className="flex-1 h-9 rounded-xl bg-accent text-black font-semibold text-sm" onClick={() => setRun((r) => r + 1)}>{t('view.sb.restart')}</button>
            <button className="flex-1 h-9 rounded-xl bg-white/10 border border-white/10 font-semibold text-sm disabled:opacity-40"
              disabled={!result || result.replay.length === 0}
              onClick={() => result && handle.current?.playReplay(result.replay, () => undefined)}>{t('view.sb.replay')}</button>
          </div>
          {result && <div className="text-xs text-ink-dim">{t('view.sb.result')}: <b className="text-gold">{t(`view.out.${result.outcome}`)}</b></div>}
        </div>
      )}
    </div>
  );
}
