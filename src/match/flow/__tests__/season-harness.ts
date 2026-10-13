/**
 * Goal-realism harness: whole careers through the real GameController, every user match through
 * LiveMatch. Moments are either auto-resolved (the "Simulate" path) or played in the real-time
 * engine by a scripted user (botStep, or a soloist who dribbles at goal and shoots). Reports the
 * user's goals per season with age, overall, club level and appearances.
 */
import { GameController } from '../../../game/controller';
import { memoryStorage } from '../../../game/storage';
import { overall } from '../../../core/ratings';
import { setLang } from '../../../core/i18n';
import { updateSettings } from '../../../core/settings';
import { Rng } from '../../../core/rng';
import type { MomentResult, MomentSetup, PlayablePosition } from '../../../core/types';
import { botStep, createMoment, type MomentEngine } from '../../engine/api';
import { safeAutoResolve } from '../api';

export type PlayMode = 'auto' | 'bot';

export interface SeasonRow { season: number; age: number; ovr: number; club: string; rep: number; apps: number; goals: number; moments: number; momentGoals: number; byType: Record<string, string> }

/** Play one moment in the engine with the scripted user (falls back to autoResolve if it never ends). */
export function playScripted(setup: MomentSetup, seed: number): MomentResult {
  const e: MomentEngine = createMoment(setup);
  const rng = new Rng(seed);
  e.input({ kind: 'start' });
  for (let f = 0; f < 60 * 70 && !e.isFinished(); f++) {
    botStep(e, rng);
    e.step(1 / 60);
  }
  return e.isFinished() ? e.result() : safeAutoResolve(setup, rng);
}

export async function runCareer(opts: { position: PlayablePosition; seasons: number; mode: PlayMode; difficulty: 'easy' | 'normal' | 'hard'; seed: number }): Promise<SeasonRow[]> {
  setLang('en');
  updateSettings((s) => { s.difficulty = opts.difficulty; });
  const g = new GameController({ storage: memoryStorage(), autosaveMs: 0 });
  await g.newCareer({
    firstName: 'Test', lastName: 'Golcu', nation: 'TUR', position: opts.position, foot: 'R',
    appearance: { skin: 2, hairStyle: 2, hairColor: '#222', beard: 0, boots: '#fff', height: 182 }, trait: 'iron_man', seed: opts.seed,
  }, 0);
  let s = g.state!;
  const trial = s.offers.filter((o) => o.kind === 'trial')[0];
  if (trial) g.respondOffer(trial.id, 'accept');
  const rows: SeasonRow[] = [];
  let moments = 0;
  let momentGoals = 0;
  let k = 0;
  let types: Record<string, [number, number]> = {};
  const startSeason = s.season;
  for (let w = 0; w < 52 * opts.seasons + 2; w++) {
    const ag = g.agenda();
    for (const id of [...ag.pendingMatches]) {
      const { live } = g.startMatch(id);
      let guard = 0;
      while (!live.isOver() && guard++ < 3000) {
        const r = live.tick();
        if (r.moment) {
          const sd = opts.seed * 7919 + ++k;
          const res = opts.mode === 'auto' ? safeAutoResolve(r.moment, new Rng(sd)) : playScripted(r.moment, sd);
          moments++;
          const g1 = res.goalFor && res.stats.goals > 0 ? 1 : 0;
          momentGoals += g1;
          const tt = (types[r.moment.type] ??= [0, 0]);
          tt[0]++; tt[1] += g1;
          live.resolveMoment(res);
        }
      }
      await g.finishMatch(id, live.summary());
    }
    for (const ev of g.state!.events.filter((e) => !e.resolved)) { try { g.resolveEvent(ev.id, ev.choices[0].id); } catch { /* */ } }
    const before = g.state!.season;
    const p0 = g.state!.world.players[g.state!.career.playerId];
    const snap = { apps: p0.season.apps, goals: p0.season.goals, ovr: overall(p0), age: before - p0.birthYear, club: p0.clubId ? g.state!.world.clubs[p0.clubId] : null };
    try { await g.advanceWeek(); } catch { /* blocked week: keep going */ }
    s = g.state!;
    const p = s.world.players[s.career.playerId];
    if (s.season !== before) {
      rows.push({ season: before - startSeason + 1, age: snap.age, ovr: snap.ovr, club: snap.club?.shortName ?? 'FREE', rep: snap.club?.reputation ?? 0, apps: snap.apps, goals: snap.goals, moments, momentGoals, byType: Object.fromEntries(Object.entries(types).map(([t, v]) => [t, `${v[1]}/${v[0]}`])) });
      moments = 0; momentGoals = 0; types = {};
      if (rows.length >= opts.seasons) break;
    }
    if (!p.clubId) {
      const live = s.offers.filter((o) => o.status === 'pending');
      if (live.length) { try { g.respondOffer(live[0].id, 'accept'); } catch { /* */ } }
    }
  }
  return rows;
}
