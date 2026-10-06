/**
 * Data-file contracts for the world module. Filled by parallel data agents:
 *  - nations.ts  → NATIONS_DATA, names.ts → NAME_POOLS + NATION_POOL
 *  - clubs_<cc>.ts → CLUBS_<CC> for each of the 8 countries
 * Consumed by the world generator (src/world/api.ts).
 */
import type { CountryCode, Formation, Kit, NationCode, TacticalStyle } from '../../core/types';

export interface ClubSeed {
  name: string;               // fictional club name (real city, invented club)
  short: string;              // 3 uppercase letters, unique within the country
  nickname: string;           // local-language nickname, e.g. 'Körfez Kartalları'
  city: string;               // real city (with correct diacritics)
  founded: number;
  kit: Kit;
  away: Kit;
  stadium: string;
  capacity: number;
  /** 1..100 on a WORLD scale (a European giant ≈ 90–95, tier-2 minnows ≈ 25–40). */
  rep: number;
  style: TacticalStyle;
  formation: Formation;
  /** `short` codes of derby rivals in the same country (either tier). */
  derby: string[];
}

export interface CountryClubs {
  country: CountryCode;
  /** ENG/ESP/ITA: 20 clubs, others: 18. */
  tier1: ClubSeed[];
  /** 16 clubs for every country. */
  tier2: ClubSeed[];
}

/** Culture-group name pool. */
export interface NamePool { first: string[]; last: string[] }

export type { NationCode };
