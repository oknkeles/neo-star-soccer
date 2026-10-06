/**
 * Knockout structure of each competition, derived from its kind and size so nothing
 * extra needs to be stored in the save.
 */
import type { Competition, Fixture } from '../core/types';
import { CC_KO_WEEKS, TOURNAMENT_KO_WEEKS, cupRoundWeeks } from './calendar';

export type StageKey = 'R64' | 'R32' | 'R16' | 'QF' | 'SF' | 'F';

export function stageForTeams(n: number): StageKey {
  if (n <= 2) return 'F';
  if (n <= 4) return 'SF';
  if (n <= 8) return 'QF';
  if (n <= 16) return 'R16';
  if (n <= 32) return 'R32';
  return 'R64';
}

export interface CompFormat {
  /** Group matchdays (0 = straight knockout). Fixture.round 1..groupRounds are group games. */
  groupRounds: number;
  /** Teams entering the first knockout round. */
  koTeams: number;
  /** Week of each knockout round (index 0 = first knockout round). */
  koWeeks: number[];
  koSlot: 'midweek' | 'weekend';
  neutralFinal: boolean;
  neutralAll: boolean;
}

export const isTournamentId = (id: string) => id.startsWith('WC-') || id.startsWith('CONT-');
/** International-break fixtures carry '-Q-' (qualifier) or '-F-' (friendly) in their id. */
export const isQualifierId = (fixtureId: string) => fixtureId.includes('-Q-');

function koRounds(teams: number): number {
  return Math.max(1, Math.round(Math.log2(Math.max(2, teams))));
}

function tailWeeks(weeks: readonly number[], rounds: number): number[] {
  if (rounds <= weeks.length) return weeks.slice(weeks.length - rounds);
  const extra: number[] = [];
  for (let i = rounds - weeks.length; i > 0; i--) extra.push(Math.max(1, weeks[0] - i * 3));
  return [...extra, ...weeks];
}

/** Null for leagues and international friendlies (no knockout). */
export function compFormat(comp: Competition): CompFormat | null {
  if (comp.kind === 'cup') {
    const size = comp.teamIds.length;
    const r = koRounds(size);
    return { groupRounds: 0, koTeams: 2 ** r, koWeeks: cupRoundWeeks(r), koSlot: 'midweek', neutralFinal: true, neutralAll: false };
  }
  const groups = Object.keys(comp.tables).length;
  if (comp.kind === 'continental' && groups > 0) {
    const koTeams = groups * 2;
    return { groupRounds: 6, koTeams, koWeeks: tailWeeks(CC_KO_WEEKS, koRounds(koTeams)), koSlot: 'midweek', neutralFinal: true, neutralAll: false };
  }
  if (comp.kind === 'international' && isTournamentId(comp.id) && groups > 0) {
    const koTeams = groups * 2;
    return { groupRounds: 3, koTeams, koWeeks: tailWeeks(TOURNAMENT_KO_WEEKS, koRounds(koTeams)), koSlot: 'weekend', neutralFinal: true, neutralAll: true };
  }
  return null;
}

/** Is this fixture a knockout tie (needs a winner)? */
export function isKnockoutFixture(comp: Competition, fixture: Fixture): boolean {
  const f = compFormat(comp);
  return f !== null && fixture.round > f.groupRounds;
}

/** Stage key of knockout round index k (1-based). */
export function koStageKey(format: CompFormat, k: number): StageKey {
  return stageForTeams(format.koTeams / 2 ** (k - 1));
}

/** Winner of a played fixture (pens decide draws), null if level without pens or unplayed. */
export function fixtureWinner(f: Fixture): string | null {
  if (!f.played || f.homeGoals === undefined || f.awayGoals === undefined) return null;
  if (f.homeGoals > f.awayGoals) return f.homeId;
  if (f.awayGoals > f.homeGoals) return f.awayId;
  if (f.pens) return f.pens.home > f.pens.away ? f.homeId : f.awayId;
  return null;
}

export function fixtureLoser(f: Fixture): string | null {
  const w = fixtureWinner(f);
  if (!w) return null;
  return w === f.homeId ? f.awayId : f.homeId;
}
