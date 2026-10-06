/** Week report: your results, progression, money, notes. Driven by career.lastWeekReport. */
import { motion } from 'framer-motion';
import { ChevronDown, Coins, Flag, ScrollText } from 'lucide-react';
import type { GameState, WeekReport } from '../../../../core/types';
import { getLang, t } from '../../../../core/i18n';
import { weekInfo } from '../../../../competition/api';
import { Button, CountUp, clsx } from '../../../components/kit';
import Modal from '../../../components/SafeModal';
import { ChipPill } from '../EffectChips';
import { attempt, money } from '../helpers';

export function reportTitle(report: WeekReport): string {
  const label = attempt(() => weekInfo(report.season, report.week).label[getLang()], `${t('common.week')} ${report.week + 1}`);
  return t('shell.ov.week.title', { label });
}

export function WeekReportModal({ report, state, onClose }: { report: WeekReport | null; state: GameState; onClose: () => void }) {
  const mine = report ? report.results.filter((r) => report.userMatches.includes(r.fixtureId)) : [];
  const others = report ? report.results.filter((r) => !report.userMatches.includes(r.fixtureId)) : [];
  const gains = report?.progression.filter((p) => p.delta !== 0) ?? [];
  const delta = report?.moneyDelta ?? 0;

  return (
    <Modal
      open={!!report} onClose={onClose} size="lg" dismissable
      title={report ? reportTitle(report) : ''}
      footer={<Button variant="primary" size="lg" onClick={onClose}>{t('common.continue')}</Button>}
    >
      {report && (
        <div className="space-y-5 pt-1">
          {report.seasonEnded && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl border border-gold/40 bg-gold/10 p-3.5 flex items-center gap-3 text-gold">
              <Flag size={22} />
              <div>
                <div className="font-display text-2xl leading-none">{t('shell.ov.week.seasonEnd', { s: `${state.season - 1}/${String(state.season % 100).padStart(2, '0')}` })}</div>
                <div className="text-xs text-gold/80 mt-1">{t('shell.ov.week.seasonEndSub')}</div>
              </div>
            </motion.div>
          )}

          <section>
            <h3 className="text-[11px] uppercase tracking-[0.16em] font-bold text-ink-mute mb-2">{t('shell.ov.week.yourMatches')}</h3>
            {mine.length ? (
              <div className="grid grid-cols-1 gap-2">
                {mine.map((r, i) => (
                  <motion.div key={r.fixtureId} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                    className="rounded-2xl border border-accent/35 bg-accent/8 px-4 py-3 font-semibold">
                    {r.text}
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-line bg-white/4 px-4 py-3 text-sm text-ink-dim">{t('shell.ov.week.noMatch')}</div>
            )}
          </section>

          <div className="grid sm:grid-cols-2 gap-4">
            <section>
              <h3 className="text-[11px] uppercase tracking-[0.16em] font-bold text-ink-mute mb-2">{t('shell.ov.week.progress')}</h3>
              {gains.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {gains.map((g, i) => (
                    <ChipPill key={g.attr} animated delay={i * 0.07} chip={{ key: g.attr, icon: g.delta > 0 ? 'trend_up' : 'trend_down', label: t(`common.attr.${g.attr}`), value: `${g.delta > 0 ? '+' : '−'}${Math.abs(g.delta)}`, tone: g.delta > 0 ? 'accent' : 'danger' }} />
                  ))}
                </div>
              ) : <div className="text-sm text-ink-dim">{t('shell.ov.week.noProgress')}</div>}
            </section>
            <section>
              <h3 className="text-[11px] uppercase tracking-[0.16em] font-bold text-ink-mute mb-2">{t('shell.ov.week.money')}</h3>
              <div className={clsx('flex items-center gap-2 font-display text-4xl leading-none', delta < 0 ? 'text-danger' : 'text-gold')}>
                <Coins size={24} />
                <span>{delta > 0 ? '+' : delta < 0 ? '−' : ''}<CountUp value={Math.abs(delta)} format={money} /></span>
              </div>
            </section>
          </div>

          {report.messages.length > 0 && (
            <section>
              <h3 className="text-[11px] uppercase tracking-[0.16em] font-bold text-ink-mute mb-2 flex items-center gap-1.5"><ScrollText size={13} />{t('shell.ov.week.notes')}</h3>
              <ul className="space-y-1.5">
                {report.messages.map((m, i) => (
                  <motion.li key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 + i * 0.05 }} className="text-sm text-ink/90 flex gap-2">
                    <span className="text-accent mt-1.5 size-1.5 rounded-full bg-accent shrink-0" />{m}
                  </motion.li>
                ))}
              </ul>
            </section>
          )}

          {others.length > 0 && (
            <details className="group rounded-2xl border border-line bg-white/3 px-4 py-2.5">
              <summary className="flex items-center justify-between cursor-pointer text-sm font-semibold text-ink-dim list-none">
                {t('shell.ov.week.others', { n: others.length })}
                <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
              </summary>
              <ul className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px] text-ink-dim">
                {others.map((r) => <li key={r.fixtureId} className="truncate">{r.text}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}
