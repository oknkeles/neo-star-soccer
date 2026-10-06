import type { Club, CountryCode, Footballer, Position, SquadRole } from '../../core/types';
import type { Rng } from '../../core/rng';
import { overallFor } from '../../core/ratings';
import { clamp } from '../../core/util';
import { SHIRT_PREF, generateFootballer, newContract } from './footballer';
import { foreignAdjMean, nationQualityAdj, pickForeignNation } from './nationmix';
import { payFactor, teamLevel } from './clubs';

type Slot = 'S' | 'R' | 'P';
/** 24-man squad: 11 starter slots (S), rotation (R) and prospect / back-up slots (P). */
const TEMPLATE: [Position, Slot][] = [
  ['GK', 'S'], ['GK', 'R'], ['GK', 'P'],
  ['CB', 'S'], ['CB', 'S'], ['CB', 'R'], ['CB', 'P'],
  ['FB', 'S'], ['FB', 'S'], ['FB', 'R'], ['FB', 'P'],
  ['DM', 'S'], ['DM', 'R'],
  ['CM', 'S'], ['CM', 'R'], ['CM', 'P'],
  ['AM', 'S'], ['AM', 'R'],
  ['W', 'S'], ['W', 'S'], ['W', 'R'],
  ['ST', 'S'], ['ST', 'R'], ['ST', 'P'],
];

/** Share of foreign players per league (tier 1); tier 2 uses 45 % of it. */
const FOREIGN_SHARE: Record<CountryCode, number> = { ENG: 0.45, GER: 0.35, ITA: 0.38, FRA: 0.33, ESP: 0.3, POR: 0.45, NED: 0.38, TUR: 0.38 };

export interface SquadSpec {
  club: Club;
  leagueStrength: number;
  foreignMul: number;
  season: number;
  makeId: () => string;
}

function slotAge(rng: Rng, slot: Slot, pos: Position, youth: boolean): number {
  const older = pos === 'GK' || pos === 'CB' ? 1.2 : 0;
  if (slot === 'S') return clamp(Math.round(rng.normal(27 + older, 3.4)), 19, 37);
  if (slot === 'R') return clamp(Math.round(rng.normal(25.5 + older, 4.2)), 18, 36);
  return youth ? rng.weighted([17, 18, 19, 20, 21], (a) => (a === 17 ? 2 : a === 21 ? 2 : 3)) : clamp(Math.round(rng.normal(31, 2.2)), 28, 37);
}

function ageAdjust(age: number): number {
  if (age <= 20) return -2 * (21 - age);
  if (age >= 33) return -1.5 * (age - 32);
  return 0;
}

function roleFor(rank: number, age: number): SquadRole {
  if (rank < 3) return 'star';
  if (rank < 11) return 'starter';
  if (age <= 20) return 'prospect';
  return rank < 19 || age > 22 ? 'rotation' : 'prospect';
}

function assignShirts(rng: Rng, sorted: Footballer[], season: number): void {
  const used = new Set<number>();
  const take = (n: number) => { used.add(n); return n; };
  sorted.forEach((p, rank) => {
    const youngster = rank >= 11 && season - p.birthYear <= 21 && p.position !== 'GK';
    if (youngster && rng.chance(0.75)) {
      for (let tries = 0; tries < 8; tries++) {
        const n = rng.int(26, 49);
        if (!used.has(n)) { p.shirtNumber = take(n); return; }
      }
    }
    for (const cand of SHIRT_PREF[p.position]) {
      if (used.has(cand) || (cand === 1 && p.position !== 'GK') || (cand !== 1 && rng.chance(0.12))) continue;
      p.shirtNumber = take(cand);
      return;
    }
    for (let n = 2 + rng.int(0, 20); n < 100; n++) if (!used.has(n)) { p.shirtNumber = take(n); return; }
    for (let n = 2; n < 100; n++) if (!used.has(n)) { p.shirtNumber = take(n); return; }
  });
}

/** Build a club's 24-man squad (players registered by the caller). */
export function buildSquad(rng: Rng, spec: SquadSpec): Footballer[] {
  const { club, leagueStrength, season } = spec;
  const level = teamLevel(club.reputation, leagueStrength);
  const share = FOREIGN_SHARE[club.country] * (club.tier === 2 ? 0.45 : 1) * (0.8 + club.reputation / 250) * spec.foreignMul;
  const starProb = 0.15 + club.reputation / 500;
  const pay = payFactor(club.reputation, leagueStrength);
  const players: Footballer[] = [];

  for (const [pos, slot] of TEMPLATE) {
    const youth = slot === 'P' && pos !== 'GK' && rng.chance(0.65);
    const age = slotAge(rng, slot, pos, youth);
    let q: number;
    if (slot === 'S') {
      q = level - 0.5 + rng.normal(0, 3.2) + ageAdjust(age);
      if (rng.chance(starProb)) q += rng.int(3, 7);
    } else if (slot === 'R') {
      q = level - 5.5 + rng.normal(0, 2.8) + ageAdjust(age);
    } else if (youth) {
      q = level - 17 + rng.normal(0, 4);
    } else {
      q = level - 10 + rng.normal(0, 3) + ageAdjust(age);
    }
    const foreignP = share * (slot === 'S' ? 1.15 : youth ? 0.45 : 1) * (pos === 'GK' ? 0.8 : 1);
    const nation = rng.chance(foreignP) ? pickForeignNation(rng, club.country) : club.country;
    // players from stronger football nations are better, those from weaker nations worse (league mean stays calibrated)
    q += nationQualityAdj(nation) - ((1 - share) * nationQualityAdj(club.country) + share * foreignAdjMean(club.country));
    if (q > 86) q = 86 + (q - 86) * 0.62; // soft ceiling: a 93+ is a once-in-a-generation player
    q = clamp(Math.round(q), 30, 93);
    players.push(generateFootballer(rng, { id: spec.makeId(), nation, position: pos, age, season, quality: q, clubId: club.id }));
  }

  const ranked = players
    .map((p) => ({ p, o: overallFor(p.attrs, p.position) }))
    .sort((a, b) => b.o - a.o);
  ranked.forEach(({ p, o }, rank) => {
    const age = season - p.birthYear;
    p.contract = newContract(rng, club.id, o, age, season, pay, roleFor(rank, age), p.position, p.value);
  });
  assignShirts(rng, ranked.map((r) => r.p), season);
  return players;
}
