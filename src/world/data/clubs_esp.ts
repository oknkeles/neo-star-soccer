import type { Kit, KitStyle } from '../../core/types';
import { C } from './palette';
import type { ClubSeed, CountryClubs } from './types';

/**
 * Spain — fictional clubs in real Spanish cities (Castilian, Catalan, Basque and Galician naming
 * traditions). Giants 86–93, mid pack 65–80, strugglers high 50s/low 60s; tier two at 30–55.
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
  { name: 'Real Club Castellana', short: 'CAS', nickname: 'Los Imperiales', city: 'Madrid', founded: 1902, kit: [C.white, C.gold], away: [C.navy, C.gold, 'sash'], stadium: 'Estadio Reina Isabel', capacity: 81000, rep: 93, style: 'possession', formation: '4-3-3', derby: ['MED'] },
  { name: 'Futbol Club Mediterrani', short: 'MED', nickname: 'Els Corsaris', city: 'Barcelona', founded: 1899, kit: [C.tangerine, C.navy, 'stripes'], away: [C.navy, C.tangerine], stadium: 'Estadi de la Barceloneta', capacity: 84300, rep: 92, style: 'possession', formation: '4-3-3', derby: ['CAS'] },
  { name: 'Real Club Triana', short: 'TRI', nickname: 'Los Alfareros', city: 'Sevilla', founded: 1905, kit: [C.green, C.white, 'hoops'], away: [C.black, C.green], stadium: 'Estadio Torre del Oro', capacity: 63500, rep: 90, style: 'pressing', formation: '4-2-3-1', derby: ['TUA'] },
  { name: 'Real Club Turia', short: 'TUA', nickname: 'Los Blanquinegros', city: 'Valencia', founded: 1903, kit: [C.white, C.black, 'halves'], away: [C.black, C.white], stadium: 'Estadio Torres de Serranos', capacity: 55200, rep: 88, style: 'counter', formation: '4-2-3-1', derby: ['TRI'] },
  { name: 'Abando Club Atlético', short: 'ABA', nickname: 'Los Siderúrgicos', city: 'Bilbao', founded: 1898, kit: [C.yellow, C.black, 'halves'], away: [C.black, C.yellow], stadium: 'Campo de la Ría', capacity: 53000, rep: 86, style: 'direct', formation: '4-4-2', derby: ['CON', 'SFM'] },
  { name: 'Club Deportivo Cierzo', short: 'CIE', nickname: 'Los Cierzos', city: 'Zaragoza', founded: 1932, kit: [C.maroon, C.white, 'stripes'], away: [C.white, C.maroon], stadium: 'Estadio del Ebro', capacity: 34500, rep: 80, style: 'balanced', formation: '4-4-2', derby: ['SFM'] },
  { name: 'Club Atlético Gibralfaro', short: 'GIB', nickname: 'Los Malacitanos', city: 'Málaga', founded: 1904, kit: [C.sky, C.navy], away: [C.navy, C.sky, 'hoops'], stadium: 'Estadio del Guadalmedina', capacity: 32000, rep: 78, style: 'possession', formation: '4-3-3', derby: ['SAC', 'TRI'] },
  { name: 'Real Club Berbés', short: 'BER', nickname: 'Los Marineros', city: 'Vigo', founded: 1906, kit: [C.teal, C.white, 'hoops'], away: [C.white, C.teal], stadium: 'Estadio del Puerto', capacity: 29500, rep: 77, style: 'pressing', formation: '4-2-3-1', derby: ['ORZ'] },
  { name: 'Club Atlético Orzán', short: 'ORZ', nickname: 'Los Brigantinos', city: 'A Coruña', founded: 1907, kit: [C.azure, C.white, 'halves'], away: [C.white, C.azure], stadium: 'Estadio Marineda', capacity: 31800, rep: 76, style: 'balanced', formation: '4-4-2', derby: ['BER', 'APO'] },
  { name: 'Real Club La Concha', short: 'CON', nickname: 'Los Conchistas', city: 'San Sebastián', founded: 1909, kit: [C.royal, C.white, 'halves'], away: [C.white, C.royal], stadium: 'Estadio de Igueldo', capacity: 33000, rep: 76, style: 'possession', formation: '4-3-3', derby: ['ABA'] },
  { name: 'Club Deportivo Tramuntana', short: 'TRA', nickname: 'Los Tramuntanos', city: 'Palma', founded: 1916, kit: [C.scarlet, C.gold], away: [C.white, C.scarlet, 'stripes'], stadium: 'Estadi Bellver', capacity: 24500, rep: 74, style: 'counter', formation: '4-4-2' },
  { name: 'Unión Deportiva Canteras', short: 'CNT', nickname: 'Los Playeros', city: 'Las Palmas', founded: 1949, kit: [C.turquoise, C.yellow], away: [C.yellow, C.turquoise], stadium: 'Estadio Alisios', capacity: 29000, rep: 72, style: 'possession', formation: '4-3-3' },
  { name: 'Sociedad Deportiva Cimadevilla', short: 'CIM', nickname: 'Los Mareantes', city: 'Gijón', founded: 1905, kit: [C.crimson, C.navy, 'stripes'], away: [C.white, C.crimson], stadium: 'Estadio Piles', capacity: 28500, rep: 71, style: 'direct', formation: '4-4-2', derby: ['NAR'] },
  { name: 'Club Atlético Sanfermín', short: 'SFM', nickname: 'Los Sanfermineros', city: 'Pamplona', founded: 1920, kit: [C.scarlet, C.white, 'sash'], away: [C.navy, C.scarlet], stadium: 'Estadio Rochapea', capacity: 22500, rep: 69, style: 'defensive', formation: '5-3-2' },
  { name: 'Club Deportivo Pisuerga', short: 'PIS', nickname: 'Los Pisuergos', city: 'Valladolid', founded: 1928, kit: [C.maroon, C.gold, 'halves'], away: [C.gold, C.maroon], stadium: 'Estadio del Pisuerga', capacity: 26500, rep: 68, style: 'balanced', formation: '4-4-2' },
  { name: 'Unión Deportiva Sacromonte', short: 'SAC', nickname: 'Los Albaicineros', city: 'Granada', founded: 1931, kit: [C.charcoal, C.scarlet, 'hoops'], away: [C.white, C.charcoal], stadium: 'Estadio Generalife', capacity: 24200, rep: 66, style: 'counter', formation: '4-2-3-1' },
  { name: 'Club Atlético Postiguet', short: 'POS', nickname: 'Los Postigueros', city: 'Alicante', founded: 1922, kit: [C.cobalt, C.gold, 'halves'], away: [C.white, C.cobalt], stadium: 'Estadio Benacantil', capacity: 28000, rep: 64, style: 'balanced', formation: '4-3-3', derby: ['TUA'] },
  { name: 'Real Club Magdalena', short: 'MAG', nickname: 'Los Pejinos', city: 'Santander', founded: 1913, kit: [C.white, C.navy, 'stripes'], away: [C.navy, C.white], stadium: 'Estadio de la Bahía', capacity: 23500, rep: 62, style: 'defensive', formation: '4-4-2' },
  { name: 'Club Deportivo Tacita de Plata', short: 'TAC', nickname: 'Los Carnavaleros', city: 'Cádiz', founded: 1910, kit: [C.amber, C.navy, 'hoops'], away: [C.navy, C.amber], stadium: 'Estadio de la Caleta', capacity: 25500, rep: 60, style: 'counter', formation: '4-1-4-1', derby: ['TRI'] },
  { name: 'Unión Deportiva Huerta de Murcia', short: 'HUE', nickname: 'Los Huertanos', city: 'Murcia', founded: 1919, kit: [C.violet, C.gold], away: [C.white, C.violet], stadium: 'Estadio La Flota', capacity: 22000, rep: 57, style: 'defensive', formation: '5-3-2' },
];

const TIER2: RawClub[] = [
  { name: 'Club Deportivo Lavapiés', short: 'LAV', nickname: 'Los Chulapos', city: 'Madrid', founded: 1924, kit: [C.crimson, C.white, 'stripes'], away: [C.white, C.crimson], stadium: 'Estadio de la Corrala', capacity: 14500, rep: 55, style: 'pressing', formation: '4-4-2' },
  { name: 'Unió Esportiva Gràcia', short: 'GRA', nickname: 'Els Graciencs', city: 'Barcelona', founded: 1920, kit: [C.violet, C.white, 'stripes'], away: [C.white, C.violet], stadium: 'Camp de la Plaça del Sol', capacity: 12000, rep: 53, style: 'possession', formation: '4-3-3' },
  { name: 'Club Deportivo Macarena', short: 'MAC', nickname: 'Los Macarenos', city: 'Sevilla', founded: 1923, kit: [C.white, C.red, 'hoops'], away: [C.red, C.white], stadium: 'Estadio La Esperanza', capacity: 16000, rep: 51, style: 'balanced', formation: '4-4-2' },
  { name: 'Club Deportivo Russafa', short: 'RUS', nickname: 'Els Russafencs', city: 'Valencia', founded: 1930, kit: [C.orange, C.black, 'stripes'], away: [C.black, C.orange], stadium: 'Camp de la Gran Via', capacity: 12500, rep: 49, style: 'counter', formation: '4-2-3-1' },
  { name: 'Club Deportivo Mezquita', short: 'MEZ', nickname: 'Los Califales', city: 'Córdoba', founded: 1954, kit: [C.copper, C.cream, 'halves'], away: [C.cream, C.copper], stadium: 'Estadio Medina Azahara', capacity: 21500, rep: 48, style: 'possession', formation: '4-3-3', derby: ['TRI'] },
  { name: 'Unión Deportiva Alcazaba', short: 'ALC', nickname: 'Los Alcazabeños', city: 'Almería', founded: 1958, kit: [C.red, C.white, 'hoops'], away: [C.white, C.red], stadium: 'Estadio del Poniente', capacity: 15500, rep: 46, style: 'direct', formation: '4-4-2', derby: ['GIB'] },
  { name: 'Club Deportivo Naranco', short: 'NAR', nickname: 'Los Carbayones', city: 'Oviedo', founded: 1926, kit: [C.sky, C.navy, 'hoops'], away: [C.navy, C.sky], stadium: 'Estadio Naranco Alto', capacity: 19500, rep: 45, style: 'balanced', formation: '4-4-2', derby: ['CIM'] },
  { name: 'Unión Deportiva Charra', short: 'CHA', nickname: 'Los Charros', city: 'Salamanca', founded: 1923, kit: [C.maroon, C.cream, 'sash'], away: [C.cream, C.maroon], stadium: 'Estadio Plaza Mayor', capacity: 14800, rep: 43, style: 'defensive', formation: '5-3-2', derby: ['PIS'] },
  { name: 'Club Deportivo Arlanzón', short: 'ARL', nickname: 'Los Burgaleses', city: 'Burgos', founded: 1936, kit: [C.black, C.white, 'stripes'], away: [C.white, C.black], stadium: 'Estadio El Cid', capacity: 12800, rep: 41, style: 'direct', formation: '4-4-2', derby: ['PIS'] },
  { name: 'Club Deportivo Guadiana', short: 'GUA', nickname: 'Los Pacenses', city: 'Badajoz', founded: 1905, kit: [C.forest, C.white, 'stripes'], away: [C.white, C.forest], stadium: 'Estadio del Guadiana', capacity: 15000, rep: 40, style: 'counter', formation: '4-4-2' },
  { name: 'Real Club Fino', short: 'FIN', nickname: 'Los Bodegueros', city: 'Jerez de la Frontera', founded: 1907, kit: [C.amber, C.black, 'stripes'], away: [C.black, C.amber], stadium: 'Estadio Pago de Macharnudo', capacity: 17500, rep: 39, style: 'possession', formation: '4-3-3', derby: ['TAC'] },
  { name: 'Club Deportivo Tartessos', short: 'TAR', nickname: 'Los Onubenses', city: 'Huelva', founded: 1932, kit: [C.sky, C.white], away: [C.navy, C.sky], stadium: 'Estadio de las Marismas', capacity: 18500, rep: 37, style: 'defensive', formation: '4-4-2', derby: ['TRI'] },
  { name: 'Club Esportiu Amfiteatre', short: 'AMF', nickname: 'Els Romans', city: 'Tarragona', founded: 1914, kit: [C.maroon, C.gold], away: [C.gold, C.maroon], stadium: 'Estadi del Serrallo', capacity: 16000, rep: 36, style: 'possession', formation: '4-3-3', derby: ['ONY', 'MED'] },
  { name: 'Unió Esportiva Onyar', short: 'ONY', nickname: 'Els Gironins', city: 'Girona', founded: 1930, kit: [C.purple, C.white, 'hoops'], away: [C.white, C.purple], stadium: 'Estadi de les Ribes', capacity: 13500, rep: 34, style: 'pressing', formation: '4-2-3-1' },
  { name: 'Club Deportivo Cartago', short: 'CTG', nickname: 'Los Portuarios', city: 'Cartagena', founded: 1919, kit: [C.black, C.red, 'halves'], away: [C.white, C.black], stadium: 'Estadio de la Muralla Púnica', capacity: 14000, rep: 32, style: 'defensive', formation: '5-3-2', derby: ['HUE'] },
  { name: 'Real Club Apóstol', short: 'APO', nickname: 'Los Jacobeos', city: 'Santiago de Compostela', founded: 1926, kit: [C.royal, C.white], away: [C.white, C.royal, 'sash'], stadium: 'Estadio Monte do Gozo', capacity: 13000, rep: 30, style: 'balanced', formation: '4-4-2' },
];

const ALL = build([...TIER1, ...TIER2]);

export const CLUBS_ESP: CountryClubs = {
  country: 'ESP',
  tier1: ALL.slice(0, TIER1.length),
  tier2: ALL.slice(TIER1.length),
};
