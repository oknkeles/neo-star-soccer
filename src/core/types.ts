/**
 * Neo Star Soccer — shared domain model.
 *
 * THIS FILE IS THE CONTRACT BETWEEN MODULES. Do not rename or remove fields.
 * Adding optional fields is fine when a module genuinely needs it.
 *
 * Conventions
 *  - All money is in euros (€), integers. Wages are WEEKLY.
 *  - Attribute / meter scales are 0..100 unless noted (player attributes 1..99).
 *  - `season` is the starting calendar year of a season (2026 → 2026/27).
 *  - `week` is a calendar index inside a season: 0..51 (see competition calendar).
 *  - Pitch coordinates are metres. x ∈ [-52.5, 52.5] along length, y ∈ [-34, 34]
 *    across width, z is height. In match moments the user's team ALWAYS attacks +x.
 */

// ───────────────────────────── basics ─────────────────────────────

export type Lang = 'tr' | 'en';
export type Localized = Record<Lang, string>;

/** The 8 playable countries (top 7 European leagues + Türkiye). */
export type CountryCode = 'ENG' | 'ESP' | 'ITA' | 'GER' | 'FRA' | 'POR' | 'NED' | 'TUR';
/** Footballing nation code (3 letters), e.g. 'TUR', 'BRA', 'ARG', 'NGA'. Superset of CountryCode. */
export type NationCode = string;

export interface Vec2 { x: number; y: number }
export interface Vec3 { x: number; y: number; z: number }

/** Serializable PRNG state (see core/rng.ts). */
export type RngState = [number, number, number, number];

// ───────────────────────────── players ─────────────────────────────

export type Position = 'GK' | 'CB' | 'FB' | 'DM' | 'CM' | 'AM' | 'W' | 'ST';
/** Positions a human can choose for their career (no GK). */
export type PlayablePosition = 'CB' | 'FB' | 'CM' | 'AM' | 'W' | 'ST';
export type Foot = 'L' | 'R';

export interface Attributes {
  // technical
  shooting: number;   // shot power + accuracy
  curl: number;       // max side-spin ("falso")
  passing: number;
  dribbling: number;
  firstTouch: number;
  heading: number;
  tackling: number;
  // physical
  pace: number;
  acceleration: number;
  stamina: number;
  strength: number;
  jumping: number;
  // mental
  vision: number;     // longer trajectory preview, better AI pass choices
  composure: number;  // less aim noise under pressure, longer slow-mo focus
  positioning: number;
  // goalkeeping (only meaningful for GKs; low for outfielders)
  goalkeeping: number;
}
export type AttrKey = keyof Attributes;

export interface Appearance {
  skin: number;       // 0..5 palette index
  hairStyle: number;  // 0..7 (0 = bald)
  hairColor: string;  // css colour
  beard: number;      // 0..3
  boots: string;      // css colour
  height: number;     // cm
}

export interface Injury {
  key: string;         // i18n key, e.g. 'hamstring'
  weeksLeft: number;
  severity: 1 | 2 | 3;
}

export interface StatLine {
  apps: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  ratingSum: number;   // sum of match ratings; avg = ratingSum / apps
  motm: number;
  yellow: number;
  red: number;
  cleanSheets: number;
}

export type SquadRole = 'prospect' | 'rotation' | 'starter' | 'star';

export interface Contract {
  clubId: string;
  wage: number;              // weekly €
  startSeason: number;
  endSeason: number;         // contract expires at the END of this season
  releaseClause: number | null;
  role: SquadRole;           // promised role → affects selection & happiness
  goalBonus: number;
  appearanceBonus: number;
  loan?: { parentClubId: string; endSeason: number };
}

export type TraitId =
  | 'big_game' | 'glass_bones' | 'late_bloomer' | 'wonderkid' | 'leader' | 'showman'
  | 'hothead' | 'iron_man' | 'set_piece_specialist' | 'clinical' | 'playmaker' | 'speedster'
  | 'fan_favourite' | 'media_darling' | 'family_first' | 'party_animal' | 'workaholic'
  | 'loyal' | 'mercenary' | 'calm' | 'trickster' | 'aerial_threat';

/** Every footballer in the world — AI players AND the user's player. */
export interface Footballer {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  nation: NationCode;
  birthYear: number;
  position: Position;
  foot: Foot;
  weakFoot: number;           // 1..5 (5 = two-footed)
  attrs: Attributes;
  potential: number;          // hidden ceiling for overall, 40..99
  clubId: string | null;      // null = free agent / retired
  shirtNumber: number;
  contract: Contract | null;
  form: number;               // 0..100 (50 = neutral)
  fitness: number;            // 0..100 match sharpness / freshness
  morale: number;             // 0..100
  injury: Injury | null;
  value: number;              // market value €
  appearance: Appearance;
  traits: TraitId[];
  season: StatLine;           // current season (all competitions)
  career: StatLine;           // career totals
  intlCaps: number;
  intlGoals: number;
  retired?: boolean;
  isUser?: boolean;
}

// ───────────────────────────── clubs & people ─────────────────────────────

export type Formation = '4-4-2' | '4-3-3' | '4-2-3-1' | '3-5-2' | '5-3-2' | '4-1-4-1';
export type TacticalStyle = 'possession' | 'counter' | 'direct' | 'pressing' | 'balanced' | 'defensive';
export type KitStyle = 'plain' | 'stripes' | 'hoops' | 'halves' | 'sash';

export interface Kit {
  primary: string;    // css colours
  secondary: string;
  style: KitStyle;
}

export interface Club {
  id: string;
  name: string;
  shortName: string;          // 3 letters, e.g. 'IST'
  nickname: string;
  city: string;
  country: CountryCode;
  tier: 1 | 2;
  founded: number;
  kit: Kit;
  awayKit: Kit;
  reputation: number;         // 1..100
  budget: number;             // transfer budget €
  wageBudget: number;         // weekly €
  stadium: { name: string; capacity: number };
  facilities: number;         // 1..100 training quality
  youth: number;              // 1..100 academy quality
  style: TacticalStyle;
  formation: Formation;
  managerId: string;
  squad: string[];            // footballer ids
  derbyRivals: string[];      // club ids
}

export type ManagerTemperament = 'calm' | 'fiery' | 'demanding' | 'mentor' | 'pragmatic';

export interface Manager {
  id: string;
  firstName: string;
  lastName: string;
  nation: NationCode;
  birthYear: number;
  style: TacticalStyle;
  temperament: ManagerTemperament;
  trustsYouth: number;        // 0..100
  reputation: number;         // 1..100
  clubId: string | null;
}

export type PersonRole = 'agent' | 'father' | 'mother' | 'sibling' | 'partner' | 'friend' | 'journalist' | 'director';

/** Non-footballer characters in the user's life. */
export interface Person {
  id: string;
  name: string;
  role: PersonRole;
  personality: string;        // short descriptor, e.g. 'ambitious, blunt'
  bio: string;
  relationship: number;       // 0..100
}

export interface NationalTeam {
  id: string;                 // 'NT-TUR'
  nation: NationCode;
  name: Localized;
  kit: Kit;
  reputation: number;         // 1..100
  /** Footballer ids. Includes generated "abroad" players with clubId null + externalClub. */
  squad: string[];
  managerName: string;
}

export interface LeagueDef {
  id: string;                 // e.g. 'ENG-1'
  country: CountryCode;
  tier: 1 | 2;
  name: string;               // fictionalised, e.g. 'Premier Division', 'Süper Lig'
  teams: number;
  promote: number;            // tier 2: number promoted
  relegate: number;           // tier 1: number relegated
  continentalSpots: number;   // tier 1: Champions Cup spots
  strength: number;           // 1..100 league quality
}

export interface World {
  leagues: LeagueDef[];
  clubs: Record<string, Club>;
  players: Record<string, Footballer>;
  managers: Record<string, Manager>;
  nationalTeams: Record<string, NationalTeam>;
  /** Generated "abroad" players for national teams: footballer id → fictional club label. */
  externalClubs: Record<string, string>;
}

// ───────────────────────────── competitions ─────────────────────────────

export type CompetitionKind = 'league' | 'cup' | 'continental' | 'international';

export interface Fixture {
  id: string;
  compId: string;
  season: number;
  week: number;
  slot: 'weekend' | 'midweek';
  round: number;              // matchday or knockout round index
  roundName?: string;         // e.g. 'Quarter-final'
  homeId: string;             // club id or national team id
  awayId: string;
  neutral?: boolean;
  leg?: 1 | 2;
  played: boolean;
  homeGoals?: number;
  awayGoals?: number;
  pens?: { home: number; away: number };
  scorers?: { playerId: string; minute: number; side: 'home' | 'away' }[];
  userInvolved?: boolean;     // user's team plays in it
}

export interface TableRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
  form: ('W' | 'D' | 'L')[];  // last 5, most recent last
}

export interface Competition {
  id: string;                 // e.g. 'ENG-1-2026', 'CUP-TUR-2026', 'CC-2026', 'WC-2030'
  kind: CompetitionKind;
  name: string;
  shortName: string;
  country?: CountryCode;
  tier?: 1 | 2;
  season: number;
  teamIds: string[];
  fixtures: Fixture[];
  /** League tables; for group stages keyed by group name ('A'..'H'). 'main' for leagues. */
  tables: Record<string, TableRow[]>;
  stage: string;              // free-form current stage label, e.g. 'group', 'R16', 'final', 'done'
  winnerId: string | null;
  prizeMoney: number;
  /** Per-competition player stats (competition module): top scorers, league MVP, tournament awards. */
  playerStats?: Record<string, CompPlayerStats>;
}

/** A footballer's numbers inside one competition (teamId = last team they played for in it). */
export interface CompPlayerStats {
  teamId: string;
  apps: number;
  goals: number;
  assists: number;
  ratingSum: number;
  motm: number;
}

// ───────────────────────────── user career ─────────────────────────────

export type RelKey = 'manager' | 'teammates' | 'fans' | 'media' | 'family' | 'partner' | 'agent' | 'sponsors';
export type Relationships = Record<RelKey, number>;

export interface OwnedItem { itemId: string; boughtSeason: number; boughtWeek: number }

export interface SponsorDeal {
  id: string;
  brand: string;
  category: string;           // 'boots' | 'drinks' | 'watches' | ...
  weekly: number;             // € per week
  endSeason: number;
  requirement?: string;       // i18n-free text, e.g. 'Fame ≥ 40'
}

export interface Trophy {
  compId: string;
  name: string;
  season: number;
  teamId: string;
}

export interface Award {
  key: string;                // 'golden_ball' | 'league_top_scorer' | 'young_player' | 'league_mvp' | 'team_of_season' | ...
  name: string;
  season: number;
  detail?: string;
  /** Recipient (competition module fills these for every award it computes). */
  playerId?: string;
  teamId?: string;
}

export interface CareerSeasonRecord {
  season: number;
  clubId: string;
  clubName: string;
  league: string;
  leaguePos: number | null;
  stats: StatLine;
  avgRating: number;
  overall: number;            // user overall at end of season
  value: number;
  trophies: string[];
}

export interface UserMatchRecord {
  fixtureId: string;
  season: number;
  week: number;
  compName: string;
  opponent: string;
  home: boolean;
  goalsFor: number;
  goalsAgainst: number;
  rating: number;
  goals: number;
  assists: number;
  minutes: number;
  motm: boolean;
}

export interface CareerGoal {
  id: string;
  text: string;               // already localized at generation time
  kind: 'win_comp' | 'play_for_club' | 'golden_ball' | 'season_goals' | 'caps' | 'value' | 'custom';
  target?: string | number;
  done: boolean;
  doneSeason?: number;
}

export interface CareerGenesis {
  hometown: string;
  hometownClubId: string | null;
  backstory: string;
  motto: string;
  dream: string;
  theme: string;              // one-line flavour of this career run
  destinyHint: string;        // cryptic teaser about hidden potential
  family: Person[];
  agent: Person;
  rivalBlurb: string;
  mentorBlurb: string;
  goals: CareerGoal[];
  ai: boolean;                // generated by LLM?
}

export interface UserCareer {
  playerId: string;           // id in world.players
  money: number;
  fame: number;               // 0..100
  followers: number;
  energy: number;             // 0..100 (activities/matches consume; rest restores)
  relationships: Relationships;
  people: Person[];           // agent, family, partner (if any), friends
  partnerId: string | null;
  rivalId: string;            // footballer id
  mentorId: string | null;    // footballer id (veteran teammate)
  inventory: OwnedItem[];
  sponsors: SponsorDeal[];
  xp: Partial<Record<AttrKey, number>>;   // progress toward next attribute point (0..100 each)
  trainingFocus: TrainingFocus;
  actionsLeft: number;        // activities left this week
  trophies: Trophy[];
  awards: Award[];
  history: CareerSeasonRecord[];
  matches: UserMatchRecord[]; // most recent last; keep last ~200
  genesis: CareerGenesis;
  setPieces: { freeKicks: boolean; penalties: boolean; corners: boolean };
  transferListed: boolean;
  nationalTeamId: string | null;  // set when called up at least once
  calledUp: boolean;              // in current national squad
  retired: boolean;
  hallOfFame: number;         // legacy score
  lastWeekReport?: WeekReport;
  /** Retirement documentary text (written once on retirement). */
  biography?: string;
}

export type TrainingFocus = 'balanced' | 'shooting' | 'passing' | 'dribbling' | 'physical' | 'defending' | 'setpieces' | 'mental';

// ───────────────────────────── effects, events, messages ─────────────────────────────

/** Bounded side-effects. Applied via career API `applyEffects`, which clamps everything. */
export interface Effects {
  money?: number;
  fame?: number;
  followers?: number;
  energy?: number;
  morale?: number;            // user footballer morale
  form?: number;
  rel?: Partial<Record<RelKey, number>>;
  xp?: Partial<Record<AttrKey, number>>;
  injuryWeeks?: number;
  flags?: Record<string, string | number | boolean>;
}

export interface EventChoice {
  id: string;
  label: string;
  effects: Effects;
  resultText?: string;
  /** Optional gamble: with probability `chance` the risk effects apply instead/in addition. */
  risk?: { chance: number; effects: Effects; text: string };
}

export interface GameEvent {
  id: string;
  defId: string;              // template id or 'ai'
  season: number;
  week: number;
  title: string;
  body: string;
  icon: string;               // lucide icon name or emoji
  persona?: string;           // who brings it (name)
  choices: EventChoice[];
  source: 'template' | 'ai';
  storylineId?: string;
  resolved?: { choiceId: string; text: string };
}

export type InboxKind = 'offer' | 'event' | 'info' | 'sponsor' | 'callup' | 'award' | 'contract' | 'manager' | 'press' | 'injury' | 'story';

export interface InboxMessage {
  id: string;
  season: number;
  week: number;
  kind: InboxKind;
  from: string;
  subject: string;
  body: string;
  read: boolean;
  /** Reference to an actionable object: offer id, event id, press id ... */
  ref?: { type: 'offer' | 'event' | 'press' | 'sponsor' | 'negotiation'; id: string };
}

export interface NewsArticle {
  id: string;
  season: number;
  week: number;
  outlet: string;             // fictional newspaper name
  headline: string;
  body: string;
  tags: string[];             // 'transfer' | 'match' | 'user' | 'rival' | 'league' | 'scandal' | ...
  importance: number;         // 0..1
  aboutUser: boolean;
  ai: boolean;
}

export interface SocialPost {
  id: string;
  season: number;
  week: number;
  author: {
    name: string;
    handle: string;
    kind: 'fan' | 'journalist' | 'player' | 'club' | 'rival' | 'partner' | 'user' | 'pundit' | 'brand';
    verified: boolean;
  };
  text: string;
  likes: number;
  reposts: number;
  sentiment: number;          // -1..1
  ai: boolean;
}

export interface Storyline {
  id: string;
  kind: string;               // 'rival' | 'mentor' | 'injury_comeback' | 'hometown' | 'manager_feud' | 'love' | 'scandal' | 'wonderkid_threat' | ...
  stage: number;
  startedSeason: number;
  data: Record<string, string | number | boolean>;
  active: boolean;
}

// ───────────────────────────── transfers ─────────────────────────────

export interface ContractTerms {
  wage: number;               // weekly €
  years: number;              // 1..5
  releaseClause: number | null;
  role: SquadRole;
  signingBonus: number;
  goalBonus: number;
}

export type OfferKind = 'transfer' | 'loan' | 'free' | 'renewal' | 'trial';
export type OfferStatus = 'pending' | 'negotiating' | 'accepted' | 'rejected' | 'expired' | 'withdrawn' | 'blocked';

export interface TransferOffer {
  id: string;
  kind: OfferKind;
  fromClubId: string;
  season: number;
  week: number;
  expiresWeek: number;        // absolute index: season*100 + week
  fee: number;                // fee paid to current club (0 for free/renewal)
  terms: ContractTerms;
  status: OfferStatus;
  parentClubAccepts: boolean; // would the current club sell at this fee?
  note: string;               // short pitch from the club, localized
}

export interface NegotiationLine {
  from: 'club' | 'player' | 'agent' | 'system';
  text: string;
  terms?: ContractTerms;
}

export interface Negotiation {
  offerId: string;
  clubId: string;
  round: number;
  maxRounds: number;
  patience: number;           // 0..100; 0 → talks collapse
  current: ContractTerms;     // the club's current proposal
  /** Hidden limits computed by game logic; the LLM can never exceed them. */
  limits: { maxWage: number; maxYears: number; minReleaseClause: number | null; maxSigningBonus: number; maxGoalBonus: number; roles: SquadRole[] };
  lines: NegotiationLine[];
  status: 'open' | 'agreed' | 'collapsed';
}

// ───────────────────────────── calendar & reports ─────────────────────────────

export interface WeekInfo {
  season: number;
  week: number;
  date: string;               // ISO date of the weekend
  label: Localized;           // e.g. 'Hafta 12' / 'Week 12'
  phase: 'preseason' | 'season' | 'summer';
  transferWindow: boolean;
  internationalBreak: boolean;
  tournament: boolean;        // summer international tournament running
}

export interface WeekReport {
  season: number;
  week: number;
  results: { fixtureId: string; text: string }[];
  userMatches: string[];      // fixture ids played by user this week
  progression: { attr: AttrKey; delta: number }[];
  moneyDelta: number;
  messages: string[];         // localized short notes
  seasonEnded?: boolean;
}

export interface SeasonSummary {
  season: number;
  champions: Record<string, string>;     // compId → winner team id
  awards: Award[];
  userRecord?: CareerSeasonRecord;
  promoted: string[];
  relegated: string[];
}

// ───────────────────────────── settings ─────────────────────────────

export type AIFeature = 'genesis' | 'news' | 'social' | 'press' | 'negotiation' | 'events' | 'chat' | 'biography';
export type CameraMode = 'behind' | 'broadcast' | 'top';

export interface Settings {
  lang: Lang;
  ai: {
    enabled: boolean;
    apiKey: string;
    model: string;            // 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-4-5'
    features: Record<AIFeature, boolean>;
  };
  graphics: { quality: 'low' | 'medium' | 'high'; shadows: boolean };
  audio: { master: number; sfx: number; crowd: number; muted: boolean };
  camera: CameraMode;
  difficulty: 'easy' | 'normal' | 'hard';
  slowmoAim: boolean;
  matchSpeed: number;         // ticker speed multiplier 0.5..4
  /** Real-time match view: '2d' top-down (default, easiest to play) or '3d'. */
  matchView?: '2d' | '3d';
}

// ───────────────────────────── game state ─────────────────────────────

export interface GameState {
  schema: number;             // save schema version
  id: string;
  createdAt: number;
  savedAt: number;
  seed: number;
  rng: RngState;
  lang: Lang;                 // language narrative content was generated in
  season: number;
  week: number;
  world: World;
  competitions: Record<string, Competition>;  // current season (+ running international tournaments)
  career: UserCareer;
  inbox: InboxMessage[];
  news: NewsArticle[];
  social: SocialPost[];
  events: GameEvent[];        // pending + recently resolved
  offers: TransferOffer[];
  negotiation: Negotiation | null;
  storylines: Storyline[];
  seasons: SeasonSummary[];   // completed seasons
  flags: Record<string, string | number | boolean>;
  idCounter: number;
  /** Chat histories with personas (agent, manager, mentor, partner, family, rival), keyed by persona kind. */
  chats?: Record<string, { from: 'user' | 'persona'; text: string }[]>;
}

// ───────────────────────────── match: macro level ─────────────────────────────

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog';
export interface Weather {
  kind: WeatherKind;
  time: 'day' | 'dusk' | 'night';
  wind: Vec2;                 // m/s, affects ball flight
  temperature: number;        // °C
}

export interface TeamSheet {
  teamId: string;             // club id or national team id
  name: string;
  shortName: string;
  kit: Kit;
  formation: Formation;
  style: TacticalStyle;
  xi: string[];               // 11 footballer ids, index 0 = GK, then roughly back→front
  bench: string[];
  strength: { att: number; mid: number; def: number; gk: number; overall: number };
}

export type UserMatchRole = 'starter' | 'bench' | 'none';

export interface MatchContext {
  fixtureId: string;
  compId: string;
  compName: string;
  home: TeamSheet;
  away: TeamSheet;
  userSide: 'home' | 'away' | null;
  userRole: UserMatchRole;
  weather: Weather;
  importance: number;         // 0..1 (derby, final, title decider...)
  derby: boolean;
  knockout: boolean;          // needs a winner (extra time + pens)
  stadium: string;
  attendance: number;
}

export type MatchEventKind = 'goal' | 'own_goal' | 'penalty_goal' | 'penalty_miss' | 'yellow' | 'red' | 'injury' | 'sub' | 'chance' | 'save' | 'woodwork' | 'kickoff' | 'halftime' | 'fulltime' | 'moment' | 'var' | 'extra_time' | 'shootout';

export interface MatchEvent {
  minute: number;
  kind: MatchEventKind;
  side: 'home' | 'away' | null;
  playerId?: string;
  assistId?: string;
  text: string;               // commentary line, localized
  user?: boolean;             // involves the user's player
}

export interface UserMatchStats {
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  passes: number;
  passesCompleted: number;
  keyPasses: number;
  dribbles: number;
  tackles: number;
  interceptions: number;
  foulsWon: number;
  foulsConceded: number;
  moments: number;
}

export interface MatchSummary {
  fixtureId: string;
  homeGoals: number;
  awayGoals: number;
  pens?: { home: number; away: number };
  events: MatchEvent[];
  possession: number;         // home %
  shots: { home: number; away: number };
  xg: { home: number; away: number };
  ratings: Record<string, number>;   // footballer id → rating 3.0..10.0
  motmId: string | null;
  user?: { rating: number; stats: UserMatchStats; xp: Partial<Record<AttrKey, number>>; highlights: number };
  /** Starting XIs (footballer ids). */
  lineups?: { home: string[]; away: string[] };
  /** Minutes played per footballer id (starters and substitutes). */
  minutes?: Record<string, number>;
}

// ───────────────────────────── match: moment level (real-time) ─────────────────────────────

export type MomentType =
  | 'open_play' | 'counter' | 'one_on_one' | 'cross_receive' | 'wing_cross' | 'build_up' | 'defend'
  | 'free_kick' | 'penalty' | 'corner'
  | 'drill_free_kick' | 'drill_finishing' | 'drill_passing';

export interface MomentPlayerSpec {
  id: string;
  name: string;               // display name (surname)
  number: number;
  side: 'us' | 'them';
  role: Position;
  isUser: boolean;
  attrs: Attributes;
  foot: Foot;
  weakFoot: number;
  fitness: number;            // 0..100
  appearance: Appearance;
}

export interface MomentTeamSpec {
  name: string;
  shortName: string;
  kit: Kit;
  formation: Formation;
  style: TacticalStyle;
  players: MomentPlayerSpec[]; // up to 11 (GK first)
}

export interface MomentSetup {
  type: MomentType;
  seed: number;
  minute: number;
  us: MomentTeamSpec;
  them: MomentTeamSpec;
  userId: string;
  weather: Weather;
  difficulty: number;         // 0..1 (opponent sharpness; from settings + opponent strength)
  /** 0..100: how willing teammates are to pass to the user (teammate relationship + form). */
  teammateTrust: number;
  score: { us: number; them: number };
  importance: number;
  timeLimit: number;          // seconds of simulated play before the moment auto-ends
  /** Optional placement for set pieces (ball spot), in the us-attack-+x frame. */
  spot?: Vec2;
  /** Drill-only: number of attempts / targets. */
  drill?: { attempts: number };
}

export interface KickParams {
  dir: Vec2;                  // normalized ground direction
  power: number;              // 0..1
  loft: number;               // 0..1  (0 = along the ground, 1 = high lob)
  curl: number;               // -1..1 (+ = ball bends to the LEFT of travel direction, i.e. counter-clockwise from above)
}

export type ControlCommand =
  | { kind: 'move'; target: Vec2 | null }          // run toward a point (null = stop)
  | { kind: 'moveDir'; dir: Vec2 }                  // keyboard direction; zero vector = stop
  | { kind: 'sprint'; on: boolean }
  | { kind: 'aimStart' }                            // user started a kick gesture (engine may slow time)
  | { kind: 'aimCancel' }
  | { kind: 'kick'; params: KickParams }
  | { kind: 'aftertouch'; spin: number }            // -1..1 extra curl shortly after the kick
  | { kind: 'callForBall'; through: boolean }
  | { kind: 'tackle'; slide: boolean }
  | { kind: 'skip' };                               // auto-resolve the rest of the moment

export type AnimState =
  | 'idle' | 'run' | 'sprint' | 'dribble' | 'kick' | 'pass' | 'header' | 'volley'
  | 'tackle' | 'slide' | 'dive_left' | 'dive_right' | 'catch' | 'fall' | 'celebrate' | 'wall_jump' | 'gk_ready';

export interface MomentPlayerState {
  id: string;
  side: 'us' | 'them';
  role: Position;
  isUser: boolean;
  pos: Vec2;
  vel: Vec2;
  facing: number;             // radians, 0 = +x
  anim: AnimState;
  animTime: number;           // seconds in current anim
  stamina: number;            // 0..1
  hasBall: boolean;
  inWall?: boolean;
}

export interface BallState {
  pos: Vec3;
  vel: Vec3;
  spin: Vec3;                 // angular velocity rad/s (z = side spin)
  ownerId: string | null;
  lastTouchId: string | null;
  lastTouchSide: 'us' | 'them' | null;
}

export type MomentOutcome =
  | 'goal' | 'assist' | 'chance_created' | 'saved' | 'missed' | 'woodwork' | 'blocked'
  | 'lost_ball' | 'offside' | 'foul_won' | 'penalty_won' | 'tackle_won' | 'interception'
  | 'tackle_lost' | 'foul_conceded' | 'pass_completed' | 'cleared' | 'conceded' | 'timeout'
  | 'drill_complete';

export type MomentPhase = 'intro' | 'live' | 'aiming' | 'flight' | 'outcome' | 'ended';

export interface MomentState {
  time: number;               // simulated seconds since start
  timeScale: number;          // 1 = normal, <1 slow-motion
  phase: MomentPhase;
  ball: BallState;
  players: MomentPlayerState[];
  focus: number;              // 0..1 slow-mo aiming budget left
  offsideLineX: number | null;
  banner: string | null;      // big overlay text e.g. 'GOOOL!' (localized)
  outcome: MomentOutcome | null;
  drill?: { attempt: number; attempts: number; score: number };
}

export type MomentEvent =
  | { t: 'whistle'; kind: 'start' | 'stop' | 'foul' | 'offside' }
  | { t: 'kick'; by: string; speed: number; shot: boolean }
  | { t: 'receive'; by: string; from: string | null; side: 'us' | 'them' }
  | { t: 'shot'; by: string; onTarget: boolean; xg: number }
  | { t: 'save'; by: string; held: boolean }
  | { t: 'woodwork'; part: 'post' | 'bar' }
  | { t: 'goal'; scorer: string; assist: string | null; side: 'us' | 'them' }
  | { t: 'tackle'; by: string; on: string; won: boolean; foul: boolean }
  | { t: 'offside'; player: string }
  | { t: 'out'; restart: 'goal_kick' | 'corner' | 'throw_in' }
  | { t: 'near_miss'; by: string }
  | { t: 'header'; by: string }
  | { t: 'call'; by: string }
  | { t: 'aim'; on: boolean }
  | { t: 'net' }
  | { t: 'bounce'; speed: number }
  | { t: 'crowd'; level: number }   // 0..1 excitement for audio
  | { t: 'end'; outcome: MomentOutcome };

export interface ReplayFrame {
  t: number;
  ball: Vec3;
  players: { id: string; x: number; y: number; facing: number; anim: AnimState }[];
}

export interface MomentStats {
  shots: number;
  shotsOnTarget: number;
  passes: number;
  passesCompleted: number;
  keyPasses: number;
  dribbles: number;
  tackles: number;
  interceptions: number;
  foulsWon: number;
  foulsConceded: number;
  goals: number;
  assists: number;
}

export interface MomentResult {
  type: MomentType;
  outcome: MomentOutcome;
  goalFor: boolean;           // our team scored during the moment
  goalAgainst: boolean;       // opponent scored during the moment
  scorerId: string | null;
  assistId: string | null;
  stats: MomentStats;         // user's personal stats in the moment
  ratingDelta: number;        // −1.5 .. +2.0 contribution to the user's match rating
  xp: Partial<Record<AttrKey, number>>;
  followUp: { type: 'free_kick' | 'penalty' | 'corner'; spot: Vec2 } | null;
  highlight: boolean;
  replay: ReplayFrame[];      // empty if not recorded
  skipped: boolean;
  drillScore?: number;        // drills only: 0..100
}
