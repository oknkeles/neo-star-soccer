/**
 * Shared UI kit. Every screen builds on these so the game has one visual language:
 * dark "night stadium" panels, lime accent, gold for money/trophies, Bebas Neue display type.
 */
import { useEffect, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import type { Kit } from '../../core/types';
import { iconFor } from './icons';
import { back, navigate, type RouteName } from '../router';

export { clsx };

// ───────── Icon ─────────

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const C = iconFor(name);
  return <C size={size} className={className} />;
}

// ───────── Button ─────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-bg hover:brightness-110 shadow-[0_0_24px_-6px_rgba(184,255,60,0.7)]',
  secondary: 'bg-panel-2 text-ink border border-line hover:border-accent/40 hover:bg-[#1b2f25]',
  ghost: 'bg-transparent text-ink-dim hover:text-ink hover:bg-white/5',
  danger: 'bg-danger/90 text-white hover:bg-danger',
  gold: 'bg-gold text-bg hover:brightness-110 shadow-[0_0_24px_-6px_rgba(255,203,71,0.7)]',
};
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-13 px-6 text-base gap-2.5 rounded-2xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: string;
  loading?: boolean;
  block?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, loading, block, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center font-semibold transition-all duration-150 select-none',
        'active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none cursor-pointer',
        VARIANTS[variant], SIZES[size], block && 'w-full', className,
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon ? <Icon name={icon} size={size === 'lg' ? 20 : 16} /> : null}
      {children}
    </button>
  );
}

// ───────── Card ─────────

export function Card({ title, icon, action, className, children, glow, padded = true, onClick }: {
  title?: ReactNode; icon?: string; action?: ReactNode; className?: string; children?: ReactNode; glow?: 'accent' | 'gold' | 'danger'; padded?: boolean; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'glass rounded-[var(--radius-card)]', padded && 'p-4',
        glow === 'accent' && 'ring-1 ring-accent/40 shadow-[0_0_40px_-12px_rgba(184,255,60,0.5)]',
        glow === 'gold' && 'ring-1 ring-gold/40 shadow-[0_0_40px_-12px_rgba(255,203,71,0.5)]',
        glow === 'danger' && 'ring-1 ring-danger/40',
        onClick && 'cursor-pointer hover:ring-1 hover:ring-accent/30 transition',
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 text-ink-dim text-xs font-bold uppercase tracking-[0.14em]">
            {icon && <Icon name={icon} size={14} className="text-accent" />}
            {title}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ───────── Meter ─────────

export function meterTone(v: number): 'danger' | 'gold' | 'accent' {
  return v < 33 ? 'danger' : v < 60 ? 'gold' : 'accent';
}
const TONE_BG = { accent: 'bg-accent', gold: 'bg-gold', danger: 'bg-danger', info: 'bg-info', violet: 'bg-violet' } as const;
const TONE_TEXT = { accent: 'text-accent', gold: 'text-gold', danger: 'text-danger', info: 'text-info', violet: 'text-violet' } as const;
export type Tone = keyof typeof TONE_BG;

export function Meter({ value, max = 100, label, tone, showValue = true, size = 'md', icon }: {
  value: number; max?: number; label?: ReactNode; tone?: Tone | 'auto'; showValue?: boolean; size?: 'sm' | 'md'; icon?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const t: Tone = !tone || tone === 'auto' ? meterTone(pct) : tone;
  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="flex items-center gap-1.5 text-ink-dim">{icon && <Icon name={icon} size={12} />}{label}</span>
          {showValue && <span className={clsx('font-bold tabular-nums', TONE_TEXT[t])}>{Math.round(value)}</span>}
        </div>
      )}
      <div className={clsx('w-full rounded-full bg-white/6 overflow-hidden', size === 'sm' ? 'h-1.5' : 'h-2.5')}>
        <motion.div
          className={clsx('h-full rounded-full', TONE_BG[t])}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
    </div>
  );
}

// ───────── Badge ─────────

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone | 'neutral'; children: ReactNode; className?: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide',
      tone === 'neutral' ? 'bg-white/8 text-ink-dim' : `${TONE_TEXT[tone]} bg-current/10`,
      className,
    )}>
      {tone !== 'neutral' ? <span className="text-inherit">{children}</span> : children}
    </span>
  );
}

// ───────── Tabs ─────────

export interface TabDef { id: string; label: ReactNode; icon?: string; badge?: number }

export function Tabs({ tabs, value, onChange, className }: { tabs: TabDef[]; value: string; onChange: (id: string) => void; className?: string }) {
  return (
    <div className={clsx('flex gap-1 p-1 rounded-2xl bg-white/4 border border-line overflow-x-auto', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'relative flex items-center gap-1.5 px-3 h-9 rounded-xl text-sm font-semibold whitespace-nowrap transition cursor-pointer',
            value === tab.id ? 'text-bg' : 'text-ink-dim hover:text-ink',
          )}
        >
          {value === tab.id && <motion.span layoutId={`tab-pill-${tabs.map((x) => x.id).join('')}`} className="absolute inset-0 rounded-xl bg-accent" />}
          <span className="relative flex items-center gap-1.5">
            {tab.icon && <Icon name={tab.icon} size={14} />}
            {tab.label}
            {!!tab.badge && <span className="ml-1 min-w-5 h-5 px-1 rounded-full bg-danger text-white text-[10px] grid place-items-center">{tab.badge}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

// ───────── Modal ─────────

export function Modal({ open, onClose, title, children, footer, size = 'md', dismissable = true }: {
  open: boolean; onClose?: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; dismissable?: boolean;
}) {
  useEffect(() => {
    if (!open || !dismissable) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissable, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => dismissable && onClose?.()}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 30, scale: 0.96, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className={clsx('glass bg-bg-2/95 rounded-3xl w-full max-h-[90vh] flex flex-col',
              size === 'sm' && 'max-w-sm', size === 'md' && 'max-w-lg', size === 'lg' && 'max-w-2xl', size === 'xl' && 'max-w-4xl')}
          >
            {(title || dismissable) && (
              <div className="flex items-center justify-between px-5 pt-5 pb-2">
                <div className="font-display text-2xl tracking-wide">{title}</div>
                {dismissable && onClose && (
                  <button onClick={onClose} className="p-2 rounded-xl text-ink-dim hover:text-ink hover:bg-white/5 cursor-pointer"><X size={18} /></button>
                )}
              </div>
            )}
            <div className="px-5 pb-5 overflow-y-auto">{children}</div>
            {footer && <div className="px-5 py-4 border-t border-line flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ───────── Screen header ─────────

export function ScreenHeader({ title, subtitle, icon, right, backTo }: {
  title: ReactNode; subtitle?: ReactNode; icon?: string; right?: ReactNode; backTo?: RouteName | 'back';
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        {backTo && (
          <button
            onClick={() => (backTo === 'back' ? back() : navigate(backTo))}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-ink-dim hover:text-ink cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        {icon && <div className="w-11 h-11 rounded-2xl bg-accent/10 grid place-items-center text-accent"><Icon name={icon} size={22} /></div>}
        <div className="min-w-0">
          <h1 className="font-display text-4xl leading-none tracking-wide truncate">{title}</h1>
          {subtitle && <div className="text-ink-dim text-sm mt-1 truncate">{subtitle}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

// ───────── Stat tile ─────────

export function StatTile({ label, value, sub, icon, tone = 'accent' }: { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: string; tone?: Tone }) {
  return (
    <div className="rounded-2xl bg-white/4 border border-line p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-ink-mute font-bold">
        {icon && <Icon name={icon} size={12} className={TONE_TEXT[tone]} />}{label}
      </div>
      <div className={clsx('font-display text-3xl leading-tight mt-1 truncate', TONE_TEXT[tone])}>{value}</div>
      {sub && <div className="text-xs text-ink-dim truncate">{sub}</div>}
    </div>
  );
}

// ───────── misc ─────────

export function Spinner({ label }: { label?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-ink-dim text-sm">
      <Loader2 size={16} className="animate-spin text-accent" /> {label}
    </div>
  );
}

export function EmptyState({ icon = 'sparkles', title, text, action }: { icon?: string; title: ReactNode; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-4 gap-2">
      <div className="w-14 h-14 rounded-2xl bg-white/5 grid place-items-center text-ink-mute"><Icon name={icon} size={26} /></div>
      <div className="font-semibold">{title}</div>
      {text && <div className="text-ink-dim text-sm max-w-sm">{text}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Star rating (0.5..5). */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5 text-gold" aria-label={`${value}/5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24">
            <defs>
              <linearGradient id={`sg${i}${fill}`}>
                <stop offset={`${fill * 100}%`} stopColor="currentColor" />
                <stop offset={`${fill * 100}%`} stopColor="rgba(255,255,255,0.15)" />
              </linearGradient>
            </defs>
            <path fill={`url(#sg${i}${fill})`} d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
          </svg>
        );
      })}
    </span>
  );
}

/** Club / national-team crest drawn from kit colours. */
export function Crest({ kit, label, size = 36 }: { kit: Kit; label?: string; size?: number }) {
  const id = `cr-${kit.primary.replace('#', '')}-${kit.secondary.replace('#', '')}-${kit.style}`;
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 40 46" className="shrink-0 drop-shadow">
      <defs>
        <clipPath id={id}><path d="M20 1 L38 7 V22 C38 34 29 41 20 45 C11 41 2 34 2 22 V7 Z" /></clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="40" height="46" fill={kit.primary} />
        {kit.style === 'stripes' && [4, 14, 24, 34].map((x) => <rect key={x} x={x} y="0" width="5" height="46" fill={kit.secondary} />)}
        {kit.style === 'hoops' && [6, 18, 30].map((y) => <rect key={y} x="0" y={y} width="40" height="6" fill={kit.secondary} />)}
        {kit.style === 'halves' && <rect x="20" y="0" width="20" height="46" fill={kit.secondary} />}
        {kit.style === 'sash' && <path d="M-2 4 L8 -2 L44 40 L34 48 Z" fill={kit.secondary} />}
        {kit.style === 'plain' && <rect x="0" y="30" width="40" height="16" fill={kit.secondary} />}
      </g>
      <path d="M20 1 L38 7 V22 C38 34 29 41 20 45 C11 41 2 34 2 22 V7 Z" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
      {label && (
        <text x="20" y="25" textAnchor="middle" fontFamily="Bebas Neue, sans-serif" fontSize="12" fill="#fff" stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" paintOrder="stroke">
          {label}
        </text>
      )}
    </svg>
  );
}

// ───────── toasts ─────────

export interface ToastItem { id: number; text: string; tone: Tone | 'neutral'; icon?: string }
let toasts: ToastItem[] = [];
let toastSeq = 0;
const toastListeners = new Set<() => void>();
const emitToasts = () => toastListeners.forEach((l) => l());

export function toast(text: string, tone: ToastItem['tone'] = 'neutral', icon?: string, ms = 3200): void {
  const item = { id: ++toastSeq, text, tone, icon };
  toasts = [...toasts, item].slice(-5);
  emitToasts();
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== item.id); emitToasts(); }, ms);
}

export function Toaster() {
  const list = useSyncExternalStore((cb) => { toastListeners.add(cb); return () => toastListeners.delete(cb); }, () => toasts, () => toasts);
  return (
    <div className="fixed z-[60] bottom-20 md:bottom-6 right-4 left-4 md:left-auto flex flex-col gap-2 items-end pointer-events-none">
      <AnimatePresence>
        {list.map((x) => (
          <motion.div
            key={x.id}
            initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
            className={clsx('glass bg-bg-2/95 rounded-2xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2 max-w-sm',
              x.tone !== 'neutral' && TONE_TEXT[x.tone])}
          >
            {x.icon && <Icon name={x.icon} size={16} />}
            <span className="text-ink">{x.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Animated number (counts up/down on change). */
export function CountUp({ value, format = (v: number) => String(Math.round(v)) }: { value: number; format?: (v: number) => string }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const from = shown;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 600);
      setShown(from + (value - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{format(shown)}</>;
}
