import type { Kit, KitStyle } from '../../core/types';
import { C } from './palette';
import type { ClubSeed, CountryClubs } from './types';

/**
 * England — fictional clubs in real English cities. Giants 88–95, a mid pack of 65–80 and
 * strugglers in the high 50s/low 60s; the second tier lives at 30–55. Every club's `derby`
 * list is completed by `build` (same-city rivals + mirrored classic rivalries).
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
  { name: 'Kensington Royals FC', short: 'KEN', nickname: 'The Sovereigns', city: 'London', founded: 1884, kit: [C.purple, C.gold], away: [C.white, C.purple, 'sash'], stadium: 'Sovereign Park', capacity: 76400, rep: 95, style: 'possession', formation: '4-3-3', derby: ['MWA'] },
  { name: 'Manchester Wanderers', short: 'MWA', nickname: 'The Cottonmen', city: 'Manchester', founded: 1878, kit: [C.scarlet, C.black, 'halves'], away: [C.white, C.scarlet], stadium: 'Mill Yard Stadium', capacity: 74100, rep: 93, style: 'pressing', formation: '4-2-3-1', derby: ['LCO', 'KEN'] },
  { name: 'Liverpool Corinthians', short: 'LCO', nickname: 'The Merseymen', city: 'Liverpool', founded: 1880, kit: [C.gold, C.navy, 'halves'], away: [C.navy, C.gold], stadium: 'Albert Quay Stadium', capacity: 61500, rep: 91, style: 'pressing', formation: '4-3-3', derby: ['MWA'] },
  { name: 'Bow Bells FC', short: 'BOW', nickname: 'The Bellringers', city: 'London', founded: 1892, kit: [C.crimson, C.white, 'hoops'], away: [C.black, C.crimson], stadium: 'Bellringer Park', capacity: 59800, rep: 89, style: 'counter', formation: '4-2-3-1' },
  { name: 'Newcastle Tyne Athletic', short: 'NTA', nickname: 'The Keelmen', city: 'Newcastle', founded: 1881, kit: [C.royal, C.white, 'stripes'], away: [C.black, C.royal], stadium: 'Tynegate Arena', capacity: 52300, rep: 88, style: 'direct', formation: '4-4-2', derby: ['WCO'] },
  { name: 'Edgbaston Athletic', short: 'EDG', nickname: 'The Canalmen', city: 'Birmingham', founded: 1889, kit: [C.teal, C.white, 'halves'], away: [C.white, C.teal], stadium: 'Cannon Hill Ground', capacity: 42800, rep: 80, style: 'balanced', formation: '4-4-2', derby: ['WUL', 'CTS'] },
  { name: 'Kirkstall Abbey FC', short: 'KIR', nickname: 'The Monks', city: 'Leeds', founded: 1886, kit: [C.yellow, C.navy, 'hoops'], away: [C.navy, C.yellow], stadium: 'Abbey Fields', capacity: 38500, rep: 78, style: 'possession', formation: '4-3-3', derby: ['SHC', 'BRD', 'YJV'] },
  { name: 'Sheffield Cutlers FC', short: 'SHC', nickname: 'The Cutlers', city: 'Sheffield', founded: 1869, kit: [C.charcoal, C.silver, 'stripes'], away: [C.red, C.charcoal], stadium: 'Steelworks Lane', capacity: 36200, rep: 77, style: 'direct', formation: '4-4-2', derby: ['KIR'] },
  { name: 'Sherwood Rangers FC', short: 'SHR', nickname: 'The Outlaws', city: 'Nottingham', founded: 1865, kit: [C.forest, C.gold, 'hoops'], away: [C.gold, C.forest], stadium: 'Trentside Park', capacity: 33000, rep: 75, style: 'counter', formation: '4-1-4-1', derby: ['DSM', 'FOS'] },
  { name: 'Southampton Mariners FC', short: 'SOM', nickname: 'The Seafarers', city: 'Southampton', founded: 1885, kit: [C.navy, C.sky, 'hoops'], away: [C.white, C.navy], stadium: 'Itchen Quay', capacity: 31000, rep: 73, style: 'pressing', formation: '4-2-3-1', derby: ['PDY', 'BRG'] },
  { name: 'Bristol Brunel FC', short: 'BRU', nickname: 'The Engineers', city: 'Bristol', founded: 1894, kit: [C.orange, C.charcoal], away: [C.white, C.orange], stadium: 'Harbourside Park', capacity: 30400, rep: 72, style: 'balanced', formation: '4-3-3', derby: ['PLY'] },
  { name: 'Fosse Albion', short: 'FOS', nickname: 'The Fossemen', city: 'Leicester', founded: 1884, kit: [C.azure, C.gold], away: [C.white, C.azure], stadium: 'Roman Way Ground', capacity: 32700, rep: 70, style: 'counter', formation: '4-4-2', derby: ['DSM'] },
  { name: 'Brighton Regency FC', short: 'BRG', nickname: 'The Regents', city: 'Brighton', founded: 1901, kit: [C.turquoise, C.white], away: [C.navy, C.turquoise, 'stripes'], stadium: 'Seafront Arena', capacity: 24500, rep: 68, style: 'possession', formation: '4-3-3', derby: ['PDY'] },
  { name: 'Hull Humber Whalers AFC', short: 'HUW', nickname: 'The Whalers', city: 'Hull', founded: 1904, kit: [C.navy, C.amber, 'hoops'], away: [C.amber, C.navy], stadium: 'Humber Dock Stadium', capacity: 25000, rep: 66, style: 'defensive', formation: '5-3-2', derby: ['TEE'] },
  { name: 'Wearmouth Colliery AFC', short: 'WCO', nickname: 'The Colliers', city: 'Sunderland', founded: 1879, kit: [C.scarlet, C.white, 'stripes'], away: [C.black, C.scarlet], stadium: 'Wearmouth Park', capacity: 31500, rep: 65, style: 'direct', formation: '4-4-2', derby: ['NTA', 'TEE'] },
  { name: 'Etruria Rovers', short: 'ETR', nickname: 'The Kilnmen', city: 'Stoke-on-Trent', founded: 1863, kit: [C.maroon, C.cream, 'sash'], away: [C.cream, C.maroon], stadium: 'Bottle Kiln Park', capacity: 26000, rep: 63, style: 'defensive', formation: '4-4-2', derby: ['BSA', 'WUL'] },
  { name: 'Norwich Wherry FC', short: 'WHE', nickname: 'The Wherrymen', city: 'Norwich', founded: 1902, kit: [C.amber, C.forest, 'halves'], away: [C.forest, C.amber], stadium: 'Broadland Park', capacity: 27000, rep: 62, style: 'possession', formation: '4-2-3-1' },
  { name: 'Coventry Three Spires', short: 'CTS', nickname: 'The Spires', city: 'Coventry', founded: 1883, kit: [C.cyan, C.navy], away: [C.navy, C.cyan, 'stripes'], stadium: 'Spon End Ground', capacity: 24000, rep: 60, style: 'balanced', formation: '4-4-2', derby: ['EDG'] },
  { name: 'Portsmouth Dockyard AFC', short: 'PDY', nickname: 'The Shipwrights', city: 'Portsmouth', founded: 1898, kit: [C.blue, C.red, 'sash'], away: [C.white, C.blue], stadium: 'Gunwharf Park', capacity: 21500, rep: 58, style: 'defensive', formation: '5-3-2', derby: ['SOM'] },
  { name: 'Derwent Silkmen', short: 'DSM', nickname: 'The Silkmen', city: 'Derby', founded: 1884, kit: [C.white, C.black], away: [C.black, C.white, 'hoops'], stadium: 'Silk Mill Ground', capacity: 27500, rep: 56, style: 'balanced', formation: '4-4-2', derby: ['SHR'] },
];

const TIER2: RawClub[] = [
  { name: 'Wulfrun Athletic', short: 'WUL', nickname: 'The Wulfs', city: 'Wolverhampton', founded: 1877, kit: [C.emerald, C.white, 'stripes'], away: [C.white, C.emerald], stadium: 'Wulfruna Street Ground', capacity: 28500, rep: 55, style: 'balanced', formation: '4-4-2', derby: ['EDG'] },
  { name: 'Teesside Ironopolis', short: 'TEE', nickname: 'The Ironmen', city: 'Middlesbrough', founded: 1889, kit: [C.red, C.navy, 'hoops'], away: [C.white, C.red], stadium: 'Transporter Park', capacity: 25000, rep: 54, style: 'pressing', formation: '4-3-3', derby: ['HUW', 'WCO'] },
  { name: 'Salford Quays FC', short: 'SQF', nickname: 'The Quaysiders', city: 'Salford', founded: 1898, kit: [C.sky, C.white], away: [C.navy, C.sky], stadium: 'Quays Arena', capacity: 14000, rep: 50, style: 'possession', formation: '4-3-3', derby: ['MWA', 'BSA'] },
  { name: 'Bolton Spindle Athletic', short: 'BSA', nickname: 'The Spindlemen', city: 'Bolton', founded: 1874, kit: [C.royal, C.silver, 'hoops'], away: [C.silver, C.royal], stadium: 'Spindle Park', capacity: 19500, rep: 48, style: 'direct', formation: '4-4-2', derby: ['SQF', 'PGU'] },
  { name: 'Preston Guild FC', short: 'PGU', nickname: 'The Guildsmen', city: 'Preston', founded: 1880, kit: [C.claret, C.cream, 'halves'], away: [C.cream, C.claret], stadium: 'Fishergate Park', capacity: 18500, rep: 47, style: 'balanced', formation: '4-4-2', derby: ['BSA', 'BTW'] },
  { name: 'Blackpool Tower Rovers', short: 'BTW', nickname: 'The Lamplighters', city: 'Blackpool', founded: 1887, kit: [C.tangerine, C.white, 'stripes'], away: [C.white, C.tangerine], stadium: 'Promenade Park', capacity: 16500, rep: 45, style: 'counter', formation: '4-2-3-1', derby: ['PGU'] },
  { name: 'Birkenhead Ferrymen FC', short: 'BFF', nickname: 'The Ferrymen', city: 'Birkenhead', founded: 1884, kit: [C.black, C.white, 'hoops'], away: [C.red, C.black], stadium: 'Woodside Ferry Ground', capacity: 14500, rep: 43, style: 'defensive', formation: '5-3-2', derby: ['LCO'] },
  { name: 'Hackney Wick United', short: 'HWU', nickname: 'The Wickers', city: 'London', founded: 1895, kit: [C.orange, C.black], away: [C.white, C.orange], stadium: 'Lea Marshes Ground', capacity: 12500, rep: 42, style: 'pressing', formation: '4-1-4-1' },
  { name: 'Reading Kennet FC', short: 'RKF', nickname: 'The Biscuitmen', city: 'Reading', founded: 1871, kit: [C.violet, C.white, 'stripes'], away: [C.white, C.violet], stadium: 'Huntley Meadow', capacity: 15500, rep: 41, style: 'balanced', formation: '4-4-2', derby: ['OXI', 'SWL'] },
  { name: 'Peckham Rye Rovers', short: 'PRR', nickname: 'The Ryemen', city: 'London', founded: 1890, kit: [C.green, C.white, 'halves'], away: [C.white, C.green], stadium: 'Rye Lane Stadium', capacity: 11800, rep: 40, style: 'balanced', formation: '4-4-2' },
  { name: 'Greenwich Meridian FC', short: 'GMF', nickname: 'The Meridians', city: 'London', founded: 1906, kit: [C.navy, C.white, 'sash'], away: [C.white, C.navy], stadium: 'Prime Meridian Ground', capacity: 13200, rep: 38, style: 'possession', formation: '4-3-3' },
  { name: 'Oxford Isis FC', short: 'OXI', nickname: 'The Scholars', city: 'Oxford', founded: 1893, kit: [C.navy, C.sky, 'stripes'], away: [C.sky, C.navy], stadium: 'Port Meadow Ground', capacity: 12000, rep: 36, style: 'possession', formation: '4-2-3-1', derby: ['RKF'] },
  { name: 'Swindon Locomotive FC', short: 'SWL', nickname: 'The Locos', city: 'Swindon', founded: 1879, kit: [C.green, C.black, 'hoops'], away: [C.black, C.green], stadium: 'Locomotive Works Ground', capacity: 14200, rep: 35, style: 'direct', formation: '4-4-2', derby: ['BRU'] },
  { name: 'Plymouth Hoe FC', short: 'PLY', nickname: 'The Drakemen', city: 'Plymouth', founded: 1886, kit: [C.white, C.red, 'sash'], away: [C.red, C.white], stadium: 'Sound View Park', capacity: 15000, rep: 34, style: 'defensive', formation: '4-4-2', derby: ['BRU'] },
  { name: 'York Jorvik FC', short: 'YJV', nickname: 'The Vikings', city: 'York', founded: 1876, kit: [C.red, C.black, 'stripes'], away: [C.black, C.red], stadium: 'Minster View Stadium', capacity: 13800, rep: 32, style: 'pressing', formation: '4-3-3', derby: ['KIR'] },
  { name: 'Bradford Woolmen FC', short: 'BRD', nickname: 'The Woolmen', city: 'Bradford', founded: 1883, kit: [C.claret, C.amber, 'hoops'], away: [C.amber, C.claret], stadium: 'Mill Chimney Ground', capacity: 17600, rep: 30, style: 'direct', formation: '4-4-2', derby: ['KIR'] },
];

const ALL = build([...TIER1, ...TIER2]);

export const CLUBS_ENG: CountryClubs = {
  country: 'ENG',
  tier1: ALL.slice(0, TIER1.length),
  tier2: ALL.slice(TIER1.length),
};
