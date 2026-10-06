/** Pending game event: choices with effect hints, then the animated result. */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Dices, Hourglass } from 'lucide-react';
import type { EventChoice, GameEvent } from '../../../../core/types';
import { t } from '../../../../core/i18n';
import { Badge, Button, Icon } from '../../../components/kit';
import Modal from '../../../components/SafeModal';
import { EffectChips, effectChips } from '../EffectChips';
import { isEmoji } from '../helpers';

export interface EventResult { event: GameEvent; choice: EventChoice; text: string }

function EventGlyph({ icon, size = 30 }: { icon: string; size?: number }) {
  return (
    <motion.div
      initial={{ scale: 0.4, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 16 }}
      className="relative grid place-items-center size-16 rounded-2xl bg-accent/10 border border-accent/30 text-accent shrink-0 shadow-[0_0_30px_-8px_rgba(184,255,60,0.6)]"
    >
      {icon && isEmoji(icon) ? <span style={{ fontSize: size }}>{icon}</span> : <Icon name={icon || 'sparkles'} size={size} />}
    </motion.div>
  );
}

export function EventModal({ event, result, remaining, busy, onChoose, onLater, onContinue }: {
  event: GameEvent | null; result: EventResult | null; remaining: number; busy: boolean;
  onChoose: (e: GameEvent, c: EventChoice) => void; onLater: (e: GameEvent) => void; onContinue: () => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const open = !!(event || result);

  // Number keys pick a choice.
  useEffect(() => {
    if (!event || result) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= event.choices.length && !busy) onChoose(event, event.choices[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [event, result, busy, onChoose]);

  return (
    <Modal open={open} dismissable={false} size="md">
      {result ? (
        <div className="pt-5">
          <div className="flex items-center gap-4">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}
              className="grid place-items-center size-14 rounded-full bg-accent text-bg shrink-0"
            ><Check size={28} strokeWidth={3} /></motion.div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.16em] font-bold text-ink-mute">{t('shell.ov.event.result')}</div>
              <div className="font-display text-3xl leading-[1.05]">{result.event.title}</div>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-white/4 border border-line p-4 text-[15px] leading-relaxed">
            <span className="text-ink-dim">{t('shell.ov.event.youChose')}</span>{' '}
            <span className="font-semibold text-accent">{result.choice.label}</span>
            {result.text && <p className="mt-2.5 text-ink/90">{result.text}</p>}
          </div>
          <EffectChips effects={result.choice.effects} animated className="mt-4" />
          <div className="mt-6 flex items-center justify-between gap-3">
            <span className="text-xs text-ink-dim">{remaining > 0 ? t('shell.ov.event.more', { n: remaining }) : ''}</span>
            <Button variant="primary" size="lg" onClick={onContinue} icon="check">{t('common.continue')}</Button>
          </div>
        </div>
      ) : event ? (
        <div className="pt-5">
          <div className="flex items-start gap-4">
            <EventGlyph icon={event.icon} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] font-bold text-ink-mute">
                <span>{t('shell.ov.event.label')}</span>
                {event.persona && <Badge tone="info">{event.persona}</Badge>}
                {event.source === 'ai' && <Badge tone="violet"><Icon name="sparkles" size={11} /> AI</Badge>}
              </div>
              <h2 className="font-display text-3xl sm:text-4xl leading-[1.05] mt-1">{event.title}</h2>
            </div>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-ink/90 whitespace-pre-line">{event.body}</p>

          <div className="mt-5 grid gap-2.5">
            {event.choices.map((c, i) => (
              <motion.button
                key={c.id}
                disabled={busy}
                onClick={() => onChoose(event, c)}
                onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }}
                whileTap={{ scale: 0.985 }}
                className="text-left rounded-2xl border border-line bg-white/4 hover:bg-white/7 hover:border-accent/50 p-3.5 transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
              >
                <div className="flex items-start gap-3">
                  <span className="grid place-items-center size-6 rounded-lg bg-white/8 text-xs font-bold text-ink-dim shrink-0 mt-0.5">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-snug">{c.label}</div>
                    {effectChips(c.effects).length > 0 && <EffectChips effects={c.effects} small className="mt-2" />}
                  </div>
                  {c.risk && (
                    <Badge tone="danger" className="shrink-0"><Dices size={11} />{t('shell.ov.event.risk', { n: Math.round(c.risk.chance * 100) })}</Badge>
                  )}
                </div>
                {c.risk && hover === c.id && <div className="mt-2 ml-9 text-xs text-danger/90">{t('shell.ov.event.riskHint')}</div>}
              </motion.button>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 text-xs text-ink-dim">
            <span>{remaining > 1 ? t('shell.ov.event.more', { n: remaining - 1 }) : ''}</span>
            <Button variant="ghost" size="sm" onClick={() => onLater(event)}><Hourglass size={14} />{t('shell.ov.event.later')}</Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
