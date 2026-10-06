import type { CountryCode, LeagueDef } from '../core/types';

const def = (
  country: CountryCode, tier: 1 | 2, name: string, teams: number, strength: number, continentalSpots: number,
): LeagueDef => ({
  id: `${country}-${tier}`, country, tier, name, teams,
  promote: tier === 2 ? 3 : 0, relegate: tier === 1 ? 3 : 0, continentalSpots, strength,
});

/** 16 leagues: tier 1 and tier 2 for each of the 8 countries (fictionalised, brand-free names). */
export const LEAGUES: LeagueDef[] = [
  def('ENG', 1, 'Premier Division', 20, 92, 4), def('ENG', 2, 'First Division', 16, 70, 0),
  def('ESP', 1, 'Primera División', 20, 90, 4), def('ESP', 2, 'Segunda División', 16, 68, 0),
  def('ITA', 1, 'Campionato Italiano', 20, 87, 4), def('ITA', 2, 'Serie Cadetta', 16, 65, 0),
  def('GER', 1, 'Deutsche Liga', 18, 87, 4), def('GER', 2, 'Zweite Liga', 16, 65, 0),
  def('FRA', 1, 'Championnat de France', 18, 82, 3), def('FRA', 2, 'Division 2', 16, 60, 0),
  def('POR', 1, 'Liga Portuguesa', 18, 76, 3), def('POR', 2, 'Segunda Divisão', 16, 54, 0),
  def('NED', 1, 'Nederlandse Divisie', 18, 75, 3), def('NED', 2, 'Eerste Divisie', 16, 53, 0),
  def('TUR', 1, 'Süper Lig', 18, 72, 3), def('TUR', 2, '1. Lig', 16, 50, 0),
];

export const COUNTRIES: CountryCode[] = ['ENG', 'ESP', 'ITA', 'GER', 'FRA', 'POR', 'NED', 'TUR'];

export function getLeague(country: CountryCode, tier: 1 | 2): LeagueDef {
  const l = LEAGUES.find((x) => x.country === country && x.tier === tier);
  if (!l) throw new Error(`world: unknown league ${country}-${tier}`);
  return l;
}
