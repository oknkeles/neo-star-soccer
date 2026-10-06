import type { CountryCode, Kit, Localized, NationCode, Position } from '../core/types';

export interface NationDef {
  code: NationCode;
  name: Localized;
  flag: string;               // emoji flag
  continent: 'EU' | 'SA' | 'AF' | 'AS' | 'NA' | 'OC';
  reputation: number;         // 1..100 national team strength
  kit: Kit;
  cities: string[];           // a few hometown candidates
  /** One of the 8 playable countries if the nation has a league in the game. */
  league?: CountryCode;
}

export interface WorldGenOptions {
  startSeason: number;
  userNation: NationCode;
}

export interface FootballerGenOptions {
  id: string;
  nation: NationCode;
  position: Position;
  age: number;
  season: number;
  /** Target overall at the given position (1..99). */
  quality: number;
  /** Optional explicit potential; otherwise derived from age & quality with randomness. */
  potential?: number;
  clubId: string | null;
}
