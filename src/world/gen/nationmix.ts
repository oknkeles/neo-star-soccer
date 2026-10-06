import type { CountryCode, NationCode } from '../../core/types';
import type { Rng } from '../../core/rng';
import { NATIONS, getNation } from '../nations';

/** Historic / geographic recruiting ties: multiplier on a nation's weight as a source of foreign players. */
const AFFINITY: Record<CountryCode, Record<string, number>> = {
  ENG: { SCO: 3, WAL: 3, IRL: 3.5, FRA: 2, BRA: 2, NGA: 2, GHA: 2, SEN: 1.5, USA: 1.3, NED: 1.5, ESP: 1.5, GER: 1.3, BEL: 1.5, DEN: 1.5, NOR: 1.5, ARG: 1.4, CIV: 1.4 },
  ESP: { ARG: 4, URU: 3, COL: 2.5, BRA: 1.8, FRA: 1.5, POR: 2, MEX: 1.5, ECU: 1.5, CRO: 1.2, MAR: 1.4, CHI: 1.8 },
  ITA: { ARG: 3, URU: 2, BRA: 1.5, CRO: 2, SRB: 2, SVN: 2, SUI: 1.5, FRA: 1.5, NGA: 1.5, SEN: 1.5, ALB: 2 },
  GER: { POL: 3, TUR: 2.5, SUI: 2, AUT: 3, DEN: 2, CRO: 2, SRB: 2, USA: 2, JPN: 2.5, KOR: 2, CZE: 2, FRA: 1.5, GHA: 1.5 },
  FRA: { SEN: 4, CIV: 4, CMR: 4, MAR: 3, ALG: 3.5, MLI: 4, TUN: 2.5, BEL: 2, BRA: 1.5, ARG: 1.2, POR: 1.2 },
  POR: { BRA: 6, ARG: 2, URU: 2, COL: 2, FRA: 1.2, SEN: 1.5, CIV: 1.3, MLI: 1.2, NGA: 1.2, MAR: 1.5, ESP: 1.2, SRB: 1.2 },
  NED: { BEL: 3, GER: 1.5, DEN: 2, NOR: 2, SWE: 2, MAR: 2.5, GHA: 2, NGA: 1.5, BRA: 1.5, ARG: 1.2, USA: 2, JPN: 2.5, AUS: 2, SRB: 1.5, CRO: 1.5, POL: 1.5, URU: 1.5, TUR: 1.5 },
  TUR: { BRA: 2.5, ARG: 2, SEN: 2.5, NGA: 2.5, CIV: 2, GHA: 1.5, CMR: 2, SRB: 3, CRO: 2, GRE: 2, UKR: 2, POL: 2, GER: 1.5, FRA: 1.5, MAR: 1.5, ALG: 1.5, URU: 2, COL: 1.5, DEN: 1.5, SWE: 1.5, SUI: 1.5, SVN: 1.5, CZE: 1.5 },
};

interface Pick { code: NationCode; w: number }
const cache = new Map<string, Pick[]>();

function foreignTable(country: CountryCode): Pick[] {
  const key = `${country}:${NATIONS.length}`;
  let t = cache.get(key);
  if (!t) {
    const aff = AFFINITY[country] ?? {};
    t = NATIONS.filter((n) => n.code !== country).map((n) => ({
      code: n.code, w: (Math.pow(Math.max(10, n.reputation) / 100, 3.5) * 100) * (aff[n.code] ?? 1),
    }));
    cache.set(key, t);
  }
  return t;
}

/** A foreign nation to source a player from, weighted by football strength and historic ties. */
export function pickForeignNation(rng: Rng, country: CountryCode): NationCode {
  const t = foreignTable(country);
  return t.length ? rng.weighted(t, (x) => x.w).code : country;
}

/** How much better (+) or worse (−) a player from this nation is, from the nation's football strength. */
export const nationQualityAdj = (nation: NationCode): number =>
  Math.max(-5, Math.min(5, (getNation(nation).reputation - 78) * 0.3));

const meanCache = new Map<string, number>();

/** Expected `nationQualityAdj` of a foreign import into a country (keeps league means calibrated). */
export function foreignAdjMean(country: CountryCode): number {
  const key = `${country}:${NATIONS.length}`;
  let m = meanCache.get(key);
  if (m === undefined) {
    const t = foreignTable(country);
    const total = t.reduce((a, x) => a + x.w, 0);
    m = total > 0 ? t.reduce((a, x) => a + x.w * nationQualityAdj(x.code), 0) / total : 0;
    meanCache.set(key, m);
  }
  return m;
}
