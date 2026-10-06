import type { Formation, Kit, KitStyle, TacticalStyle } from '../../core/types';

/** Kit colours tuned to read well on a green pitch and in small UI badges. */
export const C = {
  white: '#f7f7f4',
  cream: '#efe6cf',
  black: '#16171a',
  charcoal: '#2f3439',
  grey: '#6b737c',
  silver: '#c3c9cf',
  red: '#d0202e',
  scarlet: '#e0312b',
  crimson: '#b0122b',
  maroon: '#6e1423',
  claret: '#7b1e3b',
  bordeaux: '#5e1022',
  navy: '#14234b',
  royal: '#1f4fb4',
  cobalt: '#1d4fa3',
  blue: '#2a64c8',
  savoy: '#1f5fbf',
  azure: '#2f7fd8',
  sky: '#7cb8e8',
  cyan: '#2bb8d6',
  teal: '#0f8a8a',
  turquoise: '#22b3a6',
  green: '#138a43',
  emerald: '#0e7a4f',
  forest: '#0b4d32',
  lime: '#9bd13a',
  yellow: '#ffd21f',
  gold: '#e9b61d',
  amber: '#f2a516',
  orange: '#f26b1d',
  tangerine: '#ff8a1e',
  copper: '#b5651d',
  purple: '#5a2d8c',
  violet: '#7a3fb8',
  pink: '#e45b9b',
  brown: '#6d4027',
} as const;

export type KitTuple = [primary: string, secondary: string, style: KitStyle];

export const kit = ([primary, secondary, style]: KitTuple): Kit => ({ primary, secondary, style });

/** Hand-written club data. Ids, budgets, squads and managers are derived at world generation. */
export interface ClubSeed {
  name: string;
  /** 3 letters, unique inside the country (so promoted/relegated clubs never clash). */
  short: string;
  nick: string;
  city: string;
  founded: number;
  kit: KitTuple;
  away: KitTuple;
  stadium: string;
  cap: number;
  /** 1..100 reputation. */
  rep: number;
  style?: TacticalStyle;
  form?: Formation;
  /** Academy quality override (1..100). */
  youth?: number;
  /** Training facilities override (1..100). */
  fac?: number;
  /** Multiplier on the league's foreign-player share (e.g. 0.1 for a homegrown-only club). */
  foreign?: number;
  /** Classic rivalries by short name (same-city clubs are added automatically). */
  rivals?: string[];
}
