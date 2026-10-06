/** Helpers shared by the narrator generators: country/culture of a context, common slots, invented people. */
import type { NarrativeContext } from '../core/narrative-types';
import type { Lang } from '../core/types';
import { countryOfLeagueName, nationCodeFromName } from './safe';
import { cultureOf, fullPersonName, type Culture } from './names';
import { rngFrom, type Slots } from './grammar';

/** Country whose media covers this career (club league first, then nation, then language). */
export function ctxCountry(ctx: NarrativeContext): string {
  const byLeague = ctx.club ? countryOfLeagueName(ctx.club.league) : null;
  if (byLeague) return byLeague;
  const byNation = nationCodeFromName(ctx.player.nation);
  if (byNation) return byNation;
  return ctx.lang === 'tr' ? 'TUR' : 'ENG';
}

export function ctxCulture(ctx: NarrativeContext): Culture {
  return cultureOf(ctxCountry(ctx));
}

export const langOf = (ctx: { lang: Lang }): Lang => (ctx.lang === 'en' ? 'en' : 'tr');

/** A stable invented pundit / journalist for this career and a role label. */
export function inventedPerson(ctx: NarrativeContext, role: string, salt: string | number = ''): string {
  const r = rngFrom('person', role, salt, ctx.player.name);
  return fullPersonName(r, ctxCulture(ctx));
}

export function ctxSlots(ctx: NarrativeContext): Slots {
  const tr = ctx.lang === 'tr';
  const last = ctx.player.name.split(/\s+/).slice(-1)[0] ?? ctx.player.name;
  return {
    player: ctx.player.name,
    first: ctx.player.nickname ?? ctx.player.name.split(/\s+/)[0],
    last,
    club: ctx.club?.name || (tr ? 'kulübü' : 'his club'),
    city: ctx.club?.city || ctx.hometown,
    league: ctx.club?.league ?? '',
    manager: ctx.club?.managerName || (tr ? 'teknik direktör' : 'the manager'),
    rival: ctx.rival?.name ?? (tr ? 'rakibi' : 'his rival'),
    rivalClub: ctx.rival?.club ?? '',
    mentor: ctx.mentor?.name ?? '',
    partner: ctx.partner?.name ?? '',
    agent: ctx.agent?.name ?? (tr ? 'menajeri' : 'his agent'),
    hometown: ctx.hometown || (tr ? 'memleketi' : 'his hometown'),
    nation: ctx.player.nation,
    pos: ctx.player.position,
    goals: ctx.seasonStats.goals,
    assists: ctx.seasonStats.assists,
    apps: ctx.seasonStats.apps,
    pundit: inventedPerson(ctx, 'pundit', ctx.week),
    reporter: inventedPerson(ctx, 'reporter', ctx.week),
  };
}

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
export const words = (s: string, n: number) => s.trim().split(/\s+/).slice(0, n).join(' ');
