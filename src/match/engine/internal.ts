/**
 * Engine-internal runtime structures (never exposed through MomentState).
 */
import type { Attributes, MomentPlayerSpec, MomentPlayerState, Vec2, Vec3 } from '../../core/types';
import type { SlotDef } from './formation';
import type { KickKind } from './kick';

export type Side = 'us' | 'them';

/** What an outfield agent is currently trying to do (AI bookkeeping). */
export type Duty =
  | 'idle' | 'shape' | 'support' | 'run' | 'receive' | 'chase' | 'press' | 'cover' | 'mark'
  | 'wall' | 'carry' | 'attackBall' | 'hold';

export interface KeeperMem {
  mode: 'set' | 'track' | 'dive' | 'down' | 'hold' | 'rush' | 'claim';
  /** Seconds until he reacts to the current shot. */
  react: number;
  /** Kick id he is reacting to (−1 none). */
  kickId: number;
  repredict: number;
  /** Predicted interception point (world). */
  aim: Vec3 | null;
  /** Time until the ball reaches the interception point (at the last prediction). */
  aimT: number;
  /** Hands position (world). */
  hands: Vec3;
  diveDir: Vec2;
  /** Remaining time on the floor after a dive. */
  down: number;
  /** Penalty: pre-committed side (−1 / 0 / +1 in world y), null = none. */
  guess: number | null;
  /** How much of the ball's side-spin he anticipates (0..1). */
  spinRead: number;
  /** Seconds the keeper has been holding the ball. */
  holdT: number;
  /** Dive bookkeeping. */
  diveT: number;
  diveSide: number;
  diveTarget: Vec3 | null;
  /** Lateral bias while a free kick is being lined up (covers the far side of the wall). */
  bias: number;
  /** Cooldown before another smother / claim attempt. */
  smother: number;
  /** Identity of the ball's current flight (kick id + last toucher): a change means a new reaction. */
  touchKey: string;
  /** Sim time of the keeper's last touch (no instant re-catch of his own parry / kick). */
  lastTouch: number;
  /** Flight time of the current shot at his first read (long flights make him commit early). */
  flight: number;
}

export interface Agent {
  i: number;
  id: string;
  st: MomentPlayerState;
  spec: MomentPlayerSpec;
  a: Attributes;
  side: Side;
  /** +1 attacks toward +x. */
  dir: 1 | -1;
  isGK: boolean;
  isUser: boolean;
  slot: SlotDef;
  target: Vec2;
  /** 0 = stand, ~0.55 jog, 0.8 run, 1 sprint. */
  urgency: number;
  duty: Duty;
  topSpeed: number;
  accel: number;
  /** Cooldown before the next kick / tackle / control attempt. */
  cool: number;
  /** Can't move or act (fallen, beaten). */
  stun: number;
  /** Time to the next AI decision. */
  think: number;
  /** Dribble touch phase (0..1). */
  touch: number;
  touchPeriod: number;
  /** Header / wall jump time left. */
  jump: number;
  markIdx: number;
  /** Teammate (agent index) whose pass this agent received; −1 none. */
  receivedFrom: number;
  /** Seconds this agent has been the ball carrier. */
  carryT: number;
  /** Seconds left of an off-ball forward run. */
  runT: number;
  runTarget: Vec2 | null;
  keeper: KeeperMem | null;
  /** Rough reaction time (s) used when predicting interceptions. */
  reaction: number;
  /** Seconds the current one-shot animation (kick, tackle, dive …) stays locked. */
  animLock: number;
  /** Kick-noise multiplier (opponent sharpness from difficulty). */
  noise: number;
  /** Earliest intercept estimate for the loose ball (AI coordinator). */
  eit: number;
  eitPoint: Vec2 | null;
  /** Free-kick wall member: stays put until the kick, then jumps. */
  wall: boolean;
  /** Drill mannequin / inactive player (never moves). */
  passive: boolean;
}

export interface KickRec {
  id: number;
  by: number;
  side: Side;
  t: number;
  kind: KickKind;
  isShot: boolean;
  /** Intended receiver (agent index) for passes, −1 for none / unknown. */
  target: number;
  from: Vec2;
  xg: number;
  /** Agent indices in an offside position at the moment of the pass. */
  offside: number[];
  /** Kicker's attack direction. */
  dir: 1 | -1;
  /** Shot classification once known. */
  result: 'pending' | 'goal' | 'saved' | 'missed' | 'woodwork' | 'blocked';
  onTarget: boolean;
  /** Assisting teammate index for shots (−1 none). */
  assistBy: number;
  /** Set-piece kick (free kick / penalty / corner). */
  setPiece: boolean;
  curl: number;
  /** For passes: has it been received by a teammate. */
  completed: boolean;
  /** An opponent touched / deflected the ball after this kick. */
  oppTouched: boolean;
  /** Kick taken by the user. */
  user: boolean;
  /** Lofted delivery into the box (cross / corner). */
  cross: boolean;
}

export interface PathSample { t: number; x: number; y: number; z: number }

export interface UserLog {
  shots: number;
  shotsOnTarget: number;
  passes: number;
  passesCompleted: number;
  keyPasses: number;
  dribbles: number;
  tackles: number;
  tackleAttempts: number;
  interceptions: number;
  foulsWon: number;
  foulsConceded: number;
  goals: number;
  assists: number;
  headers: number;
  controls: number;
  clearances: number;
  blocks: number;
  curlKicks: number;
  sprintTime: number;
  lostBall: boolean;
  tackleLost: boolean;
  /** Best xG of the user's shots. */
  bestXg: number;
  lastShot: KickRec | null;
  woodwork: boolean;
  /** User committed an error that led to the opponents' chance. */
  error: boolean;
  calledForBall: boolean;
  /** User won the ball (tackle / interception) — time it happened (−1 never). */
  wonBallT: number;
  wonBy: 'tackle' | 'interception' | null;
  /** User cleared the ball while defending. */
  cleared: boolean;
  /** User was dispossessed / user's pass was cut out — time (−1 never). */
  lostT: number;
  /** User's tackle missed / user was beaten while defending. */
  beaten: boolean;
  /** Time of the user's last touch (−1 never). */
  lastTouchT: number;
  /** Time spent with the ball at the user's feet. */
  carryTime: number;
  /** Shots taken under pressure (composure xp). */
  pressuredShots: number;
  /** Seconds since the user's last input (idle detection). */
  idle: number;
}

export const newUserLog = (): UserLog => ({
  shots: 0, shotsOnTarget: 0, passes: 0, passesCompleted: 0, keyPasses: 0, dribbles: 0, tackles: 0, tackleAttempts: 0,
  interceptions: 0, foulsWon: 0, foulsConceded: 0, goals: 0, assists: 0, headers: 0, controls: 0, clearances: 0, blocks: 0,
  curlKicks: 0, sprintTime: 0, lostBall: false, tackleLost: false, bestXg: 0, lastShot: null, woodwork: false, error: false,
  calledForBall: false, wonBallT: -1, wonBy: null, cleared: false, lostT: -1, beaten: false, lastTouchT: -1, carryTime: 0,
  pressuredShots: 0, idle: 0,
});

export const v2c = (v: Vec2): Vec2 => ({ x: v.x, y: v.y });
