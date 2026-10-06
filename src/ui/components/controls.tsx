/**
 * Small form controls shared by the shell screens (kit.tsx has no inputs).
 * Switch, Slider, Segmented, SettingRow, TextField.
 */
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { clsx } from './kit';

export function Switch({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-7 w-12 shrink-0 rounded-full border transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none',
        checked ? 'bg-accent/90 border-accent' : 'bg-white/8 border-line',
      )}
    >
      <motion.span
        className={clsx('absolute top-0.5 size-5.5 rounded-full shadow', checked ? 'bg-bg' : 'bg-ink-dim')}
        animate={{ left: checked ? 22 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      />
    </button>
  );
}

export function Slider({ value, onChange, min = 0, max = 1, step = 0.01, format, label, disabled }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number;
  format?: (v: number) => string; label?: string; disabled?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={clsx('flex items-center gap-3 w-full', disabled && 'opacity-40 pointer-events-none')}>
      <input
        type="range" min={min} max={max} step={step} value={value} aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="nss-range flex-1 h-2 rounded-full appearance-none cursor-pointer accent-[#b8ff3c]"
        style={{ background: `linear-gradient(90deg, #b8ff3c ${pct}%, rgba(255,255,255,0.1) ${pct}%)` }}
      />
      {format && <span className="w-12 text-right text-sm font-bold tabular-nums text-ink-dim">{format(value)}</span>}
    </div>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, size = 'md', block }: {
  options: { id: T; label: ReactNode; icon?: ReactNode }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md'; block?: boolean;
}) {
  const gid = useId();
  return (
    <div className={clsx('flex gap-1 p-1 rounded-xl bg-white/4 border border-line', block ? 'w-full' : 'w-fit max-w-full overflow-x-auto')}>
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(o.id)}
          className={clsx(
            'relative flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap cursor-pointer transition-colors',
            size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm', block && 'flex-1',
            value === o.id ? 'text-bg' : 'text-ink-dim hover:text-ink',
          )}
        >
          {value === o.id && <motion.span layoutId={`seg-${gid}`} className="absolute inset-0 rounded-lg bg-accent" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
          <span className="relative flex items-center gap-1.5">{o.icon}{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** A labelled settings line: title + optional description on the left, control on the right (stacked on mobile). */
export function SettingRow({ title, desc, children, stack }: { title: ReactNode; desc?: ReactNode; children: ReactNode; stack?: boolean }) {
  return (
    <div className={clsx('py-3 border-b border-line/60 last:border-0 flex gap-3', stack ? 'flex-col' : 'flex-col sm:flex-row sm:items-center sm:justify-between')}>
      <div className="min-w-0 sm:max-w-[58%]">
        <div className="text-sm font-semibold">{title}</div>
        {desc && <div className="text-xs text-ink-dim mt-0.5 leading-relaxed">{desc}</div>}
      </div>
      <div className={clsx('shrink-0', !stack && 'sm:flex sm:justify-end')}>{children}</div>
    </div>
  );
}

export function TextField({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="block">
      {label && <span className="block text-[11px] uppercase tracking-[0.14em] font-bold text-ink-mute mb-1.5">{label}</span>}
      <input
        id={id}
        {...rest}
        className={clsx(
          'w-full h-11 rounded-xl bg-white/5 border border-line px-3.5 text-base text-ink placeholder:text-ink-mute',
          'outline-none focus:border-accent/60 focus:bg-white/7 transition-colors', className,
        )}
      />
    </label>
  );
}
