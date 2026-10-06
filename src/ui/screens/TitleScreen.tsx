/**
 * Route 'title'. Full-screen 3D stadium backdrop, animated logo, continue / new / load / settings.
 * Owner: ui-shell agent.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, FolderOpen, Play, Plus, Settings as SettingsIcon } from 'lucide-react';
import { t } from '../../core/i18n';
import { updateSettings } from '../../core/settings';
import { audio } from '../../audio/api';
import { game, useSettings } from '../../game/api';
import { navigate } from '../router';
import { Button, Spinner, clsx, toast } from '../components/kit';
import Backdrop from './shell/Backdrop';
import { SlotsModal, useSaves } from './shell/title/SaveSlots';
import { errText, useLang } from './shell/helpers';
import './shell/strings';

function Letters({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={clsx('inline-flex', className)} aria-label={text}>
      {text.split('').map((ch, i) => (
        <motion.span
          key={i} aria-hidden
          initial={{ opacity: 0, y: 46, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: delay + i * 0.055, type: 'spring', stiffness: 160, damping: 14 }}
          className={ch === ' ' ? 'w-[0.28em]' : undefined}
        >
          {ch}
        </motion.span>
      ))}
    </span>
  );
}

/** The signature "falso" arc: a ball curling around a wall into the corner. */
function CurlArc() {
  const path = 'M10 118 C 90 130, 190 90, 260 22';
  return (
    <svg viewBox="0 0 280 140" className="w-[min(78vw,340px,34vh)] h-auto -mt-2 mb-1 overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="arcg" x1="0" x2="1"><stop offset="0%" stopColor="#b8ff3c" stopOpacity="0" /><stop offset="100%" stopColor="#b8ff3c" /></linearGradient>
      </defs>
      <motion.path d={path} fill="none" stroke="url(#arcg)" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 7"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.0, duration: 1.4, ease: 'easeOut' }} />
      <g>
        <circle r="9" fill="#fff" stroke="#0b1711" strokeWidth="1.4">
          <animateMotion dur="2.6s" begin="1s" repeatCount="indefinite" path={path} />
        </circle>
        <circle r="3.4" fill="#0b1711">
          <animateMotion dur="2.6s" begin="1s" repeatCount="indefinite" path={path} />
        </circle>
      </g>
      <g stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round"><path d="M268 8 v26" /><path d="M244 8 h28" /></g>
    </svg>
  );
}

export default function TitleScreen() {
  const lang = useLang();
  const settings = useSettings();
  const { saves, loading, reload } = useSaves();
  const [modal, setModal] = useState<'load' | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  const latest = useMemo(() => saves.reduce<(typeof saves)[number] | null>((a, b) => (!a || b.savedAt > a.savedAt ? b : a), null), [saves]);
  const aiOn = settings.ai.enabled && settings.ai.apiKey.trim().length > 10;

  const loadSlot = async (slot: number) => {
    setBusy(true);
    try {
      await game.load(slot);
      setModal(null);
      navigate('hub');
    } catch (e) {
      toast(`${t('shell.title.loadFail')}: ${errText(e)}`, 'danger', 'shield_alert');
    } finally {
      setBusy(false);
    }
  };

  const onContinue = async () => {
    setBusy(true);
    try {
      if (await game.continueLatest()) navigate('hub');
      else toast(t('shell.title.noSaves'), 'neutral', 'info');
    } catch (e) {
      toast(`${t('shell.title.loadFail')}: ${errText(e)}`, 'danger', 'shield_alert');
    } finally {
      setBusy(false);
    }
  };

  const onNew = () => {
    if (saves.length === 0) navigate('new-career', { slot: '0' });
    else setModal('new');
  };

  return (
    <div className="relative min-h-full overflow-hidden bg-bg" onPointerDown={() => audio.unlock()}>
      <Backdrop />
      <div className="absolute inset-0 bg-[radial-gradient(75%_60%_at_50%_40%,rgba(6,13,9,0.35),rgba(6,13,9,0.75)_85%),linear-gradient(180deg,rgba(6,13,9,0.45),rgba(6,13,9,0.05)_30%,rgba(6,13,9,0.3)_60%,rgba(6,13,9,0.92))]" />

      <div className="absolute top-3 right-3 sm:top-5 sm:right-5 z-10 flex items-center gap-2">
        <button
          onClick={() => navigate('settings')}
          className={clsx('flex items-center gap-1.5 h-8 px-3 rounded-full border text-[11px] font-bold uppercase tracking-wider cursor-pointer backdrop-blur',
            aiOn ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line bg-black/30 text-ink-dim')}
          title={t('shell.title.aiTip')}
        >
          <Bot size={13} />{aiOn ? t('shell.title.aiOn') : t('shell.title.aiOff')}
          {aiOn && <span className="size-1.5 rounded-full bg-accent animate-nss-pulse" />}
        </button>
        <div className="flex rounded-full border border-line bg-black/30 backdrop-blur p-0.5">
          {(['tr', 'en'] as const).map((l) => (
            <button key={l} onClick={() => updateSettings((s) => { s.lang = l; })}
              className={clsx('h-7 w-10 rounded-full text-xs font-bold uppercase cursor-pointer transition-colors', lang === l ? 'bg-accent text-bg' : 'text-ink-dim hover:text-ink')}>{l}</button>
          ))}
        </div>
      </div>

      <div className="relative z-[1] min-h-dvh flex flex-col items-center justify-center px-5 pt-16 pb-24 text-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-[11px] sm:text-xs tracking-[0.5em] text-accent/80 font-bold uppercase mb-2">
          {t('shell.title.kicker')}
        </motion.div>
        <h1 className="font-display leading-[0.82] select-none">
          <Letters text="NEO STAR" className="block text-[clamp(56px,min(19vw,14.5vh),150px)] text-ink drop-shadow-[0_6px_30px_rgba(0,0,0,0.6)]" delay={0.2} />
          <br />
          <Letters text="SOCCER" className="text-[clamp(66px,min(23vw,17.5vh),184px)] text-accent neon-text" delay={0.65} />
        </h1>
        <CurlArc />
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 }} className="text-base sm:text-lg text-ink/85 font-medium max-w-md">
          {t('common.tagline')}
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6, type: 'spring', stiffness: 120, damping: 16 }}
          className="mt-8 w-full max-w-xs flex flex-col gap-3">
          {loading ? <div className="h-14 grid place-items-center"><Spinner /></div> : (
            <>
              {latest && (
                <button onClick={onContinue} disabled={busy}
                  className="group relative w-full rounded-2xl bg-accent text-bg px-5 py-3 text-left cursor-pointer shadow-[0_0_40px_-8px_rgba(184,255,60,0.8)] hover:brightness-110 active:scale-[0.98] transition disabled:opacity-60">
                  <span className="flex items-center gap-3">
                    <Play size={22} fill="currentColor" className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-display text-3xl leading-none">{t('shell.title.continue')}</span>
                      <span className="block text-xs font-semibold opacity-75 truncate mt-0.5">{t('shell.title.continueSub', { name: latest.name, club: latest.club, season: latest.season, week: latest.week + 1 })}</span>
                    </span>
                  </span>
                </button>
              )}
              <Button variant={latest ? 'secondary' : 'primary'} size="lg" block onClick={onNew} disabled={busy} className={clsx(!latest && 'shadow-[0_0_40px_-8px_rgba(184,255,60,0.8)]')}>
                <Plus size={18} />{t('shell.title.new')}
              </Button>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" size="md" onClick={() => setModal('load')} disabled={busy}><FolderOpen size={16} />{t('shell.title.load')}</Button>
                <Button variant="secondary" size="md" onClick={() => navigate('settings')}><SettingsIcon size={16} />{t('shell.title.settings')}</Button>
              </div>
            </>
          )}
        </motion.div>
      </div>

      <footer className="absolute inset-x-0 bottom-0 z-[1] px-4 pb-3 pt-6 text-center text-[11px] text-ink-mute bg-gradient-to-t from-bg/90 to-transparent">
        <div>{t('shell.title.credits')}</div>
        <div className="mt-0.5 opacity-70">{t('shell.title.footer')}</div>
      </footer>

      <SlotsModal
        open={modal !== null} mode={modal ?? 'load'} onClose={() => setModal(null)}
        saves={saves} loading={loading} reload={reload}
        onPick={(slot) => { if (modal === 'new') { setModal(null); navigate('new-career', { slot: String(slot) }); } else void loadSlot(slot); }}
      />
    </div>
  );
}
