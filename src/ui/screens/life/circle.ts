/**
 * The player's (deliberately small) circle: the manager (head coach), the agent, mother, father and at most ONE partner.
 * Friends, siblings, journalists, directors, mentor and rival may exist in a save, but are never surfaced.
 */
import type { GameState, ManagerTemperament, PersonRole, RelKey } from '../../../core/types';
import type { PersonaKind } from '../../../core/narrative-types';

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
  const agent = c.people.find((x) => x.role === 'agent') ?? c.genesis.agent;
  if (agent) {
    out.push({
      id: agent.id, persona: 'agent', role: 'agent', group: 'work', name: agent.name, personality: agent.personality, bio: agent.bio,
      relationship: agent.relationship ?? c.relationships.agent, relKey: 'agent',
    });
  }
  // Parents: one mother, one father (the chat with "family" is a chat with both of them).
  for (const role of ['mother', 'father'] as const) {
    const x = c.people.find((q) => q.role === role);
    if (!x) continue;
    out.push({
      id: x.id, persona: 'family', role, group: 'family', name: x.name,
      personality: x.personality, bio: x.bio, relationship: x.relationship, relKey: 'family',
    });
  }
  // At most one partner: the current one, or a legacy-save partner if none is flagged.
  const partner = c.people.find((x) => x.id === c.partnerId) ?? c.people.find((x) => x.role === 'partner');
  if (partner) {
    out.push({
      id: partner.id, persona: 'partner', role: 'partner', group: 'family', name: partner.name, personality: partner.personality,
      bio: partner.bio, relationship: partner.relationship ?? c.relationships.partner, relKey: 'partner',
    });
  }
  return out;
}

/** The parents share one conversation: its drawer is titled "Anne & Baba" instead of a single name. */
export function chatEntryFor(circle: CircleEntry[], e: CircleEntry): CircleEntry {
  if (e.persona !== 'family') return e;
  const names = circle.filter((x) => x.persona === 'family').map((x) => x.name);
  return names.length > 1 ? { ...e, name: names.join(' & ') } : e;
}

/** Fallback relationship band (0..4) used when the career module's label is unavailable. */
export function relBand(v: number): 0 | 1 | 2 | 3 | 4 {
  return v < 20 ? 0 : v < 40 ? 1 : v < 60 ? 2 : v < 80 ? 3 : 4;
}
