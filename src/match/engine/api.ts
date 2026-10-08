/**
 * MATCH ENGINE — headless, deterministic real-time simulation of one "moment" (a short
 * passage of play involving the user's player, NSS-style). No DOM, no three.js.
 * Owner: engine agent.
 *
 * Frame: metres; the user's team ("us") always attacks toward +x; our goal line is x = -52.5,
 * their goal line is x = +52.5; goal mouth |y| ≤ 3.66, crossbar z = 2.44.
 *
 * Physics: ball with gravity, quadratic air drag, Magnus force from spin (curl/"falso"),
 * wind, spin decay, bounce with restitution, rolling friction (wet pitch = faster/skiddier),
 * posts & crossbar collisions, goal net capture. Players: steering with pace/acceleration,
 * stamina, dribbling with touches, first-touch control, tackles, headers, GK AI with reaction
 * delay, positioning, dives, catches/parries (rebounds), free-kick walls, offside at pass time.
 */
import type {
  ControlCommand, KickParams, MomentEvent, MomentResult, MomentSetup, MomentState, Vec3,
} from '../../core/types';
import type { Rng } from '../../core/rng';
import { Engine } from './engine';
import { runBot } from './bot';
import { resolveStatistically } from './resolve';

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

export interface MomentEngine {
  readonly setup: MomentSetup;
  /** Live state, mutated in place by step(). Views read it every frame; never mutate it outside. */
  readonly state: MomentState;
  /** Advance by real seconds `dt` (engine applies state.timeScale and fixed sub-steps internally). */
  step(dt: number): void;
  /** Apply a user command. Ignored when not applicable (e.g. kick without the ball). */
  input(cmd: ControlCommand): void;
  /**
   * Noise-free predicted ball path for a kick by the user from the current ball position,
   * sampled every ~1/30 s until it stops, leaves the pitch, or `maxTime` (default 3 s).
   * The view shows only the first part of it (length scales with the user's vision).
   */
  predictKick(params: KickParams, maxTime?: number): Vec3[];
  /**
   * Simulated seconds accumulated but not yet stepped (0..1/120). Optional: views extrapolate
   * rendered positions by it (pos + vel·lag) so motion stays smooth between fixed steps.
   */
  readonly lag?: number;
  /** Is the user currently able to kick (has the ball, or ball is within reach for a one-touch volley/header)? */
  canKick(): boolean;
  /** Subscribe to events (audio, commentary, camera). Returns unsubscribe. */
  on(listener: (e: MomentEvent) => void): () => void;
  isFinished(): boolean;
  /** Valid once isFinished() is true. */
  result(): MomentResult;
}

/** Create a moment from its setup (positions players according to setup.type, formation, spot). */
export function createMoment(setup: MomentSetup): MomentEngine {
  return new Engine(setup);
}

/**
 * A competent automatic player for the USER side, used by tests and the headless
 * autoplay career test: call once per step before engine.step(). Issues sensible
 * ControlCommands (dribble toward goal, pass to open teammates, shoot at a corner with
 * some curl, tackle when defending).
 */
export function botStep(engine: MomentEngine, rng: Rng): void {
  runBot(engine, rng);
}

/**
 * Resolve a moment statistically without playing it (user pressed "simulate"),
 * using the user's attributes, moment type and difficulty. Slightly worse on average
 * than skilled manual play so playing is rewarded.
 */
export function autoResolve(setup: MomentSetup, rng: Rng): MomentResult {
  return resolveStatistically(setup, rng);
}

/**
 * Casual-play control assists (used by the 2D view): automatic aim for shots, best team-mate
 * selection for passes / through balls, and a cheap info snapshot for the aim UI.
 */
export { assistShot, assistShotDir, assistPass, pickPass, assistInfo, kickDir, goalBound, GOAL_CONE } from './assist';
export type { ShotIntent, DirShotIntent, PassIntent, PassPick, AssistInfo } from './assist';
