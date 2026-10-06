/** Shared presentational pieces of the match & drill screens. */
import { useSyncExternalStore, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeftRight, CircleDot, Cloud, CloudFog, CloudRain, CloudSnow, Crosshair, Flag, Goal, Hand, HeartPulse, Hourglass,
  Moon, Star, Sun, Sunset, Timer, Tv, X, Zap, type LucideIcon,
} from 'lucide-react';
import type { MatchEvent, Position, Settings, Kit } from '../../../core/types';
import { getSettings, onSettingsChange } from '../../../core/settings';
import { t } from '../../../core/i18n';
import { clsx, Crest } from '../../components/kit';
import { weatherIcon } from './helpers';
import { colourDistance } from '../../../match/flow/api';

/** Settings as a React store (re-renders on change, incl. language). */
const subscribeSettings = (cb: () => void) => {
  const off = onSettingsChange(() => cb());
  return () => { off(); };
};
export function useLiveSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings);
}

const WEATHER_ICONS: Record<string, LucideIcon> = {
  sun: Sun, moon: Moon, sunset: Sunset, cloudy: Cloud, rain: CloudRain, snow: CloudSnow, fog: CloudFog,
};

export function WeatherGlyph({ kind, time, size = 18, className }: { kind: string; time: 'day' | 'dusk' | 'night'; size?: number; className?: string }) {
  const C = WEATHER_ICONS[weatherIcon(kind as never, time)] ?? Cloud;
  return <C size={size} className={className} />;
}

export function PosTag({ pos, className }: { pos: Position; className?: string }) {
  return (
    <span className={clsx('inline-grid place-items-center min-w-8 h-5 px-1 rounded-md text-[10px] font-bold tracking-wide', POS_COLOR[pos], className)}>
      {t(`match.pos.${pos}`)}
    </span>
  );
}

const POS_COLOR: Record<Position, string> = {
  GK: 'bg-gold/15 text-gold',
  CB: 'bg-info/15 text-info', FB: 'bg-info/15 text-info',
  DM: 'bg-accent-2/15 text-accent-2', CM: 'bg-accent-2/15 text-accent-2', AM: 'bg-accent-2/15 text-accent-2',
  W: 'bg-danger/15 text-danger', ST: 'bg-danger/15 text-danger',
};

/** Icon for a ticker event. */
export function EventIcon({ e, size = 16 }: { e: MatchEvent; size?: number }) {
  const k = e.kind;
  if (k === 'yellow' || k === 'red') {
    return <span className={clsx('inline-block rounded-[2px] rotate-6 shadow', k === 'yellow' ? 'bg-gold' : 'bg-danger')} style={{ width: size * 0.62, height: size * 0.85 }} />;
  }
  const map: Partial<Record<MatchEvent['kind'], [LucideIcon, string]>> = {
    goal: [Goal, 'text-accent'], penalty_goal: [Goal, 'text-accent'], own_goal: [Goal, 'text-danger'],
    penalty_miss: [X, 'text-danger'], sub: [ArrowLeftRight, 'text-info'], injury: [HeartPulse, 'text-danger'],
    save: [Hand, 'text-info'], woodwork: [Crosshair, 'text-gold'], chance: [Zap, 'text-ink-dim'],
    kickoff: [Flag, 'text-ink-dim'], halftime: [Timer, 'text-ink-dim'], fulltime: [Flag, 'text-accent'],
    extra_time: [Hourglass, 'text-gold'], shootout: [CircleDot, 'text-gold'], var: [Tv, 'text-violet'], moment: [Star, 'text-accent'],
  };
  const [C, cls] = map[k] ?? [Zap, 'text-ink-dim'];
  const neutralChance = k === 'chance' && !e.side;
  const Icon = neutralChance ? Timer : C;
  return <Icon size={size} className={cls} />;
}

/** Big score bug: crests, short names, score, clock. */
export function ScoreBug({
  homeKit, awayKit, home, away, hg, ag, clock, period, pens, agg, flashKey, compact,
}: {
  homeKit: Kit; awayKit: Kit; home: string; away: string; hg: number; ag: number; clock: string; period: string;
  pens?: { home: number; away: number } | null; agg?: string | null; flashKey?: string; compact?: boolean;
}) {
  return (
    <div className={clsx('flex items-center justify-between gap-2', compact ? 'px-2 py-1.5' : 'px-3 py-2.5')}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Crest kit={homeKit} size={compact ? 22 : 30} />
        <span className={clsx('font-display tracking-wide truncate', compact ? 'text-lg' : 'text-2xl')}>{home}</span>
      </div>
      <div className="flex flex-col items-center shrink-0">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={flashKey ?? `${hg}-${ag}`}
            initial={{ scale: 1.6, color: '#b8ff3c' }}
            animate={{ scale: 1, color: '#e9f5ee' }}
            transition={{ type: 'spring', stiffness: 220, damping: 14 }}
            className={clsx('font-display tabular-nums leading-none rounded-xl bg-black/40 border border-line px-3', compact ? 'text-2xl py-0.5' : 'text-4xl py-1')}
          >
            {hg}<span className="text-ink-mute mx-1.5">-</span>{ag}
          </motion.div>
        </AnimatePresence>
        <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold">
          <span className="text-accent tabular-nums">{clock}</span>
          <span className="text-ink-mute uppercase tracking-wider">{period}</span>
        </div>
        {pens && <div className="text-[11px] text-gold font-bold">{t('match.ft.pens', { score: `${pens.home}-${pens.away}` })}</div>}
        {agg && <div className="text-[11px] text-ink-dim">{agg}</div>}
      </div>
      <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
        <span className={clsx('font-display tracking-wide truncate text-right', compact ? 'text-lg' : 'text-2xl')}>{away}</span>
        <Crest kit={awayKit} size={compact ? 22 : 30} />
      </div>
    </div>
  );
}

/** Momentum bar: 0..1 toward home. */
export function MomentumBar({ value, homeColor, awayColor, label }: { value: number; homeColor: string; awayColor: string; label?: ReactNode }) {
  const pct = Math.round(Math.max(0.04, Math.min(0.96, value)) * 100);
  return (
    <div>
      {label && <div className="text-center text-[10px] uppercase tracking-[0.2em] text-ink-mute font-bold mb-1">{label}</div>}
      <div className="relative h-2.5 rounded-full overflow-hidden bg-white/5 flex">
        <motion.div className="h-full" style={{ background: homeColor }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 60, damping: 16 }} />
        <div className="h-full flex-1" style={{ background: awayColor }} />
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/50" />
      </div>
    </div>
  );
}

/** Two-sided comparison bar (pre-match strengths, live stats). */
export function DualStat({ label, home, away, homeColor, awayColor, format = (v: number) => String(Math.round(v)), max }: {
  label: ReactNode; home: number; away: number; homeColor: string; awayColor: string; format?: (v: number) => string; max?: number;
}) {
  const total = max ?? Math.max(1e-6, home + away);
  const hp = max ? (home / max) * 100 : (home / total) * 100;
  const ap = max ? (away / max) * 100 : (away / total) * 100;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-bold tabular-nums">{format(home)}</span>
        <span className="text-ink-dim uppercase tracking-wider text-[10px] font-bold">{label}</span>
        <span className="font-bold tabular-nums">{format(away)}</span>
      </div>
      <div className="flex gap-1 h-1.5">
        <div className="flex-1 flex justify-end rounded-full bg-white/5 overflow-hidden">
          <motion.div className="h-full rounded-full" style={{ background: homeColor }} initial={false} animate={{ width: `${Math.min(100, hp)}%` }} />
        </div>
        <div className="flex-1 rounded-full bg-white/5 overflow-hidden">
          <motion.div className="h-full rounded-full" style={{ background: awayColor }} initial={false} animate={{ width: `${Math.min(100, ap)}%` }} />
        </div>
      </div>
    </div>
  );
}

/** Readable display colour from a kit (avoid near-black / near-white bars on the dark UI). */
export function kitColor(kit: Kit): string {
  const pick = (c: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    return lum;
  };
  const p = pick(kit.primary);
  if (p !== null && p > 40) return kit.primary;
  const s = pick(kit.secondary);
  if (s !== null && s > 40) return kit.secondary;
  return '#9db5a7';
}

/** Bar colours for both teams that stay distinguishable from each other. */
export function teamColors(home: Kit, away: Kit): { home: string; away: string } {
  const h = kitColor(home);
  let a = kitColor(away);
  if (colourDistance(h, a) < 110) {
    const alt = kitColor({ ...away, primary: away.secondary, secondary: away.primary });
    a = colourDistance(h, alt) >= 110 ? alt : h.toLowerCase() === '#9db5a7' ? '#49c6ff' : '#9db5a7';
  }
  return { home: h, away: a };
}
