/**
 * Route 'match' (params.fixtureId). Pre-match → live ticker → real-time 3D moments → full time.
 * Owner: match-flow agent.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import type { MatchEvent, MomentResult, MomentSetup } from '../../../core/types';
import type { MomentKind } from '../../../match/flow/api';
import { safeAutoResolve } from '../../../match/flow/api';
import { updateSettings } from '../../../core/settings';
import { t } from '../../../core/i18n';
import { round1 } from '../../../core/util';
import { audio } from '../../../audio/api';
import { game, useGame } from '../../../game/api';
import { back, navigate, replace } from '../../router';
import { Button, Card, Crest, toast } from '../../components/kit';
import { crowdLevel, isGoal, momentRng, nextCamera, ratingChip, tickDelay } from './helpers';
import { applySession, closeSession, openSession, type MatchSession } from './session';
import { DualStat, ScoreBug, teamColors, useLiveSettings } from './parts';
import { PreMatch } from './PreMatch';
import { LiveView } from './LiveView';
import { MomentStage, type StageApi } from './MomentStage';
import { MomentHud, MomentIntro, MomentResultCard, ReplayBar, momentTitle } from './MomentUI';
import { FullTime, type ApplyState } from './FullTime';
import '../../../match/flow/strings';

type Phase = 'pre' | 'live' | 'break' | 'intro' | 'moment' | 'result' | 'ft';

interface Pending { setup: MomentSetup; kind: MomentKind | null; clock: string }
interface Outcome { result: MomentResult; delta: number; line: string; stage: boolean; replaying: boolean }

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function MatchScreen({ params }: { params: Record<string, string> }) {
  const fixtureId = params.fixtureId ?? '';
  const { state } = useGame();
  const settings = useLiveSettings();
  const [session, setSession] = useState<MatchSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('pre');
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  const [paused, setPaused] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [splash, setSplash] = useState<MatchEvent | null>(null);
  const [apply, setApply] = useState<ApplyState>({ status: 'pending' });
  const [applyTry, setApplyTry] = useState(0);
  const stageApi = useRef<StageApi | null>(null);
  const holdUntil = useRef(0);

  // ── open (or resume) the match ──
  useEffect(() => {
    if (!fixtureId) { setError(t('match.err.noMatch')); return; }
    try {
      const s = openSession(fixtureId);
      setSession(s);
      const live = s.live;
      if (live.isOver()) setPhase('ft');
      else if (live.pendingSetup) {
        setPending({ setup: live.pendingSetup, kind: live.momentKind, clock: live.clockLabel() });
        setPhase('intro');
      } else if (live.period === 'pre') setPhase('pre');
      else if (live.period === 'ht' || live.period === 'et_break') setPhase('break');
      else { setPaused(true); setPhase('live'); }
    } catch (e) {
      setError(t('match.err.start', { msg: errMsg(e) }));
    }
  }, [fixtureId]);

  useEffect(() => () => audio.setCrowd(0), []);

  const ctx = session?.ctx ?? null;
  const live = session?.live ?? null;
  const colors = useMemo(() => (ctx ? teamColors(ctx.home.kit, ctx.away.kit) : { home: '#b8ff3c', away: '#49c6ff' }), [ctx]);
  const ourSide = live?.userSide ?? ctx?.userSide ?? null;

  // ── audio + goal splash for ticker events ──
  const onEvents = useCallback((events: MatchEvent[], sound: boolean) => {
    if (!sound) return;
    for (const e of events) {
      if (isGoal(e)) {
        const ours = ourSide ? e.side === ourSide : e.side === 'home';
        if (ours) { audio.burst('goal'); audio.play('net'); } else audio.burst(ourSide ? 'groan' : 'cheer');
        setSplash(e);
        holdUntil.current = performance.now() + 1700;
      } else if (e.kind === 'kickoff') audio.play('whistle_short');
      else if (e.kind === 'halftime' || e.kind === 'extra_time') audio.play('whistle_long');
      else if (e.kind === 'fulltime') audio.play('whistle_final');
      else if (e.kind === 'yellow' || e.kind === 'red') { audio.play('whistle_short'); if (e.kind === 'red') audio.burst('boo'); }
      else if (e.kind === 'save' || e.kind === 'woodwork' || e.kind === 'penalty_miss') { audio.burst('ooh'); if (e.kind === 'woodwork') audio.play('post'); }
      else if (e.kind === 'shootout' && e.side) audio.play('kick_hard');
    }
  }, [ourSide]);

  useEffect(() => {
    if (!splash) return;
    const id = window.setTimeout(() => setSplash(null), 1900);
    return () => clearTimeout(id);
  }, [splash]);

  // crowd bed follows momentum & stakes
  useEffect(() => {
    if (!live || !ctx) return;
    if (phase === 'live' || phase === 'break') {
      audio.setCrowd(crowdLevel(live.momentum, ctx.importance, live.minute, ctx.attendance) * (phase === 'break' ? 0.6 : 1));
    } else if (phase === 'intro') audio.setCrowd(0.75);
  }, [live, ctx, phase, version]);

  // ── the ticker ──
  const step = useCallback(() => {
    if (!live) return;
    const r = live.tick();
    onEvents(r.events, true);
    if (r.moment) {
      setPending({ setup: r.moment, kind: live.momentKind, clock: live.clockLabel() });
      setPhase('intro');
    } else if (!live.isOver() && (live.period === 'ht' || live.period === 'et_break')) {
      setPhase('break');
    }
    bump();
  }, [live, onEvents]);

  useEffect(() => {
    if (phase !== 'live' || !live) return;
    if (live.isOver()) {
      const id = window.setTimeout(() => setPhase('ft'), 1800);
      return () => clearTimeout(id);
    }
    if (paused) return;
    const wait = Math.max(tickDelay(settings.matchSpeed, live.period), holdUntil.current - performance.now());
    const id = window.setTimeout(step, wait);
    return () => clearTimeout(id);
  }, [phase, paused, live, version, settings.matchSpeed, step]);

  // Space pauses the ticker
  useEffect(() => {
    if (phase !== 'live') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  // ── moments ──
  const finishMoment = useCallback((result: MomentResult, stage: boolean) => {
    if (!live) return;
    const before = live.userRating;
    const evs = live.resolveMoment(result);
    onEvents(evs, !stage);
    if (!stage) setSplash(null);
    const player = live.userId ? live.playerName(live.userId) : '';
    const line = evs.find(isGoal)?.text ?? evs.find((e) => e.user)?.text ?? evs[0]?.text ?? t(`match.o.${result.outcome}`, { player });
    setOutcome({ result, delta: round1(live.userRating - before), line, stage, replaying: false });
    setPhase('result');
    bump();
  }, [live, onEvents]);

  const simulateMoment = useCallback((setup: MomentSetup) => {
    finishMoment(safeAutoResolve(setup, momentRng(setup)), false);
  }, [finishMoment]);

  const onStageFail = useCallback((err: unknown) => {
    console.warn('[match] 3D moment unavailable, auto-resolving', err);
    toast(t('match.mo.webglFallback'), 'gold', 'zap', 4200);
    if (pending) simulateMoment(pending.setup);
  }, [pending, simulateMoment]);

  const afterMoment = useCallback(() => {
    if (!live) return;
    setOutcome(null);
    setPending(null);
    if (live.isOver()) setPhase('ft');
    else if (live.period === 'ht' || live.period === 'et_break') setPhase('break');
    else setPhase('live');
  }, [live]);

  const toggleCamera = () => {
    const next = nextCamera(settings.camera);
    updateSettings((s) => { s.camera = next; });
    stageApi.current?.setCamera(next);
  };

  // ── whole-match actions ──
  const startMatch = () => {
    audio.unlock();
    setPaused(false);
    setPhase('live');
  };
  const simulateAll = () => {
    if (!live) return;
    audio.unlock();
    live.simulateToEnd();
    audio.play('whistle_final');
    setPending(null);
    setOutcome(null);
    bump();
    setPhase('ft');
  };

  // ── full time: apply once ──
  useEffect(() => {
    if (phase !== 'ft' || !session) return;
    let alive = true;
    setApply({ status: 'pending' });
    applySession(session)
      .then((notes) => {
        if (!alive) return;
        let press = false;
        try { press = game.agenda().pressAvailable === 'post_match'; } catch { press = false; }
        setApply({ status: 'done', notes, press });
      })
      .catch((e: unknown) => { if (alive) setApply({ status: 'error', message: errMsg(e) }); });
    return () => { alive = false; };
  }, [phase, session, applyTry]);

  const summary = useMemo(() => (phase === 'ft' && live ? live.summary() : null), [phase, live]);

  useEffect(() => {
    if (phase !== 'ft' || !summary) return;
    const side = live?.userSide;
    const w = live?.winnerSide();
    if (side && w === side) audio.burst('cheer');
    else if (side && w && w !== side) audio.burst('groan');
    else audio.burst('applause');
    const id = window.setTimeout(() => audio.setCrowd(0.12), 2500);
    return () => clearTimeout(id);
  }, [phase, summary, live]);

  const leave = (to: 'hub' | 'press') => {
    closeSession(fixtureId);
    audio.setCrowd(0);
    if (to === 'press') navigate('press', { occasion: 'post_match' });
    else replace('hub');
  };

  // ───────────────────────── render ─────────────────────────

  if (error || !session || !ctx || !live) {
    return (
      <div className="min-h-full grid place-items-center px-4">
        {error ? (
          <Card className="max-w-sm w-full text-center">
            <div className="text-danger font-semibold mb-3">{error}</div>
            <Button variant="primary" onClick={() => replace('hub')}><ArrowLeft size={16} />{t('match.err.back')}</Button>
          </Card>
        ) : <div className="text-ink-dim">{t('common.loading')}</div>}
      </div>
    );
  }

  if (phase === 'pre') {
    return <PreMatch ctx={ctx} state={state} onStart={startMatch} onSimulate={simulateAll} onBack={() => back('hub')} />;
  }

  if (phase === 'ft' && summary) {
    return (
      <FullTime
        ctx={ctx} live={live} summary={summary} state={state} apply={apply}
        onRetry={() => setApplyTry((n) => n + 1)}
        onContinue={() => leave('hub')}
        onPress={() => leave('press')}
      />
    );
  }

  const scoreLine = `${ctx.home.shortName} ${live.homeGoals}-${live.awayGoals} ${ctx.away.shortName}`;
  const showStage = !!pending && (phase === 'moment' || (phase === 'result' && !!outcome?.stage));

  return (
    <>
      <LiveView
        ctx={ctx} live={live} state={state} speed={settings.matchSpeed} paused={paused} version={version} colors={colors}
        onPause={() => setPaused((p) => !p)}
        onSpeed={(s) => updateSettings((x) => { x.matchSpeed = s; })}
        onSimToEnd={simulateAll}
      />

      {/* goal splash */}
      <AnimatePresence>
        {splash && phase === 'live' && (
          <motion.div key="splash" className="fixed inset-x-0 top-28 z-30 flex justify-center px-4 pointer-events-none"
            initial={{ opacity: 0, scale: 0.6, y: -20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 1.2 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
            <div className="glass bg-bg-2/90 rounded-3xl px-6 py-4 flex items-center gap-4 shadow-[0_0_60px_-10px_rgba(184,255,60,0.6)]">
              {splash.side && <Crest kit={ctx[splash.side].kit} label={ctx[splash.side].shortName} size={48} />}
              <div>
                <div className="font-display text-5xl leading-none text-accent neon-text">{t('match.ob.goal')}</div>
                <div className="text-sm text-ink mt-1">{splash.playerId ? live.playerName(splash.playerId) : ''} · {live.clockLabel(splash)}</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* half-time / extra-time break */}
      <AnimatePresence>
        {phase === 'break' && (
          <BreakCard key="break" session={session} colors={colors} onContinue={() => { audio.play('whistle_short'); setPhase('live'); setPaused(false); }} />
        )}
      </AnimatePresence>

      {/* moment intro */}
      <AnimatePresence>
        {phase === 'intro' && pending && (
          <MomentIntro
            key={`intro-${pending.setup.seed}`}
            type={pending.setup.type} kind={pending.kind} clock={pending.clock} scoreLine={scoreLine}
            onPlay={() => { audio.unlock(); audio.play('whistle_short'); setPhase('moment'); }}
            onSimulate={() => simulateMoment(pending.setup)}
          />
        )}
      </AnimatePresence>

      {/* the 3D moment */}
      {showStage && pending && (
        <MomentStage
          setup={pending.setup}
          apiRef={stageApi}
          onResult={(r) => finishMoment(r, true)}
          onFail={onStageFail}
        >
          {phase === 'moment' && (
            <MomentHud
              left={<span className="font-semibold tabular-nums">{scoreLine} <span className="text-accent ml-1">{pending.clock}</span></span>}
              label={momentTitle(pending.setup.type, pending.kind)}
              camera={settings.camera}
              onCamera={toggleCamera}
              onSkip={() => stageApi.current?.skip()}
            />
          )}
        </MomentStage>
      )}

      {/* moment outcome */}
      <AnimatePresence>
        {phase === 'result' && outcome && !outcome.replaying && (
          <MomentResultCard
            key="result"
            result={outcome.result} line={outcome.line} delta={outcome.delta} overlay={outcome.stage}
            canReplay={outcome.stage && outcome.result.replay.length > 0 && (outcome.result.goalFor || outcome.result.goalAgainst || outcome.result.highlight)}
            onReplay={() => {
              const ok = stageApi.current?.replay(outcome.result.replay, afterMoment) ?? false;
              if (ok) setOutcome({ ...outcome, replaying: true });
              else afterMoment();
            }}
            onContinue={afterMoment}
          />
        )}
      </AnimatePresence>
      {phase === 'result' && outcome?.replaying && <ReplayBar onDone={afterMoment} />}
    </>
  );
}

/** Half-time / extra-time interval card with the numbers and the manager's words. */
function BreakCard({ session, colors, onContinue }: { session: MatchSession; colors: { home: string; away: string }; onContinue: () => void }) {
  const { ctx, live } = session;
  const ht = live.period === 'ht';
  const side = live.userSide ?? ctx.userSide ?? 'home';
  const diff = side === 'home' ? live.homeGoals - live.awayGoals : live.awayGoals - live.homeGoals;
  const talk = diff > 0 ? 'win' : diff < 0 ? 'lose' : 'draw';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') onContinue(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onContinue]);

  return (
    <motion.div className="fixed inset-0 z-40 grid place-items-center p-4 bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div initial={{ y: 30, scale: 0.96 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        className="glass bg-bg-2/95 rounded-3xl w-full max-w-md p-5">
        <div className="text-center font-display text-4xl tracking-wide text-gold">{ht ? t('match.ht.title') : t('match.live.extraTime')}</div>
        <ScoreBug homeKit={ctx.home.kit} awayKit={ctx.away.kit} home={ctx.home.shortName} away={ctx.away.shortName}
          hg={live.homeGoals} ag={live.awayGoals} clock={live.clockLabel()} period={t(`match.period.${live.period}`)} compact />
        <div className="mt-3 space-y-2">
          <DualStat label={t('match.live.possession')} home={live.possession()} away={100 - live.possession()} homeColor={colors.home} awayColor={colors.away} format={(v) => `%${Math.round(v)}`} />
          <DualStat label={t('match.live.shots')} home={live.teamStats.home.shots} away={live.teamStats.away.shots} homeColor={colors.home} awayColor={colors.away} />
          <DualStat label={t('match.live.xg')} home={live.teamStats.home.xg} away={live.teamStats.away.xg} homeColor={colors.home} awayColor={colors.away} format={(v) => v.toFixed(1)} />
        </div>
        {live.userId && live.userStats.moments > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/5 border border-line px-3 py-2">
            <span className="text-sm text-ink-dim">{t('match.ht.yourHalf')}</span>
            <span className={`rounded-lg px-2 py-0.5 font-display text-xl tabular-nums ${ratingChip(live.userRating)}`}>{live.userRating.toFixed(1)}</span>
          </div>
        )}
        {ctx.userSide && <p className="mt-4 text-sm italic text-ink-dim leading-relaxed">{t(`match.ht.talk.${talk}`)}</p>}
        <Button block size="lg" variant="primary" className="mt-5" onClick={onContinue}>{ht ? t('match.ht.continue') : t('match.mo.continue')}</Button>
      </motion.div>
    </motion.div>
  );
}
