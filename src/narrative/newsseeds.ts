/**
 * newsSeedsForWeek: factual seeds from the week that just finished — league round-ups, the rival's
 * exploits, the user's milestones, derby hype and transfer gossip. Pure reading of state, except for
 * small `narr.*` bookkeeping flags that stop the same story being told twice.
 */
import type { Competition, Fixture, GameState, WeekReport } from '../core/types';
import type { NewsSeed } from '../core/narrative-types';
import type { Rng } from '../core/rng';
import * as competition from '../competition/api';
import { formatMoney } from '../core/util';
import { clubOf, playerName, safe, teamName, teamRep, userOf } from './safe';
import { L } from './eventkit';
import { mkSeed } from './seedkit';
import { baseSlots, buildFacts } from './facts';
import { inventedPerson } from './ctxutil';
import { buildNarrativeContext } from './context';

const flagNum = (state: GameState, k: string, d = -1): number => {
  const v = state.flags?.[k];
  return typeof v === 'number' ? v : d;
};

function leagueComps(state: GameState): Competition[] {
  return Object.values(state.competitions ?? {}).filter((c) => c.kind === 'league' && c.season === state.season);
}

function sortedRows(c: Competition) {
  const rows = c.tables?.main ?? [];
  return [...rows].sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
}

const playedThisWeek = (c: Competition, season: number, week: number): Fixture[] =>
  (c.fixtures ?? []).filter((x) => x.played && x.season === season && x.week === week && x.homeGoals !== undefined && x.awayGoals !== undefined);

export function newsSeedsForWeek(state: GameState, report: WeekReport, rng: Rng): NewsSeed[] {
  const seeds: NewsSeed[] = [];
  const lang = state.lang === 'en' ? 'en' : 'tr';
  const f = buildFacts(state);
  const p = userOf(state);
  const season = report?.season ?? state.season;
  const week = report?.week ?? state.week;
  const myClub = clubOf(state, p?.clubId ?? null);
  const userComp = myClub ? leagueComps(state).find((c) => c.teamIds.includes(myClub.id)) : undefined;
  const ctx = safe(() => buildNarrativeContext(state), null);
  const pundit = ctx ? inventedPerson(ctx, 'pundit', week) : '';
  const base = baseSlots(f);
  const push = (s: NewsSeed) => { if (seeds.length < 12) seeds.push(s); };

  // ─── league round-up (user's league first, one other league for world feel) ───
  const comps = leagueComps(state);
  const others = comps.filter((c) => c !== userComp);
  const watch = [...(userComp ? [userComp] : []), ...(others.length ? [rng.pick(others)] : [])];
  for (const comp of watch) {
    const fixtures = playedThisWeek(comp, season, week).filter((x) => !x.userInvolved);
    let upset: { w: string; l: string; gap: number; score: string } | null = null;
    let thrash: { w: string; l: string; score: string; gd: number } | null = null;
    for (const x of fixtures) {
      const hg = x.homeGoals ?? 0;
      const ag = x.awayGoals ?? 0;
      if (hg === ag) continue;
      const w = hg > ag ? x.homeId : x.awayId;
      const l = hg > ag ? x.awayId : x.homeId;
      const gap = teamRep(state, l) - teamRep(state, w);
      const score = `${Math.max(hg, ag)}-${Math.min(hg, ag)}`;
      if (gap >= 12 && (!upset || gap > upset.gap)) upset = { w, l, gap, score };
      const gd = Math.abs(hg - ag);
      if (gd >= 4 && (!thrash || gd > thrash.gd)) thrash = { w, l, score, gd };
    }
    const leagueName = comp.name;
    if (upset) {
      push(mkSeed('league', 'upset', { team: teamName(state, upset.w), team2: teamName(state, upset.l), score: upset.score, pundit },
        L('{team}, kâğıt üstünde favori görünen {team2:acc} {score} mağlup etti.', '{team} beat the favourites {team2} {score}.'), lang, rng,
        { base, importance: Math.min(0.7, 0.35 + upset.gap / 100), tags: ['league', 'upset'] }));
    }
    if (thrash && !upset) {
      push(mkSeed('league', 'thrashing', { team: teamName(state, thrash.w), team2: teamName(state, thrash.l), score: thrash.score },
        L('{team}, {team2:acc} {score} gibi farklı bir skorla geçti.', '{team} routed {team2} {score}.'), lang, rng,
        { base, importance: 0.4, tags: ['league'] }));
    }

    const rows = sortedRows(comp);
    if (rows.length >= 3 && week >= 3) {
      // change at the top
      const leader = rows[0];
      const key = `narr.leader.${comp.id}`;
      const prev = state.flags?.[key];
      if (typeof prev === 'string' && prev !== leader.teamId && leader.played >= 3) {
        push(mkSeed('league', 'leader_change', { team: teamName(state, leader.teamId), pts: leader.points },
          L('{team}, {pts} puanla {league} liderliğine yükseldi.', '{team} climbed to the top of the {league} on {pts} points.'), lang, rng,
          { base, importance: leader.teamId === myClub?.id ? 0.7 : 0.45, aboutUser: leader.teamId === myClub?.id, tags: ['league'] }));
      }
      if (state.flags) state.flags[key] = leader.teamId;
      // unbeaten / winning runs
      for (const r of rows.slice(0, 4)) {
        const run = [...(r.form ?? [])].reverse().findIndex((x) => x !== 'W');
        const streak = run === -1 ? (r.form ?? []).length : run;
        const sk = `narr.streak.${r.teamId}`;
        if (streak >= 5 && f.abs - flagNum(state, sk, -99) > 10) {
          if (state.flags) state.flags[sk] = f.abs;
          push(mkSeed('league', 'win_streak', { team: teamName(state, r.teamId), streak },
            L('{team} üst üste {streak} maç kazandı.', '{team} have won {streak} in a row.'), lang, rng,
            { base, importance: r.teamId === myClub?.id ? 0.6 : 0.35, aboutUser: r.teamId === myClub?.id, tags: ['league'] }));
          break;
        }
      }
      // late-season races
      if (week >= 26 && week % 4 === 0) {
        const gap = rows[0].points - rows[1].points;
        if (gap <= 4) {
          push(mkSeed('league', 'title_race', { team: teamName(state, rows[0].teamId), team2: teamName(state, rows[1].teamId), gap, pundit },
            L('Zirvede {team} ile {team2} arasındaki fark yalnızca {gap} puan.', 'Only {gap} points separate {team} and {team2} at the top.'), lang, rng,
            { base, importance: 0.5, tags: ['league', 'title'] }));
        }
      }
      const def = (state.world?.leagues ?? []).find((l) => l.country === comp.country && l.tier === comp.tier);
      if (week >= 28 && week % 5 === 0 && def && def.relegate > 0 && rows.length > def.relegate + 1) {
        const edge = rows[rows.length - def.relegate - 1];
        push(mkSeed('league', 'relegation_fight', { team: teamName(state, edge.teamId) },
          L('{team}, küme düşme hattının hemen üstünde nefes nefese.', '{team} are fighting for survival just above the drop zone.'), lang, rng,
          { base, importance: edge.teamId === myClub?.id ? 0.6 : 0.3, aboutUser: edge.teamId === myClub?.id, tags: ['league', 'relegation'] }));
      }
      // scoring chart
      if (week % 5 === 0 && week >= 8) {
        const top = safe(() => competition.topScorers(state, comp.id, 1)[0], undefined);
        if (top && top.goals >= 6 && top.playerId !== p?.id) {
          const who = playerName(state.world?.players?.[top.playerId]);
          if (who) {
            push(mkSeed('league', 'scorer_race', { person: who, n: top.goals, pundit },
              L('{person}, {league} gol krallığında {n} golle önde.', '{person} leads the {league} scoring charts with {n} goals.'), lang, rng,
              { base, importance: 0.3, tags: ['league'] }));
          }
        }
      }
      void leagueName;
    }
  }

  // ─── the user's own milestones ───
  if (p) {
    const apps = p.career?.apps ?? 0;
    const appsMarks = [10, 25, 50, 100, 150, 200, 300, 400, 500, 600];
    const doneApps = flagNum(state, 'narr.m.apps', 0);
    const crossedApps = [...appsMarks].reverse().find((m) => apps >= m && m > doneApps);
    if (crossedApps) {
      if (state.flags) state.flags['narr.m.apps'] = crossedApps;
      push(mkSeed('milestone', 'apps_milestone', { n: crossedApps },
        L('{player}, kariyerindeki {n}. resmî maçına çıktı.', '{player} made his {n}th professional appearance.'), lang, rng,
        { base, importance: crossedApps >= 100 ? 0.55 : 0.35, aboutUser: true, tags: ['milestone', 'user'] }));
    }
    const sg = p.season?.goals ?? 0;
    const goalMarks = [5, 10, 15, 20, 25, 30, 35, 40];
    const doneG = flagNum(state, `narr.m.sg.${season}`, 0);
    const crossedG = [...goalMarks].reverse().find((m) => sg >= m && m > doneG);
    if (crossedG) {
      if (state.flags) state.flags[`narr.m.sg.${season}`] = crossedG;
      push(mkSeed('milestone', 'season_goals', { n: crossedG },
        L('{player} bu sezonki gol sayısını {n}\'e taşıdı.', '{player} has taken his tally for the season to {n}.'), lang, rng,
        { base, importance: Math.min(0.75, 0.4 + crossedG / 80), aboutUser: true, tags: ['milestone', 'user'] }));
    }
  }

  // ─── the rival's exploits ───
  const rival = state.world?.players?.[state.career?.rivalId ?? ''];
  if (rival) {
    const rname = playerName(rival);
    const rclub = rival.clubId ? teamName(state, rival.clubId) : state.world?.externalClubs?.[rival.id] ?? '';
    const rg = rival.season?.goals ?? 0;
    const doneRg = flagNum(state, `narr.rv.g.${season}`, 0);
    if (rg >= 5 && Math.floor(rg / 5) * 5 > doneRg) {
      const mark = Math.floor(rg / 5) * 5;
      if (state.flags) state.flags[`narr.rv.g.${season}`] = mark;
      push(mkSeed('rival', 'rival_goals', { rival: rname, n: rg, team: rclub },
        L('{rival}, {team} formasıyla bu sezon {n} gole ulaştı.', '{rival} has reached {n} goals for {team} this season.'), lang, rng,
        { base, importance: 0.5, tags: ['rival'] }));
    }
    const lastClub = state.flags?.['narr.rv.club'];
    const curClub = rival.clubId ?? 'free';
    if (typeof lastClub === 'string' && lastClub !== curClub && curClub !== 'free') {
      const oldName = lastClub === 'free' ? '' : teamName(state, lastClub);
      push(mkSeed('rival', 'rival_move', { rival: rname, team: rclub, team2: oldName || (lang === 'tr' ? 'eski kulübünü' : 'his old club'), player: ctx?.player.name ?? '' },
        L('{rival}, kulüp değiştirerek {team} ile anlaştı.', '{rival} has changed clubs and signed for {team}.'), lang, rng,
        { base, importance: 0.55, tags: ['rival', 'transfer'] }));
    }
    if (state.flags) state.flags['narr.rv.club'] = curClub;
    const injKey = rival.injury ? `${rival.injury.key}:${season}:${week - (rival.injury.weeksLeft > 0 ? 0 : 0)}` : '';
    if (rival.injury && rival.injury.weeksLeft >= 3 && state.flags?.['narr.rv.inj'] !== rival.injury.key + season) {
      if (state.flags) state.flags['narr.rv.inj'] = rival.injury.key + season;
      push(mkSeed('rival', 'rival_injury', { rival: rname, team: rclub, weeks: rival.injury.weeksLeft, player: ctx?.player.name ?? '' },
        L('{rival} sakatlandı ve {weeks} hafta yok.', '{rival} has been injured and will miss around {weeks} weeks.'), lang, rng,
        { base, importance: 0.4, tags: ['rival', 'injury'] }));
    }
    void injKey;
  }

  // ─── derby next week ───
  if (myClub && p && f.clubId) {
    const nextWeek = week + 1;
    for (const c of Object.values(state.competitions ?? {})) {
      const fx = (c.fixtures ?? []).find((x) => x.season === season && x.week === nextWeek && (x.homeId === myClub.id || x.awayId === myClub.id));
      if (!fx) continue;
      const opp = fx.homeId === myClub.id ? fx.awayId : fx.homeId;
      if (myClub.derbyRivals?.includes(opp)) {
        push(mkSeed('match', 'derby_hype', { opp: teamName(state, opp), pundit },
          L('Gelecek hafta {club} ile {opp} derbide karşı karşıya geliyor.', '{club} meet {opp} in next week\'s derby.'), lang, rng,
          { base, importance: 0.5, aboutUser: true, tags: ['derby', 'user'], }));
        // the lede mentions the club name via the slot added below
        seeds[seeds.length - 1].facts += ` | club=${myClub.name}`;
        break;
      }
    }
  }

  // ─── transfer gossip when the player is hot ───
  if (p && myClub && f.fame >= 30 && f.form >= 58 && f.abs - flagNum(state, 'narr.rumour.abs', -99) >= 9 && rng.chance(0.3) && !f.transferListed) {
    const bigger = Object.values(state.world?.clubs ?? {}).filter((c) => c.id !== myClub.id && c.reputation >= myClub.reputation + 4 && c.reputation <= myClub.reputation + 25);
    if (bigger.length) {
      const target = rng.pick(bigger);
      if (state.flags) state.flags['narr.rumour.abs'] = f.abs;
      const fee = formatMoney(Math.max(250_000, Math.round((p.value * rng.float(0.8, 1.35)) / 100_000) * 100_000), lang);
      const agentName = f.agentName;
      const asRumour = rng.chance(0.65);
      push(mkSeed('transfer_rumour', asRumour ? 'transfer_rumour' : 'gossip_user', { other: target.name, fee, agent: agentName, club: myClub.name, pundit },
        asRumour
          ? L('{other}, {player:acc} kadrosuna katmak için {fee} civarında bir bonservis planlıyor iddiası.', 'It is claimed that {other} are plotting a bid of around {fee} for {player}.')
          : L('{other} çevrelerinde {player:gen} adı geçiyor; kulüp içinden net bir açıklama yok.', 'Sources close to {other} say {player} is on their shortlist; nothing official from {club}.'),
        lang, rng, { base, importance: 0.5, aboutUser: true, tags: ['transfer', 'rumour', 'user'] }));
    }
  }

  return seeds;
}
