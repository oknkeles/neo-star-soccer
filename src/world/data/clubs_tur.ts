import type { Kit, KitStyle } from '../../core/types';
import { C } from './palette';
import type { ClubSeed, CountryClubs } from './types';

/**
 * Türkiye — invented clubs in real Turkish cities, named the Turkish way (… SK, … Spor,
 * … Gücü, … İdman Yurdu, … Atletik, … FK) with colour-plus-animal nicknames in the national
 * tradition. Four giants at 79–85: three İstanbul clubs spread over the continents'
 * districts (Haydarpaşa on the Asian shore, Pera and Boğazkesen on the European one) and a
 * Black Sea power in Trabzon. The mid pack lives at 58–70, strugglers at 54–56 and the
 * second tier at 34–50. Every İstanbul club is a derby rival of every other, the Black Sea
 * clubs hate each other, and `build` mirrors every rivalry.
 */

type KitSpec = [primary: string, secondary: string, style?: KitStyle];
type RawClub = Omit<ClubSeed, 'kit' | 'away' | 'derby'> & { kit: KitSpec; away: KitSpec };

const toKit = ([primary, secondary, style = 'plain']: KitSpec): Kit => ({ primary, secondary, style });

/** Classic rivalries beyond the same-city ones (İstanbul, Ankara and İzmir derbies come free). */
const RIVALRIES: [string, string][] = [
  // Black Sea rivalry, and the Black Sea power against the İstanbul giants
  ['TRZ', 'SAM'], ['TRZ', 'RIZ'], ['TRZ', 'ORD'], ['SAM', 'ORD'], ['RIZ', 'ORD'],
  ['TRZ', 'HAY'], ['TRZ', 'PER'], ['TRZ', 'BOG'], ['ERZ', 'TRZ'],
  // Marmara, Aegean, Central Anatolia, Mediterranean and the south-east
  ['BUR', 'IZM'], ['BUR', 'ESK'], ['IZM', 'SAK'], ['ESK', 'ULU'], ['ESK', 'KON'],
  ['KON', 'KAY'], ['KAY', 'SIV'], ['SIV', 'MAL'], ['SIV', 'ERZ'], ['MAL', 'DIY'],
  ['GAZ', 'ADA'], ['GAZ', 'DIY'], ['ADA', 'MER'], ['MER', 'ANT'], ['KON', 'ANT'],
  ['DEN', 'MAN'], ['DEN', 'ANT'], ['MAN', 'ALS'], ['MAN', 'BOR'],
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
  { name: 'Haydarpaşa SK', short: 'HAY', nickname: 'Mavi Lokomotifler', city: 'İstanbul', founded: 1907, kit: [C.navy, C.sky, 'stripes'], away: [C.white, C.navy, 'sash'], stadium: 'Rıhtım Stadyumu', capacity: 51500, rep: 85, style: 'pressing', formation: '4-2-3-1' },
  { name: 'Pera Atletik SK', short: 'PER', nickname: 'Kızıl Şahinler', city: 'İstanbul', founded: 1905, kit: [C.scarlet, C.white, 'stripes'], away: [C.black, C.scarlet], stadium: 'Pera Arena', capacity: 52800, rep: 84, style: 'possession', formation: '4-3-3' },
  { name: 'Boğazkesen SK', short: 'BOG', nickname: 'Bordo Doğanlar', city: 'İstanbul', founded: 1903, kit: [C.claret, C.white, 'halves'], away: [C.white, C.claret, 'sash'], stadium: 'Hisar Arena', capacity: 46500, rep: 82, style: 'counter', formation: '3-5-2' },
  { name: 'Trabzon Boztepe Gücü', short: 'TRZ', nickname: 'Kara Dalgalar', city: 'Trabzon', founded: 1961, kit: [C.teal, C.black, 'stripes'], away: [C.white, C.teal, 'hoops'], stadium: 'Zağnos Vadisi Stadyumu', capacity: 39600, rep: 79, style: 'pressing', formation: '4-4-2' },
  { name: 'Ataşehir Metropol FK', short: 'ATA', nickname: 'Turuncu Kaplanlar', city: 'İstanbul', founded: 1990, kit: [C.orange, C.navy, 'halves'], away: [C.navy, C.orange], stadium: 'Metropol Arena', capacity: 17800, rep: 70, style: 'possession', formation: '4-2-3-1' },
  { name: 'Bursa İpekspor', short: 'BUR', nickname: 'Yeşil Kervan', city: 'Bursa', founded: 1963, kit: [C.emerald, C.black, 'halves'], away: [C.white, C.emerald, 'stripes'], stadium: 'Kervansaray Stadyumu', capacity: 34800, rep: 68, style: 'counter', formation: '4-3-3' },
  { name: 'Alsancak Körfezspor', short: 'ALS', nickname: 'Körfez Kartalları', city: 'İzmir', founded: 1914, kit: [C.cobalt, C.white, 'halves'], away: [C.yellow, C.cobalt], stadium: 'Kordon Stadyumu', capacity: 24000, rep: 67, style: 'possession', formation: '4-3-3' },
  { name: 'Ankara Ulus Gücü', short: 'ULU', nickname: 'Kale Muhafızları', city: 'Ankara', founded: 1931, kit: [C.royal, C.cream, 'sash'], away: [C.cream, C.royal], stadium: 'Kale Stadyumu', capacity: 29500, rep: 66, style: 'defensive', formation: '4-1-4-1' },
  { name: 'Bornova Ege Gücü', short: 'BOR', nickname: 'Zeytin Yeşilleri', city: 'İzmir', founded: 1952, kit: [C.green, C.cream, 'hoops'], away: [C.cream, C.green], stadium: 'Ege Arena', capacity: 20500, rep: 64, style: 'counter', formation: '4-4-2' },
  { name: 'Antalya Kaleiçi SK', short: 'ANT', nickname: 'Turkuaz Martılar', city: 'Antalya', founded: 1966, kit: [C.turquoise, C.white, 'stripes'], away: [C.white, C.turquoise], stadium: 'Konyaaltı Arena', capacity: 31500, rep: 63, style: 'balanced', formation: '4-2-3-1' },
  { name: 'Konya Selçuklu Gücü', short: 'KON', nickname: 'Yeşil Kubbe', city: 'Konya', founded: 1922, kit: [C.forest, C.white, 'stripes'], away: [C.white, C.forest], stadium: 'Selçuklu Meydan Stadyumu', capacity: 32000, rep: 62, style: 'defensive', formation: '4-4-2' },
  { name: 'Kayseri Talasspor', short: 'KAY', nickname: 'Karlı Zirveler', city: 'Kayseri', founded: 1966, kit: [C.scarlet, C.amber, 'sash'], away: [C.white, C.scarlet], stadium: 'Talas Arena', capacity: 31400, rep: 61, style: 'direct', formation: '4-4-2' },
  { name: 'Samsun Liman SK', short: 'SAM', nickname: 'Kızıl Martılar', city: 'Samsun', founded: 1965, kit: [C.red, C.navy, 'hoops'], away: [C.white, C.red], stadium: 'Liman Arena', capacity: 32800, rep: 60, style: 'counter', formation: '4-4-2' },
  { name: 'Gaziantep Zeugma SK', short: 'GAZ', nickname: 'Fıstıklar', city: 'Gaziantep', founded: 1969, kit: [C.lime, C.forest, 'stripes'], away: [C.forest, C.lime], stadium: 'Zeugma Stadyumu', capacity: 31600, rep: 60, style: 'balanced', formation: '4-2-3-1' },
  { name: 'Adana Çukurova Gücü', short: 'ADA', nickname: 'Beyaz Altınlar', city: 'Adana', founded: 1940, kit: [C.white, C.gold, 'sash'], away: [C.navy, C.gold], stadium: 'Taşköprü Stadyumu', capacity: 32400, rep: 59, style: 'counter', formation: '4-4-2' },
  { name: 'Eskişehir Porsuk SK', short: 'ESK', nickname: 'Kırlangıçlar', city: 'Eskişehir', founded: 1965, kit: [C.red, C.black, 'hoops'], away: [C.black, C.red], stadium: 'Porsuk Stadyumu', capacity: 29600, rep: 57, style: 'possession', formation: '4-3-3' },
  { name: 'Kumkapı Balıkçıspor', short: 'KUM', nickname: 'Balıkçılar', city: 'İstanbul', founded: 1927, kit: [C.royal, C.white, 'hoops'], away: [C.white, C.royal], stadium: 'Kumkapı Sahil Stadı', capacity: 14800, rep: 56, style: 'defensive', formation: '5-3-2' },
  { name: 'Başkent Gençlik SK', short: 'BAS', nickname: 'Mavi Yıldızlar', city: 'Ankara', founded: 1954, kit: [C.blue, C.yellow, 'hoops'], away: [C.white, C.blue], stadium: 'Çankaya Arena', capacity: 18500, rep: 54, style: 'balanced', formation: '4-4-2' },
];

const TIER2: RawClub[] = [
  { name: 'Kuzguncuk İdman Yurdu', short: 'KUZ', nickname: 'Boğaz Güvercinleri', city: 'İstanbul', founded: 1912, kit: [C.white, C.sky, 'halves'], away: [C.sky, C.white], stadium: 'Kuzguncuk Bostanı Sahası', capacity: 6500, rep: 50, style: 'possession', formation: '4-3-3' },
  { name: 'Rize Kaçkar SK', short: 'RIZ', nickname: 'Yeşil Çaycılar', city: 'Rize', founded: 1953, kit: [C.emerald, C.lime, 'stripes'], away: [C.white, C.emerald], stadium: 'Çay Bahçesi Stadyumu', capacity: 11500, rep: 49, style: 'direct', formation: '4-4-2' },
  { name: 'Bakırköy Sahilspor', short: 'BAK', nickname: 'Marmara Yunusları', city: 'İstanbul', founded: 1936, kit: [C.cyan, C.white, 'stripes'], away: [C.navy, C.cyan], stadium: 'Sahil Yolu Stadı', capacity: 9200, rep: 47, style: 'counter', formation: '4-4-2' },
  { name: 'Sivas Kangal Gücü', short: 'SIV', nickname: 'Kangallar', city: 'Sivas', founded: 1967, kit: [C.copper, C.black, 'halves'], away: [C.black, C.copper], stadium: 'Kangal Arena', capacity: 14500, rep: 46, style: 'defensive', formation: '5-3-2' },
  { name: 'Diyarbakır Dicle Gücü', short: 'DIY', nickname: 'Kara Kaleler', city: 'Diyarbakır', founded: 1968, kit: [C.black, C.white, 'stripes'], away: [C.white, C.black], stadium: 'Dicle Stadyumu', capacity: 16800, rep: 45, style: 'direct', formation: '4-4-2' },
  { name: 'Tarabya Yelken SK', short: 'TAR', nickname: 'Mavi Yelkenliler', city: 'İstanbul', founded: 1928, kit: [C.navy, C.white, 'hoops'], away: [C.white, C.navy], stadium: 'Tarabya Koyu Stadı', capacity: 5800, rep: 44, style: 'balanced', formation: '4-2-3-1' },
  { name: 'Malatya Kayısı Gücü', short: 'MAL', nickname: 'Kayısılar', city: 'Malatya', founded: 1966, kit: [C.amber, C.brown, 'stripes'], away: [C.brown, C.amber], stadium: 'Kayısı Bahçesi Stadyumu', capacity: 13200, rep: 44, style: 'direct', formation: '4-4-2' },
  { name: 'Denizli Pamukkale SK', short: 'DEN', nickname: 'Beyaz Teraslar', city: 'Denizli', founded: 1966, kit: [C.white, C.cyan, 'hoops'], away: [C.cyan, C.white], stadium: 'Teras Stadyumu', capacity: 12400, rep: 43, style: 'balanced', formation: '4-1-4-1' },
  { name: 'Gölbaşı Mogan SK', short: 'GOL', nickname: 'Mogan Sazanları', city: 'Ankara', founded: 1969, kit: [C.teal, C.cream, 'sash'], away: [C.cream, C.teal], stadium: 'Mogan Gölü Stadyumu', capacity: 8400, rep: 42, style: 'defensive', formation: '4-4-2' },
  { name: 'Ordu Fındıkspor', short: 'ORD', nickname: 'Fındıklılar', city: 'Ordu', founded: 1967, kit: [C.brown, C.gold, 'hoops'], away: [C.gold, C.brown], stadium: 'Fındık Vadisi Stadyumu', capacity: 10500, rep: 41, style: 'counter', formation: '4-4-2' },
  { name: 'Erzurum Palandöken SK', short: 'ERZ', nickname: 'Kar Kaplanları', city: 'Erzurum', founded: 1968, kit: [C.sky, C.navy, 'stripes'], away: [C.white, C.sky], stadium: 'Palandöken Stadyumu', capacity: 11800, rep: 40, style: 'defensive', formation: '5-3-2' },
  { name: 'Manisa Spilspor', short: 'MAN', nickname: 'Spil Kartalları', city: 'Manisa', founded: 1965, kit: [C.purple, C.white, 'stripes'], away: [C.white, C.purple], stadium: 'Spil Dağı Stadyumu', capacity: 11200, rep: 39, style: 'balanced', formation: '4-4-2' },
  { name: 'Mersin Kızkalesispor', short: 'MER', nickname: 'Mavi Mercanlar', city: 'Mersin', founded: 1963, kit: [C.azure, C.white, 'sash'], away: [C.white, C.azure], stadium: 'Akdeniz Sahil Stadyumu', capacity: 13800, rep: 38, style: 'possession', formation: '4-3-3' },
  { name: 'Foça Deniz SK', short: 'FOC', nickname: 'Foklar', city: 'İzmir', founded: 1952, kit: [C.charcoal, C.cyan, 'stripes'], away: [C.white, C.charcoal], stadium: 'Foça Kalesi Sahası', capacity: 5200, rep: 36, style: 'defensive', formation: '4-4-2' },
  { name: 'Sakarya Sapancaspor', short: 'SAK', nickname: 'Gölün Kuğuları', city: 'Adapazarı', founded: 1954, kit: [C.white, C.black, 'sash'], away: [C.black, C.white], stadium: 'Sapanca Gölü Stadyumu', capacity: 9800, rep: 35, style: 'balanced', formation: '4-4-2' },
  { name: 'İzmit Körfez SK', short: 'IZM', nickname: 'Çelik Kollar', city: 'İzmit', founded: 1962, kit: [C.grey, C.orange, 'halves'], away: [C.orange, C.grey], stadium: 'Körfez Stadyumu', capacity: 11000, rep: 34, style: 'direct', formation: '4-4-2' },
];

const ALL = build([...TIER1, ...TIER2]);

export const CLUBS_TUR: CountryClubs = {
  country: 'TUR',
  tier1: ALL.slice(0, TIER1.length),
  tier2: ALL.slice(TIER1.length),
};
