/** Hub panels about the player: card, relationships, quick actions, season stats, goals. */
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, ChevronRight, Minus } from 'lucide-react';
import type { AttrKey, GameState, MomentType, RelKey } from '../../../../core/types';
import { t } from '../../../../core/i18n';
import { overall, stars } from '../../../../core/ratings';
import { round1 } from '../../../../core/util';
import { REL_KEYS } from '../../../../career/api';
import type { Agenda } from '../../../../game/api';
import Avatar from '../../../components/Avatar';
import { Badge, Button, Card, CountUp, Icon, Meter, StatTile, Stars, clsx } from '../../../components/kit';
import { navigate } from '../../../router';
import { DEFAULT_KIT, money, posName, userView } from '../helpers';

export function PlayerCard({ state }: { state: GameState }) {
  const v = userView(state);
  if (!v) return null;
  const { player, club } = v;
  const ovr = overall(player);
  const age = state.season - player.birthYear;
  const form = player.form;
  const FormIcon = form >= 58 ? ArrowUp : form <= 42 ? ArrowDown : Minus;
  const formTone = form >= 58 ? 'text-accent' : form <= 42 ? 'text-danger' : 'text-gold';
  const xp = (Object.entries(state.career.xp) as [AttrKey, number][])
    .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const c = player.contract;

  return (
    <Card className="relative overflow-hidden" glow="accent">
      <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full blur-3xl opacity-25" style={{ background: club?.kit.primary ?? '#b8ff3c' }} />
      <div className="relative flex gap-4">
        <button onClick={() => navigate('career')} className="shrink-0 cursor-pointer">
          <Avatar appearance={player.appearance} kit={club?.kit ?? DEFAULT_KIT} size={96} mood={player.morale >= 60 ? 'happy' : player.morale < 35 ? 'sad' : 'neutral'} ring="accent" blink />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-display text-3xl leading-none truncate">{player.nickname || player.lastName}</div>
          <div className="text-xs text-ink-dim mt-1 truncate">{player.firstName} {player.lastName}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">{posName(player.position)}</Badge>
            <Badge>{age} {t('common.age').toLowerCase()}</Badge>
            {player.injury && <Badge tone="danger"><Icon name="hospital" size={11} />{t('shell.hub.injured', { n: player.injury.weeksLeft })}</Badge>}
          </div>
          <div className="mt-2 flex items-center gap-2"><Stars value={stars(ovr)} size={13} /><span className={clsx('flex items-center gap-0.5 text-xs font-bold', formTone)}><FormIcon size={13} />{form >= 58 ? t('shell.hub.formUp') : form <= 42 ? t('shell.hub.formDown') : t('shell.hub.formFlat')}</span></div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display text-6xl leading-[0.85] text-accent neon-text"><CountUp value={ovr} /></div>
          <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-ink-mute">{t('common.overall')}</div>
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-2.5">
        <Meter label={t('common.morale')} value={player.morale} icon="smile" size="sm" />
        <Meter label={t('common.energy')} value={state.career.energy} icon="zap" size="sm" />
        <Meter label={t('common.fitness')} value={player.fitness} icon="heart_pulse" size="sm" />
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-white/4 px-3 py-2"><div className="text-[10px] uppercase tracking-wider text-ink-mute font-bold">{t('common.value')}</div><div className="font-display text-2xl text-gold leading-tight">{money(player.value)}</div></div>
        <div className="rounded-xl bg-white/4 px-3 py-2"><div className="text-[10px] uppercase tracking-wider text-ink-mute font-bold">{t('common.contract')}</div>
          {c ? <div className="font-semibold leading-tight">{t(`common.role.${c.role}`)} <span className="text-ink-dim font-normal">· {money(c.wage)}{t('common.perWeek')}</span></div> : <div className="text-ink-dim">{t('shell.hub.noContract')}</div>}
          {c && <div className="text-[11px] text-ink-mute">{t('shell.hub.contractUntil', { y: c.endSeason })}</div>}
        </div>
      </div>

      {xp.length > 0 && (
        <div className="relative mt-4">
          <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-ink-mute mb-2 flex items-center gap-1.5"><Icon name="trend_up" size={12} className="text-accent" />{t('shell.hub.xp')}</div>
          <div className="grid grid-cols-1 gap-1.5">
            {xp.map(([k, n]) => (
              <div key={k} className="flex items-center gap-2.5 text-xs">
                <span className="w-24 truncate text-ink-dim">{t(`common.attr.${k}`)}</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden"><motion.div className={clsx('h-full rounded-full', n >= 80 ? 'bg-gold' : 'bg-accent')} initial={{ width: 0 }} animate={{ width: `${Math.min(100, n)}%` }} /></div>
                <span className={clsx('w-9 text-right font-bold tabular-nums', n >= 80 ? 'text-gold' : 'text-ink-dim')}>{Math.round(n)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export function RelationsPanel({ state }: { state: GameState }) {
  return (
    <Card title={t('shell.hub.rel')} icon="heart" action={<button onClick={() => navigate('people')} className="text-xs text-ink-dim hover:text-accent flex items-center cursor-pointer">{t('shell.nav.people')}<ChevronRight size={14} /></button>}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {REL_KEYS.map((k: RelKey) => <Meter key={k} label={t(`common.rel.${k}`)} value={state.career.relationships[k]} size="sm" />)}
      </div>
    </Card>
  );
}

const DRILLS: { type: MomentType; key: string; icon: string }[] = [
  { type: 'drill_free_kick', key: 'freekick', icon: 'target' },
  { type: 'drill_finishing', key: 'finishing', icon: 'crosshair' },
  { type: 'drill_passing', key: 'passing', icon: 'footprints' },
];

export function QuickActions({ state, agenda }: { state: GameState; agenda: Agenda }) {
  const left = state.career.actionsLeft;
  const max = Math.max(3, left);
  const items: { icon: string; label: string; on: () => void; badge?: boolean }[] = [
    { icon: 'dumbbell', label: t('shell.nav.training'), on: () => navigate('training') },
    { icon: 'gem', label: t('shell.nav.lifestyle'), on: () => navigate('lifestyle') },
    { icon: 'briefcase', label: t('shell.hub.agent'), on: () => navigate('people', { talk: 'agent' }) },
    { icon: 'mic', label: t('shell.hub.press'), on: () => navigate('press', agenda.pressAvailable ? { occasion: agenda.pressAvailable } : {}), badge: !!agenda.pressAvailable },
  ];
  return (
    <Card title={t('shell.hub.qa')} icon="zap" action={
      <div className="flex items-center gap-1.5 text-xs text-ink-dim" title={t('shell.hub.actions', { n: left, max })}>
        {Array.from({ length: max }, (_, i) => <span key={i} className={clsx('size-2.5 rounded-full', i < left ? 'bg-accent shadow-[0_0_8px_rgba(184,255,60,0.8)]' : 'bg-white/12')} />)}
        <span className="ml-1 font-semibold">{left}/{max}</span>
      </div>
    }>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <button key={it.icon} onClick={it.on} className="relative flex items-center gap-2.5 rounded-xl bg-white/5 hover:bg-white/9 border border-line hover:border-accent/40 px-3 min-h-12 py-1.5 text-[13px] leading-tight font-semibold cursor-pointer transition-colors text-left">
            <Icon name={it.icon} size={17} className="text-accent shrink-0" /><span className="line-clamp-2">{it.label}</span>
            {it.badge && <span className="absolute top-1.5 right-2 size-2 rounded-full bg-danger animate-nss-pulse" />}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-ink-mute mb-1.5">{t('shell.hub.drills')}</div>
        <div className="flex flex-wrap gap-1.5">
          {DRILLS.map((d) => (
            <Button key={d.type} size="sm" variant="secondary" icon={d.icon} onClick={() => navigate('drill', { type: d.type })}>{t(`shell.hub.drill.${d.key}`)}</Button>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function SeasonStrip({ state }: { state: GameState }) {
  const v = userView(state);
  if (!v) return null;
  const s = v.player.season;
  const avg = s.apps ? round1(s.ratingSum / s.apps) : 0;
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-ink-dim mb-2 flex items-center gap-2"><Icon name="chart" size={14} className="text-accent" />{t('shell.hub.season')}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label={t('common.apps')} value={s.apps} sub={`${s.starts} ${t('shell.hub.starts')}`} icon="shirt" tone="info" />
        <StatTile label={t('common.goals')} value={s.goals} icon="target" />
        <StatTile label={t('common.assists')} value={s.assists} icon="handshake" tone="violet" />
        <StatTile label={t('shell.hub.avgRating')} value={s.apps ? avg.toFixed(1) : '–'} sub={s.motm ? `${s.motm}× ${t('shell.hub.motm')}` : undefined} icon="star" tone="gold" />
      </div>
    </div>
  );
}

export function GoalsPanel({ state }: { state: GameState }) {
  const goals = state.career.genesis.goals;
  if (!goals.length) return null;
  const done = goals.filter((g) => g.done).length;
  return (
    <Card title={t('shell.hub.goals')} icon="target" action={<span className="text-xs font-bold text-accent">{t('shell.hub.goalsDone', { done, total: goals.length })}</span>}>
      <Meter value={done} max={goals.length} tone="accent" showValue={false} size="sm" />
      <ul className="mt-3 grid gap-2">
        {goals.map((g) => (
          <li key={g.id} className={clsx('flex items-start gap-2.5 text-sm', g.done ? 'text-ink-dim' : 'text-ink')}>
            <span className={clsx('mt-0.5 grid place-items-center size-5 rounded-full border shrink-0', g.done ? 'bg-accent border-accent text-bg' : 'border-line')}>{g.done && <Icon name="check" size={12} />}</span>
            <span className={clsx(g.done && 'line-through decoration-ink-mute/60')}>{g.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
