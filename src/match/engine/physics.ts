/**
 * Ball physics. One integrator shared by the live simulation, predictKick() and the AI
 * (so the preview line, the bot's solver and reality agree exactly).
 */
import type { BallState, Weather } from '../../core/types';
import {
  BAR_Z, BR, DRAG, GH, GRAVITY, GW, HL, HW, MAGNUS, NET_DEPTH, POST_RESTITUTION, POST_X, POST_Y, PR,
} from './constants';

export interface PhysEnv {
  windX: number;
  windY: number;
  restitution: number;
  /** Rolling deceleration on grass, m/s². */
  rollDecel: number;
  /** Coulomb friction coefficient during a bounce (low = skiddy). */
  bounceMu: number;
  /** Spin decay in the air (1/s). */
  spinDecay: number;
  /** Side-spin decay while rolling (1/s). */
  groundSpinDecay: number;
}

export function physEnv(w: Weather | undefined): PhysEnv {
  let restitution = 0.55;
  let rollDecel = 1.6;
  let bounceMu = 0.5;
  switch (w?.kind) {
    case 'rain': restitution = 0.46; rollDecel = 1.15; bounceMu = 0.26; break;
    case 'snow': restitution = 0.34; rollDecel = 2.7; bounceMu = 0.7; break;
    default: break;
  }
  const wx = w?.wind?.x ?? 0;
  const wy = w?.wind?.y ?? 0;
  return {
    windX: Number.isFinite(wx) ? wx : 0,
    windY: Number.isFinite(wy) ? wy : 0,
    restitution, rollDecel, bounceMu, spinDecay: 0.65, groundSpinDecay: 2.2,
  };
}

/** Auxiliary ball bookkeeping that is not part of the public BallState. */
export interface BallAux {
  /** Ball is inside a goal: +1 = their goal (x>0), -1 = ours. */
  inGoal: 0 | 1 | -1;
  outReported: boolean;
  netHit: boolean;
}

export const newAux = (): BallAux => ({ inGoal: 0, outReported: false, netHit: false });

/** What happened during one integration call (reset by the caller). */
export interface StepReport {
  bounce: number;            // vertical impact speed of the hardest bounce (0 = none)
  woodwork: 0 | 1 | 2;       // 1 post, 2 bar
  woodworkSpeed: number;
  goal: 0 | 1 | -1;          // crossed the goal line inside the mouth (+1 their goal)
  net: boolean;              // hit the net from inside (first contact)
  netOutside: boolean;       // side/top netting from outside
  out: 0 | 1 | 2;            // 1 touchline, 2 goal line (outside the mouth)
  outEnd: 0 | 1 | -1;        // which goal line for out=2
}

export const newReport = (): StepReport => ({
  bounce: 0, woodwork: 0, woodworkSpeed: 0, goal: 0, net: false, netOutside: false, out: 0, outEnd: 0,
});

export function resetReport(r: StepReport): void {
  r.bounce = 0; r.woodwork = 0; r.woodworkSpeed = 0; r.goal = 0; r.net = false; r.netOutside = false; r.out = 0; r.outEnd = 0;
}

export function isRolling(b: BallState): boolean {
  return b.pos.z <= BR + 1e-4 && Math.abs(b.vel.z) < 1e-3;
}

const SPIN_CAP_H = 40; // horizontal-axis spin that contributes to Magnus lift/dip

/** Advance the ball by dt (sub-divides fast balls so posts/net cannot be tunnelled). */
export function integrateBall(b: BallState, aux: BallAux, env: PhysEnv, dt: number, rep: StepReport): void {
  const v = b.vel;
  const sp = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  const n = sp * dt > 0.12 ? Math.min(5, Math.ceil((sp * dt) / 0.12)) : 1;
  const h = dt / n;
  for (let k = 0; k < n; k++) microStep(b, aux, env, h, rep);
}

function microStep(b: BallState, aux: BallAux, env: PhysEnv, h: number, rep: StepReport): void {
  const p = b.pos;
  const v = b.vel;
  const w = b.spin;
  const px0 = p.x;
  const py0 = p.y;
  const pz0 = p.z;

  if (p.z <= BR + 1e-4 && Math.abs(v.z) < 1e-3) {
    // ── rolling ──
    const s = Math.sqrt(v.x * v.x + v.y * v.y);
    if (s < 0.05) {
      v.x = 0; v.y = 0;
      w.x = 0; w.y = 0;
      w.z *= Math.exp(-4 * h);
    } else {
      const dec = env.rollDecel + DRAG * s * s;
      const ns = Math.max(0, s - dec * h);
      const sc = ns / s;
      // side spin still swerves a rolling ball a little
      const ax = MAGNUS * 0.3 * (-w.z * v.y);
      const ay = MAGNUS * 0.3 * (w.z * v.x);
      v.x = v.x * sc + ax * h;
      v.y = v.y * sc + ay * h;
      w.z *= Math.exp(-env.groundSpinDecay * h);
      w.x = -v.y / BR;
      w.y = v.x / BR;
    }
    p.x += v.x * h;
    p.y += v.y * h;
    p.z = BR;
    v.z = 0;
  } else {
    // ── flight: gravity + quadratic drag + Magnus (relative to the wind) ──
    const rvx = v.x - env.windX;
    const rvy = v.y - env.windY;
    const rvz = v.z;
    const s = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
    const wx = w.x > SPIN_CAP_H ? SPIN_CAP_H : w.x < -SPIN_CAP_H ? -SPIN_CAP_H : w.x;
    const wy = w.y > SPIN_CAP_H ? SPIN_CAP_H : w.y < -SPIN_CAP_H ? -SPIN_CAP_H : w.y;
    const wz = w.z;
    const ax = -DRAG * s * rvx + MAGNUS * (wy * rvz - wz * rvy);
    const ay = -DRAG * s * rvy + MAGNUS * (wz * rvx - wx * rvz);
    const az = -GRAVITY - DRAG * s * rvz + MAGNUS * (wx * rvy - wy * rvx);
    v.x += ax * h;
    v.y += ay * h;
    v.z += az * h;
    p.x += v.x * h;
    p.y += v.y * h;
    p.z += v.z * h;
    const decay = Math.exp(-env.spinDecay * h);
    w.x *= decay; w.y *= decay; w.z *= decay;

    if (p.z < BR) {
      p.z = BR;
      if (v.z < 0) {
        const impact = -v.z;
        if (impact > 0.6) {
          v.z = impact * env.restitution;
          // friction impulse at the contact point (hollow sphere: rolling reached at Δv = 0.4·vc)
          const vcx = v.x - BR * w.y;
          const vcy = v.y + BR * w.x;
          const vc = Math.sqrt(vcx * vcx + vcy * vcy);
          if (vc > 1e-6) {
            const j = Math.min(0.4 * vc, env.bounceMu * (1 + env.restitution) * impact);
            const jx = (j * vcx) / vc;
            const jy = (j * vcy) / vc;
            v.x -= jx;
            v.y -= jy;
            w.y += (1.5 * jx) / BR;
            w.x -= (1.5 * jy) / BR;
          }
          w.z *= 0.72;
          if (impact > rep.bounce) rep.bounce = impact;
        } else {
          v.z = 0; // settles into rolling
        }
      }
    }
  }

  const ax = Math.abs(p.x);
  if (ax > HL - 2.5) goalFrame(b, aux, rep, px0, py0, pz0, h);

  // out of play (reported once)
  if (!aux.outReported && aux.inGoal === 0) {
    if (Math.abs(p.y) > HW + BR) {
      aux.outReported = true;
      rep.out = 1;
    } else if (Math.abs(p.x) > HL + BR) {
      aux.outReported = true;
      rep.out = 2;
      rep.outEnd = p.x > 0 ? 1 : -1;
    }
  }

  // advertising boards / stands keep the ball near the pitch
  if (Math.abs(p.y) > HW + 5) {
    p.y = Math.sign(p.y) * (HW + 5);
    if (p.y * v.y > 0) { v.y = -v.y * 0.3; v.x *= 0.6; }
  }
  if (Math.abs(p.x) > HL + 5) {
    p.x = Math.sign(p.x) * (HL + 5);
    if (p.x * v.x > 0) { v.x = -v.x * 0.3; v.y *= 0.6; }
  }
  if (p.z > 40) { p.z = 40; if (v.z > 0) v.z = 0; }
}

/** Posts, crossbar, goal detection and nets for the goal at the ball's end. */
function goalFrame(b: BallState, aux: BallAux, rep: StepReport, px0: number, py0: number, pz0: number, h: number): void {
  const p = b.pos;
  const v = b.vel;
  const g = p.x > 0 ? 1 : -1;
  const cx = g * POST_X;
  const R = BR + PR;

  // posts (vertical cylinders)
  if (p.z < BAR_Z + PR) {
    for (let sy = -1; sy <= 1; sy += 2) {
      const dx = p.x - cx;
      const dy = p.y - sy * POST_Y;
      const d2 = dx * dx + dy * dy;
      if (d2 < R * R) {
        const d = Math.sqrt(d2) || 1e-6;
        const nx = dx / d;
        const ny = dy / d;
        p.x = cx + nx * R;
        p.y = sy * POST_Y + ny * R;
        reflect(b, nx, ny, 0, rep, 1);
      }
    }
  }
  // crossbar (horizontal cylinder along y)
  if (Math.abs(p.y) < POST_Y) {
    const dx = p.x - cx;
    const dz = p.z - BAR_Z;
    const d2 = dx * dx + dz * dz;
    if (d2 < R * R) {
      const d = Math.sqrt(d2) || 1e-6;
      const nx = dx / d;
      const nz = dz / d;
      p.x = cx + nx * R;
      p.z = BAR_Z + nz * R;
      reflect(b, nx, 0, nz, rep, 2);
    }
  }

  const gx = g * p.x;
  const gx0 = g * px0;
  if (aux.inGoal === g) {
    // caught by the net: the ball can never leave the goal box
    let hit = false;
    const back = HL + NET_DEPTH - BR;
    if (gx > back) {
      p.x = g * back;
      if (g * v.x > 0) { v.x = -v.x * 0.1; v.y *= 0.5; v.z *= 0.6; hit = true; }
    }
    if (gx < HL + BR) {
      p.x = g * (HL + BR);
      if (g * v.x < 0) v.x = -v.x * 0.15;
    }
    const side = GW - BR;
    if (Math.abs(p.y) > side) {
      const sg = Math.sign(p.y);
      p.y = sg * side;
      if (sg * v.y > 0) { v.y = -v.y * 0.1; v.x *= 0.6; hit = true; }
    }
    const top = GH - BR;
    if (p.z > top) {
      p.z = top;
      if (v.z > 0) { v.z = -v.z * 0.1; hit = true; }
    }
    const damp = Math.exp(-1.8 * h);
    v.x *= damp; v.y *= damp;
    if (hit && !aux.netHit) { aux.netHit = true; rep.net = true; }
    return;
  }

  // crossing the goal line between the posts and under the bar → goal
  if (aux.inGoal === 0 && gx > HL + BR && gx0 <= HL + BR && Math.abs(p.y) < GW && p.z < GH) {
    aux.inGoal = g as 1 | -1;
    rep.goal = g as 1 | -1;
    return;
  }

  // side / top / back netting from the outside
  if (gx > HL && gx < HL + NET_DEPTH + BR && Math.abs(p.y) < GW + BR && p.z < GH + BR) {
    if (Math.abs(py0) >= GW + BR - 0.02) {
      const sg = Math.sign(py0) || 1;
      p.y = sg * (GW + BR);
      if (sg * v.y < 0) { v.y = -v.y * 0.1; v.x *= 0.5; }
      rep.netOutside = true;
    } else if (pz0 >= GH + BR - 0.02) {
      p.z = GH + BR;
      if (v.z < 0) v.z = 0;
      v.x *= 0.97; v.y *= 0.97;
      rep.netOutside = true;
    } else if (gx0 >= HL + NET_DEPTH + BR - 0.02) {
      p.x = g * (HL + NET_DEPTH + BR);
      if (g * v.x < 0) v.x = -v.x * 0.1;
      rep.netOutside = true;
    }
  }
}

function reflect(b: BallState, nx: number, ny: number, nz: number, rep: StepReport, part: 1 | 2): void {
  const v = b.vel;
  const vn = v.x * nx + v.y * ny + v.z * nz;
  if (vn >= 0) return;
  const k = (1 + POST_RESTITUTION) * vn;
  v.x -= k * nx;
  v.y -= k * ny;
  v.z -= k * nz;
  v.x *= 0.94; v.y *= 0.94; v.z *= 0.94;
  b.spin.x *= 0.5; b.spin.y *= 0.5; b.spin.z *= 0.4;
  if (-vn > 1 && -vn > rep.woodworkSpeed) {
    rep.woodwork = part;
    rep.woodworkSpeed = -vn;
  }
}

/** Plain copy of a ball state (for predictions). */
export function cloneBall(b: BallState): BallState {
  return {
    pos: { x: b.pos.x, y: b.pos.y, z: b.pos.z },
    vel: { x: b.vel.x, y: b.vel.y, z: b.vel.z },
    spin: { x: b.spin.x, y: b.spin.y, z: b.spin.z },
    ownerId: b.ownerId,
    lastTouchId: b.lastTouchId,
    lastTouchSide: b.lastTouchSide,
  };
}

export function copyBallInto(dst: BallState, src: BallState): void {
  dst.pos.x = src.pos.x; dst.pos.y = src.pos.y; dst.pos.z = src.pos.z;
  dst.vel.x = src.vel.x; dst.vel.y = src.vel.y; dst.vel.z = src.vel.z;
  dst.spin.x = src.spin.x; dst.spin.y = src.spin.y; dst.spin.z = src.spin.z;
}

export function ballSpeed(b: BallState): number {
  const v = b.vel;
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/** Does a point (ball centre crossing the goal line) lie inside the goal mouth? */
export function inMouth(y: number, z: number, margin = 0): boolean {
  return Math.abs(y) < GW - margin && z < GH - margin;
}

