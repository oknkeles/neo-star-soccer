import type { CountryCode, Formation, Kit, KitStyle, TacticalStyle } from '../../core/types';
import type { Rng } from '../../core/rng';
import { clamp } from '../../core/util';
import type { ClubSeed } from '../data/types';
import { C } from '../data/palette';
import { CLUBS_ENG } from '../data/clubs_eng';
import { CLUBS_ESP } from '../data/clubs_esp';
import { CLUBS_FRA } from '../data/clubs_fra';
import { CLUBS_GER } from '../data/clubs_ger';
import { CLUBS_ITA } from '../data/clubs_ita';
import { CLUBS_NED } from '../data/clubs_ned';
import { CLUBS_POR } from '../data/clubs_por';
import { CLUBS_TUR } from '../data/clubs_tur';
import { asciiUpper } from './shared';

/** Clean, engine-facing club seed (accepts both the contract shape and the short palette shape). */
export interface NormSeed {
  name: string; short: string; nickname: string; city: string; founded: number;
  kit: Kit; away: Kit; stadium: string; capacity: number; rep: number;
  style?: TacticalStyle; formation?: Formation; youth?: number; fac?: number; foreign: number; derby: string[];
}

export const CLUB_DATA: Record<CountryCode, { tier1: unknown[]; tier2: unknown[] }> = {
  ENG: CLUBS_ENG, ESP: CLUBS_ESP, ITA: CLUBS_ITA, GER: CLUBS_GER, FRA: CLUBS_FRA, POR: CLUBS_POR, NED: CLUBS_NED, TUR: CLUBS_TUR,
};

type Raw = Record<string, unknown>;
const str = (v: unknown, d = ''): string => (typeof v === 'string' && v.trim() ? v.trim() : d);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const KIT_STYLES: KitStyle[] = ['plain', 'stripes', 'hoops', 'halves', 'sash'];

function toKit(v: unknown, fallback: Kit): Kit {
  if (Array.isArray(v) && typeof v[0] === 'string') {
    return { primary: v[0], secondary: str(v[1], fallback.secondary), style: KIT_STYLES.includes(v[2] as KitStyle) ? (v[2] as KitStyle) : 'plain' };
  }
  const k = v as Partial<Kit> | undefined;
  if (k && typeof k.primary === 'string') {
    return { primary: k.primary, secondary: k.secondary ?? fallback.secondary, style: KIT_STYLES.includes(k.style as KitStyle) ? (k.style as KitStyle) : 'plain' };
  }
  return fallback;
}

const HOME_FALLBACK: Kit = { primary: C.red, secondary: C.white, style: 'plain' };
const AWAY_FALLBACK: Kit = { primary: C.white, secondary: C.navy, style: 'plain' };

export function normalizeSeed(raw: unknown): NormSeed {
  const r = raw as Raw;
  const name = str(r.name, 'FC Unnamed');
  const city = str(r.city, name);
  const kit = toKit(r.kit, HOME_FALLBACK);
  let away = toKit(r.away, AWAY_FALLBACK);
  if (away.primary.toLowerCase() === kit.primary.toLowerCase()) away = { ...away, primary: kit.primary === C.white ? C.navy : C.white, secondary: kit.primary };
  const derby = (Array.isArray(r.derby) ? r.derby : Array.isArray(r.rivals) ? r.rivals : []) as unknown[];
  return {
    name, city,
    short: asciiUpper(str(r.short, name)).slice(0, 3).padEnd(3, 'X'),
    nickname: str(r.nickname ?? r.nick, name),
    founded: clamp(Math.round(num(r.founded, 1920)), 1850, 2012),
    kit, away,
    stadium: str(r.stadium, `${city} Stadium`),
    capacity: clamp(Math.round(num(r.capacity ?? r.cap, 12000)), 2000, 110000),
    rep: clamp(num(r.rep, 40), 1, 100),
    style: r.style as TacticalStyle | undefined,
    formation: (r.formation ?? r.form) as Formation | undefined,
    youth: typeof r.youth === 'number' ? r.youth : undefined,
    fac: typeof r.fac === 'number' ? r.fac : undefined,
    foreign: num(r.foreign, 1),
    derby: derby.filter((d): d is string => typeof d === 'string').map((d) => asciiUpper(d).slice(0, 3)),
  };
}

// ───────────────────────── procedural safety net (only used if club data is missing) ─────────────────────────

const FALLBACK_CITIES: Record<CountryCode, string[]> = {
  ENG: ['Manchester', 'Liverpool', 'Leeds', 'Newcastle', 'Sheffield', 'Birmingham', 'Bristol', 'Nottingham', 'Leicester', 'Southampton', 'Norwich', 'Brighton', 'Derby', 'Stoke', 'Coventry', 'Hull', 'Bolton', 'Preston', 'Plymouth', 'Ipswich'],
  ESP: ['Madrid', 'Barcelona', 'Sevilla', 'Valencia', 'Bilbao', 'Málaga', 'Zaragoza', 'Vigo', 'Granada', 'Alicante', 'Oviedo', 'Valladolid', 'Córdoba', 'Gijón', 'Pamplona', 'Santander', 'Murcia', 'Palma', 'Almería', 'Tenerife'],
  ITA: ['Roma', 'Milano', 'Napoli', 'Torino', 'Firenze', 'Bologna', 'Genova', 'Verona', 'Bari', 'Palermo', 'Catania', 'Parma', 'Udine', 'Cagliari', 'Lecce', 'Brescia', 'Perugia', 'Trieste', 'Pisa', 'Modena'],
  GER: ['Berlin', 'München', 'Hamburg', 'Köln', 'Dortmund', 'Frankfurt', 'Stuttgart', 'Leipzig', 'Düsseldorf', 'Bremen', 'Hannover', 'Nürnberg', 'Bochum', 'Mainz', 'Kiel', 'Augsburg', 'Freiburg', 'Rostock', 'Dresden', 'Karlsruhe'],
  FRA: ['Paris', 'Marseille', 'Lyon', 'Lille', 'Nantes', 'Nice', 'Bordeaux', 'Toulouse', 'Rennes', 'Strasbourg', 'Montpellier', 'Reims', 'Lens', 'Metz', 'Brest', 'Nancy', 'Auxerre', 'Angers', 'Caen', 'Amiens'],
  POR: ['Lisboa', 'Porto', 'Braga', 'Guimarães', 'Coimbra', 'Faro', 'Setúbal', 'Funchal', 'Aveiro', 'Vizela', 'Leiria', 'Viseu', 'Portimão', 'Barcelos', 'Chaves', 'Tondela', 'Arouca', 'Estoril', 'Famalicão', 'Évora'],
  NED: ['Amsterdam', 'Rotterdam', 'Eindhoven', 'Utrecht', 'Groningen', 'Tilburg', 'Breda', 'Arnhem', 'Enschede', 'Zwolle', 'Heerenveen', 'Nijmegen', 'Alkmaar', 'Deventer', 'Venlo', 'Almere', 'Den Haag', 'Maastricht', 'Waalwijk', 'Emmen'],
  TUR: ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Konya', 'Antalya', 'Kayseri', 'Samsun', 'Gaziantep', 'Adana', 'Eskişehir', 'Trabzon', 'Denizli', 'Mersin', 'Diyarbakır', 'Malatya', 'Sivas', 'Rize', 'Kocaeli', 'Sakarya'],
};

const FALLBACK_PATTERNS: Record<CountryCode, ((c: string) => string)[]> = {
  ENG: [(c) => `${c} Town`, (c) => `${c} Rovers`, (c) => `${c} Athletic`, (c) => `${c} Wanderers`, (c) => `${c} Albion`, (c) => `${c} Rangers`],
  ESP: [(c) => `CD ${c}`, (c) => `Real ${c}`, (c) => `${c} CF`, (c) => `Racing ${c}`, (c) => `UD ${c}`, (c) => `Deportivo ${c}`],
  ITA: [(c) => `${c} Calcio`, (c) => `US ${c}`, (c) => `Sporting ${c}`, (c) => `Virtus ${c}`, (c) => `Unione ${c}`, (c) => `${c} 1911`],
  GER: [(c) => `FC ${c}`, (c) => `SV ${c}`, (c) => `Fortuna ${c}`, (c) => `Eintracht ${c}`, (c) => `Viktoria ${c}`, (c) => `TSV ${c}`],
  FRA: [(c) => `Olympique ${c}`, (c) => `AS ${c}`, (c) => `FC ${c}`, (c) => `Stade ${c}`, (c) => `Racing ${c}`, (c) => `US ${c}`],
  POR: [(c) => `${c} Atlético`, (c) => `Sporting ${c}`, (c) => `FC ${c}`, (c) => `Académica ${c}`, (c) => `União ${c}`, (c) => `Desportivo ${c}`],
  NED: [(c) => `FC ${c}`, (c) => `SC ${c}`, (c) => `${c} Boys`, (c) => `VV ${c}`, (c) => `Fortuna ${c}`, (c) => `ADO ${c}`],
  TUR: [(c) => `${c} Atletik`, (c) => `${c} Gücü`, (c) => `${c} Birlik SK`, (c) => `${c} Yıldızspor`, (c) => `${c} Anadolu`, (c) => `${c} Gençlik`],
};
const STADIUM_WORD: Record<CountryCode, (c: string) => string> = {
  ENG: (c) => `${c} Park`, ESP: (c) => `Estadio ${c}`, ITA: (c) => `Stadio ${c}`, GER: (c) => `${c} Stadion`,
  FRA: (c) => `Stade ${c}`, POR: (c) => `Estádio ${c}`, NED: (c) => `${c} Stadion`, TUR: (c) => `${c} Stadyumu`,
};
const KIT_COLOURS = [C.red, C.royal, C.green, C.yellow, C.navy, C.orange, C.claret, C.sky, C.black, C.purple, C.teal, C.white];
const STYLES_ALL: KitStyle[] = ['plain', 'stripes', 'hoops', 'halves', 'sash'];

/** Procedural placeholder clubs so a league is never short of teams. */
export function fallbackSeeds(rng: Rng, country: CountryCode, tier: 1 | 2, count: number, taken: Set<string>): NormSeed[] {
  const cities = FALLBACK_CITIES[country];
  const patterns = FALLBACK_PATTERNS[country];
  const out: NormSeed[] = [];
  for (let i = 0; out.length < count; i++) {
    const city = cities[(i + (tier === 2 ? 7 : 0)) % cities.length];
    const lap = Math.floor(i / cities.length);
    let name = patterns[(i + lap * 2 + (tier === 2 ? 3 : 0)) % patterns.length](city);
    for (let k = 2; taken.has(name); k++) name = k <= patterns.length + 1 ? patterns[(i + k) % patterns.length](city) : `${patterns[0](city)} ${k}`;
    taken.add(name);
    const frac = out.length / Math.max(1, count - 1);
    const rep = clamp(Math.round((tier === 1 ? 88 - frac * 44 : 50 - frac * 26) + rng.normal(0, 2)), 10, 96);
    const p = rng.pick(KIT_COLOURS);
    const s = rng.pick(KIT_COLOURS.filter((c) => c !== p));
    out.push({
      name, city, short: asciiUpper(city).slice(0, 3).padEnd(3, 'X'), nickname: name,
      founded: rng.int(1890, 1965), kit: { primary: p, secondary: s, style: rng.pick(STYLES_ALL) },
      away: { primary: p === C.white ? C.navy : C.white, secondary: p, style: 'plain' },
      stadium: STADIUM_WORD[country](city), capacity: Math.round((6000 + rep * rep * 6) / 500) * 500, rep,
      foreign: 1, derby: [],
    });
  }
  return out;
}

/** Make 3-letter codes unique within a country (promoted/relegated clubs must never clash). */
export function uniqueShort(short: string, name: string, used: Set<string>): string {
  if (!used.has(short)) { used.add(short); return short; }
  const letters = asciiUpper(name);
  const tries: string[] = [];
  for (let i = 3; i < letters.length; i++) tries.push(short.slice(0, 2) + letters[i]);
  for (let i = 1; i < letters.length; i++) tries.push(short[0] + letters[i] + short[2]);
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') tries.push(short.slice(0, 2) + c);
  for (const t of tries) if (!used.has(t)) { used.add(t); return t; }
  return short;
}

const STYLE_FORMATIONS: Record<TacticalStyle, Formation[]> = {
  possession: ['4-3-3', '4-2-3-1'], pressing: ['4-2-3-1', '4-3-3', '4-4-2'], counter: ['4-4-2', '4-2-3-1', '4-1-4-1'],
  direct: ['4-4-2', '3-5-2'], defensive: ['5-3-2', '4-1-4-1', '4-4-2'], balanced: ['4-4-2', '4-2-3-1', '4-3-3'],
};
export const formationsFor = (style: TacticalStyle): Formation[] => STYLE_FORMATIONS[style];

/** Pick a tactical style: giants lean towards possession/pressing, minnows towards counter/defensive. */
export function pickStyle(rng: Rng, rep: number): TacticalStyle {
  const f = rep / 100;
  const table: [TacticalStyle, number][] = [
    ['possession', 6 + 24 * f], ['pressing', 6 + 18 * f], ['balanced', 18], ['counter', 24 - 10 * f],
    ['direct', 22 - 14 * f], ['defensive', 22 - 18 * f],
  ];
  return rng.weighted(table, (x) => x[1])[0];
}

// ───────────────────────── finance & facilities ─────────────────────────

/** Average level of a club's best XI from reputation (world scale) and league strength. */
export const teamLevel = (rep: number, leagueStrength: number): number => 38 + 0.39 * rep + 0.12 * leagueStrength;

export function clubBudget(rng: Rng, rep: number, leagueStrength: number): number {
  const raw = 350_000_000 * Math.pow(rep / 100, 3) * Math.pow(leagueStrength / 100, 2.5) * rng.float(0.85, 1.2);
  return Math.max(250_000, raw >= 10_000_000 ? Math.round(raw / 1_000_000) * 1_000_000 : Math.round(raw / 50_000) * 50_000);
}

/** How generous a club is with wages (1 = average). */
export const payFactor = (rep: number, leagueStrength: number): number =>
  0.6 + 0.8 * Math.pow(rep / 100, 2) * (leagueStrength / 90);

export function clubFacilities(rng: Rng, seed: NormSeed, leagueStrength: number): number {
  return clamp(Math.round(seed.fac ?? (10 + seed.rep * 0.72 + (leagueStrength - 50) * 0.2 + rng.normal(0, 4))), 10, 98);
}

export function clubYouth(rng: Rng, seed: NormSeed, leagueStrength: number): number {
  return clamp(Math.round(seed.youth ?? (12 + seed.rep * 0.5 + (leagueStrength - 50) * 0.15 + rng.normal(0, 12))), 8, 97);
}
