import type { Kit, KitStyle } from '../../core/types';
import { C } from './palette';
import type { ClubSeed, CountryClubs } from './types';

/**
 * Portugal — invented clubs in real Portuguese cities, named the Portuguese way
 * (Sport Lisboa e …, Futebol Clube, Grupo Desportivo, Atlético Clube, Clube Desportivo…).
 * Giants 80–87 (two in Lisbon, one in Porto, one in Braga), a mid pack of 56–72 and
 * strugglers at 51–55; the second tier lives at 32–50. Same-city rivals are added by
 * `build`, and every derby is mirrored.
 */

type KitSpec = [primary: string, secondary: string, style?: KitStyle];
type RawClub = Omit<ClubSeed, 'kit' | 'away' | 'derby'> & { kit: KitSpec; away: KitSpec };

const toKit = ([primary, secondary, style = 'plain']: KitSpec): Kit => ({ primary, secondary, style });

/** Classic rivalries (the city derbies come for free). */
const RIVALRIES: [string, string][] = [
  ['SLA', 'OLI'], ['SLA', 'INV'], ['OLI', 'INV'], ['INV', 'BRC'], ['BRC', 'GUI'], ['BRC', 'BCL'],
  ['GUI', 'BCL'], ['BRC', 'VIA'], ['FUN', 'AZO'], ['FAR', 'PTM'], ['FAR', 'OLH'], ['PTM', 'OLH'],
  ['COI', 'AVE'], ['COI', 'VIS'], ['COI', 'LEI'], ['COI', 'COV'], ['SET', 'ALM'], ['SET', 'SEI'],
  ['ALM', 'SEI'], ['SLA', 'AMD'], ['OLI', 'AMD'], ['SIN', 'AMD'], ['SIN', 'MOU'], ['INV', 'MAT'],
  ['FOZ', 'MAT'], ['INV', 'PEN'], ['BRG', 'VRL'], ['VRL', 'TRM'], ['TRM', 'BRG'], ['EVO', 'SAN'],
  ['SAN', 'TOR'], ['TOR', 'CAL'], ['LEI', 'CAL'], ['GUI', 'PEN'],
];

function build(raw: RawClub[]): ClubSeed[] {
  const links = new Map<string, Set<string>>(raw.map((c) => [c.short, new Set<string>()]));
  for (const [a, b] of RIVALRIES) {
    links.get(a)?.add(b);
    links.get(b)?.add(a);
  }
  for (const a of raw) for (const b of raw) if (a !== b && a.city === b.city) links.get(a.short)?.add(b.short);
  return raw.map((c) => ({ ...c, kit: toKit(c.kit), away: toKit(c.away), derby: [...(links.get(c.short) ?? [])] }));
}

const TIER1: RawClub[] = [
  { name: 'Sport Lisboa e Alfama', short: 'SLA', nickname: 'Os Falcões', city: 'Lisboa', founded: 1904, kit: [C.crimson, C.cream, 'sash'], away: [C.white, C.crimson, 'hoops'], stadium: 'Estádio dos Navegadores', capacity: 63800, rep: 87, style: 'possession', formation: '4-2-3-1' },
  { name: 'Futebol Clube Invicta', short: 'INV', nickname: 'Os Tripeiros', city: 'Porto', founded: 1893, kit: [C.royal, C.cream, 'hoops'], away: [C.cream, C.royal], stadium: 'Estádio das Pontes', capacity: 50600, rep: 86, style: 'pressing', formation: '4-3-3' },
  { name: 'Clube Desportivo Olissipo', short: 'OLI', nickname: 'Os Verdes de Olissipo', city: 'Lisboa', founded: 1906, kit: [C.emerald, C.white, 'hoops'], away: [C.white, C.emerald], stadium: 'Estádio das Descobertas', capacity: 50200, rep: 84, style: 'possession', formation: '3-5-2' },
  { name: 'Clube Desportivo Bracara', short: 'BRC', nickname: 'Os Minhotos', city: 'Braga', founded: 1921, kit: [C.scarlet, C.black, 'stripes'], away: [C.black, C.scarlet], stadium: 'Estádio do Bom Jesus', capacity: 30200, rep: 80, style: 'pressing', formation: '4-2-3-1' },
  { name: 'Grupo Desportivo Vimaranense', short: 'GUI', nickname: 'Os Afonsinos', city: 'Guimarães', founded: 1922, kit: [C.white, C.black, 'sash'], away: [C.black, C.white], stadium: 'Estádio do Castelo', capacity: 29400, rep: 72, style: 'direct', formation: '4-4-2' },
  { name: 'Sporting Clube Foz do Douro', short: 'FOZ', nickname: 'Os Fozeiros', city: 'Porto', founded: 1903, kit: [C.gold, C.black, 'stripes'], away: [C.black, C.gold], stadium: 'Estádio da Foz', capacity: 22000, rep: 66, style: 'counter', formation: '4-4-2' },
  { name: 'União Académica Conimbricense', short: 'COI', nickname: 'Os Doutores', city: 'Coimbra', founded: 1887, kit: [C.black, C.silver], away: [C.white, C.black], stadium: 'Estádio do Mondego', capacity: 30000, rep: 64, style: 'balanced', formation: '4-3-3' },
  { name: 'Clube Desportivo Funchalense', short: 'FUN', nickname: 'Os Lobos-Marinhos', city: 'Funchal', founded: 1910, kit: [C.turquoise, C.navy, 'hoops'], away: [C.navy, C.turquoise], stadium: 'Estádio da Levada', capacity: 12500, rep: 63, style: 'counter', formation: '4-4-2' },
  { name: 'Clube de Futebol Mouraria', short: 'MOU', nickname: 'Os Fadistas', city: 'Lisboa', founded: 1902, kit: [C.black, C.crimson, 'halves'], away: [C.white, C.black], stadium: 'Estádio da Graça', capacity: 14800, rep: 62, style: 'balanced', formation: '4-2-3-1' },
  { name: 'Clube Desportivo Sado', short: 'SET', nickname: 'Os Golfinhos', city: 'Setúbal', founded: 1910, kit: [C.royal, C.yellow, 'hoops'], away: [C.yellow, C.royal], stadium: 'Estádio da Arrábida', capacity: 20400, rep: 61, style: 'direct', formation: '4-4-2' },
  { name: 'Atlético Clube Algarvio', short: 'FAR', nickname: 'Os Algarvios', city: 'Faro', founded: 1920, kit: [C.orange, C.white, 'stripes'], away: [C.white, C.orange], stadium: 'Estádio do Sotavento', capacity: 18200, rep: 59, style: 'counter', formation: '4-4-2' },
  { name: 'Atlético Clube de Barcelos', short: 'BCL', nickname: 'Os Galos', city: 'Barcelos', founded: 1924, kit: [C.white, C.red, 'hoops'], away: [C.red, C.white], stadium: 'Estádio do Cávado', capacity: 12400, rep: 58, style: 'direct', formation: '4-4-2' },
  { name: 'Clube Desportivo Ria de Aveiro', short: 'AVE', nickname: 'Os Moliceiros', city: 'Aveiro', founded: 1922, kit: [C.cyan, C.navy, 'stripes'], away: [C.navy, C.cyan], stadium: 'Estádio da Ria', capacity: 13800, rep: 57, style: 'balanced', formation: '4-1-4-1' },
  { name: 'Grémio Desportivo Viriato', short: 'VIS', nickname: 'Os Lusitanos', city: 'Viseu', founded: 1914, kit: [C.green, C.red, 'halves'], away: [C.white, C.green], stadium: 'Estádio do Dão', capacity: 11500, rep: 56, style: 'balanced', formation: '4-2-3-1' },
  { name: 'Atlético Clube Micaelense', short: 'AZO', nickname: 'Os Baleeiros', city: 'Ponta Delgada', founded: 1927, kit: [C.blue, C.white, 'sash'], away: [C.white, C.blue], stadium: 'Estádio das Sete Cidades', capacity: 12800, rep: 56, style: 'defensive', formation: '5-3-2' },
  { name: 'Clube Desportivo Sintra-Serra', short: 'SIN', nickname: 'Os Palacianos', city: 'Sintra', founded: 1911, kit: [C.purple, C.cream, 'hoops'], away: [C.cream, C.purple], stadium: 'Estádio da Pena', capacity: 12200, rep: 54, style: 'balanced', formation: '4-4-2' },
  { name: 'Grupo Desportivo Transmontano', short: 'TRM', nickname: 'Os Transmontanos', city: 'Chaves', founded: 1949, kit: [C.navy, C.sky, 'stripes'], away: [C.sky, C.navy], stadium: 'Estádio das Termas', capacity: 9800, rep: 52, style: 'defensive', formation: '4-1-4-1' },
  { name: 'Clube Desportivo Pinhal', short: 'LEI', nickname: 'Os Pinhais', city: 'Leiria', founded: 1966, kit: [C.forest, C.amber, 'hoops'], away: [C.amber, C.forest], stadium: 'Estádio do Pinhal do Rei', capacity: 11300, rep: 51, style: 'direct', formation: '4-4-2' },
];

const TIER2: RawClub[] = [
  { name: 'Atlético Clube Arade', short: 'PTM', nickname: 'Os Marinheiros', city: 'Portimão', founded: 1914, kit: [C.turquoise, C.white, 'sash'], away: [C.white, C.turquoise], stadium: 'Estádio da Praia da Rocha', capacity: 9200, rep: 50, style: 'direct', formation: '4-4-2' },
  { name: 'Grémio Desportivo de Matosinhos', short: 'MAT', nickname: 'Os Sardinheiros', city: 'Matosinhos', founded: 1907, kit: [C.red, C.white, 'halves'], away: [C.white, C.red], stadium: 'Estádio do Cais', capacity: 9500, rep: 49, style: 'counter', formation: '4-4-2' },
  { name: 'Atlético Clube Garajau', short: 'GAR', nickname: 'Os Garajaus', city: 'Funchal', founded: 1927, kit: [C.gold, C.green, 'sash'], away: [C.green, C.gold], stadium: 'Estádio do Garajau', capacity: 5400, rep: 48, style: 'balanced', formation: '4-3-3' },
  { name: 'Clube Desportivo Vianense', short: 'VIA', nickname: 'Os Vianenses', city: 'Viana do Castelo', founded: 1917, kit: [C.white, C.royal, 'hoops'], away: [C.royal, C.white], stadium: 'Estádio do Lima', capacity: 6800, rep: 47, style: 'defensive', formation: '4-4-2' },
  { name: 'Clube Atlético Cristo Rei', short: 'ALM', nickname: 'Os Cacilheiros', city: 'Almada', founded: 1920, kit: [C.navy, C.amber, 'hoops'], away: [C.amber, C.navy], stadium: 'Estádio do Pragal', capacity: 7400, rep: 46, style: 'counter', formation: '4-4-2' },
  { name: 'Grupo Desportivo Águas Livres', short: 'AMD', nickname: 'Os Aquedutos', city: 'Amadora', founded: 1932, kit: [C.maroon, C.white, 'stripes'], away: [C.white, C.maroon], stadium: 'Estádio da Reboleira', capacity: 9400, rep: 45, style: 'balanced', formation: '4-2-3-1' },
  { name: 'Grémio Desportivo Cova da Beira', short: 'COV', nickname: 'Os Serranos', city: 'Covilhã', founded: 1923, kit: [C.red, C.cream, 'stripes'], away: [C.cream, C.red], stadium: 'Estádio dos Lanifícios', capacity: 7600, rep: 44, style: 'direct', formation: '4-4-2' },
  { name: 'Clube Desportivo Alentejano', short: 'EVO', nickname: 'Os Sobreiros', city: 'Évora', founded: 1911, kit: [C.green, C.white, 'halves'], away: [C.white, C.green], stadium: 'Estádio do Templo', capacity: 7100, rep: 43, style: 'defensive', formation: '5-3-2' },
  { name: 'Grémio Desportivo Ria Formosa', short: 'OLH', nickname: 'Os Cubistas', city: 'Olhão', founded: 1912, kit: [C.white, C.sky, 'stripes'], away: [C.sky, C.white], stadium: 'Estádio da Ria Formosa', capacity: 7800, rep: 42, style: 'possession', formation: '4-3-3' },
  { name: 'Associação Desportiva do Vale do Sousa', short: 'PEN', nickname: 'Os Ferreiros', city: 'Penafiel', founded: 1951, kit: [C.charcoal, C.orange, 'halves'], away: [C.orange, C.charcoal], stadium: 'Estádio do Sousa', capacity: 8200, rep: 41, style: 'direct', formation: '4-4-2' },
  { name: 'Sporting Clube Corticeira', short: 'SEI', nickname: 'Os Corticeiros', city: 'Seixal', founded: 1924, kit: [C.copper, C.black, 'stripes'], away: [C.black, C.copper], stadium: 'Estádio da Baía', capacity: 5600, rep: 40, style: 'balanced', formation: '4-1-4-1' },
  { name: 'Clube Desportivo Alto Douro', short: 'VRL', nickname: 'Os Vinhateiros', city: 'Vila Real', founded: 1921, kit: [C.bordeaux, C.cream, 'sash'], away: [C.cream, C.bordeaux], stadium: 'Estádio do Corgo', capacity: 8600, rep: 39, style: 'counter', formation: '4-4-2' },
  { name: 'Clube Desportivo Linhas de Torres', short: 'TOR', nickname: 'Os Fortes', city: 'Torres Vedras', founded: 1917, kit: [C.gold, C.navy, 'halves'], away: [C.navy, C.gold], stadium: 'Estádio das Linhas', capacity: 8000, rep: 38, style: 'defensive', formation: '4-4-2' },
  { name: 'Clube Desportivo Brigantino', short: 'BRG', nickname: 'Os Montanheses', city: 'Bragança', founded: 1932, kit: [C.white, C.scarlet, 'sash'], away: [C.scarlet, C.white], stadium: 'Estádio da Cidadela', capacity: 5800, rep: 36, style: 'defensive', formation: '5-3-2' },
  { name: 'Grupo Desportivo Ribatejano', short: 'SAN', nickname: 'Os Campinos', city: 'Santarém', founded: 1919, kit: [C.green, C.black, 'stripes'], away: [C.black, C.green], stadium: 'Estádio das Lezírias', capacity: 6400, rep: 34, style: 'balanced', formation: '4-4-2' },
  { name: 'Clube Desportivo Rainha Leonor', short: 'CAL', nickname: 'Os Ceramistas', city: 'Caldas da Rainha', founded: 1913, kit: [C.tangerine, C.white, 'hoops'], away: [C.white, C.tangerine], stadium: 'Estádio das Caldas', capacity: 5900, rep: 32, style: 'balanced', formation: '4-3-3' },
];

const ALL = build([...TIER1, ...TIER2]);

export const CLUBS_POR: CountryClubs = {
  country: 'POR',
  tier1: ALL.slice(0, TIER1.length),
  tier2: ALL.slice(TIER1.length),
};
