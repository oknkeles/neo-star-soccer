/**
 * The moment engine core: owns MomentState, runs the 120 Hz fixed-step loop, arbitrates
 * the ball (dribbling, first touch, tackles, kicks, blocks) and emits events.
 * AI, keepers, moment scripts and outcome classification live in sibling files.
 */
import type {
  AnimState, ControlCommand, KickParams, MomentEvent, MomentOutcome, MomentPlayerSpec, MomentResult,
  MomentSetup, MomentState, ReplayFrame, Vec2, Vec3,
} from '../../core/types';
import { Rng } from '../../core/rng';
import { clamp } from '../../core/util';
import { t } from '../../core/i18n';
import './strings';
import {
  AFTERTOUCH_WINDOW, AIM_TIMESCALE, BODY_H, BODY_R, BR, CALL_WINDOW, DT, GH, GW, HL, HW, REPLAY_FRAMES, REPLAY_HZ,
} from './constants';
import { assignSlots } from './formation';
import { baseXg, distToGoal, hyp, inBox, segDist } from './geom';
import { newUserLog, type Agent, type KickRec, type PathSample, type Side, type UserLog } from './internal';
import { computeLaunch, maxSpin, type KickKind, type Kicker, type KickSpec } from './kick';
import {
  ballSpeed, integrateBall, newAux, newReport, physEnv, resetReport, type BallAux, type PhysEnv, type StepReport,
} from './physics';
import { crossPlane, freshBall, launched, predictPath } from './solver';
import { aiUpdate, carrierThink } from './ai';
import { keeperTick, newKeeperMem } from './keeper';
import { initMoment, drillTick, scriptTick, type MomentScript } from './moments';
import { buildResult, classify, bannerFor } from './outcome';

export interface UserCtl {
  target: Vec2 | null;
  dir: Vec2 | null;
  sprint: boolean;
  aiming: boolean;
  /** Buffered one-touch kick waiting for the ball to come within reach. */
  pending: { params: KickParams; until: number } | null;
  /** Aftertouch window end (sim time) and spin added so far. */
  atUntil: number;
  atSpin: number;
  callUntil: number;
  callThrough: boolean;
  tackle: { slide: boolean } | null;
  /** Calm controls: time is stopped completely while the user aims (no clock, no focus drain). */
  freeze: boolean;
}

/** Reach rules for a user/AI strike at the loose ball. */
export interface Reach { ok: boolean; kind: KickKind }

const ONE_SHOT_ANIMS: Partial<Record<AnimState, number>> = {
  kick: 0.4, pass: 0.35, header: 0.55, volley: 0.45, tackle: 0.45, slide: 0.9, dive_left: 1.1, dive_right: 1.1,
  catch: 0.6, fall: 1.0, wall_jump: 0.6,
};

export class Engine {
  readonly setup: MomentSetup;
  readonly state: MomentState;
  readonly rng: Rng;
  readonly env: PhysEnv;
  readonly attackSide: Side;
  agents: Agent[] = [];
  user!: Agent;
  gkUs: Agent | null = null;
  gkThem: Agent | null = null;
  owner: Agent | null = null;
  aux: BallAux = newAux();
  rep: StepReport = newReport();
  kicks: KickRec[] = [];
  lastKick: KickRec | null = null;
  log: UserLog = newUserLog();
  ctl: UserCtl = {
    target: null, dir: null, sprint: false, aiming: false, pending: null, atUntil: -1, atSpin: 0, callUntil: -1,
    callThrough: false, tackle: null, freeze: false,
  };
  script: MomentScript = { actions: [] };
  /** Set piece: everyone waits for the user's kick. */
  frozen = false;
  /**
   * 0..1 casual-play assistance derived from setup.difficulty: 1 on 'easy' (≈0.3), ~0.35 on
   * 'normal' (≈0.5), 0 on 'hard'. Slows opponents' reactions and pressing, softens the keeper,
   * makes the user's touch / dribble / execution more forgiving and moments longer.
   */
  ease = 0;
  setPiece: 'free_kick' | 'penalty' | 'corner' | null = null;
  introEnd = 0.45;
  possession: Side | null = null;
  possSince = 0;
  /** Seconds of play counted toward the time limit (set-piece waiting counts half). */
  playClock = 0;
  endAt = -1;
  goalFor = false;
  goalAgainst = false;
  scorerId: string | null = null;
  assistId: string | null = null;
  followUp: MomentResult['followUp'] = null;
  highlight = false;
  skipped = false;
  skipResult: MomentResult | null = null;
  /** Bumps whenever the ball's trajectory changes by contact (prediction caches). */
  touchSeq = 0;
  loosePath: { seq: number; t: number; path: PathSample[] } | null = null;
  focusBudget: number;
  tickNo = 0;
  /** Opponents the user had to beat (dribble stat): agent index → time first engaged. */
  engaged = new Map<number, number>();
  drill: { attempt: number; attempts: number; score: number; resolveAt: number; kicked: boolean; best: number[] } | null = null;
  private listeners: ((e: MomentEvent) => void)[] = [];
  private acc = 0;
  /** Simulated seconds not yet stepped (0..DT): views extrapolate positions by it for smooth motion. */
  get lag(): number { return this.acc; }
  /** Calm controls: the simulation is stopped while the user draws his kick. */
  get frozenForAim(): boolean { return this.ctl.aiming && this.ctl.freeze; }
  private replayBuf: ReplayFrame[] = [];
  private replayHead = 0;
  private lastBounceT = -1;
  private res: MomentResult | null = null;

  constructor(setup: MomentSetup) {
    this.setup = setup;
    this.rng = new Rng((setup.seed >>> 0) || 1);
    this.env = physEnv(setup.weather);
    this.attackSide = setup.type === 'defend' ? 'them' : 'us';
    // easy (≈0.3) → 1, normal (≈0.5) → 0.5, hard (≥0.7) → 0
    this.ease = clamp((0.7 - clamp(Number.isFinite(setup.difficulty) ? setup.difficulty : 0.5, 0, 1)) / 0.4, 0, 1);
    this.state = {
      time: 0, timeScale: 1, phase: 'intro', ball: freshBall({ x: 0, y: 0, z: BR }), players: [], focus: 1,
      offsideLineX: null, banner: null, outcome: null,
    };
    this.createAgents();
    const comp = clamp(this.user.a.composure, 1, 99) / 99;
    this.focusBudget = 1.5 + 2.0 * comp;
    initMoment(this);
    this.updateOffsideLine();
  }

  // ───────────────────────── setup ─────────────────────────

  private createAgents(): void {
    const s = this.setup;
    const diff = clamp(s.difficulty, 0, 1);
    const add = (spec: MomentPlayerSpec, side: Side, slotIdx: number, slots: ReturnType<typeof assignSlots>) => {
      const i = this.agents.length;
      const a = spec.attrs;
      const isUser = side === 'us' && (spec.isUser || spec.id === s.userId);
      const isGK = spec.role === 'GK';
      const stamina = clamp((Number.isFinite(spec.fitness) ? spec.fitness : 90) / 100, 0.35, 1);
      const agent: Agent = {
        i, id: spec.id, spec, a, side, dir: side === 'us' ? 1 : -1, isGK, isUser, slot: slots[slotIdx],
        st: {
          id: spec.id, side, role: spec.role, isUser, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
          facing: side === 'us' ? 0 : Math.PI, anim: isGK ? 'gk_ready' : 'idle', animTime: 0, stamina, hasBall: false,
        },
        target: { x: 0, y: 0 }, urgency: 0, duty: 'idle',
        topSpeed: 5.9 + 3.3 * (clamp(a.pace, 1, 99) / 99) + (isUser ? 0.65 * this.ease : 0),
        accel: 3.4 + 4.4 * (clamp(a.acceleration, 1, 99) / 99),
        cool: 0, stun: 0, think: 0.1 + 0.02 * (i % 10), touch: 0, touchPeriod: 0.5, jump: 0, markIdx: -1, receivedFrom: -1,
        carryT: 0, runT: 0, runTarget: null, keeper: isGK ? newKeeperMem() : null,
        reaction: clamp(0.3 - 0.12 * (a.positioning / 99) - (side === 'them' ? 0.08 * (diff - 0.5) - 0.12 * this.ease : 0), 0.12, 0.52),
        animLock: 0, noise: side === 'them' ? 1.25 - 0.5 * diff : isUser ? 1 - 0.35 * this.ease : 1, eit: Infinity, eitPoint: null, wall: false, passive: false,
      };
      this.agents.push(agent);
      this.state.players.push(agent.st);
      if (isUser) this.user = agent;
      if (isGK) { if (side === 'us') this.gkUs ??= agent; else this.gkThem ??= agent; }
    };
    const usPlayers = s.us.players.slice(0, 11);
    const themPlayers = s.them.players.slice(0, 11);
    const usSlots = assignSlots(usPlayers, s.us.formation);
    const themSlots = assignSlots(themPlayers, s.them.formation);
    usPlayers.forEach((p, k) => add(p, 'us', k, usSlots));
    themPlayers.forEach((p, k) => add(p, 'them', k, themSlots));
    if (!this.user) {
      // the setup did not mark the user: take the first outfielder of our side
      const u = this.agents.find((a) => a.side === 'us' && !a.isGK) ?? this.agents[0];
      u.isUser = true;
      u.st.isUser = true;
      this.user = u;
    }
  }

  // ───────────────────────── public API ─────────────────────────

  on(listener: (e: MomentEvent) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }

  emit(e: MomentEvent): void {
    for (const l of this.listeners.slice()) {
      try { l(e); } catch { /* a listener must never break the simulation */ }
    }
  }

  isFinished(): boolean {
    return this.state.phase === 'ended';
  }

  result(): MomentResult {
    if (this.skipResult) return this.skipResult;
    let r = this.res;
    if (!r || !this.isFinished()) { r = buildResult(this); this.res = r; }
    return r;
  }

  step(dt: number): void {
    const s = this.state;
    if (s.phase === 'ended') return;
    const real = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
    // calm controls: nothing moves (and no clock runs) while the user aims
    if (this.ctl.aiming && this.ctl.freeze) return;
    // slow-motion focus is a real-time budget
    if (this.ctl.aiming && !this.frozen && s.timeScale < 1) {
      s.focus = Math.max(0, s.focus - real / this.focusBudget);
      if (s.focus <= 0) s.timeScale = 1;
    } else if (!this.ctl.aiming) {
      s.focus = Math.min(1, s.focus + real * 0.15);
    }
    this.acc += real * s.timeScale;
    let n = 0;
    while (this.acc >= DT - 1e-9 && n < 30) {
      this.tick();
      this.acc -= DT;
      n++;
      if (this.isFinished()) break;
    }
    if (n >= 30) this.acc = 0;
  }

  input(cmd: ControlCommand): void {
    const s = this.state;
    if (s.phase === 'ended' || !cmd || typeof cmd !== 'object') return;
    if (cmd.kind === 'skip') { this.skip(); return; }
    if (s.phase === 'outcome') return;
    const c = this.ctl;
    this.log.idle = 0;
    switch (cmd.kind) {
      case 'move':
        c.target = cmd.target && Number.isFinite(cmd.target.x) && Number.isFinite(cmd.target.y) ? { x: cmd.target.x, y: cmd.target.y } : null;
        c.dir = null;
        break;
      case 'moveDir': {
        const l = hyp(cmd.dir?.x ?? 0, cmd.dir?.y ?? 0);
        c.dir = l > 1e-3 && Number.isFinite(l) ? { x: cmd.dir.x / Math.max(1, l), y: cmd.dir.y / Math.max(1, l) } : null;
        c.target = null;
        break;
      }
      case 'sprint':
        c.sprint = !!cmd.on;
        break;
      case 'aimStart':
        if (cmd.freeze) {
          // stop the world (only when the user can strike the ball right now)
          if (!this.canKick()) break;
          c.freeze = true;
          s.timeScale = 0;
        }
        if (!c.aiming) {
          c.aiming = true;
          if (!c.freeze && !this.frozen && s.focus > 0.02) s.timeScale = AIM_TIMESCALE;
          if (s.phase === 'live' || s.phase === 'flight') s.phase = 'aiming';
          this.emit({ t: 'aim', on: true });
        }
        break;
      case 'aimCancel':
        this.stopAiming();
        break;
      case 'kick':
        this.userKick(cmd.params);
        break;
      case 'aftertouch':
        this.aftertouch(cmd.spin);
        break;
      case 'callForBall':
        if (s.time > c.callUntil - 0.5) this.emit({ t: 'call', by: this.user.id });
        c.callUntil = s.time + CALL_WINDOW;
        c.callThrough = !!cmd.through;
        this.log.calledForBall = true;
        // a team-mate on the ball reacts straight away (he decides in carrierThink)
        if (this.owner && this.owner.side === this.user.side && !this.owner.isUser) this.owner.think = Math.min(this.owner.think, 0.04);
        break;
      case 'tackle':
        c.tackle = { slide: !!cmd.slide };
        break;
      default:
        break;
    }
  }

  canKick(): boolean {
    const s = this.state;
    if (s.phase === 'ended' || s.phase === 'outcome' || s.phase === 'intro') return false;
    if (this.drill && this.drill.kicked) return false;
    const u = this.user;
    if (u.stun > 0 || u.cool > 0) return false;
    if (this.owner === u) return true;
    if (this.owner) return false;
    return this.reach(u).ok;
  }

  predictKick(params: KickParams, maxTime = 3): Vec3[] {
    const p = this.sanitize(params);
    const b = this.state.ball;
    const u = this.user;
    const kind = this.owner === u ? 'ground' : this.reach(u).kind;
    const spec = this.kickSpec(u, p, kind, null);
    const ball = launched(b.pos, p, this.kicker(u), spec);
    const path = predictPath(ball, this.env, clamp(Number.isFinite(maxTime) ? maxTime : 3, 0.1, 6), 4, 1, this.aux);
    return path.map((q) => ({ x: q.x, y: q.y, z: q.z }));
  }

  // ───────────────────────── kick plumbing ─────────────────────────

  kicker(a: Agent): Kicker {
    return { attrs: a.a, foot: a.spec.foot, weakFoot: a.spec.weakFoot, stamina: a.st.stamina };
  }

  sanitize(p: KickParams): KickParams {
    const dx = Number.isFinite(p?.dir?.x) ? p.dir.x : 1;
    const dy = Number.isFinite(p?.dir?.y) ? p.dir.y : 0;
    const l = hyp(dx, dy) || 1;
    return {
      dir: { x: dx / l, y: dy / l },
      power: clamp(Number.isFinite(p?.power) ? p.power : 0.5, 0, 1),
      loft: clamp(Number.isFinite(p?.loft) ? p.loft : 0, 0, 1),
      curl: clamp(Number.isFinite(p?.curl) ? p.curl : 0, -1, 1),
    };
  }

  /** Does this kick head for goal (decides shot vs pass speed model and stats)? */
  isShotKick(a: Agent, p: KickParams, kind: KickKind): boolean {
    const b = this.state.ball.pos;
    const dir = a.dir;
    const gx = dir * HL;
    const dx = gx - b.x;
    if (dx * dir <= 0.3 || p.dir.x * dir <= 0.12) return false;
    const d = hyp(dx, b.y);
    if (d > 40) return false;
    if (kind === 'header') return d < 18 && Math.abs(b.y + p.dir.y * (dx / p.dir.x)) < GW + 4;
    if (p.power < 0.3 && d > 16) return false;
    if (Math.abs(p.dir.y) > 0.8 && d > 14) return false;
    const yAt = b.y + p.dir.y * (dx / p.dir.x);
    if (Math.abs(yAt) < GW + 6) return true;
    if (Math.abs(p.curl) < 0.2 || d > 36) return false;
    // a curler aimed outside the post: judge by where it actually bends to
    const spec: KickSpec = { kind, isShot: true, pressure: 0, difficulty: 0.5 };
    const path = predictPath(launched(b, p, this.kicker(a), spec), this.env, 2.5, 4);
    const hit = crossPlane(path, gx);
    return !!hit && Math.abs(hit.y) < GW + 2.5 && hit.z < GH + 2;
  }

  kickSpec(a: Agent, p: KickParams, kind: KickKind, isShot: boolean | null): KickSpec {
    const shot = isShot ?? this.isShotKick(a, p, kind);
    const pressure = this.setPiece === 'penalty' && this.frozen ? 0.35 * this.setup.importance : this.pressureOn(a);
    // a dead ball is struck in your own time
    const calm = this.frozen && this.setPiece !== null && this.setPiece !== 'penalty' ? 0.8 : 1;
    return {
      kind, isShot: shot, pressure, difficulty: a.side === 'us' ? clamp(this.setup.difficulty, 0, 1) : 0.5,
      extraNoise: a.noise * calm,
    };
  }

  /** 0..1 pressure from the nearest opponent. */
  pressureOn(a: Agent): number {
    let best = 99;
    for (const o of this.agents) {
      if (o.side === a.side || o.passive) continue;
      const d = hyp(o.st.pos.x - a.st.pos.x, o.st.pos.y - a.st.pos.y);
      if (d < best) best = d;
    }
    return clamp((4 - best) / 3.4, 0, 1);
  }

  nearestOpp(a: Agent, p: Vec2 = a.st.pos): { o: Agent | null; d: number } {
    let o: Agent | null = null;
    let best = Infinity;
    for (const x of this.agents) {
      if (x.side === a.side || x.passive) continue;
      const d = hyp(x.st.pos.x - p.x, x.st.pos.y - p.y);
      if (d < best) { best = d; o = x; }
    }
    return { o, d: best };
  }

  headReach(a: Agent): number {
    const h = clamp((a.spec.appearance?.height ?? 180) / 100, 1.6, 2.05);
    return h + 0.15 + 0.65 * (clamp(a.a.jumping, 1, 99) / 99);
  }

  /** Can agent `a` strike the loose ball right now, and with what technique? */
  reach(a: Agent): Reach {
    const b = this.state.ball;
    if (this.owner === a) return { ok: true, kind: 'ground' };
    if (this.owner) return { ok: false, kind: 'ground' };
    // casual play: the user's one-touch reach is a little more forgiving
    const d = hyp(b.pos.x - a.st.pos.x, b.pos.y - a.st.pos.y) - (a.isUser ? 0.3 * this.ease : 0);
    const z = b.pos.z;
    if (z <= 0.45 && d <= 1.0) return { ok: true, kind: 'ground' };
    if (z < 1.25 && d <= 1.1) return { ok: true, kind: 'volley' };
    if (z < 1.4 && d <= 0.8) return { ok: true, kind: 'volley' };
    if (z >= 1.4 && z <= this.headReach(a) + (a.isUser ? 0.15 * this.ease : 0) && d <= 0.95) return { ok: true, kind: 'header' };
    return { ok: false, kind: z > 1.4 ? 'header' : z > 0.45 ? 'volley' : 'ground' };
  }

  /** Strike the ball (any agent). Returns the kick record. */
  execKick(a: Agent, raw: KickParams, opts: { kind?: KickKind; isShot?: boolean; target?: number; setPiece?: boolean; cross?: boolean } = {}): KickRec {
    const s = this.state;
    const b = s.ball;
    const p = this.sanitize(raw);
    const kind = opts.kind ?? (this.owner === a ? 'ground' : this.reach(a).kind);
    const spec = this.kickSpec(a, p, kind, opts.isShot ?? null);
    const L = computeLaunch(p, this.kicker(a), spec, this.rng);
    const from = { x: b.pos.x, y: b.pos.y };
    const wasOwner = this.owner === a;
    const prev = this.lastKick;
    if (prev && prev.isShot && prev.result === 'pending' && prev.side !== a.side) prev.result = a.isGK ? 'saved' : 'blocked';
    if (this.owner) { this.owner.st.hasBall = false; this.owner = null; }
    b.ownerId = null;
    b.lastTouchId = a.id;
    b.lastTouchSide = a.side;
    if (b.pos.z < BR) b.pos.z = BR;
    if (kind === 'ground' && b.pos.z < BR + 0.02 && L.vz <= 0) b.pos.z = BR;
    b.vel.x = L.vx; b.vel.y = L.vy; b.vel.z = L.vz;
    b.spin.x = L.wx; b.spin.y = L.wy; b.spin.z = L.wz;
    if (kind === 'header' && b.pos.z < 1.2) b.pos.z = 1.2;
    this.aux.outReported = false;
    this.touchSeq++;
    a.cool = 0.32;
    a.carryT = 0;
    const anim: AnimState = kind === 'header' ? 'header' : kind === 'volley' ? 'volley' : spec.isShot || p.power > 0.65 ? 'kick' : 'pass';
    this.lockAnim(a, anim);
    if (kind === 'header') a.jump = 0.5;
    a.st.facing = Math.atan2(p.dir.y, p.dir.x);

    const rec: KickRec = {
      id: this.kicks.length, by: a.i, side: a.side, t: s.time, kind, isShot: spec.isShot, target: opts.target ?? -1, from,
      xg: 0, offside: [], dir: a.dir, result: 'pending', onTarget: false, assistBy: -1, setPiece: !!opts.setPiece,
      curl: p.curl, completed: false, oppTouched: false, user: a.isUser, cross: !!opts.cross,
    };
    if (spec.isShot) {
      const path = predictPath(b, this.env, 3, 2);
      const hit = crossPlane(path, a.dir * HL);
      rec.onTarget = !!hit && Math.abs(hit.y) < GW - 0.02 && hit.z < GH - 0.02;
      const blockers = this.blockersInCone(a, from);
      rec.xg = clamp(baseXg(from, a.dir, kind === 'header') * (1 - 0.45 * spec.pressure) * Math.pow(0.8, blockers) * (kind === 'volley' ? 0.8 : 1), 0.005, 0.97);
      if (this.setPiece === 'penalty' && opts.setPiece) rec.xg = 0.76;
      const oneTouch = !wasOwner && !!prev && prev.side === a.side && !prev.isShot && prev.by !== a.i && !prev.oppTouched && s.time - prev.t < 4;
      rec.assistBy = oneTouch && prev ? prev.by : a.receivedFrom >= 0 && s.time - this.receiveTime < 6 ? a.receivedFrom : -1;
    } else {
      rec.offside = this.offsidePlayers(a, from);
      if (rec.target < 0) rec.target = this.guessReceiver(a, p);
      rec.cross = rec.cross || (p.loft > 0.25 && inBox({ x: a.dir * (HL - 8), y: 0 }, a.dir) && Math.abs(from.y) > 12 && from.x * a.dir > 25);
    }
    this.kicks.push(rec);
    this.lastKick = rec;
    this.emit({ t: 'kick', by: a.id, speed: Math.round(L.speed * 10) / 10, shot: spec.isShot });
    if (spec.isShot) {
      this.emit({ t: 'shot', by: a.id, onTarget: rec.onTarget, xg: Math.round(rec.xg * 100) / 100 });
      this.emit({ t: 'crowd', level: clamp(0.55 + rec.xg, 0, 1) });
    }
    if (kind === 'header') this.emit({ t: 'header', by: a.id });

    if (a.isUser) this.onUserKick(rec, p, spec);
    if (this.frozen) {
      this.frozen = false;
      for (const w of this.agents) if (w.wall) { w.jump = 0.55 + 0.1 * this.rng.next(); this.lockAnim(w, 'wall_jump'); }
    }
    return rec;
  }

  private receiveTime = 0;

  private blockersInCone(a: Agent, from: Vec2): number {
    const gx = a.dir * HL;
    let n = 0;
    for (const o of this.agents) {
      if (o.side === a.side || o.isGK) continue;
      const { d, s } = segDist(o.st.pos.x, o.st.pos.y, from.x, from.y, gx, 0);
      if (s > 0.02 && s < 0.98 && d < 1.2 + 2.6 * s) n++;
    }
    return n;
  }

  /** Second-last defender's x for the side defending against attackers of `side` (in world x). */
  offsideX(side: Side): number {
    const dir = side === 'us' ? 1 : -1;
    const xs: number[] = [];
    for (const o of this.agents) if (o.side !== side && !o.passive) xs.push(o.st.pos.x * dir);
    xs.sort((p, q) => q - p);
    const second = xs.length >= 2 ? xs[1] : xs.length ? xs[0] : HL;
    return Math.max(second, 0) * dir;
  }

  private offsidePlayers(a: Agent, from: Vec2): number[] {
    if (this.setPiece === 'corner' && this.lastKick === null) return [];
    const line = this.offsideX(a.side) * a.dir;
    const out: number[] = [];
    for (const m of this.agents) {
      if (m.side !== a.side || m === a || m.isGK) continue;
      const u = m.st.pos.x * a.dir;
      if (u > 0 && u > line + 0.25 && u > from.x * a.dir + 0.25) out.push(m.i);
    }
    return out;
  }

  /** Teammate nearest to the noise-free ball path (intended receiver). */
  private guessReceiver(a: Agent, p: KickParams): number {
    const b = this.state.ball.pos;
    let best = -1;
    let bestScore = Infinity;
    for (const m of this.agents) {
      if (m.side !== a.side || m === a) continue;
      const rx = m.st.pos.x - b.x;
      const ry = m.st.pos.y - b.y;
      const along = rx * p.dir.x + ry * p.dir.y;
      if (along < 1) continue;
      const lat = Math.abs(rx * p.dir.y - ry * p.dir.x);
      const score = lat * 1.6 + along * 0.08;
      if (lat < 4 + along * 0.25 && score < bestScore) { bestScore = score; best = m.i; }
    }
    return best;
  }

  // ───────────────────────── user actions ─────────────────────────

  private userKick(raw: KickParams): void {
    if (!raw || typeof raw !== 'object') return;
    if (this.drill?.kicked) return;
    const s = this.state;
    if (s.phase === 'intro') return;
    if (this.canKick()) {
      this.execKick(this.user, raw, { setPiece: this.frozen && this.setPiece !== null });
      return;
    }
    // ball on its way: buffer the strike for a moment (volleys / headers)
    if (!this.owner || this.owner.side !== 'us') {
      this.ctl.pending = { params: this.sanitize(raw), until: s.time + 0.45 };
    }
    this.stopAiming();
  }

  private onUserKick(rec: KickRec, p: KickParams, spec: KickSpec): void {
    const s = this.state;
    const L = this.log;
    L.lastTouchT = s.time;
    this.ctl.pending = null;
    this.ctl.atUntil = s.time + AFTERTOUCH_WINDOW;
    this.ctl.atSpin = 0;
    if (Math.abs(p.curl) > 0.25) L.curlKicks++;
    if (rec.kind === 'header') L.headers++;
    if (rec.isShot) {
      L.shots++;
      if (rec.onTarget) L.shotsOnTarget++;
      if (spec.pressure > 0.4) L.pressuredShots++;
      L.lastShot = rec;
      L.bestXg = Math.max(L.bestXg, rec.xg);
    } else {
      L.passes++;
      // a user clearance while defending
      if (this.attackSide === 'them' && (p.power > 0.55 || p.loft > 0.3)) L.cleared = true;
    }
    if (s.phase !== 'outcome') s.phase = 'flight';
    this.ctl.freeze = false;
    if (this.ctl.aiming) {
      this.ctl.aiming = false;
      this.emit({ t: 'aim', on: false });
    }
    s.timeScale = 1;
    if (this.drill) this.drill.kicked = true;
  }

  private stopAiming(): void {
    const s = this.state;
    this.ctl.freeze = false;
    if (this.ctl.aiming) {
      this.ctl.aiming = false;
      this.emit({ t: 'aim', on: false });
    }
    s.timeScale = 1;
    if (s.phase === 'aiming') s.phase = 'live';
  }

  private aftertouch(spin: number): void {
    const s = this.state;
    if (s.time > this.ctl.atUntil || this.owner || !this.lastKick?.user) return;
    const v = clamp(Number.isFinite(spin) ? spin : 0, -1, 1);
    const cap = maxSpin(this.user.a.curl) * 0.45;
    const add = v * cap * 0.5;
    const next = clamp(this.ctl.atSpin + add, -cap, cap);
    const delta = next - this.ctl.atSpin;
    this.ctl.atSpin = next;
    s.ball.spin.z += delta;
    this.touchSeq++;
  }

  private skip(): void {
    const s = this.state;
    if (s.phase === 'ended') return;
    if (s.outcome) {
      this.endNow();
      return;
    }
    this.skipped = true;
    this.ctl.freeze = false;
    this.ctl.aiming = false;
    const r = buildResult(this, true);
    this.skipResult = r;
    s.outcome = r.outcome;
    s.banner = bannerFor(this, r.outcome);
    s.phase = 'ended';
    s.timeScale = 1;
    this.emit({ t: 'end', outcome: r.outcome });
  }

  // ───────────────────────── tackles & fouls ─────────────────────────

  tryTackle(a: Agent, slide: boolean): void {
    const s = this.state;
    if (a.stun > 0 || a.cool > 0) return;
    const c = this.owner;
    const b = s.ball.pos;
    const d = hyp(b.x - a.st.pos.x, b.y - a.st.pos.y);
    const reach = slide ? 2.4 : 1.35;
    a.cool = slide ? 1.0 : 0.55;
    this.lockAnim(a, slide ? 'slide' : 'tackle');
    if (a.isUser) this.log.tackleAttempts++;
    if (slide) {
      // lunge toward the ball
      const k = Math.min(1.6, d) / (d || 1);
      a.st.vel.x = (b.x - a.st.pos.x) * k * 4;
      a.st.vel.y = (b.y - a.st.pos.y) * k * 4;
    }
    if (!c || c.side === a.side || c.isGK || d > reach) {
      if (!c && !this.owner && d < reach && s.ball.pos.z < 0.6) {
        // poke a loose ball
        this.pokeBall(a);
      }
      if (slide) a.stun = 0.8;
      return;
    }
    // behind the carrier = foul risk
    const fx = Math.cos(c.st.facing);
    const fy = Math.sin(c.st.facing);
    const rx = a.st.pos.x - c.st.pos.x;
    const ry = a.st.pos.y - c.st.pos.y;
    const rl = hyp(rx, ry) || 1;
    const behind = (rx * fx + ry * fy) / rl < -0.35;
    const T = a.a.tackling / 99;
    const D = (c.a.dribbling * 0.65 + c.a.strength * 0.35) / 99;
    const csp = hyp(c.st.vel.x, c.st.vel.y);
    let pWin = 0.46 + 0.62 * (T - D) + (slide ? 0.1 : 0) - (behind ? 0.18 : 0) - (d > 1.0 ? 0.08 : 0) + (csp > 6 ? 0.04 : 0);
    if (a.side === 'them') pWin += 0.16 * (this.setup.difficulty - 0.5) - (c.isUser ? 0.22 : 0.12) * this.ease;
    if (a.isUser) pWin += 0.12 * this.ease;
    if (a.side === 'us' && !a.isUser && this.attackSide === 'them') pWin -= 0.1;
    pWin = clamp(pWin, 0.08, 0.9);
    let pFoul = (behind ? 0.42 : 0.05) + (slide ? 0.1 : 0) + (1 - T) * 0.1;
    const won = this.rng.chance(pWin);
    if (won) pFoul *= 0.35;
    const foul = this.rng.chance(clamp(pFoul, 0, 0.85));
    this.emit({ t: 'tackle', by: a.id, on: c.id, won: won && !foul, foul });
    if (foul) {
      this.onFoul(a, c);
      return;
    }
    if (won) {
      c.stun = 0.35;
      this.lockAnim(c, 'fall');
      if (c.isUser) { this.log.lostBall = true; this.log.lostT = s.time; }
      if (a.isUser) { this.log.tackles++; this.log.wonBallT = s.time; this.log.wonBy = 'tackle'; }
      this.emit({ t: 'crowd', level: 0.5 });
      if (slide) {
        this.pokeBall(a);
      } else {
        this.giveBall(a, false);
      }
    } else {
      a.stun = slide ? 1.0 : 0.4;
      if (a.isUser) { this.log.tackleLost = true; this.log.beaten = true; }
      // carrier skips away
      c.st.vel.x += fx * 1.2;
      c.st.vel.y += fy * 1.2;
    }
  }

  private pokeBall(a: Agent): void {
    const b = this.state.ball;
    if (this.owner) { this.owner.st.hasBall = false; this.owner = null; }
    const ang = a.st.facing + this.rng.normal(0, 0.5);
    const sp = 3.5 + 3 * this.rng.next();
    b.vel.x = Math.cos(ang) * sp; b.vel.y = Math.sin(ang) * sp; b.vel.z = 0.6;
    b.pos.z = Math.max(b.pos.z, BR + 0.01);
    b.ownerId = null;
    b.lastTouchId = a.id;
    b.lastTouchSide = a.side;
    if (this.lastKick && this.lastKick.side !== a.side) this.lastKick.oppTouched = true;
    this.touchSeq++;
    a.cool = 0.25;
  }

  onFoul(fouler: Agent, victim: Agent): void {
    const s = this.state;
    const spot = { x: s.ball.pos.x, y: s.ball.pos.y };
    this.emit({ t: 'whistle', kind: 'foul' });
    this.emit({ t: 'crowd', level: 0.45 });
    this.lockAnim(victim, 'fall');
    victim.stun = 0.9;
    if (this.owner) { this.owner.st.hasBall = false; this.owner = null; }
    s.ball.vel.x *= 0.2; s.ball.vel.y *= 0.2; s.ball.vel.z = 0;
    if (fouler.isUser) this.log.foulsConceded++;
    if (victim.isUser) this.log.foulsWon++;
    if (victim.side === 'us') {
      if (inBox(spot, 1)) {
        this.followUp = { type: 'penalty', spot: { x: HL - 11, y: 0 } };
        this.finish('penalty_won', 2.0, t('engine.banner.penalty'));
      } else {
        if (spot.x > 12) this.followUp = { type: 'free_kick', spot: { x: clamp(spot.x, 0, HL - 17), y: clamp(spot.y, -HW + 1, HW - 1) } };
        this.finish(this.attackSide === 'us' ? 'foul_won' : classify(this, 'foul_us'), 1.6, t('engine.banner.foul'));
      }
    } else if (fouler.isUser) {
      this.finish('foul_conceded', 1.6, inBox(spot, -1) ? t('engine.banner.penalty') : t('engine.banner.foul'));
    } else {
      this.finish(classify(this, 'foul_them'), 1.6, t('engine.banner.foul'));
    }
  }

  // ───────────────────────── possession ─────────────────────────

  giveBall(a: Agent, fromReceive: boolean): void {
    const s = this.state;
    const b = s.ball;
    const prev = b.lastTouchSide;
    if (this.owner && this.owner !== a) this.owner.st.hasBall = false;
    this.owner = a;
    a.st.hasBall = true;
    a.touch = 0.6;
    a.carryT = 0;
    b.ownerId = a.id;
    b.lastTouchId = a.id;
    b.lastTouchSide = a.side;
    b.vel.x = a.st.vel.x; b.vel.y = a.st.vel.y; b.vel.z = 0;
    b.pos.z = BR;
    b.spin.x = 0; b.spin.y = 0; b.spin.z = 0;
    this.touchSeq++;
    const k = this.lastKick;
    const fromMate = !!k && k.side === a.side && k.by !== a.i && !k.isShot && !k.completed;
    a.receivedFrom = fromMate && k ? k.by : -1;
    if (fromReceive) this.receiveTime = s.time;
    if (fromReceive && !a.isUser && a.side === this.user.side) {
      // one touch to set it, then decide (a one-two is played off that touch)
      a.think = (a.receivedFrom === this.user.i ? 0.1 : 0.16) + 0.02 * (a.i % 3);
    }
    if (fromReceive && a.isUser && this.ctl.dir) {
      // directional first touch: the ball (and he) go the way he is steering — a touch-and-go
      // turns his run by up to ~90° at once (the sharper the turn, the more speed it costs)
      const want = Math.atan2(this.ctl.dir.y, this.ctl.dir.x);
      const v = a.st.vel;
      const sp = hyp(v.x, v.y);
      if (sp > 0.5) {
        const cur = Math.atan2(v.y, v.x);
        let d = want - cur;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const ang = cur + clamp(d, -1.6, 1.6);
        const keep = clamp(1 - Math.abs(d) * 0.2, 0.62, 0.96);
        v.x = Math.cos(ang) * sp * keep;
        v.y = Math.sin(ang) * sp * keep;
        b.vel.x = v.x; b.vel.y = v.y;
      }
      a.st.facing = want;
      a.touch = 0;
    }
    if (this.possession !== a.side) { this.possession = a.side; this.possSince = s.time; }
    if (k && k.side !== a.side) {
      k.oppTouched = true;
      if (k.isShot && k.result === 'pending') k.result = a.isGK ? 'saved' : 'blocked';
    }
    if (fromReceive) this.emit({ t: 'receive', by: a.id, from: fromMate && k ? this.agents[k.by].id : null, side: a.side });
    if (a.isUser) {
      this.log.lastTouchT = s.time;
      if (fromReceive) this.log.controls++;
      if (k && k.side !== a.side && !k.isShot && fromReceive && s.time - k.t < 4) {
        this.log.interceptions++;
        if (this.log.wonBallT < 0) { this.log.wonBallT = s.time; this.log.wonBy = 'interception'; }
      }
    }
    if (fromMate && k) {
      k.completed = true;
      if (k.user) {
        this.log.passesCompleted++;
        this.log.lastTouchT = Math.max(this.log.lastTouchT, k.t);
      }
      // offside judged at pass time
      if (!k.oppTouched && k.offside.includes(a.i)) {
        this.emit({ t: 'whistle', kind: 'offside' });
        this.emit({ t: 'offside', player: a.id });
        this.finish(a.isUser || k.user ? 'offside' : classify(this, 'offside'), 1.5, t('engine.banner.offside'));
        return;
      }
    }
    if (k && k.user && !k.isShot && k.side !== a.side && this.attackSide === 'us' && !a.isGK) {
      this.log.lostT = s.time;
    }
    if (a.side === this.attackSide && prev !== a.side && a.isGK && a.side === 'us') { /* keeper starts a move */ }
  }

  /** First touch of a loose ball: clean control or a miscontrol bounce. */
  private control(a: Agent): void {
    const s = this.state;
    const b = s.ball;
    const rvx = b.vel.x - a.st.vel.x;
    const rvy = b.vel.y - a.st.vel.y;
    const vr = hyp(hyp(rvx, rvy), b.vel.z * 0.6);
    const ft = clamp(a.a.firstTouch, 1, 99) / 99;
    const pr = this.pressureOn(a);
    const diff = Math.max(0, vr - 4.5) / (9 + 17 * ft) + (b.pos.z > 0.6 ? 0.18 : 0) + pr * 0.12 * (1.2 - ft) + (a.side === 'them' ? 0.05 * (0.5 - this.setup.difficulty) : 0) - (a.isUser ? 0.1 + 0.16 * this.ease : 0)
      // team-mates meeting the user's pass at speed: a cleaner first touch
      - (a.side === 'us' && !a.isUser && this.lastKick?.user && !this.lastKick.isShot ? 0.12 + 0.2 * this.ease : 0)
      // ...and the user cushions team-mates' passes more easily on easy / normal
      - (a.isUser && this.lastKick && this.lastKick.side === a.side && this.lastKick.by !== a.i && !this.lastKick.isShot ? 0.06 + 0.12 * this.ease : 0);
    const pClean = clamp(1.03 - diff, 0.1, 0.99);
    if (this.rng.chance(pClean)) {
      this.giveBall(a, true);
      return;
    }
    // miscontrol: the ball squirms away
    const ang = Math.atan2(b.vel.y, b.vel.x) + this.rng.normal(0, 0.9);
    const sp = 1.5 + vr * 0.22 + this.rng.next() * 1.5;
    b.vel.x = b.vel.x * 0.25 + Math.cos(ang) * sp;
    b.vel.y = b.vel.y * 0.25 + Math.sin(ang) * sp;
    b.vel.z = b.pos.z > 0.4 ? -0.5 : 0.8;
    b.spin.z *= 0.2;
    b.lastTouchId = a.id;
    b.lastTouchSide = a.side;
    if (this.lastKick && this.lastKick.side !== a.side) this.lastKick.oppTouched = true;
    this.touchSeq++;
    a.cool = 0.35;
  }

  // ───────────────────────── the loop ─────────────────────────

  private tick(): void {
    const s = this.state;
    s.time += DT;
    this.tickNo++;
    if (s.phase === 'intro' && s.time >= this.introEnd) {
      s.phase = this.ctl.aiming ? 'aiming' : 'live';
      this.emit({ t: 'whistle', kind: 'start' });
    }
    const live = s.phase !== 'intro';
    const over = s.phase === 'outcome';
    if (!over) this.playClock += DT * (this.frozen ? 0.5 : 1);
    this.log.idle += DT;

    if (live && !over) {
      scriptTick(this);
      if (this.drill) drillTick(this);
    }
    if (live && !this.frozen) {
      if (this.tickNo % 12 === 0 || this.loosePath === null) aiUpdate(this);
      const o = this.owner;
      if (o && !o.isUser && !o.isGK && !over) {
        o.think -= DT;
        if (o.think <= 0) carrierThink(this, o);
      }
    }
    this.updateUser(live && !over);
    for (const a of this.agents) {
      if (a.cool > 0) a.cool -= DT;
      if (a.jump > 0) a.jump -= DT;
      if (a.animLock > 0) a.animLock -= DT;
      if (a.runT > 0) a.runT -= DT;
      if (a.keeper) keeperTick(this, a, live);
    }
    this.moveAgents(live);
    this.ballStep();
    if (!over) this.interactions();
    if (!over && !this.drill) this.watchdogs();
    if (over && s.time >= this.endAt) this.endNow();
    if (this.tickNo % 6 === 0) this.updateOffsideLine();
    if (this.tickNo % Math.round(120 / REPLAY_HZ) === 0) this.recordReplay();
  }

  private updateUser(active: boolean): void {
    const u = this.user;
    const c = this.ctl;
    const st = u.st;
    if (this.frozen || u.passive) {
      u.target = { x: st.pos.x, y: st.pos.y };
      u.urgency = 0;
      return;
    }
    if (c.dir) {
      u.target = { x: st.pos.x + c.dir.x * 6, y: st.pos.y + c.dir.y * 6 };
      u.urgency = c.sprint ? 1 : 0.78;
      // a pass is coming to him: meet it in his stride (unless he is clearly steering elsewhere)
      const meet = this.passForUser() ? this.meetPoint(c.dir) : null;
      if (meet) {
        u.target = { x: meet.x, y: meet.y };
        u.urgency = meet.urg;
      }
    } else if (c.target) {
      u.target = { x: c.target.x, y: c.target.y };
      u.urgency = c.sprint ? 1 : 0.78;
      if (hyp(c.target.x - st.pos.x, c.target.y - st.pos.y) < 0.25) c.target = null;
    } else {
      // no input: run onto a team-mate's pass / cross meant for him (casual-play assist)
      if (this.passForUser() && u.eitPoint && u.eit < 4) {
        u.target = { x: u.eitPoint.x, y: u.eitPoint.y };
        u.urgency = 0.9;
      } else {
        u.target = { x: st.pos.x, y: st.pos.y };
        u.urgency = 0;
      }
    }
    if (c.sprint && hyp(st.vel.x, st.vel.y) > 0.75 * u.topSpeed) this.log.sprintTime += DT;
    if (!active) return;
    if (this.owner === u) {
      this.log.carryTime += DT;
      this.trackDribbles();
    }
    if (c.pending) {
      if (this.state.time > c.pending.until || this.owner?.side === 'them') c.pending = null;
      else if (this.canKick()) {
        const p = c.pending.params;
        c.pending = null;
        this.execKick(u, p);
      }
    }
    if (c.tackle) {
      const req = c.tackle;
      c.tackle = null;
      this.tryTackle(u, req.slide);
    }
  }

  /** A team-mate's pass meant for the user is on its way (nobody else has touched it). */
  passForUser(): boolean {
    const k = this.lastKick;
    const u = this.user;
    return !this.owner && !!k && k.side === u.side && k.by !== u.i && k.target === u.i && !k.completed && !k.oppTouched
      && !k.isShot && this.state.time - k.t < 3.5;
  }

  /**
   * Where the user, steering `dir`, meets the pass on its way to him (a reachable point of the
   * cached ball path within ~80° of his steering): in full flight the point he reaches at his
   * running speed together with the ball, run through so he takes it in stride; from a
   * standstill the earliest one. Null when the ball is out of reach that way (he is steering elsewhere).
   */
  private meetPoint(dir: Vec2): { x: number; y: number; urg: number } | null {
    const u = this.user;
    const p = u.st.pos;
    const path = this.ballPath();
    // the cached path may be up to 0.25 s old: its times run from when it was predicted
    const age = this.loosePath ? Math.max(0, this.state.time - this.loosePath.t) : 0;
    const v = u.topSpeed * (this.ctl.sprint ? 1 : 0.9) * (0.78 + 0.22 * u.st.stamina);
    const slack = 0.06 + 0.12 * this.ease;
    const sp = hyp(u.st.vel.x, u.st.vel.y);
    // in full flight he takes it on his running line; from a standstill he goes to meet it early
    const stride = sp > 2.4 && u.st.vel.x * dir.x + u.st.vel.y * dir.y > 0.6 * sp;
    const start = sp < 2 ? 0.2 : 0.05;
    let best: PathSample | null = null;
    let bestV = Infinity;
    let bestT = 0;
    for (let i = 1; i < path.length; i++) {
      const q = path[i];
      const qt = q.t - age;
      if (q.z > 1.3 || qt <= 0) continue;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = hyp(dx, dy);
      if (start + Math.max(0, d - 0.6) / v > qt + slack) continue;
      const cos = d < 1.5 ? 1 : (dx * dir.x + dy * dir.y) / d;
      if (cos < (stride ? 0.17 : 0.34)) continue;
      const lat = Math.abs(dx * dir.y - dy * dir.x);
      // in full flight: where he gets to at his running speed just as the ball does (no braking);
      // from a standstill: the first moment he can get to it
      const score = stride ? Math.abs(qt - d / Math.max(sp, 3)) * 2 + qt * 0.15 + lat * 0.1 : qt + lat * 0.06;
      if (score < bestV) { bestV = score; best = q; bestT = qt; }
    }
    if (!best) return null;
    const dx = best.x - p.x;
    const dy = best.y - p.y;
    const d = hyp(dx, dy);
    if (!stride || d < 0.6) return { x: best.x + dir.x * 0.8, y: best.y + dir.y * 0.8, urg: this.ctl.sprint ? 1 : 0.9 };
    // timed run: through the meeting point at the speed that gets him there with the ball
    const want = d / Math.max(0.05, bestT) / (u.topSpeed * (0.78 + 0.22 * u.st.stamina));
    return { x: best.x + (dx / d) * 4.5, y: best.y + (dy / d) * 4.5, urg: clamp(want, 0.55, this.ctl.sprint ? 1 : 0.95) };
  }

  private trackDribbles(): void {
    const u = this.user;
    const t0 = this.state.time;
    for (const o of this.agents) {
      if (o.side === u.side || o.isGK || o.passive) continue;
      const rx = (o.st.pos.x - u.st.pos.x) * u.dir;
      const d = hyp(o.st.pos.x - u.st.pos.x, o.st.pos.y - u.st.pos.y);
      const seen = this.engaged.get(o.i);
      if (seen === undefined) {
        if (d < 2.2 && rx > 0.2) this.engaged.set(o.i, t0);
      } else if (seen >= 0 && rx < -1.2 && d < 5) {
        this.engaged.set(o.i, -1);
        this.log.dribbles++;
      }
    }
  }

  private moveAgents(live: boolean): void {
    const A = this.agents;
    const n = A.length;
    for (let i = 0; i < n; i++) {
      const a = A[i];
      const st = a.st;
      if (a.passive) { st.vel.x = 0; st.vel.y = 0; this.animate(a, 0); continue; }
      if (a.keeper && (a.keeper.mode === 'dive' || a.keeper.mode === 'down')) {
        st.pos.x += st.vel.x * DT;
        st.pos.y += st.vel.y * DT;
        continue;
      }
      if (a.stun > 0 || !live || (this.frozen && !a.isGK)) {
        if (a.stun > 0) a.stun -= DT;
        const k = Math.exp(-7 * DT);
        st.vel.x *= k; st.vel.y *= k;
        st.pos.x += st.vel.x * DT;
        st.pos.y += st.vel.y * DT;
        this.animate(a, hyp(st.vel.x, st.vel.y));
        continue;
      }
      const tx = a.target.x - st.pos.x;
      const ty = a.target.y - st.pos.y;
      const d = hyp(tx, ty);
      const fatigue = 0.78 + 0.22 * st.stamina;
      const sprinting = a.urgency >= 0.97;
      let vmax = a.topSpeed * clamp(a.urgency, 0, 1) * fatigue;
      if (this.owner === a) vmax *= 0.83 + 0.13 * (a.a.dribbling / 99);
      let dvx = 0;
      let dvy = 0;
      // AI hysteresis: once a player has arrived he stands until his (re-planned) spot drifts away,
      // instead of shuffling back and forth around it every re-plan
      let go = d > 0.08;
      if (!a.isUser && a.urgency < 0.95) {
        if (a.settled) go = d > 0.9;
        a.settled = !go || d < 0.35;
        if (a.settled && d < 0.35) go = false;
      } else a.settled = false;
      if (go) {
        const sp = Math.min(vmax, Math.sqrt(2 * 5 * Math.max(0, d - 0.05)));
        dvx = (tx / d) * sp;
        dvy = (ty / d) * sp;
      }
      // separation
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const o = A[j].st;
        const ox = st.pos.x - o.pos.x;
        if (ox > 0.9 || ox < -0.9) continue;
        const oy = st.pos.y - o.pos.y;
        if (oy > 0.9 || oy < -0.9) continue;
        const od = hyp(ox, oy);
        if (od < 0.9 && od > 1e-4) {
          const push = (0.9 - od) * 3.2;
          dvx += (ox / od) * push;
          dvy += (oy / od) * push;
        }
      }
      let ax = dvx - st.vel.x;
      let ay = dvy - st.vel.y;
      const am = hyp(ax, ay);
      const braking = ax * st.vel.x + ay * st.vel.y < 0;
      // the user's player answers the controls quickly (no sluggish starts / turns)
      const lim = a.accel * (braking ? 1.7 : 1) * DT * (a.isUser ? 1.55 + 0.6 * this.ease : 1);
      if (am > lim) { ax *= lim / am; ay *= lim / am; }
      st.vel.x += ax;
      st.vel.y += ay;
      st.pos.x = clamp(st.pos.x + st.vel.x * DT, -HL - 4, HL + 4);
      st.pos.y = clamp(st.pos.y + st.vel.y * DT, -HW - 4, HW + 4);
      const sp = hyp(st.vel.x, st.vel.y);
      if (sp > 0.35 && !(a.isGK && sp < 5)) {
        // turn with a max rate (no one-frame flips when the velocity swings at low speed)
        const rate = a.isUser ? 16 : sp > 2.5 ? 10 : 5;
        st.facing = turnToward(st.facing, Math.atan2(st.vel.y, st.vel.x), rate * DT);
      } else if (this.owner !== a) {
        // idle players watch the ball
        const b = this.state.ball.pos;
        const want = Math.atan2(b.y - st.pos.y, b.x - st.pos.x);
        st.facing = turnToward(st.facing, want, 4 * DT);
      }
      // stamina
      if (sprinting && sp > 0.7 * a.topSpeed) {
        st.stamina = Math.max(0.05, st.stamina - DT * 0.022 * (1.45 - a.a.stamina / 99));
      } else if (sp < 0.5 * a.topSpeed) {
        st.stamina = Math.min(1, st.stamina + DT * 0.006);
      }
      this.animate(a, sp);
    }
  }

  lockAnim(a: Agent, anim: AnimState, dur?: number): void {
    a.st.anim = anim;
    a.st.animTime = 0;
    a.animLock = dur ?? ONE_SHOT_ANIMS[anim] ?? 0.4;
  }

  private animate(a: Agent, sp: number): void {
    const st = a.st;
    st.animTime += DT;
    if (a.animLock > 0) return;
    let next: AnimState;
    if (this.state.phase === 'outcome' && this.celebrating(a)) next = 'celebrate';
    else if (a.isGK && sp < 1.5) next = 'gk_ready';
    else if (sp < 0.35) next = 'idle';
    else if (this.owner === a) next = 'dribble';
    else if (sp > 0.72 * a.topSpeed) next = 'sprint';
    else next = 'run';
    if (next !== st.anim) { st.anim = next; st.animTime = 0; }
  }

  private celebrating(a: Agent): boolean {
    if (this.goalFor) return a.side === 'us' && !a.isGK && hyp(a.st.pos.x - HL, a.st.pos.y) < 40;
    if (this.goalAgainst) return a.side === 'them' && !a.isGK && hyp(a.st.pos.x + HL, a.st.pos.y) < 40;
    return false;
  }

  private dribble(a: Agent): void {
    const b = this.state.ball;
    const st = a.st;
    if (a.isGK && a.keeper?.mode === 'hold') {
      b.pos.x = st.pos.x + Math.cos(st.facing) * 0.35;
      b.pos.y = st.pos.y + Math.sin(st.facing) * 0.35;
      b.pos.z = 1.05;
      b.vel.x = st.vel.x; b.vel.y = st.vel.y; b.vel.z = 0;
      b.spin.x = 0; b.spin.y = 0; b.spin.z = 0;
      return;
    }
    const sp = hyp(st.vel.x, st.vel.y);
    a.carryT += DT;
    a.touch += DT / a.touchPeriod;
    if (a.touch >= 1) {
      a.touch -= 1;
      a.touchPeriod = clamp(0.62 - sp * 0.042, 0.3, 0.62);
      if (sp > 2.5) {
        const drib = clamp(a.a.dribbling, 1, 99) / 99;
        const pr = this.pressureOn(a);
        const pHeavy = (Math.max(0, sp / a.topSpeed - 0.62) * (1 - drib) * 1.1 + pr * 0.05 * (1 - drib)) * (a.isUser ? 1 - 0.95 * this.ease : 1);
        if (this.rng.chance(pHeavy)) {
          // heavy touch: the ball runs away from him
          const fx = Math.cos(st.facing);
          const fy = Math.sin(st.facing);
          const v = sp + (a.isUser ? 1.2 + 1.4 * (1 - this.ease) : 2.6) + 2.2 * this.rng.next() * (a.isUser ? 0.6 : 1);
          st.hasBall = false;
          this.owner = null;
          b.ownerId = null;
          b.vel.x = fx * v + this.rng.normal(0, 0.8);
          b.vel.y = fy * v + this.rng.normal(0, 0.8);
          b.vel.z = 0;
          a.cool = 0.25;
          this.touchSeq++;
          return;
        }
      }
    }
    const fx = Math.cos(st.facing);
    const fy = Math.sin(st.facing);
    // soft touches: after each touch the ball rolls a little ahead and the runner catches it up
    // (continuous offset, no dart forward at the touch)
    const push = 0.05 + 0.05 * sp;
    const lead = 0.38 + push * Math.sin(Math.PI * clamp(a.touch, 0, 1));
    const tx = st.pos.x + fx * lead;
    const ty = st.pos.y + fy * lead;
    const k = 1 - Math.exp(-16 * DT);
    const nx = b.pos.x + (tx - b.pos.x) * k;
    const ny = b.pos.y + (ty - b.pos.y) * k;
    b.vel.x = (nx - b.pos.x) / DT;
    b.vel.y = (ny - b.pos.y) / DT;
    b.vel.z = 0;
    b.pos.x = nx;
    b.pos.y = ny;
    b.pos.z = BR;
    b.spin.x = -b.vel.y / BR;
    b.spin.y = b.vel.x / BR;
    b.spin.z = 0;
  }

  private ballStep(): void {
    const s = this.state;
    const b = s.ball;
    if (this.owner) {
      this.dribble(this.owner);
      if (this.owner && this.owner.isUser && hyp(b.pos.x - this.user.st.pos.x, b.pos.y - this.user.st.pos.y) > 3) {
        this.owner.st.hasBall = false;
        this.owner = null;
        b.ownerId = null;
      }
      this.edgeOfPitch();
      return;
    }
    const rep = this.rep;
    resetReport(rep);
    integrateBall(b, this.aux, this.env, DT, rep);
    if (rep.bounce > 1.6 && s.time - this.lastBounceT > 0.12) {
      this.lastBounceT = s.time;
      this.emit({ t: 'bounce', speed: Math.round(rep.bounce * 10) / 10 });
    }
    if (rep.woodwork) {
      this.touchSeq++;
      this.emit({ t: 'woodwork', part: rep.woodwork === 1 ? 'post' : 'bar' });
      this.emit({ t: 'crowd', level: 0.9 });
      const k = this.lastKick;
      if (k && k.isShot && (k.result === 'pending' || k.result === 'saved')) k.result = 'woodwork';
      if (k?.user && k.isShot) this.log.woodwork = true;
      this.highlight = true;
      if (!s.banner) s.banner = t(rep.woodwork === 1 ? 'engine.banner.post' : 'engine.banner.bar');
    }
    if (rep.goal) this.onGoal(rep.goal);
    if (rep.net) this.emit({ t: 'net' });
    if (rep.out && !rep.goal) this.onOut(rep.out, rep.outEnd);
  }

  /** Owned ball leaving the pitch (dribbled out). */
  private edgeOfPitch(): void {
    const b = this.state.ball.pos;
    if (Math.abs(b.y) > HW + BR || Math.abs(b.x) > HL + BR) {
      const o = this.owner;
      if (o) { o.st.hasBall = false; this.owner = null; this.state.ball.ownerId = null; }
      if (!this.aux.outReported) {
        this.aux.outReported = true;
        this.onOut(Math.abs(b.y) > HW + BR ? 1 : 2, b.x > 0 ? 1 : -1);
      }
    }
  }

  private onGoal(g: 1 | -1): void {
    const s = this.state;
    const b = s.ball;
    const forUs = g === 1;
    const scoringSide: Side = forUs ? 'us' : 'them';
    const k = this.lastKick;
    let scorer: Agent | null = null;
    if (k && k.side === scoringSide) scorer = this.agents[k.by];
    else if (b.lastTouchId) scorer = this.agents.find((a) => a.id === b.lastTouchId) ?? null;
    if (k && k.isShot) k.result = 'goal';
    const assist = k && k.side === scoringSide && k.assistBy >= 0 ? this.agents[k.assistBy] : null;
    this.scorerId = scorer?.id ?? null;
    this.assistId = assist?.id ?? null;
    if (forUs) this.goalFor = true; else this.goalAgainst = true;
    if (scorer?.isUser && forUs) this.log.goals++;
    if (assist?.isUser && forUs) { this.log.assists++; this.log.keyPasses = Math.max(this.log.keyPasses, 1); }
    this.highlight = this.highlight || forUs || this.attackSide === 'them';
    this.emit({ t: 'goal', scorer: scorer?.id ?? '', assist: assist?.id ?? null, side: scoringSide });
    this.emit({ t: 'crowd', level: forUs ? 1 : 0.3 });
    if (this.drill) return;
    const outcome = classify(this, forUs ? 'goal_for' : 'goal_against');
    this.finish(outcome, 3.0, t(forUs ? 'engine.banner.goal' : 'engine.banner.goalAgainst'));
  }

  private onOut(kind: 1 | 2, end: 0 | 1 | -1): void {
    const s = this.state;
    const b = s.ball;
    let restart: 'goal_kick' | 'corner' | 'throw_in' = 'throw_in';
    if (kind === 2) {
      // which side defends this goal line: +x end is theirs
      const defending: Side = end === 1 ? 'them' : 'us';
      restart = b.lastTouchSide === defending ? 'corner' : 'goal_kick';
    }
    this.emit({ t: 'out', restart });
    const k = this.lastKick;
    if (k && k.isShot && k.result === 'pending') {
      k.result = k.oppTouched ? 'blocked' : 'missed';
      const g = k.dir === 1 ? 1 : -1;
      if (kind === 2 && end === g && (Math.abs(b.pos.y) < GW + 1.6 && b.pos.z < GH + 1.4)) this.emit({ t: 'near_miss', by: this.agents[k.by].id });
    }
    if (restart === 'corner' && end === 1) this.followUp = { type: 'corner', spot: { x: HL, y: b.pos.y >= 0 ? HW : -HW } };
    if (this.drill) return;
    const banner = restart === 'corner' ? 'engine.banner.corner' : restart === 'goal_kick'
      ? (k?.isShot && k.user ? (b.pos.z > GH ? 'engine.banner.over' : 'engine.banner.wide') : 'engine.banner.goalKick')
      : 'engine.banner.throwIn';
    this.finish(classify(this, 'out'), 1.4, t(banner));
  }

  // ───────────────────────── ball contacts ─────────────────────────

  private interactions(): void {
    const s = this.state;
    const b = s.ball;
    if (this.owner) return;
    const z = b.pos.z;
    if (z > 3.2) return;
    const speed = ballSpeed(b);
    const k = this.lastKick;
    let best: Agent | null = null;
    let bestD = Infinity;
    for (const a of this.agents) {
      if (a.isGK && a.keeper) continue; // keepers handle the ball in keeper.ts
      const dx = b.pos.x - a.st.pos.x;
      const dy = b.pos.y - a.st.pos.y;
      if (dx > 2.5 || dx < -2.5 || dy > 2.5 || dy < -2.5) continue;
      const d = hyp(dx, dy);
      // bodies block shots and hard passes (walls jump)
      const top = BODY_H + (a.wall && a.jump > 0 ? 0.45 * Math.sin(Math.PI * clamp(1 - a.jump / 0.6, 0, 1)) : 0);
      const fresh = !!k && s.time - k.t < 0.12 && k.by === a.i;
      if (!fresh && speed > 11 && d < BODY_R + BR && z < top + BR && (!k || k.side !== a.side || a.wall)) {
        this.block(a, dx, dy, d);
        return;
      }
      if (a.cool > 0 || a.stun > 0 || a.passive || a.wall) continue;
      if (fresh) continue;
      // team-mates get out of the way of their own side's shot
      if (!a.isUser && k && k.isShot && k.side === a.side && k.result === 'pending' && s.time - k.t < 2.5) continue;
      if (a.isUser && (this.ctl.aiming || this.ctl.pending)) continue;
      // AI headers / volleys at goal or clearances
      const crossIn = a.side === 'them' && !!k && k.cross && k.side === 'us' && s.time - k.t < 3;
      if (!a.isUser && z > 1.25 && z <= this.headReach(a) && d < 0.85 * (crossIn ? 1 - 0.75 * this.ease : 1) && speed > 4) {
        if (d < bestD) { bestD = d; best = a; }
        continue;
      }
      let reach = z < 0.75 ? 0.78 : z < 1.6 ? 0.5 : 0;
      // casual play: the user gathers passes meant for him a little more surely
      if (a.isUser && k && k.side === a.side && k.target === a.i && !k.isShot) reach *= 1 + 0.3 * this.ease;
      // casual play: opponents cut out fewer of the user's passes
      if (a.side === 'them' && k && k.user && !k.isShot && s.time - k.t < 3) reach *= 1 - 0.62 * this.ease;
      // ...and fewer of the passes played to him
      else if (a.side === 'them' && k && !k.isShot && k.side === this.user.side && k.target === this.user.i && s.time - k.t < 3) reach *= 1 - 0.45 * this.ease;
      if (d < reach && d < bestD) { bestD = d; best = a; }
    }
    if (!best) return;
    if (!best.isUser && b.pos.z > 1.25) {
      // the AI meets an aerial ball: header (shot, clearance or knock-down)
      aiHeader(this, best);
      return;
    }
    this.control(best);
  }

  private block(a: Agent, dx: number, dy: number, d: number): void {
    const b = this.state.ball;
    const nx = d > 1e-4 ? dx / d : -Math.cos(Math.atan2(b.vel.y, b.vel.x));
    const ny = d > 1e-4 ? dy / d : -Math.sin(Math.atan2(b.vel.y, b.vel.x));
    const vn = b.vel.x * nx + b.vel.y * ny;
    const damp = 0.32 + 0.2 * this.rng.next();
    if (vn < 0) { b.vel.x -= 1.6 * vn * nx; b.vel.y -= 1.6 * vn * ny; }
    b.vel.x = b.vel.x * damp + this.rng.normal(0, 1.5);
    b.vel.y = b.vel.y * damp + this.rng.normal(0, 1.5);
    b.vel.z = Math.abs(b.vel.z) * 0.3 + this.rng.float(0.5, 3.5);
    b.spin.x *= 0.2; b.spin.y *= 0.2; b.spin.z *= 0.2;
    b.pos.x = a.st.pos.x + nx * (BODY_R + BR + 0.02);
    b.pos.y = a.st.pos.y + ny * (BODY_R + BR + 0.02);
    b.lastTouchId = a.id;
    b.lastTouchSide = a.side;
    this.touchSeq++;
    const k = this.lastKick;
    if (k && k.side !== a.side) {
      k.oppTouched = true;
      if (k.isShot && k.result === 'pending') k.result = 'blocked';
    }
    if (a.isUser && k && k.side !== a.side) this.log.blocks++;
    a.cool = 0.25;
    this.emit({ t: 'crowd', level: 0.6 });
  }

  // ───────────────────────── flow ─────────────────────────

  /** Decide the outcome now; the moment ends after `delay` seconds of follow-through. */
  finish(outcome: MomentOutcome, delay = 1.6, banner?: string): void {
    const s = this.state;
    if (s.outcome || s.phase === 'ended') return;
    s.outcome = outcome;
    s.phase = 'outcome';
    s.timeScale = 1;
    this.ctl.freeze = false;
    if (this.ctl.aiming) { this.ctl.aiming = false; this.emit({ t: 'aim', on: false }); }
    s.banner = banner ?? bannerFor(this, outcome);
    // short follow-through so the match flows (goal: the ball in the net + a beat)
    this.endAt = s.time + Math.min(delay, outcome === 'goal' || outcome === 'conceded' ? 1.6 : 1.0);
    if (outcome === 'saved' || outcome === 'woodwork') this.highlight = this.highlight || (this.lastKick?.xg ?? 0) > 0.2 || outcome === 'woodwork';
  }

  endNow(): void {
    const s = this.state;
    if (s.phase === 'ended') return;
    const outcome = s.outcome ?? classify(this, 'time');
    s.outcome = outcome;
    s.phase = 'ended';
    s.timeScale = 1;
    this.res = buildResult(this);
    this.emit({ t: 'whistle', kind: 'stop' });
    this.emit({ t: 'end', outcome });
  }

  private watchdogs(): void {
    const s = this.state;
    if (s.phase === 'outcome' || s.phase === 'ended' || s.phase === 'intro') return;
    const k = this.lastKick;
    const shotLive = !!k && k.isShot && k.result === 'pending' && s.time - k.t < 2.6 && !this.owner;
    const limit = this.timeLimitSec();
    if (this.playClock >= limit && !shotLive) {
      const progressed = this.setup.type === 'build_up' && this.owner?.side === 'us' && this.owner.st.pos.x > 2 && this.log.lastTouchT > 0;
      this.finish(progressed ? classify(this, 'progress') : classify(this, 'time'), 1.0, progressed ? undefined : t('engine.banner.time'));
      return;
    }
    if (this.playClock >= limit + 3) {
      this.finish(classify(this, 'time'), 1.2, t('engine.banner.time'));
      return;
    }
    // shots that die out (stop rolling in play, or held by the keeper) are handled by keeper/possession checks
    const o = this.owner;
    if (o) {
      const lostFor = s.time - this.possSince;
      if (o.side !== this.attackSide && !o.isGK && lostFor > (this.attackSide === 'us' ? 1.1 : 0.7)) {
        this.finish(classify(this, 'possession'), 1.3);
        return;
      }
      if (o.isGK && o.side !== this.attackSide && o.keeper?.mode === 'hold' && o.keeper.holdT > 0.35) {
        this.finish(classify(this, 'keeper'), 1.4);
        return;
      }
      // our attack fizzles: the user passed and is no longer involved. Play goes on while we keep
      // the ball (pass, run, call for it again …); only a long spell without the user ends it.
      if (this.attackSide === 'us' && o.side === 'us' && !o.isUser && this.log.passesCompleted > 0) {
        const since = s.time - this.log.lastTouchT;
        const calling = s.time < this.ctl.callUntil + 1.5;
        const near = hyp(o.st.pos.x - this.user.st.pos.x, o.st.pos.y - this.user.st.pos.y) < 22;
        if (since > 22 || (since > 14 && !calling && !near)) { this.finish(classify(this, 'stale'), 1.0); return; }
      }
    } else {
      // loose ball that has stopped dead with nobody near (rare)
      const b = s.ball;
      if (ballSpeed(b) < 0.05 && this.loosePath && s.time - this.lastStillCheck > 4) this.lastStillCheck = s.time;
    }
    // play moved far away from the user
    const u = this.user.st.pos;
    const bp = s.ball.pos;
    if (!this.owner?.isUser && hyp(bp.x - u.x, bp.y - u.y) > 45 && !shotLive && s.time > 3) {
      this.farT += DT;
      if (this.farT > 2.5) this.finish(classify(this, 'stale'), 1.0);
    } else this.farT = 0;
  }

  /** Seconds of play before the moment auto-ends (longer on easier settings). */
  timeLimitSec(): number {
    const base = (this.setup.timeLimit > 0 ? this.setup.timeLimit : 15) * (1 + 0.55 * this.ease);
    // continuous play: an open-play attack keeps going while we have the ball (generous limit)
    return this.attackSide === 'us' && !this.setPiece && !this.drill ? base * 1.45 : base;
  }

  private farT = 0;
  private lastStillCheck = 0;

  updateOffsideLine(): void {
    const s = this.state;
    if (this.setPiece === 'penalty' || this.setPiece === 'corner' || this.attackSide === 'them' || this.drill) {
      s.offsideLineX = null;
      return;
    }
    s.offsideLineX = this.offsideX('us');
  }

  private recordReplay(): void {
    const s = this.state;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const frame: ReplayFrame = {
      t: r2(s.time),
      ball: { x: r2(s.ball.pos.x), y: r2(s.ball.pos.y), z: r2(s.ball.pos.z) },
      players: s.players.map((p) => ({ id: p.id, x: r2(p.pos.x), y: r2(p.pos.y), facing: r2(p.facing), anim: p.anim })),
    };
    if (this.replayBuf.length < REPLAY_FRAMES) this.replayBuf.push(frame);
    else {
      this.replayBuf[this.replayHead] = frame;
      this.replayHead = (this.replayHead + 1) % REPLAY_FRAMES;
    }
  }

  replayFrames(): ReplayFrame[] {
    if (this.replayBuf.length < REPLAY_FRAMES) return this.replayBuf.slice();
    return [...this.replayBuf.slice(this.replayHead), ...this.replayBuf.slice(0, this.replayHead)];
  }

  /** Cached noise-free path of the loose ball (refreshed on contact and every 0.25 s). */
  ballPath(): PathSample[] {
    const s = this.state;
    const c = this.loosePath;
    if (c && c.seq === this.touchSeq && s.time - c.t < 0.25) return c.path;
    const path = this.owner ? [{ t: 0, x: s.ball.pos.x, y: s.ball.pos.y, z: s.ball.pos.z }] : predictPath(s.ball, this.env, 2.6, 4, 1, this.aux);
    this.loosePath = { seq: this.touchSeq, t: s.time, path };
    return path;
  }

  /** Reset positions & ball for a new drill attempt / set piece (used by moments.ts). */
  placeBall(p: Vec3): void {
    const b = this.state.ball;
    b.pos.x = p.x; b.pos.y = p.y; b.pos.z = Math.max(BR, p.z);
    b.vel.x = 0; b.vel.y = 0; b.vel.z = 0;
    b.spin.x = 0; b.spin.y = 0; b.spin.z = 0;
    b.ownerId = null;
    if (this.owner) this.owner.st.hasBall = false;
    this.owner = null;
    this.aux = newAux();
    this.touchSeq++;
  }

  distToGoalOf(a: Agent): number {
    return distToGoal(a.st.pos, a.dir);
  }
}

function turnToward(cur: number, want: number, maxStep: number): number {
  let d = want - cur;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return cur + clamp(d, -maxStep, maxStep);
}

import { aiHeader } from './ai';
