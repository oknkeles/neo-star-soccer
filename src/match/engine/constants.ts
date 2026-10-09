/**
 * Engine constants and tuning knobs. Frame: metres, "us" attack +x.
 * Ball position z is the height of the ball's CENTRE (resting on grass: z = ballRadius).
 */
export const PITCH = {
  halfLength: 52.5,
  halfWidth: 34,
  goalHalfWidth: 3.66,
  goalHeight: 2.44,
  goalDepth: 2.0,
  penaltyBoxDepth: 16.5,
  penaltyBoxHalfWidth: 20.16,
  sixYardDepth: 5.5,
  sixYardHalfWidth: 9.16,
  penaltySpot: 11,
  centreCircle: 9.15,
  postRadius: 0.06,
  ballRadius: 0.11,
} as const;

export const HL = PITCH.halfLength;
export const HW = PITCH.halfWidth;
export const GW = PITCH.goalHalfWidth;
export const GH = PITCH.goalHeight;
export const BR = PITCH.ballRadius;
export const PR = PITCH.postRadius;
export const NET_DEPTH = PITCH.goalDepth;

/** Posts stand on the goal line: centre of a post / crossbar. */
export const POST_X = HL - PR;
export const POST_Y = GW + PR;
export const BAR_Z = GH + PR;

/** Fixed simulation step (120 Hz). */
export const DT = 1 / 120;
export const GRAVITY = 9.81;
/** Quadratic drag coefficient k (a = -k |v| v), ≈ ½ρC_dA/m for a size-5 ball. */
export const DRAG = 0.0132;
/** Magnus coefficient S (a = S · ω × v). */
export const MAGNUS = 0.0052;
/** Side-spin (rad/s) at curl attribute 99 and KickParams.curl = 1. */
export const SPIN_MAX = 62;
/** Restitution of woodwork. */
export const POST_RESTITUTION = 0.72;

/** Replay ring buffer: 30 Hz for ~10 s. */
export const REPLAY_HZ = 30;
export const REPLAY_FRAMES = 300;

/** Aftertouch window after a user kick (simulated seconds). */
export const AFTERTOUCH_WINDOW = 0.4;
/** Slow-motion time scale while aiming. */
export const AIM_TIMESCALE = 0.2;

/** Player body for ball collisions. */
export const BODY_R = 0.3;
export const BODY_H = 1.85;

/** Seconds a call for the ball (F) stays active. */
export const CALL_WINDOW = 1.8;
