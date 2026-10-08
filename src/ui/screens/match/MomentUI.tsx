import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, ChevronRight, FastForward, Play, RotateCcw } from 'lucide-react';
import type { CameraMode, MomentResult, MomentType } from '../../../core/types';
import type { MomentKind } from '../../../match/flow/api';
import { t } from '../../../core/i18n';
import { getSettings } from '../../../core/settings';
import '../../../match/view2d/strings';
import { Button, clsx } from '../../components/kit';
import { resultTone, type ResultTone } from './helpers';

/** The moment starts by itself after this short beat (no click needed). */
const AUTO_START_MS = 850;
/** The outcome card returns to the ticker after this (hover / tap holds it). */
const RESULT_MS = 1200;

export function momentTitle(type: MomentType, kind: MomentKind | null): string {
  return kind === 'shootout' ? t('match.mt.shootout') : t(`match.mt.${type}`);
}
/** The simple 2D top-down view (optional; 3D is the default). Both share the same controls. */
export const is2D = (): boolean => getSettings().matchView === '2d';

export function momentTip(type: MomentType, kind: MomentKind | null): string {
  return kind === 'shootout' ? t('v2d.tip.shootout') : t(`v2d.tip.${type}`);
}

/** Short intro card before a moment (minute, title, one-line tip); starts by itself in < 1 s. */
export function MomentIntro({ type, kind, clock, scoreLine, onPlay, onSimulate }: {
  type: MomentType; kind: MomentKind | null; clock: string; scoreLine: ReactNode; onPlay: () => void; onSimulate: () => void;
}) {
  const auto = true;
  const fired = useRef(false);
  const play = () => { if (!fired.current) { fired.current = true; onPlay(); } };
  const sim = () => { if (!fired.current) { fired.current = true; onSimulate(); } };

  useEffect(() => {
    if (!auto) return;
    const id = window.setTimeout(play, AUTO_START_MS);
    return () => clearTimeout(id);
  }); // re-armed each render while auto is on

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // (no letter shortcuts here: WASD may already be held for the first run)
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const tag = kind === 'lastgasp' ? t('match.tag.lastgasp') : kind === 'followup' ? t('match.tag.followup') : kind === 'shootout' ? t('match.tag.shootout') : null;
  const title = momentTitle(type, kind);

  return (
    <motion.div
      className="fixed inset-0 z-40 grid place-items-center px-5 bg-black/80 backdrop-blur-md"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div className="absolute left-1/2 top-1/2 w-[140vmax] h-[140vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(184,255,60,0.18), transparent 55%)' }}
          initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }} />
        <motion.div className="absolute inset-x-0 top-1/2 h-px bg-accent/40" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.5 }} />
      </div>
      <div className="relative w-full max-w-md text-center">
        {tag && (
          <motion.div initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="inline-block mb-3 px-3 py-1 rounded-full bg-gold text-bg text-xs font-black tracking-[0.2em] animate-nss-pulse">{tag}</motion.div>
        )}
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.2 }}
          className="font-display text-6xl text-ink-dim tabular-nums">{clock}</motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}
          className="font-display text-5xl sm:text-6xl leading-none text-accent neon-text mt-1">{title}</motion.h2>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1, duration: 0.2 }} className="mt-4 text-ink text-base sm:text-lg">
          {momentTip(type, kind)}
        </motion.p>
        <div className="mt-3 text-sm text-ink-dim">{scoreLine}</div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1, duration: 0.2 }} className="mt-7 grid grid-cols-[1fr_2fr] gap-2">
          <Button size="lg" variant="secondary" onClick={sim}><FastForward size={18} />{t('match.mo.simulate')}</Button>
          <Button size="lg" variant="primary" onClick={play} className="relative overflow-hidden">
            {auto && (
              <motion.span className="absolute inset-y-0 left-0 bg-white/25" initial={{ width: '0%' }} animate={{ width: '100%' }}
                transition={{ duration: AUTO_START_MS / 1000, ease: 'linear' }} />
            )}
            <span className="relative flex items-center gap-2"><Play size={18} />{t('match.mo.play')}</span>
          </Button>
        </motion.div>
        {auto && <div className="mt-2 text-[11px] text-ink-mute">{t('match.mo.autostart')}</div>}
      </div>
    </motion.div>
  );
}

/** Overlay HUD on top of the 3D view (top strip only — the bottom belongs to the view's controls). */
export function MomentHud({ left, label, camera, onCamera, onSkip, skipLabel, extra }: {
  left: ReactNode; label: string; camera: CameraMode; onCamera: () => void; onSkip?: () => void; skipLabel?: string; extra?: ReactNode;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-2 sm:p-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="flex items-start gap-2">
        <div className="pointer-events-auto rounded-xl bg-black/55 backdrop-blur border border-white/10 px-2.5 py-1.5 text-sm">{left}</div>
        <div className="flex-1 flex justify-center min-w-0">
          <div className="hidden sm:block truncate rounded-full bg-black/50 backdrop-blur px-3 py-1 font-display text-lg tracking-wider text-accent">{label}</div>
        </div>
        {extra}
        <button onClick={onCamera} title={is2D() ? t(`v2d.zoom.${camera}`) : t(`match.cam.${camera}`)}
          className="pointer-events-auto h-10 px-3 rounded-xl bg-black/55 backdrop-blur border border-white/10 text-ink flex items-center gap-1.5 text-xs font-semibold cursor-pointer hover:bg-black/70">
          <Camera size={16} /><span className="hidden sm:inline">{is2D() ? t(`v2d.zoom.${camera}`) : t(`match.cam.${camera}`)}</span>
        </button>
        {onSkip && (
          <button onClick={onSkip}
            className="pointer-events-auto h-10 px-3 rounded-xl bg-black/55 backdrop-blur border border-white/10 text-ink flex items-center gap-1.5 text-xs font-semibold cursor-pointer hover:bg-black/70">
            <FastForward size={16} />{skipLabel ?? t('match.mo.skip')}
          </button>
        )}
      </div>
    </div>
  );
}

const TONE_CLASS: Record<ResultTone, string> = {
  great: 'text-accent neon-text', good: 'text-info', neutral: 'text-ink', bad: 'text-danger',
};

/** Big outcome banner after a moment with optional replay; auto-continues. */
export function MomentResultCard({ result, line, delta, canReplay, onReplay, onContinue, overlay }: {
  result: MomentResult; line: string; delta: number; canReplay: boolean; onReplay: () => void; onContinue: () => void;
  /** true = drawn over the 3D view (transparent background). */
  overlay: boolean;
}) {
  const [hold, setHold] = useState(false);
  const tone = resultTone(result);
  const done = useRef(false);
  const cont = () => { if (!done.current) { done.current = true; onContinue(); } };

  useEffect(() => {
    if (hold) return;
    const id = window.setTimeout(cont, RESULT_MS);
    return () => clearTimeout(id);
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cont(); }
      else if (canReplay && !done.current && e.key.toLowerCase() === 't') { setHold(true); onReplay(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <motion.div
      className={clsx('fixed inset-0 z-50 grid place-items-center px-5', overlay ? 'bg-black/35' : 'bg-black/80 backdrop-blur-md')}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="w-full max-w-md text-center" onPointerDown={() => setHold(true)} onPointerEnter={() => setHold(true)}>
        <motion.div
          initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 20 }}
          className={clsx('font-display text-7xl sm:text-8xl leading-none tracking-wide drop-shadow-[0_6px_24px_rgba(0,0,0,0.8)]', TONE_CLASS[tone])}
        >
          {t(`match.ob.${result.outcome}`)}
        </motion.div>
        {delta !== 0 && (
          <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
            className={clsx('inline-block mt-3 rounded-full px-3 py-1 font-display text-2xl tabular-nums', delta > 0 ? 'bg-accent text-bg' : 'bg-danger text-white')}>
            {delta > 0 ? '+' : ''}{delta.toFixed(1)}
          </motion.div>
        )}
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="mt-3 text-ink text-base drop-shadow">{line}</motion.p>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className={clsx('mt-6 grid gap-2', canReplay ? 'grid-cols-2' : 'grid-cols-1')}>
          {canReplay && (
            <Button size="lg" variant="gold" onClick={() => { setHold(true); onReplay(); }}><RotateCcw size={18} />{t('match.mo.replay')}</Button>
          )}
          <Button size="lg" variant="primary" onClick={cont}>{t('match.mo.continue')}<ChevronRight size={18} /></Button>
        </motion.div>
      </div>
    </motion.div>
  );
}

/** Small floating button shown while a replay plays. */
export function ReplayBar({ onDone }: { onDone: () => void }) {
  return (
    <AnimatePresence>
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="fixed z-50 bottom-[max(1rem,env(safe-area-inset-bottom))] inset-x-0 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-black/70 backdrop-blur border border-white/10 pl-4 pr-1.5 py-1.5">
          <span className="font-display text-lg tracking-wider text-gold animate-nss-pulse">{t('match.mo.replayTag')}</span>
          <Button size="sm" variant="primary" onClick={onDone}>{t('match.mo.continue')}<ChevronRight size={14} /></Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
