import { it } from 'vitest';
import { play } from './helpers';
import type { MomentType } from '../../../core/types';
const TYPES: MomentType[] = ['open_play','counter','one_on_one','cross_receive','wing_cross','build_up','defend','free_kick','penalty','corner','drill_free_kick','drill_finishing','drill_passing'];
it('explore', () => {
  const lines: string[] = [];
  for (const type of TYPES) {
    const counts: Record<string, number> = {};
    let goals = 0; let unfinished = 0; let tsum = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const t0 = performance.now();
      const r = play(type, seed);
      tsum += performance.now() - t0;
      if (!r) { unfinished++; continue; }
      counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
      if (r.goalFor) goals++;
    }
    lines.push(`${type}: goals=${goals} unfinished=${unfinished} ms/run=${(tsum/30).toFixed(1)} ${JSON.stringify(counts)}`);
  }
  for (const type of TYPES) {
    const counts: Record<string, number> = {};
    let unfinished = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const r = play(type, seed, {}, false);
      if (!r) { unfinished++; continue; }
      counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
    }
    lines.push(`IDLE ${type}: unfinished=${unfinished} ${JSON.stringify(counts)}`);
  }
  require('fs').writeFileSync('/private/tmp/claude-501/-Users-oknkeles-Nss/8f0f2e16-af2c-429b-9382-41f931f3d1a0/scratchpad/explore.txt', lines.join('\n'));
});
