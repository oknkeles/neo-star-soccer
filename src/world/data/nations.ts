import type { NationDef } from '../types';
import type { KitTuple } from './palette';
import { C, kit } from './palette';

type Continent = NationDef['continent'];

/** Compact row: code, TR name, EN name, flag, continent, reputation, kit, cities, league link. */
const n = (
  code: string, tr: string, en: string, flag: string, continent: Continent, reputation: number,
  nationKit: KitTuple, cities: string[], league?: NationDef['league'],
): NationDef => ({
  code, name: { tr, en }, flag, continent, reputation, kit: kit(nationKit), cities,
  ...(league ? { league } : {}),
});

/**
 * 48 football nations: the 8 league countries plus the major footballing nations.
 * Reputation (1..100) is national-team strength, ordered roughly like a world ranking.
 */
export const NATIONS_DATA: NationDef[] = [
  // ── the eight league countries ──
  n('ENG', 'İngiltere', 'England', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'EU', 90, [C.white, C.navy, 'plain'],
    ['Londra', 'Manchester', 'Liverpool', 'Birmingham', 'Leeds', 'Newcastle', 'Sheffield', 'Bristol'], 'ENG'),
  n('ESP', 'İspanya', 'Spain', '🇪🇸', 'EU', 91, [C.red, C.yellow, 'plain'],
    ['Madrid', 'Barselona', 'Sevilla', 'Valencia', 'Bilbao', 'Málaga', 'Zaragoza', 'San Sebastián'], 'ESP'),
  n('ITA', 'İtalya', 'Italy', '🇮🇹', 'EU', 85, [C.azure, C.white, 'plain'],
    ['Roma', 'Milano', 'Napoli', 'Torino', 'Floransa', 'Bologna', 'Cenova', 'Palermo'], 'ITA'),
  n('GER', 'Almanya', 'Germany', '🇩🇪', 'EU', 87, [C.white, C.black, 'plain'],
    ['Berlin', 'Münih', 'Hamburg', 'Köln', 'Dortmund', 'Frankfurt', 'Stuttgart', 'Leipzig'], 'GER'),
  n('FRA', 'Fransa', 'France', '🇫🇷', 'EU', 92, [C.royal, C.white, 'plain'],
    ['Paris', 'Marsilya', 'Lyon', 'Lille', 'Bordeaux', 'Nantes', 'Strazburg', 'Toulouse'], 'FRA'),
  n('POR', 'Portekiz', 'Portugal', '🇵🇹', 'EU', 88, [C.red, C.forest, 'plain'],
    ['Lizbon', 'Porto', 'Braga', 'Coimbra', 'Faro', 'Guimarães', 'Setúbal', 'Funchal'], 'POR'),
  n('NED', 'Hollanda', 'Netherlands', '🇳🇱', 'EU', 86, [C.tangerine, C.navy, 'plain'],
    ['Amsterdam', 'Rotterdam', 'Eindhoven', 'Utrecht', 'Lahey', 'Groningen', 'Arnhem', 'Tilburg'], 'NED'),
  n('TUR', 'Türkiye', 'Türkiye', '🇹🇷', 'EU', 73, [C.red, C.white, 'plain'],
    ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Trabzon', 'Konya', 'Antalya', 'Kayseri'], 'TUR'),

  // ── South & Central America ──
  n('ARG', 'Arjantin', 'Argentina', '🇦🇷', 'SA', 93, [C.sky, C.white, 'stripes'],
    ['Buenos Aires', 'Rosario', 'Córdoba', 'Mendoza', 'La Plata', 'Tucumán', 'Mar del Plata', 'Salta']),
  n('BRA', 'Brezilya', 'Brazil', '🇧🇷', 'SA', 91, [C.yellow, C.green, 'plain'],
    ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Porto Alegre', 'Salvador', 'Recife', 'Curitiba', 'Fortaleza']),
  n('URU', 'Uruguay', 'Uruguay', '🇺🇾', 'SA', 80, [C.sky, C.black, 'plain'],
    ['Montevideo', 'Salto', 'Paysandú', 'Rivera', 'Maldonado', 'Colonia del Sacramento']),
  n('COL', 'Kolombiya', 'Colombia', '🇨🇴', 'SA', 79, [C.yellow, C.cobalt, 'plain'],
    ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga', 'Manizales']),
  n('ECU', 'Ekvador', 'Ecuador', '🇪🇨', 'SA', 71, [C.yellow, C.navy, 'plain'],
    ['Quito', 'Guayaquil', 'Cuenca', 'Ambato', 'Manta', 'Loja']),
  n('PAR', 'Paraguay', 'Paraguay', '🇵🇾', 'SA', 65, [C.red, C.white, 'stripes'],
    ['Asunción', 'Ciudad del Este', 'Encarnación', 'Luque', 'San Lorenzo', 'Pedro Juan Caballero']),
  n('CHI', 'Şili', 'Chile', '🇨🇱', 'SA', 64, [C.red, C.blue, 'plain'],
    ['Santiago', 'Valparaíso', 'Concepción', 'Antofagasta', 'Temuco', 'Viña del Mar']),
  n('MEX', 'Meksika', 'Mexico', '🇲🇽', 'NA', 74, [C.green, C.white, 'plain'],
    ['Ciudad de México', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana', 'León', 'Toluca']),
  n('USA', 'ABD', 'United States', '🇺🇸', 'NA', 74, [C.white, C.navy, 'sash'],
    ['New York', 'Los Angeles', 'Chicago', 'Seattle', 'Atlanta', 'Houston', 'Portland', 'Boston']),
  n('CAN', 'Kanada', 'Canada', '🇨🇦', 'NA', 65, [C.red, C.white, 'plain'],
    ['Toronto', 'Montréal', 'Vancouver', 'Calgary', 'Ottawa', 'Edmonton']),

  // ── Africa ──
  n('MAR', 'Fas', 'Morocco', '🇲🇦', 'AF', 79, [C.red, C.green, 'plain'],
    ['Kazablanka', 'Rabat', 'Marakeş', 'Fes', 'Tanca', 'Agadir', 'Tetuan']),
  n('SEN', 'Senegal', 'Senegal', '🇸🇳', 'AF', 76, [C.white, C.green, 'plain'],
    ['Dakar', 'Thiès', 'Saint-Louis', 'Touba', 'Ziguinchor', 'Kaolack']),
  n('CIV', 'Fildişi Sahili', 'Ivory Coast', '🇨🇮', 'AF', 71, [C.orange, C.green, 'plain'],
    ['Abidjan', 'Bouaké', 'Yamoussoukro', 'San-Pédro', 'Daloa', 'Korhogo']),
  n('NGA', 'Nijerya', 'Nigeria', '🇳🇬', 'AF', 70, [C.green, C.white, 'plain'],
    ['Lagos', 'Abuja', 'Kano', 'Ibadan', 'Port Harcourt', 'Enugu', 'Kaduna']),
  n('EGY', 'Mısır', 'Egypt', '🇪🇬', 'AF', 67, [C.red, C.black, 'plain'],
    ['Kahire', 'İskenderiye', 'Gize', 'Port Said', 'Süveyş', 'Asvan']),
  n('ALG', 'Cezayir', 'Algeria', '🇩🇿', 'AF', 67, [C.white, C.green, 'plain'],
    ['Cezayir', 'Oran', 'Konstantin', 'Annaba', 'Setif', 'Blida', 'Tizi Ouzou']),
  n('CMR', 'Kamerun', 'Cameroon', '🇨🇲', 'AF', 64, [C.green, C.red, 'plain'],
    ['Yaoundé', 'Douala', 'Garoua', 'Bamenda', 'Maroua', 'Bafoussam']),
  n('GHA', 'Gana', 'Ghana', '🇬🇭', 'AF', 64, [C.white, C.gold, 'plain'],
    ['Accra', 'Kumasi', 'Tamale', 'Sekondi-Takoradi', 'Cape Coast', 'Sunyani']),
  n('TUN', 'Tunus', 'Tunisia', '🇹🇳', 'AF', 63, [C.red, C.white, 'plain'],
    ['Tunus', 'Sfaks', 'Sus', 'Kayrevan', 'Bizerte', 'Gabes']),
  n('MLI', 'Mali', 'Mali', '🇲🇱', 'AF', 61, [C.yellow, C.green, 'plain'],
    ['Bamako', 'Sikasso', 'Ségou', 'Mopti', 'Kayes', 'Koulikoro']),

  // ── Asia & Oceania ──
  n('JPN', 'Japonya', 'Japan', '🇯🇵', 'AS', 76, [C.blue, C.white, 'plain'],
    ['Tokyo', 'Osaka', 'Yokohama', 'Nagoya', 'Kobe', 'Fukuoka', 'Sapporo', 'Hiroshima']),
  n('KOR', 'Güney Kore', 'South Korea', '🇰🇷', 'AS', 72, [C.red, C.black, 'plain'],
    ['Seul', 'Busan', 'Incheon', 'Daegu', 'Daejeon', 'Gwangju', 'Ulsan']),
  n('AUS', 'Avustralya', 'Australia', '🇦🇺', 'OC', 66, [C.gold, C.green, 'plain'],
    ['Sidney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra']),

  // ── Rest of Europe ──
  n('CRO', 'Hırvatistan', 'Croatia', '🇭🇷', 'EU', 82, [C.red, C.white, 'hoops'],
    ['Zagreb', 'Split', 'Rijeka', 'Osijek', 'Zadar', 'Dubrovnik']),
  n('BEL', 'Belçika', 'Belgium', '🇧🇪', 'EU', 81, [C.red, C.black, 'plain'],
    ['Brüksel', 'Anvers', 'Gent', 'Liège', 'Brugge', 'Charleroi', 'Leuven']),
  n('SUI', 'İsviçre', 'Switzerland', '🇨🇭', 'EU', 75, [C.red, C.white, 'plain'],
    ['Zürih', 'Cenevre', 'Basel', 'Bern', 'Lozan', 'Lugano', 'Lüzern']),
  n('DEN', 'Danimarka', 'Denmark', '🇩🇰', 'EU', 75, [C.red, C.white, 'plain'],
    ['Kopenhag', 'Aarhus', 'Odense', 'Aalborg', 'Esbjerg', 'Randers']),
  n('AUT', 'Avusturya', 'Austria', '🇦🇹', 'EU', 72, [C.red, C.white, 'plain'],
    ['Viyana', 'Graz', 'Salzburg', 'Linz', 'Innsbruck', 'Klagenfurt']),
  n('SRB', 'Sırbistan', 'Serbia', '🇷🇸', 'EU', 70, [C.red, C.navy, 'plain'],
    ['Belgrad', 'Novi Sad', 'Niş', 'Kragujevac', 'Subotica', 'Čačak']),
  n('POL', 'Polonya', 'Poland', '🇵🇱', 'EU', 69, [C.white, C.red, 'plain'],
    ['Varşova', 'Krakov', 'Gdańsk', 'Wrocław', 'Poznań', 'Łódź', 'Katowice']),
  n('UKR', 'Ukrayna', 'Ukraine', '🇺🇦', 'EU', 69, [C.yellow, C.blue, 'plain'],
    ['Kiev', 'Lviv', 'Harkiv', 'Odessa', 'Dnipro', 'Zaporijya']),
  n('SWE', 'İsveç', 'Sweden', '🇸🇪', 'EU', 68, [C.yellow, C.blue, 'plain'],
    ['Stockholm', 'Göteborg', 'Malmö', 'Uppsala', 'Helsingborg', 'Norrköping']),
  n('NOR', 'Norveç', 'Norway', '🇳🇴', 'EU', 67, [C.red, C.navy, 'plain'],
    ['Oslo', 'Bergen', 'Trondheim', 'Stavanger', 'Tromsø', 'Drammen']),
  n('CZE', 'Çekya', 'Czechia', '🇨🇿', 'EU', 66, [C.red, C.blue, 'plain'],
    ['Prag', 'Brno', 'Ostrava', 'Plzeň', 'Olomouc', 'Liberec']),
  n('SCO', 'İskoçya', 'Scotland', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'EU', 65, [C.navy, C.white, 'plain'],
    ['Glasgow', 'Edinburgh', 'Aberdeen', 'Dundee', 'Inverness', 'Paisley']),
  n('WAL', 'Galler', 'Wales', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'EU', 62, [C.red, C.green, 'plain'],
    ['Cardiff', 'Swansea', 'Newport', 'Wrexham', 'Bangor', 'Llanelli']),
  n('SVN', 'Slovenya', 'Slovenia', '🇸🇮', 'EU', 61, [C.white, C.green, 'plain'],
    ['Ljubljana', 'Maribor', 'Celje', 'Koper', 'Kranj', 'Nova Gorica']),
  n('GRE', 'Yunanistan', 'Greece', '🇬🇷', 'EU', 60, [C.blue, C.white, 'stripes'],
    ['Atina', 'Selanik', 'Patra', 'Volos', 'Heraklion', 'Larissa']),
  n('IRL', 'İrlanda', 'Ireland', '🇮🇪', 'EU', 58, [C.green, C.white, 'plain'],
    ['Dublin', 'Cork', 'Galway', 'Limerick', 'Waterford', 'Drogheda']),
];
