/**
 * Procedural animation: AnimState + time → joint angles for the low-poly rig.
 * Pure math (no three.js) so it is testable. Conventions in the rig's local frame
 * (the player faces +X, up is +Y, the player's LEFT is −Z):
 *  - hip / shoulder > 0  : limb swings FORWARD
 *  - knee > 0            : shin folds BACK; elbow > 0: forearm folds forward
 *  - shoulderOut > 0     : arm raised sideways (2.8 ≈ straight up)
 *  - spine > 0           : torso leans forward
 *  - rootPitch > 0       : whole body pitches forward (falls), < 0 backward
 *  - rootRoll > 0        : whole body rolls to the player's LEFT (dives)
 */
import type { AnimState } from '../../core/types';
import { KICK_CONTACT } from '../engine/constants';
import { strideLen } from '../engine/locomotion';

export interface Pose {
  rootY: number;
  rootPitch: number;
  rootRoll: number;
  spine: number;
  twist: number;
  head: number;
  hipL: number; hipR: number;
  hipOutL: number; hipOutR: number;
  kneeL: number; kneeR: number;
  shoulderL: number; shoulderR: number;
  shoulderOutL: number; shoulderOutR: number;
  elbowL: number; elbowR: number;
}

export const POSE_KEYS: (keyof Pose)[] = [
  'rootY', 'rootPitch', 'rootRoll', 'spine', 'twist', 'head', 'hipL', 'hipR', 'hipOutL', 'hipOutR',
  'kneeL', 'kneeR', 'shoulderL', 'shoulderR', 'shoulderOutL', 'shoulderOutR', 'elbowL', 'elbowR',
];

export function neutralPose(): Pose {
  return {
    rootY: 0, rootPitch: 0, rootRoll: 0, spine: 0.04, twist: 0, head: 0,
    hipL: 0, hipR: 0, hipOutL: 0.03, hipOutR: 0.03, kneeL: 0.06, kneeR: 0.06,
    shoulderL: 0, shoulderR: 0, shoulderOutL: 0.12, shoulderOutR: 0.12, elbowL: 0.25, elbowR: 0.25,
  };
}

export interface PoseInput {
  anim: AnimState;
  /** Seconds in the current animation. */
  t: number;
  /** Ground speed (m/s). */
  speed: number;
  /** Run-cycle phase (radians); advanced by distance travelled. */
  cycle: number;
  kickFoot: 'L' | 'R';
  /** 0..1 per player: picks a celebration style, adds personality. */
  variant: number;
  /** Longitudinal acceleration (m/s², + = speeding up): the body leans into it. */
  accel?: number;
}

/** Leg length (hip to sole) of the rig at scale 1. */
const LEG = 0.89;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Stride length (m) per full cycle at a given speed (the engine's dribble touches use the same
 * rhythm). Dribbling: shorter, quicker steps.
 */
export function strideLength(speed: number, dribble = false): number {
  return strideLen(speed) * (dribble ? 0.85 : 1);
}

/** Advance the run-cycle phase for a frame. */
export function advanceCycle(cycle: number, speed: number, dt: number, dribble = false): number {
  const next = cycle + (speed * dt / strideLength(speed, dribble)) * Math.PI * 2;
  return next > 1e4 ? next % (Math.PI * 2) : next;
}

/**
 * Hip swing (rad) whose foot travel matches the stride at this speed: a planted foot moves back
 * exactly as fast as the body moves forward (no sliding). Fades out toward a standstill.
 */
export function hipAmplitude(speed: number, dribble = false): number {
  const stride = strideLength(speed, dribble);
  return Math.asin(Math.min(0.72, stride / (4 * LEG))) * smooth(0.1, 1.4, speed);
}

/**
 * Walk / jog / run / sprint as one continuous gait driven by the real speed (no pops when the
 * animation state switches between run and sprint): stride from the speed, knee lift, arm drive
 * and forward lean grow with effort; acceleration tips the body forward, braking sits it back.
 */
function locomotion(p: Pose, i: PoseInput, style: 'run' | 'sprint' | 'dribble'): void {
  const sp = Math.max(0, i.speed);
  const drib = style === 'dribble';
  const a = clamp01(sp / 8.5);
  const A = a * (drib ? 0.85 : 1);
  const hip = hipAmplitude(sp, drib);
  const s = Math.sin(i.cycle);
  const c = Math.cos(i.cycle);
  p.hipL = s * hip;
  p.hipR = -s * hip;
  // knee: a soft bend while walking, a high heel recovery in a sprint
  const lift = 0.25 + 1.15 * smooth(1.5, 8, sp);
  p.kneeL = 0.06 + 0.16 * A + lift * hip * 1.3 * Math.max(0, c);
  p.kneeR = 0.06 + 0.16 * A + lift * hip * 1.3 * Math.max(0, -c);
  p.shoulderL = -s * (0.25 + 0.55 * A) * Math.min(1, hip * 2);
  p.shoulderR = s * (0.25 + 0.55 * A) * Math.min(1, hip * 2);
  p.elbowL = 0.35 + 1.05 * A;
  p.elbowR = 0.35 + 1.05 * A;
  p.shoulderOutL = 0.12 + (drib ? 0.18 : 0);
  p.shoulderOutR = 0.12 + (drib ? 0.18 : 0);
  const lean = Math.max(-0.12, Math.min(0.2, (i.accel ?? 0) * 0.022));
  p.spine = 0.05 + 0.24 * smooth(1.5, 9, sp) + (drib ? 0.08 : 0) + lean;
  p.rootPitch = lean * 0.3;
  p.rootY = A * (0.045 * Math.cos(2 * i.cycle) - 0.03) - (drib ? 0.02 : 0);
  p.twist = s * 0.12 * A;
  p.head = -p.spine * 0.6;
}

/**
 * Kick / pass / volley / tackle on a timeline whose foot-ball contact is at KICK_CONTACT: the
 * wind-up (leg drawn back) before it — AI strikes wind up before the ball leaves, the user's
 * start just before contact — then the swing through the ball and the follow-through.
 */
function kickPose(p: Pose, i: PoseInput, kind: 'kick' | 'pass' | 'volley' | 'tackle'): void {
  const left = i.kickFoot === 'L';
  const t = i.t;
  const C = KICK_CONTACT[kind];
  const wind = C * 0.62;
  const follow = C + (kind === 'pass' ? 0.1 : 0.13);
  const settle = C + (kind === 'pass' ? 0.42 : 0.5);
  let hip: number;
  let knee: number;
  const back = kind === 'pass' ? -0.55 : -0.8;
  const swingTop = kind === 'volley' ? 1.75 : kind === 'pass' ? 0.95 : kind === 'tackle' ? 1.15 : 1.4;
  const contactHip = kind === 'volley' ? 0.9 : 0.35;
  if (t < wind) {
    const k = smooth(0, wind, t);
    hip = mix(0, back, k);
    knee = mix(0.25, kind === 'pass' ? 1.2 : 1.55, k);
  } else if (t < C) {
    // the swing: fast, through the ball at contact
    const k = (t - wind) / (C - wind);
    hip = mix(back, contactHip, k * k);
    knee = mix(kind === 'pass' ? 1.2 : 1.55, 0.35, k);
  } else if (t < follow) {
    const k = smooth(C, follow, t);
    hip = mix(contactHip, swingTop, k);
    knee = mix(0.35, kind === 'tackle' ? 0.05 : 0.12, k);
  } else {
    const k = smooth(follow, settle, t);
    hip = mix(swingTop, 0.1, k);
    knee = mix(0.12, 0.15, k);
  }
  const support = 0.35;
  if (left) { p.hipL = hip; p.kneeL = knee; p.hipR = -0.1; p.kneeR = support; }
  else { p.hipR = hip; p.kneeR = knee; p.hipL = -0.1; p.kneeL = support; }
  // Balance: the arm opposite the kicking leg swings out.
  const armOut = 0.6 + 0.6 * smooth(0, C, t) * (1 - smooth(follow, settle + 0.2, t));
  if (left) { p.shoulderOutR = armOut + 0.2; p.shoulderOutL = 0.35; p.shoulderL = 0.3; }
  else { p.shoulderOutL = armOut + 0.2; p.shoulderOutR = 0.35; p.shoulderR = 0.3; }
  p.elbowL = 0.5; p.elbowR = 0.5;
  // lean back a touch in the wind-up, over the ball at contact
  p.spine = kind === 'tackle' ? 0.45 : mix(0.12, -0.06, smooth(0, wind, t)) + 0.2 * smooth(wind, C, t) - 0.08 * smooth(C, settle, t);
  p.twist = (left ? -1 : 1) * (kind === 'pass' ? 0.25 : 0.14) * Math.sin(Math.PI * clamp01(t / settle));
  p.rootY = kind === 'tackle' ? -0.16 : -0.04 - 0.03 * Math.sin(Math.PI * clamp01(t / C));
  if (kind === 'volley') {
    p.rootRoll = (left ? -1 : 1) * 0.45 * Math.sin(Math.PI * clamp01(t / (settle + 0.1)));
    p.rootY = 0.05 * Math.sin(Math.PI * clamp01(t / settle));
  }
  if (kind === 'pass') {
    if (left) p.hipOutL = 0.25 * smooth(wind, C, t);
    else p.hipOutR = 0.25 * smooth(wind, C, t);
  }
}

function celebratePose(p: Pose, i: PoseInput): void {
  const t = i.t;
  if (i.variant < 0.34) {
    // Knee slide, arms to the sky.
    const k = smooth(0, 0.35, t);
    p.rootY = mix(0, -0.48, k);
    p.hipL = mix(0, 0.05, k); p.hipR = mix(0, 0.05, k);
    p.kneeL = mix(0.3, 1.6, k); p.kneeR = mix(0.3, 1.6, k);
    p.spine = mix(0.2, -0.45, k);
    p.rootPitch = mix(0, -0.12, k);
    p.shoulderOutL = mix(0.3, 2.55, k); p.shoulderOutR = mix(0.3, 2.55, k);
    p.shoulderL = 0.25; p.shoulderR = 0.25;
    p.elbowL = 0.15; p.elbowR = 0.15;
    p.head = -0.45 * k;
  } else if (i.variant < 0.67) {
    // Jumping fist pumps.
    const j = Math.abs(Math.sin(t * 5.2));
    p.rootY = j * 0.32;
    p.kneeL = 0.5 - j * 0.35; p.kneeR = 0.5 - j * 0.35;
    p.hipL = 0.25 - j * 0.15; p.hipR = 0.1;
    p.shoulderOutR = 2.75; p.elbowR = 0.35 + 0.45 * Math.abs(Math.sin(t * 10.4));
    p.shoulderOutL = 0.6; p.shoulderL = 0.9; p.elbowL = 1.6;
    p.spine = -0.1;
    p.head = -0.25;
  } else {
    // Airplane run.
    if (i.speed > 1) locomotion(p, i, 'run');
    p.shoulderOutL = 1.5; p.shoulderOutR = 1.5;
    p.shoulderL = 0; p.shoulderR = 0;
    p.elbowL = 0.05; p.elbowR = 0.05;
    p.rootRoll = Math.sin(t * 2.4) * 0.28;
    p.spine = 0.1;
  }
}

/** The target pose for this frame. */
export function computePose(i: PoseInput): Pose {
  const p = neutralPose();
  const t = Math.max(0, i.t);
  switch (i.anim) {
    case 'idle': {
      p.spine = 0.05 + 0.015 * Math.sin(t * 1.9);
      p.shoulderOutL = 0.14 + 0.02 * Math.sin(t * 1.9);
      p.shoulderOutR = p.shoulderOutL;
      p.kneeL = 0.1; p.kneeR = 0.12;
      if (i.speed > 0.4) locomotion(p, i, 'run');
      break;
    }
    case 'run': locomotion(p, i, 'run'); break;
    case 'sprint': locomotion(p, i, 'sprint'); break;
    case 'dribble': locomotion(p, i, 'dribble'); break;
    case 'kick': kickPose(p, { ...i, t }, 'kick'); break;
    case 'pass': kickPose(p, { ...i, t }, 'pass'); break;
    case 'volley': kickPose(p, { ...i, t }, 'volley'); break;
    case 'tackle': kickPose(p, { ...i, t }, 'tackle'); break;
    case 'header': {
      const air = t < 0.65 ? Math.sin(Math.PI * t / 0.65) : 0;
      p.rootY = air * 0.5;
      p.kneeL = 0.5 + 0.5 * air; p.kneeR = 0.7 + 0.4 * air;
      p.hipL = 0.25 * air; p.hipR = -0.1;
      p.spine = t < 0.28 ? mix(0.05, -0.35, smooth(0, 0.28, t)) : mix(-0.35, 0.45, smooth(0.28, 0.42, t));
      p.head = t < 0.28 ? -0.3 : 0.5 * (1 - smooth(0.42, 0.8, t));
      p.shoulderOutL = 0.9; p.shoulderOutR = 0.9;
      p.shoulderL = 0.6 * air; p.shoulderR = 0.6 * air;
      p.elbowL = 1.1; p.elbowR = 1.1;
      break;
    }
    case 'slide': {
      const k = smooth(0, 0.18, t);
      const lead = i.kickFoot === 'L';
      p.rootY = mix(0, -0.62, k);
      p.rootPitch = mix(0, -1.05, k);
      p.spine = mix(0.2, 0.35, k);
      if (lead) { p.hipL = mix(0, 1.45, k); p.kneeL = 0.05; p.hipR = mix(0, 1.05, k); p.kneeR = mix(0.3, 1.9, k); }
      else { p.hipR = mix(0, 1.45, k); p.kneeR = 0.05; p.hipL = mix(0, 1.05, k); p.kneeL = mix(0.3, 1.9, k); }
      p.shoulderL = -0.6; p.shoulderR = -0.6; p.shoulderOutL = 0.7; p.shoulderOutR = 0.7;
      p.elbowL = 0.4; p.elbowR = 0.4;
      p.head = 0.5 * k;
      break;
    }
    case 'dive_left':
    case 'dive_right': {
      const side = i.anim === 'dive_left' ? 1 : -1;
      const roll = smooth(0, 0.3, t);
      p.rootRoll = side * 1.3 * roll;
      const flight = t < 0.75 ? Math.sin(Math.PI * Math.min(1, t / 0.75)) : 0;
      p.rootY = 0.35 * flight - 0.62 * smooth(0.5, 0.9, t);
      p.shoulderOutL = mix(0.4, 2.8, roll); p.shoulderOutR = mix(0.4, 2.8, roll);
      p.shoulderL = 0.25; p.shoulderR = 0.25;
      p.elbowL = 0.15; p.elbowR = 0.15;
      p.hipOutL = 0.25; p.hipOutR = 0.25;
      p.kneeL = 0.35; p.kneeR = 0.55;
      p.spine = 0.05;
      p.head = 0;
      break;
    }
    case 'catch': {
      const k = smooth(0, 0.15, t);
      p.shoulderL = mix(0.2, 1.35, k); p.shoulderR = mix(0.2, 1.35, k);
      p.shoulderOutL = 0.2; p.shoulderOutR = 0.2;
      p.elbowL = mix(0.3, 1.0, smooth(0.15, 0.4, t)); p.elbowR = p.elbowL;
      p.spine = 0.28; p.kneeL = 0.45; p.kneeR = 0.45; p.hipL = 0.25; p.hipR = 0.25;
      p.rootY = -0.08;
      p.head = 0.2;
      break;
    }
    case 'gk_ready': {
      const bob = Math.sin(t * 6.5) * 0.012;
      p.rootY = -0.13 + bob;
      p.hipL = 0.4; p.hipR = 0.4; p.kneeL = 0.75; p.kneeR = 0.75;
      p.hipOutL = 0.14; p.hipOutR = 0.14;
      p.spine = 0.38;
      p.head = -0.3;
      p.shoulderL = 0.55; p.shoulderR = 0.55; p.shoulderOutL = 0.55; p.shoulderOutR = 0.55;
      p.elbowL = 0.65; p.elbowR = 0.65;
      if (i.speed > 0.8) {
        // Side-steps while staying set.
        const s = Math.sin(i.cycle);
        p.hipOutL = 0.14 + 0.15 * Math.max(0, s);
        p.hipOutR = 0.14 + 0.15 * Math.max(0, -s);
      }
      break;
    }
    case 'fall': {
      const fwd = i.variant > 0.5;
      const k = smooth(0, 0.45, t);
      p.rootPitch = (fwd ? 1 : -1) * 1.42 * k;
      p.rootY = -0.72 * smooth(0.1, 0.5, t);
      p.shoulderOutL = mix(0.3, 1.3, k); p.shoulderOutR = mix(0.3, 1.1, k);
      p.shoulderL = fwd ? 1.2 * k : -0.2;
      p.shoulderR = fwd ? 1.0 * k : -0.3;
      p.kneeL = 0.5 * k; p.kneeR = 0.2;
      p.hipL = 0.15; p.hipR = -0.05;
      break;
    }
    case 'celebrate': celebratePose(p, { ...i, t }); break;
    case 'wall_jump': {
      const air = t < 0.55 ? Math.sin(Math.PI * t / 0.55) : 0;
      const crouch = t < 0.12 ? smooth(0, 0.12, t) : 0;
      p.rootY = air * 0.42 - crouch * 0.08;
      p.kneeL = 0.2 + crouch * 0.5 + air * 0.25; p.kneeR = p.kneeL;
      p.hipL = 0.1 + air * 0.15; p.hipR = p.hipL;
      p.shoulderL = 0.35; p.shoulderR = 0.35;
      p.shoulderOutL = -0.18; p.shoulderOutR = -0.18;
      p.elbowL = 0.35; p.elbowR = 0.35;
      p.spine = 0.08;
      p.head = 0.15 * air;
      break;
    }
    default: break;
  }
  return p;
}

/** Exponential approach of `cur` toward `target` (in place). */
export function blendPose(cur: Pose, target: Pose, alpha: number): Pose {
  const a = clamp01(alpha);
  for (const k of POSE_KEYS) cur[k] += (target[k] - cur[k]) * a;
  return cur;
}

/** Stable 0..1 hash of an id (per-player variety). */
export function idVariant(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10007) / 10007;
}

/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
