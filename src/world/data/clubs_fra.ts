import type { Kit, KitStyle } from '../../core/types';
import { C } from './palette';
import type { ClubSeed, CountryClubs } from './types';

/**
 * France — invented clubs in real French cities, named the French way (Olympique, Racing,
 * Stade, Union Sportive, Étoile…). Giants 85–91 (Paris, Marseille, Lyon, Lille), a mid pack
 * of 62–74 and strugglers at 52–58; the second tier lives at 35–50.
 * Same-city rivals are added by `build`, and every derby is mirrored.
 */

type KitSpec = [primary: string, secondary: string, style?: KitStyle];
type RawClub = Omit<ClubSeed, 'kit' | 'away' | 'derby'> & { kit: KitSpec; away: KitSpec };

const toKit = ([primary, secondary, style = 'plain']: KitSpec): Kit => ({ primary, secondary, style });

/** Classic rivalries (the city derbies come for free). */
const RIVALRIES: [string, string][] = [
  ['PAR', 'MAR'], ['PAR', 'LYO'], ['MAR', 'LYO'], ['MAR', 'NIC'], ['NIC', 'MCO'], ['LYO', 'STE'],
  ['LIL', 'LEN'], ['PAR', 'LIL'], ['REN', 'NAN'], ['REN', 'BRE'], ['BRE', 'LOR'], ['REN', 'GUI'],
  ['LOR', 'GUI'], ['NAN', 'ANG'], ['BDX', 'TLS'], ['STR', 'MTZ'], ['MTZ', 'NCY'], ['REI', 'TRO'],
  ['REI', 'NCY'], ['BAS', 'AJA'], ['MTP', 'NIM'], ['MTP', 'TLS'], ['CAE', 'HAV'], ['DIJ', 'AUX'],
  ['STE', 'GRE'], ['LYO', 'GRE'], ['STE', 'CLE'], ['LIL', 'VAL'], ['LEN', 'AMI'], ['LIL', 'AMI'],
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
  { name: 'Paris Lutèce FC', short: 'PAR', nickname: 'Les Étoilés', city: 'Paris', founded: 1972, kit: [C.navy, C.gold, 'sash'], away: [C.white, C.navy, 'hoops'], stadium: 'Parc des Étoiles', capacity: 56400, rep: 91, style: 'possession', formation: '4-3-3' },
  { name: 'Union Sportive Vieux-Port', short: 'MAR', nickname: 'Les Mistraliens', city: 'Marseille', founded: 1899, kit: [C.turquoise, C.white, 'stripes'], away: [C.navy, C.turquoise], stadium: 'Stade des Calanques', capacity: 64500, rep: 89, style: 'pressing', formation: '4-2-3-1' },
  { name: 'Olympique Lugdunum', short: 'LYO', nickname: 'Les Soyeux', city: 'Lyon', founded: 1953, kit: [C.white, C.violet, 'sash'], away: [C.violet, C.gold], stadium: 'Parc des Canuts', capacity: 58200, rep: 86, style: 'possession', formation: '4-3-3' },
  { name: 'Racing Club Flandres', short: 'LIL', nickname: 'Les Sang-et-Acier', city: 'Lille', founded: 1937, kit: [C.crimson, C.black, 'hoops'], away: [C.white, C.crimson], stadium: 'Stade des Beffrois', capacity: 50100, rep: 85, style: 'counter', formation: '4-2-3-1' },
  { name: 'Riviera Monaco SC', short: 'MCO', nickname: 'Les Princiers', city: 'Monaco', founded: 1919, kit: [C.scarlet, C.white, 'hoops'], away: [C.navy, C.gold, 'halves'], stadium: 'Stade du Cap Fleuri', capacity: 18500, rep: 74, style: 'counter', formation: '4-2-3-1' },
  { name: 'Sporting Club Baie des Anges', short: 'NIC', nickname: 'Les Anges Rouges', city: 'Nice', founded: 1904, kit: [C.crimson, C.navy, 'halves'], away: [C.white, C.crimson], stadium: 'Stade de la Promenade', capacity: 35200, rep: 72, style: 'possession', formation: '4-3-3' },
  { name: 'Stade Armoricain', short: 'REN', nickname: 'Les Hermines', city: 'Rennes', founded: 1901, kit: [C.black, C.white, 'stripes'], away: [C.white, C.black, 'hoops'], stadium: 'Stade de la Vilaine', capacity: 29800, rep: 72, style: 'pressing', formation: '4-2-3-1' },
  { name: 'Union Sportive Artésienne', short: 'LEN', nickname: 'Les Terrils', city: 'Lens', founded: 1906, kit: [C.amber, C.black, 'stripes'], away: [C.black, C.amber, 'hoops'], stadium: 'Stade de la Fosse', capacity: 36500, rep: 71, style: 'direct', formation: '4-4-2' },
  { name: 'Stade Bordelais Garonne', short: 'BDX', nickname: 'Les Vignerons', city: 'Bordeaux', founded: 1881, kit: [C.claret, C.cream, 'hoops'], away: [C.cream, C.claret], stadium: 'Stade des Quinconces', capacity: 42100, rep: 69, style: 'possession', formation: '4-2-3-1' },
  { name: "Jeunesse Sportive de l'Erdre", short: 'NAN', nickname: 'Les Éléphants', city: 'Nantes', founded: 1948, kit: [C.amber, C.teal, 'sash'], away: [C.teal, C.white], stadium: "Stade de l'Île", capacity: 34000, rep: 66, style: 'possession', formation: '4-3-3' },
  { name: 'Association Sportive Forézienne', short: 'STE', nickname: 'Les Gaillards', city: 'Saint-Étienne', founded: 1919, kit: [C.forest, C.silver, 'stripes'], away: [C.white, C.forest, 'hoops'], stadium: 'Stade de la Manufacture', capacity: 36700, rep: 66, style: 'balanced', formation: '4-4-2' },
  { name: 'Sporting Occitan Toulouse', short: 'TLS', nickname: 'Les Briques Roses', city: 'Toulouse', founded: 1937, kit: [C.copper, C.cream, 'sash'], away: [C.cream, C.copper], stadium: 'Stade des Capitouls', capacity: 33200, rep: 64, style: 'counter', formation: '4-3-3' },
  { name: 'Stade Rhénan Strasbourg', short: 'STR', nickname: 'Les Cigognes', city: 'Strasbourg', founded: 1906, kit: [C.red, C.white, 'hoops'], away: [C.navy, C.red], stadium: "Stade de l'Ill", capacity: 31400, rep: 64, style: 'balanced', formation: '3-5-2' },
  { name: 'Olympique Garrigue Montpellier', short: 'MTP', nickname: 'Les Cigales', city: 'Montpellier', founded: 1919, kit: [C.yellow, C.royal, 'halves'], away: [C.royal, C.white], stadium: 'Stade des Garrigues', capacity: 28600, rep: 62, style: 'counter', formation: '4-4-2' },
  { name: 'Athlétique Club Rémois', short: 'REI', nickname: 'Les Pétillants', city: 'Reims', founded: 1931, kit: [C.gold, C.white, 'hoops'], away: [C.black, C.gold], stadium: 'Stade des Sacres', capacity: 21800, rep: 60, style: 'possession', formation: '4-1-4-1' },
  { name: 'Sporting Club Penfeld Brest', short: 'BRE', nickname: 'Les Matelots', city: 'Brest', founded: 1950, kit: [C.navy, C.white, 'hoops'], away: [C.white, C.red], stadium: 'Stade de la Rade', capacity: 15800, rep: 57, style: 'defensive', formation: '5-3-2' },
  { name: 'Étoile Maritime Lorient', short: 'LOR', nickname: 'Les Thoniers', city: 'Lorient', founded: 1926, kit: [C.teal, C.white, 'stripes'], away: [C.white, C.teal], stadium: 'Stade du Scorff', capacity: 14900, rep: 54, style: 'balanced', formation: '4-4-2' },
  { name: 'Sporting Club Moselle', short: 'MTZ', nickname: 'Les Mirabelles', city: 'Metz', founded: 1932, kit: [C.maroon, C.gold, 'halves'], away: [C.white, C.maroon], stadium: 'Stade de la Citadelle', capacity: 25800, rep: 52, style: 'defensive', formation: '4-1-4-1' },
];

const TIER2: RawClub[] = [
  { name: 'Athletic Club Montmartre', short: 'MMA', nickname: 'Les Montmartrois', city: 'Paris', founded: 1908, kit: [C.white, C.red, 'sash'], away: [C.black, C.red, 'hoops'], stadium: 'Stade des Abbesses', capacity: 14200, rep: 50, style: 'possession', formation: '4-3-3' },
  { name: 'Sporting Club Estuaire', short: 'HAV', nickname: 'Les Dockers', city: 'Le Havre', founded: 1899, kit: [C.cyan, C.black, 'stripes'], away: [C.black, C.cyan], stadium: 'Stade des Docks', capacity: 18200, rep: 47, style: 'direct', formation: '4-4-2' },
  { name: 'Étoile Normande Caen', short: 'CAE', nickname: 'Les Conquérants', city: 'Caen', founded: 1913, kit: [C.crimson, C.gold, 'halves'], away: [C.white, C.crimson], stadium: "Stade de l'Abbaye", capacity: 20400, rep: 48, style: 'counter', formation: '4-2-3-1' },
  { name: 'Union Sportive Ardoisière', short: 'ANG', nickname: 'Les Ardoisiers', city: 'Angers', founded: 1919, kit: [C.charcoal, C.white, 'stripes'], away: [C.white, C.charcoal], stadium: 'Stade de la Maine', capacity: 17300, rep: 46, style: 'balanced', formation: '4-1-4-1' },
  { name: 'Cercle Athlétique Yonnais', short: 'AUX', nickname: 'Les Chablisiens', city: 'Auxerre', founded: 1905, kit: [C.forest, C.cream, 'hoops'], away: [C.cream, C.forest], stadium: "Stade de l'Yonne", capacity: 16200, rep: 44, style: 'possession', formation: '4-3-3' },
  { name: 'Étoile de Lorraine Nancy', short: 'NCY', nickname: 'Les Bergamotes', city: 'Nancy', founded: 1901, kit: [C.gold, C.crimson, 'sash'], away: [C.crimson, C.white], stadium: 'Stade de la Pépinière', capacity: 18600, rep: 45, style: 'counter', formation: '4-4-2' },
  { name: 'Union Sportive Bourguignonne', short: 'DIJ', nickname: 'Les Moutardiers', city: 'Dijon', founded: 1932, kit: [C.amber, C.maroon, 'stripes'], away: [C.maroon, C.cream], stadium: 'Stade des Ducs', capacity: 15900, rep: 42, style: 'direct', formation: '4-4-2' },
  { name: 'Athlétique Club Dauphinois', short: 'GRE', nickname: 'Les Dauphins', city: 'Grenoble', founded: 1892, kit: [C.azure, C.white, 'sash'], away: [C.white, C.azure], stadium: 'Stade de la Bastille', capacity: 20500, rep: 43, style: 'balanced', formation: '4-2-3-1' },
  { name: 'Union Sportive Auvergnate', short: 'CLE', nickname: 'Les Volcaniques', city: 'Clermont-Ferrand', founded: 1911, kit: [C.orange, C.charcoal, 'halves'], away: [C.charcoal, C.orange], stadium: 'Stade des Arvernes', capacity: 11800, rep: 40, style: 'defensive', formation: '4-4-2' },
  { name: 'Union Athlétique Troyenne', short: 'TRO', nickname: 'Les Bonnetiers', city: 'Troyes', founded: 1900, kit: [C.pink, C.navy, 'hoops'], away: [C.navy, C.pink], stadium: "Stade de l'Aube", capacity: 16400, rep: 41, style: 'balanced', formation: '4-4-2' },
  { name: 'Jeunesse Bretonne Trégor', short: 'GUI', nickname: 'Les Korrigans', city: 'Guingamp', founded: 1912, kit: [C.emerald, C.black, 'stripes'], away: [C.white, C.emerald], stadium: 'Stade du Trégor', capacity: 12400, rep: 42, style: 'direct', formation: '4-4-2' },
  { name: 'Cercle Picard Amiens', short: 'AMI', nickname: 'Les Hortillons', city: 'Amiens', founded: 1901, kit: [C.lime, C.forest, 'halves'], away: [C.forest, C.lime], stadium: 'Stade de la Somme', capacity: 12600, rep: 39, style: 'balanced', formation: '4-4-2' },
  { name: 'Sporting Club Corsicu Bastia', short: 'BAS', nickname: 'Les Mouflons', city: 'Bastia', founded: 1905, kit: [C.white, C.black, 'halves'], away: [C.black, C.white], stadium: 'Stade du Cap Corse', capacity: 11200, rep: 40, style: 'defensive', formation: '5-3-2' },
  { name: 'Étoile Romaine Nîmes', short: 'NIM', nickname: 'Les Gladiateurs', city: 'Nîmes', founded: 1937, kit: [C.purple, C.gold, 'sash'], away: [C.white, C.purple], stadium: 'Stade de la Tour Magne', capacity: 15000, rep: 41, style: 'balanced', formation: '3-5-2' },
  { name: 'Union Sportive Hennuyère', short: 'VAL', nickname: 'Les Hennuyers', city: 'Valenciennes', founded: 1913, kit: [C.red, C.white, 'halves'], away: [C.navy, C.red], stadium: "Stade de l'Escaut", capacity: 15300, rep: 38, style: 'balanced', formation: '4-4-2' },
  { name: 'Sporting Club Insulaire Ajaccio', short: 'AJA', nickname: 'Les Insulaires', city: 'Ajaccio', founded: 1910, kit: [C.scarlet, C.black, 'stripes'], away: [C.white, C.scarlet], stadium: "Stade du Golfe d'Ajaccio", capacity: 9800, rep: 35, style: 'defensive', formation: '4-1-4-1' },
];

const ALL = build([...TIER1, ...TIER2]);

export const CLUBS_FRA: CountryClubs = {
  country: 'FRA',
  tier1: ALL.slice(0, TIER1.length),
  tier2: ALL.slice(TIER1.length),
};
