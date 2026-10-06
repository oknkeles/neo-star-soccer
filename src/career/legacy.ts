/**
 * Career goals, the hall-of-fame (legacy) score and retirement rules.
 */
import type { Award, CareerGoal, Footballer, GameState, Lang, Localized, Trophy } from '../core/types';
import type { Rng } from '../core/rng';
import { t } from '../core/i18n';
import { age as ageOf, formatMoney, formatNumber, nextId, sum } from '../core/util';
import { overall } from '../core/ratings';
import { loc, nationalTeamOfNation, userPlayer } from './helpers';
import { SHOP_ITEMS, ownsItem } from './shop';

// ───────── career totals (robust to the order in which other modules roll stats over) ─────────

export type TrophyKind = 'league' | 'league2' | 'cc' | 'cup' | 'intl' | 'other';

export function trophyKind(tr: Pick<Trophy, 'compId'>): TrophyKind {
  const id = tr.compId;
  if (/^[A-Z]{3}-1-\d{4}$/.test(id)) return 'league';
  if (/^[A-Z]{3}-2-\d{4}$/.test(id)) return 'league2';
  if (id.startsWith('CC-')) return 'cc';
  if (id.startsWith('CUP-')) return 'cup';
  if (id.startsWith('WC-') || id.startsWith('CONT-')) return 'intl';
  return 'other';
}

export interface CareerTotals {
  apps: number; goals: number; assists: number; caps: number; intlGoals: number;
  peakOverall: number; peakValue: number; bestSeasonGoals: number; seasons: number;
}

export function careerTotals(state: GameState): CareerTotals {
  const p = userPlayer(state);
  const hist = state.career.history;
  const hasThis = hist.some((h) => h.season === state.season);
  const histApps = sum(hist.map((h) => h.stats.apps));
  const histGoals = sum(hist.map((h) => h.stats.goals));
  const histAssists = sum(hist.map((h) => h.stats.assists));
  const add = hasThis ? 0 : 1;
  return {
    apps: Math.max(p.career.apps, histApps + add * p.season.apps),
    goals: Math.max(p.career.goals, histGoals + add * p.season.goals),
    assists: Math.max(p.career.assists, histAssists + add * p.season.assists),
    caps: p.intlCaps,
    intlGoals: p.intlGoals,
    peakOverall: Math.max(overall(p), ...hist.map((h) => h.overall)),
    peakValue: Math.max(p.value, ...hist.map((h) => h.value)),
    bestSeasonGoals: Math.max(p.season.goals, ...hist.map((h) => h.stats.goals)),
    seasons: Math.max(hist.length, 0) + (hasThis || p.season.apps === 0 ? 0 : 1),
  };
}

function countriesPlayed(state: GameState): number {
  const set = new Set<string>();
  const p = userPlayer(state);
  for (const h of state.career.history) {
    const club = state.world.clubs[h.clubId];
    if (club) set.add(club.country);
  }
  const cur = p.clubId ? state.world.clubs[p.clubId] : undefined;
  if (cur) set.add(cur.country);
  return set.size;
}

function clubApps(state: GameState): number {
  const p = userPlayer(state);
  const byClub = new Map<string, number>();
  for (const h of state.career.history) byClub.set(h.clubId, (byClub.get(h.clubId) ?? 0) + h.stats.apps);
  if (p.clubId && !state.career.history.some((h) => h.season === state.season)) {
    byClub.set(p.clubId, (byClub.get(p.clubId) ?? 0) + p.season.apps);
  }
  return Math.max(0, ...byClub.values());
}

const hasAward = (awards: Award[], key: string) => awards.some((a) => a.key === key);

// ───────── goal templates ─────────

type Tier = 1 | 2 | 3;
interface GoalTemplate {
  id: string;
  tier: Tier;
  kind: CareerGoal['kind'];
  /** At most one goal per group is picked. */
  group: string;
  text: Localized;
  /** Weight for picking (0 = not applicable now). */
  weight: (state: GameState, p: Footballer) => number;
  target?: (state: GameState, p: Footballer) => string | number;
  /** Params for the text beyond `n` (club…). */
  params?: (state: GameState, p: Footballer, target: string | number | undefined, lang: Lang) => Record<string, string | number>;
  check: (state: GameState, target: string | number | undefined) => boolean;
}

const isAttacker = (p: Footballer) => p.position === 'ST' || p.position === 'W' || p.position === 'AM';

function goalsTarget(p: Footballer, tier: Tier): number {
  const base: Record<string, [number, number, number]> = {
    ST: [14, 24, 34], W: [10, 18, 26], AM: [9, 15, 22], CM: [5, 9, 14], DM: [3, 6, 9], FB: [3, 6, 9], CB: [3, 5, 8], GK: [1, 1, 1],
  };
  return (base[p.position] ?? base.CM)[tier - 1];
}

const hasNationalTeam = (state: GameState, p: Footballer) => !!nationalTeamOfNation(state, p.nation);

function trophyCount(state: GameState, kind: TrophyKind): number {
  return state.career.trophies.filter((x) => trophyKind(x) === kind).length;
}

const TEMPLATES: GoalTemplate[] = [
  // ── tier 1: near-term ──
  {
    id: 'first_trophy', tier: 1, kind: 'win_comp', group: 'trophy', target: () => 'any',
    text: { tr: 'İlk kupanı müzeye götür.', en: 'Lift your first trophy.' },
    weight: (s) => (s.career.trophies.length === 0 ? 1 : 0),
    check: (s) => s.career.trophies.length > 0,
  },
  {
    id: 'goals_a', tier: 1, kind: 'season_goals', group: 'goals', target: (_s, p) => goalsTarget(p, 1),
    text: { tr: 'Tek bir sezonda {n} gol at.', en: 'Score {n} goals in a single season.' },
    weight: (_s, p) => (p.position === 'GK' ? 0 : 1.2),
    check: (s, tg) => careerTotals(s).bestSeasonGoals >= Number(tg),
  },
  {
    id: 'ovr_a', tier: 1, kind: 'custom', group: 'ovr',
    target: (_s, p) => Math.min(92, Math.max(65, Math.ceil((overall(p) + 12) / 5) * 5)),
    text: { tr: 'Genel reytingini {n} seviyesine çıkar.', en: 'Push your overall rating up to {n}.' },
    weight: () => 1,
    check: (s, tg) => careerTotals(s).peakOverall >= Number(tg),
  },
  {
    id: 'caps_a', tier: 1, kind: 'caps', group: 'caps', target: () => 10,
    text: { tr: 'Milli takım formasını {n} kez giy.', en: 'Win {n} caps for your country.' },
    weight: (s, p) => (hasNationalTeam(s, p) ? 1 : 0),
    check: (s, tg) => careerTotals(s).caps >= Number(tg),
  },
  {
    id: 'young_player', tier: 1, kind: 'custom', group: 'award', target: () => 'award:young_player',
    text: { tr: 'Yılın Genç Oyuncusu ödülünü kazan.', en: 'Win the Young Player of the Year award.' },
    weight: (s, p) => (ageOf(p, s.season) <= 20 ? 1.2 : 0),
    check: (s) => hasAward(s.career.awards, 'young_player'),
  },
  {
    id: 'married', tier: 1, kind: 'custom', group: 'life', target: () => 'married',
    text: { tr: 'Hayatının aşkını bul ve evlen.', en: 'Find the love of your life and get married.' },
    weight: () => 0.7,
    check: (s) => !!s.flags['career.married'],
  },
  {
    id: 'followers_a', tier: 1, kind: 'custom', group: 'followers', target: () => 'followers:250000',
    text: { tr: 'Sosyal medyada {n} takipçiye ulaş.', en: 'Reach {n} followers on social media.' },
    params: () => ({ n: '250K' }),
    weight: (s) => (s.career.followers < 150_000 ? 0.8 : 0),
    check: (s) => s.career.followers >= 250_000,
  },

  // ── tier 2: mid-term ──
  {
    id: 'hometown', tier: 2, kind: 'play_for_club', group: 'club',
    target: (s) => s.career.genesis.hometownClubId ?? '',
    text: { tr: 'Memleketin takımı {club} için forma giy.', en: 'Play for your hometown club, {club}.' },
    params: (s, _p, tg) => ({ club: s.world.clubs[String(tg)]?.name ?? '' }),
    weight: (s, p) => {
      const id = s.career.genesis.hometownClubId;
      return id && s.world.clubs[id] && p.clubId !== id ? 2 : 0;
    },
    check: (s, tg) => userPlayer(s).clubId === tg,
  },
  {
    id: 'league_title', tier: 2, kind: 'win_comp', group: 'trophy', target: () => 'league',
    text: { tr: 'Lig şampiyonluğu yaşa.', en: 'Win a league title.' },
    weight: () => 1.3,
    check: (s) => trophyCount(s, 'league') > 0,
  },
  {
    id: 'cup_win', tier: 2, kind: 'win_comp', group: 'trophy', target: () => 'cup',
    text: { tr: 'Ülke kupasını kaldır.', en: 'Win a domestic cup.' },
    weight: () => 0.9,
    check: (s) => trophyCount(s, 'cup') > 0,
  },
  {
    id: 'goals_b', tier: 2, kind: 'season_goals', group: 'goals', target: (_s, p) => goalsTarget(p, 2),
    text: { tr: 'Tek bir sezonda {n} gol at.', en: 'Score {n} goals in a single season.' },
    weight: (_s, p) => (isAttacker(p) ? 1.3 : p.position === 'GK' ? 0 : 0.6),
    check: (s, tg) => careerTotals(s).bestSeasonGoals >= Number(tg),
  },
  {
    id: 'top_scorer', tier: 2, kind: 'custom', group: 'award', target: () => 'award:league_top_scorer',
    text: { tr: 'Ligin Gol Kralı ol.', en: "Finish as a league's top scorer." },
    weight: (_s, p) => (p.position === 'ST' || p.position === 'W' ? 1.2 : p.position === 'AM' ? 0.5 : 0),
    check: (s) => hasAward(s.career.awards, 'league_top_scorer'),
  },
  {
    id: 'team_of_season', tier: 2, kind: 'custom', group: 'award', target: () => 'award:team_of_season',
    text: { tr: "Sezonun 11'ine seçil.", en: 'Make a Team of the Season.' },
    weight: () => 1,
    check: (s) => hasAward(s.career.awards, 'team_of_season'),
  },
  {
    id: 'caps_b', tier: 2, kind: 'caps', group: 'caps', target: () => 40,
    text: { tr: 'Milli takım formasını {n} kez giy.', en: 'Win {n} caps for your country.' },
    weight: (s, p) => (hasNationalTeam(s, p) ? 1.1 : 0),
    check: (s, tg) => careerTotals(s).caps >= Number(tg),
  },
  {
    id: 'value_a', tier: 2, kind: 'value', group: 'value', target: () => 40_000_000,
    text: { tr: 'Piyasa değerin {money} olsun.', en: 'Reach a market value of {money}.' },
    params: (_s, _p, tg, lang) => ({ money: formatMoney(Number(tg), lang) }),
    weight: (s) => (userPlayer(s).value < 20_000_000 ? 1 : 0),
    check: (s, tg) => careerTotals(s).peakValue >= Number(tg),
  },
  {
    id: 'countries', tier: 2, kind: 'custom', group: 'abroad', target: () => 'countries:3',
    text: { tr: 'Üç farklı ülkede forma giy.', en: 'Play club football in three different countries.' },
    weight: () => 0.8,
    check: (s) => countriesPlayed(s) >= 3,
  },
  {
    id: 'elite_club', tier: 2, kind: 'custom', group: 'club', target: () => 'elite',
    text: { tr: 'Avrupa’nın devlerinden birinde forma giy.', en: "Sign for one of Europe's giants." },
    weight: (s, p) => ((s.world.clubs[p.clubId ?? '']?.reputation ?? 0) < 82 ? 1.2 : 0),
    check: (s) => (s.world.clubs[userPlayer(s).clubId ?? '']?.reputation ?? 0) >= 85,
  },
  {
    id: 'apps_a', tier: 2, kind: 'custom', group: 'apps', target: () => 'apps:150',
    text: { tr: 'Kariyerinde {n} resmî maça çık.', en: 'Make {n} professional appearances.' },
    params: () => ({ n: 150 }),
    weight: () => 0.8,
    check: (s) => careerTotals(s).apps >= 150,
  },
  {
    id: 'followers_b', tier: 2, kind: 'custom', group: 'followers', target: () => 'followers:2000000',
    text: { tr: 'Sosyal medyada {n} takipçiye ulaş.', en: 'Reach {n} followers on social media.' },
    params: () => ({ n: '2M' }),
    weight: (s) => (s.career.followers < 1_000_000 ? 0.8 : 0),
    check: (s) => s.career.followers >= 2_000_000,
  },

  // ── tier 3: dreams ──
  {
    id: 'champions_cup', tier: 3, kind: 'win_comp', group: 'trophy', target: () => 'cc',
    text: { tr: 'Şampiyonlar Kupası’nı kaldır.', en: 'Win the Champions Cup.' },
    weight: () => 1.4,
    check: (s) => trophyCount(s, 'cc') > 0,
  },
  {
    id: 'golden_ball', tier: 3, kind: 'golden_ball', group: 'award',
    text: { tr: 'Yılın Altın Top’unu kazan.', en: 'Win the Golden Ball.' },
    weight: () => 1.3,
    check: (s) => hasAward(s.career.awards, 'golden_ball'),
  },
  {
    id: 'world_cup', tier: 3, kind: 'win_comp', group: 'trophy', target: () => 'intl',
    text: { tr: 'Milli takımınla Dünya Kupası ya da Kıta Kupası kazan.', en: 'Win a World Cup or Continental Cup with your nation.' },
    weight: (s, p) => (hasNationalTeam(s, p) ? 1.2 : 0),
    check: (s) => trophyCount(s, 'intl') > 0,
  },
  {
    id: 'caps_c', tier: 3, kind: 'caps', group: 'caps', target: () => 100,
    text: { tr: 'Milli takım formasını {n} kez giy.', en: 'Win {n} caps for your country.' },
    weight: (s, p) => (hasNationalTeam(s, p) ? 0.9 : 0),
    check: (s, tg) => careerTotals(s).caps >= Number(tg),
  },
  {
    id: 'goals_c', tier: 3, kind: 'season_goals', group: 'goals', target: (_s, p) => goalsTarget(p, 3),
    text: { tr: 'Tek bir sezonda {n} gol at.', en: 'Score {n} goals in a single season.' },
    weight: (_s, p) => (isAttacker(p) ? 1.2 : p.position === 'GK' ? 0 : 0.3),
    check: (s, tg) => careerTotals(s).bestSeasonGoals >= Number(tg),
  },
  {
    id: 'value_b', tier: 3, kind: 'value', group: 'value', target: () => 120_000_000,
    text: { tr: 'Piyasa değerin {money} olsun.', en: 'Reach a market value of {money}.' },
    params: (_s, _p, tg, lang) => ({ money: formatMoney(Number(tg), lang) }),
    weight: () => 1.1,
    check: (s, tg) => careerTotals(s).peakValue >= Number(tg),
  },
  {
    id: 'ovr_b', tier: 3, kind: 'custom', group: 'ovr', target: () => 'ovr:88',
    text: { tr: 'Genel reytingini {n} seviyesine çıkar.', en: 'Push your overall rating up to {n}.' },
    params: () => ({ n: 88 }),
    weight: () => 0.9,
    check: (s) => careerTotals(s).peakOverall >= 88,
  },
  {
    id: 'trophies_5', tier: 3, kind: 'custom', group: 'trophy', target: () => 'trophies:5',
    text: { tr: 'Kariyerinde toplam {n} kupa kazan.', en: 'Win {n} trophies in your career.' },
    params: () => ({ n: 5 }),
    weight: () => 0.9,
    check: (s) => s.career.trophies.length >= 5,
  },
  {
    id: 'club_legend', tier: 3, kind: 'custom', group: 'club', target: () => 'club_apps:250',
    text: { tr: 'Tek bir kulüpte {n} maça çıkarak efsane ol.', en: 'Become a club legend with {n} appearances for one club.' },
    params: () => ({ n: 250 }),
    weight: (s, p) => (p.contract?.loan ? 0 : 0.8),
    check: (s) => clubApps(s) >= 250,
  },
  {
    id: 'private_jet', tier: 3, kind: 'custom', group: 'life', target: () => 'own:jet',
    text: { tr: 'Kendi özel jetine sahip ol.', en: 'Own a private jet.' },
    weight: () => 0.7,
    check: (s) => SHOP_ITEMS.some((i) => i.category === 'jet' && ownsItem(s, i.id)),
  },
  {
    id: 'career_goals', tier: 3, kind: 'custom', group: 'goals', target: (_s, p) => `career_goals:${isAttacker(p) ? 200 : 60}`,
    text: { tr: 'Kariyerinde toplam {n} gol at.', en: 'Score {n} career goals.' },
    params: (_s, p) => ({ n: isAttacker(p) ? 200 : 60 }),
    weight: (_s, p) => (p.position === 'GK' ? 0 : 0.8),
    check: (s, tg) => careerTotals(s).goals >= Number(String(tg).split(':')[1] ?? 0),
  },
];

const tpl = (id: string) => TEMPLATES.find((x) => x.id === id);

/** Fill `{n}` etc. for a template + target. */
function goalText(tp: GoalTemplate, state: GameState, p: Footballer, target: string | number | undefined, lang: Lang): string {
  const n = typeof target === 'number' ? formatNumber(target, lang) : typeof target === 'string' && /:\d+$/.test(target) ? formatNumber(Number(target.split(':')[1]), lang) : '';
  const extra = tp.params ? tp.params(state, p, target, lang) : {};
  return loc(tp.text, lang, { n, ...extra });
}

/** Number of goals in the catalogue (for tests / UI). */
export const GOAL_TEMPLATE_IDS = TEMPLATES.map((x) => x.id);

export function makeCareerGoals(state: GameState, rng: Rng): CareerGoal[] {
  const p = userPlayer(state);
  const out: CareerGoal[] = [];
  const usedGroups = new Set<string>();
  const usedIds = new Set<string>();
  const pickFrom = (tier: Tier): GoalTemplate | null => {
    const pool = TEMPLATES.filter((x) => x.tier === tier && !usedGroups.has(x.group) && !usedIds.has(x.id) && x.weight(state, p) > 0);
    if (!pool.length) return null;
    return rng.weighted(pool, (x) => x.weight(state, p));
  };
  for (const tier of [1, 2, 3] as Tier[]) {
    const pick = pickFrom(tier) ?? pickFrom(tier === 1 ? 2 : tier === 3 ? 2 : 3) ?? pickFrom(1);
    if (!pick) continue;
    usedGroups.add(pick.group);
    usedIds.add(pick.id);
    const target = pick.target ? pick.target(state, p) : undefined;
    out.push({
      id: nextId(state, 'goal'),
      text: goalText(pick, state, p, target, state.lang),
      kind: pick.kind,
      target: target === '' ? undefined : target,
      done: false,
    });
    state.flags[`career.goalTpl.${out[out.length - 1].id}`] = pick.id;
  }
  return out;
}

/** The template a goal was made from (stored in a flag; falls back to kind/target matching). */
function templateOf(state: GameState, goal: CareerGoal): GoalTemplate | undefined {
  const id = state.flags[`career.goalTpl.${goal.id}`];
  if (typeof id === 'string') return tpl(id);
  return TEMPLATES.find((x) => x.kind === goal.kind && (x.target ? String(x.target(state, userPlayer(state))) === String(goal.target) : goal.target === undefined));
}

/** Is a goal satisfied right now? (works for goals made by `makeCareerGoals` and for hand-made goals of the standard kinds) */
export function isGoalMet(state: GameState, goal: CareerGoal): boolean {
  const tp = templateOf(state, goal);
  if (tp) return tp.check(state, goal.target);
  const totals = careerTotals(state);
  const target = goal.target;
  switch (goal.kind) {
    case 'win_comp': return state.career.trophies.some((x) => String(target) === 'any' || x.compId.startsWith(String(target)) || trophyKind(x) === target);
    case 'play_for_club': return userPlayer(state).clubId === target;
    case 'golden_ball': return hasAward(state.career.awards, 'golden_ball');
    case 'season_goals': return totals.bestSeasonGoals >= Number(target);
    case 'caps': return totals.caps >= Number(target);
    case 'value': return totals.peakValue >= Number(target);
    default: return false;
  }
}

export function checkCareerGoals(state: GameState): CareerGoal[] {
  const done: CareerGoal[] = [];
  for (const g of state.career.genesis.goals) {
    if (g.done) continue;
    if (isGoalMet(state, g)) {
      g.done = true;
      g.doneSeason = state.season;
      done.push(g);
    }
  }
  return done;
}

/** Progress of a numeric goal (for UI bars), or null for yes/no goals. */
export function goalProgress(state: GameState, goal: CareerGoal): { current: number; target: number } | null {
  const totals = careerTotals(state);
  const tg = goal.target;
  const num = typeof tg === 'number' ? tg : typeof tg === 'string' && /:\d+$/.test(tg) ? Number(tg.split(':')[1]) : NaN;
  if (!Number.isFinite(num)) return null;
  switch (goal.kind) {
    case 'season_goals': return { current: totals.bestSeasonGoals, target: num };
    case 'caps': return { current: totals.caps, target: num };
    case 'value': return { current: totals.peakValue, target: num };
    case 'custom': {
      const key = String(tg).split(':')[0];
      const cur: Record<string, number> = {
        ovr: totals.peakOverall, apps: totals.apps, followers: state.career.followers, countries: countriesPlayed(state),
        trophies: state.career.trophies.length, club_apps: clubApps(state), career_goals: totals.goals,
      };
      return key in cur ? { current: cur[key], target: num } : null;
    }
    default: return null;
  }
}

// ───────── legacy score ─────────

const TROPHY_POINTS: Record<TrophyKind, number> = { league: 35, league2: 10, cc: 90, cup: 18, intl: 70, other: 12 };
const AWARD_POINTS: Record<string, number> = {
  golden_ball: 120, league_top_scorer: 35, league_mvp: 30, young_player: 15, team_of_season: 12,
};

export function hallOfFameScore(state: GameState): number {
  const c = state.career;
  const totals = careerTotals(state);
  let score = 0;
  for (const tr of c.trophies) score += TROPHY_POINTS[trophyKind(tr)];
  for (const aw of c.awards) score += AWARD_POINTS[aw.key] ?? 10;
  score += totals.goals * 0.8 + totals.assists * 0.4 + totals.apps * 0.25;
  score += totals.caps * 1.2 + totals.intlGoals * 2;
  score += Math.max(0, totals.peakOverall - 60) * 8;
  score += Math.min(150, Math.sqrt(Math.max(0, totals.peakValue) / 1_000_000) * 12);
  score += c.genesis.goals.filter((g) => g.done).length * 40;
  score += totals.seasons * 6;
  score += Math.min(60, Math.log10(Math.max(1, c.followers)) * 9);
  return Math.max(0, Math.round(score));
}

/** A short legacy tier label for UI. */
export function legacyTier(score: number, lang: Lang): string {
  const tiers: [number, Localized][] = [
    [2600, { tr: 'Efsane', en: 'Immortal' }],
    [1700, { tr: 'Tarihin Büyüklerinden', en: 'All-time Great' }],
    [1000, { tr: 'Yıldız', en: 'Star' }],
    [500, { tr: 'Saygın Kariyer', en: 'Respected Career' }],
    [200, { tr: 'Alt Lig Kahramanı', en: 'Journeyman' }],
    [0, { tr: 'Anonim', en: 'Unknown' }],
  ];
  const hit = tiers.find(([min]) => score >= min) ?? tiers[tiers.length - 1];
  return hit[1][lang];
}

// ───────── retirement ─────────

export function retirementStatus(state: GameState): { canRetire: boolean; forced: boolean } {
  const c = state.career;
  const p = userPlayer(state);
  if (c.retired || p.retired) return { canRetire: false, forced: false };
  const a = ageOf(p, state.season);
  const longInjury = !!p.injury && p.injury.weeksLeft >= 30 && a >= 27;
  const forced = a >= 40;
  return { canRetire: forced || a >= 32 || longInjury, forced };
}

/** For the retirement screen: a localized one-liner about why retiring is possible. */
export function retirementReason(state: GameState): string {
  const p = userPlayer(state);
  const a = ageOf(p, state.season);
  if (a >= 40) return t('career.ret.forced');
  if (p.injury && p.injury.weeksLeft >= 30) return t('career.ret.injury');
  return t('career.ret.age', { age: a });
}
