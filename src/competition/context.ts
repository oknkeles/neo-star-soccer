/**
 * Weather, venues, importance and the full MatchContext for a fixture.
 */
import type { Competition, Fixture, GameState, Kit, MatchContext, TeamSheet, UserMatchRole, Weather, WeatherKind } from '../core/types';
import type { Rng } from '../core/rng';
import { clamp } from '../core/util';
import { compFormat, isKnockoutFixture, isQualifierId, isTournamentId, koStageKey } from './formats';
import { ct, hashStr, isUserTeam, nationName, userClubId, userNationalTeamId } from './helpers';
import { buildSheetWith } from './teams';
import { sortedTable } from './tables';

interface Climate { rain: number; cloudy: number; fog: number; snow: number; temp: number; wind: number }

const CLIMATE: Record<string, Climate> = {
  ENG: { rain: 0.32, cloudy: 0.33, fog: 0.05, snow: 0.05, temp: 11, wind: 6.5 },
  ESP: { rain: 0.08, cloudy: 0.14, fog: 0.01, snow: 0, temp: 19, wind: 3 },
  ITA: { rain: 0.14, cloudy: 0.2, fog: 0.06, snow: 0.02, temp: 16, wind: 3 },
  GER: { rain: 0.2, cloudy: 0.3, fog: 0.05, snow: 0.16, temp: 10, wind: 5 },
  FRA: { rain: 0.18, cloudy: 0.27, fog: 0.04, snow: 0.04, temp: 13, wind: 4.5 },
  POR: { rain: 0.11, cloudy: 0.15, fog: 0.02, snow: 0, temp: 18, wind: 4.5 },
  NED: { rain: 0.26, cloudy: 0.32, fog: 0.06, snow: 0.14, temp: 10, wind: 7.5 },
  TUR: { rain: 0.14, cloudy: 0.2, fog: 0.03, snow: 0.12, temp: 15, wind: 4 },
};
const DEFAULT_CLIMATE: Climate = { rain: 0.15, cloudy: 0.22, fog: 0.03, snow: 0.02, temp: 17, wind: 4 };

/**
 * Weather for a week (week 0 ≈ early August, coldest ≈ week 24). Winter snow is possible in
 * Germany, the Netherlands and Türkiye; England is rainy and windy; Iberia is warm and dry.
 */
export function randomWeather(rng: Rng, season: number, week: number, country?: string): Weather {
  void season;
  const c = (country && CLIMATE[country]) || DEFAULT_CLIMATE;
  const seasonal = Math.cos((2 * Math.PI * week) / 52); // +1 summer, −1 mid-winter
  let temperature = c.temp + 9 * seasonal + rng.normal(0, 2.5);
  const winter = seasonal < -0.55;
  let kind: WeatherKind = 'clear';
  const r = rng.next();
  const snowP = winter && temperature < 5 ? c.snow : 0;
  const rainP = c.rain * (winter ? 1.2 : seasonal > 0.6 ? 0.6 : 1);
  const fogP = c.fog * (winter ? 1.6 : 0.6);
  if (r < snowP) kind = 'snow';
  else if (r < snowP + rainP) kind = 'rain';
  else if (r < snowP + rainP + fogP) kind = 'fog';
  else if (r < snowP + rainP + fogP + c.cloudy) kind = 'cloudy';
  if (kind === 'snow') temperature = Math.min(temperature, rng.float(-4, 1));
  const tr = rng.next();
  const time: Weather['time'] = tr < 0.35 ? 'day' : tr < 0.6 ? 'dusk' : 'night';
  const speed = clamp(Math.abs(rng.normal(0, c.wind * 0.55)) + rng.float(0, c.wind * 0.5) + (kind === 'rain' ? 1.5 : 0), 0, 14);
  const angle = rng.float(0, Math.PI * 2);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { kind, time, wind: { x: r1(Math.cos(angle) * speed), y: r1(Math.sin(angle) * speed) }, temperature: Math.round(temperature) };
}

// ───────── venues ─────────

function stadiumsOf(state: GameState, country?: string): { name: string; capacity: number; clubId: string }[] {
  return Object.values(state.world.clubs)
    .filter((c) => !country || c.country === country)
    .map((c) => ({ name: c.stadium.name, capacity: c.stadium.capacity, clubId: c.id }))
    .sort((a, b) => b.capacity - a.capacity || a.clubId.localeCompare(b.clubId));
}

/** National stadium of a nation: the biggest ground in its league country, else an invented one. */
export function nationalStadium(state: GameState, nation: string): { name: string; capacity: number } {
  const own = stadiumsOf(state, nation)[0];
  if (own) return own;
  const rep = state.world.nationalTeams[`NT-${nation}`]?.reputation ?? 60;
  return { name: ct(state, 'nationalStadium', { nation: nationName(state, nation) }), capacity: 30000 + rep * 450 };
}

/** Deterministic neutral venue (finals and tournaments). */
export function neutralVenue(state: GameState, comp: Competition, fixture: Fixture): { name: string; capacity: number } {
  if (isTournamentId(comp.id)) {
    const countries = [...new Set(Object.values(state.world.clubs).map((c) => c.country))].sort();
    const host = countries.length ? countries[hashStr(comp.id) % countries.length] : undefined;
    const grounds = stadiumsOf(state, host).slice(0, 8);
    if (grounds.length) {
      const format = compFormat(comp);
      const isFinal = !!format && fixture.round === format.groupRounds + format.koWeeks.length;
      return isFinal ? grounds[0] : grounds[hashStr(fixture.id) % grounds.length];
    }
    return { name: ct(state, 'nationalStadium', { nation: host ?? comp.name }), capacity: 60000 };
  }
  const country = comp.kind === 'cup' ? comp.country : undefined;
  const grounds = stadiumsOf(state, country).filter((s) => s.clubId !== fixture.homeId && s.clubId !== fixture.awayId).slice(0, 6);
  if (grounds.length) return grounds[hashStr(comp.id) % grounds.length];
  return { name: comp.name, capacity: 50000 };
}

function venueFor(state: GameState, comp: Competition | undefined, fixture: Fixture): { name: string; capacity: number } {
  if (comp && fixture.neutral) return neutralVenue(state, comp, fixture);
  const club = state.world.clubs[fixture.homeId];
  if (club) return club.stadium;
  const nt = state.world.nationalTeams[fixture.homeId];
  if (nt) return nationalStadium(state, nt.nation);
  return { name: fixture.homeId, capacity: 20000 };
}

// ───────── importance & rotation ─────────

const KO_IMPORTANCE: Record<string, Record<string, number>> = {
  cup: { R64: 0.35, R32: 0.4, R16: 0.5, QF: 0.65, SF: 0.8, F: 1 },
  continental: { R16: 0.78, QF: 0.86, SF: 0.93, F: 1, R32: 0.72, R64: 0.7 },
  international: { R16: 0.86, QF: 0.9, SF: 0.95, F: 1, R32: 0.82, R64: 0.8 },
};

export function isDerby(state: GameState, a: string, b: string): boolean {
  const ca = state.world.clubs[a];
  const cb = state.world.clubs[b];
  return !!ca && !!cb && (ca.derbyRivals.includes(b) || cb.derbyRivals.includes(a));
}

export function fixtureImportance(state: GameState, comp: Competition | undefined, fixture: Fixture): number {
  let imp = 0.35;
  if (!comp) return imp;
  const format = compFormat(comp);
  if (format && fixture.round > format.groupRounds) {
    imp = KO_IMPORTANCE[comp.kind]?.[koStageKey(format, fixture.round - format.groupRounds)] ?? 0.6;
  } else if (comp.kind === 'continental') {
    imp = 0.6 + Math.min(0.15, fixture.round * 0.02);
  } else if (comp.kind === 'international') {
    if (isTournamentId(comp.id)) imp = 0.76 + fixture.round * 0.02;
    else imp = isQualifierId(fixture.id) ? 0.55 : 0.2;
  } else if (comp.kind === 'league') {
    imp = comp.tier === 1 ? 0.38 : 0.32;
    if (fixture.week >= 28) {
      const table = sortedTable(comp);
      const pos = (id: string) => table.findIndex((r) => r.teamId === id) + 1;
      const ph = pos(fixture.homeId);
      const pa = pos(fixture.awayId);
      const n = table.length;
      const late = (fixture.week - 28) / 16;
      if (ph <= 3 && pa <= 3) imp += 0.3 + 0.15 * late;
      else if (ph <= 2 || pa <= 2) imp += 0.12 + 0.1 * late;
      if (ph > n - 4 && pa > n - 4) imp += 0.18 + 0.1 * late;
    }
  }
  if (isDerby(state, fixture.homeId, fixture.awayId)) imp += 0.25;
  return clamp(Math.round(imp * 100) / 100, 0, 1);
}

/** How much a club rotates for a fixture (light for midweek leagues, heavy in early cup rounds). */
export function rotationFor(comp: Competition | undefined, fixture: Fixture): number {
  if (!comp) return 0;
  if (comp.kind === 'cup') {
    const format = compFormat(comp);
    const k = format ? fixture.round - format.groupRounds : 1;
    const total = format ? format.koWeeks.length : 1;
    return k <= total - 3 ? 4 : k <= total - 2 ? 2 : 0.5;
  }
  if (comp.kind === 'continental') return fixture.round <= 6 ? 1 : 0;
  if (comp.kind === 'league' && fixture.slot === 'midweek') return 1.5;
  if (comp.kind === 'international' && !isTournamentId(comp.id)) return 2;
  return 0;
}

// ───────── kits ─────────

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function colourDistance(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  if (!x || !y) return a === b ? 0 : 999;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** Away side switches to its change kit (or swaps colours) when the shirts clash. */
export function resolveKitClash(state: GameState, home: TeamSheet, away: TeamSheet): Kit {
  if (colourDistance(home.kit.primary, away.kit.primary) > 110) return away.kit;
  const club = state.world.clubs[away.teamId];
  if (club && colourDistance(home.kit.primary, club.awayKit.primary) > 110) return club.awayKit;
  return { primary: away.kit.secondary, secondary: away.kit.primary, style: away.kit.style };
}

// ───────── context ─────────

export function findComp(state: GameState, compId: string): Competition | undefined {
  return state.competitions[compId];
}

export function buildMatchContext(state: GameState, fixture: Fixture, userRole: UserMatchRole, rng: Rng): MatchContext {
  const comp = findComp(state, fixture.compId);
  const clubId = userClubId(state);
  const ntId = userNationalTeamId(state);
  const userSide: MatchContext['userSide'] =
    fixture.homeId === clubId || fixture.homeId === ntId ? 'home' : fixture.awayId === clubId || fixture.awayId === ntId ? 'away' : null;
  const rotation = rotationFor(comp, fixture);
  const sheetOpts = (teamId: string) => ({ rotation: isUserTeam(state, teamId) ? Math.min(rotation, 1.5) : rotation, noiseKey: fixture.id });
  const home = buildSheetWith(state, fixture.homeId, userSide === 'home' ? userRole : undefined, sheetOpts(fixture.homeId));
  const away = buildSheetWith(state, fixture.awayId, userSide === 'away' ? userRole : undefined, sheetOpts(fixture.awayId));
  away.kit = resolveKitClash(state, home, away);

  const homeClub = state.world.clubs[fixture.homeId];
  const country = homeClub?.country ?? state.world.nationalTeams[fixture.homeId]?.nation;
  const weather = randomWeather(rng, fixture.season, fixture.week, country);
  if (fixture.slot === 'midweek' && weather.time === 'day' && rng.chance(0.75)) weather.time = 'night';

  const importance = fixtureImportance(state, comp, fixture);
  const venue = venueFor(state, comp, fixture);
  const rep = homeClub?.reputation ?? state.world.nationalTeams[fixture.homeId]?.reputation ?? 55;
  const awayRep = state.world.clubs[fixture.awayId]?.reputation ?? state.world.nationalTeams[fixture.awayId]?.reputation ?? 55;
  let fill = 0.42 + rep / 220 + awayRep / 900 + importance * 0.3 + rng.normal(0, 0.05);
  if (homeClub?.tier === 2) fill -= 0.06;
  if (fixture.neutral) fill = 0.9 + importance * 0.08 + rng.float(0, 0.03);
  if (weather.kind === 'snow' || weather.kind === 'rain') fill -= 0.04;
  const attendance = Math.round((venue.capacity * clamp(fill, 0.25, 1)) / 10) * 10;

  const knockout = comp ? isKnockoutFixture(comp, fixture) : false;
  const compName = comp ? (comp.kind === 'league' || !fixture.roundName ? comp.name : `${comp.name} · ${fixture.roundName}`) : fixture.compId;
  return {
    fixtureId: fixture.id,
    compId: fixture.compId,
    compName,
    home,
    away,
    userSide,
    userRole: userSide ? userRole : 'none',
    weather,
    importance,
    derby: isDerby(state, fixture.homeId, fixture.awayId),
    knockout,
    stadium: venue.name,
    attendance,
  };
}
