/** Effect hints / results as animated chips (events, press answers). */
import { motion } from 'framer-motion';
import type { AttrKey, Effects, RelKey } from '../../../core/types';
import { t } from '../../../core/i18n';
import { Icon, clsx } from '../../components/kit';
import { money } from './helpers';

export interface Chip { key: string; icon: string; label: string; value: string; tone: 'accent' | 'gold' | 'danger' | 'info' | 'violet' }

const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');

export function effectChips(fx: Effects | undefined): Chip[] {
  if (!fx) return [];
  const out: Chip[] = [];
  const add = (key: string, icon: string, label: string, n: number | undefined, fmt?: (a: number) => string, tone?: Chip['tone']) => {
    if (!n) return;
    out.push({
      key, icon, label, value: `${sign(n)}${fmt ? fmt(Math.abs(n)) : Math.abs(Math.round(n))}`,
      tone: n < 0 ? 'danger' : tone ?? 'accent',
    });
  };
  add('money', 'coin', t('common.money'), fx.money, money, 'gold');
  add('fame', 'star', t('common.fame'), fx.fame, undefined, 'gold');
  add('followers', 'users', t('common.followers'), fx.followers, undefined, 'info');
  add('energy', 'zap', t('common.energy'), fx.energy);
  add('morale', 'smile', t('common.morale'), fx.morale);
  add('form', 'trend_up', t('common.form'), fx.form);
  for (const k of Object.keys(fx.rel ?? {}) as RelKey[]) add(`rel-${k}`, 'heart', t(`common.rel.${k}`), fx.rel?.[k], undefined, 'violet');
  for (const k of Object.keys(fx.xp ?? {}) as AttrKey[]) add(`xp-${k}`, 'dumbbell', t(`common.attr.${k}`), fx.xp?.[k], undefined, 'info');
  if (fx.injuryWeeks && fx.injuryWeeks > 0) {
    out.push({ key: 'injury', icon: 'hospital', label: t('shell.fx.injury'), value: t('shell.fx.weeks', { n: fx.injuryWeeks }), tone: 'danger' });
  }
  return out;
}

const TONE: Record<Chip['tone'], string> = {
  accent: 'text-accent bg-accent/10 border-accent/25',
  gold: 'text-gold bg-gold/10 border-gold/25',
  danger: 'text-danger bg-danger/10 border-danger/25',
  info: 'text-info bg-info/10 border-info/25',
  violet: 'text-violet bg-violet/10 border-violet/25',
};

export function ChipPill({ chip, delay = 0, animated = false, small = false }: { chip: Chip; delay?: number; animated?: boolean; small?: boolean }) {
  const body = (
    <>
      <Icon name={chip.icon} size={small ? 11 : 14} />
      <span className="text-ink-dim font-medium">{chip.label}</span>
      <span className="font-bold tabular-nums">{chip.value}</span>
    </>
  );
  const cls = clsx('inline-flex items-center gap-1.5 rounded-full border', small ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1.5 text-sm', TONE[chip.tone]);
  if (!animated) return <span className={cls}>{body}</span>;
  return (
    <motion.span
      className={cls}
      initial={{ opacity: 0, scale: 0.5, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 380, damping: 18 }}
    >
      {body}
    </motion.span>
  );
}

export function EffectChips({ effects, animated, small, className, startDelay = 0.15 }: {
  effects: Effects | undefined; animated?: boolean; small?: boolean; className?: string; startDelay?: number;
}) {
  const chips = effectChips(effects);
  if (!chips.length) return null;
  return (
    <div className={clsx('flex flex-wrap gap-1.5', className)}>
      {chips.map((c, i) => <ChipPill key={c.key} chip={c} animated={animated} small={small} delay={startDelay + i * 0.09} />)}
    </div>
  );
}
