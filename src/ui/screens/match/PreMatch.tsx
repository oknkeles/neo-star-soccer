import { motion } from 'framer-motion';
import { ArrowLeft, FastForward, MapPin, Play, Thermometer, Users, Wind } from 'lucide-react';
import type { GameState, MatchContext, TeamSheet } from '../../../core/types';
import { t, getLang } from '../../../core/i18n';
import { formatNumber } from '../../../core/util';
import { Badge, Button, Card, Crest, clsx } from '../../components/kit';
import { matchStakes, shirtNumbers, type Stakes } from './helpers';
import { DualStat, PosTag, WeatherGlyph, kitColor } from './parts';

const STAKE_TONE: Record<Stakes, 'gold' | 'danger' | 'violet' | 'info' | 'neutral'> = {
  final: 'gold', derby: 'danger', knockout: 'violet', big: 'info', normal: 'neutral',
};

export function PreMatch({ ctx, state, onStart, onSimulate, onBack, busy }: {
  ctx: MatchContext; state: GameState | null; onStart: () => void; onSimulate: () => void; onBack: () => void; busy?: boolean;
}) {
  const fixture = state?.competitions[ctx.compId]?.fixtures.find((f) => f.id === ctx.fixtureId) ?? null;
  const stakes = matchStakes(ctx, fixture);
  const userId = state?.career.playerId ?? null;
  const lang = getLang();
  const hc = kitColor(ctx.home.kit);
  const ac = kitColor(ctx.away.kit);
  const w = ctx.weather;
  const wind = Math.hypot(w.wind.x, w.wind.y);

  return (
    <div className="min-h-full max-w-3xl mx-auto px-4 pt-4 pb-28">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onBack} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-ink-dim hover:text-ink cursor-pointer" aria-label={t('common.back')}>
          <ArrowLeft size={18} />
        </button>
        <div className="text-xs uppercase tracking-[0.2em] text-ink-dim font-bold">{t('match.pre.title')}</div>
        <div className="w-9" />
      </div>

      {/* hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-line p-4 sm:p-6"
        style={{ background: `radial-gradient(120% 90% at 0% 0%, ${hc}33, transparent 55%), radial-gradient(120% 90% at 100% 0%, ${ac}33, transparent 55%), linear-gradient(180deg, #0f2219, #08110c)` }}
      >
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 opacity-30"
          style={{ background: 'repeating-linear-gradient(90deg, rgba(184,255,60,0.10) 0 28px, rgba(184,255,60,0.04) 28px 56px)' }} />
        <div className="relative flex flex-wrap items-center justify-center gap-2 text-center">
          <span className="text-sm font-semibold text-ink-dim">{ctx.compName}</span>
          {fixture?.roundName && <span className="text-sm text-ink-mute">· {fixture.roundName}</span>}
          {fixture?.leg && <span className="text-sm text-ink-mute">· {t('match.pre.leg', { n: fixture.leg })}</span>}
          <Badge tone={STAKE_TONE[stakes]}>{t(`match.pre.stakes.${stakes}`)}</Badge>
        </div>

        <div className="relative mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <TeamHero sheet={ctx.home} side="home" />
          <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15, type: 'spring' }}
            className="font-display text-3xl sm:text-5xl text-ink-mute">VS</motion.div>
          <TeamHero sheet={ctx.away} side="away" />
        </div>

        <div className="relative mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-ink-dim">
          <span className="flex items-center gap-1.5"><MapPin size={13} className="text-accent" />{ctx.stadium}{fixture?.neutral ? ` · ${t('match.pre.neutral')}` : ''}</span>
          <span className="flex items-center gap-1.5"><Users size={13} className="text-accent" />{t('match.pre.attendance', { n: formatNumber(ctx.attendance, lang) })}</span>
          <span className="flex items-center gap-1.5">
            <WeatherGlyph kind={w.kind} time={w.time} size={13} className="text-accent" />
            {t(`match.w.${w.kind}`)} · {t(`match.t.${w.time}`)}
          </span>
          <span className="flex items-center gap-1.5"><Thermometer size={13} className="text-accent" />{Math.round(w.temperature)}°C</span>
          {wind >= 1 && <span className="flex items-center gap-1.5"><Wind size={13} className="text-accent" />{t('match.wind', { n: wind.toFixed(1) })}</span>}
        </div>
      </motion.div>

      {/* role */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className={clsx('mt-3 rounded-2xl px-4 py-3 text-sm font-semibold border',
          ctx.userRole === 'starter' ? 'bg-accent/10 border-accent/30 text-accent'
            : ctx.userRole === 'bench' ? 'bg-gold/10 border-gold/30 text-gold' : 'bg-white/5 border-line text-ink-dim')}>
        {t(`match.pre.role.${ctx.userRole}`)}
      </motion.div>

      {/* strengths */}
      <Card title={t('match.pre.strength')} icon="scale" className="mt-3">
        <div className="space-y-2.5">
          <DualStat label={t('common.overall')} home={ctx.home.strength.overall} away={ctx.away.strength.overall} homeColor={hc} awayColor={ac} max={100} />
          <DualStat label={t('match.pre.att')} home={ctx.home.strength.att} away={ctx.away.strength.att} homeColor={hc} awayColor={ac} max={100} />
          <DualStat label={t('match.pre.mid')} home={ctx.home.strength.mid} away={ctx.away.strength.mid} homeColor={hc} awayColor={ac} max={100} />
          <DualStat label={t('match.pre.def')} home={ctx.home.strength.def} away={ctx.away.strength.def} homeColor={hc} awayColor={ac} max={100} />
          <DualStat label={t('match.pre.gk')} home={ctx.home.strength.gk} away={ctx.away.strength.gk} homeColor={hc} awayColor={ac} max={100} />
        </div>
      </Card>

      {/* line-ups */}
      <Card title={t('match.pre.lineups')} icon="shirt" className="mt-3">
        <div className="grid grid-cols-2 gap-3">
          <Lineup sheet={ctx.home} state={state} userId={userId} />
          <Lineup sheet={ctx.away} state={state} userId={userId} align="right" />
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-bg via-bg/95 to-transparent pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="max-w-3xl mx-auto px-4 grid grid-cols-[1fr_2fr] gap-2">
          <Button size="lg" variant="secondary" onClick={onSimulate} disabled={busy}><FastForward size={18} />{t('match.pre.simulate')}</Button>
          <Button size="lg" variant="primary" onClick={onStart} disabled={busy}><Play size={18} />{t('match.pre.start')}</Button>
        </div>
      </div>
    </div>
  );
}

function TeamHero({ sheet, side }: { sheet: TeamSheet; side: 'home' | 'away' }) {
  return (
    <motion.div
      initial={{ x: side === 'home' ? -30 : 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 140, damping: 16 }}
      className="flex flex-col items-center text-center gap-2 min-w-0"
    >
      <Crest kit={sheet.kit} label={sheet.shortName} size={64} />
      <div className="font-display text-xl sm:text-3xl leading-none tracking-wide break-words">{sheet.name}</div>
      <div className="text-[11px] text-ink-mute">{t('match.pre.formation')} {sheet.formation}</div>
    </motion.div>
  );
}

function Lineup({ sheet, state, userId, align = 'left' }: { sheet: TeamSheet; state: GameState | null; userId: string | null; align?: 'left' | 'right' }) {
  const nums = shirtNumbers(state, sheet);
  const row = (id: string, bench: boolean) => {
    const p = state?.world.players[id];
    const you = id === userId;
    return (
      <li key={id} className={clsx('flex items-center gap-1.5 rounded-lg px-1.5 py-1 min-w-0',
        align === 'right' && 'flex-row-reverse text-right',
        you ? 'bg-accent/15 ring-1 ring-accent/50' : bench ? 'opacity-70' : '')}>
        <span className="w-5 shrink-0 text-center text-[11px] font-bold tabular-nums text-ink-mute">{nums[id]}</span>
        {p && <PosTag pos={p.position} />}
        <span className={clsx('truncate text-sm', you && 'font-bold text-accent')}>{p ? p.nickname || p.lastName : '—'}</span>
        {you && <span className="shrink-0 text-[9px] font-black tracking-widest bg-accent text-bg rounded px-1">{t('match.pre.you')}</span>}
      </li>
    );
  };
  return (
    <div className="min-w-0">
      <ul className="space-y-0.5">{sheet.xi.map((id) => row(id, false))}</ul>
      {sheet.bench.length > 0 && (
        <>
          <div className={clsx('mt-3 mb-1 text-[10px] uppercase tracking-[0.18em] text-ink-mute font-bold', align === 'right' && 'text-right')}>{t('match.pre.bench')}</div>
          <ul className="space-y-0.5">{sheet.bench.map((id) => row(id, true))}</ul>
        </>
      )}
    </div>
  );
}
