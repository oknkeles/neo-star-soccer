/**
 * Storylines: multi-stage arcs (rival, mentor, hometown, manager feud, love, scandal, injury comeback,
 * wonderkid threat, agent drama, golden generation, underdog title, contract standoff). Each arc is a small
 * state machine over `Storyline.stage` / `Storyline.data`; its beats are decision events (data/story_beats.ts)
 * and news seeds written through the same banks as every other article.
 */
import type { Fixture, GameEvent, GameState, Lang, Person, Storyline } from '../core/types';
import type { NewsSeed } from '../core/narrative-types';
import type { Rng } from '../core/rng';
import { nextId } from '../core/util';
import { positionGroup } from '../core/ratings';
import { L, makeEvent, type EventDef } from './eventkit';
import { baseSlots, buildFacts, type Facts } from './facts';
import type { Loc, Slots } from './grammar';
import { fullPersonName } from './names';
import { mkSeed } from './seedkit';
import { ovr, safe, userOf } from './safe';
import { STORY_BEATS } from './data/story_beats';

export type StoryTrigger =
  | { kind: 'week' }
  | { kind: 'match'; fixtureId: string; won: boolean | null; userGoals: number; rating: number; vsRival: boolean }
  | { kind: 'transfer'; fromClubId: string | null; toClubId: string }
  | { kind: 'injury'; weeks: number }
  | { kind: 'season_end' }
  | { kind: 'award'; key: string };

export interface StoryOut { events: GameEvent[]; seeds: NewsSeed[] }

const BEATS: Record<string, EventDef> = Object.fromEntries(STORY_BEATS.map((d) => [d.id, d]));
export const beatById = (id: string): EventDef | undefined => BEATS[id];

const MAX_EVENTS_PER_CALL = 2;
const MAX_ACTIVE = 6;

interface Env {
  state: GameState;
  rng: Rng;
  f: Facts;
  lang: Lang;
  trigger: StoryTrigger;
  story: Storyline;
  out: StoryOut;
  base: Slots;
  /** weeks since an abs-week stored in story.data[key] (Infinity if never set) */
  since: (key: string) => number;
  mark: (key: string) => void;
  beat: (id: string, extra?: Slots) => boolean;
  news: (kind: NewsSeed['kind'], key: string, slots: Slots, say: Loc, importance: number, tags?: string[], aboutUser?: boolean) => void;
  stage: (n: number) => void;
  end: () => void;
}

interface StartCtx { state: GameState; f: Facts; rng: Rng; trigger: StoryTrigger; done: number }

interface StoryDef {
  kind: string;
  /** Weight to start this arc now (0 = not eligible). `instant` skips the random start lottery. */
  start: (c: StartCtx) => { weight: number; instant?: boolean } | 0;
  init?: (c: StartCtx) => Record<string, string | number | boolean>;
  step: (e: Env) => void;
  /** Called after the user resolved one of this arc's beats. */
  onEvent?: (state: GameState, rng: Rng, story: Storyline, defId: string, choiceId: string, f: Facts) => void;
}

const n = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const s0 = (v: unknown): string => (typeof v === 'string' ? v : '');

// ───────── helpers ─────────

/** The club the user's team meets in `week + 1` (any competition), or null. */
function nextOpponentId(state: GameState, clubId: string | null): string | null {
  if (!clubId) return null;
  for (const c of Object.values(state.competitions ?? {})) {
    for (const fx of c.fixtures ?? []) {
      if (fx.season === state.season && fx.week === state.week + 1 && (fx.homeId === clubId || fx.awayId === clubId)) {
        return fx.homeId === clubId ? fx.awayId : fx.homeId;
      }
    }
  }
  return null;
}

function findFixtureLocal(state: GameState, id: string): Fixture | null {
  for (const c of Object.values(state.competitions ?? {})) {
    const fx = (c.fixtures ?? []).find((x) => x.id === id);
    if (fx) return fx;
  }
  return null;
}

function scoreOf(state: GameState, fixtureId: string): string {
  const fx = findFixtureLocal(state, fixtureId);
  const p = userOf(state);
  if (!fx || fx.homeGoals === undefined || fx.awayGoals === undefined || !p) return '';
  const home = p.clubId === fx.homeId;
  return home ? `${fx.homeGoals}-${fx.awayGoals}` : `${fx.awayGoals}-${fx.homeGoals}`;
}

const activeOf = (state: GameState, kind: string) => (state.storylines ?? []).find((s) => s.active && s.kind === kind);

function replaceAgent(state: GameState, rng: Rng, f: Facts): void {
  const people = state.career.people;
  const idx = people.findIndex((x) => x.role === 'agent');
  const tr = f.lang === 'tr';
  const personalities = tr
    ? ['şeffaf ve titiz', 'genç, hırslı ve enerjik', 'sakin, sözüne güvenilir']
    : ['transparent and meticulous', 'young, hungry and energetic', 'calm and reliable'];
  const bios = tr
    ? ['Daha önce iki genç yıldızı büyük kulüplere taşıdı; her kuruşun hesabını raporlayan nadir menajerlerden.', 'Spor hukuku mezunu. Sözleşmelerin her satırını okur, imzadan önce gece yarısı arar.', 'Eski bir kulüp yöneticisi; masanın öbür tarafını çok iyi tanıyor.']
    : ['Has taken two young stars to big clubs before; one of the rare agents who reports every penny.', 'A sports-law graduate. Reads every line of a contract and calls at midnight before signing.', 'A former club executive who knows the other side of the table very well.'];
  const pick = Math.floor(rng.next() * personalities.length);
  const person: Person = {
    id: nextId(state, 'PER'),
    name: fullPersonName(rng, f.culture, rng.chance(0.8) ? 'm' : 'f', true),
    role: 'agent',
    personality: personalities[pick],
    bio: bios[pick],
    relationship: 55,
  };
  if (idx >= 0) people[idx] = person; else people.push(person);
  state.career.relationships.agent = 55;
}

// ───────── story definitions ─────────

const RIVAL: StoryDef = {
  kind: 'rival',
  start: (c) => (c.f.rivalId && c.done > 0 && c.f.weeksSince('narr.rival.done') > 40 ? { weight: 1.6 } : 0),
  init: () => ({ duels: 0, wins: 0, losses: 0 }),
  step: (e) => {
    const { f, story: s, trigger } = e;
    if (!f.rivalId) return;
    if (trigger.kind === 'match' && trigger.vsRival) {
      s.data.duels = n(s.data.duels) + 1;
      const score = scoreOf(e.state, trigger.fixtureId);
      if (trigger.won === true) {
        s.data.wins = n(s.data.wins) + 1;
        s.stage = Math.max(s.stage, 1);
        e.news('rival', 'rival_result_win', { score, rival: f.rivalName }, L('{player}, {rival} karşısında {score} kazandı.', '{player} beat {rival} {score}.'), 0.65, ['rival', 'match']);
        e.beat('rival_after_win');
      } else if (trigger.won === false) {
        s.data.losses = n(s.data.losses) + 1;
        s.stage = Math.max(s.stage, 1);
        e.news('rival', 'rival_result_loss', { score, rival: f.rivalName }, L('{rival}, {player} karşısında üstünlüğü ele geçirdi ({score}).', '{rival} came out on top against {player} ({score}).'), 0.55, ['rival', 'match']);
        e.beat('rival_after_loss');
      }
    }
    if (trigger.kind === 'week' && f.rivalClubId && e.since('builtUp') > 6) {
      const opp = nextOpponentId(e.state, f.clubId);
      if (opp && opp === f.rivalClubId) {
        e.mark('builtUp');
        s.stage = Math.max(s.stage, 1);
        e.news('rival', 'rival_buildup', { rival: f.rivalName, rivalClub: f.rivalClub },
          L('Gelecek hafta {club}, {rivalClub} ile karşılaşıyor; {player} ve {rival} sahada yüz yüze gelecek.', '{club} face {rivalClub} next week, putting {player} and {rival} head to head.'), 0.6, ['rival']);
        e.beat('rival_buildup');
      }
    }
    if (trigger.kind === 'season_end') {
      const duels = n(s.data.duels);
      const seasons = f.season - s.startedSeason;
      if ((duels >= 2 && n(s.data.wins) + n(s.data.losses) >= 1) || seasons >= 2) {
        e.news('rival', 'rival_resolved', { rival: f.rivalName }, L('{player} ile {rival}, yıllardır süren rekabetin ardından aralarındaki gerginliği geride bırakmaya hazır görünüyor.', '{player} and {rival} look ready to leave the tension behind after years of rivalry.'), 0.6, ['rival']);
        e.beat('rival_resolution');
        e.state.flags['narr.rival.done'] = f.abs;
        e.end();
      }
    }
  },
};

const MENTOR: StoryDef = {
  kind: 'mentor',
  start: () => 0,
  step: (e) => {
    const { f, story: s, trigger } = e;
    if (!f.mentorName) { if (trigger.kind === 'season_end') e.end(); return; }
    if (trigger.kind === 'week') {
      if (s.stage === 0 && f.mentorAtClub && e.since('startAbs') >= 5 && e.rng.chance(0.35) && e.beat('mentor_lesson_1')) s.stage = 1;
      else if (s.stage === 1 && f.mentorAtClub && e.since('lastBeat') >= 14 && e.rng.chance(0.3) && e.beat('mentor_lesson_2')) s.stage = 2;
      if (f.lastRating !== null && f.lastRating >= 8 && f.mentorAtClub && e.since('praise') > 20 && e.rng.chance(0.4)) {
        e.mark('praise');
        e.news('story', 'mentor_praise', { mentor: f.mentorName }, L('{mentor}, genç oyuncuyu "Yetiştirdiğim en parlak çırak" diye övdü.', '{mentor} called the youngster "the brightest apprentice I have trained".'), 0.45, ['mentor', 'user']);
      }
    }
    if (trigger.kind === 'season_end' && f.mentorAge >= 34) {
      const p = Math.min(0.85, 0.25 + (f.mentorAge - 34) * 0.2);
      if (e.rng.chance(p)) {
        e.news('story', 'mentor_farewell', { mentor: f.mentorName }, L('{mentor}, sezon sonunda kramponları astığını açıkladı.', '{mentor} announced he will retire at the end of the season.'), 0.7, ['mentor', 'user']);
        e.beat('mentor_farewell');
        e.state.flags['narr.mentor.gone'] = f.abs;
        e.end();
      }
    }
  },
};

const HOMETOWN: StoryDef = {
  kind: 'hometown',
  start: (c) => (c.f.hometownClubId && c.f.clubId !== c.f.hometownClubId && c.f.fame >= 25 && c.f.age >= 19 ? { weight: 1.3 } : 0),
  step: (e) => {
    const { f, story: s, trigger } = e;
    if (!f.hometownClubId) { e.end(); return; }
    if (trigger.kind === 'transfer' && trigger.toClubId === f.hometownClubId) {
      s.stage = 3;
      e.beat('hometown_homecoming');
      e.end();
      return;
    }
    if (trigger.kind !== 'week') return;
    if (f.clubId === f.hometownClubId && e.since('startAbs') > 4) { e.end(); return; }
    if (s.stage === 0 && f.transferWindow && f.fame >= 30 && e.since('lastBeat') > 8 && e.rng.chance(0.35)) {
      e.news('story', 'hometown_call', { hometown: f.hometown }, L('{hometown} kulübü, {player} için kapıyı aralık tutuyor.', 'The {hometown} club are keeping the door open for {player}.'), 0.5, ['hometown', 'user', 'transfer']);
      if (e.beat('hometown_call')) s.stage = 1;
    } else if (s.stage === 1 && e.since('lastBeat') >= 20 && e.rng.chance(0.25) && e.beat('hometown_second_call')) {
      s.stage = 2;
    } else if (s.stage === 2 && e.since('lastBeat') >= 40) {
      e.end();
    }
  },
};

const FEUD: StoryDef = {
  kind: 'manager_feud',
  start: (c) => {
    if (!c.f.clubId || !c.f.managerName) return 0;
    if (c.f.weeksSince('narr.feud.spark') <= 10) return { weight: 3.5 };
    if (c.f.rel.manager <= 30) return { weight: 1.6 };
    return 0;
  },
  init: (c) => ({ manager: c.f.managerName }),
  step: (e) => {
    const { f, story: s, trigger } = e;
    if (trigger.kind !== 'week') return;
    if (!f.managerName || f.managerName !== s0(s.data.manager)) { e.end(); return; }
    if (s.stage === 0 && e.since('startAbs') >= 2) {
      e.news('manager', 'feud_public', { manager: f.managerName }, L('{player} ile {manager} arasındaki gerginlik kulüp çevrelerinde dillere düştü.', 'The tension between {player} and {manager} is being talked about around the club.'), 0.55, ['manager', 'user']);
      if (e.beat('feud_public')) { s.stage = 1; e.mark('stageAbs'); }
    } else if (s.stage === 1) {
      if (f.rel.manager >= 62) {
        e.news('manager', 'feud_resolved', { manager: f.managerName }, L('{player} ve {manager} aralarındaki sorunu çözdü.', '{player} and {manager} have settled their differences.'), 0.45, ['manager', 'user']);
        e.end();
      } else if (e.since('stageAbs') >= 6 && e.beat('feud_summit')) { s.stage = 2; e.mark('stageAbs'); }
    } else if (s.stage === 2) {
      if (f.rel.manager >= 55) {
        e.news('manager', 'feud_resolved', { manager: f.managerName }, L('{player} ve {manager} sonunda aynı sayfada.', '{player} and {manager} are finally on the same page.'), 0.45, ['manager', 'user']);
        e.end();
      } else if (e.since('stageAbs') >= 14) e.end();
    }
  },
};

const LOVE: StoryDef = {
  kind: 'love',
  start: (c) => (c.f.partnerName && c.done === 0 ? { weight: 6, instant: true } : 0),
  init: (c) => ({ partner: c.f.partnerName ?? '' }),
  step: (e) => {
    const { f, story: s, trigger } = e;
    if (trigger.kind !== 'week') return;
    const partner = s0(s.data.partner);
    if (!f.partnerName) {
      if (partner) {
        e.news('story', 'love_split', { partner }, L('{player} ile {partner} yollarını ayırdı.', '{player} and {partner} have gone their separate ways.'), 0.5, ['love', 'user', 'gossip']);
        e.beat('love_breakup');
        e.end();
      } else if (e.since('startAbs') > 30) e.end();
      return;
    }
    s.data.partner = f.partnerName;
    if (s.stage === 0 && e.since('startAbs') >= 3) {
      e.news('story', 'love_tabloid', { partner: f.partnerName }, L('{player} ve {partner} bir restoranda birlikte görüntülendi.', '{player} and {partner} were photographed together at a restaurant.'), 0.5, ['love', 'user', 'gossip']);
      if (e.beat('love_paparazzi')) s.stage = 1;
    } else if (s.stage === 1) {
      if (s.data.engaged) {
        e.news('story', 'love_engaged', { partner: f.partnerName }, L('{player}, sevgilisi {partner} ile nişanlandı.', '{player} got engaged to {partner}.'), 0.65, ['love', 'user']);
        s.stage = 2;
        e.end();
      } else if (e.since('lastBeat') >= 18 && f.rel.partner >= 65 && e.rng.chance(0.3)) {
        e.beat('love_proposal');
      }
    }
  },
};

const SCANDAL: StoryDef = {
  kind: 'scandal',
  start: (c) => {
    if (c.state.flags['narr.scandal.pending']) return { weight: 10, instant: true };
    if ((c.f.has('party_animal') || c.f.has('hothead')) && c.f.fame >= 35) return { weight: 0.4 };
    return 0;
  },
  step: (e) => {
    const { f, story: s, trigger } = e;
    if (trigger.kind !== 'week') return;
    if (s.stage === 0 && e.since('startAbs') >= 2) {
      e.news('scandal', 'scandal_break', {}, L('{player} hakkında sosyal medyada ve magazinde iddialar dolaşıyor.', 'Claims about {player} are circulating on social media and in the tabloids.'), 0.7, ['scandal', 'user']);
      if (e.beat('scandal_press')) {
        s.stage = 1;
        e.mark('stageAbs');
        delete e.state.flags['narr.scandal.pending'];
      }
    } else if (s.stage === 1 && e.since('stageAbs') >= 5) {
      e.news('scandal', 'scandal_fade', {}, L('{player} çevresindeki tartışmalar yatışmış durumda.', 'The storm around {player} appears to be easing.'), 0.35, ['scandal', 'user']);
      e.end();
    }
    void f;
  },
};

const COMEBACK: StoryDef = {
  kind: 'injury_comeback',
  start: (c) => {
    const weeks = c.trigger.kind === 'injury' ? c.trigger.weeks : c.f.injuryWeeks;
    return c.f.injured && weeks >= 4 ? { weight: 5, instant: true } : 0;
  },
  init: (c) => ({ weeks: c.trigger.kind === 'injury' ? c.trigger.weeks : c.f.injuryWeeks }),
  step: (e) => {
    const { f, story: s, trigger } = e;
    if (trigger.kind !== 'week') return;
    if (s.data.setback && !s.data.setbackNews) {
      s.data.setbackNews = true;
      e.news('injury', 'comeback_setback', {}, L('{player} iyileşme sürecinde ufak bir geri adım attı.', '{player} suffered a small step back in his recovery.'), 0.5, ['injury', 'user']);
    }
    if (f.injured) {
      if (s.stage === 0 && n(s.data.weeks) >= 5 && e.since('startAbs') >= 2 && e.beat('comeback_rehab')) s.stage = 1;
    } else if (e.since('startAbs') >= 1) {
      e.news('story', 'comeback_return', {}, L('{player} sakatlığını geride bıraktı ve takım kadrosuna döndü.', '{player} has put his injury behind him and is back in the squad.'), 0.6, ['injury', 'user']);
      e.beat('comeback_return');
      e.end();
    }
  },
};

const WONDERKID: StoryDef = {
  kind: 'wonderkid_threat',
  start: (c) => {
    const kid = c.f.youngsterId ? c.state.world?.players?.[c.f.youngsterId] : undefined;
    if (!kid || !c.f.clubId || c.f.age < 19 || c.f.role === 'star') return 0;
    if (positionGroup(kid.position) !== c.f.posGroup) return 0;
    if (kid.potential < c.f.overall + 8 || ovr(kid) < c.f.overall - 12) return 0;
    return { weight: kid.potential >= 85 ? 3 : 2 };
  },
  init: (c) => ({ kid: c.f.youngster ?? '', kidId: c.f.youngsterId ?? '' }),
  step: (e) => {
    const { f, story: s, trigger } = e;
    const kid = e.state.world?.players?.[s0(s.data.kidId)];
    if (trigger.kind === 'week') {
      if (!kid || kid.clubId !== f.clubId) { e.end(); return; }
      const extra = { youngster: s0(s.data.kid) };
      if (s.stage === 0 && e.since('startAbs') >= 2) {
        e.news('story', 'wonderkid_buzz', { person: s0(s.data.kid) }, L('Altyapıdan yükselen {person}, {club} kadrosunda adından söz ettiriyor.', 'Academy graduate {person} is making a name for himself in the {club} squad.'), 0.5, ['story', 'user']);
        if (e.beat('wonderkid_buzz', extra)) s.stage = 1;
      } else if (s.stage === 1 && e.since('lastBeat') >= 10) {
        if (ovr(kid) >= f.overall - 2 || f.form < 50) { if (e.beat('wonderkid_pressure', extra)) s.stage = 2; }
        else if (f.overall - ovr(kid) > 15) e.end();
      }
    }
    if (trigger.kind === 'season_end' && s.stage >= 2) {
      if (kid && (kid.contract?.loan || kid.clubId !== f.clubId)) {
        e.news('story', 'wonderkid_loan', { person: s0(s.data.kid) }, L('{person}, kiralık olarak gönderildi.', '{person} has been sent out on loan.'), 0.4, ['story', 'user']);
      }
      e.end();
    }
  },
};

const AGENT: StoryDef = {
  kind: 'agent_drama',
  start: (c) => {
    if (!c.f.agentName) return 0;
    let w = 0;
    if (c.state.flags['narr.shady.signed']) w += 4;
    if (c.f.rel.agent <= 40) w += 2.5;
    if (c.f.has('mercenary')) w += 0.6;
    return w > 0 ? { weight: w } : 0;
  },
  step: (e) => {
    const { f, story: s, trigger } = e;
    if (trigger.kind !== 'week') return;
    if (s.data.fired && !s.data.firedNews) {
      s.data.firedNews = true;
      e.news('story', 'agent_split', { agent: s0(s.data.oldAgent) }, L('{player}, menajeri {agent} ile yollarını ayırdı.', '{player} has parted ways with his agent {agent}.'), 0.55, ['agent', 'user']);
      e.end();
      return;
    }
    if (s.stage === 0 && e.since('startAbs') >= 2) {
      if (e.beat('agent_whisper')) s.stage = 1;
    } else if (s.stage === 1 && e.since('lastBeat') >= 5) {
      s.data.oldAgent = f.agentName;
      if (e.beat('agent_confront')) s.stage = 2;
    } else if (s.stage === 2 && e.since('lastBeat') >= 30) e.end();
  },
  onEvent: (state, rng, story, defId, choiceId, f) => {
    if (defId !== 'agent_confront') return;
    if (choiceId === 'fire') {
      story.data.oldAgent = story.data.oldAgent || f.agentName;
      story.data.fired = true;
      replaceAgent(state, rng, f);
    } else {
      story.stage = 3;
      story.active = false;
    }
  },
};

const GOLDEN: StoryDef = {
  kind: 'golden_generation',
  start: (c) => (c.f.age <= 23 && (c.f.calledUp || c.f.caps >= 1) ? { weight: 3 } : 0),
  step: (e) => {
    const { f, story: s, trigger } = e;
    if (f.age > 26) { e.end(); return; }
    if (trigger.kind === 'week') {
      if (s.stage === 0 && (f.calledUp || f.caps >= 1) && e.since('startAbs') >= 1 && e.rng.chance(0.5)) {
        e.news('callup', 'golden_call', { nation: f.nationName }, L('{player}, {nation} millî takımının yeni kuşağının yüzlerinden biri olarak öne çıkıyor.', '{player} stands out as one of the faces of the new {nation} generation.'), 0.5, ['callup', 'user']);
        if (e.beat('golden_camp')) s.stage = 1;
      } else if (s.stage === 1 && f.tournament && n(s.data.tourn) !== f.season && f.calledUp) {
        s.data.tourn = f.season;
        if (e.beat('golden_tournament')) s.stage = 2;
      }
    }
    if (trigger.kind === 'season_end' && s.stage >= 2 && n(s.data.tourn) === f.season) e.end();
  },
};

const UNDERDOG: StoryDef = {
  kind: 'underdog_title',
  start: (c) => {
    const f = c.f;
    if (!f.clubId || f.clubTier !== 1 || f.leagueSize < 10 || f.phase !== 'season' || f.week < 12 || f.leaguePos === null) return 0;
    return f.clubRepRank > f.leagueSize * 0.4 && f.leaguePos <= 3 ? { weight: 4 } : 0;
  },
  init: (c) => ({ season: c.f.season }),
  step: (e) => {
    const { f, story: s, trigger } = e;
    if (n(s.data.season) !== f.season) { e.end(); return; }
    if (trigger.kind === 'week' && f.leaguePos !== null) {
      if (s.stage === 0 && f.week >= 12 && f.leaguePos <= 3 && e.rng.chance(0.5)) {
        e.news('story', 'underdog_rise', {}, L('{club}, beklenmedik şekilde şampiyonluk yarışının içinde.', '{club} are unexpectedly in the title race.'), 0.6, ['league', 'user']);
        if (e.beat('underdog_rise')) s.stage = 1;
      } else if (s.stage === 1) {
        if (f.week >= 34 && f.leaguePos <= 2 && e.rng.chance(0.6)) {
          e.news('story', 'underdog_near', {}, L('{club} şampiyonluğa sezonun son bölümünde çok yakın.', '{club} are within touching distance of the title in the closing stretch.'), 0.6, ['league', 'user']);
          if (e.beat('underdog_dream')) s.stage = 2;
        } else if (f.leaguePos > 6 && f.week >= 20) e.end();
      }
    }
    if (trigger.kind === 'season_end') {
      if (f.leaguePos === 1 && s.stage >= 1) {
        e.news('story', 'underdog_title', {}, L('{club}, masal gibi bir sezonun sonunda şampiyon oldu.', '{club} are champions at the end of a fairy-tale season.'), 0.9, ['league', 'user', 'title']);
        e.beat('underdog_parade');
      } else if (s.stage >= 2) e.beat('underdog_so_close');
      e.end();
    }
  },
};

const STANDOFF: StoryDef = {
  kind: 'contract_standoff',
  start: (c) => {
    const f = c.f;
    if (!f.clubId || f.contractEnd === null || f.contractEnd > f.season || f.week < 6 || f.phase !== 'season' || f.onLoan) return 0;
    return { weight: f.flag('narr.contract.stance') === 'raise' ? 6 : 3 };
  },
  step: (e) => {
    const { f, story: s, trigger } = e;
    if (trigger.kind === 'week') {
      if (f.contractEnd !== null && f.contractEnd > f.season) {
        if (s.stage >= 1) e.news('transfer_done', 'standoff_signed', {}, L('{player} ve {club} yeni sözleşmede uzlaştı.', '{player} and {club} have agreed a new contract.'), 0.55, ['contract', 'user']);
        e.end();
        return;
      }
      if (s.stage === 0 && e.since('startAbs') >= 2 && e.rng.chance(0.4)) {
        e.news('transfer_rumour', 'standoff_public', {}, L('{player} ile {club} yönetimi arasında sözleşme görüşmeleri tıkandı.', 'Contract talks between {player} and {club} have stalled.'), 0.55, ['contract', 'user']);
        if (e.beat('standoff_ultimatum')) s.stage = 1;
      }
    }
    if (trigger.kind === 'season_end' && f.contractEnd !== null && f.contractEnd <= f.season) e.end();
  },
};

export const STORY_DEFS: StoryDef[] = [RIVAL, MENTOR, HOMETOWN, FEUD, LOVE, SCANDAL, COMEBACK, WONDERKID, AGENT, GOLDEN, UNDERDOG, STANDOFF];
export const STORY_KINDS = STORY_DEFS.map((d) => d.kind);
const defOf = (kind: string) => STORY_DEFS.find((d) => d.kind === kind);

// ───────── engine ─────────

function makeEnv(state: GameState, rng: Rng, f: Facts, trigger: StoryTrigger, story: Storyline, out: StoryOut): Env {
  const lang = f.lang;
  const base = baseSlots(f);
  return {
    state, rng, f, lang, trigger, story, out, base,
    since: (key) => {
      const v = story.data[key];
      return typeof v === 'number' ? f.abs - v : Infinity;
    },
    mark: (key) => { story.data[key] = f.abs; },
    beat: (id, extra = {}) => {
      const def = BEATS[id];
      if (!def || out.events.length >= MAX_EVENTS_PER_CALL) return false;
      if ((state.events ?? []).some((x) => !x.resolved && x.defId === id)) return false;
      const ev = makeEvent(state, def, f, rng, story.id, extra);
      if (!ev.choices.length) return false;
      out.events.push(ev);
      state.flags[`narr.cd.${id}`] = f.abs;
      story.data.lastBeat = f.abs;
      return true;
    },
    news: (kind, key, slots, say, importance, tags = [], aboutUser = true) => {
      out.seeds.push(mkSeed(kind, key, slots, say, lang, rng, { base, importance, tags: ['story', ...tags], aboutUser }));
    },
    stage: (nn) => { story.stage = nn; },
    end: () => { story.active = false; },
  };
}

function startCtx(state: GameState, rng: Rng, f: Facts, trigger: StoryTrigger, kind: string): StartCtx {
  const done = (state.storylines ?? []).filter((s) => s.kind === kind && !s.active).length;
  return { state, f, rng, trigger, done };
}

function createStory(state: GameState, def: StoryDef, c: StartCtx): Storyline {
  const story: Storyline = {
    id: nextId(state, 'ST'),
    kind: def.kind,
    stage: 0,
    startedSeason: state.season,
    data: { startAbs: c.f.abs, ...(def.init ? def.init(c) : {}) },
    active: true,
  };
  state.storylines.push(story);
  return story;
}

/** Start/advance storylines. Returns events to present (caller stores them) and news seeds. */
export function updateStorylines(state: GameState, rng: Rng, trigger: StoryTrigger): StoryOut {
  const out: StoryOut = { events: [], seeds: [] };
  try {
    if (!state.storylines) state.storylines = [];
    if (state.career?.retired) return out;
    const f = buildFacts(state);

    // 1) start new arcs
    const active = state.storylines.filter((s) => s.active);
    if (active.length < MAX_ACTIVE) {
      const cands: { def: StoryDef; weight: number; instant: boolean; c: StartCtx }[] = [];
      for (const def of STORY_DEFS) {
        if (active.some((s) => s.kind === def.kind)) continue;
        const c = startCtx(state, rng, f, trigger, def.kind);
        const r = safe(() => def.start(c), 0 as const);
        if (r && r.weight > 0) cands.push({ def, weight: r.weight, instant: !!r.instant, c });
      }
      const instant = cands.filter((x) => x.instant);
      const lottery = trigger.kind === 'week' ? 0.1 : trigger.kind === 'season_end' ? 0.4 : 0;
      let chosen: (typeof cands)[number] | null = null;
      if (instant.length) chosen = rng.weighted(instant, (x) => x.weight);
      else if (cands.length && lottery > 0 && rng.chance(lottery)) chosen = rng.weighted(cands, (x) => x.weight);
      if (chosen) createStory(state, chosen.def, chosen.c);
    }

    // 2) advance every active arc
    for (const story of [...state.storylines]) {
      if (!story.active) continue;
      const def = defOf(story.kind);
      if (!def) continue;
      const env = makeEnv(state, rng, f, trigger, story, out);
      try { def.step(env); } catch { /* a broken arc must never break the week */ }
    }
  } catch {
    /* narrator never crashes the game */
  }
  return out;
}

/** Called by resolveEvent after the user chose in one of an arc's beats. */
export function onStoryEvent(state: GameState, rng: Rng, story: Storyline | null, defId: string, choiceId: string): void {
  if (!story) return;
  story.data[`last.${defId}`] = choiceId;
  const def = defOf(story.kind);
  if (!def?.onEvent) return;
  const f = buildFacts(state);
  def.onEvent(state, rng, story, defId, choiceId, f);
}

/** Initial storylines for a new career (rival + mentor + 1–2 natural arcs). */
export function initialStorylines(state: GameState, rng: Rng): Storyline[] {
  const f = buildFacts(state);
  const list: Storyline[] = [];
  const add = (def: StoryDef) => {
    const c = startCtx(state, rng, f, { kind: 'week' }, def.kind);
    const story: Storyline = {
      id: nextId(state, 'ST'), kind: def.kind, stage: 0, startedSeason: state.season, data: { startAbs: f.abs, ...(def.init ? def.init(c) : {}) }, active: true,
    };
    list.push(story);
  };
  if (f.rivalId) add(RIVAL);
  if (f.mentorName) add(MENTOR);
  const pool: StoryDef[] = [GOLDEN];
  if (f.hometownClubId && f.hometownClubId !== f.clubId) pool.push(HOMETOWN);
  rng.shuffle(pool);
  const take = Math.min(pool.length, rng.chance(0.5) ? 2 : 1);
  for (const def of pool.slice(0, take)) add(def);
  return list;
}

