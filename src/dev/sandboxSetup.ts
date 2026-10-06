/** Fictional MomentSetup factory for the dev sandbox. */
import type { Attributes, Kit, MomentPlayerSpec, MomentSetup, MomentTeamSpec, MomentType, Position, Weather } from '../core/types';

const US_KIT: Kit = { primary: '#c8102e', secondary: '#ffd200', style: 'stripes' };
const THEM_KIT: Kit = { primary: '#1d3f8f', secondary: '#ffffff', style: 'hoops' };
const ROLES: Position[] = ['GK', 'CB', 'CB', 'FB', 'FB', 'CM', 'CM', 'AM', 'W', 'W', 'ST'];
const US_NAMES = ['Demirkaya', 'Aksoy', 'Kıraç', 'Uslu', 'Erten', 'Sezer', 'Tuncel', 'Karaca', 'Özbay', 'Yalın', 'Yıldırımlar'];
const THEM_NAMES = ['Valdren', 'Morcote', 'Haskel', 'Brennic', 'Oduya', 'Lisandre', 'Petrak', 'Quillan', 'Sorvino', 'Adebe', 'Kastrup'];

function attrs(base: number, role: Position): Attributes {
  const gk = role === 'GK';
  return {
    shooting: base, curl: base + 4, passing: base, dribbling: base, firstTouch: base, heading: base - 4, tackling: role === 'CB' ? base + 8 : base - 10,
    pace: base + 2, acceleration: base + 2, stamina: base, strength: base, jumping: base, vision: base + 6, composure: base, positioning: base,
    goalkeeping: gk ? base + 10 : 10,
  };
}

function team(name: string, short: string, kit: Kit, names: string[], side: 'us' | 'them', userIdx: number): MomentTeamSpec {
  const players: MomentPlayerSpec[] = ROLES.map((role, i) => ({
    id: `${side}${i}`,
    name: names[i],
    number: i === 0 ? 1 : i === 10 ? 9 : i + 1,
    side,
    role,
    isUser: i === userIdx,
    attrs: attrs(68 + (i % 3) * 3, role),
    foot: i % 4 === 0 ? 'L' : 'R',
    weakFoot: 3,
    fitness: 95,
    appearance: {
      skin: (i * 7 + (side === 'us' ? 1 : 3)) % 6, hairStyle: (i * 5 + 1) % 8,
      hairColor: ['#1b1310', '#3b2516', '#6b4a2b', '#c9a066', '#101010'][i % 5], beard: i % 4,
      boots: ['#111111', '#ff4f64', '#ffffff', '#b8ff3c', '#49c6ff'][i % 5], height: 172 + ((i * 7) % 20),
    },
  }));
  return { name, shortName: short, kit, formation: '4-3-3', style: 'balanced', players };
}

export function makeSandboxSetup(type: MomentType, weather: Weather): MomentSetup {
  const userIdx = type === 'defend' ? 1 : 10;
  return {
    type,
    seed: 1234,
    minute: 67,
    us: team('Kızılyıldız SK', 'KYS', US_KIT, US_NAMES, 'us', userIdx),
    them: team('Vardanport FC', 'VDP', THEM_KIT, THEM_NAMES, 'them', -1),
    userId: `us${userIdx}`,
    weather,
    difficulty: 0.5,
    teammateTrust: 70,
    score: { us: 1, them: 1 },
    importance: 0.8,
    timeLimit: type === 'free_kick' || type === 'penalty' ? 25 : 20,
    spot: type === 'free_kick' ? { x: 28, y: -8 } : undefined,
  };
}
