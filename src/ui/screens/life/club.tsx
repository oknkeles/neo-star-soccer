/** Club screen parts: hero, manager, squad table, derbies and honours. */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Club, Footballer, Manager } from '../../../core/types';
import { t } from '../../../core/i18n';
import { overall } from '../../../core/ratings';
import { age as ageOf, fullName } from '../../../core/util';

import { leagueOf, sortedTable } from '../../../competition/api';
import { positionName } from '../../../world/api';
import { Badge, Button, Card, CountUp, Crest, Icon, Meter, Stars, StatTile, clsx } from '../../components/kit';
import { navigate } from '../../router';
import { Chip, Flag, Initials, PlayerFace, listItem, nationName, safe, type Life } from './shared';
import { clubHonours, formTone, GROUP_ORDER, groupSquad, money, repStars, squadSummary, trophyStyle } from './logic';
import { TROPHY_TONE } from './career';

// ───────── hero ─────────

export function ClubHero({ life, club }: { life: Life; club: Club }) {
  const { state, lang } = life;
  const league = safe(() => leagueOf(state, club.id), null);
  const table = league ? safe(() => sortedTable(league), []) : [];
  const idx = table.findIndex((r) => r.teamId === club.id);
  const row = idx >= 0 ? table[idx] : null;
  const country = club.country;
  return (
    <Card padded={false} className="relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-70 pointer-events-none"
        style={{ background: `radial-gradient(120% 90% at 0% 0%, ${club.kit.primary}55, transparent 60%), radial-gradient(80% 80% at 100% 100%, ${club.kit.secondary}22, transparent 65%)` }}
      />
      <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: `linear-gradient(${club.kit.primary}, ${club.kit.secondary})` }} />
      <div className="relative p-4 sm:p-5">
        <div className="flex items-center gap-x-4 gap-y-4 flex-wrap">
          <motion.div initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }}>
            <Crest kit={club.kit} label={club.shortName} size={84} />
          </motion.div>
          <div className="min-w-0 flex-1 basis-40">
            <div className="font-display text-4xl sm:text-5xl leading-[0.95] break-words">{club.name}</div>
            <div className="text-sm text-ink-dim italic mt-1">“{club.nickname}”</div>
          </div>
          <div className="w-full sm:w-auto flex items-baseline sm:flex-col sm:items-end gap-x-3 gap-y-0.5 flex-wrap rounded-2xl bg-bg/40 border border-line px-3.5 py-2.5 sm:bg-transparent sm:border-0 sm:p-0">
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-mute font-bold">{t('life.club.rank')}</div>
            {row ? (
              <>
                <div className="font-display text-5xl sm:text-6xl leading-[0.9] text-accent neon-text"><CountUp value={idx + 1} />{lang === 'tr' ? '.' : ''}</div>
                <div className="text-xs text-ink-dim sm:mt-1">{t('life.club.points', { n: row.points })} · {t('life.club.record', { w: row.won, d: row.drawn, l: row.lost })}</div>
              </>
            ) : (
              <div className="text-sm text-ink-dim">{t('life.club.noTable')}</div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-3.5">
          <Chip icon="flag"><Flag code={country} className="mr-0.5" />{club.city} · {nationName(country, lang)}</Chip>
          <Chip icon="calendar">{t('life.club.founded', { y: club.founded })}</Chip>
          <Chip icon="building">{club.stadium.name} · {t('life.club.capacity', { n: club.stadium.capacity.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB') })}</Chip>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <div className="rounded-2xl bg-bg/40 border border-line p-3">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-ink-mute font-bold mb-1.5">
              {t('life.club.reputation')}<Stars value={repStars(club.reputation)} size={13} />
            </div>
            <Meter value={club.reputation} tone="gold" size="sm" />
          </div>
          <div className="rounded-2xl bg-bg/40 border border-line p-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-ink-mute font-bold mb-1.5">{t('life.club.facilities')}</div>
            <Meter value={club.facilities} tone="accent" size="sm" />
          </div>
          <div className="rounded-2xl bg-bg/40 border border-line p-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-ink-mute font-bold mb-1.5">{t('life.club.youth')}</div>
            <Meter value={club.youth} tone="info" size="sm" />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3.5">
          <Chip icon="target" tone="accent">{t('life.club.formation')}: {club.formation}</Chip>
          <Chip icon="zap" tone="violet">{t('life.club.style')}: {t(`life.style.${club.style}`)}</Chip>
          <Chip icon="coin" tone="gold">{t('life.club.budget')}: {money(club.budget, lang)}</Chip>
          <Chip icon="wallet" tone="gold">{t('life.club.wageBudget')}: {money(club.wageBudget, lang)}</Chip>
        </div>
      </div>
    </Card>
  );
}

// ───────── manager ─────────

export function ManagerCard({ life, club, mine }: { life: Life; club: Club; mine: boolean }) {
  const { state, lang, career } = life;
  const mgr: Manager | undefined = state.world.managers[club.managerId];
  if (!mgr) return null;
  const name = `${mgr.firstName} ${mgr.lastName}`;
  return (
    <Card title={t('life.club.manager')} icon="briefcase" className="h-full">
      <div className="flex items-center gap-3">
        <Initials name={name} size={58} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-2xl leading-none truncate">{name}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <Flag code={mgr.nation} className="text-base" />
            <span className="text-xs text-ink-dim">{nationName(mgr.nation, lang)} · {t('life.club.managerAge', { n: state.season - mgr.birthYear })}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        <Badge tone="info">{t(`life.temper.${mgr.temperament}`)}</Badge>
        <Chip icon="zap" tone="violet">{t(`life.style.${mgr.style}`)}</Chip>
      </div>
      <p className="text-sm text-ink-dim leading-snug mt-3">{t(`life.club.temper.${mgr.temperament}`)}</p>
      <div className="grid gap-2.5 mt-4">
        <Labelled label={t('life.club.managerTrust')}><Meter value={mgr.trustsYouth} tone="accent" size="sm" /></Labelled>
        <Labelled label={t('life.club.managerRep')}><Meter value={mgr.reputation} tone="gold" size="sm" /></Labelled>
        {mine && <Labelled label={t('life.club.managerRel')}><Meter value={career.relationships.manager} tone="auto" size="sm" /></Labelled>}
      </div>
      {mine && !career.retired && (
        <Button className="mt-4" size="sm" variant="secondary" icon="message" block onClick={() => navigate('people', { chat: 'manager' })}>{t('life.people.message')}</Button>
      )}
    </Card>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-ink-mute mb-1">{label}</div>
      {children}
    </div>
  );
}

// ───────── squad ─────────

export function SquadSummaryRow({ life, players }: { life: Life; players: Footballer[] }) {
  const s = useMemo(() => squadSummary(players, overall, life.state.season), [players, life.state.season]);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatTile icon="users" label={t('life.club.squad')} value={s.size} sub={s.injured ? `${s.injured} ${t('life.club.injured').toLowerCase()}` : t('life.club.squadSize', { n: s.size })} />
      <StatTile icon="star" label={t('life.club.avgOvr')} value={s.avgOvr} tone="gold" />
      <StatTile icon="calendar" label={t('life.club.avgAge')} value={s.avgAge.toFixed(1)} tone="info" />
      <StatTile icon="coin" label={t('life.club.totalValue')} value={money(s.value, life.lang)} tone="violet" />
    </div>
  );
}

export function SquadTable({ life, club }: { life: Life; club: Club }) {
  const { state, lang } = life;
  const players = useMemo(
    () => club.squad.map((id) => state.world.players[id]).filter((p): p is Footballer => !!p && !p.retired),
    [club.squad, state.world.players],
  );
  const grouped = useMemo(() => groupSquad(players, overall), [players]);
  const ranked = useMemo(() => [...players].sort((a, b) => overall(b) - overall(a)), [players]);
  const userRank = ranked.findIndex((p) => p.id === life.player.id);
  let n = 0;
  return (
    <div className="space-y-4">
      <SquadSummaryRow life={life} players={players} />
      {userRank >= 0 && (
        <div className="flex items-center gap-2 text-sm text-ink-dim">
          <Icon name="user" size={15} className="text-gold" />{t('life.club.yourRank', { n: userRank + 1, total: players.length })}
        </div>
      )}
      <Card padded={false} className="overflow-hidden">
        <div className="grid grid-cols-[2rem_1fr_3rem_2.5rem] sm:grid-cols-[2rem_1fr_3.5rem_3.5rem_5rem] gap-2 sm:gap-3 px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-ink-mute font-bold border-b border-line">
          <span>#</span><span>{t('life.club.col.player')}</span><span className="text-center">{t('life.club.col.ovr')}</span><span className="text-center">{t('life.club.col.form')}</span><span className="hidden sm:block text-right">{t('life.club.col.value')}</span>
        </div>
        {GROUP_ORDER.map((g) => {
          const list = grouped[g];
          if (!list.length) return null;
          return (
            <section key={g}>
              <div className="px-4 py-2 bg-white/[0.035] border-y border-line first:border-t-0 text-[11px] uppercase tracking-[0.14em] text-ink-dim font-bold flex items-center justify-between">
                {t(`life.pos.${g}`)}<span className="text-ink-mute">{list.length}</span>
              </div>
              {list.map((p) => <SquadRow key={p.id} life={life} p={p} i={n++} lang={lang} />)}
            </section>
          );
        })}
      </Card>
    </div>
  );
}

function SquadRow({ life, p, i, lang }: { life: Life; p: Footballer; i: number; lang: Life['lang'] }) {
  const isUser = p.id === life.player.id;
  const ovr = overall(p);
  const hurt = p.injury && p.injury.weeksLeft > 0 ? p.injury.weeksLeft : 0;
  return (
    <motion.div
      {...listItem(i)}
      className={clsx(
        'grid grid-cols-[2rem_1fr_3rem_2.5rem] sm:grid-cols-[2rem_1fr_3.5rem_3.5rem_5rem] gap-2 sm:gap-3 items-center px-4 py-2 border-b border-line/60 last:border-b-0',
        isUser && 'bg-accent/[0.09] shadow-[inset_3px_0_0_var(--color-accent)]',
      )}
    >
      <span className="font-display text-lg text-ink-mute tabular-nums">{p.shirtNumber}</span>
      <div className="flex items-center gap-2.5 min-w-0">
        {isUser ? <PlayerFace p={p} kit={life.state.world.clubs[p.clubId ?? '']?.kit} size={34} ring="gold" /> : <Flag code={p.nation} className="text-xl w-[34px] text-center shrink-0" />}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={clsx('truncate text-sm font-semibold', isUser && 'text-accent')}>{fullName(p)}</span>
            {isUser && <span className="text-[9px] font-bold bg-accent text-bg rounded px-1 py-0.5 leading-none">{t('life.club.you')}</span>}
            {hurt > 0 && <span title={t('life.club.injuredFor', { n: hurt })} className="text-danger shrink-0"><Icon name="heart_pulse" size={13} /></span>}
          </div>
          <div className="text-[11px] text-ink-mute truncate">
            {safe(() => positionName(p.position, true), p.position)} · {t('life.club.age', { n: ageOf(p, life.state.season) })}
            {hurt > 0 && <span className="text-danger"> · {t('life.club.injuredFor', { n: hurt })}</span>}
          </div>
        </div>
      </div>
      <span className="text-center">
        <span className={clsx('inline-grid place-items-center min-w-9 h-7 rounded-lg font-display text-lg tabular-nums', ovr >= 75 ? 'bg-gold text-bg' : ovr >= 65 ? 'bg-accent text-bg' : ovr >= 55 ? 'bg-white/14 text-ink' : 'bg-white/7 text-ink-dim')}>{ovr}</span>
      </span>
      <span className={clsx('text-center text-sm font-semibold tabular-nums', formTone(p.form))}>{Math.round(p.form)}</span>
      <span className="hidden sm:block text-right text-sm text-ink-dim tabular-nums">{money(p.value, lang)}</span>
    </motion.div>
  );
}

// ───────── derbies & honours ─────────

export function DerbyRivals({ life, club }: { life: Life; club: Club }) {
  const { state } = life;
  const rivals = club.derbyRivals.map((id) => state.world.clubs[id]).filter((c): c is Club => !!c);
  return (
    <Card title={t('life.club.derbies')} icon="swords" className="h-full">
      {rivals.length === 0 ? (
        <p className="text-sm text-ink-dim">{t('life.club.noDerbies')}</p>
      ) : (
        <div className="space-y-2">
          {rivals.map((r) => (
            <button
              key={r.id} onClick={() => navigate('club', { club: r.id })} aria-label={`${t('life.club.openClub')}: ${r.name}`}
              className="w-full flex items-center gap-3 rounded-2xl bg-white/4 border border-line hover:border-danger/50 hover:bg-danger/[0.06] p-2.5 text-left cursor-pointer transition"
            >
              <Crest kit={r.kit} label={r.shortName} size={34} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{r.name}</div>
                <div className="text-[11px] text-ink-mute truncate">{r.city} · {r.stadium.name}</div>
              </div>
              <span className="text-[10px] font-bold text-danger bg-danger/12 rounded-md px-1.5 py-1 leading-none">{t('life.club.derbyTag')}</span>
              <Icon name="chevron_right" size={16} className="text-ink-mute" />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

export function HonoursCard({ life, club }: { life: Life; club: Club }) {
  const shelves = useMemo(() => clubHonours(life.state, club.id), [life.state, club.id, life.version]);
  return (
    <Card title={t('life.club.honours')} icon="trophy" className="h-full" glow={shelves.length ? 'gold' : undefined}>
      {shelves.length === 0 ? (
        <p className="text-sm text-ink-dim">{t('life.club.noHonours')}</p>
      ) : (
        <div className="space-y-2.5">
          {shelves.map((s, i) => {
            const st = trophyStyle(s.key);
            return (
              <motion.div key={s.key} {...listItem(i)} className="flex items-center gap-3 rounded-2xl bg-white/4 border border-line p-2.5">
                <span className={clsx('w-11 h-11 rounded-xl grid place-items-center bg-gradient-to-br shrink-0', TROPHY_TONE[st.tone])}><Icon name={st.icon} size={22} /></span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm leading-tight truncate">{s.name}</div>
                  <div className="text-[11px] text-ink-mute leading-tight mt-0.5 truncate">
                    {s.seasons.slice(-5).map((y) => `${String(y).slice(2)}/${String(y + 1).slice(2)}`).join(' · ')}{s.seasons.length > 5 ? ' …' : ''}
                  </div>
                </div>
                <span className="font-display text-2xl text-gold leading-none">{t('life.club.titles', { n: s.seasons.length })}</span>
              </motion.div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
