import { it } from 'vitest';
import { boxShots, penalties, freeKicks, lastSplit } from './balance-harness';
it('tune', () => {
  const out: Record<string, unknown> = {};
  out.corner = boxShots(150, 'corner'); out.cornerSplit = { ...lastSplit };
  out.centre = boxShots(120, 'centre'); out.centreSplit = { ...lastSplit };
  out.pens = penalties(150); out.penSplit = { ...lastSplit };
  out.fk = freeKicks(100);
  require('fs').writeFileSync('/private/tmp/claude-501/-Users-oknkeles-Nss/8f0f2e16-af2c-429b-9382-41f931f3d1a0/scratchpad/tune.txt', JSON.stringify(out));
}, 200000);
