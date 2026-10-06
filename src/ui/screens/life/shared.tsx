/** Small building blocks and hooks shared by every life screen. */
import { useEffect, useId, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { Footballer, GameState, Kit, Lang, UserCareer } from '../../../core/types';
import { getLang, onLangChange, t } from '../../../core/i18n';
import { overall } from '../../../core/ratings';
import { useGame, useSettings } from '../../../game/api';
import { getNation } from '../../../world/api';
import { navigate } from '../../router';
import Avatar from '../../components/Avatar';
import { Button, EmptyState, Icon, clsx } from '../../components/kit';
import { hueOf, initialsOf, lineGeometry, type ChipTone } from './logic';
import './strings';

// ───────── hooks & guards ─────────

export function useLang(): Lang {
  return useSyncExternalStore((cb) => onLangChange(() => cb()), getLang, getLang);
}

export interface Life {
  state: GameState;
  player: Footballer;
  career: UserCareer;
  lang: Lang;
  ovr: number;
  version: number;
}

/** The running career, or null when none is loaded yet. */
export function useLife(): Life | null {
  const { state, version } = useGame();
  const lang = useLang();
  if (!state) return null;
  const player = state.world.players[state.career.playerId];
  if (!player) return null;
  return { state, player, career: state.career, lang, ovr: overall(player), version };
}

/** Run a call into another module; never let an unfinished module crash the screen. */
export function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function NoCareer() {
  return (
    <EmptyState
      icon="trophy" title={t('life.noCareer.title')} text={t('life.noCareer.text')}
      action={<Button variant="primary" onClick={() => navigate('title')}>{t('life.noCareer.cta')}</Button>}
    />
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('space-y-5 pb-24 md:pb-10', className)}>{children}</div>;
}

// ───────── people & teams ─────────

export interface TeamLabel { name: string; short: string; kit: Kit; national: boolean }
const FALLBACK_KIT: Kit = { primary: '#2a4436', secondary: '#9db5a7', style: 'plain' };

/** Club or national team id → display data, read straight from the save. */
export function teamLabel(state: GameState, id: string, lang: Lang): TeamLabel {
  const c = state.world.clubs[id];
  if (c) return { name: c.name, short: c.shortName, kit: c.kit, national: false };
  const n = state.world.nationalTeams[id];
  if (n) return { name: n.name[lang] ?? n.name.en, short: n.nation, kit: n.kit, national: true };
  return { name: id, short: id.slice(0, 3).toUpperCase(), kit: FALLBACK_KIT, national: false };
}

const flagCache = new Map<string, string>();
export function nationFlag(code: string): string {
  const hit = flagCache.get(code);
  if (hit) return hit;
  const f = safe(() => getNation(code).flag, '🏳️');
  flagCache.set(code, f);
  return f;
}

export function nationName(code: string, lang: Lang): string {
  return safe(() => getNation(code).name[lang], code);
}

export function Flag({ code, className }: { code: string; className?: string }) {
  return <span className={clsx('leading-none', className)} title={code}>{nationFlag(code)}</span>;
}

export function PlayerFace({ p, kit, size = 44, ring }: { p: Footballer; kit?: Kit; size?: number; ring?: 'accent' | 'gold' | 'none' }) {
  return <Avatar appearance={p.appearance} kit={kit} size={size} ring={ring} />;
}

/** Initials medallion for characters without a portrait (family, agent, journalists …). */
export function Initials({ name, size = 44, tone }: { name: string; size?: number; tone?: number }) {
  const h = tone ?? hueOf(name);
  return (
    <span
      className="grid place-items-center rounded-full font-display tracking-wide text-bg shrink-0 select-none"
      style={{
        width: size, height: size, fontSize: size * 0.42,
        background: `linear-gradient(135deg, hsl(${h} 70% 62%), hsl(${(h + 40) % 360} 65% 42%))`,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

// ───────── small UI atoms ─────────

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: 'bg-white/6 text-ink-dim', accent: 'bg-accent/12 text-accent', gold: 'bg-gold/12 text-gold',
  danger: 'bg-danger/12 text-danger', info: 'bg-info/12 text-info', violet: 'bg-violet/12 text-violet',
};

export function Chip({ icon, tone = 'neutral', children, className, title }: { icon?: string; tone?: ChipTone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={clsx('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold leading-none whitespace-nowrap', CHIP_TONE[tone], className)}>
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}

export function AIBadge({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full bg-violet/15 text-violet px-2 py-0.5 text-[10px] font-bold tracking-wider', className)}>
      <Icon name="sparkles" size={10} />AI
    </span>
  );
}

/** True when Claude may be answering (key set, AI enabled, the feature switched on). */
export function useClaudeOn(feature?: keyof ReturnType<typeof useSettings>['ai']['features']): boolean {
  const s = useSettings();
  return s.ai.enabled && s.ai.apiKey.length > 0 && (!feature || s.ai.features[feature] !== false);
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      onClick={() => onChange(!on)}
      className={clsx('relative w-12 h-7 rounded-full transition-colors cursor-pointer shrink-0 disabled:opacity-40', on ? 'bg-accent' : 'bg-white/12')}
    >
      <motion.span
        className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow"
        animate={{ x: on ? 20 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      />
    </button>
  );
}

export function SectionLabel({ children, icon, right }: { children: ReactNode; icon?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2.5 mt-1">
      <div className="flex items-center gap-2 text-ink-dim text-xs font-bold uppercase tracking-[0.14em]">
        {icon && <Icon name={icon} size={14} className="text-accent" />}{children}
      </div>
      {right}
    </div>
  );
}

export function RatingChip({ r, size = 'md' }: { r: number; size?: 'sm' | 'md' }) {
  const cls = r >= 8 ? 'bg-gold text-bg' : r >= 7 ? 'bg-accent text-bg' : r >= 6 ? 'bg-info/80 text-bg' : r >= 5 ? 'bg-white/15 text-ink' : 'bg-danger text-white';
  return (
    <span className={clsx('inline-grid place-items-center rounded-lg font-display tabular-nums', cls, size === 'sm' ? 'min-w-8 h-6 px-1.5 text-sm' : 'min-w-10 h-8 px-2 text-lg')}>
      {r.toFixed(1)}
    </span>
  );
}

/** Tiny area/line chart. `values` left→right. */
export function Sparkline({ values, width = 240, height = 64, color = '#b8ff3c', min, max, dots = false, label }: {
  values: number[]; width?: number; height?: number; color?: string; min?: number; max?: number; dots?: boolean; label?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const g = useMemo(() => lineGeometry(values, width, height, 6, min, max), [values, width, height, min, max]);
  if (!values.length) return null;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`sp${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.38" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={g.area} fill={`url(#sp${gid})`} />
      <path d={g.line} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {(dots || values.length <= 14) && g.pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={i === g.pts.length - 1 ? 3.6 : 2.2} fill={i === g.pts.length - 1 ? '#fff' : color} />)}
    </svg>
  );
}

/** Bottom sheet on phones, right-hand drawer on desktop. */
export function Drawer({ open, onClose, title, subtitle, children, footer }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end bg-black/65 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="glass bg-bg-2/97 w-full md:w-[440px] h-[88vh] md:h-full rounded-t-3xl md:rounded-none md:rounded-l-3xl flex flex-col overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
              <div className="min-w-0 flex-1">
                <div className="font-display text-2xl leading-none truncate">{title}</div>
                {subtitle && <div className="text-xs text-ink-dim mt-1 truncate">{subtitle}</div>}
              </div>
              <button onClick={onClose} aria-label={t('common.close')} className="p-2 rounded-xl text-ink-dim hover:text-ink hover:bg-white/5 cursor-pointer"><X size={18} /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
            {footer && <div className="border-t border-line p-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Reusable staggered entrance for list children. */
export const listItem = (i: number) => ({
  initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: Math.min(i, 12) * 0.035, type: 'spring' as const, stiffness: 260, damping: 26 },
});

export function weekLabel(week: number): string {
  return `${t('common.week')} ${week + 1}`;
}
