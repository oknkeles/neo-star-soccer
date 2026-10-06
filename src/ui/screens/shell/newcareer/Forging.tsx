/** Dramatic loading sequence while the world and the story are generated. */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { t } from '../../../../core/i18n';

export default function Forging({ ai }: { ai: boolean }) {
  const steps = [
    t('shell.nc.forge.world'), t('shell.nc.forge.clubs'),
    ai ? t('shell.nc.forge.ai') : t('shell.nc.forge.story'),
    t('shell.nc.forge.agent'), t('shell.nc.forge.final'),
  ];
  const [i, setI] = useState(0);
  const [pct, setPct] = useState(4);

  useEffect(() => {
    const a = setInterval(() => setI((x) => Math.min(steps.length - 1, x + 1)), ai ? 3200 : 1500);
    const b = setInterval(() => setPct((p) => Math.min(93, p + (93 - p) * 0.06 + 0.4)), 120);
    return () => { clearInterval(a); clearInterval(b); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-bg px-6 overflow-hidden">
      <div className="absolute inset-0 opacity-40" style={{ background: 'radial-gradient(60% 50% at 50% 40%, rgba(184,255,60,0.18), transparent 70%)' }} />
      <div className="relative w-full max-w-sm text-center">
        <div className="relative mx-auto size-40">
          {[0, 1, 2].map((r) => (
            <motion.span key={r} className="absolute inset-0 rounded-full border border-accent/40"
              animate={{ scale: [0.6, 1.5], opacity: [0.7, 0] }} transition={{ duration: 2.4, repeat: Infinity, delay: r * 0.8, ease: 'easeOut' }} />
          ))}
          <motion.svg viewBox="0 0 100 100" className="absolute inset-6" animate={{ rotate: 360 }} transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}>
            <circle cx="50" cy="50" r="46" fill="#f4f7f2" stroke="#0b1711" strokeWidth="3" />
            <polygon points="50,28 66,40 60,60 40,60 34,40" fill="#0b1711" />
            {[0, 72, 144, 216, 288].map((deg) => <line key={deg} x1="50" y1="28" x2="50" y2="6" stroke="#0b1711" strokeWidth="3" transform={`rotate(${deg} 50 50)`} />)}
          </motion.svg>
        </div>
        <div className="h-16 mt-8 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} className="font-display text-3xl sm:text-4xl leading-tight">
              {steps[i]}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="mt-4 h-1.5 rounded-full bg-white/8 overflow-hidden">
          <motion.div className="h-full rounded-full bg-accent shadow-[0_0_14px_rgba(184,255,60,0.9)]" animate={{ width: `${pct}%` }} transition={{ ease: 'linear', duration: 0.2 }} />
        </div>
        <div className="mt-3 text-xs text-ink-mute tracking-wider uppercase">{ai ? t('shell.nc.forge.aiNote') : t('shell.nc.forge.note')}</div>
      </div>
    </div>
  );
}
