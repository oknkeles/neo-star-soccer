/**
 * Route 'new-career' (params.slot). Wizard: name → nation → position → look → trait → fate,
 * then the genesis reveal and the trial-offer choice. Owner: ui-shell agent.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { t, tl } from '../../core/i18n';
import { aiEnabled } from '../../core/settings';
import { game, useGame } from '../../game/api';
import { getNation } from '../../world/api';
import { TRAITS } from '../../career/api';
import { navigate, replace } from '../router';
import Avatar from '../components/Avatar';
import { Button, Icon, clsx } from '../components/kit';
import { attempt, errText, useLang } from './shell/helpers';
import { DEFAULT_APPEARANCE, offeredTraits, rollAppearance, sleep, type Draft } from './shell/newcareer/data';
import { FateStep, LookStep, NameStep, NationStep, PositionStep, TraitStep } from './shell/newcareer/Steps';
import Forging from './shell/newcareer/Forging';
import Genesis from './shell/newcareer/Genesis';
import TrialOffers from './shell/TrialOffers';
import './shell/strings';

const STEPS = ['name', 'nation', 'position', 'look', 'trait', 'fate'] as const;
type Phase = 'wizard' | 'forging' | 'genesis' | 'offers';

function Preview({ draft, compact }: { draft: Draft; compact?: boolean }) {
  const nation = attempt(() => getNation(draft.nation), null);
  const trait = TRAITS.find((x) => x.id === draft.trait);
  const name = `${draft.first.trim()} ${draft.last.trim()}`.trim();
  const kit = nation?.kit;
  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-white/4 p-2.5">
        <Avatar appearance={draft.appearance} kit={kit} size={56} mood="happy" ring="accent" />
        <div className="min-w-0 leading-tight">
          <div className="font-display text-2xl truncate">{draft.nickname.trim() || name || t('shell.nc.preview.noName')}</div>
          <div className="text-xs text-ink-dim truncate">{nation?.flag} {t(`shell.pos.${draft.position}`)} · {draft.foot === 'L' ? t('shell.nc.look.left') : t('shell.nc.look.right')}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="sticky top-6 rounded-3xl border border-line overflow-hidden"
      style={{ background: `radial-gradient(100% 60% at 50% 0%, ${(kit?.primary ?? '#2a4436')}44, transparent 70%), linear-gradient(180deg, #112219, #0a130e)` }}>
      <div className="grid place-items-center pt-7 pb-2">
        <motion.div key={draft.appearance.skin + draft.appearance.hairStyle + draft.appearance.beard + draft.appearance.height} initial={{ scale: 0.94 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>
          <Avatar appearance={draft.appearance} kit={kit} size={188} mood="happy" ring="accent" blink />
        </motion.div>
      </div>
      <div className="px-5 pb-6 text-center">
        <div className="font-display text-4xl leading-none mt-2 truncate">{draft.nickname.trim() || draft.first.trim() || t('shell.nc.preview.noName')}</div>
        <div className="text-ink-dim text-sm mt-1 truncate">{draft.last.trim()}</div>
        <div className="mt-4 flex flex-wrap justify-center gap-1.5 text-xs">
          {nation && <span className="rounded-full bg-white/8 px-2.5 py-1 font-semibold">{nation.flag} {tl(nation.name)}</span>}
          <span className="rounded-full bg-accent/12 text-accent px-2.5 py-1 font-semibold">{t(`shell.pos.${draft.position}`)}</span>
          <span className="rounded-full bg-white/8 px-2.5 py-1 font-semibold">{draft.foot === 'L' ? t('shell.nc.look.left') : t('shell.nc.look.right')}</span>
          {trait && <span className="rounded-full bg-gold/12 text-gold px-2.5 py-1 font-semibold inline-flex items-center gap-1"><Icon name={trait.icon} size={12} />{tl(trait.name)}</span>}
        </div>
      </div>
    </div>
  );
}

export default function NewCareerScreen({ params }: { params: Record<string, string> }) {
  useLang();
  const slot = Math.max(0, Number(params.slot ?? 0) || 0);
  const { state } = useGame();
  const [phase, setPhase] = useState<Phase>('wizard');
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const offered = useMemo(() => offeredTraits(), []);
  const [draft, setDraft] = useState<Draft>(() => ({
    first: '', last: '', nickname: '', nation: 'TUR', position: 'ST', foot: 'R', trait: null,
    appearance: attempt(() => rollAppearance('TUR'), DEFAULT_APPEARANCE),
  }));
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const id = STEPS[step];
  const valid =
    id === 'name' ? draft.first.trim().length >= 2 && draft.last.trim().length >= 2
    : id === 'trait' ? draft.trait !== null || offered.length === 0
    : true;

  const go = (d: number) => {
    setDir(d);
    setStep((s) => Math.max(0, Math.min(STEPS.length - 1, s + d)));
  };

  const forge = async () => {
    setError(null);
    setPhase('forging');
    try {
      await Promise.all([
        game.newCareer({
          firstName: draft.first.trim(), lastName: draft.last.trim(), nickname: draft.nickname.trim() || undefined,
          nation: draft.nation, position: draft.position, foot: draft.foot, appearance: draft.appearance,
          trait: draft.trait ?? offered[0] ?? 'calm',
        }, slot),
        sleep(2800),
      ]);
      setPhase('genesis');
    } catch (e) {
      setError(errText(e));
      setPhase('wizard');
    }
  };

  if (phase === 'forging') return <Forging ai={aiEnabled('genesis')} />;
  if (phase === 'genesis' && state) return <Genesis state={state} onNext={() => setPhase('offers')} />;
  if (phase === 'offers' && state) {
    return (
      <div className="relative min-h-dvh px-4 py-8 sm:py-12 bg-bg">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(60% 40% at 50% 0%, rgba(255,203,71,0.10), transparent 70%)' }} />
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <div className="text-[11px] tracking-[0.4em] uppercase text-gold font-bold">{t('shell.nc.offers.kicker')}</div>
            <h1 className="font-display text-5xl sm:text-6xl leading-none mt-1">{t('shell.nc.offers.title')}</h1>
            <p className="text-ink-dim mt-2 max-w-lg mx-auto">{t('shell.nc.offers.sub')}</p>
          </div>
          <TrialOffers state={state} onAccepted={() => replace('hub')} />
        </div>
      </div>
    );
  }

  const stepContent = (
    id === 'name' ? <NameStep draft={draft} set={set} />
    : id === 'nation' ? <NationStep draft={draft} set={set} />
    : id === 'position' ? <PositionStep draft={draft} set={set} />
    : id === 'look' ? <LookStep draft={draft} set={set} />
    : id === 'trait' ? <TraitStep draft={draft} set={set} offered={offered} />
    : <FateStep draft={draft} onForge={forge} error={error} />
  );

  return (
    <div className="relative min-h-dvh bg-bg">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(70% 40% at 80% 0%, rgba(184,255,60,0.09), transparent 70%)' }} />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-28 md:pb-10">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate('title')} aria-label={t('common.back')} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-ink-dim hover:text-ink cursor-pointer"><ArrowLeft size={18} /></button>
          <div className="font-display text-2xl tracking-wide">{t('shell.nc.title')}</div>
          <div className="ml-auto text-xs text-ink-mute font-semibold uppercase tracking-wider">{t('shell.nc.slot', { n: slot + 1 })}</div>
        </div>

        <ol className="flex items-center gap-1.5 sm:gap-2 mb-6">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5 sm:gap-2 flex-1 last:flex-none">
              <button
                onClick={() => { if (i < step) { setDir(-1); setStep(i); } }}
                disabled={i > step}
                className={clsx('flex items-center gap-2 cursor-pointer disabled:cursor-default', i === step ? 'text-accent' : i < step ? 'text-ink' : 'text-ink-mute')}
              >
                <span className={clsx('grid place-items-center size-7 rounded-full text-xs font-bold border transition-colors',
                  i < step ? 'bg-accent text-bg border-accent' : i === step ? 'border-accent text-accent' : 'border-line')}>
                  {i < step ? <Check size={14} strokeWidth={3} /> : i + 1}
                </span>
                <span className="hidden lg:block text-xs font-bold uppercase tracking-wider">{t(`shell.nc.step.${s}`)}</span>
              </button>
              {i < STEPS.length - 1 && <span className={clsx('h-px flex-1 transition-colors', i < step ? 'bg-accent' : 'bg-line')} />}
            </li>
          ))}
        </ol>

        <div className="grid md:grid-cols-[minmax(0,1fr)_320px] lg:grid-cols-[minmax(0,1fr)_360px] gap-6 lg:gap-10 items-start">
          <div className="min-w-0">
            <div className="md:hidden mb-4"><Preview draft={draft} compact /></div>
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.div
                key={id} custom={dir}
                variants={{ enter: (d: number) => ({ opacity: 0, x: 40 * d }), center: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: -40 * d }) }}
                initial="enter" animate="center" exit="exit" transition={{ duration: 0.22 }}
              >
                {stepContent}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="hidden md:block"><Preview draft={draft} /></div>
        </div>

        {id !== 'fate' && (
          <div className="fixed md:static inset-x-0 bottom-0 z-20 md:mt-8 px-4 md:px-0 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-0 bg-gradient-to-t from-bg via-bg/95 to-transparent md:bg-none">
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
              <Button variant="ghost" onClick={() => (step === 0 ? navigate('title') : go(-1))}><ArrowLeft size={16} />{t('common.back')}</Button>
              <Button variant="primary" size="lg" disabled={!valid} onClick={() => go(1)}>{t('common.next')}<ArrowRight size={18} /></Button>
            </div>
          </div>
        )}
        {id === 'fate' && (
          <div className="mt-6"><Button variant="ghost" onClick={() => go(-1)}><ArrowLeft size={16} />{t('common.back')}</Button></div>
        )}
      </div>
    </div>
  );
}
