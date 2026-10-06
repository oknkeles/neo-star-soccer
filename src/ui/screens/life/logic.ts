/**
 * Pure helpers shared by the life screens (no React, no game-module calls) so they are
 * easy to unit-test. Everything here only reads plain GameState data.
 */
import type {
  Competition, ContractTerms, Effects, Fixture, Footballer, GameState, LeagueDef, MomentType, NewsArticle,
  Negotiation, Position, RelKey, SocialPost, SquadRole, TableRow,
} from '../../../core/types';
import { positionGroup, type PositionGroup } from '../../../core/ratings';
import { absWeek, clamp } from '../../../core/util';
import { getLang } from '../../../core/i18n';
import type { Lang } from '../../../core/types';

// ───────── match ratings ─────────

/** Background chip classes for a match rating (3.0..10.0). */
export function ratingChipClass(r: number): string {
  if (r >= 8) return 'bg-gold text-bg';
  if (r >= 7) return 'bg-accent text-bg';
  if (r >= 6) return 'bg-info/80 text-bg';
  if (r >= 5) return 'bg-white/15 text-ink';
  return 'bg-danger text-white';
}

export function ratingTextClass(r: number): string {
  if (r >= 8) return 'text-gold';
  if (r >= 7) return 'text-accent';
  if (r >= 6) return 'text-info';
  if (r >= 5) return 'text-ink-dim';
  return 'text-danger';
}

export const avgRating = (ratingSum: number, apps: number): number => (apps > 0 ? ratingSum / apps : 0);

// ───────── tables ─────────

export type Zone = 'title' | 'continental' | 'promotion' | 'relegation' | 'none';

/** Which coloured band a 1-based table position falls in. */
export function tableZone(pos: number, n: number, league?: Pick<LeagueDef, 'tier' | 'promote' | 'relegate' | 'continentalSpots'>): Zone {
  if (!league) return 'none';
  if (league.tier === 1) {
    if (pos === 1) return 'title';
    if (pos <= league.continentalSpots) return 'continental';
    if (league.relegate > 0 && pos > n - league.relegate) return 'relegation';
    return 'none';
  }
  if (pos <= league.promote) return 'promotion';
  if (league.relegate > 0 && pos > n - league.relegate) return 'relegation';
  return 'none';
}

export const ZONE_BAR: Record<Zone, string> = {
  title: 'bg-gold', continental: 'bg-info', promotion: 'bg-accent', relegation: 'bg-danger', none: 'bg-transparent',
};

/** Same ordering rule as the competition module: points, goal difference, goals for, name. */
export function sortRows(rows: TableRow[], nameOf: (id: string) => string): TableRow[] {
  return [...rows].sort((a, b) =>
    b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || nameOf(a.teamId).localeCompare(nameOf(b.teamId)));
}

// ───────── competitions & fixtures ─────────

const KIND_ORDER: Record<Competition['kind'], number> = { league: 0, cup: 1, continental: 2, international: 3 };

/** Competitions the user's club (or, when called up, national team) takes part in. */
export function userCompetitions(state: GameState): Competition[] {
  const p = state.world.players[state.career.playerId];
  const ids = new Set<string>();
  if (p?.clubId) ids.add(p.clubId);
  if (state.career.nationalTeamId && state.career.calledUp) ids.add(state.career.nationalTeamId);
  return Object.values(state.competitions)
    .filter((c) => c.teamIds.some((id) => ids.has(id)))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id));
}

export const isTournament = (c: Competition) => c.id.startsWith('WC-') || c.id.startsWith('CONT-');

/** Number of group matchdays (fixtures with round ≤ this belong to the group stage). */
export function groupRoundsOf(c: Competition): number {
  const groups = Object.keys(c.tables).filter((k) => k !== 'main').length;
  if (groups === 0) return 0;
  if (c.kind === 'continental') return 6;
  if (c.kind === 'international' && isTournament(c)) return 3;
  return 0;
}

export const groupNames = (c: Competition): string[] => Object.keys(c.tables).filter((k) => k !== 'main').sort();

export const hasKnockout = (c: Competition): boolean =>
  c.kind === 'cup' || (groupRoundsOf(c) > 0);

/** Knockout fixtures of a cup / tournament (everything after the group stage). */
export function knockoutFixtures(c: Competition): Fixture[] {
  const g = groupRoundsOf(c);
  return c.fixtures.filter((f) => f.round > g);
}

export interface BracketColumn { round: number; name: string; fixtures: (Fixture | null)[]; placeholder: boolean }

const STAGE_BY_TIES: Record<number, string> = { 1: 'F', 2: 'SF', 4: 'QF', 8: 'R16', 16: 'R32', 32: 'R64' };
export const stageKeyForTies = (ties: number): string => STAGE_BY_TIES[ties] ?? `R${ties * 2}`;

/** Columns of the knockout tree: played / drawn rounds plus empty placeholders up to the final. */
export function bracketColumns(c: Competition, stageName: (key: string) => string): BracketColumn[] {
  const ko = knockoutFixtures(c);
  const rounds = [...new Set(ko.map((f) => f.round))].sort((a, b) => a - b);
  const cols: BracketColumn[] = rounds.map((r) => {
    const fx = ko.filter((f) => f.round === r).sort((a, b) => a.id.localeCompare(b.id));
    return { round: r, name: fx[0]?.roundName ?? stageName(stageKeyForTies(fx.length)), fixtures: fx, placeholder: false };
  });
  let ties = cols.length ? Math.ceil(cols[cols.length - 1].fixtures.length / 2) : 0;
  let round = (rounds[rounds.length - 1] ?? 0) + 1;
  const lastRealIsFinal = cols.length > 0 && cols[cols.length - 1].fixtures.length <= 1;
  while (cols.length && !lastRealIsFinal && ties >= 1 && c.stage !== 'done') {
    cols.push({ round, name: stageName(stageKeyForTies(ties)), fixtures: Array.from({ length: ties }, () => null), placeholder: true });
    if (ties === 1) break;
    ties = Math.ceil(ties / 2);
    round++;
  }
  return cols;
}

export function fixtureWeeks(c: Competition, season: number): number[] {
  return [...new Set(c.fixtures.filter((f) => f.season === season || f.season === undefined).map((f) => f.week))].sort((a, b) => a - b);
}

/** The week to show first: this week if the competition plays then, else the next one, else the last. */
export function defaultWeek(weeks: number[], current: number): number {
  if (!weeks.length) return current;
  return weeks.find((w) => w >= current) ?? weeks[weeks.length - 1];
}

export function formLetterClass(l: 'W' | 'D' | 'L'): string {
  return l === 'W' ? 'bg-accent text-bg' : l === 'D' ? 'bg-white/25 text-ink' : 'bg-danger text-white';
}

export function fixtureOutcomeFor(f: Fixture, teamId: string): 'W' | 'D' | 'L' | null {
  if (!f.played || f.homeGoals === undefined || f.awayGoals === undefined) return null;
  const mine = f.homeId === teamId ? f.homeGoals : f.awayGoals;
  const theirs = f.homeId === teamId ? f.awayGoals : f.homeGoals;
  if (mine !== theirs) return mine > theirs ? 'W' : 'L';
  if (f.pens) {
    const m = f.homeId === teamId ? f.pens.home : f.pens.away;
    const o = f.homeId === teamId ? f.pens.away : f.pens.home;
    return m > o ? 'W' : 'L';
  }
  return 'D';
}

/** Local top-scorer ranking from per-competition stats (fallback when the API is unavailable). */
export function scorersFromStats(c: Competition, n: number): { playerId: string; goals: number; assists: number; teamId: string }[] {
  const stats = c.playerStats ?? {};
  return Object.entries(stats)
    .map(([playerId, s]) => ({ playerId, goals: s.goals, assists: s.assists, teamId: s.teamId }))
    .filter((r) => r.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.playerId.localeCompare(b.playerId))
    .slice(0, n);
}

// ───────── squads ─────────

export const POS_ORDER: Position[] = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];
export const GROUP_ORDER: PositionGroup[] = ['GK', 'DEF', 'MID', 'ATT'];

export function groupSquad(players: Footballer[], ovr: (p: Footballer) => number): Record<PositionGroup, Footballer[]> {
  const out: Record<PositionGroup, Footballer[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of players) out[positionGroup(p.position)].push(p);
  for (const g of GROUP_ORDER) {
    out[g].sort((a, b) => POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position) || ovr(b) - ovr(a));
  }
  return out;
}

export function formTone(form: number): 'text-accent' | 'text-ink-dim' | 'text-danger' {
  return form >= 62 ? 'text-accent' : form < 40 ? 'text-danger' : 'text-ink-dim';
}

// ───────── charts ─────────

export function polar(i: number, n: number, radius: number, cx: number, cy: number): { x: number; y: number } {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
}

/** SVG path of a radar polygon for values on a 0..max scale. */
export function radarPath(values: number[], max: number, radius: number, cx: number, cy: number): string {
  return values.map((v, i) => {
    const p = polar(i, values.length, (clamp(v, 0, max) / max) * radius, cx, cy);
    return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }).join(' ') + ' Z';
}

export interface LineGeometry { line: string; area: string; pts: { x: number; y: number }[] }

/** Smooth-ish polyline for a series; `min`/`max` default to the data range (with padding). */
export function lineGeometry(values: number[], w: number, h: number, pad = 6, min?: number, max?: number): LineGeometry {
  if (!values.length) return { line: '', area: '', pts: [] };
  const lo = min ?? Math.min(...values);
  let hi = max ?? Math.max(...values);
  if (hi === lo) hi = lo + 1;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const pts = values.map((v, i) => ({
    x: pad + (values.length === 1 ? iw / 2 : (i / (values.length - 1)) * iw),
    y: pad + ih - ((v - lo) / (hi - lo)) * ih,
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)} ${h - pad} L${pts[0].x.toFixed(1)} ${h - pad} Z`;
  return { line, area, pts };
}

// ───────── contracts & negotiation ─────────

export const ROLE_ORDER: SquadRole[] = ['prospect', 'rotation', 'starter', 'star'];

/** A "nice" step for a money value (≈5 % rounded to 1/2/5 × 10^n). */
export function niceStep(v: number): number {
  const raw = Math.max(250, Math.abs(v) * 0.05);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const m = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return m * pow;
}

export function stepMoney(v: number, dir: 1 | -1, min = 0, max = Infinity): number {
  const step = niceStep(v || 1000);
  return clamp(Math.round((v + dir * step) / step) * step, min, max);
}

export interface AskRanges {
  wage: [number, number]; years: [number, number]; signingBonus: [number, number]; goalBonus: [number, number]; releaseClause: [number, number];
}

/**
 * Slider ranges for the ask. They deliberately reach past the club's hidden limits
 * (greedy asks are possible — and cost patience) without revealing the limits themselves.
 */
export function askRanges(neg: Negotiation): AskRanges {
  const c = neg.current;
  const l = neg.limits;
  return {
    wage: [Math.max(100, Math.round(c.wage * 0.5)), Math.max(Math.round(l.maxWage * 1.35), Math.round(c.wage * 1.6))],
    years: [1, 5],
    signingBonus: [0, Math.max(Math.round(l.maxSigningBonus * 1.5), Math.round(c.signingBonus * 2), 50_000)],
    goalBonus: [0, Math.max(Math.round(l.maxGoalBonus * 1.5), Math.round(c.goalBonus * 2), 5_000)],
    releaseClause: [Math.max(0, Math.round((l.minReleaseClause ?? 0) * 0.5)), Math.max(Math.round((l.minReleaseClause ?? 5_000_000) * 4), Math.round((c.releaseClause ?? 0) * 3), 20_000_000)],
  };
}

export function sameTerms(a: ContractTerms, b: ContractTerms): boolean {
  return a.wage === b.wage && a.years === b.years && a.releaseClause === b.releaseClause && a.role === b.role
    && a.signingBonus === b.signingBonus && a.goalBonus === b.goalBonus;
}

/** How far an ask is from the club's proposal in [0, 1+] (rough "greed" gauge for the UI). */
export function askGreed(ask: ContractTerms, cur: ContractTerms): number {
  const rel = (a: number, b: number) => (b > 0 ? Math.max(0, a / b - 1) : a > 0 ? 1 : 0);
  const roleGap = Math.max(0, ROLE_ORDER.indexOf(ask.role) - ROLE_ORDER.indexOf(cur.role)) * 0.25;
  return rel(ask.wage, cur.wage) * 0.5 + rel(ask.signingBonus, Math.max(cur.signingBonus, 1)) * 0.1 + rel(ask.goalBonus, Math.max(cur.goalBonus, 1)) * 0.05
    + Math.max(0, ask.years - cur.years) * 0.05 + roleGap;
}

/** Weeks until an offer lapses (`expiresWeek` is season*100 + week). */
export const offerWeeksLeft = (expiresWeek: number, season: number, week: number): number =>
  (Math.floor(expiresWeek / 100) - season) * 52 + ((expiresWeek % 100) - week);

// ───────── lifestyle ─────────

/** Weeks 'career.drill.<type>' flag mirrors the career module's once-per-week drill gate. */
export function drillDone(state: GameState, type: MomentType): boolean {
  return state.flags[`career.drill.${type}`] === absWeek(state.season, state.week);
}

export type ChipTone = 'accent' | 'gold' | 'danger' | 'info' | 'violet' | 'neutral';
export interface EffectChip { key: string; icon: string; value: number; label: string; tone: ChipTone }

const EFFECT_ICON: Record<string, string> = {
  money: 'coin', fame: 'star', followers: 'users', energy: 'zap', morale: 'smile', form: 'trend_up',
};

/** Flatten an Effects object into display chips (labels are passed in for i18n). */
export function effectChips(e: Effects | undefined, label: (key: string) => string): EffectChip[] {
  if (!e) return [];
  const out: EffectChip[] = [];
  for (const k of ['money', 'fame', 'followers', 'morale', 'form', 'energy'] as const) {
    const v = e[k];
    if (v) out.push({ key: k, icon: EFFECT_ICON[k], value: v, label: label(k), tone: (k === 'energy' ? v > 0 : v > 0) ? 'accent' : 'danger' });
  }
  for (const [k, v] of Object.entries(e.rel ?? {})) {
    if (v) out.push({ key: `rel.${k}`, icon: 'heart', value: v, label: label(`rel.${k as RelKey}`), tone: v > 0 ? 'info' : 'danger' });
  }
  for (const [k, v] of Object.entries(e.xp ?? {})) {
    if (v) out.push({ key: `xp.${k}`, icon: 'trend_up', value: v, label: label(`attr.${k}`), tone: 'violet' });
  }
  if (e.injuryWeeks) out.push({ key: 'injury', icon: 'hospital', value: e.injuryWeeks, label: label('injury'), tone: 'danger' });
  return out;
}

export function signed(v: number): string {
  const r = Math.round(v * 10) / 10;
  return r > 0 ? `+${r}` : `${r}`;
}

// ───────── news ─────────

export function sortNews(news: NewsArticle[]): NewsArticle[] {
  return [...news].sort((a, b) => (b.season * 100 + b.week) - (a.season * 100 + a.week) || b.importance - a.importance);
}

export function tagCounts(news: NewsArticle[]): { tag: string; count: number }[] {
  const m = new Map<string, number>();
  for (const a of news) for (const tag of a.tags) m.set(tag, (m.get(tag) ?? 0) + 1);
  return [...m.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** The front-page story: the most important article of the latest weeks (recency-weighted). */
export function heroOf(news: NewsArticle[]): NewsArticle | null {
  if (!news.length) return null;
  const newest = Math.max(...news.map((a) => a.season * 100 + a.week));
  const pool = news.filter((a) => newest - (a.season * 100 + a.week) <= 2);
  return [...(pool.length ? pool : news)].sort((a, b) => b.importance - a.importance || (b.season * 100 + b.week) - (a.season * 100 + a.week))[0];
}

export function filterNews(news: NewsArticle[], tag: string | null): NewsArticle[] {
  return tag ? news.filter((a) => a.tags.includes(tag) || (tag === 'user' && a.aboutUser)) : news;
}

/** First sentence of a text; full stops after numerals ('1. Lig') do not end it. */
export function firstSentence(body: string, max = 140): string {
  const text = body.trim().split(/\n+/)[0] ?? '';
  const m = /(?<!\d)[.!?]\s+(?=\p{Lu})/u.exec(text);
  const s = (m ? text.slice(0, m.index) : text).replace(/[.]+$/, '').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/**
 * A headline that was cut at an ordinal's full stop ('… kariyerindeki 1') is rebuilt from the body,
 * so a generator hiccup never puts a bare number on the front page.
 */
export function headlineOf(a: Pick<NewsArticle, 'headline' | 'body'>): string {
  const h = a.headline.trim();
  const body = a.body.trim();
  const cut = body.length > h.length && body.startsWith(h) && body[h.length] === '.' && /\d$/.test(h);
  return !h || cut ? firstSentence(body) || h : h;
}

export const paragraphs = (body: string): string[] => body.split(/\n{1,}/).map((s) => s.trim()).filter(Boolean);

// ───────── social ─────────

export function sentimentTone(s: number): 'accent' | 'danger' | 'neutral' {
  return s > 0.25 ? 'accent' : s < -0.25 ? 'danger' : 'neutral';
}

export function compactNumber(v: number, lang: 'tr' | 'en' = 'tr'): string {
  const a = Math.abs(v);
  const f = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', lang === 'tr' ? ',' : '.');
  if (a >= 1e6) return `${f(v / 1e6)}${lang === 'tr' ? ' Mn' : 'M'}`;
  if (a >= 1e4) return `${f(v / 1e3)}${lang === 'tr' ? ' B' : 'K'}`;
  if (a >= 1e3) return `${f(v / 1e3)}${lang === 'tr' ? ' B' : 'K'}`;
  return String(Math.round(v));
}

/** Deterministic hue for an avatar from a string. */
export function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function initialsOf(name: string): string {
  const parts = name.replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '')).toLocaleUpperCase();
}

export function postAgeWeeks(p: SocialPost, season: number, week: number): number {
  return Math.max(0, (season - p.season) * 52 + (week - p.week));
}

// ───────── legacy ─────────

export interface HallTier { id: 'immortal' | 'great' | 'star' | 'respected' | 'journeyman' | 'unknown'; min: number }
/** Thresholds mirror career.legacyTier (hall-of-fame scores run from 0 to ~3000). */
export const HALL_TIERS: HallTier[] = [
  { id: 'immortal', min: 2600 }, { id: 'great', min: 1700 }, { id: 'star', min: 1000 },
  { id: 'respected', min: 500 }, { id: 'journeyman', min: 200 }, { id: 'unknown', min: 0 },
];

export function hallTier(score: number): HallTier {
  return HALL_TIERS.find((t) => score >= t.min) ?? HALL_TIERS[HALL_TIERS.length - 1];
}

/** Progress (0..1) from the current tier's threshold toward the next tier. */
export function hallProgress(score: number): number {
  const i = HALL_TIERS.findIndex((t) => score >= t.min);
  if (i <= 0) return 1;
  const cur = HALL_TIERS[i].min;
  const next = HALL_TIERS[i - 1].min;
  return clamp((score - cur) / (next - cur), 0, 1);
}

/** Prefix match that also accepts a bare family key ('CC' as well as 'CC-2028'). */
const isFamily = (compId: string, prefix: string): boolean => compId === prefix || compId.startsWith(`${prefix}-`);

const TROPHY_WEIGHT = (compId: string): number =>
  isFamily(compId, 'WC') ? 140 : isFamily(compId, 'CONT') ? 90 : isFamily(compId, 'CC') ? 80 : isFamily(compId, 'CUP') ? 22 : 45;

export interface CareerRecords {
  bestSeasonGoals: { season: number; goals: number } | null;
  bestRating: { season: number; rating: number } | null;
  peakOverall: { season: number; overall: number } | null;
  peakValue: { season: number; value: number } | null;
  mostApps: { season: number; apps: number } | null;
}

export function careerRecords(state: GameState): CareerRecords {
  const h = state.career.history;
  const best = <T,>(f: (r: (typeof h)[number]) => number, mk: (r: (typeof h)[number]) => T, min = 0): T | null => {
    let top: (typeof h)[number] | null = null;
    for (const r of h) if (f(r) > min && (!top || f(r) > f(top))) top = r;
    return top ? mk(top) : null;
  };
  return {
    bestSeasonGoals: best((r) => r.stats.goals, (r) => ({ season: r.season, goals: r.stats.goals })),
    bestRating: best((r) => (r.stats.apps >= 5 ? r.avgRating : 0), (r) => ({ season: r.season, rating: r.avgRating })),
    peakOverall: best((r) => r.overall, (r) => ({ season: r.season, overall: r.overall })),
    peakValue: best((r) => r.value, (r) => ({ season: r.season, value: r.value })),
    mostApps: best((r) => r.stats.apps, (r) => ({ season: r.season, apps: r.stats.apps })),
  };
}

export interface ClubStint { clubId: string; clubName: string; from: number; to: number; apps: number; goals: number; assists: number; trophies: string[] }

/** Consecutive seasons at one club collapsed into stints for the timeline. */
export function clubStints(state: GameState): ClubStint[] {
  const out: ClubStint[] = [];
  for (const r of [...state.career.history].sort((a, b) => a.season - b.season)) {
    const last = out[out.length - 1];
    if (last && last.clubId === r.clubId && r.season - last.to <= 1) {
      last.to = r.season; last.apps += r.stats.apps; last.goals += r.stats.goals; last.assists += r.stats.assists;
      last.trophies.push(...r.trophies);
    } else {
      out.push({ clubId: r.clubId, clubName: r.clubName, from: r.season, to: r.season, apps: r.stats.apps, goals: r.stats.goals, assists: r.stats.assists, trophies: [...r.trophies] });
    }
  }
  return out;
}

/** Group a trophy list by competition (cabinet shelves). */
export function trophyShelves(trophies: { compId: string; name: string; season: number }[]): { key: string; name: string; seasons: number[] }[] {
  const m = new Map<string, { key: string; name: string; seasons: number[] }>();
  for (const tr of trophies) {
    const key = tr.compId.replace(/-\d{4}$/, '');
    const e = m.get(key) ?? { key, name: tr.name, seasons: [] };
    e.seasons.push(tr.season);
    m.set(key, e);
  }
  return [...m.values()].map((e) => ({ ...e, seasons: e.seasons.sort((a, b) => a - b) }))
    .sort((a, b) => TROPHY_WEIGHT(b.key) - TROPHY_WEIGHT(a.key) || b.seasons.length - a.seasons.length);
}

/** Icon / tint for a trophy by competition family. */
export function trophyStyle(compId: string): { icon: string; tone: 'gold' | 'info' | 'violet' | 'accent' } {
  if (isFamily(compId, 'WC')) return { icon: 'globe', tone: 'gold' };
  if (isFamily(compId, 'CONT')) return { icon: 'globe', tone: 'violet' };
  if (isFamily(compId, 'CC')) return { icon: 'crown', tone: 'info' };
  if (isFamily(compId, 'CUP')) return { icon: 'medal', tone: 'accent' };
  return { icon: 'trophy', tone: 'gold' };
}

// ───────── clubs ─────────

/** 'ENG-1-2027' → 'ENG-1', 'CC-2027' → 'CC' (the competition family a trophy belongs to). */
export const compFamily = (compId: string): string => compId.replace(/-\d{4}$/, '');

/** Display name of a competition family, from this season's competitions or the league list. */
export function compFamilyName(state: GameState, family: string): string {
  for (const c of Object.values(state.competitions)) if (compFamily(c.id) === family) return c.name;
  return state.world.leagues.find((l) => l.id === family)?.name ?? family;
}

/** Every title a club has won in completed seasons (plus finished competitions of the running season). */
export function clubHonours(state: GameState, clubId: string): { key: string; name: string; seasons: number[] }[] {
  const wins: { compId: string; name: string; season: number }[] = [];
  const seen = new Set<string>();
  const add = (compId: string, season: number) => {
    if (seen.has(compId)) return;
    seen.add(compId);
    wins.push({ compId, name: compFamilyName(state, compFamily(compId)), season });
  };
  for (const s of state.seasons) for (const [compId, winner] of Object.entries(s.champions)) if (winner === clubId) add(compId, s.season);
  for (const c of Object.values(state.competitions)) if (c.winnerId === clubId) add(c.id, c.season);
  return trophyShelves(wins);
}

export interface SquadSummary { size: number; avgOvr: number; avgAge: number; value: number; injured: number }

export function squadSummary(players: Footballer[], ovr: (p: Footballer) => number, season: number): SquadSummary {
  const n = players.length || 1;
  return {
    size: players.length,
    avgOvr: Math.round(players.reduce((s, p) => s + ovr(p), 0) / n),
    avgAge: Math.round((players.reduce((s, p) => s + (season - p.birthYear), 0) / n) * 10) / 10,
    value: players.reduce((s, p) => s + p.value, 0),
    injured: players.filter((p) => p.injury && p.injury.weeksLeft > 0).length,
  };
}

/** Reputation 1..100 → 0.5..5 stars. */
export const repStars = (rep: number): number => clamp(Math.round((rep / 20) * 2) / 2, 0.5, 5);

// ───────── legacy extras ─────────

/** The years a career spans, e.g. '2026–2041'. */
export function careerSpan(state: GameState): string {
  const h = [...state.career.history].sort((a, b) => a.season - b.season);
  const from = h[0]?.season ?? state.season;
  const to = h[h.length - 1]?.season ?? state.season;
  return from === to ? String(from) : `${from}–${to}`;
}

export interface LegacyFacts {
  name: string; tier: string; score: number; span: string; clubs: string[];
  apps: number; goals: number; assists: number; trophies: number; caps: number; peakOvr: number; peakValue: string;
}

/** Plain-text recap that can be copied or shared. `labels` carries the localized words. */
export function legacySummaryText(f: LegacyFacts, labels: { score: string; apps: string; goals: string; assists: string; trophies: string; caps: string; peak: string; value: string }): string {
  return [
    `${f.name} · ${f.span}`,
    `${f.tier} — ${labels.score}: ${f.score}`,
    f.clubs.length ? f.clubs.join(' → ') : '',
    `${labels.apps}: ${f.apps} · ${labels.goals}: ${f.goals} · ${labels.assists}: ${f.assists}`,
    `${labels.trophies}: ${f.trophies} · ${labels.caps}: ${f.caps}`,
    `${labels.peak}: ${f.peakOvr} · ${labels.value}: ${f.peakValue}`,
    '#NeoStarSoccer',
  ].filter(Boolean).join('\n');
}

// ───────── money ─────────

/** €59 bin / €2,6 Mn (Turkish) or €59K / €2.6M (English). Unit words read better than a bare 'B' for thousands. */
export function money(v: number, lang: Lang = getLang()): string {
  const tr = lang === 'tr';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  const dec = (n: number) => { const r = String(Math.round(n * 10) / 10); return tr ? r.replace('.', ',') : r; };
  if (a >= 1e9) return `${sign}€${dec(a / 1e9)}${tr ? ' Mr' : 'B'}`;
  if (a >= 1e6) return `${sign}€${dec(a / 1e6)}${tr ? ' Mn' : 'M'}`;
  if (a >= 1e3) return `${sign}€${Math.round(a / 1e3)}${tr ? ' bin' : 'K'}`;
  return `${sign}€${Math.round(a)}`;
}
