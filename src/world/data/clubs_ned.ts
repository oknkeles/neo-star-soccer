import type { Kit, KitStyle } from '../../core/types';
import { C } from './palette';
import type { ClubSeed, CountryClubs } from './types';

/**
 * Netherlands — invented clubs in real Dutch cities, named the Dutch way (Voetbalvereniging,
 * Sportclub, Sportvereeniging, Football Club…, with the odd old-spelling "ee"). Three giants
 * at 82–87 (Amsterdam, Rotterdam, Eindhoven), a strong chasing pack, a mid pack of 56–72 and
 * strugglers at 51–55; the second tier lives at 30–49. Same-city rivals are added by
 * `build`, and every derby is mirrored.
 */

type KitSpec = [primary: string, secondary: string, style?: KitStyle];
type RawClub = Omit<ClubSeed, 'kit' | 'away' | 'derby'> & { kit: KitSpec; away: KitSpec };

const toKit = ([primary, secondary, style = 'plain']: KitSpec): Kit => ({ primary, secondary, style });

/** Classic rivalries (the city derbies come for free). */
const RIVALRIES: [string, string][] = [
  ['AMS', 'MAA'], ['AMS', 'EIN'], ['MAA', 'EIN'], ['AMS', 'UTR'], ['AMS', 'HAA'], ['MAA', 'DHG'],
  ['MAA', 'DOR'], ['DHG', 'LEI'], ['DHG', 'KAT'], ['LEI', 'KAT'], ['ALK', 'ZAA'], ['ALK', 'HAA'],
  ['ALK', 'AMS'], ['ZAA', 'AMS'], ['UTR', 'AME'], ['ARN', 'NIJ'], ['ARN', 'APE'], ['ARN', 'DOE'],
  ['NIJ', 'DOE'], ['ENS', 'DEV'], ['ENS', 'ZWO'], ['ZWO', 'DEV'], ['ZWO', 'APE'], ['FRY', 'GRO'],
  ['FRY', 'ZWO'], ['GRO', 'EMM'], ['GRO', 'ASN'], ['EMM', 'ASN'], ['TIL', 'BRE'], ['TIL', 'WAA'],
  ['TIL', 'BOS'], ['BRE', 'BOS'], ['EIN', 'BOS'], ['EIN', 'HEL'], ['MST', 'KER'], ['MST', 'VEN'],
  ['VEN', 'KER'], ['ALM', 'AME'], ['ALM', 'AMS'], ['UTR', 'ALK'],
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
  { name: 'Amsterdamsche Football Club Mercurius', short: 'AMS', nickname: 'De Koopmannen', city: 'Amsterdam', founded: 1900, kit: [C.red, C.black, 'stripes'], away: [C.white, C.red, 'sash'], stadium: 'Stadion Gouden Eeuw', capacity: 55500, rep: 87, style: 'possession', formation: '4-3-3' },
  { name: 'Rotterdamsche Voetbalvereeniging Maasstad', short: 'MAA', nickname: 'De Dokwerkers', city: 'Rotterdam', founded: 1908, kit: [C.green, C.white, 'hoops'], away: [C.white, C.green], stadium: 'Stadion aan de Maas', capacity: 52200, rep: 85, style: 'pressing', formation: '4-2-3-1' },
  { name: 'Eindhovense Voetbalvereniging Lichtstad', short: 'EIN', nickname: 'De Lichtbrengers', city: 'Eindhoven', founded: 1913, kit: [C.yellow, C.royal, 'sash'], away: [C.royal, C.yellow], stadium: 'Stadion De Dommel', capacity: 36400, rep: 82, style: 'possession', formation: '4-2-3-1' },
  { name: 'Sportclub Kaasmarkt Alkmaar', short: 'ALK', nickname: 'De Kaasdragers', city: 'Alkmaar', founded: 1932, kit: [C.gold, C.black, 'hoops'], away: [C.black, C.gold], stadium: 'Stadion De Waag', capacity: 19800, rep: 76, style: 'possession', formation: '4-3-3' },
  { name: 'Voetbalvereniging Domstad Utrecht', short: 'UTR', nickname: 'De Domkerels', city: 'Utrecht', founded: 1970, kit: [C.violet, C.white, 'halves'], away: [C.white, C.violet], stadium: 'Stadion De Dom', capacity: 24600, rep: 72, style: 'balanced', formation: '4-2-3-1' },
  { name: 'Enschedese Voetbalvereeniging Textiel', short: 'ENS', nickname: 'De Wevers', city: 'Enschede', founded: 1965, kit: [C.crimson, C.white, 'stripes'], away: [C.white, C.crimson], stadium: 'Stadion De Spinnerij', capacity: 28400, rep: 72, style: 'direct', formation: '4-4-2' },
  { name: 'Sportklub Fryslân Leeuwarden', short: 'FRY', nickname: 'De Elfstedenrijders', city: 'Leeuwarden', founded: 1920, kit: [C.royal, C.white, 'stripes'], away: [C.white, C.royal, 'hoops'], stadium: 'Stadion De Pompeblêden', capacity: 21300, rep: 66, style: 'possession', formation: '4-3-3' },
  { name: 'Groninger Voetbalvereniging Martini', short: 'GRO', nickname: 'De Noorderlingen', city: 'Groningen', founded: 1936, kit: [C.forest, C.cream, 'halves'], away: [C.cream, C.forest], stadium: 'Stadion Martinipark', capacity: 22400, rep: 66, style: 'balanced', formation: '3-5-2' },
  { name: 'Arnhemse Voetbalvereeniging Veluwe', short: 'ARN', nickname: 'De Veluwse Wolven', city: 'Arnhem', founded: 1892, kit: [C.navy, C.amber, 'halves'], away: [C.amber, C.navy], stadium: 'Stadion Veluwezoom', capacity: 25300, rep: 66, style: 'counter', formation: '4-2-3-1' },
  { name: 'Nijmeegse Voetbal Club Waal', short: 'NIJ', nickname: 'De Romeinen', city: 'Nijmegen', founded: 1900, kit: [C.crimson, C.gold, 'sash'], away: [C.white, C.crimson], stadium: 'Stadion De Waalkade', capacity: 12600, rep: 62, style: 'balanced', formation: '4-4-2' },
  { name: 'Tilburgse Voetbalvereeniging Wolstad', short: 'TIL', nickname: 'De Wolspinners', city: 'Tilburg', founded: 1898, kit: [C.orange, C.royal, 'hoops'], away: [C.royal, C.orange], stadium: 'Stadion Wolpark', capacity: 14800, rep: 60, style: 'possession', formation: '4-3-3' },
  { name: 'Bredase Voetbal Club Mark', short: 'BRE', nickname: 'De Kasteelheren', city: 'Breda', founded: 1912, kit: [C.red, C.navy, 'halves'], away: [C.navy, C.red], stadium: 'Stadion De Mark', capacity: 17800, rep: 60, style: 'balanced', formation: '4-4-2' },
  { name: 'Zwolse Sportvereeniging Hanze', short: 'ZWO', nickname: 'De Hanzemannen', city: 'Zwolle', founded: 1910, kit: [C.scarlet, C.white, 'sash'], away: [C.white, C.scarlet], stadium: 'Stadion De Zwarte Water', capacity: 12900, rep: 58, style: 'defensive', formation: '4-1-4-1' },
  { name: 'Deventer Sportclub IJssel', short: 'DEV', nickname: 'De Koekbakkers', city: 'Deventer', founded: 1902, kit: [C.copper, C.cream, 'halves'], away: [C.cream, C.copper], stadium: 'Stadion De Bolwerk', capacity: 11800, rep: 58, style: 'direct', formation: '4-4-2' },
  { name: 'Voetbalvereniging Mosae Maastricht', short: 'MST', nickname: 'De Mosasauriërs', city: 'Maastricht', founded: 1908, kit: [C.green, C.gold, 'sash'], away: [C.gold, C.green], stadium: 'Stadion aan de Jeker', capacity: 14200, rep: 56, style: 'pressing', formation: '4-4-2' },
  { name: 'Haagse Sportclub Residentie', short: 'DHG', nickname: 'De Regenten', city: 'Den Haag', founded: 1905, kit: [C.navy, C.cyan, 'sash'], away: [C.white, C.navy], stadium: 'Stadion Duinzicht', capacity: 15100, rep: 55, style: 'balanced', formation: '4-1-4-1' },
  { name: 'Zaanse Voetbalvereniging Windmolen', short: 'ZAA', nickname: 'De Molenaars', city: 'Zaandam', founded: 1911, kit: [C.white, C.red, 'sash'], away: [C.red, C.white], stadium: 'Stadion De Molenwerf', capacity: 9800, rep: 52, style: 'defensive', formation: '5-3-2' },
  { name: 'Sportclub Achterhoek Doetinchem', short: 'DOE', nickname: 'De Achterhoekers', city: 'Doetinchem', founded: 1954, kit: [C.green, C.yellow, 'stripes'], away: [C.yellow, C.green], stadium: 'Stadion De Achterhoek', capacity: 10200, rep: 51, style: 'direct', formation: '4-4-2' },
];

const TIER2: RawClub[] = [
  { name: 'Rotterdamsche Cricket- en Voetbalvereeniging Kralingen', short: 'KRA', nickname: 'De Kralingers', city: 'Rotterdam', founded: 1893, kit: [C.black, C.white, 'hoops'], away: [C.white, C.black], stadium: 'Sportpark Kralingen', capacity: 6200, rep: 49, style: 'balanced', formation: '4-3-3' },
  { name: 'Jordaanse Voetbalvereniging', short: 'JOR', nickname: 'De Jordaners', city: 'Amsterdam', founded: 1911, kit: [C.orange, C.black, 'hoops'], away: [C.black, C.orange], stadium: 'Sportpark Noorderkerk', capacity: 5500, rep: 47, style: 'direct', formation: '4-4-2' },
  { name: 'Haarlemse Football Club Spaarne', short: 'HAA', nickname: 'De Bloembollen', city: 'Haarlem', founded: 1902, kit: [C.yellow, C.scarlet, 'stripes'], away: [C.scarlet, C.yellow], stadium: 'Sportpark Spaarnwoude', capacity: 6400, rep: 46, style: 'counter', formation: '4-4-2' },
  { name: 'Leidse Voetbalvereeniging Sleutelstad', short: 'LEI', nickname: 'De Sleuteldragers', city: 'Leiden', founded: 1904, kit: [C.red, C.white, 'halves'], away: [C.white, C.red], stadium: 'Sportpark De Burcht', capacity: 5800, rep: 45, style: 'defensive', formation: '4-1-4-1' },
  { name: 'Dordtse Sportvereeniging Merwede', short: 'DOR', nickname: 'De Dordtenaren', city: 'Dordrecht', founded: 1917, kit: [C.azure, C.white, 'hoops'], away: [C.white, C.azure], stadium: 'Sportpark Biesbosch', capacity: 6100, rep: 44, style: 'balanced', formation: '4-4-2' },
  { name: 'Voetbalvereniging Brabantia Den Bosch', short: 'BOS', nickname: 'De Bossche Bollen', city: "'s-Hertogenbosch", founded: 1906, kit: [C.royal, C.red, 'sash'], away: [C.white, C.royal], stadium: 'Sportpark De Parade', capacity: 8200, rep: 43, style: 'possession', formation: '4-3-3' },
  { name: 'Sportclub Maaskant Venlo', short: 'VEN', nickname: 'De Aspergeboeren', city: 'Venlo', founded: 1935, kit: [C.lime, C.white, 'stripes'], away: [C.white, C.forest], stadium: 'Sportpark Blerick', capacity: 6600, rep: 42, style: 'direct', formation: '4-4-2' },
  { name: 'Helmondse Voetbalclub Kasteel', short: 'HEL', nickname: 'De Kasteelmannen', city: 'Helmond', founded: 1921, kit: [C.maroon, C.cream, 'halves'], away: [C.cream, C.maroon], stadium: 'Sportpark Kasteel', capacity: 4800, rep: 41, style: 'balanced', formation: '4-2-3-1' },
  { name: 'Kerkraadse Sportclub Domaniale', short: 'KER', nickname: 'De Koempels', city: 'Kerkrade', founded: 1962, kit: [C.black, C.yellow, 'stripes'], away: [C.yellow, C.black], stadium: 'Sportpark De Mijnschacht', capacity: 7400, rep: 40, style: 'defensive', formation: '5-3-2' },
  { name: 'Voetbalvereniging Langstraat Waalwijk', short: 'WAA', nickname: 'De Schoenmakers', city: 'Waalwijk', founded: 1940, kit: [C.brown, C.cream, 'sash'], away: [C.cream, C.brown], stadium: 'Sportpark Langstraat', capacity: 5200, rep: 38, style: 'balanced', formation: '4-4-2' },
  { name: 'Emmense Voetbalvereeniging Hunebed', short: 'EMM', nickname: 'De Hunebedders', city: 'Emmen', founded: 1925, kit: [C.silver, C.red, 'hoops'], away: [C.red, C.charcoal], stadium: 'Sportpark Hondsrug', capacity: 7800, rep: 37, style: 'counter', formation: '4-4-2' },
  { name: 'Assense Sportclub Circuit', short: 'ASN', nickname: 'De Racers', city: 'Assen', founded: 1946, kit: [C.white, C.black, 'halves'], away: [C.black, C.white], stadium: 'Sportpark De Bult', capacity: 5600, rep: 35, style: 'direct', formation: '4-4-2' },
  { name: 'Almeerse Voetbalvereniging Polder', short: 'ALM', nickname: 'De Polderpioniers', city: 'Almere', founded: 1976, kit: [C.lime, C.navy, 'hoops'], away: [C.navy, C.lime], stadium: 'Sportpark Flevoland', capacity: 6000, rep: 34, style: 'possession', formation: '4-3-3' },
  { name: 'Amersfoortse Sportclub Koppelpoort', short: 'AME', nickname: 'De Poortwachters', city: 'Amersfoort', founded: 1904, kit: [C.purple, C.silver, 'halves'], away: [C.silver, C.purple], stadium: 'Sportpark Koppelpoort', capacity: 6900, rep: 33, style: 'balanced', formation: '4-1-4-1' },
  { name: 'Sportclub Het Loo Apeldoorn', short: 'APE', nickname: 'De Hofspelers', city: 'Apeldoorn', founded: 1913, kit: [C.blue, C.cream, 'stripes'], away: [C.cream, C.blue], stadium: 'Sportpark Het Loo', capacity: 7100, rep: 31, style: 'defensive', formation: '4-4-2' },
  { name: 'Voetbalvereniging Noordzee Katwijk', short: 'KAT', nickname: 'De Zeemeeuwen', city: 'Katwijk', founded: 1912, kit: [C.white, C.sky, 'stripes'], away: [C.sky, C.white], stadium: 'Sportpark Zeeduin', capacity: 4900, rep: 30, style: 'balanced', formation: '4-3-3' },
];

const ALL = build([...TIER1, ...TIER2]);

export const CLUBS_NED: CountryClubs = {
  country: 'NED',
  tier1: ALL.slice(0, TIER1.length),
  tier2: ALL.slice(TIER1.length),
};
