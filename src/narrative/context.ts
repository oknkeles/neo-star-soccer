import type { GameState, Lang } from '../core/types';
import type { NarrativeContext } from '../core/narrative-types';
import { t } from '../core/i18n';
import { round1 } from '../core/util';
import * as world from '../world/api';
import { clubOf, rememberWorld, leagueNameOf, leaguePos, managerOf, nationName, ovr, playerName, positionNoun, safe, teamName, userOf } from './safe';
import './strings';

/** Words, never numbers: what the hidden potential feels like from the outside. */
export function potentialHint(potential: number, lang: Lang, lateBloomer = false): string {
  const key = lateBloomer && potential >= 80 ? 'hidden'
    : potential >= 92 ? 'generational'
      : potential >= 88 ? 'worldclass'
        : potential >= 84 ? 'elite'
          : potential >= 79 ? 'top'
            : potential >= 73 ? 'solid'
              : 'journeyman';
  return t(`narr.pot.${key}`, undefined, lang);
}

export function buildNarrativeContext(state: GameState): NarrativeContext {
  rememberWorld(state);
  const lang: Lang = state.lang === 'en' ? 'en' : 'tr';
  const p = userOf(state);
  const career = state.career;
  const club = clubOf(state, p?.clubId ?? null);
  const mgr = managerOf(state, club);
  const players = state.world?.players ?? {};
  const people = career?.people ?? [];
  const rival = career?.rivalId ? players[career.rivalId] : undefined;
  const mentor = career?.mentorId ? players[career.mentorId] : undefined;
  const partner = career?.partnerId ? people.find((x) => x.id === career.partnerId) : undefined;
  const agent = people.find((x) => x.role === 'agent') ?? career?.genesis?.agent;

  const position = p ? safe(() => world.positionName(p.position), '') || positionNoun(p.position, lang) : '';
  const apps = p?.season?.apps ?? 0;

  const recentResults = (career?.matches ?? []).slice(-5).map((m) => {
    const res = m.goalsFor > m.goalsAgainst ? 'W' : m.goalsFor < m.goalsAgainst ? 'L' : 'D';
    const bits: string[] = [];
    if (m.goals) bits.push(`${m.goals}G`);
    if (m.assists) bits.push(`${m.assists}A`);
    bits.push(String(round1(m.rating)));
    return `${t(`narr.res.${res}`, undefined, lang)} ${m.goalsFor}-${m.goalsAgainst} vs ${m.opponent} (${bits.join(', ')})`;
  });

  const headlines = [...(state.news ?? [])]
    .sort((a, b) => (b.season * 100 + b.week) - (a.season * 100 + a.week))
    .slice(0, 5)
    .map((n) => n.headline);

  return {
    lang,
    season: state.season,
    week: state.week,
    player: {
      name: playerName(p) || '—',
      nickname: p?.nickname,
      age: p ? state.season - p.birthYear : 17,
      nation: nationName(p?.nation ?? 'TUR', lang),
      position,
      overall: p ? ovr(p) : 50,
      potentialHint: potentialHint(p?.potential ?? 75, lang, !!p?.traits?.includes('late_bloomer')),
      traits: [...(p?.traits ?? [])],
      fame: career?.fame ?? 0,
      followers: career?.followers ?? 0,
      morale: p?.morale ?? 50,
      form: p?.form ?? 50,
      value: p?.value ?? 0,
      wage: p?.contract?.wage ?? 0,
      injured: !!p?.injury,
    },
    club: club
      ? {
        name: club.name,
        city: club.city,
        league: leagueNameOf(state, club),
        leaguePos: leaguePos(state, club.id),
        reputation: club.reputation,
        managerName: mgr ? `${mgr.firstName} ${mgr.lastName}` : '',
        managerTemperament: mgr?.temperament ?? 'calm',
      }
      : null,
    seasonStats: {
      apps,
      goals: p?.season?.goals ?? 0,
      assists: p?.season?.assists ?? 0,
      avgRating: apps ? round1((p?.season?.ratingSum ?? 0) / apps) : 0,
    },
    careerStats: {
      apps: p?.career?.apps ?? 0,
      goals: p?.career?.goals ?? 0,
      assists: p?.career?.assists ?? 0,
      trophies: career?.trophies?.length ?? 0,
      caps: p?.intlCaps ?? 0,
    },
    relationships: { ...(career?.relationships ?? {}) },
    rival: rival
      ? {
        name: playerName(rival),
        club: rival.clubId ? teamName(state, rival.clubId) : state.world?.externalClubs?.[rival.id] ?? '',
        goals: rival.season?.goals ?? 0,
        overall: ovr(rival),
      }
      : null,
    mentor: mentor ? { name: playerName(mentor) } : null,
    partner: partner ? { name: partner.name } : null,
    agent: agent ? { name: agent.name, personality: agent.personality } : null,
    recentResults,
    storylines: (state.storylines ?? []).filter((s) => s.active).map((s) => ({ kind: s.kind, stage: s.stage })),
    hometown: career?.genesis?.hometown ?? '',
    backstory: career?.genesis?.backstory ?? '',
    dream: career?.genesis?.dream ?? '',
    recentHeadlines: headlines,
  };
}
