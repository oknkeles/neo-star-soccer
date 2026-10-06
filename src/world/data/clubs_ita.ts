import type { Kit, KitStyle } from '../../core/types';
import { C } from './palette';
import type { ClubSeed, CountryClubs } from './types';

/**
 * Italy — fictional clubs in real Italian cities (AC / AS / US / SS / FC naming, campanilismo
 * nicknames). Giants 88–93, mid pack 65–80, strugglers high 50s/low 60s; tier two at 30–55.
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
  { name: 'Associazione Calcio Madunina', short: 'MAD', nickname: 'I Meneghini', city: 'Milano', founded: 1899, kit: [C.crimson, C.white, 'sash'], away: [C.white, C.crimson], stadium: 'Stadio Porta Nuova', capacity: 76800, rep: 93, style: 'possession', formation: '4-3-3', derby: ['SAB'] },
  { name: 'Società Sportiva Sabauda', short: 'SAB', nickname: 'I Sabaudi', city: 'Torino', founded: 1897, kit: [C.navy, C.gold, 'stripes'], away: [C.white, C.navy], stadium: 'Stadio Reale', capacity: 62500, rep: 92, style: 'counter', formation: '3-5-2', derby: ['MAD', 'CAP'] },
  { name: 'Associazione Sportiva Capitolina', short: 'CAP', nickname: 'I Capitolini', city: 'Roma', founded: 1900, kit: [C.emerald, C.white, 'halves'], away: [C.white, C.emerald], stadium: 'Stadio dei Cesari', capacity: 71000, rep: 90, style: 'possession', formation: '4-3-3', derby: ['VES'] },
  { name: 'Unione Sportiva Cenacolo', short: 'CEN', nickname: 'I Cenacolisti', city: 'Milano', founded: 1908, kit: [C.blue, C.gold, 'stripes'], away: [C.gold, C.blue], stadium: 'Stadio Lombardia', capacity: 58000, rep: 89, style: 'pressing', formation: '4-2-3-1' },
  { name: 'Società Sportiva Vesuvio', short: 'VES', nickname: 'I Vesuviani', city: 'Napoli', founded: 1926, kit: [C.tangerine, C.charcoal, 'stripes'], away: [C.charcoal, C.tangerine], stadium: 'Stadio del Golfo', capacity: 60500, rep: 88, style: 'counter', formation: '4-3-3', derby: ['SAB'] },
  { name: 'Football Club Lanterna 1893', short: 'LAN', nickname: 'I Corsari', city: 'Genova', founded: 1893, kit: [C.navy, C.red, 'hoops'], away: [C.white, C.navy], stadium: 'Stadio della Lanterna', capacity: 36500, rep: 80, style: 'balanced', formation: '3-5-2', derby: ['MAD'] },
  { name: 'Società Sportiva Arno', short: 'ARN', nickname: 'I Medicei', city: 'Firenze', founded: 1926, kit: [C.white, C.red, 'sash'], away: [C.red, C.white], stadium: 'Stadio Oltrarno', capacity: 40800, rep: 79, style: 'possession', formation: '4-3-3', derby: ['FEL'] },
  { name: 'Associazione Calcio Felsinea', short: 'FEL', nickname: 'I Felsinei', city: 'Bologna', founded: 1909, kit: [C.claret, C.gold, 'stripes'], away: [C.gold, C.claret], stadium: 'Stadio delle Due Torri', capacity: 36000, rep: 77, style: 'pressing', formation: '4-2-3-1', derby: ['ARN'] },
  { name: 'Unione Sportiva Città Alta', short: 'CIT', nickname: 'Gli Alpini', city: 'Bergamo', founded: 1907, kit: [C.forest, C.black, 'stripes'], away: [C.white, C.forest], stadium: 'Stadio della Città Alta', capacity: 26000, rep: 76, style: 'pressing', formation: '3-5-2', derby: ['LEO'] },
  { name: 'Associazione Calcio Giulietta', short: 'GIU', nickname: 'Gli Innamorati', city: 'Verona', founded: 1903, kit: [C.crimson, C.cream, 'halves'], away: [C.cream, C.crimson], stadium: 'Stadio Porta Borsari', capacity: 38000, rep: 75, style: 'counter', formation: '3-5-2', derby: ['LAG'] },
  { name: 'Società Sportiva Panormus', short: 'PAN', nickname: 'I Panormiti', city: 'Palermo', founded: 1900, kit: [C.red, C.gold], away: [C.white, C.red, 'stripes'], stadium: "Stadio Conca d'Oro", capacity: 34000, rep: 72, style: 'counter', formation: '4-4-2', derby: ['VUL'] },
  { name: 'Associazione Sportiva Murattiana', short: 'BAR', nickname: 'I Pugliesi', city: 'Bari', founded: 1908, kit: [C.cobalt, C.white, 'sash'], away: [C.white, C.cobalt], stadium: 'Stadio Lungomare', capacity: 40000, rep: 70, style: 'balanced', formation: '4-4-2', derby: ['LEC'] },
  { name: 'Unione Sportiva Poetto', short: 'CAG', nickname: 'Gli Isolani', city: 'Cagliari', founded: 1920, kit: [C.turquoise, C.white, 'stripes'], away: [C.white, C.turquoise], stadium: 'Stadio del Poetto', capacity: 25500, rep: 68, style: 'defensive', formation: '5-3-2' },
  { name: 'Associazione Calcio Friulana', short: 'UDI', nickname: 'I Friulani', city: 'Udine', founded: 1896, kit: [C.orange, C.black], away: [C.black, C.orange, 'hoops'], stadium: 'Stadio del Castello', capacity: 25500, rep: 66, style: 'counter', formation: '3-5-2', derby: ['TRI'] },
  { name: 'Football Club Farnese', short: 'PAR', nickname: 'I Farnesiani', city: 'Parma', founded: 1913, kit: [C.sky, C.gold], away: [C.white, C.sky], stadium: 'Stadio Ducale', capacity: 27000, rep: 65, style: 'possession', formation: '4-3-3', derby: ['GHI'] },
  { name: 'Associazione Sportiva Barocca', short: 'LEC', nickname: 'I Barocchi', city: 'Lecce', founded: 1908, kit: [C.yellow, C.navy, 'hoops'], away: [C.navy, C.yellow], stadium: 'Stadio Porta Napoli', capacity: 30000, rep: 63, style: 'defensive', formation: '4-4-2', derby: ['BAR'] },
  { name: 'Società Sportiva Bora', short: 'TRI', nickname: 'I Boriani', city: 'Trieste', founded: 1918, kit: [C.sky, C.navy, 'stripes'], away: [C.navy, C.sky], stadium: 'Stadio Miramare', capacity: 21500, rep: 62, style: 'pressing', formation: '4-4-2', derby: ['UDI'] },
  { name: 'Unione Sportiva Lagunare', short: 'LAG', nickname: 'I Lagunari', city: 'Venezia', founded: 1907, kit: [C.teal, C.gold, 'halves'], away: [C.gold, C.teal], stadium: 'Stadio della Laguna', capacity: 22000, rep: 60, style: 'possession', formation: '3-5-2', derby: ['GIU'] },
  { name: 'Società Sportiva Etnea', short: 'VUL', nickname: 'I Vulcanici', city: 'Catania', founded: 1908, kit: [C.black, C.orange, 'halves'], away: [C.orange, C.black], stadium: 'Stadio del Vulcano', capacity: 31500, rep: 58, style: 'direct', formation: '4-4-2', derby: ['PAN'] },
  { name: 'Football Club Leonessa', short: 'LEO', nickname: 'I Leonessi', city: 'Brescia', founded: 1911, kit: [C.violet, C.white], away: [C.white, C.violet, 'sash'], stadium: 'Stadio Mille Miglia', capacity: 24500, rep: 56, style: 'balanced', formation: '5-3-2', derby: ['CIT'] },
];

const TIER2: RawClub[] = [
  { name: 'Unione Sportiva Navigli', short: 'NAV', nickname: 'I Navigliani', city: 'Milano', founded: 1913, kit: [C.white, C.navy, 'stripes'], away: [C.navy, C.white], stadium: 'Stadio Darsena', capacity: 15500, rep: 55, style: 'possession', formation: '4-3-3' },
  { name: 'Associazione Calcio Mole', short: 'MOL', nickname: 'I Torinesi', city: 'Torino', founded: 1906, kit: [C.charcoal, C.orange, 'stripes'], away: [C.white, C.charcoal], stadium: 'Stadio Vanchiglia', capacity: 16500, rep: 54, style: 'direct', formation: '4-4-2' },
  { name: 'Unione Sportiva Trastevere', short: 'TRS', nickname: 'I Trasteverini', city: 'Roma', founded: 1909, kit: [C.crimson, C.gold, 'halves'], away: [C.gold, C.crimson], stadium: 'Stadio Gianicolo', capacity: 17500, rep: 53, style: 'pressing', formation: '4-3-3' },
  { name: 'Unione Sportiva Posillipo', short: 'POS', nickname: 'I Posillipini', city: 'Napoli', founded: 1914, kit: [C.azure, C.white, 'hoops'], away: [C.white, C.azure], stadium: 'Stadio Marechiaro', capacity: 15000, rep: 52, style: 'counter', formation: '4-2-3-1' },
  { name: 'Associazione Calcio Etrusca', short: 'ETR', nickname: 'Gli Etruschi', city: 'Perugia', founded: 1905, kit: [C.forest, C.gold, 'stripes'], away: [C.gold, C.forest], stadium: 'Stadio Rocca Paolina', capacity: 18000, rep: 50, style: 'balanced', formation: '4-4-2' },
  { name: 'Associazione Calcio Prato della Valle', short: 'PAT', nickname: 'I Patavini', city: 'Padova', founded: 1910, kit: [C.sky, C.white, 'stripes'], away: [C.white, C.sky], stadium: 'Stadio del Prato', capacity: 17000, rep: 48, style: 'defensive', formation: '5-3-2', derby: ['LAG'] },
  { name: 'Unione Sportiva Scuola Medica', short: 'SCU', nickname: 'I Dottori', city: 'Salerno', founded: 1919, kit: [C.green, C.crimson, 'halves'], away: [C.white, C.green], stadium: 'Stadio Costiera', capacity: 17500, rep: 46, style: 'possession', formation: '4-3-3', derby: ['VES', 'POS'] },
  { name: 'Società Sportiva Adriatica', short: 'ADR', nickname: 'I Gabbiani', city: 'Pescara', founded: 1936, kit: [C.royal, C.amber, 'halves'], away: [C.white, C.royal], stadium: 'Stadio Aterno', capacity: 17500, rep: 45, style: 'counter', formation: '4-4-2', derby: ['DOR'] },
  { name: 'Unione Sportiva Torre Pendente', short: 'PEN', nickname: 'I Pisani', city: 'Pisa', founded: 1909, kit: [C.cobalt, C.cream, 'halves'], away: [C.cream, C.cobalt], stadium: 'Stadio dei Miracoli', capacity: 16500, rep: 44, style: 'possession', formation: '4-3-3', derby: ['ARN'] },
  { name: 'Associazione Calcio Capitanata', short: 'CPT', nickname: 'I Dauni', city: 'Foggia', founded: 1920, kit: [C.orange, C.white], away: [C.white, C.orange, 'stripes'], stadium: 'Stadio Tavoliere', capacity: 18000, rep: 42, style: 'direct', formation: '4-4-2', derby: ['BAR'] },
  { name: 'Associazione Sportiva Peloritana', short: 'PEL', nickname: 'I Peloritani', city: 'Messina', founded: 1900, kit: [C.purple, C.gold], away: [C.gold, C.purple], stadium: 'Stadio dello Stretto', capacity: 19000, rep: 40, style: 'defensive', formation: '5-3-2', derby: ['VUL', 'PAN'] },
  { name: 'Unione Sportiva Ghirlandina', short: 'GHI', nickname: 'I Ghirlandini', city: 'Modena', founded: 1912, kit: [C.gold, C.charcoal, 'halves'], away: [C.charcoal, C.gold], stadium: 'Stadio Ghirlandina', capacity: 14500, rep: 38, style: 'pressing', formation: '3-5-2', derby: ['PAR', 'FEL'] },
  { name: 'Società Sportiva Torrazzo', short: 'TOR', nickname: 'I Torrazzani', city: 'Cremona', founded: 1903, kit: [C.teal, C.silver, 'stripes'], away: [C.silver, C.teal], stadium: 'Stadio del Torrazzo', capacity: 15500, rep: 36, style: 'balanced', formation: '4-4-2', derby: ['CIT'] },
  { name: 'Associazione Calcio Riviera', short: 'RIV', nickname: 'I Riminesi', city: 'Rimini', founded: 1912, kit: [C.azure, C.red, 'sash'], away: [C.white, C.azure], stadium: 'Stadio Borgo Marina', capacity: 13000, rep: 34, style: 'counter', formation: '4-4-2', derby: ['FEL'] },
  { name: 'Unione Sportiva Dorica', short: 'DOR', nickname: 'I Dorici', city: 'Ancona', founded: 1905, kit: [C.copper, C.black], away: [C.white, C.copper], stadium: 'Stadio del Conero', capacity: 12500, rep: 32, style: 'defensive', formation: '5-3-2' },
  { name: 'Società Sportiva Tridentina', short: 'TRD', nickname: 'I Tridentini', city: 'Trento', founded: 1921, kit: [C.emerald, C.black], away: [C.white, C.emerald], stadium: 'Stadio delle Dolomiti', capacity: 11000, rep: 30, style: 'pressing', formation: '4-4-2', derby: ['GIU'] },
];

const ALL = build([...TIER1, ...TIER2]);

export const CLUBS_ITA: CountryClubs = {
  country: 'ITA',
  tier1: ALL.slice(0, TIER1.length),
  tier2: ALL.slice(TIER1.length),
};
