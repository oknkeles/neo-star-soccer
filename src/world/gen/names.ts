import type { NationCode } from '../../core/types';
import type { Rng } from '../../core/rng';
import type { NamePool } from '../data/types';
import { NAME_POOLS, NATION_POOL } from '../data/names';

const L = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean);

/** Safety net used only when a nation has no culture pool: international, neutral names. */
const FALLBACK_POOL: NamePool = {
  first: L(`Adrian, Alex, Andre, Daniel, David, Diego, Elias, Emil, Felix, Gabriel, Hugo, Ivan, Jonas, Julian, Karim, Leo,
    Lucas, Luka, Marco, Mateo, Max, Milan, Nico, Noah, Oliver, Omar, Pablo, Rafael, Samuel, Sami, Stefan, Theo, Tomas,
    Viktor, Yusuf, Zoran, Anton, Bruno, Dario, Eric, Fabio, Henrik, Jakub, Kai, Marcel, Nikola, Oscar, Pavel, Tiago, Ruben`),
  last: L(`Novak, Silva, Costa, Petrov, Weber, Moreau, Santos, Romano, Kowalski, Jensen, Horvat, Ivanov, Lindqvist, Mendes,
    Fischer, Martin, Rossi, Hansen, Dubois, Nowak, Pereira, Kovac, Bauer, Marin, Popescu, Lopez, Berg, Vidal, Duran, Haas,
    Keller, Lang, Maier, Nunez, Orsini, Pavlov, Quinn, Ribeiro, Sorensen, Tomic, Urban, Varga, Winter, Zeman, Almeida,
    Brandt, Carvalho, Dragan, Eriksen, Ferreira`),
};

/** Heritage mixing: second-generation players give the big leagues' squads a realistic, multicultural feel. */
const DIASPORA: Record<string, [NationCode, number][]> = {
  FRA: [['SEN', 0.08], ['ALG', 0.06], ['MAR', 0.06], ['CIV', 0.04], ['CMR', 0.04], ['POR', 0.02]],
  ENG: [['NGA', 0.05], ['GHA', 0.04], ['CMR', 0.01]],
  GER: [['TUR', 0.07], ['POL', 0.05], ['GHA', 0.02], ['SRB', 0.02], ['CRO', 0.02], ['MAR', 0.01]],
  NED: [['MAR', 0.07], ['TUR', 0.03], ['GHA', 0.02], ['CMR', 0.01]],
  BEL: [['MAR', 0.08], ['CMR', 0.04], ['TUR', 0.02]],
  ESP: [['MAR', 0.015], ['ARG', 0.02], ['COL', 0.01]],
  ITA: [['ARG', 0.015], ['MAR', 0.01]],
  POR: [['BRA', 0.025], ['SEN', 0.01], ['CMR', 0.01]],
  SUI: [['SRB', 0.07], ['TUR', 0.03], ['CRO', 0.03]],
  AUT: [['SRB', 0.05], ['TUR', 0.05], ['CRO', 0.03]],
  SWE: [['SRB', 0.03], ['TUR', 0.02]],
  DEN: [['TUR', 0.02], ['SRB', 0.01]],
  USA: [['MEX', 0.08], ['NGA', 0.02]],
  AUS: [['SRB', 0.03], ['CRO', 0.03]],
  CAN: [['SRB', 0.03]],
};

export function poolOf(nation: NationCode): NamePool {
  const key = NATION_POOL[nation];
  const p = (key && NAME_POOLS[key]) || NAME_POOLS[nation] || NAME_POOLS[nation.toLowerCase()];
  return p && p.first.length > 0 && p.last.length > 0 ? p : FALLBACK_POOL;
}

/** Culturally appropriate random name for a nation (with a small share of heritage names). */
export function randomName(rng: Rng, nation: NationCode): { first: string; last: string } {
  let pool = poolOf(nation);
  const dia = DIASPORA[nation];
  if (dia) {
    const r = rng.next();
    let acc = 0;
    for (const [code, p] of dia) {
      acc += p;
      if (r < acc) { pool = poolOf(code); break; }
    }
  }
  const first = rng.pick(pool.first);
  let last = rng.pick(pool.last);
  if (last === first) last = rng.pick(pool.last);
  return { first, last };
}

/** True when the nation has its own culture pool (otherwise the neutral fallback pool is used). */
export const hasNamePool = (nation: NationCode): boolean => poolOf(nation) !== FALLBACK_POOL;
