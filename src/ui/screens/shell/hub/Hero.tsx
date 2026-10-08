/** Hub hero: the next match (crests, competition, role) and the one big primary action. */
import { motion } from 'framer-motion';
import { CalendarClock, FastForward, Swords } from 'lucide-react';
import type { GameState, Kit } from '../../../../core/types';
import { getLang, t } from '../../../../core/i18n';
import type { Agenda } from '../../../../game/api';
import { Badge, Button, Crest, Icon, clsx } from '../../../components/kit';
import { formatDate, openEvent, teamView } from '../helpers';
import { AiChip } from './FeedPanels';

export default function Hero({ state, agenda, advancing, onAdvance, onPlay }: {
  state: GameState; agenda: Agenda; advancing: boolean; onAdvance: () => void; onPlay: (fixtureId: string) => void;
}) {
  const lang = getLang();
  const entry = agenda.fixtures.find((x) => !x.fixture.played) ?? agenda.fixtures[0] ?? null;
  const fx = entry?.fixture ?? null;
  const home = fx ? teamView(state, fx.homeId) : null;
  const away = fx ? teamView(state, fx.awayId) : null;
  const pending = agenda.pendingMatches.length > 0;
  const week = agenda.week;
  const weekLabel = week.label[lang] ?? week.label.en;
  const eventBlockers = agenda.pendingEvents.filter((e) => e.choices.length > 0);

  const roleBadge = entry
    ? entry.role === 'starter' ? <Badge tone="accent"><Icon name="check" size={11} />{t('shell.hub.role.starter')}</Badge>
      : entry.role === 'bench' ? <Badge tone="gold">{t('shell.hub.role.bench')}</Badge>
      : <Badge tone="danger">{t('shell.hub.role.none')}</Badge>
    : null;

  const hc = home?.kit.primary ?? '#2a4436';
  const ac = away?.kit.primary ?? '#2a4436';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl border border-line p-5 sm:p-7"
      style={{ background: `radial-gradient(110% 90% at 0% 0%, ${hc}33, transparent 58%), radial-gradient(110% 90% at 100% 0%, ${ac}33, transparent 58%), linear-gradient(180deg, #10241a, #08110c)` }}
    >
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-dim whitespace-nowrap">
          <CalendarClock size={14} className="text-accent shrink-0" />{t('shell.hub.next')}
          <span className="text-ink-mute truncate normal-case tracking-normal font-semibold">· {weekLabel}{week.date ? ` · ${formatDate(week.date)}` : ''}</span>
        </div>
        <AiChip />
      </div>
      {(week.transferWindow || week.internationalBreak) && (
        <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
          {week.transferWindow && <Badge tone="gold"><Icon name="handshake" size={11} />{t('shell.hub.window')}</Badge>}
          {week.internationalBreak && <Badge tone="info"><Icon name="flag" size={11} />{t('shell.hub.intl')}</Badge>}
        </div>
      )}

      {fx && home && away && entry ? (
        <>
          <div className="relative mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm">
            <span className="font-semibold text-ink/90">{entry.compName}</span>
            {fx.roundName && <span className="text-ink-mute">· {fx.roundName}</span>}
            {fx.leg && <span className="text-ink-mute">· {t('shell.hub.leg', { n: fx.leg })}</span>}
          </div>

          <div className="relative mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-6">
            <TeamSide name={home.name} kit={home.kit} short={home.shortName} mine={entry.home} />
            <div className="text-center">
              {fx.played ? (
                <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="font-display text-5xl sm:text-6xl leading-none tabular-nums">
                  {fx.homeGoals}<span className="text-ink-mute mx-1">-</span>{fx.awayGoals}
                </motion.div>
              ) : (
                <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2.4, repeat: Infinity }} className="font-display text-4xl sm:text-5xl text-ink-mute leading-none flex flex-col items-center gap-1">
                  <Swords size={22} className="text-accent" />VS
                </motion.div>
              )}
              {fx.played && <div className="text-[10px] uppercase tracking-wider text-accent font-bold mt-1">{t('shell.hub.played')}</div>}
            </div>
            <TeamSide name={away.name} kit={away.kit} short={away.shortName} mine={!entry.home} />
          </div>

          <div className="relative mt-4 flex flex-wrap items-center justify-center gap-2">
            <Badge tone={entry.home ? 'accent' : 'info'}>{entry.home ? t('common.home') : t('common.away')}</Badge>
            {fx.neutral && <Badge>{t('shell.hub.neutral')}</Badge>}
            {roleBadge}
          </div>
        </>
      ) : (
        <div className="relative py-8 text-center">
          <div className="mx-auto grid place-items-center size-14 rounded-2xl bg-white/6 text-accent"><Icon name="calendar" size={26} /></div>
          <div className="font-display text-3xl mt-3">{t('shell.hub.noMatch')}</div>
          <div className="text-ink-dim text-sm mt-1">{week.internationalBreak ? t('shell.hub.noMatchBreak') : t('shell.hub.noMatchSub')}</div>
        </div>
      )}

      <div className="relative mt-6 sm:mt-7">
        {pending ? (
          <div className="flex flex-col sm:flex-row gap-2.5">
            <Button variant="primary" size="lg" block className="sm:flex-1 !h-14 text-lg" icon="play" onClick={() => onPlay(agenda.pendingMatches[0])}>{t('shell.hub.play')}</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <Button variant="primary" size="lg" block className="sm:flex-1 !h-14 text-lg" loading={advancing} disabled={!agenda.canAdvance} onClick={onAdvance}>
                <FastForward size={20} />{advancing ? t('shell.hub.advancing') : t('shell.hub.advance')}
              </Button>
            </div>
            {!agenda.canAdvance && agenda.blockers.length > 0 && (
              <div className="rounded-2xl border border-gold/30 bg-gold/8 px-4 py-3">
                <div className="text-[11px] uppercase tracking-wider font-bold text-gold mb-1.5">{t('shell.hub.blockers')}</div>
                <ul className="text-sm text-ink/90 grid gap-1">{agenda.blockers.map((b, i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1.5 rounded-full bg-gold shrink-0" />{b}</li>)}</ul>
                {eventBlockers.length > 0 && <Button size="sm" variant="gold" className="mt-3" onClick={() => openEvent(eventBlockers[0].id)}>{t('shell.hub.decide')}</Button>}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function TeamSide({ name, kit, short, mine }: { name: string; kit: Kit; short: string; mine: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-0 text-center">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }}
        className={clsx('relative', mine && 'drop-shadow-[0_0_18px_rgba(184,255,60,0.55)]')}>
        <Crest kit={kit} label={short} size={64} />
      </motion.div>
      <div className={clsx('font-display text-[19px] sm:text-3xl leading-[1.05] break-words max-w-full', mine ? 'text-accent' : 'text-ink')}>{name}</div>
    </div>
  );
}
