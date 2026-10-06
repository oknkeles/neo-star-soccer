/**
 * Statistical match simulation (every match the user does not play in real time).
 *
 * Minute-by-minute Bernoulli process on team strengths: home advantage, styles, weather,
 * day-to-day form, red cards and score effects all bend the goal rate. Scorers and
 * assisters are weighted by slot and attributes; subs, cards, injuries, penalties and own
 * goals happen at plausible rates. Knockouts go to extra time and a penalty shoot-out.
 * Calibrated to ≈ 2.6 goals per game with a ≈ +0.25 home xG edge.
 */
import type {
  Footballer, GameState, MatchContext, MatchEvent, MatchEventKind, MatchSummary, Position, TacticalStyle,
  TeamSheet, UserMatchStats,
} from '../core/types';
import type { Rng } from '../core/rng';
import { positionGroup } from '../core/ratings';
import { fastOverall as overallFor } from './fastovr';
import { clamp } from '../core/util';
import { ct, shortPlayerName } from './helpers';
import { FORMATION_SLOTS } from './teams';

type Side = 'home' | 'away';

interface SimPlayer {
  id: string;
  p: Footballer;
  slot: Position;
  side: Side;
  on: number;           // minute entered (0 for starters)
  off: number | null;   // minute left (sub, red card, injury)
  started: boolean;
  yellow: number;
  red: boolean;
  goals: number;
  pens: number;
  assists: number;
  ownGoals: number;
  penMisses: number;
  injured: boolean;
}

interface SideState {
  side: Side;
  sheet: TeamSheet;
  all: SimPlayer[];
  onPitch: SimPlayer[];
  bench: Footballer[];
  subsLeft: number;
  subMinutes: number[];
  reds: number;
  goals: number;
  lambda: number;
}

const STYLE_ATT: Record<TacticalStyle, number> = { possession: 1.02, counter: 1, direct: 1.03, pressing: 1.05, balanced: 1, defensive: 0.87 };
const STYLE_LEAK: Record<TacticalStyle, number> = { possession: 1, counter: 0.97, direct: 1.02, pressing: 1.04, balanced: 1, defensive: 0.9 };
const STYLE_POSS: Record<TacticalStyle, number> = { possession: 6, pressing: 2, balanced: 0, direct: -2, counter: -4, defensive: -6 };
const STYLE_CARDS: Record<TacticalStyle, number> = { possession: 0.9, pressing: 1.15, balanced: 1, direct: 1.05, counter: 1, defensive: 1.12 };

const SCORE_W: Record<Position, number> = { GK: 0.002, CB: 0.11, FB: 0.08, DM: 0.1, CM: 0.22, AM: 0.5, W: 0.62, ST: 1 };
const ASSIST_W: Record<Position, number> = { GK: 0.02, CB: 0.1, FB: 0.45, DM: 0.3, CM: 0.7, AM: 1, W: 0.95, ST: 0.5 };
const CARD_W: Record<Position, number> = { GK: 0.15, CB: 1.3, FB: 1.2, DM: 1.6, CM: 1.1, AM: 0.7, W: 0.7, ST: 0.8 };
const OG_W: Record<Position, number> = { GK: 0.5, CB: 3, FB: 2, DM: 1, CM: 0.4, AM: 0.2, W: 0.2, ST: 0.2 };
const SUB_OFF_W: Record<Position, number> = { GK: 0, CB: 0.45, FB: 0.8, DM: 0.85, CM: 1.1, AM: 1.4, W: 1.45, ST: 1.35 };

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

function scoringAbility(p: Footballer, slot: Position): number {
  const a = p.attrs;
  const foot = slot === 'CB' ? a.heading * 0.6 + a.jumping * 0.4 : a.shooting * 0.5 + a.positioning * 0.25 + a.composure * 0.25;
  let w = SCORE_W[slot] * Math.pow(Math.max(20, foot) / 60, 3);
  if (p.traits.includes('clinical')) w *= 1.2;
  if (p.traits.includes('aerial_threat')) w *= 1.12;
  return w;
}

function assistAbility(p: Footballer, slot: Position): number {
  const a = p.attrs;
  const skill = a.passing * 0.5 + a.vision * 0.3 + a.dribbling * 0.2;
  let w = ASSIST_W[slot] * Math.pow(Math.max(20, skill) / 60, 2.5);
  if (p.traits.includes('playmaker')) w *= 1.25;
  if (p.traits.includes('set_piece_specialist')) w *= 1.1;
  return w;
}

function penaltyScore(p: Footballer): number {
  return p.attrs.shooting * 0.6 + p.attrs.composure * 0.4 + (p.traits.includes('set_piece_specialist') ? 6 : 0);
}

function pickWeighted<T>(rng: Rng, items: T[], weight: (t: T) => number): T | null {
  if (!items.length) return null;
  return rng.weighted(items, weight);
}

function buildSide(state: GameState, sheet: TeamSheet, side: Side, rng: Rng, knockout: boolean): SideState {
  const players = state.world.players;
  const slots = FORMATION_SLOTS[sheet.formation] ?? FORMATION_SLOTS['4-4-2'];
  const all: SimPlayer[] = [];
  sheet.xi.forEach((id, i) => {
    const p = players[id];
    if (!p) return;
    all.push({ id, p, slot: slots[i] ?? p.position, side, on: 0, off: null, started: true, yellow: 0, red: false, goals: 0, pens: 0, assists: 0, ownGoals: 0, penMisses: 0, injured: false });
  });
  const bench = sheet.bench.map((id) => players[id]).filter((p): p is Footballer => !!p);
  const nSubs = Math.min(bench.length, rng.weighted([0, 1, 2, 3, 4, 5], (k) => [3, 4, 8, 22, 30, 33][k]));
  const subMinutes: number[] = [];
  for (let i = 0; i < nSubs; i++) {
    subMinutes.push(i === 0 ? (rng.chance(0.1) ? 46 : rng.int(55, 70)) : rng.int(58, 88));
  }
  if (knockout && bench.length > nSubs) subMinutes.push(rng.int(95, 106));
  subMinutes.sort((a, b) => a - b);
  return { side, sheet, all, onPitch: all.slice(), bench, subsLeft: nSubs + (knockout ? 1 : 0), subMinutes, reds: 0, goals: 0, lambda: 0 };
}

/** One number for how good a side is, mixing its lines (keeper counts, attack counts most). */
const power = (s: TeamSheet['strength']) => 0.36 * s.att + 0.26 * s.mid + 0.28 * s.def + 0.1 * s.gk;

/**
 * Expected goals for both sides. The total is set first (attack vs defence matchups and keepers nudge it),
 * then split by a soft-capped logistic of the strength gap plus home advantage — so the league-wide goal
 * average stays near 2.6 however uneven the clubs are, while mismatches still allow the odd upset.
 */
function baseLambdas(ctx: MatchContext, neutral: boolean, rng: Rng): [number, number] {
  const sh = ctx.home.strength;
  const sa = ctx.away.strength;
  const matchup = sh.att - sa.def + (sa.att - sh.def);
  const keepers = sh.gk - sh.overall + (sa.gk - sa.overall);
  let total = 2.84 * Math.exp(clamp(0.008 * matchup - 0.005 * keepers, -0.4, 0.4));
  const gap = power(sh) - power(sa);
  const logRatio = 1.7 * Math.tanh((0.062 * gap) / 1.7) + (neutral ? 0 : 0.2);
  const share = 1 / (1 + Math.exp(-logRatio));
  let lh = total * share;
  let la = total * (1 - share);
  lh *= STYLE_ATT[ctx.home.style] * STYLE_LEAK[ctx.away.style];
  la *= STYLE_ATT[ctx.away.style] * STYLE_LEAK[ctx.home.style];
  if (ctx.home.style === 'counter' && ctx.away.style === 'possession') lh *= 1.08;
  if (ctx.away.style === 'counter' && ctx.home.style === 'possession') la *= 1.08;
  const w = ctx.weather;
  const weatherF = (w.kind === 'snow' ? 0.9 : w.kind === 'rain' ? 0.97 : w.kind === 'fog' ? 0.96 : 1) * (Math.hypot(w.wind.x, w.wind.y) > 9 ? 0.96 : 1);
  const tension = 1 - 0.12 * Math.max(0, ctx.importance - 0.6);
  total = weatherF * tension;
  lh *= total * Math.exp(rng.normal(0, 0.16));
  la *= total * Math.exp(rng.normal(0, 0.16));
  return [clamp(lh, 0.1, 4.6), clamp(la, 0.1, 4.6)];
}

export function quickSimulate(state: GameState, ctx: MatchContext, rng: Rng): MatchSummary {
  const fixture = findFixtureLite(state, ctx.fixtureId);
  const neutral = !!fixture?.neutral;
  const uid = state.career?.playerId;
  const home = buildSide(state, ctx.home, 'home', rng, ctx.knockout);
  const away = buildSide(state, ctx.away, 'away', rng, ctx.knockout);
  const sides: Record<Side, SideState> = { home, away };
  const opp = (s: SideState) => (s.side === 'home' ? away : home);
  [home.lambda, away.lambda] = baseLambdas(ctx, neutral, rng);

  const events: MatchEvent[] = [];
  const name = (sp: SimPlayer | Footballer) => shortPlayerName('p' in sp ? sp.p : sp);
  const teamShort = (s: SideState) => s.sheet.shortName;
  const push = (minute: number, kind: MatchEventKind, side: Side | null, text: string, playerId?: string, assistId?: string) => {
    const e: MatchEvent = { minute, kind, side, text };
    if (playerId) e.playerId = playerId;
    if (assistId) e.assistId = assistId;
    if (uid && (playerId === uid || assistId === uid)) e.user = true;
    events.push(e);
  };
  push(0, 'kickoff', null, ct(state, 'ev.kickoff'));

  const cardBase = 1.75 * (1 + (ctx.derby ? 0.35 : 0) + ctx.importance * 0.25);
  const cardRate = { home: (cardBase * STYLE_CARDS[ctx.home.style]) / 90, away: (cardBase * STYLE_CARDS[ctx.away.style]) / 90 };

  const removeFromPitch = (s: SideState, sp: SimPlayer, minute: number) => {
    sp.off = minute;
    s.onPitch = s.onPitch.filter((x) => x !== sp);
  };

  const substitute = (s: SideState, minute: number, forced: SimPlayer | null): boolean => {
    if (s.subsLeft <= 0 || !s.bench.length) return false;
    const off = forced ?? pickWeighted(rng, s.onPitch, (sp) => {
      let w = SUB_OFF_W[sp.slot] * (sp.yellow ? 1.6 : 1) * (sp.p.fitness < 80 ? 1.3 : 1);
      if (sp.id === uid) w *= 0.7;
      return w;
    });
    if (!off) return false;
    const group = positionGroup(off.slot);
    const on = pickWeighted(rng, s.bench, (p) => {
      if ((p.position === 'GK') !== (off.slot === 'GK')) return 0;
      let w = (positionGroup(p.position) === group ? 3 : 1) * Math.pow(overallFor(p.attrs, p.position) / 60, 2);
      if (p.id === uid) w *= 2.5;
      return w;
    });
    if (!on || (on.position === 'GK') !== (off.slot === 'GK')) return false;
    if (!forced) removeFromPitch(s, off, minute);
    s.bench = s.bench.filter((p) => p !== on);
    s.subsLeft--;
    const sp: SimPlayer = { id: on.id, p: on, slot: off.slot, side: s.side, on: minute, off: null, started: false, yellow: 0, red: false, goals: 0, pens: 0, assists: 0, ownGoals: 0, penMisses: 0, injured: false };
    s.all.push(sp);
    s.onPitch.push(sp);
    push(minute, 'sub', s.side, ct(state, 'ev.sub', { minute, team: teamShort(s), on: name(on), off: name(off) }), on.id);
    return true;
  };

  const goal = (s: SideState, minute: number) => {
    const o = opp(s);
    const roll = rng.next();
    if (roll < 0.03 && o.onPitch.length) {
      const og = pickWeighted(rng, o.onPitch, (sp) => OG_W[sp.slot])!;
      og.ownGoals++;
      s.goals++;
      push(minute, 'own_goal', s.side, ct(state, 'ev.ownGoal', { minute, player: name(og), team: teamShort(o) }), og.id);
      return;
    }
    const outfield = s.onPitch.filter((sp) => sp.slot !== 'GK');
    if (!outfield.length) return;
    if (roll < 0.115) {
      const taker = outfield.reduce((a, b) => (penaltyScore(b.p) > penaltyScore(a.p) ? b : a));
      taker.goals++; taker.pens++;
      s.goals++;
      push(minute, 'penalty_goal', s.side, ct(state, 'ev.penGoal', { minute, player: name(taker), team: teamShort(s) }), taker.id);
      return;
    }
    const scorer = pickWeighted(rng, outfield, (sp) => scoringAbility(sp.p, sp.slot))!;
    scorer.goals++;
    s.goals++;
    let assister: SimPlayer | null = null;
    if (rng.chance(0.72)) {
      assister = pickWeighted(rng, s.onPitch.filter((sp) => sp !== scorer), (sp) => assistAbility(sp.p, sp.slot));
      if (assister) assister.assists++;
    }
    push(
      minute, 'goal', s.side,
      assister
        ? ct(state, 'ev.goalAssist', { minute, player: name(scorer), team: teamShort(s), assist: name(assister) })
        : ct(state, 'ev.goal', { minute, player: name(scorer), team: teamShort(s) }),
      scorer.id, assister?.id,
    );
  };

  const card = (s: SideState, minute: number, straightRed: boolean) => {
    const sp = pickWeighted(rng, s.onPitch, (x) => {
      let w = CARD_W[x.slot] * Math.max(0.4, x.p.attrs.tackling / 60) * (x.yellow ? 0.35 : 1);
      if (x.p.traits.includes('hothead')) w *= 2;
      if (x.p.traits.includes('calm')) w *= 0.6;
      return w;
    });
    if (!sp) return;
    if (straightRed || sp.yellow >= 1) {
      sp.red = true;
      s.reds++;
      removeFromPitch(s, sp, minute);
      push(minute, 'red', s.side, ct(state, straightRed ? 'ev.red' : 'ev.secondYellow', { minute, player: name(sp), team: teamShort(s) }), sp.id);
      if (sp.slot === 'GK') {
        // sacrifice an attacker for the reserve keeper
        const victim = s.onPitch.filter((x) => x.slot !== 'GK').sort((a, b) => SUB_OFF_W[b.slot] - SUB_OFF_W[a.slot])[0];
        if (victim && s.bench.some((p) => p.position === 'GK') && s.subsLeft > 0) {
          removeFromPitch(s, victim, minute);
          const keeper = s.bench.find((p) => p.position === 'GK')!;
          s.bench = s.bench.filter((p) => p !== keeper);
          s.subsLeft--;
          const nsp: SimPlayer = { id: keeper.id, p: keeper, slot: 'GK', side: s.side, on: minute, off: null, started: false, yellow: 0, red: false, goals: 0, pens: 0, assists: 0, ownGoals: 0, penMisses: 0, injured: false };
          s.all.push(nsp);
          s.onPitch.push(nsp);
          push(minute, 'sub', s.side, ct(state, 'ev.sub', { minute, team: teamShort(s), on: name(keeper), off: name(victim) }), keeper.id);
        }
      }
      return;
    }
    sp.yellow++;
    push(minute, 'yellow', s.side, ct(state, 'ev.yellow', { minute, player: name(sp), team: teamShort(s) }), sp.id);
  };

  const injury = (s: SideState, minute: number) => {
    const sp = pickWeighted(rng, s.onPitch.filter((x) => x.id !== uid), (x) =>
      (x.p.traits.includes('glass_bones') ? 2.2 : 1) * (x.p.traits.includes('iron_man') ? 0.4 : 1));
    if (!sp) return;
    sp.injured = true;
    push(minute, 'injury', s.side, ct(state, 'ev.injury', { minute, player: name(sp), team: teamShort(s) }), sp.id);
    removeFromPitch(s, sp, minute);
    if (!substitute(s, minute, sp)) return;
  };

  const penaltyMiss = (s: SideState, minute: number) => {
    const outfield = s.onPitch.filter((sp) => sp.slot !== 'GK');
    if (!outfield.length) return;
    const taker = outfield.reduce((a, b) => (penaltyScore(b.p) > penaltyScore(a.p) ? b : a));
    taker.penMisses++;
    push(minute, 'penalty_miss', s.side, ct(state, 'ev.penMiss', { minute, player: name(taker), team: teamShort(s) }), taker.id);
  };

  const playMinute = (minute: number, fatigue: number) => {
    for (const s of [home, away]) {
      while (s.subMinutes.length && s.subMinutes[0] <= minute) {
        s.subMinutes.shift();
        substitute(s, minute, null);
      }
    }
    for (const s of [home, away]) {
      const o = opp(s);
      let lam = s.lambda * Math.pow(0.72, s.reds) * Math.pow(1.18, o.reds) * fatigue;
      if (minute >= 65) {
        const diff = s.goals - o.goals;
        lam *= diff < 0 ? 1.12 : diff === 1 ? 0.93 : diff > 1 ? 0.86 : 1;
      }
      const pGoal = (lam / 90) * (minute > 45 ? 1.06 : 0.94);
      const pYellow = cardRate[s.side] * (minute > 60 ? 1.25 : 0.85);
      const pRed = 0.022 / 90;
      const pInj = 0.055 / 90;
      const pMiss = 0.022 / 90;
      const r = rng.next();
      if (r < pGoal) goal(s, minute);
      else if (r < pGoal + pYellow) card(s, minute, false);
      else if (r < pGoal + pYellow + pRed) card(s, minute, true);
      else if (r < pGoal + pYellow + pRed + pInj) injury(s, minute);
      else if (r < pGoal + pYellow + pRed + pInj + pMiss) penaltyMiss(s, minute);
    }
  };

  const score = () => `${ctx.home.shortName} ${home.goals}-${away.goals} ${ctx.away.shortName}`;
  for (let m = 1; m <= 90; m++) {
    playMinute(m, 1);
    if (m === 45) push(45, 'halftime', null, ct(state, 'ev.ht', { score: score() }));
  }
  let end = 90;
  let pens: { home: number; away: number } | undefined;
  if (ctx.knockout && home.goals === away.goals) {
    push(90, 'extra_time', null, ct(state, 'ev.et'));
    for (let m = 91; m <= 120; m++) playMinute(m, 0.82);
    end = 120;
    if (home.goals === away.goals) pens = shootout(home, away, rng);
  }
  for (const s of [home, away]) s.subMinutes.length = 0;
  push(end, 'fulltime', null, ct(state, 'ev.ft', { score: score() }));
  if (pens) {
    const winner = pens.home > pens.away ? ctx.home.name : ctx.away.name;
    push(end, 'shootout', pens.home > pens.away ? 'home' : 'away', ct(state, 'ev.shootout', { home: ctx.home.shortName, away: ctx.away.shortName, hp: pens.home, ap: pens.away, winner }));
  }

  // minutes & ratings
  const minutes: Record<string, number> = {};
  const ratings: Record<string, number> = {};
  for (const s of [home, away]) {
    const o = opp(s);
    const conceded = o.goals;
    const won = s.goals > o.goals || (!!pens && (s.side === 'home' ? pens.home > pens.away : pens.away > pens.home));
    const lost = s.goals < o.goals || (!!pens && !won);
    const slotOvr = new Map<SimPlayer, number>();
    for (const sp of s.all) slotOvr.set(sp, overallFor(sp.p.attrs, sp.slot));
    const teamAvg = s.all.length ? [...slotOvr.values()].reduce((a, v) => a + v, 0) / s.all.length : 60;
    for (const sp of s.all) {
      const so = slotOvr.get(sp)!;
      const mins = Math.max(1, (sp.off ?? end) - sp.on);
      minutes[sp.id] = mins;
      let r = 6.0;
      r += won ? 0.35 : lost ? -0.3 : 0;
      r += (s.goals - conceded) * 0.08;
      r += (sp.goals - sp.pens) * 1.05 + sp.pens * 0.75 + sp.assists * 0.6;
      if (sp.goals >= 3) r += 0.5;
      const group = positionGroup(sp.slot);
      if (group === 'GK') r += conceded === 0 ? 0.8 : conceded === 1 ? 0.15 : -0.3 * (conceded - 1);
      else if (group === 'DEF' || sp.slot === 'DM') r += conceded === 0 && mins >= 60 ? 0.4 : conceded >= 3 ? -0.35 : 0;
      r += (so - teamAvg) * 0.015 + (so - 65) * 0.01;
      r -= sp.yellow * 0.25 + (sp.red ? 1.3 : 0) + sp.ownGoals * 0.9 + sp.penMisses * 0.7;
      const noise = rng.normal(0, 0.42);
      if (mins < 25) r = 6.1 + (r - 6.0) * 0.6 + noise * 0.5;
      else r += noise;
      ratings[sp.id] = r1(clamp(r, 4.5, 9.5));
    }
  }
  let motmId: string | null = null;
  let best = -Infinity;
  const winningSide: Side | null = home.goals > away.goals ? 'home' : away.goals > home.goals ? 'away' : pens ? (pens.home > pens.away ? 'home' : 'away') : null;
  for (const s of [home, away]) {
    for (const sp of s.all) {
      const v = ratings[sp.id] + (s.side === winningSide ? 0.05 : 0) + (minutes[sp.id] >= 45 ? 0.01 : -0.5);
      if (v > best) { best = v; motmId = sp.id; }
    }
  }

  // team stats
  const possession = Math.round(clamp(
    50 + (ctx.home.strength.mid - ctx.away.strength.mid) * 0.9 + STYLE_POSS[ctx.home.style] - STYLE_POSS[ctx.away.style] + (neutral ? 0 : 2) + rng.normal(0, 3),
    25, 75,
  ));
  const shotsFor = (s: SideState) => Math.max(s.goals + rng.int(1, 3), Math.round(s.lambda * 6 + 3 + rng.normal(0, 2.2)));
  const xgFor = (s: SideState) => r2(Math.max(0.08, s.lambda * 0.86 * rng.float(0.85, 1.15) * (end === 120 ? 1.25 : 1) + s.goals * 0.12));

  const summary: MatchSummary = {
    fixtureId: ctx.fixtureId,
    homeGoals: home.goals,
    awayGoals: away.goals,
    events,
    possession,
    shots: { home: shotsFor(home), away: shotsFor(away) },
    xg: { home: xgFor(home), away: xgFor(away) },
    ratings,
    motmId,
    lineups: { home: home.all.filter((sp) => sp.started).map((sp) => sp.id), away: away.all.filter((sp) => sp.started).map((sp) => sp.id) },
    minutes,
  };
  if (pens) summary.pens = pens;

  const userSp = uid ? sides.home.all.find((sp) => sp.id === uid) ?? sides.away.all.find((sp) => sp.id === uid) : undefined;
  if (userSp && ctx.userSide) summary.user = userMatchData(userSp, minutes[userSp.id], ratings[userSp.id], rng);
  return summary;
}

function shootout(home: SideState, away: SideState, rng: Rng): { home: number; away: number } {
  const takers = (s: SideState) => {
    const field = s.onPitch.filter((sp) => sp.slot !== 'GK').sort((a, b) => penaltyScore(b.p) - penaltyScore(a.p));
    const keepers = s.onPitch.filter((sp) => sp.slot === 'GK');
    const list = [...field, ...keepers];
    return list.length ? list : s.all;
  };
  const keeper = (s: SideState) => s.onPitch.find((sp) => sp.slot === 'GK')?.p.attrs.goalkeeping ?? 50;
  const th = takers(home);
  const ta = takers(away);
  const kick = (taker: SimPlayer | undefined, gk: number) => {
    const sc = taker ? penaltyScore(taker.p) : 60;
    return rng.chance(clamp(0.76 + (sc - 70) / 250 - (gk - 70) / 350, 0.55, 0.92));
  };
  let h = 0;
  let a = 0;
  for (let i = 0; i < 5; i++) {
    if (kick(th[i % th.length], keeper(away))) h++;
    // kicks left: home 4−i, away 5−i
    if (h > a + (5 - i) || a > h + (4 - i)) break;
    if (kick(ta[i % ta.length], keeper(home))) a++;
    if (h > a + (4 - i) || a > h + (4 - i)) break;
  }
  let i = 5;
  while (h === a && i < 40) {
    const sh = kick(th[i % th.length], keeper(away));
    const sa = kick(ta[i % ta.length], keeper(home));
    if (sh) h++;
    if (sa) a++;
    i++;
  }
  if (h === a) h++;
  return { home: h, away: a };
}

/** Plausible personal numbers for a simulated user appearance. */
function userMatchData(sp: SimPlayer, minutes: number, rating: number, rng: Rng): NonNullable<MatchSummary['user']> {
  const f = minutes / 90;
  const a = sp.p.attrs;
  const pos = sp.slot;
  const base = { GK: 25, CB: 48, FB: 44, DM: 55, CM: 56, AM: 44, W: 32, ST: 22 }[pos];
  const passes = Math.round(base * f * (0.8 + a.passing / 250) + rng.int(-4, 4));
  const shots = sp.goals + Math.round(rng.float(0, { GK: 0, CB: 0.6, FB: 0.6, DM: 0.8, CM: 1.2, AM: 1.8, W: 1.9, ST: 2.6 }[pos] * f));
  const stats: UserMatchStats = {
    minutes,
    goals: sp.goals,
    assists: sp.assists,
    shots,
    shotsOnTarget: Math.min(shots, sp.goals + rng.int(0, Math.max(0, shots - sp.goals))),
    passes: Math.max(0, passes),
    passesCompleted: Math.max(0, Math.round(passes * clamp(0.62 + a.passing / 330, 0.6, 0.94))),
    keyPasses: sp.assists + rng.int(0, pos === 'AM' || pos === 'CM' || pos === 'W' ? 3 : 1),
    dribbles: Math.round(rng.float(0, (a.dribbling / 25) * f)),
    tackles: Math.round(rng.float(0, (positionGroup(pos) === 'DEF' || pos === 'DM' ? 4 : 1.5) * f)),
    interceptions: Math.round(rng.float(0, (positionGroup(pos) === 'DEF' || pos === 'DM' ? 3 : 1) * f)),
    foulsWon: rng.int(0, 2),
    foulsConceded: rng.int(0, 2) + sp.yellow,
    moments: 0,
  };
  const scale = clamp((rating - 5.5) / 3, 0.2, 1.2) * f;
  const xp: NonNullable<MatchSummary['user']>['xp'] = {};
  const focus: Record<Position, (keyof Footballer['attrs'])[]> = {
    GK: ['goalkeeping', 'positioning'], CB: ['tackling', 'heading', 'positioning'], FB: ['pace', 'tackling', 'passing'],
    DM: ['tackling', 'passing', 'positioning'], CM: ['passing', 'vision', 'stamina'], AM: ['vision', 'dribbling', 'passing'],
    W: ['dribbling', 'pace', 'curl'], ST: ['shooting', 'positioning', 'composure'],
  };
  for (const k of focus[pos]) xp[k] = Math.round(4 * scale * 10) / 10;
  xp.composure = Math.round(((xp.composure ?? 0) + 2 * scale) * 10) / 10;
  return { rating, stats, xp, highlights: 0 };
}

/** Light fixture lookup (avoids an import cycle with queries). */
function findFixtureLite(state: GameState, fixtureId: string) {
  for (const c of Object.values(state.competitions)) {
    if (!fixtureId.startsWith(c.id)) continue;
    const f = c.fixtures.find((x) => x.id === fixtureId);
    if (f) return f;
  }
  return null;
}
