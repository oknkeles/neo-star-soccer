/**
 * A small stand-in MomentEngine for the dev sandbox (the real engine lives in src/match/engine).
 * Simple ball physics with Magnus curl, a pressing defender, a diving keeper, a free-kick wall,
 * dribbling, passes on request, tackles, goals/saves/posts, events and replay frames.
 * Cosmetic dev code: uses Math.random freely.
 */
import type {
  AnimState, ControlCommand, KickParams, MomentEvent, MomentOutcome, MomentPlayerState, MomentResult, MomentSetup, MomentState, ReplayFrame, Vec2, Vec3,
} from '../core/types';
import type { MomentEngine } from '../match/engine/api';

const G = 9.81;
const HL = 52.5;
const GHW = 3.66;
const GH = 2.44;
const DT = 1 / 120;

interface Sim { pos: Vec3; vel: Vec3; spin: Vec3 }

function physicsStep(b: Sim, dt: number, wet: boolean, wind: Vec2): { bounced: number } {
  let bounced = 0;
  const v = b.vel;
  const sp = Math.hypot(v.x, v.y, v.z);
  if (b.pos.z > 0.12 || v.z > 0.1) {
    const k = 0.0105 * sp;
    v.x += (-(v.x - wind.x) * k) * dt;
    v.y += (-(v.y - wind.y) * k) * dt;
    v.z += (-v.z * k - G) * dt;
    // Magnus: + spin.z bends the ball to the LEFT of travel.
    const m = 0.0032 * b.spin.z;
    v.x += -v.y * m * dt;
    v.y += v.x * m * dt;
    b.spin.z *= Math.exp(-dt * 0.25);
  } else {
    const gsp = Math.hypot(v.x, v.y);
    const dec = (wet ? 1.1 : 1.9) * dt;
    if (gsp > dec) { v.x -= (v.x / gsp) * dec; v.y -= (v.y / gsp) * dec; } else { v.x = 0; v.y = 0; }
    const m = 0.0012 * b.spin.z;
    v.x += -v.y * m * dt;
    v.y += v.x * m * dt;
    b.spin.z *= Math.exp(-dt * 2.5);
    v.z = 0;
  }
  b.pos.x += v.x * dt;
  b.pos.y += v.y * dt;
  b.pos.z += v.z * dt;
  if (b.pos.z < 0.11) {
    b.pos.z = 0.11;
    if (v.z < -1.2) { bounced = -v.z; v.z = -v.z * 0.55; v.x *= 0.86; v.y *= 0.86; } else v.z = 0;
  }
  return { bounced };
}

export function kickVelocity(p: KickParams): { vel: Vec3; spin: Vec3 } {
  const speed = 7 + 25 * p.power;
  const elev = p.loft * 0.78;
  const l = Math.hypot(p.dir.x, p.dir.y) || 1;
  return {
    vel: { x: (p.dir.x / l) * speed * Math.cos(elev), y: (p.dir.y / l) * speed * Math.cos(elev), z: speed * Math.sin(elev) + p.loft * 1.5 },
    spin: { x: 0, y: 0, z: p.curl * 55 },
  };
}

const FORMATIONS: Record<'us' | 'them', [number, number][]> = {
  us: [[-50, 0], [-22, -9], [-22, 9], [-12, -24], [-12, 24], [2, -8], [2, 8], [14, 0], [22, -22], [22, 22], [26, 3]],
  them: [[51, 0], [38, -6], [38, 6], [33, -20], [33, 20], [24, 0], [14, -10], [14, 10], [2, -20], [2, 20], [-6, 0]],
};

export function createMockMoment(setup: MomentSetup): MomentEngine {
  const listeners = new Set<(e: MomentEvent) => void>();
  const emit = (e: MomentEvent) => listeners.forEach((l) => l(e));
  const wet = setup.weather.kind === 'rain';
  const wind = setup.weather.wind;
  const type = setup.type;

  const players: MomentPlayerState[] = [];
  const add = (side: 'us' | 'them', i: number, pos: Vec2) => {
    const spec = (side === 'us' ? setup.us : setup.them).players[i];
    if (!spec) return;
    players.push({
      id: spec.id, side, role: spec.role, isUser: spec.id === setup.userId, pos: { ...pos }, vel: { x: 0, y: 0 },
      facing: side === 'us' ? 0 : Math.PI, anim: spec.role === 'GK' ? 'gk_ready' : 'idle', animTime: 0, stamina: 1, hasBall: false,
    });
  };
  for (const side of ['us', 'them'] as const) FORMATIONS[side].forEach((p, i) => add(side, i, { x: p[0], y: p[1] }));
  const user = players.find((p) => p.isUser) ?? players.find((p) => p.side === 'us' && p.role !== 'GK')!;
  user.isUser = true;
  const gk = players.find((p) => p.side === 'them' && p.role === 'GK')!;
  const ball: Sim = { pos: { x: 0, y: 0, z: 0.11 }, vel: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 } };
  let owner: MomentPlayerState | null = null;
  const wall: MomentPlayerState[] = [];

  // Arrange the scene per moment type.
  const setPiece = type === 'free_kick' || type === 'penalty' || type === 'drill_free_kick' || type === 'corner';
  if (type === 'penalty') {
    ball.pos = { x: HL - 11, y: 0, z: 0.11 };
    user.pos = { x: HL - 13.2, y: -1.2 };
    players.forEach((p) => { if (p !== user && p !== gk) p.pos = { x: 30 + Math.random() * 4, y: (Math.random() - 0.5) * 30 }; });
    gk.pos = { x: HL - 0.3, y: 0 };
  } else if (type === 'free_kick' || type === 'drill_free_kick') {
    const spot = setup.spot ?? { x: 27, y: -9 };
    ball.pos = { x: spot.x, y: spot.y, z: 0.11 };
    user.pos = { x: spot.x - 2.4, y: spot.y - 1.4 };
    const goal = { x: HL, y: 0 };
    const dx = goal.x - spot.x;
    const dy = goal.y - spot.y;
    const d = Math.hypot(dx, dy);
    const ux = dx / d;
    const uy = dy / d;
    const wallC = { x: spot.x + ux * 9.15, y: spot.y + uy * 9.15 };
    const defenders = players.filter((p) => p.side === 'them' && p !== gk);
    for (let i = 0; i < 4; i++) {
      const p = defenders[i];
      const off = (i - 1.5) * 0.62 + 0.5;
      p.pos = { x: wallC.x - uy * off, y: wallC.y + ux * off };
      p.facing = Math.atan2(-uy, -ux);
      p.inWall = true;
      wall.push(p);
    }
    defenders.slice(4).forEach((p, i) => { p.pos = { x: 40 + (i % 3) * 3, y: -12 + i * 4 }; });
    players.filter((p) => p.side === 'us' && p !== user && p.role !== 'GK').forEach((p, i) => { p.pos = { x: 38 + (i % 3) * 2.5, y: -14 + i * 3.5 }; });
    gk.pos = { x: HL - 0.8, y: spot.y > 0 ? -0.8 : 0.8 };
  } else if (type === 'defend') {
    const carrier = players.find((p) => p.side === 'them' && p.role !== 'GK' && p.pos.x < 5) ?? players[15];
    carrier.pos = { x: -16, y: 6 };
    user.pos = { x: -26, y: 2 };
    owner = carrier;
  } else {
    if (type === 'one_on_one') {
      user.pos = { x: 30, y: 2 };
      players.filter((p) => p.side === 'them' && p !== gk).forEach((p, i) => { p.pos = { x: 12 - (i % 4) * 4, y: -18 + i * 4 }; });
    }
    owner = user;
  }
  if (owner) { owner.hasBall = true; ball.pos = { x: owner.pos.x + 0.6 * Math.cos(owner.facing), y: owner.pos.y + 0.6 * Math.sin(owner.facing), z: 0.11 }; }

  const state: MomentState = {
    time: 0, timeScale: 1, phase: 'intro',
    ball: { pos: ball.pos, vel: ball.vel, spin: ball.spin, ownerId: owner?.id ?? null, lastTouchId: owner?.id ?? null, lastTouchSide: owner?.side ?? null },
    players, focus: 1, offsideLineX: null, banner: null, outcome: null,
  };

  // Control state.
  let moveTarget: Vec2 | null = null;
  let moveDir: Vec2 = { x: 0, y: 0 };
  let sprint = false;
  let aiming = false;
  let lastKickT = -9;
  let kicked = false;
  let lastKickByUser = false;
  let shotLive = false;
  let gkDive: { at: number; y: number; save: boolean } | null = null;
  let finishedT: number | null = null;
  let endT: number | null = null;
  let outcome: MomentOutcome | null = null;
  let goalFor = false;
  let goalAgainst = false;
  let pressT = 0;
  let passPending: { to: MomentPlayerState; through: boolean; at: number } | null = null;
  let netted = false;
  const replay: ReplayFrame[] = [];
  let recAcc = 0;
  const stats = { shots: 0, shotsOnTarget: 0, passes: 0, passesCompleted: 0, keyPasses: 0, dribbles: 0, tackles: 0, interceptions: 0, foulsWon: 0, foulsConceded: 0, goals: 0, assists: 0 };

  const setAnim = (p: MomentPlayerState, a: AnimState) => { if (p.anim !== a) { p.anim = a; p.animTime = 0; } };
  const finish = (o: MomentOutcome, banner: string | null, delay = 2.2) => {
    if (outcome) return;
    outcome = o;
    state.outcome = o;
    state.banner = banner;
    state.phase = 'outcome';
    finishedT = state.time + delay;
    emit({ t: 'whistle', kind: 'stop' });
  };

  const doKick = (p: MomentPlayerState, params: KickParams, shotCheck = true) => {
    const k = kickVelocity(params);
    ball.vel.x = k.vel.x; ball.vel.y = k.vel.y; ball.vel.z = k.vel.z;
    ball.spin.x = 0; ball.spin.y = 0; ball.spin.z = k.spin.z;
    ball.pos.z = Math.max(0.11, ball.pos.z);
    if (owner) owner.hasBall = false;
    owner = null;
    state.ball.ownerId = null;
    state.ball.lastTouchId = p.id;
    state.ball.lastTouchSide = p.side;
    setAnim(p, params.power > 0.5 ? 'kick' : 'pass');
    lastKickT = state.time;
    kicked = true;
    lastKickByUser = p.isUser;
    const speed = Math.hypot(k.vel.x, k.vel.y, k.vel.z);
    const towardGoal = p.side === 'us' && params.dir.x > 0.3 && ball.pos.x > 18;
    const shot = shotCheck && towardGoal && params.power > 0.35;
    emit({ t: 'kick', by: p.id, speed, shot });
    wall.forEach((w) => setAnim(w, 'wall_jump'));
    if (shot) {
      shotLive = true;
      stats.shots++;
      emit({ t: 'shot', by: p.id, onTarget: true, xg: 0.2 });
      emit({ t: 'crowd', level: 0.9 });
      // Keeper reaction: predict where the ball crosses the line, decide reach.
      const path = predict(params, 3);
      const cross = path.find((q) => q.x >= HL - 0.3);
      if (cross && Math.abs(cross.y) < GHW + 0.2 && cross.z < GH + 0.2) {
        stats.shotsOnTarget++;
        const reach = 2.2 + Math.random() * 0.8;
        const late = Math.abs(params.curl) > 0.5 ? 0.6 : 1;
        const save = Math.abs(cross.y - gk.pos.y) < reach * late && Math.random() < 0.7 - params.power * 0.25;
        gkDive = { at: state.time + 0.18, y: cross.y, save };
      } else gkDive = { at: state.time + 0.25, y: cross ? Math.max(-3, Math.min(3, cross.y)) : 0, save: false };
    } else if (p.isUser) stats.passes++;
  };

  function predict(params: KickParams, maxTime = 3): Vec3[] {
    const k = kickVelocity(params);
    const b: Sim = { pos: { ...ball.pos, z: Math.max(0.11, ball.pos.z) }, vel: { ...k.vel }, spin: { ...k.spin } };
    const out: Vec3[] = [{ ...b.pos }];
    let acc = 0;
    for (let t = 0; t < maxTime; t += DT) {
      physicsStep(b, DT, wet, wind);
      acc += DT;
      if (acc >= 1 / 30) { acc = 0; out.push({ ...b.pos }); }
      if (Math.abs(b.pos.x) > HL + 0.5 || Math.abs(b.pos.y) > 34.5) break;
      if (Math.hypot(b.vel.x, b.vel.y, b.vel.z) < 0.3) break;
    }
    return out;
  }

  const steer = (p: MomentPlayerState, target: Vec2 | null, maxSpeed: number, dt: number) => {
    let dvx = 0;
    let dvy = 0;
    if (target) {
      const dx = target.x - p.pos.x;
      const dy = target.y - p.pos.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.25) {
        const want = Math.min(maxSpeed, d * 2.2);
        dvx = (dx / d) * want;
        dvy = (dy / d) * want;
      }
    }
    const a = Math.min(1, dt * 4);
    p.vel.x += (dvx - p.vel.x) * a;
    p.vel.y += (dvy - p.vel.y) * a;
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    const sp = Math.hypot(p.vel.x, p.vel.y);
    if (sp > 0.4) {
      const f = Math.atan2(p.vel.y, p.vel.x);
      let d = f - p.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.facing += d * Math.min(1, dt * 10);
    }
  };

  const locoAnim = (p: MomentPlayerState) => {
    const busy = ['kick', 'pass', 'tackle', 'slide', 'dive_left', 'dive_right', 'catch', 'fall', 'header', 'wall_jump'];
    if (busy.includes(p.anim) && p.animTime < (p.anim === 'fall' || p.anim.startsWith('dive') || p.anim === 'slide' ? 1.4 : 0.55)) return;
    if (p.anim === 'celebrate') return;
    const sp = Math.hypot(p.vel.x, p.vel.y);
    if (p.role === 'GK' && sp < 1.5) setAnim(p, 'gk_ready');
    else if (p.hasBall) setAnim(p, 'dribble');
    else setAnim(p, sp > 6.2 ? 'sprint' : sp > 0.6 ? 'run' : 'idle');
  };

  const fixedStep = (dt: number) => {
    state.time += dt;
    for (const p of players) p.animTime += dt;
    if (state.phase === 'intro' && state.time > 0.8) { state.phase = 'live'; emit({ t: 'whistle', kind: 'start' }); }
    const live = state.phase === 'live' || state.phase === 'aiming' || state.phase === 'flight';

    // User movement.
    const us = user;
    let target: Vec2 | null = null;
    if (live && !aiming) {
      if (moveDir.x || moveDir.y) target = { x: us.pos.x + moveDir.x * 5, y: us.pos.y + moveDir.y * 5 };
      else if (moveTarget) {
        target = moveTarget;
        if (Math.hypot(moveTarget.x - us.pos.x, moveTarget.y - us.pos.y) < 0.4) moveTarget = null;
      }
    }
    steer(us, target, (sprint ? 8.2 : 6.0) * (us.hasBall ? 0.85 : 1), dt);

    // Others.
    for (const p of players) {
      if (p === us) continue;
      let t: Vec2 | null = null;
      let max = 5.5;
      if (p.inWall) t = null;
      else if (p === gk) {
        const by = Math.max(-GHW + 0.4, Math.min(GHW - 0.4, ball.pos.y * 0.35));
        t = { x: HL - 0.8, y: by };
        max = 4;
        if (gkDive && state.time >= gkDive.at && !p.anim.startsWith('dive') && p.anim !== 'catch') {
          setAnim(p, gkDive.save && Math.abs(gkDive.y - p.pos.y) < 0.6 ? 'catch' : gkDive.y > p.pos.y ? 'dive_left' : 'dive_right');
          p.vel.y = Math.sign(gkDive.y - p.pos.y) * Math.min(7, Math.abs(gkDive.y - p.pos.y) * 4);
        }
        if (p.anim.startsWith('dive') && p.animTime < 0.6) { p.pos.y += p.vel.y * dt; continue; }
      } else if (owner && owner.side !== p.side && live && !setPiece) {
        // Closest two defenders press the carrier.
        const near = players.filter((q) => q.side === p.side && q.role !== 'GK' && !q.inWall)
          .sort((a, b) => Math.hypot(a.pos.x - owner!.pos.x, a.pos.y - owner!.pos.y) - Math.hypot(b.pos.x - owner!.pos.x, b.pos.y - owner!.pos.y));
        if (near.indexOf(p) < 2) { t = { x: owner.pos.x + (p.side === 'them' ? 1.2 : -1.2), y: owner.pos.y }; max = near.indexOf(p) === 0 ? 5.6 : 4.5; }
        else t = { x: p.pos.x + (p.side === 'us' ? 0.4 : -0.6), y: p.pos.y * 0.98 };
      } else if (owner === p) {
        // Opponent carrier runs at our goal.
        t = { x: p.pos.x + (p.side === 'them' ? -6 : 6), y: p.pos.y * 0.9 };
        max = 5.2;
      } else if (live && !setPiece && p.side === 'us') {
        t = { x: Math.min(40, p.pos.x + 0.6), y: p.pos.y };
        max = 3;
      }
      if (passPending && passPending.to === p) t = null;
      steer(p, t, max, dt);
    }

    // Possession: ball at the carrier's feet.
    if (owner) {
      const o = owner;
      const lead = 0.55 + Math.min(0.5, Math.hypot(o.vel.x, o.vel.y) * 0.05);
      ball.pos.x = o.pos.x + Math.cos(o.facing) * lead;
      ball.pos.y = o.pos.y + Math.sin(o.facing) * lead;
      ball.pos.z = 0.11;
      ball.vel.x = o.vel.x; ball.vel.y = o.vel.y; ball.vel.z = 0;
      // Pressing defender may nick it.
      const presser = players.find((q) => q.side !== o.side && q.role !== 'GK' && Math.hypot(q.pos.x - o.pos.x, q.pos.y - o.pos.y) < 1.0);
      pressT = presser ? pressT + dt : 0;
      if (presser && pressT > (o.isUser ? 0.9 : 1.6) && live && !setPiece) {
        setAnim(presser, 'tackle');
        emit({ t: 'tackle', by: presser.id, on: o.id, won: true, foul: false });
        if (o.isUser) { setAnim(o, 'fall'); finish('lost_ball', null); }
        o.hasBall = false;
        owner = presser;
        presser.hasBall = true;
        state.ball.ownerId = presser.id;
        state.ball.lastTouchSide = presser.side;
        pressT = 0;
      }
      // Opponent carrier reaching our box shoots.
      if (o.side === 'them' && o.pos.x < -34 && !outcome) {
        doKick(o, { dir: { x: -1, y: -o.pos.y / 30 }, power: 0.8, loft: 0.1, curl: 0 }, false);
        shotLive = true;
      }
    } else {
      const r = physicsStep(ball, dt, wet, wind);
      if (r.bounced > 1.5) emit({ t: 'bounce', speed: r.bounced });
      // Pick-ups.
      const sp = Math.hypot(ball.vel.x, ball.vel.y);
      if (ball.pos.z < 1.2 && state.time - lastKickT > 0.25 && !outcome && !(setPiece && !kicked)) {
        for (const p of players) {
          if (p.role === 'GK' && p.side === 'them') continue;
          if (Math.hypot(p.pos.x - ball.pos.x, p.pos.y - ball.pos.y) < (sp < 8 ? 0.9 : 0.55)) {
            owner = p;
            p.hasBall = true;
            state.ball.ownerId = p.id;
            const from = state.ball.lastTouchId;
            state.ball.lastTouchId = p.id;
            state.ball.lastTouchSide = p.side;
            shotLive = false;
            emit({ t: 'receive', by: p.id, from, side: p.side });
            if (p.side === 'them' && lastKickByUser) finish('interception', null);
            else if (p.isUser && passPending) passPending = null;
            else if (p.side === 'us' && lastKickByUser && !p.isUser) { stats.passesCompleted++; }
            break;
          }
        }
      }
      // Ball walks to user after a call.
      if (state.ball.ownerId === null && setPiece && kicked && state.time - lastKickT > 4 && !outcome) finish('timeout', null);
      // Keeper.
      if (gkDive && shotLive && ball.pos.x > HL - 1.6 && Math.abs(ball.pos.y - gk.pos.y) < 2.6 && gkDive.save && ball.pos.z < 2.6) {
        shotLive = false;
        emit({ t: 'save', by: gk.id, held: gk.anim === 'catch' });
        if (gk.anim === 'catch') { ball.vel.x = 0; ball.vel.y = 0; ball.vel.z = 0; ball.pos.x = gk.pos.x - 0.4; ball.pos.y = gk.pos.y; ball.pos.z = 1.1; owner = gk; gk.hasBall = true; state.ball.ownerId = gk.id; }
        else { ball.vel.x = -Math.abs(ball.vel.x) * 0.35; ball.vel.y = (Math.random() - 0.5) * 8; ball.vel.z = 3; }
        finish('saved', null);
      }
      // Goal line.
      if (ball.pos.x > HL && !netted) {
        const ay = Math.abs(ball.pos.y);
        if (ay < GHW - 0.11 && ball.pos.z < GH - 0.11) {
          netted = true;
          if (!outcome) {
            goalFor = true;
            stats.goals++;
            emit({ t: 'goal', scorer: state.ball.lastTouchId ?? user.id, assist: null, side: 'us' });
            emit({ t: 'net' });
            const scorer = players.find((p) => p.id === state.ball.lastTouchId);
            if (scorer) setAnim(scorer, 'celebrate');
            players.filter((p) => p.side === 'us' && p.role !== 'GK').forEach((p) => { if (p !== scorer && Math.random() < 0.5) setAnim(p, 'celebrate'); });
            finish('goal', null, 3);
          }
        } else if (Math.abs(ay - GHW) < 0.18 && ball.pos.z < GH + 0.1 && !outcome) {
          ball.vel.x = -Math.abs(ball.vel.x) * 0.5;
          ball.vel.y = -Math.sign(ball.pos.y) * 3;
          ball.pos.x = HL - 0.05;
          emit({ t: 'woodwork', part: 'post' });
          finish('woodwork', null);
        } else if (!outcome) {
          emit({ t: 'out', restart: 'goal_kick' });
          emit({ t: 'near_miss', by: state.ball.lastTouchId ?? '' });
          finish('missed', null);
        }
      }
      // Net capture.
      if (netted && ball.pos.x > HL + 1.7) { ball.pos.x = HL + 1.7; ball.vel.x = -ball.vel.x * 0.1; ball.vel.y *= 0.3; ball.vel.z *= 0.3; }
      if (ball.pos.x < -HL && !outcome) {
        if (Math.abs(ball.pos.y) < GHW && ball.pos.z < GH) { goalAgainst = true; emit({ t: 'goal', scorer: state.ball.lastTouchId ?? '', assist: null, side: 'them' }); finish('conceded', null, 3); }
        else finish('cleared', null);
      }
      if (Math.abs(ball.pos.y) > 34.5 && !outcome) { emit({ t: 'out', restart: 'throw_in' }); finish(lastKickByUser ? 'lost_ball' : 'timeout', null); }
    }

    // Requested pass arrives.
    if (passPending && state.time >= passPending.at && owner === passPending.to) {
      const from = passPending.to;
      const lead = passPending.through ? 7 : 1.5;
      const tx = user.pos.x + lead;
      const ty = user.pos.y;
      const d = Math.hypot(tx - from.pos.x, ty - from.pos.y);
      doKick(from, { dir: { x: (tx - from.pos.x) / d, y: (ty - from.pos.y) / d }, power: Math.min(0.85, 0.12 + d / 45), loft: d > 30 ? 0.25 : 0.04, curl: 0 }, false);
      passPending = null;
    }

    for (const p of players) locoAnim(p);
    if (!outcome && setup.timeLimit > 0 && state.time > setup.timeLimit) finish('timeout', null);
    if (finishedT !== null && state.time >= finishedT && endT === null) {
      endT = state.time;
      state.phase = 'ended';
      emit({ t: 'end', outcome: outcome ?? 'timeout' });
    }
    // Replay.
    recAcc += dt;
    if (recAcc >= 1 / 15) {
      recAcc = 0;
      replay.push({ t: state.time, ball: { ...ball.pos }, players: players.map((p) => ({ id: p.id, x: p.pos.x, y: p.pos.y, facing: p.facing, anim: p.anim })) });
      if (replay.length > 15 * 25) replay.shift();
    }
  };

  let acc = 0;
  const engine: MomentEngine = {
    setup,
    state,
    step(dt) {
      // Aiming slows time while focus lasts.
      if (aiming) {
        state.focus = Math.max(0, state.focus - dt * 0.18);
        state.timeScale = state.focus > 0 ? 0.25 : 1;
      } else {
        state.timeScale += (1 - state.timeScale) * Math.min(1, dt * 6);
        if (outcome === 'goal' && state.time < (finishedT ?? 0) - 1.6) state.timeScale = 0.45;
      }
      acc += dt * state.timeScale;
      let n = 0;
      while (acc >= DT && n < 40) { fixedStep(DT); acc -= DT; n++; }
      state.ball.pos = ball.pos;
      state.ball.vel = ball.vel;
      state.ball.spin = ball.spin;
      if (!aiming && state.phase === 'aiming') state.phase = 'live';
    },
    input(cmd: ControlCommand) {
      if (outcome && cmd.kind !== 'skip') return;
      switch (cmd.kind) {
        case 'move': moveTarget = cmd.target; break;
        case 'moveDir': moveDir = cmd.dir; break;
        case 'sprint': sprint = cmd.on; break;
        case 'aimStart':
          if (!engine.canKick()) return;
          aiming = true;
          state.phase = 'aiming';
          emit({ t: 'aim', on: true });
          break;
        case 'aimCancel': aiming = false; state.phase = 'live'; emit({ t: 'aim', on: false }); break;
        case 'kick':
          aiming = false;
          emit({ t: 'aim', on: false });
          if (!engine.canKick()) return;
          state.phase = 'flight';
          if (setPiece && owner !== user) {
            // Step up to the ball for the strike.
            user.pos.x = ball.pos.x - cmd.params.dir.x * 0.7;
            user.pos.y = ball.pos.y - cmd.params.dir.y * 0.7;
            user.facing = Math.atan2(cmd.params.dir.y, cmd.params.dir.x);
          }
          if (state.focus < 1) state.focus = Math.min(1, state.focus + 0.25);
          doKick(user, cmd.params);
          break;
        case 'aftertouch':
          if (state.time - lastKickT < 0.6 && lastKickByUser) ball.spin.z += cmd.spin * 22;
          break;
        case 'callForBall': {
          emit({ t: 'call', by: user.id });
          if (owner && owner.side === 'us' && owner !== user) passPending = { to: owner, through: cmd.through, at: state.time + 0.35 };
          break;
        }
        case 'tackle': {
          stats.tackles++;
          setAnim(user, cmd.slide ? 'slide' : 'tackle');
          if (owner && owner.side === 'them' && Math.hypot(owner.pos.x - user.pos.x, owner.pos.y - user.pos.y) < (cmd.slide ? 3 : 2)) {
            const won = Math.random() < (cmd.slide ? 0.6 : 0.7);
            emit({ t: 'tackle', by: user.id, on: owner.id, won, foul: false });
            if (won) {
              setAnim(owner, 'fall');
              owner.hasBall = false;
              owner = null;
              state.ball.ownerId = null;
              ball.vel.x = 4; ball.vel.y = (Math.random() - 0.5) * 4;
              lastKickT = state.time;
              finish('tackle_won', null);
            }
          }
          break;
        }
        case 'skip': finish(Math.random() < 0.3 ? 'goal' : 'saved', null, 0.2); break;
        default: break;
      }
    },
    predictKick: (params, maxTime = 3) => predict(params, maxTime),
    canKick() {
      if (outcome || state.phase === 'intro') return false;
      if (owner === user) return true;
      if (owner) return false;
      return Math.hypot(ball.pos.x - user.pos.x, ball.pos.y - user.pos.y) < 1.4 && ball.pos.z < 1.6
        || (setPiece && !kicked && Math.hypot(ball.pos.x - user.pos.x, ball.pos.y - user.pos.y) < 4);
    },
    on(l) { listeners.add(l); return () => listeners.delete(l); },
    isFinished: () => endT !== null,
    result(): MomentResult {
      return {
        type, outcome: outcome ?? 'timeout', goalFor, goalAgainst, scorerId: goalFor ? user.id : null, assistId: null,
        stats, ratingDelta: goalFor ? 1.2 : outcome === 'saved' ? 0.2 : -0.1, xp: { shooting: 2 }, followUp: null,
        highlight: goalFor || outcome === 'woodwork', replay: replay.slice(), skipped: false,
      };
    },
  };
  return engine;
}
