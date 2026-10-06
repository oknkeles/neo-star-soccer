import { AnimatePresence, motion } from 'framer-motion';
import { FastForward, Pause, Play, Radio } from 'lucide-react';
import type { GameState, MatchContext, MatchEvent } from '../../../core/types';
import type { LiveMatch } from '../../../match/flow/api';
import { t } from '../../../core/i18n';
import { round1 } from '../../../core/util';
import { Button, Card, clsx } from '../../components/kit';
import { SPEEDS, isGoal, ratingChip } from './helpers';
import { DualStat, EventIcon, MomentumBar, ScoreBug, kitColor } from './parts';

export interface LiveViewProps {
  ctx: MatchContext;
  live: LiveMatch;
  state: GameState | null;
  speed: number;
  paused: boolean;
  onPause: () => void;
  onSpeed: (s: number) => void;
  onSimToEnd: () => void;
  /** Bumped on every tick so memoised parts refresh. */
  version: number;
  colors: { home: string; away: string };
}

export function LiveView({ ctx, live, state, speed, paused, onPause, onSpeed, onSimToEnd, version, colors }: LiveViewProps) {
  void version;
  const events = live.events.slice(-90).reverse();
  const agg = live.aggregateScore();
  const over = live.isOver();

  return (
    <div className="min-h-full max-w-3xl mx-auto px-3 sm:px-4 pb-28">
      {/* sticky score bug */}
      <div className="sticky top-0 z-20 -mx-3 sm:-mx-4 px-3 sm:px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 bg-bg/90 backdrop-blur-md border-b border-line">
        <ScoreBug
          homeKit={ctx.home.kit} awayKit={ctx.away.kit}
          home={ctx.home.shortName || ctx.home.name} away={ctx.away.shortName || ctx.away.name}
          hg={live.homeGoals} ag={live.awayGoals}
          clock={live.period === 'pre' ? "0'" : live.clockLabel()}
          period={t(`match.period.${live.period}`)}
          pens={live.pens}
          agg={agg ? t('match.live.agg', { score: `${agg[0]}-${agg[1]}` }) : null}
        />
        <div className="px-1">
          <MomentumBar value={live.momentum} homeColor={colors.home} awayColor={colors.away} />
        </div>
      </div>

      <UserStrip ctx={ctx} live={live} state={state} />

      {live.shootout && <Shootout ctx={ctx} live={live} />}

      <Card className="mt-3" padded>
        <div className="space-y-2">
          <DualStat label={t('match.live.possession')} home={live.possession()} away={100 - live.possession()} homeColor={colors.home} awayColor={colors.away} format={(v) => `%${Math.round(v)}`} />
          <DualStat label={t('match.live.shots')} home={live.teamStats.home.shots} away={live.teamStats.away.shots} homeColor={colors.home} awayColor={colors.away} />
          <DualStat label={t('match.live.onTarget')} home={live.teamStats.home.onTarget} away={live.teamStats.away.onTarget} homeColor={colors.home} awayColor={colors.away} />
          <DualStat label={t('match.live.xg')} home={live.teamStats.home.xg} away={live.teamStats.away.xg} homeColor={colors.home} awayColor={colors.away} format={(v) => v.toFixed(1)} />
        </div>
      </Card>

      {/* commentary feed */}
      <div className="mt-4 flex items-center gap-2 text-ink-dim text-xs font-bold uppercase tracking-[0.14em]">
        <Radio size={14} className={clsx('text-danger', !over && !paused && 'animate-nss-pulse')} />{t('match.live.feed')}
      </div>
      <ul className="mt-2 space-y-1.5">
        {events.length === 0 && <li className="text-ink-mute text-sm py-6 text-center">{t('match.live.waiting')}</li>}
        <AnimatePresence initial={false}>
          {events.map((e, i) => (
            <FeedRow key={live.events.length - i} e={e} live={live} ctx={ctx} colors={colors} />
          ))}
        </AnimatePresence>
      </ul>

      {/* controls */}
      {!over && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-bg via-bg/95 to-transparent pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-3xl mx-auto px-3 sm:px-4 flex items-center gap-2">
            <Button variant="secondary" size="lg" onClick={onPause} aria-label={paused ? t('match.live.resume') : t('match.live.pause')} className="w-13 px-0">
              {paused ? <Play size={20} /> : <Pause size={20} />}
            </Button>
            <div className="flex items-center gap-1 p-1 rounded-2xl bg-white/5 border border-line" role="group" aria-label={t('match.live.speed')}>
              {SPEEDS.map((s) => (
                <button key={s} onClick={() => onSpeed(s)}
                  className={clsx('h-10 w-11 rounded-xl text-sm font-bold cursor-pointer transition', speed === s ? 'bg-accent text-bg' : 'text-ink-dim hover:text-ink')}>
                  ×{s}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="lg" onClick={onSimToEnd} className="ml-auto px-3">
              <FastForward size={18} /><span className="hidden sm:inline">{t('match.live.simToEnd')}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function UserStrip({ ctx, live, state }: { ctx: MatchContext; live: LiveMatch; state: GameState | null }) {
  const user = state ? state.world.players[state.career.playerId] : undefined;
  if (!user) return null;
  let status: string;
  let tone = 'text-ink-dim';
  if (!live.userId) status = t('match.live.notInSquad');
  else if (live.userOnPitch) { status = ''; tone = 'text-accent'; }
  else if (live.userSubbedOff || live.userSentOff) status = t('match.live.offPitch');
  else status = t('match.live.onBench');
  const u = live.userStats;
  return (
    <div className="mt-3 rounded-2xl border border-line bg-white/4 px-3 py-2.5 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl grid place-items-center font-display text-xl shrink-0"
        style={{ background: ctx.userSide ? ctx[ctx.userSide].kit.primary : '#16261e', color: ctx.userSide ? ctx[ctx.userSide].kit.secondary : '#e9f5ee' }}>
        {user.shirtNumber}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{user.nickname || `${user.firstName} ${user.lastName}`}</div>
        {status ? <div className={clsx('text-xs truncate', tone)}>{status}</div> : (
          <div className="flex items-center gap-3 text-xs text-ink-dim">
            <span>{u.minutes} {t('match.live.minutes')}</span>
            <span>{u.moments} {t('match.live.moments')}</span>
            {u.goals > 0 && <span className="text-accent font-bold">{u.goals} {t('common.goals')}</span>}
            {u.assists > 0 && <span className="text-info font-bold">{u.assists} {t('common.assists')}</span>}
          </div>
        )}
      </div>
      {live.userId && (live.userOnPitch || u.moments > 0) && (
        <div className="text-right shrink-0">
          <div className="text-[9px] uppercase tracking-[0.16em] text-ink-mute font-bold">{t('match.live.yourRating')}</div>
          <motion.div key={live.userRating} initial={{ scale: 1.4 }} animate={{ scale: 1 }}
            className={clsx('inline-block mt-0.5 rounded-lg px-2 py-0.5 font-display text-xl tabular-nums', ratingChip(live.userRating))}>
            {round1(live.userRating).toFixed(1)}
          </motion.div>
        </div>
      )}
    </div>
  );
}

function FeedRow({ e, live, ctx, colors }: { e: MatchEvent; live: LiveMatch; ctx: MatchContext; colors: { home: string; away: string } }) {
  const goal = isGoal(e);
  const sideColor = e.side ? colors[e.side] : 'transparent';
  const big = goal || e.kind === 'red' || e.kind === 'fulltime' || e.kind === 'halftime';
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className={clsx('relative flex gap-2.5 rounded-xl pl-3 pr-3 py-2 border overflow-hidden',
        goal ? 'border-accent/40' : e.user ? 'border-accent/25 bg-accent/5' : 'border-line bg-white/[0.025]')}
      style={goal ? { background: `linear-gradient(90deg, ${sideColor}40, rgba(16,28,22,0.6) 70%)` } : undefined}
    >
      <span className="absolute left-0 inset-y-0 w-1" style={{ background: sideColor }} />
      <span className="w-12 shrink-0 text-xs font-bold tabular-nums text-ink-mute pt-0.5">{live.clockLabel(e)}</span>
      <span className="pt-0.5 shrink-0"><EventIcon e={e} /></span>
      <div className="min-w-0 flex-1">
        {goal && (
          <div className="font-display text-xl leading-none tracking-wide text-accent mb-0.5">
            {t('match.ob.goal')} {e.side ? (ctx[e.side].shortName || ctx[e.side].name) : ''}
          </div>
        )}
        <p className={clsx('text-sm leading-snug', big ? 'text-ink font-semibold' : 'text-ink-dim', e.user && 'text-ink')}>{e.text}</p>
      </div>
    </motion.li>
  );
}

function Shootout({ ctx, live }: { ctx: MatchContext; live: LiveMatch }) {
  const sh = live.shootout;
  if (!sh) return null;
  const row = (side: 'home' | 'away') => {
    const kicks = sh.kicks.filter((k) => k.side === side);
    const slots = Math.max(5, kicks.length);
    return (
      <div className="flex items-center gap-2">
        <span className="w-12 font-display text-lg truncate">{ctx[side].shortName}</span>
        <div className="flex gap-1.5 flex-wrap">
          {Array.from({ length: slots }, (_, i) => {
            const k = kicks[i];
            return (
              <motion.span key={i} initial={k ? { scale: 0 } : false} animate={{ scale: 1 }}
                className={clsx('w-5 h-5 rounded-full border-2', !k ? 'border-line' : k.scored ? 'bg-accent border-accent' : 'bg-danger border-danger',
                  k && k.playerId === live.userId && 'ring-2 ring-gold ring-offset-1 ring-offset-bg')} />
            );
          })}
        </div>
        <span className="ml-auto font-display text-2xl tabular-nums">{sh.score[side]}</span>
      </div>
    );
  };
  return (
    <Card title={t('match.live.shootout')} icon="target" glow="gold" className="mt-3">
      <div className="space-y-2">{row('home')}{row('away')}</div>
    </Card>
  );
}
