import type { Club, Footballer, Position, World } from '../../core/types';
import type { Rng } from '../../core/rng';
import { clamp } from '../../core/util';
import { generateFootballer, roundWage, weeklyWage } from './footballer';
import { pickForeignNation } from './nationmix';

const YOUTH_POSITIONS: [Position, number][] = [
  ['GK', 8], ['CB', 15], ['FB', 12], ['DM', 6], ['CM', 15], ['AM', 9], ['W', 15], ['ST', 14],
];

/** Academy graduates (2–4 players aged 16–18) for a club at season start. */
export function generateYouthIntake(rng: Rng, world: World, club: Club, season: number, makeId: () => string): Footballer[] {
  const count = clamp(rng.int(2, 4) + (club.youth >= 75 && rng.chance(0.35) ? 1 : 0) - (club.youth < 30 && rng.chance(0.4) ? 1 : 0), 2, 4);
  const taken = new Set<number>();
  for (const id of club.squad) {
    const n = world.players[id]?.shirtNumber;
    if (n) taken.add(n);
  }
  const gemP = 0.04 + club.youth / 1200;
  const out: Footballer[] = [];
  for (let i = 0; i < count; i++) {
    const position = rng.weighted(YOUTH_POSITIONS, (x) => x[1])[0];
    const age = rng.weighted([16, 17, 18], (a) => (a === 17 ? 3 : 2));
    const nation = rng.chance(0.86) ? club.country : pickForeignNation(rng, club.country);
    const gem = rng.chance(gemP);
    let quality = 32 + club.youth * 0.22 + club.reputation * 0.06 + (age - 16) * 2 + rng.normal(0, 4) + (gem ? rng.int(6, 10) : 0);
    quality = clamp(Math.round(quality), 28, 66);
    const potential = gem ? rng.int(86, 95) : clamp(quality + rng.int(10, 26) + Math.round(club.youth * 0.08), quality, 90);
    const p = generateFootballer(rng, { id: makeId(), nation, position, age, season, quality, potential, clubId: club.id });
    if (p.contract) {
      const years = rng.int(2, 4);
      p.contract = {
        ...p.contract, clubId: club.id, role: 'prospect', startSeason: season, endSeason: season + years - 1,
        wage: roundWage(weeklyWage(quality) * 0.55), releaseClause: null, goalBonus: 0, appearanceBonus: 0,
      };
    }
    let shirt = 0;
    for (let tries = 0; tries < 12 && !shirt; tries++) {
      const n = rng.int(26, 49);
      if (!taken.has(n)) shirt = n;
    }
    for (let n = 50; !shirt && n < 100; n++) if (!taken.has(n)) shirt = n;
    taken.add(shirt);
    p.shirtNumber = shirt || 99;
    out.push(p);
  }
  return out;
}
