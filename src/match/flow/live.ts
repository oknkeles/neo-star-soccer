import type {
  AttrKey, Fixture, Footballer, GameState, Kit, MatchContext, MatchEvent, MatchEventKind, MatchSummary, MomentResult,
  MomentSetup, MomentType, Position, UserMatchStats, Vec2,
} from '../../core/types';
import { Rng } from '../../core/rng';
import { avg, clamp, round1 } from '../../core/util';
import { t } from '../../core/i18n';
import { POSITION_WEIGHTS, overall } from '../../core/ratings';
import { defaultCommentary, variant, type CommentaryData, type CommentaryFn } from './commentary';
import {
  DEFEND_CONCEDE, SHOT_XG, TIME_LIMIT, avgMomentXg, buildTeamSpec, chooseMomentType, defendShare, difficultyFor,
  displayName, isSetPiece, resolveKitClash, safeAutoResolve, setPieceSpot, type MatchMomentType,
} from './moments';
import { isAttackingRole } from './formation';
import { aiRating, finalUserRating, type Result } from './ratings';
import './strings';

export type Side = 'home' | 'away';
export type Period = 'pre' | 'first' | 'ht' | 'second' | 'et_break' | 'et1' | 'et2' | 'pens' | 'over';
/** Why a moment happened: scheduled, a set-piece follow-up, a stoppage-time chance, or a shootout kick. */
export type MomentKind = 'normal' | 'followup' | 'lastgasp' | 'shootout';

export interface TickResult {
  minute: number;
  events: MatchEvent[];        // new ticker events this minute
  moment: MomentSetup | null;  // non-null → the UI must play (or auto-resolve) this moment, then call resolveMoment
  done: boolean;
}

export interface TeamLiveStats { shots: number; onTarget: number; xg: number }

interface PStat {
  id: string;
  side: Side;
  on: number;
  off: number | null;
  onTick: number;
  goals: number;
  assists: number;
  saves: number;
  yellow: number;
  red: boolean;
  ownGoals: number;
  missedPens: number;
  chancesMissed: number;
}

interface QueuedSetPiece { tick: number; side: Side; type: 'free_kick' | 'penalty' | 'corner'; spot?: Vec2; userTakes: boolean }

interface Shootout {
  order: Record<Side, string[]>;
  idx: Record<Side, number>;
  kicks: { side: Side; playerId: string; scored: boolean }[];
  turn: Side;
  score: Record<Side, number>;
}

/** Mean of 0.02 + 0.45·r³ for r ~ U(0,1): average xG of a background shot. */
const AVG_SHOT_XG = 0.02 + 0.45 / 4;
const MAX_SUBS = 5;
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

const SCORER_W: Record<Position, number> = { GK: 0, CB: 0.7, FB: 0.5, DM: 0.7, CM: 1.3, AM: 3, W: 3, ST: 5 };
const ASSIST_W: Record<Position, number> = { GK: 0, CB: 0.4, FB: 1.2, DM: 1, CM: 2, AM: 3, W: 3, ST: 1.5 };
const CARD_W: Record<Position, number> = { GK: 0.15, CB: 1.4, FB: 1.2, DM: 1.6, CM: 1.1, AM: 0.8, W: 0.7, ST: 0.8 };

export class LiveMatch {
  readonly ctx: MatchContext;
  minute = 0;
  homeGoals = 0;
  awayGoals = 0;
  events: MatchEvent[] = [];
  userRating = 6.0;
  userStats: UserMatchStats = {
    minutes: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, passes: 0, passesCompleted: 0,
    keyPasses: 0, dribbles: 0, tackles: 0, interceptions: 0, foulsWon: 0, foulsConceded: 0, moments: 0,
  };
  userOnPitch = false;
  /** 0..1 momentum toward home (for the UI momentum bar). */
  momentum = 0.5;

  // ── extra public state for the UI ──
  period: Period = 'pre';
  /** Stoppage minute currently being played (0 outside stoppage time). */
  added = 0;
  /** Announced stoppage for the current half (−1 = not announced yet). */
  stoppage = -1;
  pens: { home: number; away: number } | null = null;
  shootout: Shootout | null = null;
  readonly userId: string | null;
  readonly userSide: Side | null;
  userXp: Partial<Record<AttrKey, number>> = {};
  highlights = 0;
  wentToExtraTime = false;
  teamStats: Record<Side, TeamLiveStats> = { home: { shots: 0, onTarget: 0, xg: 0 }, away: { shots: 0, onTarget: 0, xg: 0 } };
  /** Was the user ever on the bench waiting / substituted / sent off. */
  userBenched = false;
  userSubbedOff = false;
  userSentOff = false;
  /** Commentary provider (narrative with local fallback). Replaceable in tests. */
  commentary: CommentaryFn = defaultCommentary;

  private readonly state: GameState;
  private readonly rng: Rng;
  private readonly textRng: Rng;
  private readonly ratingSeed: number;
  private readonly fixture: Fixture | null;
  private readonly leg1: Fixture | null;
  private readonly neutral: boolean;
  private readonly baseLambda: Record<Side, number>;
  private onPitch: Record<Side, string[]>;
  private bench: Record<Side, string[]>;
  private subsLeft: Record<Side, number> = { home: MAX_SUBS, away: MAX_SUBS };
  private subPlan: Record<Side, number[]> = { home: [], away: [] };
  private pstats: Record<string, PStat> = {};
  private playTick = 0;
  private possSum = 0;
  private possN = 0;
  private swing = 0;
  private halfIncidents = 0;
  private lastFlavor = -20;
  private plan: number[] = [];
  private momentsPer90 = 0;
  private lastMomentTick = -10;
  private lastTypes: MomentType[] = [];
  private setPieceMoments = 0;
  private lastGaspDone = false;
  private queued: QueuedSetPiece | null = null;
  private pendingMoment: { setup: MomentSetup; kind: MomentKind } | null = null;
  private addedOf = new WeakMap<MatchEvent, number>();

  constructor(state: GameState, ctx: MatchContext, rng: Rng) {
    this.ctx = ctx;
    this.state = state;
    this.rng = rng;
    this.textRng = rng.fork();
    this.ratingSeed = rng.seed();
    this.fixture = state.competitions[ctx.compId]?.fixtures.find((f) => f.id === ctx.fixtureId) ?? null;
    this.leg1 = this.findFirstLeg();
    this.neutral = !!this.fixture?.neutral;

    this.onPitch = { home: [...ctx.home.xi], away: [...ctx.away.xi] };
    this.bench = { home: [...ctx.home.bench], away: [...ctx.away.bench] };
    for (const side of ['home', 'away'] as Side[]) {
      for (const id of this.onPitch[side]) this.pstats[id] = this.newStat(id, side);
    }

    const uid = state.career?.playerId ?? null;
    const side = ctx.userSide;
    this.userSide = side && uid && (this.onPitch[side].includes(uid) || this.bench[side].includes(uid)) ? side : null;
    this.userId = this.userSide ? uid : null;
    if (this.userSide && this.userId) {
      // the team sheet is the source of truth: XI → on the pitch from 0', bench → waits for the call
      if (this.onPitch[this.userSide].includes(this.userId)) {
        this.userOnPitch = true;
        this.scheduleMoments(2, 89);
      } else this.userBenched = true;
    }

    this.baseLambda = { home: this.computeLambda('home'), away: this.computeLambda('away') };
    this.planSubs('home');
    this.planSubs('away');
  }

  // ───────────────────────── public API ─────────────────────────

  /** Advance one simulated minute (stoppage time, half-time, extra time handled internally). */
  tick(): TickResult {
    if (this.pendingMoment) return { minute: this.minute, events: [], moment: this.pendingMoment.setup, done: false };
    if (this.period === 'over') return { minute: this.minute, events: [], moment: null, done: true };
    const out: MatchEvent[] = [];
    let moment: MomentSetup | null = null;
    switch (this.period) {
      case 'pre':
        this.period = 'first';
        this.emit(out, 'kickoff', null, { team: this.ctx.home.name });
        break;
      case 'first':
        moment = this.advance(out, 45);
        break;
      case 'ht':
        this.startPeriod('second', 45);
        this.emit(out, 'kickoff', null, { score: this.scoreText() }, variant('c.kickoff2', this.data({ score: this.scoreText() }), this.textRng));
        moment = this.advance(out, 90);
        break;
      case 'second':
        moment = this.advance(out, 90);
        break;
      case 'et_break':
        this.startPeriod('et1', 90);
        if (this.userOnPitch) this.scheduleMoments(93, 119, 30);
        moment = this.advance(out, 105);
        break;
      case 'et1':
        moment = this.advance(out, 105);
        break;
      case 'et2':
        moment = this.advance(out, 120);
        break;
      case 'pens':
        moment = this.shootoutStep(out);
        break;
    }
    return { minute: this.minute, events: out, moment, done: this.isOver() };
  }

  /** Feed the result of the pending moment (played or auto-resolved). Returns ticker events. */
  resolveMoment(result: MomentResult): MatchEvent[] {
    const pm = this.pendingMoment;
    if (!pm) return [];
    this.pendingMoment = null;
    const out: MatchEvent[] = [];
    if (pm.kind === 'shootout') {
      this.resolveShootoutKick(result, out);
      return out;
    }
    const us = this.userSide!;
    const them = other(us);
    const uid = this.userId!;
    const s = result.stats;
    const u = this.userStats;
    u.moments += 1;
    u.shots += s.shots;
    u.shotsOnTarget += s.shotsOnTarget;
    u.passes += s.passes;
    u.passesCompleted += s.passesCompleted;
    u.keyPasses += s.keyPasses;
    u.dribbles += s.dribbles;
    u.tackles += s.tackles;
    u.interceptions += s.interceptions;
    u.foulsWon += s.foulsWon;
    u.foulsConceded += s.foulsConceded;
    for (const [k, v] of Object.entries(result.xp ?? {}) as [AttrKey, number][]) {
      if (typeof v === 'number' && Number.isFinite(v)) this.userXp[k] = round1((this.userXp[k] ?? 0) + v);
    }
    if (result.highlight) this.highlights += 1;
    this.userRating = round1(clamp(this.userRating + (Number.isFinite(result.ratingDelta) ? result.ratingDelta : 0), 3, 10));

    // team shot stats
    const ts = this.teamStats[us];
    const shotXg = SHOT_XG[result.type] ?? 0.12;
    if (s.shots > 0) {
      ts.shots += s.shots;
      ts.onTarget += s.shotsOnTarget;
      ts.xg += s.shots * shotXg;
    }
    if (result.outcome === 'saved') this.pstat(this.gkOf(them))!.saves += 1;

    const userName = this.name(uid);
    if (result.goalFor) {
      let scorer = result.scorerId;
      if (!scorer || !this.pstats[scorer] || this.pstats[scorer].side !== us) {
        scorer = s.goals > 0 || result.outcome === 'goal' ? uid : this.pickScorer(us, true) ?? uid;
      }
      let assist = result.assistId && this.pstats[result.assistId]?.side === us ? result.assistId : null;
      if (!assist && scorer !== uid && (s.assists > 0 || result.outcome === 'assist')) assist = uid;
      if (assist === scorer) assist = null;
      if (s.shots === 0 || scorer !== uid) {
        ts.shots += 1;
        ts.onTarget += 1;
        ts.xg += 0.3;
      }
      if (scorer === uid) u.goals += 1;
      if (assist === uid) u.assists += 1;
      this.goal(out, us, scorer, assist, result.type === 'penalty' && scorer === uid ? 'penalty_goal' : 'goal');
    } else if (result.type === 'penalty') {
      this.pstat(uid)!.missedPens += 1;
      this.emit(out, 'penalty_miss', us, { player: userName }, undefined, { playerId: uid, user: true });
    } else {
      this.emit(out, 'moment', us, { player: userName }, t(`match.o.${result.outcome}`, { player: userName }), { playerId: uid, user: true });
    }

    if (result.goalAgainst || result.outcome === 'conceded') {
      let scorer = result.scorerId && this.pstats[result.scorerId]?.side === them ? result.scorerId : null;
      scorer ??= this.pickScorer(them, false) ?? this.onPitch[them][0];
      const assist = result.assistId && this.pstats[result.assistId]?.side === them && result.assistId !== scorer
        ? result.assistId : this.pickAssist(them, scorer);
      this.teamStats[them].shots += 1;
      this.teamStats[them].onTarget += 1;
      this.teamStats[them].xg += 0.3;
      if (result.goalFor) this.emit(out, 'moment', us, { player: userName }, t('match.o.conceded', { player: userName }), { playerId: uid, user: true });
      this.goal(out, them, scorer, assist, 'goal');
    }

    // momentum swing from the user's contribution
    const towardUs = us === 'home' ? 1 : -1;
    if (result.ratingDelta > 0.25) this.swing += 0.05 * towardUs;
    if (result.ratingDelta < -0.25) this.swing -= 0.04 * towardUs;

    // discipline for user fouls
    if (s.foulsConceded > 0 || result.outcome === 'foul_conceded') this.userFoulCard(out, result.followUp?.type === 'penalty');

    // set-piece follow-ups
    let follow = result.followUp;
    if (!follow && result.outcome === 'penalty_won') follow = { type: 'penalty', spot: { x: 52.5 - 11, y: 0 } };
    if (follow) {
      const theirs = result.outcome === 'foul_conceded' || follow.spot.x < 0;
      const side = theirs ? them : us;
      const sp = this.state.career.setPieces;
      const userTakes = !theirs && this.userOnPitch && (follow.type === 'penalty' ? sp.penalties : follow.type === 'corner' ? sp.corners : sp.freeKicks);
      this.queued = { tick: this.playTick + 1, side, type: follow.type, spot: theirs ? undefined : follow.spot, userTakes };
    }
    this.lastMomentTick = this.playTick;
    return out;
  }

  /** Simulate to the end, auto-resolving remaining user moments. */
  simulateToEnd(): void {
    let guard = 0;
    while (this.period !== 'over' && guard++ < 2000) {
      if (this.pendingMoment) {
        this.resolveMoment(safeAutoResolve(this.pendingMoment.setup, this.rng.fork()));
        continue;
      }
      const r = this.tick();
      if (r.moment) this.resolveMoment(safeAutoResolve(r.moment, this.rng.fork()));
    }
  }

  isOver(): boolean {
    return this.period === 'over';
  }

  summary(): MatchSummary {
    const endMin = this.wentToExtraTime ? 120 : 90;
    const nowMin = this.period === 'over' ? endMin : Math.min(this.minute, endMin);
    const minutes: Record<string, number> = {};
    for (const p of Object.values(this.pstats)) minutes[p.id] = Math.max(0, Math.min(p.off ?? nowMin, endMin) - p.on);

    const rng = new Rng(this.ratingSeed);
    const ratings: Record<string, number> = {};
    const goals: Record<Side, number> = { home: this.homeGoals, away: this.awayGoals };
    const teamAvg: Record<Side, number> = {
      home: this.avgOverall(this.ctx.home.xi),
      away: this.avgOverall(this.ctx.away.xi),
    };
    for (const p of Object.values(this.pstats)) {
      const mins = minutes[p.id];
      if (mins <= 0 && p.on > 0) continue;
      const f = this.player(p.id);
      const res = this.resultFor(p.side);
      if (p.id === this.userId) {
        ratings[p.id] = finalUserRating(this.userRating, {
          pos: f?.position ?? 'CM', minutes: mins, result: res, oppGoals: goals[other(p.side)], red: p.red,
        });
        continue;
      }
      ratings[p.id] = aiRating({
        pos: f?.position ?? 'CM', minutes: mins, goals: p.goals, assists: p.assists, saves: p.saves, yellow: p.yellow,
        red: p.red, ownGoals: p.ownGoals, missedPens: p.missedPens, chancesMissed: p.chancesMissed,
        teamGoals: goals[p.side], oppGoals: goals[other(p.side)], result: res,
        qualityEdge: f ? overall(f) - teamAvg[p.side] : 0,
      }, rng);
    }

    const winner = this.winnerSide();
    let motmId: string | null = null;
    let best = -Infinity;
    for (const [id, r] of Object.entries(ratings)) {
      const score = r + (winner && this.pstats[id]?.side === winner ? 0.25 : 0);
      if (score > best) { best = score; motmId = id; }
    }

    const possession = this.possN ? Math.round((this.possSum / this.possN) * 100) : 50;
    const summary: MatchSummary = {
      fixtureId: this.ctx.fixtureId,
      homeGoals: this.homeGoals,
      awayGoals: this.awayGoals,
      events: [...this.events],
      possession,
      shots: { home: this.teamStats.home.shots, away: this.teamStats.away.shots },
      xg: { home: round1(this.teamStats.home.xg * 10) / 10, away: round1(this.teamStats.away.xg * 10) / 10 },
      ratings,
      motmId,
      lineups: { home: [...this.ctx.home.xi], away: [...this.ctx.away.xi] },
      minutes,
    };
    if (this.pens) summary.pens = { ...this.pens };
    if (this.userId && ratings[this.userId] !== undefined) {
      summary.user = {
        rating: ratings[this.userId],
        stats: { ...this.userStats, minutes: minutes[this.userId] ?? 0 },
        xp: this.finalXp(minutes[this.userId] ?? 0),
        highlights: this.highlights,
      };
    }
    return summary;
  }

  // ── UI helpers ──

  /** Kind of the pending moment (for the intro card), or null. */
  get momentKind(): MomentKind | null {
    return this.pendingMoment?.kind ?? null;
  }

  get pendingSetup(): MomentSetup | null {
    return this.pendingMoment?.setup ?? null;
  }

  /** "45+2'" style label for an event (or the current clock when omitted). */
  clockLabel(e?: MatchEvent): string {
    if (!e) return this.added > 0 ? `${this.minute}+${this.added}'` : `${this.minute}'`;
    const a = this.addedOf.get(e) ?? 0;
    return a > 0 ? `${e.minute}+${a}'` : `${e.minute}'`;
  }

  /** Live possession share of the home team (0..100). */
  possession(): number {
    return this.possN ? Math.round((this.possSum / this.possN) * 100) : 50;
  }

  /** Aggregate score [home, away] when this is a second leg, else null. */
  aggregateScore(): [number, number] | null {
    if (!this.leg1) return null;
    return [this.homeGoals + (this.leg1.awayGoals ?? 0), this.awayGoals + (this.leg1.homeGoals ?? 0)];
  }

  playerName(id: string): string {
    return this.name(id);
  }

  /** Remaining user moments planned for this match (for tests / debug). */
  plannedMoments(): number[] {
    return [...this.plan];
  }

  /** The side that won (after extra time / pens / aggregate), or null for a draw. */
  winnerSide(): Side | null {
    if (this.pens) return this.pens.home > this.pens.away ? 'home' : 'away';
    const agg = this.aggregateScore();
    const [h, a] = agg && this.ctx.knockout ? agg : [this.homeGoals, this.awayGoals];
    return h > a ? 'home' : a > h ? 'away' : null;
  }

  // ───────────────────────── clock ─────────────────────────

  private startPeriod(p: Period, minute: number): void {
    this.period = p;
    this.minute = minute;
    this.added = 0;
    this.stoppage = -1;
    this.halfIncidents = 0;
  }

  private advance(out: MatchEvent[], end: number): MomentSetup | null {
    if (this.minute < end) {
      this.minute += 1;
      return this.playMinute(out);
    }
    if (this.stoppage < 0) {
      this.stoppage = this.computeStoppage(end);
      if (end === 45 || end === 90) this.emit(out, 'chance', null, {}, t('match.stoppage', { n: this.stoppage }));
    }
    if (this.added < this.stoppage) {
      this.added += 1;
      return this.playMinute(out);
    }
    this.endPeriod(out, end);
    return null;
  }

  private computeStoppage(end: number): number {
    const extra = Math.floor(this.halfIncidents / 3);
    if (end === 45) return clamp(this.rng.int(1, 3) + extra, 1, 5);
    if (end === 90) return clamp(this.rng.int(2, 5) + extra, 2, 8);
    return clamp(this.rng.int(0, 1) + Math.min(extra, 1), 1, 3);
  }

  private endPeriod(out: MatchEvent[], end: number): void {
    this.added = 0;
    if (end === 45) {
      this.emit(out, 'halftime', null, { score: this.scoreText() });
      this.period = 'ht';
    } else if (end === 90) {
      if (this.needsExtraTime()) {
        this.wentToExtraTime = true;
        this.emit(out, 'extra_time', null, { score: this.scoreText() });
        this.period = 'et_break';
      } else this.finish(out);
    } else if (end === 105) {
      this.emit(out, 'extra_time', null, {}, t('match.ht.extra', { score: this.scoreText() }));
      this.startPeriod('et2', 105);
      this.emit(out, 'kickoff', null, {}, t('match.et.second'));
    } else {
      if (this.needsExtraTime()) this.startShootout(out);
      else this.finish(out);
    }
  }

  private finish(out: MatchEvent[]): void {
    let text = this.say('fulltime', { score: this.scoreText() });
    const agg = this.aggregateScore();
    if (agg && this.ctx.knockout && !this.pens) {
      const w = this.winnerSide();
      if (w) text += ' ' + t('match.agg.winner', { team: this.ctx[w].name, score: `${agg[0]}-${agg[1]}` });
    }
    this.emit(out, 'fulltime', null, {}, text);
    this.period = 'over';
    if (this.userId && this.pstats[this.userId]) this.userStats.minutes = this.userMinutes();
    this.pendingMoment = null;
  }

  private needsExtraTime(): boolean {
    if (!this.ctx.knockout || this.fixture?.leg === 1) return false;
    const agg = this.aggregateScore();
    const [h, a] = agg ?? [this.homeGoals, this.awayGoals];
    return h === a;
  }

  private findFirstLeg(): Fixture | null {
    const f = this.fixture;
    if (!f || f.leg !== 2) return null;
    const comp = this.state.competitions[this.ctx.compId];
    return comp?.fixtures.find((x) => x.leg === 1 && x.round === f.round && x.homeId === f.awayId && x.awayId === f.homeId && x.played) ?? null;
  }

  // ───────────────────────── one minute of football ─────────────────────────

  private playMinute(out: MatchEvent[]): MomentSetup | null {
    this.playTick += 1;
    this.updateMomentum();
    this.possSum += this.homeShare();
    this.possN += 1;
    let moment: MomentSetup | null = null;

    if (this.queued && this.queued.tick <= this.playTick) {
      const q = this.queued;
      this.queued = null;
      if (q.userTakes && this.userOnPitch) moment = this.startMoment(q.type, 'followup', q.spot);
      else this.simSetPiece(q.side, q.type, out);
    }

    this.userBenchCheck(out);
    this.userSubOffCheck(out);
    for (const side of ['home', 'away'] as Side[]) {
      this.aiSubs(side, out);
      this.discipline(side, out);
      this.injuries(side, out);
    }
    const order: Side[] = this.rng.chance(0.5) ? ['home', 'away'] : ['away', 'home'];
    for (const side of order) {
      const pen = this.backgroundAttack(side, out, moment === null);
      if (pen) moment = pen;
    }
    if (!moment && this.userOnPitch) moment = this.scheduledMoment();
    this.flavor(out);
    if (this.userOnPitch) this.userStats.minutes = this.userMinutes();
    return moment;
  }

  private homeShare(): number {
    const h = this.ctx.home;
    const a = this.ctx.away;
    const style = (s: string) => (s === 'possession' ? 0.05 : s === 'counter' || s === 'defensive' ? -0.04 : s === 'direct' ? -0.02 : 0);
    const v = 0.5 + (h.strength.mid - a.strength.mid) * 0.01 + style(h.style) - style(a.style) + (this.momentum - 0.5) * 0.35;
    return clamp(v, 0.25, 0.75);
  }

  private updateMomentum(): void {
    const h = this.ctx.home.strength;
    const a = this.ctx.away.strength;
    let target = 0.5 + (h.mid - a.mid) * 0.008 + (h.att - a.att) * 0.004 + (this.neutral ? 0 : 0.04);
    target += (this.onPitch.home.length - this.onPitch.away.length) * 0.06;
    const diff = this.homeGoals - this.awayGoals;
    if (this.minute >= 60 && diff !== 0) target -= Math.sign(diff) * (0.05 + (Math.min(this.minute, 90) - 60) * 0.002);
    target += this.swing;
    this.swing *= 0.85;
    target = clamp(target, 0.15, 0.85);
    this.momentum = clamp(this.momentum + (target - this.momentum) * 0.18 + this.rng.normal(0, 0.035), 0.06, 0.94);
  }

  private computeLambda(side: Side): number {
    const a = this.ctx[side];
    const b = this.ctx[other(side)];
    const adv = this.neutral ? 0 : side === 'home' ? 3 : -1.5;
    const q = a.strength.att * 0.6 + a.strength.mid * 0.4 - (b.strength.def * 0.65 + b.strength.gk * 0.2 + b.strength.mid * 0.15) + adv;
    let l = 1.3 * Math.exp(q * 0.035);
    if (a.style === 'defensive') l *= 0.85;
    if (b.style === 'defensive') l *= 0.88;
    if (a.style === 'pressing') l *= 1.05;
    if (b.style === 'pressing') l *= 1.03;
    if (a.style === 'counter' && b.style === 'possession') l *= 1.06;
    l *= 1 - this.ctx.importance * 0.06;
    return clamp(Number.isFinite(l) ? l : 1.2, 0.2, 3.8);
  }

  /** Background expected goals per 90 for a side, after removing what the user's moments are expected to produce. */
  private bgLambda(side: Side): number {
    let l = this.baseLambda[side];
    if (this.userSide && this.userOnPitch) {
      const pos = this.userPosition();
      const skill = clamp((this.userOverall() - 30) / 40, 0.4, 1.3);
      if (side === this.userSide) l = Math.max(l * 0.4, l - this.momentsPer90 * avgMomentXg(pos) * skill * 0.7);
      else l = Math.max(l * 0.5, l - this.momentsPer90 * defendShare(pos) * DEFEND_CONCEDE * 0.7);
    }
    return l;
  }

  private redFactor(side: Side): number {
    const n = Math.max(7, this.onPitch[side].length);
    const m = Math.max(7, this.onPitch[other(side)].length);
    return Math.pow(n / 11, 2) * Math.pow(11 / m, 1.8);
  }

  private momentumFor(side: Side): number {
    return side === 'home' ? this.momentum : 1 - this.momentum;
  }

  private backgroundAttack(side: Side, out: MatchEvent[], allowMoment: boolean): MomentSetup | null {
    const mf = 0.4 + 1.2 * this.momentumFor(side);
    const diff = this.goalsOf(side) - this.goalsOf(other(side));
    const urgency = this.minute >= 75 ? (diff < 0 ? 1.25 : diff > 0 ? 0.85 : 1) : 1;
    // penalties
    if (this.rng.chance((0.12 / 90) * mf * this.redFactor(side))) {
      const sp = this.state.career.setPieces;
      if (side === this.userSide && this.userOnPitch && sp.penalties && allowMoment && !this.pendingMoment) {
        return this.startMoment('penalty', 'followup', { x: 52.5 - 11, y: 0 });
      }
      this.simPenalty(side, out);
      return null;
    }
    const rate = clamp((this.bgLambda(side) / AVG_SHOT_XG / 90) * mf * urgency * this.redFactor(side), 0, 0.6);
    if (!this.rng.chance(rate)) return null;
    const r = this.rng.next();
    const xg = 0.02 + 0.45 * r * r * r;
    const ts = this.teamStats[side];
    ts.shots += 1;
    ts.xg += xg;
    const shooter = this.pickScorer(side, true);
    if (!shooter) return null;
    const gk = this.player(this.gkOf(other(side)));
    const gkQ = gk ? gk.attrs.goalkeeping : this.ctx[other(side)].strength.gk;
    const pGoal = clamp(xg * clamp(1 + (70 - gkQ) / 100, 0.7, 1.3), 0, 0.85);
    if (this.rng.chance(pGoal)) {
      ts.onTarget += 1;
      if (this.rng.chance(0.03)) {
        const defender = this.pickDefender(other(side));
        if (defender) { this.goal(out, side, defender, null, 'own_goal'); return null; }
      }
      if (this.rng.chance(0.04)) {
        this.emit(out, 'var', side, { team: this.ctx[side].name });
        return null;
      }
      this.goal(out, side, shooter, this.rng.chance(0.75) ? this.pickAssist(side, shooter) : null, 'goal');
      return null;
    }
    if (this.rng.chance(clamp(0.3 + xg, 0, 0.85))) {
      ts.onTarget += 1;
      if (xg >= 0.14) {
        const gid = this.gkOf(other(side));
        this.pstat(gid)!.saves += 1;
        this.emit(out, 'save', other(side), { player: this.name(gid), team: this.ctx[other(side)].name }, undefined, { playerId: gid });
      }
    } else if (this.rng.chance(0.06)) {
      this.emit(out, 'woodwork', side, { player: this.name(shooter), team: this.ctx[side].name }, undefined, { playerId: shooter });
    } else if (xg >= 0.22) {
      this.pstat(shooter)!.chancesMissed += 1;
      this.emit(out, 'chance', side, { player: this.name(shooter), team: this.ctx[side].name }, undefined, { playerId: shooter });
    }
    return null;
  }

  private simPenalty(side: Side, out: MatchEvent[]): void {
    const taker = this.bestTaker(side, ['shooting', 'composure'], true);
    if (!taker) return;
    const f = this.player(taker);
    const gk = this.player(this.gkOf(other(side)));
    const p = clamp(0.76 + ((f?.attrs.shooting ?? 65) - 70) * 0.004 - ((gk?.attrs.goalkeeping ?? 65) - 70) * 0.003, 0.55, 0.9);
    this.teamStats[side].shots += 1;
    this.teamStats[side].xg += 0.76;
    if (side !== this.userSide) {
      this.emit(out, 'chance', side, {}, t('match.oppPenalty', { team: this.ctx[side].name, player: this.name(taker) }));
    }
    if (this.rng.chance(p)) {
      this.teamStats[side].onTarget += 1;
      this.goal(out, side, taker, null, 'penalty_goal');
    } else {
      this.pstat(taker)!.missedPens += 1;
      if (this.rng.chance(0.6)) {
        this.teamStats[side].onTarget += 1;
        this.pstat(this.gkOf(other(side)))!.saves += 1;
      }
      this.emit(out, 'penalty_miss', side, { player: this.name(taker), team: this.ctx[side].name }, undefined, { playerId: taker });
    }
  }

  private simSetPiece(side: Side, type: QueuedSetPiece['type'], out: MatchEvent[]): void {
    if (type === 'penalty') { this.simPenalty(side, out); return; }
    const taker = this.bestTaker(side, type === 'corner' ? ['curl', 'passing'] : ['curl', 'shooting'], true);
    if (!taker) return;
    const ts = this.teamStats[side];
    if (type === 'free_kick') {
      ts.shots += 1;
      ts.xg += 0.07;
      const curl = this.player(taker)?.attrs.curl ?? 60;
      const r = this.rng.next();
      const pGoal = clamp(0.07 + (curl - 65) * 0.002, 0.03, 0.15);
      if (r < pGoal) { ts.onTarget += 1; this.goal(out, side, taker, null, 'goal'); return; }
      if (r < pGoal + 0.3) {
        ts.onTarget += 1;
        const gid = this.gkOf(other(side));
        this.pstat(gid)!.saves += 1;
        this.emit(out, 'save', other(side), { player: this.name(gid), team: this.ctx[other(side)].name }, undefined, { playerId: gid });
        return;
      }
      this.emit(out, 'chance', side, {}, t('match.setpiece.fk', { player: this.name(taker) }));
      return;
    }
    // corner: a header chance
    const header = this.pickHeader(side);
    if (header && this.rng.chance(0.05)) {
      ts.shots += 1; ts.onTarget += 1; ts.xg += 0.12;
      this.goal(out, side, header, taker, 'goal');
    } else {
      this.emit(out, 'chance', side, {}, t('match.setpiece.corner', { player: this.name(taker) }));
    }
  }

  // ───────────────────────── squad changes & discipline ─────────────────────────

  private planSubs(side: Side): void {
    const n = Math.min(this.bench[side].filter((id) => id !== this.userId).length, this.rng.int(3, 5));
    const mins: number[] = [];
    for (let i = 0; i < n; i++) {
      const window = i === 0 ? [56, 68] : i < 3 ? [62, 80] : [75, 88];
      mins.push(this.rng.int(window[0], window[1]));
    }
    this.subPlan[side] = mins.sort((a, b) => a - b);
  }

  private aiSubs(side: Side, out: MatchEvent[]): void {
    const plan = this.subPlan[side];
    if (this.added > 0 || this.minute > 90) return;
    while (plan.length && plan[0] <= this.minute) {
      plan.shift();
      const reserve = side === this.userSide && this.userBenched && !this.userOnPitch && !this.userSubbedOff && this.minute <= 80 ? 1 : 0;
      if (this.subsLeft[side] - reserve <= 0) continue;
      const outId = this.pickSubOff(side);
      if (!outId) continue;
      const inId = this.pickSubOn(side, outId);
      if (!inId) continue;
      this.substitute(out, side, outId, inId);
    }
  }

  private pickSubOff(side: Side): string | null {
    const diff = this.goalsOf(side) - this.goalsOf(other(side));
    const cands = this.onPitch[side].filter((id) => id !== this.userId && this.position(id) !== 'GK' && (this.pstats[id]?.on ?? 0) === 0);
    if (!cands.length) return null;
    return this.rng.weighted(cands, (id) => {
      const p = this.pstats[id];
      let w = 1 + (100 - this.fitnessOf(id)) / 25;
      if (p.yellow > 0) w *= 1.6;
      if (p.goals > 0) w *= 0.5;
      const pos = this.position(id);
      if (diff < 0 && (pos === 'CB' || pos === 'FB' || pos === 'DM')) w *= 1.5;
      if (diff > 0 && isAttackingRole(pos)) w *= 1.5;
      return w;
    });
  }

  private pickSubOn(side: Side, outId: string): string | null {
    const outPos = this.position(outId);
    const diff = this.goalsOf(side) - this.goalsOf(other(side));
    const cands = this.bench[side].filter((id) => id !== this.userId && this.position(id) !== 'GK' && !this.player(id)?.injury);
    if (!cands.length) return null;
    return this.rng.weighted(cands, (id) => {
      const pos = this.position(id);
      let w = 1;
      if (pos === outPos) w *= 4;
      else if (sameGroup(pos, outPos)) w *= 2;
      if (diff < 0 && this.minute >= 65 && isAttackingRole(pos)) w *= 2;
      if (diff > 0 && this.minute >= 75 && (pos === 'CB' || pos === 'DM')) w *= 2;
      return w * (0.5 + (this.player(id) ? overall(this.player(id)!) : 50) / 100);
    });
  }

  private substitute(out: MatchEvent[], side: Side, outId: string, inId: string, text?: string, user = false): void {
    const list = this.onPitch[side];
    const i = list.indexOf(outId);
    if (i < 0) return;
    list[i] = inId;
    this.bench[side] = this.bench[side].filter((id) => id !== inId);
    this.pstats[outId].off = this.minute;
    this.pstats[inId] = this.newStat(inId, side, this.minute);
    this.subsLeft[side] -= 1;
    this.halfIncidents += 1;
    this.emit(out, 'sub', side, { player: this.name(inId), extra: this.name(outId), team: this.ctx[side].name }, text, { playerId: inId, user });
  }

  private userBenchCheck(out: MatchEvent[]): void {
    const side = this.userSide;
    const uid = this.userId;
    if (!side || !uid || this.userOnPitch || !this.userBenched || this.userSubbedOff) return;
    if (this.minute < 55 || this.minute > 80 || this.added > 0 || this.subsLeft[side] <= 0) return;
    const rel = this.state.career.relationships;
    const form = this.player(uid)?.form ?? 50;
    let h = 0.022 * (1 + (rel.manager - 50) / 80 + (form - 50) / 80);
    const diff = this.goalsOf(side) - this.goalsOf(other(side));
    if (diff < 0) h *= isAttackingRole(this.userPosition()) ? 2.8 : 2.2;
    else if (diff >= 2) h *= 1.4;
    h *= 1 - this.ctx.importance * 0.3;
    if (!this.rng.chance(clamp(h, 0.004, 0.2))) return;
    const outId = this.pickUserReplacement(side, uid);
    if (!outId) return;
    this.substitute(out, side, outId, uid, t('match.user.subOn', { player: this.name(uid) }), true);
    this.userOnPitch = true;
    this.momentumSwingToward(side, 0.04);
    this.scheduleMoments(this.minute + 2, 89);
  }

  private pickUserReplacement(side: Side, uid: string): string | null {
    const upos = this.userPosition();
    const cands = this.onPitch[side].filter((id) => id !== uid && this.position(id) !== 'GK');
    if (!cands.length) return null;
    return this.rng.weighted(cands, (id) => {
      const pos = this.position(id);
      const w = pos === upos ? 6 : sameGroup(pos, upos) ? 3 : 0.4;
      return w * (1 + (100 - this.fitnessOf(id)) / 30) * ((this.pstats[id]?.goals ?? 0) > 0 ? 0.4 : 1);
    });
  }

  private userSubOffCheck(out: MatchEvent[]): void {
    const side = this.userSide;
    const uid = this.userId;
    if (!side || !uid || !this.userOnPitch || this.minute < 60 || this.minute > 85 || this.added > 0) return;
    if (this.subsLeft[side] <= 0) return;
    const fit = this.fitnessOf(uid);
    let h = 0.003;
    if (fit < 40) h += 0.02;
    if (this.userRating < 5.6) h += 0.025;
    if (this.userRating >= 7.3 || this.userStats.goals > 0) h *= 0.2;
    const diff = this.goalsOf(side) - this.goalsOf(other(side));
    if (diff < 0 && isAttackingRole(this.userPosition())) h *= 0.5;
    if (this.pstats[uid] && this.pstats[uid].on > 0) h *= 0.15; // came off the bench
    if (!this.rng.chance(h)) return;
    const inId = this.pickSubOn(side, uid);
    if (!inId) return;
    this.substitute(out, side, uid, inId, t('match.user.subOff', { player: this.name(uid) }), true);
    this.userOnPitch = false;
    this.userSubbedOff = true;
    this.plan = [];
  }

  private discipline(side: Side, out: MatchEvent[]): void {
    const pY = (1.7 / 90) * (1 + this.ctx.importance * 0.35 + (this.ctx.derby ? 0.4 : 0)) * (this.momentumFor(side) < 0.4 ? 1.15 : 1);
    if (this.rng.chance(pY)) {
      const cands = this.onPitch[side].filter((id) => id !== this.userId);
      if (cands.length) {
        const id = this.rng.weighted(cands, (x) => {
          const f = this.player(x);
          return CARD_W[this.position(x)] * (f?.traits.includes('hothead') ? 2 : 1) * (this.pstats[x].yellow > 0 ? 0.45 : 1);
        });
        this.card(out, side, id, this.pstats[id].yellow > 0 ? 'red2' : 'yellow');
      }
    }
    if (this.rng.chance(0.022 / 90)) {
      const cands = this.onPitch[side].filter((id) => id !== this.userId && this.position(id) !== 'GK');
      if (cands.length) this.card(out, side, this.rng.pick(cands), 'red');
    }
  }

  private card(out: MatchEvent[], side: Side, id: string, kind: 'yellow' | 'red' | 'red2', user = false): void {
    const p = this.pstats[id];
    if (!p) return;
    this.halfIncidents += 1;
    const data = { player: this.name(id), team: this.ctx[side].name };
    if (kind === 'yellow') {
      p.yellow += 1;
      this.emit(out, 'yellow', side, data, user ? t('match.user.yellow', data) : undefined, { playerId: id, user });
      return;
    }
    if (kind === 'red2') p.yellow += 1;
    p.red = true;
    const text = user ? t('match.user.red', data) : kind === 'red2' ? variant('c.red2', this.data(data), this.textRng) : undefined;
    this.emit(out, 'red', side, data, text, { playerId: id, user });
    this.removeFromPitch(side, id);
    this.swing += side === 'home' ? -0.08 : 0.08;
  }

  private userFoulCard(out: MatchEvent[], penalty: boolean): void {
    const uid = this.userId;
    const side = this.userSide;
    if (!uid || !side || !this.userOnPitch) return;
    const f = this.player(uid);
    let p = penalty ? 0.55 : 0.3;
    if (f?.traits.includes('hothead')) p *= 1.7;
    if (f?.traits.includes('calm')) p *= 0.6;
    if (penalty && this.rng.chance(0.06)) {
      this.card(out, side, uid, 'red', true);
    } else if (this.rng.chance(clamp(p, 0, 0.9))) {
      this.card(out, side, uid, this.pstats[uid].yellow > 0 ? 'red2' : 'yellow', true);
    }
    if (!this.onPitch[side].includes(uid)) {
      this.userOnPitch = false;
      this.userSentOff = true;
      this.plan = [];
    }
  }

  private injuries(side: Side, out: MatchEvent[]): void {
    if (!this.rng.chance(0.1 / 90)) return;
    const cands = this.onPitch[side].filter((id) => id !== this.userId && this.position(id) !== 'GK');
    if (!cands.length) return;
    const id = this.rng.pick(cands);
    this.halfIncidents += 1;
    this.emit(out, 'injury', side, { player: this.name(id), team: this.ctx[side].name }, undefined, { playerId: id });
    const inId = this.subsLeft[side] > (side === this.userSide && this.userBenched && !this.userOnPitch ? 1 : 0) ? this.pickSubOn(side, id) : null;
    if (inId) this.substitute(out, side, id, inId);
    else this.removeFromPitch(side, id);
  }

  private removeFromPitch(side: Side, id: string): void {
    this.onPitch[side] = this.onPitch[side].filter((x) => x !== id);
    if (this.pstats[id]) this.pstats[id].off = this.minute;
  }

  private flavor(out: MatchEvent[]): void {
    if (this.playTick - this.lastFlavor < 9 || this.added > 0) return;
    const side: Side | null = this.momentum > 0.7 ? 'home' : this.momentum < 0.3 ? 'away' : null;
    if (!side || !this.rng.chance(0.3)) return;
    this.lastFlavor = this.playTick;
    this.emit(out, 'chance', side, {}, variant('pressure', this.data({ team: this.ctx[side].name }), this.textRng));
  }

  // ───────────────────────── goals ─────────────────────────

  private goal(out: MatchEvent[], side: Side, scorerId: string, assistId: string | null, kind: 'goal' | 'penalty_goal' | 'own_goal'): void {
    if (side === 'home') this.homeGoals += 1;
    else this.awayGoals += 1;
    this.halfIncidents += 1;
    const sp = this.pstat(scorerId);
    if (kind === 'own_goal') { if (sp) sp.ownGoals += 1; } else if (sp) sp.goals += 1;
    if (assistId) { const ap = this.pstat(assistId); if (ap) ap.assists += 1; }
    this.swing += side === 'home' ? 0.12 : -0.12;
    let text = this.say(kind, { player: this.name(scorerId), team: this.ctx[side].name, score: this.scoreText() });
    if (assistId && kind !== 'own_goal') text += ` (${t('match.assistBy', { name: this.name(assistId) })})`;
    const user = !!this.userId && (scorerId === this.userId || assistId === this.userId);
    const e = this.emit(out, kind, side, {}, text, { playerId: scorerId, user });
    if (assistId && kind !== 'own_goal') e.assistId = assistId;
  }

  private pickScorer(side: Side, excludeUser: boolean): string | null {
    const cands = this.onPitch[side].filter((id) => (!excludeUser || id !== this.userId) && this.position(id) !== 'GK');
    if (!cands.length) return null;
    return this.rng.weighted(cands, (id) => {
      const sh = this.player(id)?.attrs.shooting ?? 60;
      return SCORER_W[this.position(id)] * Math.pow(sh / 70, 2);
    });
  }

  private pickAssist(side: Side, scorerId: string | null): string | null {
    const cands = this.onPitch[side].filter((id) => id !== scorerId && id !== this.userId && this.position(id) !== 'GK');
    if (!cands.length) return null;
    return this.rng.weighted(cands, (id) => {
      const f = this.player(id);
      return ASSIST_W[this.position(id)] * (((f?.attrs.passing ?? 60) + (f?.attrs.vision ?? 60)) / 140);
    });
  }

  private pickDefender(side: Side): string | null {
    const cands = this.onPitch[side].filter((id) => id !== this.userId && ['CB', 'FB', 'DM'].includes(this.position(id)));
    return cands.length ? this.rng.pick(cands) : null;
  }

  private pickHeader(side: Side): string | null {
    const cands = this.onPitch[side].filter((id) => id !== this.userId && ['CB', 'ST'].includes(this.position(id)));
    if (!cands.length) return null;
    return this.rng.weighted(cands, (id) => this.player(id)?.attrs.heading ?? 60);
  }

  private bestTaker(side: Side, keys: AttrKey[], excludeUser: boolean): string | null {
    let best: string | null = null;
    let bestV = -1;
    for (const id of this.onPitch[side]) {
      if ((excludeUser && id === this.userId) || this.position(id) === 'GK') continue;
      const f = this.player(id);
      const v = f ? avg(keys.map((k) => f.attrs[k])) : 50;
      if (v > bestV) { bestV = v; best = id; }
    }
    return best;
  }

  // ───────────────────────── user moments ─────────────────────────

  /** Plan the user's moments in [from, to] (clock minutes), ≥ 4 minutes apart. */
  private scheduleMoments(from: number, to: number, span = 90): void {
    const uid = this.userId;
    if (!uid || to - from < 3) return;
    const pos = this.userPosition();
    const attacker = isAttackingRole(pos);
    const form = this.player(uid)?.form ?? 50;
    const trust = this.state.career.relationships.teammates ?? 50;
    const us = this.ctx[this.userSide!].strength.overall;
    const them = this.ctx[other(this.userSide!)].strength.overall;
    const dom = clamp((us - them) / 20, -1, 1);
    if (this.momentsPer90 === 0) {
      const factor = 1 + (form - 50) / 250 + (trust - 50) / 250 + dom * 0.12;
      const n90 = (attacker ? 6 : 4.5) * factor + this.rng.normal(0, 0.7);
      this.momentsPer90 = clamp(Math.round(n90), attacker ? 4 : 3, attacker ? 8 : 6);
    }
    const window = to - from + 1;
    let n = Math.round((this.momentsPer90 * window) / span);
    if (window >= 12) n = Math.max(1, n);
    n = Math.min(n, Math.floor(window / 4) + 1);
    const picked: number[] = [];
    let tries = 0;
    while (picked.length < n && tries++ < 400) {
      const m = this.rng.int(from, to);
      if (picked.every((x) => Math.abs(x - m) >= 4) && this.plan.every((x) => Math.abs(x - m) >= 4)) picked.push(m);
    }
    this.plan = [...this.plan, ...picked].sort((a, b) => a - b);
  }

  private scheduledMoment(): MomentSetup | null {
    if (this.pendingMoment) return null;
    if (this.added > 0) return this.lastGaspCheck();
    if (!this.plan.length || this.plan[0] > this.minute) return null;
    this.plan.shift();
    const gap = this.playTick - this.lastMomentTick;
    if (gap < 4) {
      const m = this.minute + (4 - gap);
      const end = this.minute <= 45 ? 45 : this.minute <= 90 ? 89 : 119;
      if (m <= end) this.plan = [...this.plan, m].sort((a, b) => a - b);
      return null;
    }
    const us = this.userSide!;
    const type = chooseMomentType(this.rng, {
      position: this.userPosition(),
      setPieces: this.state.career.setPieces,
      setPieceMoments: this.setPieceMoments,
      diff: this.goalsOf(us) - this.goalsOf(other(us)),
      minute: this.minute,
      momentumUs: this.momentumFor(us),
      lastTypes: this.lastTypes,
    });
    return this.startMoment(type, 'normal');
  }

  private lastGaspCheck(): MomentSetup | null {
    if (this.lastGaspDone || (this.period !== 'second' && this.period !== 'et2')) return null;
    if (this.playTick - this.lastMomentTick < 4) return null;
    const us = this.userSide!;
    const diff = this.goalsOf(us) - this.goalsOf(other(us));
    if (Math.abs(diff) > 1) return null;
    if (!this.rng.chance(0.3 + this.ctx.importance * 0.15)) return null;
    this.lastGaspDone = true;
    let type: MatchMomentType;
    const pos = this.userPosition();
    // protecting a lead: defenders hold the line, forwards get the killer counter
    if (diff > 0) type = isAttackingRole(pos) ? 'counter' : this.rng.chance(0.7) ? 'defend' : 'counter';
    else {
      const pool: MatchMomentType[] = pos === 'CB' ? ['cross_receive', 'cross_receive', 'open_play']
        : pos === 'FB' ? ['wing_cross', 'open_play'] : pos === 'W' ? ['wing_cross', 'one_on_one', 'open_play'] : ['one_on_one', 'cross_receive', 'open_play'];
      type = this.rng.pick(pool);
    }
    return this.startMoment(type, 'lastgasp');
  }

  private startMoment(type: MatchMomentType, kind: MomentKind, spot?: Vec2): MomentSetup {
    const setup = this.buildSetup(type, kind, spot);
    this.pendingMoment = { setup, kind };
    this.lastMomentTick = this.playTick;
    this.lastTypes.push(type);
    if (isSetPiece(type)) this.setPieceMoments += 1;
    return setup;
  }

  private buildSetup(type: MomentType, kind: MomentKind, spot?: Vec2): MomentSetup {
    const us = this.userSide!;
    const them = other(us);
    const usSheet = this.ctx[us];
    const themSheet = this.ctx[them];
    const fit = (id: string) => this.fitnessOf(id);
    const usSpec = buildTeamSpec(this.state, usSheet, this.onPitch[us], 'us', this.userId, fit, (id) => this.natNumber(us, id), usSheet.strength.overall);
    const themSpec = buildTeamSpec(this.state, themSheet, this.onPitch[them], 'them', null, fit, (id) => this.natNumber(them, id), themSheet.strength.overall);
    themSpec.kit = resolveKitClash(usSpec.kit, themSpec.kit, this.alternativeKit(themSheet.teamId, themSheet.kit));
    const usOverall = usSheet.strength.overall;
    const themOverall = themSheet.strength.overall;
    const importance = kind === 'shootout' ? 1 : clamp(this.ctx.importance + (kind === 'lastgasp' ? 0.2 : 0), 0, 1);
    return {
      type,
      seed: this.rng.seed(),
      minute: this.minute,
      us: usSpec,
      them: themSpec,
      userId: this.userId!,
      weather: this.ctx.weather,
      difficulty: difficultyFor(usOverall, themOverall, importance),
      teammateTrust: this.teammateTrust(),
      score: { us: this.goalsOf(us), them: this.goalsOf(them) },
      importance,
      timeLimit: TIME_LIMIT[type],
      spot: spot ?? (isSetPiece(type) ? setPieceSpot(type, this.rng) : undefined),
    };
  }

  private alternativeKit(teamId: string, kit: Kit): Kit | undefined {
    const club = this.state.world.clubs[teamId];
    if (!club) return undefined;
    return club.kit.primary === kit.primary ? club.awayKit : club.kit;
  }

  private natNumber(side: Side, id: string): number | undefined {
    if (!this.state.world.nationalTeams[this.ctx[side].teamId]) return undefined;
    const all = [...this.ctx[side].xi, ...this.ctx[side].bench];
    const i = all.indexOf(id);
    return i >= 0 ? i + 1 : undefined;
  }

  private teammateTrust(): number {
    const rel = this.state.career.relationships.teammates ?? 50;
    const form = this.userId ? this.player(this.userId)?.form ?? 50 : 50;
    return Math.round(clamp(rel * 0.6 + form * 0.25 + 10 + (this.userRating - 6) * 6, 0, 100));
  }

  // ───────────────────────── shootout ─────────────────────────

  private startShootout(out: MatchEvent[]): void {
    this.period = 'pens';
    const order = (side: Side): string[] => {
      const ids = this.onPitch[side].filter((id) => this.position(id) !== 'GK');
      const score = (id: string) => { const f = this.player(id); return f ? f.attrs.shooting + f.attrs.composure : 100; };
      ids.sort((a, b) => score(b) - score(a));
      const gks = this.onPitch[side].filter((id) => this.position(id) === 'GK');
      const list = [...ids, ...gks];
      if (side === this.userSide && this.userId && this.userOnPitch) {
        const uid = this.userId;
        const f = this.player(uid);
        const without = list.filter((x) => x !== uid);
        const slot = this.state.career.setPieces.penalties ? 0 : f?.traits.includes('big_game') ? 4 : Math.min(Math.max(list.indexOf(uid), 1), 3);
        without.splice(Math.min(slot, without.length), 0, uid);
        return without;
      }
      return list;
    };
    const first: Side = this.rng.chance(0.5) ? 'home' : 'away';
    this.shootout = { order: { home: order('home'), away: order('away') }, idx: { home: 0, away: 0 }, kicks: [], turn: first, score: { home: 0, away: 0 } };
    this.pens = { home: 0, away: 0 };
    this.emit(out, 'shootout', null, {});
  }

  private shootoutStep(out: MatchEvent[]): MomentSetup | null {
    const sh = this.shootout;
    if (!sh) { this.finish(out); return null; }
    const side = sh.turn;
    const order = sh.order[side];
    const kicker = order.length ? order[sh.idx[side] % order.length] : null;
    if (kicker && kicker === this.userId && this.userOnPitch) {
      const setup = this.buildSetup('penalty', 'shootout', { x: 52.5 - 11, y: 0 });
      this.pendingMoment = { setup, kind: 'shootout' };
      return setup;
    }
    sh.idx[side] += 1;
    let scored = false;
    let saved = false;
    if (kicker) {
      const f = this.player(kicker);
      const gk = this.player(this.gkOf(other(side)));
      const p = clamp(0.75 + ((f?.attrs.shooting ?? 65) - 70) * 0.004 + ((f?.attrs.composure ?? 65) - 70) * 0.002 - ((gk?.attrs.goalkeeping ?? 65) - 70) * 0.003, 0.55, 0.9);
      scored = this.rng.chance(p);
      saved = !scored && this.rng.chance(0.6);
    }
    this.recordKick(out, side, kicker, scored, saved);
    return null;
  }

  private resolveShootoutKick(result: MomentResult, out: MatchEvent[]): void {
    const sh = this.shootout;
    const uid = this.userId!;
    if (!sh || !this.userSide) return;
    sh.idx[this.userSide] += 1;
    const scored = result.goalFor || result.outcome === 'goal';
    this.userRating = round1(clamp(this.userRating + (scored ? 0.3 : -0.4), 3, 10));
    if (result.highlight) this.highlights += 1;
    this.recordKick(out, this.userSide, uid, scored, result.outcome === 'saved', true);
  }

  private recordKick(out: MatchEvent[], side: Side, kicker: string | null, scored: boolean, saved: boolean, user = false): void {
    const sh = this.shootout!;
    sh.kicks.push({ side, playerId: kicker ?? '', scored });
    if (scored) sh.score[side] += 1;
    this.pens = { home: sh.score.home, away: sh.score.away };
    const key = scored ? 'pen.scored' : saved ? 'pen.saved' : 'pen.missed';
    const text = t(`match.${key}`, { team: this.ctx[side].shortName || this.ctx[side].name, player: kicker ? this.name(kicker) : '?', score: `${sh.score.home}-${sh.score.away}` });
    this.emit(out, 'shootout', side, {}, text, { playerId: kicker ?? undefined, user });
    sh.turn = other(side);
    const decided = this.shootoutDecided();
    if (decided) {
      this.emit(out, 'shootout', decided, {}, t('match.pen.winner', { team: this.ctx[decided].name, score: `${sh.score.home}-${sh.score.away}` }));
      this.finish(out);
    }
  }

  private shootoutDecided(): Side | null {
    const sh = this.shootout!;
    const kh = sh.kicks.filter((k) => k.side === 'home').length;
    const ka = sh.kicks.filter((k) => k.side === 'away').length;
    const h = sh.score.home;
    const a = sh.score.away;
    if (kh <= 5 && ka <= 5) {
      if (h + (5 - kh) < a) return 'away';
      if (a + (5 - ka) < h) return 'home';
      if (kh === 5 && ka === 5 && h !== a) return h > a ? 'home' : 'away';
      return null;
    }
    if (kh === ka && h !== a) return h > a ? 'home' : 'away';
    return null;
  }

  // ───────────────────────── helpers ─────────────────────────

  private newStat(id: string, side: Side, on = 0): PStat {
    return { id, side, on, off: null, onTick: this.playTick, goals: 0, assists: 0, saves: 0, yellow: 0, red: false, ownGoals: 0, missedPens: 0, chancesMissed: 0 };
  }

  private pstat(id: string | null | undefined): PStat | undefined {
    return id ? this.pstats[id] : undefined;
  }

  private player(id: string): Footballer | undefined {
    return this.state.world.players[id];
  }

  private position(id: string): Position {
    return this.player(id)?.position ?? 'CM';
  }

  private name(id: string): string {
    return displayName(this.player(id), '—');
  }

  private userPosition(): Position {
    return this.userId ? this.position(this.userId) : 'CM';
  }

  private userOverall(): number {
    const f = this.userId ? this.player(this.userId) : undefined;
    return f ? overall(f) : 55;
  }

  private gkOf(side: Side): string {
    return this.onPitch[side].find((id) => this.position(id) === 'GK') ?? this.onPitch[side][0] ?? this.ctx[side].xi[0];
  }

  private goalsOf(side: Side): number {
    return side === 'home' ? this.homeGoals : this.awayGoals;
  }

  private resultFor(side: Side): Result {
    const d = this.goalsOf(side) - this.goalsOf(other(side));
    return d > 0 ? 'W' : d < 0 ? 'L' : 'D';
  }

  private avgOverall(ids: string[]): number {
    const vals = ids.map((id) => this.player(id)).filter((p): p is Footballer => !!p).map((p) => overall(p));
    return vals.length ? avg(vals) : 60;
  }

  private momentumSwingToward(side: Side, v: number): void {
    this.swing += side === 'home' ? v : -v;
  }

  /** In-match freshness 0..100 (start fitness minus fatigue; the user's energy also matters). */
  fitnessOf(id: string): number {
    const f = this.player(id);
    let start = f?.fitness ?? 90;
    if (id === this.userId) start = start * 0.6 + (this.state.career.energy ?? 80) * 0.4;
    const st = this.pstats[id];
    const played = st ? this.playTick - st.onTick : 0;
    const stamina = f?.attrs.stamina ?? 60;
    return clamp(start - played * (0.3 - stamina * 0.0018), 10, 100);
  }

  private userMinutes(): number {
    const p = this.userId ? this.pstats[this.userId] : undefined;
    if (!p) return 0;
    const cap = this.wentToExtraTime ? 120 : 90;
    return Math.max(0, Math.min(p.off ?? this.minute, cap) - p.on);
  }

  private finalXp(minutes: number): Partial<Record<AttrKey, number>> {
    const xp: Partial<Record<AttrKey, number>> = { ...this.userXp };
    const share = clamp(minutes / 90, 0, 1.4);
    const add = (k: AttrKey, v: number) => { if (v > 0) xp[k] = round1((xp[k] ?? 0) + v); };
    add('stamina', Math.round(2 * share));
    const weights = Object.entries(POSITION_WEIGHTS[this.userPosition()] ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
    for (const [k] of weights.slice(0, 2)) add(k as AttrKey, Math.round(1.5 * share));
    return xp;
  }

  private scoreText(): string {
    return `${this.ctx.home.shortName || this.ctx.home.name} ${this.homeGoals}-${this.awayGoals} ${this.ctx.away.shortName || this.ctx.away.name}`;
  }

  private data(d: Partial<CommentaryData>): CommentaryData {
    return { minute: this.minute, ...d };
  }

  private say(kind: MatchEventKind, d: Partial<CommentaryData>): string {
    try {
      return this.commentary(kind, this.data(d), this.textRng);
    } catch {
      return variant(`c.${kind}`, this.data(d), this.textRng);
    }
  }

  private emit(
    out: MatchEvent[], kind: MatchEventKind, side: Side | null, d: Partial<CommentaryData>, text?: string,
    extra: { playerId?: string; user?: boolean } = {},
  ): MatchEvent {
    const e: MatchEvent = { minute: this.minute, kind, side, text: text ?? this.say(kind, d) };
    if (extra.playerId) e.playerId = extra.playerId;
    if (extra.user) e.user = true;
    if (this.added > 0) this.addedOf.set(e, this.added);
    out.push(e);
    this.events.push(e);
    return e;
  }
}

function sameGroup(a: Position, b: Position): boolean {
  const g = (p: Position) => (p === 'CB' || p === 'FB' ? 'D' : p === 'DM' || p === 'CM' || p === 'AM' ? 'M' : p === 'GK' ? 'G' : 'A');
  return g(a) === g(b);
}
