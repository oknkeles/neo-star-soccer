import type { Kit, KitStyle } from '../../core/types';
import { C } from './palette';
import type { ClubSeed, CountryClubs } from './types';

/**
 * Germany — fictional clubs in real German cities (SC / SV / FC / SG / TuS naming, Vereinsfarben
 * and regional nicknames). 18 clubs in tier one: giants 86–93, mid pack 65–80, strugglers 55–65;
 * tier two at 30–55. Short codes use plain A–Z so they stay unique across both tiers.
 */

type KitSpec = [primary: string, secondary: string, style?: KitStyle];
type RawClub = Omit<ClubSeed, 'kit' | 'away' | 'derby'> & { kit: KitSpec; away: KitSpec; derby?: string[] };

const toKit = ([primary, secondary, style = 'plain']: KitSpec): Kit => ({ primary, secondary, style });

/** Expands kit tuples, adds same-city rivals and mirrors every derby so rivalries are mutual. */
function build(raw: RawClub[]): ClubSeed[] {
  const links = new Map<string, Set<string>>(raw.map((c) => [c.short, new Set(c.derby ?? [])]));
  for (const a of raw) for (const b of raw) if (a !== b && a.city === b.city) links.get(a.short)?.add(b.short);
  for (const [short, rivals] of links) for (const other of rivals) links.get(other)?.add(short);
  return raw.map((c) => ({ ...c, kit: toKit(c.kit), away: toKit(c.away), derby: [...(links.get(c.short) ?? [])] }));
}

const TIER1: RawClub[] = [
  { name: 'SC Wittelsbach 1892 München', short: 'WIT', nickname: 'Die Wittelsbacher', city: 'München', founded: 1892, kit: [C.royal, C.white, 'hoops'], away: [C.white, C.royal], stadium: 'Königsplatz-Stadion', capacity: 72500, rep: 93, style: 'possession', formation: '4-2-3-1', derby: ['FOR', 'NOR'] },
  { name: 'Fortuna Dortmund 1905', short: 'FOR', nickname: 'Die Kumpel', city: 'Dortmund', founded: 1905, kit: [C.orange, C.black, 'stripes'], away: [C.black, C.orange], stadium: 'Zechenpark', capacity: 81300, rep: 90, style: 'pressing', formation: '4-3-3', derby: ['RUH', 'ZOL'] },
  { name: 'Berliner TS Brandenburg 1892', short: 'BTB', nickname: 'Die Märker', city: 'Berlin', founded: 1892, kit: [C.scarlet, C.black, 'sash'], away: [C.white, C.scarlet], stadium: 'Stadion am Tiergarten', capacity: 71000, rep: 88, style: 'possession', formation: '4-3-3', derby: ['ELB'] },
  { name: 'SC Alster Hamburg 1887', short: 'ALS', nickname: 'Die Hanseaten', city: 'Hamburg', founded: 1887, kit: [C.teal, C.white, 'stripes'], away: [C.navy, C.teal], stadium: 'Hafenstadion', capacity: 57000, rep: 86, style: 'counter', formation: '4-1-4-1', derby: ['WES', 'KIE'] },
  { name: 'SC Rheinland Köln 1901', short: 'RHK', nickname: 'Die Jecken', city: 'Köln', founded: 1901, kit: [C.crimson, C.gold, 'stripes'], away: [C.white, C.crimson], stadium: 'Stadion am Rheinufer', capacity: 49500, rep: 80, style: 'pressing', formation: '4-4-2', derby: ['DUS', 'AAC'] },
  { name: 'Frankfurter FV Sachsenhausen 1899', short: 'FFV', nickname: 'Die Ebbelwoi-Elf', city: 'Frankfurt am Main', founded: 1899, kit: [C.forest, C.white, 'hoops'], away: [C.white, C.forest], stadium: 'Mainufer-Arena', capacity: 51000, rep: 79, style: 'balanced', formation: '4-2-3-1', derby: ['PFA', 'GUT'] },
  { name: 'SC Neckar Stuttgart 1893', short: 'NEC', nickname: 'Die Schwaben', city: 'Stuttgart', founded: 1893, kit: [C.navy, C.white, 'stripes'], away: [C.white, C.navy], stadium: 'Neckarpark', capacity: 55800, rep: 78, style: 'counter', formation: '4-1-4-1', derby: ['FAE'] },
  { name: 'SV Weser Bremen 1899', short: 'WES', nickname: 'Die Stadtmusikanten', city: 'Bremen', founded: 1899, kit: [C.green, C.white], away: [C.white, C.green], stadium: 'Deichstadion', capacity: 42000, rep: 76, style: 'possession', formation: '4-3-3', derby: ['ALS'] },
  { name: 'SC Messestadt Leipzig 1900', short: 'MES', nickname: 'Die Messestädter', city: 'Leipzig', founded: 1900, kit: [C.crimson, C.navy, 'hoops'], away: [C.white, C.crimson], stadium: 'Stadion der Messe', capacity: 46500, rep: 75, style: 'pressing', formation: '4-2-3-1', derby: ['ELB'] },
  { name: 'SV Leine Hannover 1896', short: 'LEI', nickname: 'Die Welfen', city: 'Hannover', founded: 1896, kit: [C.black, C.white, 'stripes'], away: [C.white, C.black], stadium: 'Maschsee-Stadion', capacity: 41000, rep: 73, style: 'balanced', formation: '4-4-2', derby: ['WES'] },
  { name: 'SpVgg Noris Nürnberg 1900', short: 'NOR', nickname: 'Die Frankenwölfe', city: 'Nürnberg', founded: 1900, kit: [C.copper, C.white, 'stripes'], away: [C.white, C.copper], stadium: 'Noris-Arena', capacity: 44500, rep: 71, style: 'counter', formation: '4-4-2', derby: ['WIT'] },
  { name: 'FC Pfalz Kaiserslautern 1900', short: 'PFA', nickname: 'Die Pfälzer', city: 'Kaiserslautern', founded: 1900, kit: [C.maroon, C.white, 'hoops'], away: [C.white, C.maroon], stadium: 'Stadion Lauterer Hügel', capacity: 38500, rep: 69, style: 'direct', formation: '4-4-2', derby: ['FFV', 'SAA'] },
  { name: 'SV Fächer Karlsruhe 1891', short: 'FAE', nickname: 'Die Fächerstädter', city: 'Karlsruhe', founded: 1891, kit: [C.violet, C.white], away: [C.white, C.violet], stadium: 'Schlossgarten-Stadion', capacity: 32500, rep: 67, style: 'balanced', formation: '4-4-2', derby: ['NEC'] },
  { name: 'SG Elbflorenz Dresden 1898', short: 'ELB', nickname: 'Die Elbflorenzer', city: 'Dresden', founded: 1898, kit: [C.amber, C.navy, 'halves'], away: [C.navy, C.amber], stadium: 'Elbwiesen-Stadion', capacity: 36500, rep: 65, style: 'counter', formation: '4-3-3', derby: ['MES', 'BTB'] },
  { name: 'FC Ostsee Rostock 1905', short: 'OST', nickname: 'Die Seebären', city: 'Rostock', founded: 1905, kit: [C.cyan, C.navy, 'stripes'], away: [C.white, C.cyan], stadium: 'Ostsee-Stadion', capacity: 28500, rep: 63, style: 'defensive', formation: '5-3-2', derby: ['KIE'] },
  { name: 'Kieler SV Förde 1900', short: 'KIE', nickname: 'Die Sprotten', city: 'Kiel', founded: 1900, kit: [C.red, C.navy, 'hoops'], away: [C.white, C.red], stadium: 'Förde-Stadion', capacity: 24000, rep: 61, style: 'pressing', formation: '4-4-2', derby: ['ALS', 'OST'] },
  { name: 'TuS Ruhrstahl Bochum 1904', short: 'RUH', nickname: 'Die Stahlkocher', city: 'Bochum', founded: 1904, kit: [C.charcoal, C.orange], away: [C.white, C.charcoal], stadium: 'Ruhrstahl-Stadion', capacity: 27000, rep: 59, style: 'direct', formation: '4-4-2', derby: ['FOR', 'ZOL'] },
  { name: 'Düsseldorfer SC Rheinterrassen 1899', short: 'DUS', nickname: 'Die Alt-Elf', city: 'Düsseldorf', founded: 1899, kit: [C.copper, C.black, 'sash'], away: [C.white, C.copper], stadium: 'Rheinterrassen-Arena', capacity: 35000, rep: 57, style: 'possession', formation: '4-3-3', derby: ['RHK'] },
];

const TIER2: RawClub[] = [
  { name: 'SV Köpenick 1906 Berlin', short: 'KOP', nickname: 'Die Hauptmänner', city: 'Berlin', founded: 1906, kit: [C.maroon, C.white], away: [C.white, C.maroon, 'stripes'], stadium: 'Müggelspree-Stadion', capacity: 20500, rep: 55, style: 'pressing', formation: '4-4-2' },
  { name: 'FC Schwabing 1904 München', short: 'SCH', nickname: 'Die Schwabinger', city: 'München', founded: 1904, kit: [C.lime, C.black, 'stripes'], away: [C.black, C.lime], stadium: 'Stadion an der Leopoldstraße', capacity: 15000, rep: 53, style: 'possession', formation: '4-3-3' },
  { name: 'SV Harburg Hafen 1910 Hamburg', short: 'HAR', nickname: 'Die Hafenarbeiter', city: 'Hamburg', founded: 1910, kit: [C.black, C.white, 'hoops'], away: [C.white, C.black], stadium: 'Hafenbecken-Stadion', capacity: 14500, rep: 51, style: 'direct', formation: '4-4-2' },
  { name: 'SC Kaiserstadt Aachen 1900', short: 'AAC', nickname: 'Die Printenbäcker', city: 'Aachen', founded: 1900, kit: [C.gold, C.royal], away: [C.royal, C.gold], stadium: 'Kaiserplatz-Stadion', capacity: 22000, rep: 49, style: 'balanced', formation: '4-4-2', derby: ['RHK'] },
  { name: 'FC Fugger Augsburg 1907', short: 'FUG', nickname: 'Die Fugger', city: 'Augsburg', founded: 1907, kit: [C.yellow, C.green, 'halves'], away: [C.green, C.yellow], stadium: 'Fuggerei-Arena', capacity: 18500, rep: 47, style: 'counter', formation: '4-2-3-1', derby: ['WIT'] },
  { name: 'SC Teuto Bielefeld 1905', short: 'TEU', nickname: 'Die Ravensberger', city: 'Bielefeld', founded: 1905, kit: [C.orange, C.white], away: [C.white, C.orange], stadium: 'Teutoburger Arena', capacity: 21500, rep: 46, style: 'direct', formation: '4-4-2' },
  { name: 'BSC Löwenstadt Braunschweig 1895', short: 'LOE', nickname: 'Die Löwenstädter', city: 'Braunschweig', founded: 1895, kit: [C.sky, C.gold, 'stripes'], away: [C.gold, C.sky], stadium: 'Burgplatz-Stadion', capacity: 20500, rep: 44, style: 'defensive', formation: '5-3-2', derby: ['LEI'] },
  { name: 'FC Thüringen Erfurt 1908', short: 'THU', nickname: 'Die Domberger', city: 'Erfurt', founded: 1908, kit: [C.green, C.gold, 'hoops'], away: [C.gold, C.green], stadium: 'Krämerbrücken-Stadion', capacity: 17500, rep: 42, style: 'balanced', formation: '4-4-2', derby: ['ELB'] },
  { name: 'Lübecker SC Holstentor 1901', short: 'HOL', nickname: 'Die Marzipanbäcker', city: 'Lübeck', founded: 1901, kit: [C.violet, C.white, 'hoops'], away: [C.white, C.violet], stadium: 'Holstentor-Arena', capacity: 16500, rep: 40, style: 'possession', formation: '4-3-3', derby: ['KIE', 'ALS'] },
  { name: 'SG Domstadt Magdeburg 1902', short: 'DOM', nickname: 'Die Börde-Elf', city: 'Magdeburg', founded: 1902, kit: [C.cobalt, C.red, 'halves'], away: [C.white, C.cobalt], stadium: 'Elbauen-Stadion', capacity: 24000, rep: 39, style: 'direct', formation: '4-4-2', derby: ['ELB'] },
  { name: 'Mainzer SV Gutenberg 1904', short: 'GUT', nickname: 'Die Drucker', city: 'Mainz', founded: 1904, kit: [C.black, C.red], away: [C.white, C.black], stadium: 'Rheinhessen-Stadion', capacity: 20000, rep: 37, style: 'pressing', formation: '4-2-3-1' },
  { name: 'SC Westfalen Münster 1906', short: 'MUN', nickname: 'Die Radler', city: 'Münster', founded: 1906, kit: [C.royal, C.amber, 'hoops'], away: [C.amber, C.royal], stadium: 'Prinzipalmarkt-Stadion', capacity: 18000, rep: 36, style: 'possession', formation: '4-3-3', derby: ['FOR'] },
  { name: 'SV Saar-Hütte Saarbrücken 1903', short: 'SAA', nickname: 'Die Hüttenarbeiter', city: 'Saarbrücken', founded: 1903, kit: [C.silver, C.royal, 'stripes'], away: [C.royal, C.silver], stadium: 'Saarhütte-Stadion', capacity: 19000, rep: 34, style: 'balanced', formation: '4-4-2' },
  { name: 'SV Schwebebahn Wuppertal 1909', short: 'SCW', nickname: 'Die Schwebebahner', city: 'Wuppertal', founded: 1909, kit: [C.turquoise, C.black, 'stripes'], away: [C.black, C.turquoise], stadium: 'Wupperufer-Stadion', capacity: 17000, rep: 32, style: 'defensive', formation: '5-3-2', derby: ['RHK', 'DUS'] },
  { name: 'SC Zollverein Essen 1902', short: 'ZOL', nickname: 'Die Bergleute', city: 'Essen', founded: 1902, kit: [C.grey, C.orange, 'halves'], away: [C.orange, C.grey], stadium: 'Zollverein-Stadion', capacity: 20000, rep: 31, style: 'pressing', formation: '4-4-2' },
  { name: 'SV Donau Regensburg 1900', short: 'DON', nickname: 'Die Domspatzen', city: 'Regensburg', founded: 1900, kit: [C.yellow, C.red, 'halves'], away: [C.white, C.red], stadium: 'Steinerne-Brücke-Stadion', capacity: 15000, rep: 30, style: 'balanced', formation: '4-4-2', derby: ['NOR'] },
];

const ALL = build([...TIER1, ...TIER2]);

export const CLUBS_GER: CountryClubs = {
  country: 'GER',
  tier1: ALL.slice(0, TIER1.length),
  tier2: ALL.slice(TIER1.length),
};
