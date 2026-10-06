/**
 * Route 'press' (params.occasion, or agenda.pressAvailable). Press-room look, journalist
 * questions one by one, prepared answers or free text (AI), newspaper-clipping verdicts.
 * Owner: ui-shell agent.
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Send } from 'lucide-react';
import type { Effects, RelKey } from '../../core/types';
import type { PressEvaluation, PressOccasion, PressQuestion, PressTone } from '../../core/narrative-types';
import { t } from '../../core/i18n';
import { aiEnabled } from '../../core/settings';
import { audio } from '../../audio/api';
import { game, useGame, useSettings, type PressSession } from '../../game/api';
import { back } from '../router';
import { Badge, Button, Card, EmptyState, Icon, Spinner, clsx, toast } from '../components/kit';
import { EffectChips } from './shell/EffectChips';
import { Clipping, JournalistBadge, MicStand, PressRoomBackdrop } from './shell/press/PressParts';
import { errText, useAgenda, useLang } from './shell/helpers';
import './shell/strings';

const OCCASIONS: PressOccasion[] = ['pre_match', 'post_match', 'transfer', 'scandal', 'milestone', 'unveiling'];
const TONE_STYLE: Record<PressTone, string> = {
  humble: 'text-info bg-info/10 border-info/30', confident: 'text-accent bg-accent/10 border-accent/30', provocative: 'text-danger bg-danger/10 border-danger/30',
  diplomatic: 'text-violet bg-violet/10 border-violet/30', emotional: 'text-gold bg-gold/10 border-gold/30', deflect: 'text-ink-dim bg-white/6 border-line',
};

// One live session per app run so leaving and returning resumes instead of restarting.
let lastSessionId: string | null = null;
const inflight = new Map<string, Promise<PressSession>>();

function openSession(occasion: PressOccasion): Promise<PressSession> {
  const existing = inflight.get(occasion);
  if (existing) return existing;
  const p = game.startPress(occasion).then((s) => { lastSessionId = s.id; return s; }).finally(() => { setTimeout(() => inflight.delete(occasion), 0); });
  inflight.set(occasion, p);
  return p;
}

function sumEffects(list: Effects[]): Effects {
  const out: Effects = {};
  const num = ['money', 'fame', 'followers', 'energy', 'morale', 'form'] as const;
  for (const e of list) {
    for (const k of num) if (e[k]) out[k] = (out[k] ?? 0) + (e[k] as number);
    for (const r of Object.keys(e.rel ?? {}) as RelKey[]) { out.rel ??= {}; out.rel[r] = (out.rel[r] ?? 0) + (e.rel?.[r] ?? 0); }
  }
  return out;
}

type Phase = 'loading' | 'none' | 'error' | 'intro' | 'ask' | 'judging' | 'verdict' | 'done';

export default function PressScreen({ params }: { params: Record<string, string> }) {
  useLang();
  useGame();
  useSettings();
  const agenda = useAgenda();
  const occasion = (OCCASIONS.find((o) => o === params.occasion) ?? agenda?.pressAvailable ?? null) as PressOccasion | null;
  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<PressSession | null>(null);
  const [idx, setIdx] = useState(0);
  const [verdict, setVerdict] = useState<PressEvaluation | null>(null);
  const [free, setFree] = useState('');
  const [freeMode, setFreeMode] = useState(false);
  const [error, setError] = useState('');
  const canFree = aiEnabled('press');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resumable = lastSessionId ? game.pressSession(lastSessionId) : null;
        const usable = resumable && (!params.occasion || resumable.occasion === params.occasion) && Object.keys(resumable.answered).length < resumable.questions.length;
        const s = usable ? resumable : occasion ? await openSession(occasion) : null;
        if (cancelled) return;
        if (!s) { setPhase('none'); return; }
        setSession(s);
        setIdx(Math.max(0, s.questions.findIndex((q) => !s.answered[q.id])));
        setPhase(Object.keys(s.answered).length ? 'ask' : 'intro');
      } catch (e) {
        if (!cancelled) { setError(errText(e)); setPhase('error'); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q: PressQuestion | undefined = session?.questions[idx];
  const total = session?.questions.length ?? 0;
  const answered = session ? session.questions.filter((x) => session.answered[x.id]).map((x) => session.answered[x.id]) : [];

  const answer = async (a: { optionId?: string; text?: string }) => {
    if (!session || !q) return;
    setPhase('judging');
    try {
      const ev = await game.answerPress(session.id, q.id, a);
      setVerdict(ev);
      setFree('');
      setFreeMode(false);
      audio.play('notify', 0.5);
      setPhase('verdict');
    } catch (e) {
      toast(errText(e), 'danger', 'shield_alert');
      setPhase('ask');
    }
  };

  const next = () => {
    if (!session) return;
    if (idx + 1 >= total) { setPhase('done'); return; }
    setIdx(idx + 1);
    setVerdict(null);
    setPhase('ask');
  };

  const roomTitle = useMemo(() => (occasion ? t(`shell.press.occ.${occasion}`) : t('shell.press.title')), [occasion]);

  if (phase === 'loading') return <div className="py-24 grid place-items-center"><Spinner label={t('shell.press.loading')} /></div>;
  if (phase === 'none') return <EmptyState icon="mic" title={t('shell.press.none')} text={t('shell.press.noneSub')} action={<Button variant="primary" onClick={() => back('hub')}>{t('shell.press.back')}</Button>} />;
  if (phase === 'error') return <EmptyState icon="shield_alert" title={t('shell.press.failed')} text={error} action={<Button variant="primary" onClick={() => back('hub')}>{t('shell.press.back')}</Button>} />;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="relative rounded-3xl border border-line overflow-hidden min-h-[560px]">
        <PressRoomBackdrop />
        <div className="absolute bottom-0 left-3 sm:left-8 opacity-70 pointer-events-none"><MicStand className="h-24 sm:h-32 w-auto" /></div>
        <div className="absolute bottom-0 right-3 sm:right-8 opacity-70 pointer-events-none"><MicStand className="h-20 sm:h-28 w-auto" /></div>

        <div className="relative p-4 sm:p-7">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-ink-dim"><Icon name="mic" size={14} className="text-accent" />{t('shell.press.title')}</div>
            <Badge tone="gold">{roomTitle}</Badge>
          </div>

          <AnimatePresence mode="wait">
            {phase === 'intro' && session && (
              <motion.div key="intro" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center py-8 sm:py-14">
                <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2, repeat: Infinity }} className="mx-auto grid place-items-center size-20 rounded-full bg-accent/12 border border-accent/40 text-accent"><Icon name="mic" size={36} /></motion.div>
                <h1 className="font-display text-5xl sm:text-6xl leading-none mt-5">{roomTitle}</h1>
                <p className="text-ink-dim mt-3 max-w-md mx-auto">{t('shell.press.introSub', { n: total })}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {[...new Map(session.questions.map((x) => [x.journalist, x])).values()].slice(0, 4).map((x) => (
                    <span key={x.journalist} className="rounded-full bg-white/6 border border-line px-3 py-1 text-xs text-ink-dim"><span className="font-semibold text-ink">{x.journalist}</span> · {x.outlet}</span>
                  ))}
                </div>
                <Button variant="primary" size="lg" className="mt-8" onClick={() => setPhase('ask')}>{t('shell.press.enter')}<ArrowRight size={18} /></Button>
              </motion.div>
            )}

            {(phase === 'ask' || phase === 'judging') && q && (
              <motion.div key={`q-${q.id}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                <div className="flex items-center gap-1.5 mb-4">
                  {Array.from({ length: total }, (_, i) => <span key={i} className={clsx('h-1.5 rounded-full transition-all', i < idx ? 'w-6 bg-accent' : i === idx ? 'w-10 bg-accent' : 'w-6 bg-white/12')} />)}
                  <span className="ml-2 text-xs text-ink-dim font-semibold">{t('shell.press.q', { n: idx + 1, total })}</span>
                </div>
                <JournalistBadge name={q.journalist} outlet={q.outlet} topic={q.topic ? t(`shell.press.topic.${q.topic}`) : undefined} />
                <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} className="relative mt-4 rounded-3xl rounded-tl-md border border-line bg-white/8 backdrop-blur p-5 sm:p-6">
                  <p className="font-display text-3xl sm:text-4xl leading-[1.1]">“{q.text}”</p>
                </motion.div>

                {phase === 'judging' ? (
                  <div className="mt-8 grid place-items-center gap-3 py-8">
                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity }} className="grid place-items-center size-14 rounded-full bg-white/10"><Icon name="camera" size={26} /></motion.div>
                    <div className="text-ink-dim text-sm">{t('shell.press.judging')}</div>
                  </div>
                ) : (
                  <div className="mt-5">
                    <div className="text-[11px] uppercase tracking-[0.16em] font-bold text-ink-mute mb-2">{t('shell.press.yourAnswer')}</div>
                    {!freeMode ? (
                      <div className="grid grid-cols-1 gap-2.5">
                        {q.options.map((o, i) => (
                          <motion.button
                            key={o.id} onClick={() => void answer({ optionId: o.id })}
                            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.06 }} whileTap={{ scale: 0.985 }}
                            className="text-left rounded-2xl border border-line bg-black/30 hover:bg-white/9 hover:border-accent/50 backdrop-blur p-3.5 cursor-pointer transition-colors"
                          >
                            <span className={clsx('inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider mb-1.5', TONE_STYLE[o.tone])}>{t(`shell.press.tone.${o.tone}`)}</span>
                            <span className="block text-[15px] leading-snug">{o.text}</span>
                          </motion.button>
                        ))}
                        {canFree && (
                          <button onClick={() => setFreeMode(true)} className="flex items-center justify-center gap-2 h-11 rounded-2xl border border-dashed border-violet/50 text-violet text-sm font-semibold hover:bg-violet/10 cursor-pointer">
                            <Icon name="pen" size={15} />{t('shell.press.free')}<Badge tone="violet">AI</Badge>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2.5">
                        <textarea
                          value={free} onChange={(e) => setFree(e.target.value)} maxLength={320} rows={4} autoFocus placeholder={t('shell.press.freePh')}
                          className="w-full rounded-2xl bg-black/35 border border-violet/40 p-3.5 text-[15px] outline-none focus:border-violet resize-none"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setFreeMode(false)}>{t('shell.press.prepared')}</Button>
                          <div className="flex items-center gap-3"><span className="text-xs text-ink-mute tabular-nums">{free.length}/320</span>
                            <Button variant="primary" disabled={free.trim().length < 3} onClick={() => void answer({ text: free })}><Send size={15} />{t('shell.press.send')}</Button></div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {phase === 'verdict' && verdict && q && (
              <motion.div key={`v-${q.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-2">
                <div className="text-center text-[11px] uppercase tracking-[0.18em] font-bold text-ink-mute mb-3">{t('shell.press.headline')}</div>
                <Clipping outlet={q.outlet} headline={verdict.headline} />
                <div className="mt-6 text-center">
                  <span className={clsx('inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider', TONE_STYLE[verdict.tone])}>{t(`shell.press.tone.${verdict.tone}`)}</span>
                  {verdict.feedback && <p className="mt-3 text-[15px] text-ink/90 max-w-md mx-auto leading-relaxed">{verdict.feedback}</p>}
                </div>
                <EffectChips effects={verdict.effects} animated className="mt-4 justify-center" startDelay={0.5} />
                <div className="mt-7 flex justify-center">
                  <Button variant="primary" size="lg" onClick={next}>{idx + 1 >= total ? t('shell.press.finish') : t('shell.press.next')}<ArrowRight size={18} /></Button>
                </div>
              </motion.div>
            )}

            {phase === 'done' && (
              <motion.div key="done" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="py-6 text-center">
                <h1 className="font-display text-5xl sm:text-6xl leading-none">{t('shell.press.done')}</h1>
                <p className="text-ink-dim mt-2">{t('shell.press.doneSub')}</p>
                <div className="mt-6 grid gap-3 text-left">
                  {answered.map((a, i) => (
                    <Card key={i} padded={false} className="px-4 py-3 flex items-center gap-3">
                      <span className={clsx('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase', TONE_STYLE[a.tone])}>{t(`shell.press.tone.${a.tone}`)}</span>
                      <span className="text-sm font-semibold leading-snug">{a.headline}</span>
                    </Card>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                  {Object.keys(sumEffects(answered.map((a) => a.effects))).length > 0 && <span className="w-full text-[11px] uppercase tracking-wider font-bold text-ink-mute">{t('shell.press.total')}</span>}
                  <EffectChips effects={sumEffects(answered.map((a) => a.effects))} animated className="justify-center" />
                </div>
                <Button variant="primary" size="lg" className="mt-8" onClick={() => back('hub')}>{t('shell.press.back')}</Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

