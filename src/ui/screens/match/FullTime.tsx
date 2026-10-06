import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Crown, Mic, RotateCcw, Sparkles, TrendingUp } from 'lucide-react';
import type { GameState, MatchContext, MatchSummary } from '../../../core/types';
import type { LiveMatch } from '../../../match/flow/api';
import { t } from '../../../core/i18n';
import { Button, Card, Crest, Spinner, clsx } from '../../components/kit';
import { ratingChip, ratingClass, ratingGrade, scorersOf, xpEntries } from './helpers';
import { DualStat, PosTag, kitColor } from './parts';

export type ApplyState = { status: 'pending' } | { status: 'done'; notes: string[]; press: boolean } | { status: 'error'; message: string };

export function FullTime({ ctx, live, summary, state, apply, onRetry, onContinue, onPress }: {
  ctx: MatchContext; live: LiveMatch; summary: MatchSummary; state: GameState | null; apply: ApplyState;
  onRetry: () => void; onContinue: () => void; onPress: () => void;
}) {
  const userId = state?.career.playerId ?? null;
  const side = live.userSide ?? ctx.userSide;
  const winner = live.winnerSide();
  const outcome = !side ? null : winner === side ? 'win' : winner ? 'loss' : 'draw';
  const hc = kitColor(ctx.home.kit);
  const ac = kitColor(ctx.away.kit);
  const name = (id: string) => live.playerName(id);
  const u = summary.user;
  const motmName = summary.motmId ? name(summary.motmId) : null;
  const userMotm = !!userId && summary.motmId === userId;

  return (
    <div className="min-h-full max-w-3xl mx-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-32">
      <div className="text-center">
        <div className="text-xs uppercase tracking-[0.24em] text-ink-dim font-bold">{t('match.ft.title')} · {ctx.compName}</div>
        {outcome && (
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 14 }}
            className={clsx('font-display text-5xl mt-1 tracking-wide', outcome === 'win' ? 'text-accent neon-text' : outcome === 'loss' ? 'text-danger' : 'text-gold')}>
            {t(`match.ft.${outcome}`)}
          </motion.div>
        )}
      </div>

      {/* final score */}
      <Card className="mt-4" padded={false}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-4">
          <div className="flex flex-col items-center gap-1.5 min-w-0 text-center">
            <Crest kit={ctx.home.kit} label={ctx.home.shortName} size={52} />
            <div className="font-display text-xl leading-none truncate max-w-full">{ctx.home.name}</div>
          </div>
          <div className="text-center">
            <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="font-display text-6xl tabular-nums leading-none">
              {summary.homeGoals}<span className="text-ink-mute mx-2">-</span>{summary.awayGoals}
            </motion.div>
            {summary.pens && <div className="text-gold text-sm font-bold mt-1">{t('match.ft.pens', { score: `${summary.pens.home}-${summary.pens.away}` })}</div>}
          </div>
          <div className="flex flex-col items-center gap-1.5 min-w-0 text-center">
            <Crest kit={ctx.away.kit} label={ctx.away.shortName} size={52} />
            <div className="font-display text-xl leading-none truncate max-w-full">{ctx.away.name}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 px-4 pb-4 text-xs">
          {(['home', 'away'] as const).map((s) => (
            <ul key={s} className={clsx('space-y-0.5', s === 'away' && 'text-right')}>
              {scorersOf(summary.events, s, (e) => live.clockLabel(e)).map((l) => (
                <li key={`${l.playerId}-${l.og}`} className={clsx('text-ink-dim', l.playerId === userId && 'text-accent font-bold')}>
                  ⚽ {name(l.playerId)} <span className="text-ink-mute">{l.minutes.join(', ')}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </Card>

      {/* the user's night */}
      {u ? (
        <Card className="mt-3" glow={userMotm ? 'gold' : undefined}>
          <div className="flex items-center gap-4">
            <RatingReveal value={u.rating} />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.16em] text-ink-mute font-bold">{t('match.ft.yourRating')}</div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }}
                className={clsx('font-display text-3xl leading-tight', ratingClass(u.rating))}>
                {t(`match.grade.${ratingGrade(u.rating)}`)}
              </motion.div>
              <div className="text-xs text-ink-dim">{t('match.ft.minutesPlayed', { n: u.stats.minutes })}</div>
              {userMotm && (
                <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 1.9, type: 'spring', stiffness: 220, damping: 10 }}
                  className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full bg-gold text-bg text-xs font-black tracking-widest shadow-[0_0_24px_-4px_rgba(255,203,71,0.8)]">
                  <Crown size={14} />{t('match.ft.motm')}
                </motion.div>
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-2">
            <Tile label={t('match.st.goals')} value={u.stats.goals} hot={u.stats.goals > 0} />
            <Tile label={t('match.st.assists')} value={u.stats.assists} hot={u.stats.assists > 0} />
            <Tile label={t('match.st.shots')} value={`${u.stats.shots} (${u.stats.shotsOnTarget})`} />
            <Tile label={t('match.st.passes')} value={`${u.stats.passesCompleted}/${u.stats.passes}`} />
            <Tile label={t('match.st.keyPasses')} value={u.stats.keyPasses} />
            <Tile label={t('match.st.dribbles')} value={u.stats.dribbles} />
            <Tile label={t('match.st.tackles')} value={u.stats.tackles} />
            <Tile label={t('match.st.interceptions')} value={u.stats.interceptions} />
            <Tile label={t('match.st.moments')} value={u.stats.moments} />
            <Tile label={t('match.st.minutes')} value={u.stats.minutes} />
          </div>
          {xpEntries(u.xp).length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-mute font-bold mb-2">
                <TrendingUp size={13} className="text-accent" />{t('match.ft.xp')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {xpEntries(u.xp).map(([k, v], i) => (
                  <motion.span key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.8 + i * 0.07 }}
                    className="px-2.5 py-1 rounded-full bg-accent/10 border border-accent/25 text-xs">
                    {t(`common.attr.${k}`)} <b className="text-accent">+{Math.round(v * 10) / 10}</b>
                  </motion.span>
                ))}
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Card className="mt-3"><div className="text-ink-dim text-sm">{t('match.ft.didNotPlay')}</div></Card>
      )}

      {!userMotm && motmName && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-ink-dim">
          <Crown size={15} className="text-gold" />{t('match.ft.motmOther', { name: motmName })}
        </div>
      )}

      {/* reactions */}
      <Card title={t('match.ft.notes')} icon="newspaper" className="mt-3">
        {apply.status === 'pending' && <Spinner label={t('match.ft.applying')} />}
        {apply.status === 'error' && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-danger text-sm">{t('match.ft.applyError')} <span className="text-ink-mute">{apply.message}</span></span>
            <Button size="sm" onClick={onRetry}><RotateCcw size={14} />{t('match.ft.retry')}</Button>
          </div>
        )}
        {apply.status === 'done' && (
          apply.notes.length ? (
            <ul className="space-y-1.5">
              {apply.notes.map((n, i) => (
                <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                  className="flex gap-2 text-sm"><Sparkles size={14} className="text-gold mt-0.5 shrink-0" /><span>{n}</span></motion.li>
              ))}
            </ul>
          ) : <div className="text-sm text-ink-mute">{t('match.ft.noNotes')}</div>
        )}
      </Card>

      {/* team stats */}
      <Card title={t('match.ft.teamStats')} icon="chart" className="mt-3">
        <div className="space-y-2.5">
          <DualStat label={t('match.live.possession')} home={summary.possession} away={100 - summary.possession} homeColor={hc} awayColor={ac} format={(v) => `%${Math.round(v)}`} />
          <DualStat label={t('match.live.shots')} home={summary.shots.home} away={summary.shots.away} homeColor={hc} awayColor={ac} />
          <DualStat label={t('match.live.onTarget')} home={live.teamStats.home.onTarget} away={live.teamStats.away.onTarget} homeColor={hc} awayColor={ac} />
          <DualStat label={t('match.live.xg')} home={summary.xg.home} away={summary.xg.away} homeColor={hc} awayColor={ac} format={(v) => v.toFixed(1)} />
        </div>
      </Card>

      {/* ratings */}
      <Card title={t('match.ft.ratings')} icon="star" className="mt-3">
        <div className="grid grid-cols-2 gap-3">
          {(['home', 'away'] as const).map((s) => (
            <RatingList key={s} summary={summary} ctx={ctx} side={s} state={state} userId={userId} />
          ))}
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-bg via-bg/95 to-transparent pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className={clsx('max-w-3xl mx-auto px-4 grid gap-2', apply.status === 'done' && apply.press ? 'grid-cols-2' : 'grid-cols-1')}>
          {apply.status === 'done' && apply.press && (
            <Button size="lg" variant="secondary" onClick={onPress}><Mic size={18} />{t('match.ft.press')}</Button>
          )}
          <Button size="lg" variant="primary" onClick={onContinue} disabled={apply.status === 'pending'}>
            {apply.status === 'error' ? t('match.err.back') : t('match.ft.continue')}<ChevronRight size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, hot }: { label: string; value: number | string; hot?: boolean }) {
  return (
    <div className={clsx('rounded-xl border px-2 py-2 text-center min-w-0', hot ? 'border-accent/40 bg-accent/10' : 'border-line bg-white/4')}>
      <div className={clsx('font-display text-2xl leading-none tabular-nums', hot && 'text-accent')}>{value}</div>
      <div className="text-[10px] text-ink-mute mt-1 truncate">{label}</div>
    </div>
  );
}

/** Rating circle that counts up from 0 with a colour that settles on the grade. */
function RatingReveal({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + 450;
    const step = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - start) / 1300));
      setShown(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const pct = Math.max(0, Math.min(1, (shown - 3) / 7));
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
          className={ratingClass(shown)} strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <div className={clsx('absolute inset-0 grid place-items-center font-display text-5xl tabular-nums', ratingClass(shown))}>
        {shown.toFixed(1)}
      </div>
    </div>
  );
}

function RatingList({ summary, ctx, side, state, userId }: {
  summary: MatchSummary; ctx: MatchContext; side: 'home' | 'away'; state: GameState | null; userId: string | null;
}) {
  const sheet = ctx[side];
  const ids = [...sheet.xi, ...sheet.bench].filter((id) => summary.ratings[id] !== undefined);
  return (
    <div className="min-w-0">
      <div className={clsx('font-display text-lg mb-1 truncate', side === 'away' && 'text-right')}>{sheet.shortName || sheet.name}</div>
      <ul className="space-y-0.5">
        {ids.map((id) => {
          const p = state?.world.players[id];
          const r = summary.ratings[id];
          const sub = !sheet.xi.includes(id);
          return (
            <li key={id} className={clsx('flex items-center gap-1.5 rounded-lg px-1 py-0.5 min-w-0', side === 'away' && 'flex-row-reverse text-right', id === userId && 'bg-accent/15 ring-1 ring-accent/40')}>
              {p && <PosTag pos={p.position} />}
              <span className={clsx('truncate text-xs flex-1', sub && 'text-ink-dim', id === userId && 'text-accent font-bold')}>
                {p ? p.nickname || p.lastName : '—'}{sub ? ' ↑' : ''}
              </span>
              {summary.motmId === id && <Crown size={12} className="text-gold shrink-0" />}
              <span className={clsx('shrink-0 w-9 text-center rounded-md text-[11px] font-bold tabular-nums py-0.5', ratingChip(r))}>{r.toFixed(1)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
