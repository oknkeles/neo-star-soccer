import { it } from 'vitest';
import { Rng } from '../../../core/rng';
import { botStep } from '../api';
import { HL } from '../constants';
import { crossPlane, predictPath } from '../solver';
import { engineFor } from './balance-harness';
it('dbg', () => {
  const lines: string[] = [];
  for (let seed = 1; seed <= 14; seed++) {
    const r = new Rng(seed * 13 + 5);
    const d = r.float(20, 25); const y = r.float(-8, 8);
    const e = engineFor('free_kick', seed, { userAttrs: { shooting: 75, curl: 80, composure: 70 }, spot: { x: HL - Math.sqrt(d * d - y * y), y } });
    const bot = new Rng(seed * 101 + 3);
    const gk = e.gkThem!;
    let info = '';
    let kicks = 0;
    e.on((ev) => {
      if (ev.t === 'kick' || ev.t === 'save' || ev.t === 'woodwork' || ev.t === 'receive' || ev.t === 'header') info += ` {${ev.t}:${'by' in ev ? ev.by : ''}@${e.state.time.toFixed(2)} b=${e.state.ball.pos.x.toFixed(1)},${e.state.ball.pos.y.toFixed(1)},${e.state.ball.pos.z.toFixed(1)}}`;
      if (ev.t === 'kick') {
        kicks++;
        if (kicks > 1) return;
        const path = predictPath(e.state.ball, e.env, 3, 2);
        const hit = crossPlane(path, HL);
        info += ` kick v=${ev.speed} shot=${ev.shot} hit=${hit ? `${hit.y.toFixed(2)},${hit.z.toFixed(2)} t=${hit.t.toFixed(2)}` : 'none'} gk=${gk.st.pos.y.toFixed(2)} read=${gk.keeper!.spinRead.toFixed(2)}`;
      }
      if (ev.t === 'save') info += ` SAVE held=${ev.held} gk=${gk.st.pos.x.toFixed(1)},${gk.st.pos.y.toFixed(2)} ball=${e.state.ball.pos.x.toFixed(1)},${e.state.ball.pos.y.toFixed(2)},${e.state.ball.pos.z.toFixed(2)} t=${e.state.time.toFixed(2)} diveT=${gk.keeper!.diveT.toFixed(2)}`;
    });
    let lastMode = '';
    for (let f = 0; f < 20 * 60 && !e.isFinished(); f++) {
      botStep(e, bot); e.step(1 / 60);
      const km = gk.keeper!;
      const m = km.mode + (km.react > 0 ? '(r)' : ''); if (kicks === 1 && m !== lastMode) { info += ` [${m}@${e.state.time.toFixed(2)} y=${gk.st.pos.y.toFixed(2)} aim=${km.aim ? km.aim.y.toFixed(2) + ',' + km.aim.z.toFixed(2) + ' T' + km.aimT.toFixed(2) : '-'} fl=${km.flight.toFixed(2)}]`; lastMode = m; }
    }
    lines.push(`seed ${seed} d=${d.toFixed(1)} y=${y.toFixed(1)} -> ${e.result().outcome} kicks=${kicks}${info}`);
  }
  require('fs').writeFileSync('/private/tmp/claude-501/-Users-oknkeles-Nss/8f0f2e16-af2c-429b-9382-41f931f3d1a0/scratchpad/dbg.txt', lines.join('\n'));
}, 60000);
