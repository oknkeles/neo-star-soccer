/**
 * Route 'drill' (params.type = drill_free_kick | drill_finishing | drill_passing).
 * Intro → real-time drill in the 3D view → score → game.completeDrill() rewards → back to training.
 * Owner: match-flow agent.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ChevronRight, Crosshair, Footprints, Hand, MousePointerClick, Play, Target, X } from 'lucide-react';
import type { MomentResult, MomentSetup } from '../../../core/types';
import { DRILL_TYPES, drillSetup, safeAutoResolve, type DrillType } from '../../../match/flow/api';
import { updateSettings } from '../../../core/settings';
import { t } from '../../../core/i18n';
import { clamp } from '../../../core/util';
import { audio } from '../../../audio/api';
import { game, useGame } from '../../../game/api';
import { replace } from '../../router';
import { Button, Card, toast, clsx } from '../../components/kit';
import { drillSeed, momentRng, nextCamera, ratingGrade } from './helpers';
import { useLiveSettings } from './parts';
import { MomentStage, type StageApi } from './MomentStage';
import { MomentHud, is2D } from './MomentUI';
import '../../../match/flow/strings';

type Phase = 'intro' | 'play' | 'done';

const ICON: Record<DrillType, typeof Target> = { drill_free_kick: Target, drill_finishing: Crosshair, drill_passing: Footprints };
const FOCUS: Record<DrillType, string[]> = {
  drill_free_kick: ['curl', 'shooting'], drill_finishing: ['shooting', 'composure'], drill_passing: ['passing', 'vision'],
};

/** Drill score 0..100 from a result (engine drill state preferred). */
export function drillScoreOf(result: MomentResult | null, engineScore: number | null, attempts: number): number {
  if (result && typeof result.drillScore === 'number' && Number.isFinite(result.drillScore)) return Math.round(clamp(result.drillScore, 0, 100));
  if (engineScore !== null && attempts > 0) return Math.round(clamp(engineScore, 0, 100));
  return 0;
}

export default function DrillScreen({ params }: { params: Record<string, string> }) {
  const type = params.type as DrillType;
  const valid = DRILL_TYPES.includes(type);
  const { state } = useGame();
  const settings = useLiveSettings();
  const [phase, setPhase] = useState<Phase>('intro');
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [notes, setNotes] = useState<string[] | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [hud, setHud] = useState<{ attempt: number; attempts: number; score: number } | null>(null);
  const stageApi = useRef<StageApi | null>(null);
  const applied = useRef(false);

  const setup = useMemo<MomentSetup | null>(() => {
    if (!valid || !state) return null;
    try { return drillSetup(state, type, drillSeed(state, type, round)); } catch { return null; }
  }, [valid, state, type, round]);

  // live attempts / score from the engine
  useEffect(() => {
    if (phase !== 'play') return;
    const id = window.setInterval(() => {
      const d = stageApi.current?.engine.state.drill;
      if (d) setHud((h) => (h && h.attempt === d.attempt && h.score === d.score && h.attempts === d.attempts ? h : { ...d }));
    }, 150);
    return () => clearInterval(id);
  }, [phase]);

  const complete = (result: MomentResult | null) => {
    if (!setup) return;
    const engineScore = stageApi.current?.engine.state.drill?.score ?? hud?.score ?? null;
    const s = drillScoreOf(result, engineScore, setup.drill?.attempts ?? 0);
    setScore(s);
    setPhase('done');
    if (applied.current) return;
    applied.current = true;
    try {
      setNotes(game.completeDrill(type, s));
      audio.play(s >= 60 ? 'levelup' : 'notify');
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
      setNotes([]);
    }
  };

  const fallback = (err: unknown) => {
    console.warn('[drill] 3D view unavailable, auto-resolving', err);
    toast(t('match.mo.webglFallback'), 'gold', 'zap', 4200);
    if (setup) complete(safeAutoResolve(setup, momentRng(setup)));
  };

  const toggleCamera = () => {
    const next = nextCamera(settings.camera);
    updateSettings((s) => { s.camera = next; });
    stageApi.current?.setCamera(next);
  };

  if (!valid || !state) {
    return (
      <div className="min-h-full grid place-items-center px-4">
        <Card className="max-w-sm w-full text-center">
          <div className="text-danger font-semibold mb-3">{!state ? t('match.drill.noState') : t('match.drill.invalid')}</div>
          <Button variant="primary" onClick={() => replace(state ? 'training' : 'title')}><ArrowLeft size={16} />{t('match.drill.back')}</Button>
        </Card>
      </div>
    );
  }

  const Icon = ICON[type];
  const attempts = setup?.drill?.attempts ?? 0;

  if (phase === 'play' && setup) {
    return (
      <MomentStage key={round} setup={setup} apiRef={stageApi} onResult={complete} onFail={fallback}>
        <MomentHud
          left={
            <span className="flex items-center gap-3 font-semibold tabular-nums">
              <span>{t('match.mo.attempt', { n: Math.min(hud?.attempt ?? 1, hud?.attempts ?? attempts) || 1, m: hud?.attempts ?? attempts })}</span>
              <span className="text-accent">{t('match.mo.score', { n: hud?.score ?? 0 })}</span>
            </span>
          }
          label={t(`match.mt.${type}`)}
          camera={settings.camera}
          onCamera={toggleCamera}
          extra={
            <button onClick={() => replace('training')} aria-label={t('match.drill.quit')}
              className="pointer-events-auto h-10 w-10 grid place-items-center rounded-xl bg-black/55 backdrop-blur border border-white/10 text-ink cursor-pointer hover:bg-black/70">
              <X size={16} />
            </button>
          }
        />
      </MomentStage>
    );
  }

  if (phase === 'done') {
    const grade = ratingGrade(3 + (score / 100) * 7);
    return (
      <div className="min-h-full max-w-lg mx-auto px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10">
        <div className="text-center text-xs uppercase tracking-[0.2em] text-ink-dim font-bold">{t('match.drill.result')}</div>
        <div className="text-center font-display text-4xl mt-1">{t(`match.mt.${type}`)}</div>
        <Card className="mt-5 text-center" glow={score >= 70 ? 'gold' : score >= 45 ? 'accent' : undefined}>
          <div className="text-[11px] uppercase tracking-[0.16em] text-ink-mute font-bold">{t('match.drill.score')}</div>
          <ScoreCount value={score} />
          <div className={clsx('font-display text-2xl', score >= 70 ? 'text-gold' : score >= 45 ? 'text-accent' : 'text-ink-dim')}>{t(`match.grade.${grade}`)}</div>
        </Card>
        <Card title={t('match.drill.rewards')} icon="trend_up" className="mt-3">
          {notes === null ? <div className="text-ink-dim text-sm">{t('common.loading')}</div>
            : notes.length ? (
              <div className="flex flex-wrap gap-1.5">
                {notes.map((n, i) => (
                  <motion.span key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 + i * 0.08 }}
                    className="px-2.5 py-1 rounded-full bg-accent/10 border border-accent/25 text-sm">{n}</motion.span>
                ))}
              </div>
            ) : <div className="text-ink-mute text-sm">{applyError ?? t('match.drill.noRewards')}</div>}
        </Card>
        <Button block size="lg" variant="primary" className="mt-5" onClick={() => replace('training')}>
          {t('match.drill.back')}<ChevronRight size={18} />
        </Button>
      </div>
    );
  }

  // intro
  return (
    <div className="min-h-full max-w-lg mx-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10">
      <button onClick={() => replace('training')} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-ink-dim hover:text-ink cursor-pointer" aria-label={t('common.back')}>
        <ArrowLeft size={18} />
      </button>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mt-4 text-center">
        <motion.div initial={{ scale: 0.5, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}
          className="mx-auto w-20 h-20 rounded-3xl bg-accent/10 border border-accent/30 grid place-items-center text-accent shadow-[0_0_40px_-10px_rgba(184,255,60,0.6)]">
          <Icon size={40} />
        </motion.div>
        <h1 className="font-display text-5xl mt-4 leading-none text-accent neon-text">{t(`match.mt.${type}`)}</h1>
        <p className="mt-3 text-ink-dim leading-relaxed">{t(`match.drill.desc.${type}`)}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          <span className="px-2.5 py-1 rounded-full bg-white/5 border border-line text-xs">{t('match.drill.attempts', { n: attempts })}</span>
          {FOCUS[type].map((k) => (
            <span key={k} className="px-2.5 py-1 rounded-full bg-accent/10 border border-accent/25 text-xs text-accent">{t(`common.attr.${k}`)}</span>
          ))}
        </div>
      </motion.div>
      <Card title={t('match.drill.controls')} icon="gamepad" className="mt-6">
        <ul className="space-y-2.5 text-sm">
          <li className="flex gap-2.5"><MousePointerClick size={18} className="text-accent shrink-0" />{is2D() ? t('v2d.drill.shoot') : t('match.drill.ctrl.aim')}</li>
          <li className="flex gap-2.5"><Footprints size={18} className="text-accent shrink-0" />{is2D() ? t('v2d.drill.move') : t('match.drill.ctrl.move')}</li>
          <li className="flex gap-2.5"><Hand size={18} className="text-accent shrink-0" />{is2D() ? t('v2d.drill.pass') : t('match.drill.ctrl.call')}</li>
        </ul>
      </Card>
      <AnimatePresence>
        <Button block size="lg" variant="primary" className="mt-6" disabled={!setup}
          onClick={() => { audio.unlock(); audio.play('whistle_short'); applied.current = false; setHud(null); setPhase('play'); }}>
          <Play size={18} />{t('match.drill.start')}
        </Button>
      </AnimatePresence>
      <button className="hidden" onClick={() => setRound((r) => r + 1)} aria-hidden />
    </div>
  );
}

function ScoreCount({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + 300;
    const step = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - start) / 1200));
      setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <div className="font-display text-8xl leading-none tabular-nums my-2">{shown}</div>;
}
