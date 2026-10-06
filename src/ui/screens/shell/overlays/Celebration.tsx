/** Trophy / award / level-up / goal celebration with confetti. */
import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Rng } from '../../../../core/rng';
import { t } from '../../../../core/i18n';
import { Button, Icon, clsx } from '../../../components/kit';

export interface CelebrationItem {
  id: number;
  kind: 'trophy' | 'award' | 'levelup' | 'milestone';
  title: string;
  subtitle: string;
}

const META: Record<CelebrationItem['kind'], { icon: string; tone: string; glow: string; heading: string }> = {
  trophy: { icon: 'trophy', tone: 'text-gold', glow: 'rgba(255,203,71,0.55)', heading: 'shell.cel.trophy' },
  award: { icon: 'medal', tone: 'text-gold', glow: 'rgba(255,203,71,0.45)', heading: 'shell.cel.award' },
  levelup: { icon: 'rocket', tone: 'text-accent', glow: 'rgba(184,255,60,0.55)', heading: 'shell.cel.levelup' },
  milestone: { icon: 'target', tone: 'text-accent-2', glow: 'rgba(60,255,176,0.5)', heading: 'shell.cel.milestone' },
};

const COLORS = ['#b8ff3c', '#ffcb47', '#3cffb0', '#49c6ff', '#a98bff', '#ffffff', '#ff4f64'];

function Confetti({ seed }: { seed: number }) {
  const bits = useMemo(() => {
    const rng = new Rng(seed * 7919 + 13);
    return Array.from({ length: 56 }, (_, i) => ({
      i,
      x: rng.float(2, 98),
      w: rng.float(6, 12),
      h: rng.float(8, 16),
      delay: rng.float(0, 0.9),
      dur: rng.float(2.4, 4.2),
      drift: rng.float(-60, 60),
      spin: rng.float(-720, 720),
      color: COLORS[rng.int(0, COLORS.length - 1)],
      round: rng.chance(0.3),
    }));
  }, [seed]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {bits.map((b) => (
        <motion.span
          key={b.i}
          className="absolute top-0"
          style={{ left: `${b.x}%`, width: b.w, height: b.round ? b.w : b.h, background: b.color, borderRadius: b.round ? 999 : 2 }}
          initial={{ y: -40, opacity: 1, rotate: 0 }}
          animate={{ y: '105vh', x: b.drift, rotate: b.spin, opacity: [1, 1, 0.8] }}
          transition={{ delay: b.delay, duration: b.dur, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}

export function Celebration({ item, onClose }: { item: CelebrationItem; onClose: () => void }) {
  const m = META[item.kind];
  useEffect(() => {
    const id = setTimeout(onClose, 7000);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(id); window.removeEventListener('keydown', onKey); };
  }, [item.id, onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[70] grid place-items-center p-6 bg-black/75 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <Confetti seed={item.id} />
      <motion.div
        initial={{ scale: 0.5, y: 40, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16 }}
        className="relative text-center max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <motion.div
          className="absolute left-1/2 top-[38px] -translate-x-1/2 size-48 rounded-full"
          style={{ background: `radial-gradient(circle, ${m.glow}, transparent 68%)` }}
          animate={{ scale: [1, 1.25, 1], opacity: [0.7, 1, 0.7] }} transition={{ duration: 2, repeat: Infinity }}
        />
        <motion.div
          initial={{ rotate: -20, scale: 0.4 }} animate={{ rotate: [0, -6, 6, 0], scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 12, rotate: { duration: 0.9, delay: 0.3 } }}
          className={clsx('relative mx-auto grid place-items-center size-32 rounded-full bg-bg-2 border-2 border-current', m.tone)}
        >
          <Icon name={m.icon} size={64} />
        </motion.div>
        <div className={clsx('relative font-display text-6xl leading-none mt-5 neon-text', m.tone)}>{t(m.heading)}</div>
        <div className="relative font-display text-3xl mt-3 leading-tight">{item.title}</div>
        {item.subtitle && <div className="relative text-ink-dim mt-2 text-sm">{item.subtitle}</div>}
        <Button variant={item.kind === 'levelup' || item.kind === 'milestone' ? 'primary' : 'gold'} size="lg" className="relative mt-6" onClick={onClose}>{t('shell.cel.cta')}</Button>
      </motion.div>
    </motion.div>
  );
}
