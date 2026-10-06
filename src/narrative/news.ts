/**
 * The newsroom: turns factual NewsSeeds into articles. Seeds come in two shapes —
 *  - structured (`k=<bank key> | say=<one-sentence lede> | team=… | n=…`), written by this module;
 *  - free text, written by the game controller in the player's language ("Süper Lig: A 2-1 B. …").
 * Free text is classified by seed kind and a few robust patterns, then dressed through the same banks.
 */
import type { Lang, NewsArticle } from '../core/types';
import type { NarrativeContext, NewsSeed } from '../core/narrative-types';
import { cap, hashStr, paragraph, parseFacts, pickN, rngFrom, sayF, pickFilled, fill, type Bank, type Slots } from './grammar';
import { ctxCountry, ctxSlots, langOf } from './ctxutil';
import { outletsFor } from './outlets';
import { NEWS_MATCH, type NewsEntry } from './data/news_match';
import { NEWS_CAREER } from './data/news_career';
import { NEWS_STORY } from './data/news_story';

export const NEWS_TABLES: Record<string, NewsEntry> = { ...NEWS_MATCH, ...NEWS_CAREER, ...NEWS_STORY };

interface Classified { key: string; slots: Slots; lede: string }

const LEDE: Record<'W' | 'D' | 'L', Bank> = {
  W: {
    tr: ['{comp} karşılaşmasında {club}, {opp:acc} {score} mağlup etti.', '{club}, {opp} karşısında {score} kazanarak sahadan galip ayrıldı.', '{club} {opp:acc} {score} geçerek üç puanı aldı.'],
    en: ['{club} beat {opp} {score} in the {comp}.', '{club} came through against {opp} with a {score} win.', '{club} took all three points, {score} against {opp}.'],
  },
  D: {
    tr: ['{club} ile {opp} {score} berabere kaldı.', '{comp} maçında {club}, {opp} karşısında {score} berabere kaldı.'],
    en: ['{club} and {opp} shared the points, {score}.', 'It finished {score} between {club} and {opp} in the {comp}.'],
  },
  L: {
    tr: ['{club}, {opp} karşısında {score} yenildi.', '{comp} maçında {club} sahadan {score} mağlup ayrıldı.'],
    en: ['{club} went down {score} to {opp}.', 'A {score} defeat for {club} against {opp} in the {comp}.'],
  },
};

const NUM = (s: string | undefined, d = 0) => { const n = parseFloat((s ?? '').replace(',', '.')); return Number.isFinite(n) ? n : d; };

function classifyMatch(facts: string, ctx: NarrativeContext, lang: Lang, rng: ReturnType<typeof rngFrom>): Classified | null {
  const m = facts.match(/^(.+?): (.+?) (\d+)-(\d+) (.+?)\.\s/);
  if (!m) return null;
  const [, comp, home, hg, ag, away] = m;
  const teamM = facts.match(/\. (.+?) açısından sonuç: ([^.]+)\./) ?? facts.match(/Result for (.+?): ([^.]+)\./);
  const team = teamM?.[1] ?? ctx.club?.name ?? home;
  const resWord = teamM?.[2] ?? '';
  const res: 'W' | 'D' | 'L' = /galibiyet|win/i.test(resWord) ? 'W' : /beraberlik|draw/i.test(resWord) ? 'D' : 'L';
  const isHome = home === team;
  const gf = isHome ? NUM(hg) : NUM(ag);
  const ga = isHome ? NUM(ag) : NUM(hg);
  const opp = isHome ? away : home;
  const u = facts.match(/(\d+) gol, (\d+) asist, maç puanı ([\d.,]+)/) ?? facts.match(/(\d+) goals, (\d+) assists, match rating ([\d.,]+)/);
  const unused = /forma giymedi|did not get on the pitch/i.test(facts);
  const goals = NUM(u?.[1]);
  const assists = NUM(u?.[2]);
  const rating = u?.[3]?.replace(',', '.') ?? '';
  const motm = /maçın adamı|man of the match/i.test(facts);
  const derby = /derbi|derby/i.test(facts);
  const rv = facts.match(/ezeli rakibi (.+?) vardı/) ?? facts.match(/rival (.+?) lined up/);
  const score = `${Math.max(gf, ga)}-${Math.min(gf, ga)}`; // winner's goals first, as the press writes it
  const slots: Slots = { comp, club: team, opp, score, gf, ga, goals, assists, rating };
  if (rv) slots.rival = rv[1];

  const key = unused ? 'match_bench'
    : goals > 0 || NUM(rating) >= 7.8 || motm ? `match_star_${res === 'W' ? 'win' : res === 'D' ? 'draw' : 'loss'}`
      : `match_${res === 'W' ? 'win' : res === 'D' ? 'draw' : 'loss'}`;

  const tr = lang === 'tr';
  const bits: string[] = [];
  if (goals > 0) bits.push(tr ? `${goals} gol attı` : `scored ${goals}`);
  if (assists > 0) bits.push(tr ? `${assists} asist yaptı` : `set up ${assists}`);
  const first = ctx.player.nickname ?? ctx.player.name.split(/\s+/)[0];
  const sentences = [sayF(LEDE[res], lang, slots, rng)];
  if (unused) sentences.push(tr ? `${first} bu maçta forma şansı bulamadı.` : `${first} did not feature in the match.`);
  else if (bits.length) sentences.push(tr ? `${first} ${bits.join(' ve ')}; maç puanı ${rating}.` : `${first} ${bits.join(' and ')}, earning a rating of ${rating}.`);
  else if (rating) sentences.push(tr ? `${first} maç boyunca sahadaydı, performansına ${rating} puan verildi.` : `${first} played his part and was rated ${rating}.`);
  if (motm) sentences.push(tr ? 'Genç yıldız maçın adamı seçildi.' : 'He was named man of the match.');
  if (derby) sentences.push(tr ? 'Karşılaşma bir derbi olmanın tüm gerilimini taşıyordu.' : 'It carried all the tension that a derby brings.');
  if (rv) sentences.push(tr ? `Karşı safta ezeli rakibi ${rv[1]} de vardı.` : `His old rival ${rv[1]} lined up on the other side.`);
  return { key, slots, lede: sentences.join(' ') };
}

/** Opponent / score / goals parsed from the game's free-text match facts (empty object when it is not one). */
export function matchSlots(facts: string, ctx: NarrativeContext): Slots {
  const lang = langOf(ctx);
  const c = classifyMatch(facts, ctx, lang, rngFrom('ms', facts));
  return c ? c.slots : {};
}

/** Pull the first money-looking token ("€12M") out of a text. */
const moneyIn = (s: string) => s.match(/€[\d.,]+\s?[A-Za-zÇçŞşĞğİıÖöÜü]*/)?.[0]?.trim() ?? '';

function classify(seed: NewsSeed, ctx: NarrativeContext, lang: Lang, rng: ReturnType<typeof rngFrom>): Classified {
  const facts = seed.facts ?? '';
  const first = (s: string) => s.split(/(?<=[.!?])\s/)[0] ?? s;
  switch (seed.kind) {
    case 'match': {
      const c = classifyMatch(facts, ctx, lang, rng);
      if (c) return c;
      return { key: seed.aboutUser ? 'generic_user' : 'generic_other', slots: {}, lede: facts };
    }
    case 'transfer_done': {
      const fee = moneyIn(facts);
      const key = /uzattı|extended/i.test(facts) ? 'transfer_renewal'
        : /deneme|trial/i.test(facts) ? 'transfer_trial'
          : /kiralık|on loan/i.test(facts) ? 'transfer_loan'
            : /bonservissiz|free transfer|free\b/i.test(facts) && !/bonservis bedeliyle/i.test(facts) ? 'transfer_free'
              : fee ? 'transfer_fee' : 'transfer_done';
      return { key, slots: { fee }, lede: facts };
    }
    case 'injury': {
      const weeks = facts.match(/(\d+)/)?.[1] ?? '';
      return { key: 'injury', slots: { weeks }, lede: facts };
    }
    case 'milestone': {
      const n = facts.match(/(\d+)\./)?.[1] ?? facts.match(/number (\d+)/)?.[1] ?? facts.match(/(\d+)/)?.[1] ?? '';
      return { key: 'milestone_goal', slots: { n }, lede: facts };
    }
    case 'award': {
      const trophy = /kupasını|lifted/i.test(facts);
      return { key: trophy ? 'trophy' : 'award', slots: {}, lede: facts };
    }
    case 'league': {
      const m = facts.match(/^(.+?) şampiyonu: (.+?)\.?$/) ?? facts.match(/^(.+?) champions: (.+?)\.?$/);
      return { key: m ? 'league_champion' : 'generic_other', slots: m ? { comp: m[1], team: m[2] } : {}, lede: facts };
    }
    case 'transfer_rumour': {
      const fee = moneyIn(facts);
      const other = (lang === 'tr' ? facts.match(/^(.+?), /) : facts.match(/^(.+?) have made/))?.[1] ?? '';
      return { key: 'transfer_rumour', slots: { fee, other }, lede: facts };
    }
    case 'callup': {
      const team = (lang === 'tr' ? facts.match(/, (.+?) kadrosuna/) : facts.match(/called up by (.+?) (?:for|again)/))?.[1] ?? ctx.player.nation;
      const firstCap = /ilk kez|for the first time/i.test(facts);
      return { key: firstCap ? 'callup_first' : 'callup', slots: { team }, lede: facts };
    }
    case 'story':
      return { key: seed.aboutUser ? 'generic_user' : 'generic_other', slots: {}, lede: facts };
    default:
      return { key: seed.aboutUser ? 'generic_user' : 'generic_other', slots: {}, lede: first(facts) === facts ? facts : facts };
  }
}

const isTabloid = (outlet: string) => hashStr(outlet) % 2 === 0;

function pickHead(list: readonly string[], tabloid: boolean, slots: Slots, rng: ReturnType<typeof rngFrom>): string {
  const styled = list.filter((h) => h.includes('!') === tabloid);
  return pickFilled(styled.length ? styled : list, slots, rng);
}

export function writeArticle(ctx: NarrativeContext, seed: NewsSeed, index = 0): Omit<NewsArticle, 'id' | 'season' | 'week'> {
  const lang = langOf(ctx);
  const rng = rngFrom('news', ctx.season, ctx.week, ctx.player.name, index, (seed.facts ?? '').slice(0, 120));
  const slots: Slots = { ...ctxSlots(ctx) };
  const kv = parseFacts(seed.facts ?? '');
  let key = kv.k;
  let lede = kv.say ?? '';
  if (key && NEWS_TABLES[key]) {
    for (const [k, v] of Object.entries(kv)) if (k !== 'k' && k !== 'say') slots[k] = v;
  } else {
    const c = classify(seed, ctx, lang, rng);
    key = c.key;
    Object.assign(slots, c.slots);
    lede = c.lede;
  }
  const entry = NEWS_TABLES[key] ?? NEWS_TABLES[seed.aboutUser ? 'generic_user' : 'generic_other'];
  const outlet = rng.pick(outletsFor(ctxCountry(ctx)));
  const tabloid = isTabloid(outlet);
  const headline = cap(fill(pickHead(entry.h[lang], tabloid, slots, rng), slots, rng, lang), lang);

  const nExtra = seed.importance >= 0.5 && entry.f[lang].length > 1 ? 2 : 1;
  const extras = pickN(rng, entry.f[lang].filter((tpl) => pickFilled([tpl], slots, rng) === tpl), nExtra).map((tpl) => fill(tpl, slots, rng, lang));
  const body = paragraph([lede, ...extras], lang).slice(0, 2400);
  const tags = [...new Set([...(seed.tags ?? []), ...(entry.tags ?? [])])];
  return {
    outlet,
    headline: headline.slice(0, 140),
    body,
    tags,
    importance: Math.max(0, Math.min(1, seed.importance ?? 0.3)),
    aboutUser: !!seed.aboutUser,
    ai: false,
  };
}

export function writeNews(ctx: NarrativeContext, seeds: NewsSeed[]): Omit<NewsArticle, 'id' | 'season' | 'week'>[] {
  return seeds.map((s, i) => {
    try { return writeArticle(ctx, s, i); } catch {
      return { outlet: outletsFor(ctxCountry(ctx))[0] ?? 'Press', headline: (s.facts ?? '').slice(0, 96), body: s.facts ?? '', tags: s.tags ?? [], importance: s.importance ?? 0.3, aboutUser: !!s.aboutUser, ai: false };
    }
  });
}
