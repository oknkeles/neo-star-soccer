import { it } from 'vitest';
import { Rng } from '../../core/rng';
import { generateWorld } from '../../world/api';
import { overall } from '../../core/ratings';
import { fairWage } from '../api';
import { stateWith } from './kit';

it('wage probe', () => {
  const world = generateWorld(new Rng(5), { season: 2026, userNation: 'TUR' } as never);
  const clubs = Object.values(world.clubs).sort((a, b) => b.reputation - a.reputation);
  const s = stateWith();
  s.world = world;
  const rows = [clubs[0], clubs[5], clubs[20], clubs[60], clubs[100], clubs[150], clubs[clubs.length - 1]];
  for (const c of rows) {
    const squad = c.squad.map((id) => world.players[id]).filter(Boolean);
    const cur = squad.reduce((a, p) => a + fairWage(s, p, c.id), 0);
    const contractSum = squad.reduce((a, p) => a + (p.contract?.wage ?? 0), 0);
    const top = Math.max(...squad.map((p) => overall(p)));
    const avg = squad.reduce((a, p) => a + overall(p), 0) / squad.length;
    console.log(`${c.shortName} T${c.tier} rep ${c.reputation} budget ${Math.round(c.budget / 1e6)}M wageBudget ${Math.round(c.wageBudget / 1000)}K squad ${squad.length} avgOvr ${avg.toFixed(1)} top ${top} sumFair ${Math.round(cur / 1000)}K sumContracts ${Math.round(contractSum / 1000)}K`);
  }
  console.log('clubs', clubs.length);
});
