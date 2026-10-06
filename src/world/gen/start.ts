import type { Club, CountryCode, NationCode, NationalTeam, PlayablePosition, Position, World } from '../../core/types';
import type { Rng } from '../../core/rng';
import { t } from '../../core/i18n';
import '../strings';
import { findNation } from '../nations';

/**
 * Three trial clubs for a new career: modest clubs (mostly tier 2, sometimes a weak tier 1),
 * from different countries — at least one in the user's own league country when it exists.
 */
export function pickStartingClubs(world: World, rng: Rng, userNation: NationCode): string[] {
  const clubs = Object.values(world.clubs);
  if (clubs.length === 0) return [];

  // reputation cut-off that separates the weaker 40 % of each tier-1 league
  const weakT1 = new Set<string>();
  const byLeague = new Map<string, Club[]>();
  for (const c of clubs) {
    const k = `${c.country}-${c.tier}`;
    byLeague.set(k, [...(byLeague.get(k) ?? []), c]);
  }
  for (const [k, list] of byLeague) {
    if (!k.endsWith('-1')) continue;
    list.sort((a, b) => a.reputation - b.reputation);
    for (const c of list.slice(0, Math.ceil(list.length * 0.4))) weakT1.add(c.id);
  }
  const modest = clubs.filter((c) => c.tier === 2 || weakT1.has(c.id) || clubs.every((x) => x.tier === 1));
  const pool = modest.length >= 3 ? modest : clubs;
  const weight = (c: Club) => (c.tier === 2 ? 3 : 1) * (c.reputation >= 30 ? 1.3 : 1);

  const picked: Club[] = [];
  const countries = new Set<CountryCode>();
  const take = (c: Club) => { picked.push(c); countries.add(c.country); };

  const home = (findNation(userNation)?.league ?? (clubs.some((c) => c.country === userNation) ? userNation : undefined)) as CountryCode | undefined;
  if (home) {
    const local = pool.filter((c) => c.country === home);
    if (local.length) take(rng.weighted(local, weight));
  }
  while (picked.length < 3) {
    const fresh = pool.filter((c) => !picked.includes(c) && !countries.has(c.country));
    const candidates = fresh.length ? fresh : pool.filter((c) => !picked.includes(c));
    if (!candidates.length) break;
    take(rng.weighted(candidates, weight));
  }
  return picked.map((c) => c.id);
}

/** The national team of a nation (if it exists in the world). */
export function nationalTeamOf(world: World, nation: NationCode): NationalTeam | null {
  return world.nationalTeams[`NT-${nation}`] ?? Object.values(world.nationalTeams).find((n) => n.nation === nation) ?? null;
}

/** Localized position name ('Forvet' / 'FV', 'Striker' / 'ST'). */
export function positionName(pos: Position | PlayablePosition, short = false): string {
  return t(`world.${short ? 'posShort' : 'pos'}.${pos}`);
}
