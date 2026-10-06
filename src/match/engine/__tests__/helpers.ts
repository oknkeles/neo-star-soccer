/** Fictional MomentSetup factory and run loops for engine tests. */
import type { Attributes, Kit, MomentPlayerSpec, MomentResult, MomentSetup, MomentTeamSpec, MomentType, Position, Weather } from '../../../core/types';
import { Rng } from '../../../core/rng';
import { botStep, createMoment, type MomentEngine } from '../api';

const ROLES: Position[] = ['GK', 'CB', 'CB', 'FB', 'FB', 'CM', 'CM', 'AM', 'W', 'W', 'ST'];
const KIT_A: Kit = { primary: '#c8102e', secondary: '#ffd200', style: 'stripes' };
const KIT_B: Kit = { primary: '#1d3f8f', secondary: '#ffffff', style: 'hoops' };

export function attrs(base: number, role: Position, over: Partial<Attributes> = {}): Attributes {
  const gk = role === 'GK';
  return {
    shooting: base, curl: base, passing: base, dribbling: base, firstTouch: base, heading: base, tackling: role === 'CB' ? base + 6 : base - 8,
    pace: base, acceleration: base, stamina: base, strength: base, jumping: base, vision: base, composure: base, positioning: base,
    goalkeeping: gk ? base + 6 : 10, ...over,
  };
}

function team(side: 'us' | 'them', base: number, userIdx: number, userAttrs: Partial<Attributes>): MomentTeamSpec {
  const players: MomentPlayerSpec[] = ROLES.map((role, i) => ({
    id: `${side}${i}`, name: `${side.toUpperCase()} ${i}`, number: i + 1, side, role, isUser: i === userIdx,
    attrs: attrs(base, role, i === userIdx ? userAttrs : {}), foot: i % 4 === 0 ? 'L' : 'R', weakFoot: 3, fitness: 95,
    appearance: { skin: i % 6, hairStyle: i % 8, hairColor: '#222222', beard: 0, boots: '#111111', height: 172 + ((i * 7) % 20) },
  }));
  return { name: side === 'us' ? 'Kuzey Yıldızı' : 'Liman Gücü', shortName: side === 'us' ? 'KYZ' : 'LMG', kit: side === 'us' ? KIT_A : KIT_B, formation: '4-3-3', style: 'balanced', players };
}

export interface SetupOpts {
  seed?: number;
  userRole?: Position;
  userAttrs?: Partial<Attributes>;
  base?: number;
  oppBase?: number;
  difficulty?: number;
  weather?: Partial<Weather>;
  spot?: { x: number; y: number };
  timeLimit?: number;
  attempts?: number;
}

export function makeSetup(type: MomentType, o: SetupOpts = {}): MomentSetup {
  const role = o.userRole ?? (type === 'defend' || type === 'build_up' ? 'CB' : type === 'wing_cross' ? 'W' : 'ST');
  const userIdx = Math.max(1, ROLES.indexOf(role));
  return {
    type,
    seed: o.seed ?? 1,
    minute: 60,
    us: team('us', o.base ?? 70, userIdx, o.userAttrs ?? {}),
    them: team('them', o.oppBase ?? 70, -1, {}),
    userId: `us${userIdx}`,
    weather: { kind: 'clear', time: 'night', wind: { x: 0, y: 0 }, temperature: 15, ...o.weather },
    difficulty: o.difficulty ?? 0.5,
    teammateTrust: 70,
    score: { us: 0, them: 0 },
    importance: 0.5,
    timeLimit: o.timeLimit ?? 15,
    spot: o.spot,
    drill: type.startsWith('drill_') ? { attempts: o.attempts ?? 4 } : undefined,
  };
}

/** Step at 60 fps until finished (or `maxSeconds`), optionally driving the bot. */
export function run(e: MomentEngine, opts: { bot?: Rng | null; maxSeconds?: number; each?: (e: MomentEngine) => void } = {}): MomentResult | null {
  const max = opts.maxSeconds ?? 60;
  for (let f = 0; f < max * 60 && !e.isFinished(); f++) {
    if (opts.bot) botStep(e, opts.bot);
    opts.each?.(e);
    e.step(1 / 60);
  }
  return e.isFinished() ? e.result() : null;
}

export function play(type: MomentType, seed: number, o: SetupOpts = {}, bot = true): MomentResult | null {
  const e = createMoment(makeSetup(type, { ...o, seed }));
  return run(e, { bot: bot ? new Rng(seed * 7 + 3) : null });
}
