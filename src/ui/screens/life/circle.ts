/** The player's social circle (manager, mentor, rival, agent, family, partner …) built from the save. */
import type { GameState, ManagerTemperament, PersonRole, RelKey } from '../../../core/types';
import type { PersonaKind } from '../../../core/narrative-types';
import { fullName } from '../../../core/util';

export type CircleRole = PersonRole | 'manager' | 'mentor' | 'rival';
export type CircleGroup = 'work' | 'family' | 'rival';

export interface CircleEntry {
  id: string;
  persona: PersonaKind | null;
  role: CircleRole;
  group: CircleGroup;
  name: string;
  /** Footballers get a procedural portrait. */
  footballerId?: string;
  temperament?: ManagerTemperament;
  personality?: string;
  bio?: string;
  /** 0..100 when the relationship is tracked. */
  relationship?: number;
  relKey?: RelKey;
}

const FAMILY_ROLES: PersonRole[] = ['father', 'mother', 'sibling'];

export function buildCircle(state: GameState): CircleEntry[] {
  const c = state.career;
  const p = state.world.players[c.playerId];
  const out: CircleEntry[] = [];
  const club = p?.clubId ? state.world.clubs[p.clubId] : null;
  const mgr = club ? state.world.managers[club.managerId] : null;
  if (mgr) {
    out.push({
      id: `mgr-${mgr.id}`, persona: 'manager', role: 'manager', group: 'work', name: `${mgr.firstName} ${mgr.lastName}`,
      temperament: mgr.temperament, relationship: c.relationships.manager, relKey: 'manager',
    });
  }
  const mentor = c.mentorId ? state.world.players[c.mentorId] : null;
  if (mentor) {
    out.push({
      id: `mentor-${mentor.id}`, persona: 'mentor', role: 'mentor', group: 'work', name: fullName(mentor), footballerId: mentor.id,
      bio: c.genesis.mentorBlurb, relationship: c.relationships.teammates, relKey: 'teammates',
    });
  }
  const agent = c.people.find((x) => x.role === 'agent') ?? c.genesis.agent;
  if (agent) {
    out.push({
      id: agent.id, persona: 'agent', role: 'agent', group: 'work', name: agent.name, personality: agent.personality, bio: agent.bio,
      relationship: agent.relationship ?? c.relationships.agent, relKey: 'agent',
    });
  }
  for (const x of c.people) {
    if (x.id === agent?.id) continue;
    if (x.role === 'director' || x.role === 'journalist') {
      out.push({ id: x.id, persona: null, role: x.role, group: 'work', name: x.name, personality: x.personality, bio: x.bio, relationship: x.relationship });
    }
  }
  const firstFamily = c.people.find((x) => FAMILY_ROLES.includes(x.role));
  for (const x of c.people) {
    if (FAMILY_ROLES.includes(x.role)) {
      out.push({
        id: x.id, persona: x.id === firstFamily?.id ? 'family' : null, role: x.role, group: 'family', name: x.name,
        personality: x.personality, bio: x.bio, relationship: x.relationship, relKey: 'family',
      });
    }
  }
  const partner = c.people.find((x) => x.id === c.partnerId) ?? c.people.find((x) => x.role === 'partner');
  if (partner) {
    out.push({
      id: partner.id, persona: 'partner', role: 'partner', group: 'family', name: partner.name, personality: partner.personality,
      bio: partner.bio, relationship: partner.relationship ?? c.relationships.partner, relKey: 'partner',
    });
  }
  for (const x of c.people) {
    if (x.role === 'friend') out.push({ id: x.id, persona: null, role: 'friend', group: 'family', name: x.name, personality: x.personality, bio: x.bio, relationship: x.relationship });
  }
  const rival = state.world.players[c.rivalId];
  if (rival) {
    out.push({ id: `rival-${rival.id}`, persona: 'rival', role: 'rival', group: 'rival', name: fullName(rival), footballerId: rival.id, bio: c.genesis.rivalBlurb });
  }
  return out;
}

/** Fallback relationship band (0..4) used when the career module's label is unavailable. */
export function relBand(v: number): 0 | 1 | 2 | 3 | 4 {
  return v < 20 ? 0 : v < 40 ? 1 : v < 60 ? 2 : v < 80 ? 3 : 4;
}
