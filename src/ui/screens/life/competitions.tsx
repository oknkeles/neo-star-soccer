/** Competitions screen parts: tables, fixtures, scorers, brackets, groups and the league browser. */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Competition, Fixture, Lang, LeagueDef, TableRow } from '../../../core/types';
import { t } from '../../../core/i18n';
import { fullName } from '../../../core/util';

import { sortedTable, topScorers, weekInfo } from '../../../competition/api';
import { navigate } from '../../router';
import { Badge, Card, Crest, EmptyState, Icon, Tabs, clsx } from '../../components/kit';
import { Chip, Flag, SectionLabel, listItem, nationName, safe, teamLabel, type Life } from './shared';
import { bracketColumns, defaultWeek, fixtureWeeks, formLetterClass, groupNames, groupRoundsOf, hasKnockout, money, scorersFromStats, sortRows, tableZone, type Zone, userCompetitions, ZONE_BAR } from './logic';

const KIND_ICON: Record<Competition['kind'], string> = { league: 'trophy', cup: 'medal', continental: 'crown', international: 'globe' };

const stageName = (key: string) => t(`life.comp.stage.${key}`);

export function useUserTeamIds(life: Life): Set<string> {
  const { player, career } = life;
  const ids = new Set<string>();
  if (player.clubId) ids.add(player.clubId);
  if (career.nationalTeamId) ids.add(career.nationalTeamId);
  return ids;
}

// ───────── team chip ─────────

export function TeamMini({ life, id, size = 22, short = false, className }: { life: Life; id: string; size?: number; short?: boolean; className?: string }) {
  const tm = teamLabel(life.state, id, life.lang);
  return (
    <span className={clsx('inline-flex items-center gap-2 min-w-0', className)}>
      <Crest kit={tm.kit} size={size} />
      <span className="truncate">{short ? tm.short : tm.name}</span>
    </span>
  );
}

// ───────── standings ─────────

export function StandingsTable({ life, comp, group = 'main', compact = false, qualify = 0 }: {
  life: Life; comp: Competition; group?: string; compact?: boolean; qualify?: number;
}) {
  const { state, lang } = life;
  const mine = useUserTeamIds(life);
  const nameOf = (id: string) => teamLabel(state, id, lang).name;
  const raw = comp.tables[group] ?? [];
  const rows = useMemo(() => safe(() => sortedTable(comp, group === 'main' ? undefined : group), sortRows(raw, nameOf)), [comp, group, raw]); // eslint-disable-line react-hooks/exhaustive-deps
  const league: LeagueDef | undefined = comp.kind === 'league' && comp.country && comp.tier
    ? state.world.leagues.find((l) => l.country === comp.country && l.tier === comp.tier) : undefined;
  if (!rows.length) return <EmptyState icon="chart" title={t('life.comp.noTable')} />;

  const zoneOf = (pos: number): Zone => (qualify > 0 ? (pos <= qualify ? 'promotion' : 'none') : tableZone(pos, rows.length, league));
  const used = new Set(rows.map((_, i) => zoneOf(i + 1)));
  const goTo = (id: string) => { if (state.world.clubs[id]) navigate('club', { clubId: id }); };

  return (
    <div>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm border-separate border-spacing-y-1 min-w-[300px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-ink-mute">
              <th className="w-6" /><th className="text-left font-bold pl-1">{t('life.comp.col.team')}</th>
              <Th k="played" /><Th k="won" wide /><Th k="drawn" wide /><Th k="lost" wide /><Th k="gf" wide /><Th k="ga" wide /><Th k="gd" />
              <th className="text-right font-bold pr-2" title={t('life.comp.col.pts')}>{t('life.comp.abbr.pts')}</th>
              {!compact && <th className="hidden md:table-cell text-right font-bold pr-2">{t('common.form')}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const z = zoneOf(i + 1);
              const me = mine.has(r.teamId);
              const gd = r.gf - r.ga;
              return (
                <motion.tr
                  key={r.teamId} {...listItem(i)} onClick={() => goTo(r.teamId)}
                  className={clsx('tabular-nums', state.world.clubs[r.teamId] && 'cursor-pointer', me ? 'bg-accent/12' : 'bg-white/[0.035] hover:bg-white/[0.07]')}
                >
                  <td className="relative rounded-l-xl pl-3 pr-1 py-2 text-ink-dim text-xs font-bold">
                    <span className={clsx('absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full', ZONE_BAR[z])} />{i + 1}
                  </td>
                  <td className="py-2 pl-1 pr-2 max-w-[11rem]">
                    <TeamMini life={life} id={r.teamId} size={20} className={clsx(me && 'font-bold text-accent')} />
                  </td>
                  <td className="text-center text-ink-dim">{r.played}</td>
                  <td className="text-center text-ink-dim hidden sm:table-cell">{r.won}</td>
                  <td className="text-center text-ink-dim hidden sm:table-cell">{r.drawn}</td>
                  <td className="text-center text-ink-dim hidden sm:table-cell">{r.lost}</td>
                  <td className="text-center text-ink-dim hidden sm:table-cell">{r.gf}</td>
                  <td className="text-center text-ink-dim hidden sm:table-cell">{r.ga}</td>
                  <td className={clsx('text-center', gd > 0 ? 'text-accent' : gd < 0 ? 'text-danger' : 'text-ink-dim')}>{gd > 0 ? `+${gd}` : gd}</td>
                  <td className={clsx('text-right pr-2 font-display text-xl', compact ? 'rounded-r-xl' : 'rounded-r-xl md:rounded-none')}>{r.points}</td>
                  {!compact && <td className="hidden md:table-cell py-2 pr-2 rounded-r-xl"><FormDots form={r.form} /></td>}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-ink-mute">
          {(['title', 'continental', 'promotion', 'relegation'] as Zone[]).filter((z) => used.has(z)).map((z) => (
            <span key={z} className="flex items-center gap-1.5"><span className={clsx('w-2.5 h-2.5 rounded-sm', ZONE_BAR[z])} />{qualify > 0 && z === 'promotion' ? t('life.comp.zone.qualify') : t(`life.comp.zone.${z}`)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Th({ k, wide }: { k: 'played' | 'won' | 'drawn' | 'lost' | 'gf' | 'ga' | 'gd'; wide?: boolean }) {
  return <th title={t(`life.comp.col.${k}`)} className={clsx('font-bold w-8', wide && 'hidden sm:table-cell')}>{t(`life.comp.abbr.${k}`)}</th>;
}

export function FormDots({ form }: { form: TableRow['form'] }) {
  return (
    <span className="inline-flex gap-1 justify-end w-full">
      {form.slice(-5).map((f, i) => <span key={i} className={clsx('w-4 h-4 rounded-full grid place-items-center text-[8px] font-black', formLetterClass(f))}>{f === 'W' ? 'G' : f === 'D' ? 'B' : 'M'}</span>)}
    </span>
  );
}

// ───────── fixtures ─────────

function weekText(season: number, week: number, lang: Lang): string {
  return safe(() => weekInfo(season, week).label[lang], t('life.comp.weekN', { n: week + 1 }));
}

export function FixtureRow({ life, f, i }: { life: Life; f: Fixture; i: number }) {
  const { state } = life;
  const mine = useUserTeamIds(life);
  const yours = mine.has(f.homeId) || mine.has(f.awayId);
  const [open, setOpen] = useState(false);
  const hasScorers = !!f.scorers?.length;
  const nameOf = (id: string) => { const p = state.world.players[id]; return p ? fullName(p) : id; };
  return (
    <motion.div {...listItem(i)} className={clsx('rounded-2xl border px-3 py-2.5', yours ? 'bg-accent/10 border-accent/30' : 'bg-white/[0.035] border-transparent')}>
      <button className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm cursor-pointer" onClick={() => hasScorers && setOpen((v) => !v)} aria-expanded={open} title={hasScorers ? t('life.comp.expand') : undefined}>
        <TeamMini life={life} id={f.homeId} className={clsx('justify-end flex-row-reverse text-right', f.played && (f.homeGoals ?? 0) > (f.awayGoals ?? 0) && 'font-bold')} />
        <span className="min-w-[64px] text-center">
          {f.played ? (
            <span className="font-display text-2xl leading-none tabular-nums">{f.homeGoals}<span className="text-ink-mute mx-1">–</span>{f.awayGoals}</span>
          ) : (
            <span className="text-xs text-ink-mute font-bold">{t('common.vs')}</span>
          )}
          {f.pens && <div className="text-[10px] text-ink-mute">{t('life.comp.pens', { h: f.pens.home, a: f.pens.away })}</div>}
        </span>
        <TeamMini life={life} id={f.awayId} className={clsx((f.awayGoals ?? 0) > (f.homeGoals ?? 0) && f.played && 'font-bold')} />
      </button>
      {(yours || f.roundName) && (
        <div className="flex items-center justify-center gap-2 mt-1 text-[10px] text-ink-mute">
          {yours && <Chip tone="accent" className="!py-0.5">{t('life.comp.yourMatch')}</Chip>}
          {f.roundName && <span>{f.roundName}</span>}
          {f.slot === 'midweek' && <span>· {t('common.week')}</span>}
        </div>
      )}
      {open && hasScorers && (
        <div className="grid grid-cols-2 gap-3 mt-2 pt-2 border-t border-line/60 text-[11px] text-ink-dim">
          {(['home', 'away'] as const).map((side) => (
            <div key={side} className={clsx(side === 'home' && 'text-right')}>
              {f.scorers!.filter((s) => s.side === side).map((s, k) => <div key={k}>{nameOf(s.playerId)} {s.minute}&apos;</div>)}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export function FixturesPanel({ life, comp }: { life: Life; comp: Competition }) {
  const { state, lang } = life;
  const weeks = useMemo(() => fixtureWeeks(comp, state.season), [comp, state.season]);
  const [week, setWeek] = useState(() => defaultWeek(weeks, state.week));
  useEffect(() => { setWeek(defaultWeek(weeks, state.week)); }, [comp.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!weeks.length) return <EmptyState icon="calendar" title={t('life.comp.noFixtures')} />;
  const idx = Math.max(0, weeks.indexOf(week));
  const list = comp.fixtures.filter((f) => f.week === week).sort((a, b) => Number(b.userInvolved ?? false) - Number(a.userInvolved ?? false) || a.id.localeCompare(b.id));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button disabled={idx <= 0} onClick={() => setWeek(weeks[idx - 1])} aria-label={t('common.back')} className="w-10 h-10 rounded-xl bg-white/6 hover:bg-white/12 grid place-items-center cursor-pointer disabled:opacity-30"><ChevronLeft size={18} /></button>
        <div className="text-center">
          <div className="font-display text-2xl leading-none">{weekText(state.season, week, lang)}</div>
          <button className="text-[11px] text-accent cursor-pointer mt-1" onClick={() => setWeek(defaultWeek(weeks, state.week))}>{week === state.week ? t('life.comp.thisWeek') : `${t('life.comp.thisWeek')} →`}</button>
        </div>
        <button disabled={idx >= weeks.length - 1} onClick={() => setWeek(weeks[idx + 1])} aria-label={t('common.next')} className="w-10 h-10 rounded-xl bg-white/6 hover:bg-white/12 grid place-items-center cursor-pointer disabled:opacity-30"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
        {list.map((f, i) => <FixtureRow key={f.id} life={life} f={f} i={i} />)}
      </div>
    </div>
  );
}

// ───────── scorers ─────────

export function ScorersPanel({ life, comp }: { life: Life; comp: Competition }) {
  const { state } = life;
  const mine = useUserTeamIds(life);
  const rows = safe(() => topScorers(state, comp.id, 12), scorersFromStats(comp, 12));
  if (!rows.length) return <EmptyState icon="target" title={t('life.comp.noScorers')} />;
  const top = rows[0].goals || 1;
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const p = state.world.players[r.playerId];
        const isUser = !!p?.isUser;
        return (
          <motion.div key={r.playerId} {...listItem(i)} className={clsx('relative overflow-hidden rounded-2xl px-3 py-2.5 flex items-center gap-3', isUser ? 'bg-accent/12 ring-1 ring-accent/30' : 'bg-white/[0.035]')}>
            <motion.div className="absolute inset-y-0 left-0 bg-white/[0.04]" initial={{ width: 0 }} animate={{ width: `${(r.goals / top) * 100}%` }} transition={{ type: 'spring', stiffness: 80, damping: 20 }} />
            <span className={clsx('relative w-6 text-center font-display text-xl', i === 0 ? 'text-gold' : 'text-ink-mute')}>{i + 1}</span>
            <div className="relative min-w-0 flex-1">
              <div className={clsx('font-semibold truncate', isUser && 'text-accent')}>{p ? fullName(p) : r.playerId}{isUser && <span className="ml-2 text-[10px] uppercase">{t('life.comp.you')}</span>}</div>
              <TeamMini life={life} id={r.teamId} size={16} className={clsx('text-xs text-ink-dim', mine.has(r.teamId) && 'text-accent')} />
            </div>
            <div className="relative text-right">
              <div className="font-display text-3xl leading-none">{r.goals}</div>
              <div className="text-[10px] text-ink-mute">{r.assists} {t('life.comp.assists')}</div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ───────── knockout ─────────

function TieCard({ life, f }: { life: Life; f: Fixture | null }) {
  const mine = useUserTeamIds(life);
  if (!f) {
    return <div className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-ink-mute w-[190px]">{t('life.comp.tbd')}</div>;
  }
  const yours = mine.has(f.homeId) || mine.has(f.awayId);
  const hw = f.played && ((f.homeGoals ?? 0) > (f.awayGoals ?? 0) || (f.homeGoals === f.awayGoals && (f.pens?.home ?? 0) > (f.pens?.away ?? 0)));
  const aw = f.played && !hw && (f.awayGoals ?? 0) + (f.pens?.away ?? 0) / 100 > (f.homeGoals ?? 0) + (f.pens?.home ?? 0) / 100;
  const line = (id: string, goals: number | undefined, win: boolean, lose: boolean) => (
    <div className={clsx('flex items-center justify-between gap-2 px-2.5 py-1.5', win && 'font-bold', lose && 'opacity-55')}>
      <TeamMini life={life} id={id} size={18} short className={clsx('text-sm', mine.has(id) && 'text-accent')} />
      <span className="font-display text-lg tabular-nums">{f.played ? goals : ''}</span>
    </div>
  );
  return (
    <div className={clsx('rounded-xl border w-[190px] overflow-hidden', yours ? 'border-accent/50 bg-accent/8' : 'border-line bg-white/[0.035]')}>
      {line(f.homeId, f.homeGoals, hw, aw)}
      <div className="h-px bg-line/70" />
      {line(f.awayId, f.awayGoals, aw, hw)}
      {f.pens && <div className="text-center text-[10px] text-ink-mute pb-1">{t('life.comp.pens', { h: f.pens.home, a: f.pens.away })}</div>}
    </div>
  );
}

export function BracketPanel({ life, comp }: { life: Life; comp: Competition }) {
  const cols = useMemo(() => bracketColumns(comp, stageName), [comp]);
  if (!cols.length) return <EmptyState icon="swords" title={t('life.comp.noBracket')} />;
  return (
    <div className="overflow-x-auto pb-3 -mx-4 px-4">
      <div className="flex gap-4 min-w-max items-stretch">
        {cols.map((col, ci) => (
          <motion.div key={col.round} {...listItem(ci)} className="flex flex-col w-[190px]">
            <div className={clsx('text-center text-[11px] font-bold uppercase tracking-[0.14em] mb-2', col.placeholder ? 'text-ink-mute' : 'text-accent')}>{col.name}</div>
            <div className="flex flex-col justify-around gap-3 flex-1">
              {col.fixtures.map((f, i) => <TieCard key={f?.id ?? `p${i}`} life={life} f={f} />)}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function GroupsPanel({ life, comp }: { life: Life; comp: Competition }) {
  const mine = useUserTeamIds(life);
  const groups = groupNames(comp);
  const sorted = [...groups].sort((a, b) => Number(!(comp.tables[a] ?? []).some((r) => mine.has(r.teamId))) - Number(!(comp.tables[b] ?? []).some((r) => mine.has(r.teamId))) || a.localeCompare(b));
  if (!groups.length) return <EmptyState icon="globe" title={t('life.comp.noTable')} />;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {sorted.map((g, i) => {
        const has = (comp.tables[g] ?? []).some((r) => mine.has(r.teamId));
        return (
          <motion.div key={g} {...listItem(i)}>
            <Card title={t('life.comp.group', { g })} icon="users" glow={has ? 'accent' : undefined} action={<span className="text-[10px] text-ink-mute flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-accent" />{t('life.comp.top2')}</span>}>
              <StandingsTable life={life} comp={comp} group={g} compact qualify={2} />
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

// ───────── one competition ─────────

export function CompetitionHeader({ life, comp }: { life: Life; comp: Competition }) {
  const { lang } = life;
  const winner = comp.winnerId ? teamLabel(life.state, comp.winnerId, lang) : null;
  const done = comp.stage === 'done';
  const stageLabel = (['group', 'league', 'friendlies', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'] as const).includes(comp.stage as never) ? stageName(comp.stage) : comp.stage;
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute -right-3 -top-6 text-accent/[0.07] pointer-events-none"><Icon name={KIND_ICON[comp.kind]} size={140} /></div>
      <div className="relative flex items-center gap-3 flex-wrap">
        <span className="w-12 h-12 rounded-2xl bg-accent/12 text-accent grid place-items-center shrink-0"><Icon name={KIND_ICON[comp.kind]} size={24} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-3xl leading-none truncate">{comp.name}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <Badge>{t(`life.comp.kind.${comp.kind}`)}</Badge>
            {comp.country && <span className="flex items-center gap-1 text-xs text-ink-dim"><Flag code={comp.country} />{nationName(comp.country, lang)}</span>}
            {comp.tier && <Chip>{t('life.comp.tier', { n: comp.tier })}</Chip>}
            <Chip icon="calendar">{done ? t('life.comp.stageDone') : `${t('life.comp.stageNow')}: ${stageLabel}`}</Chip>
            {comp.prizeMoney > 0 && <Chip icon="coin" tone="gold">{money(comp.prizeMoney, lang)}</Chip>}
          </div>
        </div>
        {winner && (
          <div className="flex items-center gap-2 rounded-2xl bg-gold/10 px-3 py-2">
            <Crest kit={winner.kit} size={30} />
            <div><div className="text-[10px] uppercase tracking-wider text-gold font-bold">{t('life.comp.winner')}</div><div className="text-sm font-semibold">{winner.name}</div></div>
          </div>
        )}
      </div>
    </Card>
  );
}

export function CompetitionView({ life, comp }: { life: Life; comp: Competition }) {
  const koAvail = hasKnockout(comp);
  const hasGroups = groupRoundsOf(comp) > 0;
  const tabs = useMemo(() => {
    const out: { id: string; label: string; icon: string }[] = [];
    if (comp.kind === 'league') out.push({ id: 'table', label: t('life.comp.tab.table'), icon: 'chart' });
    if (hasGroups) out.push({ id: 'groups', label: t('life.comp.tab.groups'), icon: 'users' });
    if (koAvail) out.push({ id: 'bracket', label: t(hasGroups ? 'life.comp.tab.knockout' : 'life.comp.tab.bracket'), icon: 'swords' });
    out.push({ id: 'fixtures', label: t('life.comp.tab.fixtures'), icon: 'calendar' });
    if (comp.kind !== 'international' || Object.keys(comp.playerStats ?? {}).length) out.push({ id: 'scorers', label: t('life.comp.tab.scorers'), icon: 'target' });
    return out;
  }, [comp.kind, comp.playerStats, hasGroups, koAvail]);
  const [tab, setTab] = useState(tabs[0]?.id ?? 'fixtures');
  const active = tabs.some((x) => x.id === tab) ? tab : tabs[0]?.id;
  return (
    <div className="space-y-4">
      <CompetitionHeader life={life} comp={comp} />
      <Tabs tabs={tabs} value={active} onChange={setTab} />
      <div key={`${comp.id}-${active}`}>
        {active === 'table' && <Card><StandingsTable life={life} comp={comp} /></Card>}
        {active === 'groups' && <GroupsPanel life={life} comp={comp} />}
        {active === 'bracket' && <Card><BracketPanel life={life} comp={comp} /></Card>}
        {active === 'fixtures' && <Card><FixturesPanel life={life} comp={comp} /></Card>}
        {active === 'scorers' && <Card><ScorersPanel life={life} comp={comp} /></Card>}
      </div>
    </div>
  );
}

// ───────── league browser ─────────

export function LeagueBrowser({ life }: { life: Life }) {
  const { state, lang } = life;
  const mine = userCompetitions(state).find((c) => c.kind === 'league');
  const leagues = Object.values(state.competitions).filter((c) => c.kind === 'league');
  const countries = useMemo(() => {
    const set = [...new Set(leagues.map((c) => c.country!).filter(Boolean))];
    return set.sort((a, b) => (a === mine?.country ? -1 : b === mine?.country ? 1 : a.localeCompare(b)));
  }, [leagues.length, mine?.country]); // eslint-disable-line react-hooks/exhaustive-deps
  const [country, setCountry] = useState(mine?.country ?? countries[0]);
  const [tier, setTier] = useState<1 | 2>(mine?.tier ?? 1);
  const comp = leagues.find((c) => c.country === country && c.tier === tier) ?? leagues.find((c) => c.country === country);
  if (!leagues.length) return <EmptyState icon="globe" title={t('life.comp.unavailable')} />;
  return (
    <div className="space-y-4">
      <div>
        <SectionLabel icon="globe">{t('life.comp.pickLeague')}</SectionLabel>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {countries.map((c) => (
            <button key={c} onClick={() => setCountry(c)} className={clsx('rounded-2xl border py-2.5 flex flex-col items-center gap-1 cursor-pointer transition', country === c ? 'bg-accent/12 border-accent/60' : 'bg-white/[0.035] border-line hover:border-accent/30')}>
              <span className="text-2xl leading-none"><Flag code={c} /></span>
              <span className="text-[10px] text-ink-dim truncate max-w-full px-1">{nationName(c, lang)}</span>
            </button>
          ))}
        </div>
      </div>
      <Tabs tabs={[{ id: '1', label: t('life.comp.tier', { n: 1 }) }, { id: '2', label: t('life.comp.tier', { n: 2 }) }]} value={String(tier)} onChange={(v) => setTier(v === '2' ? 2 : 1)} />
      {comp ? <CompetitionView key={comp.id} life={life} comp={comp} /> : <EmptyState icon="trophy" title={t('life.comp.unavailable')} />}
    </div>
  );
}
