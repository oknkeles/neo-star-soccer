/**
 * Overlays shown above any screen: pending game events (choice modal), level-up /
 * trophy celebrations, week report. Owner: ui-shell agent.
 *
 * Priority: week report → celebration → pending event. Game notices that are not
 * celebrations become toasts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { EventChoice, GameEvent, WeekReport } from '../core/types';
import { audio } from '../audio/api';
import { overall } from '../core/ratings';
import { t } from '../core/i18n';
import { game, useGame, useGameNotices } from '../game/api';
import { useRoute, type RouteName } from './router';
import { toast } from './components/kit';
import { EventModal, type EventResult } from './screens/shell/overlays/EventModal';
import { WeekReportModal } from './screens/shell/overlays/WeekReportModal';
import { Celebration, type CelebrationItem } from './screens/shell/overlays/Celebration';
import { clearFocusedEvent, errText, resetEventSnooze, snoozeEvent, useEventFocus, useLang } from './screens/shell/helpers';
import './screens/shell/strings';

/** Screens where interruptions would be wrong (full-bleed flows). */
const QUIET: RouteName[] = ['title', 'new-career', 'match', 'drill', 'legacy'];

let celSeq = 0;

export default function GlobalOverlays() {
  useLang();
  const route = useRoute().name;
  const { state, version } = useGame();
  const { focused, snoozed } = useEventFocus();
  const [report, setReport] = useState<WeekReport | null>(null);
  const [cels, setCels] = useState<CelebrationItem[]>([]);
  const [result, setResult] = useState<EventResult | null>(null);
  const [busy, setBusy] = useState(false);
  const seen = useRef<{ id: string; key: string; ovr: number } | null>(null);

  const pushCel = useCallback((c: Omit<CelebrationItem, 'id'>) => {
    setCels((q) => (q.some((x) => x.kind === c.kind && x.title === c.title) ? q : [...q, { ...c, id: ++celSeq }]));
    audio.play('levelup');
    audio.burst('applause');
  }, []);

  useGameNotices((n) => {
    if (n.kind === 'trophy') pushCel({ kind: 'trophy', title: n.text, subtitle: '' });
    else if (n.kind === 'award') pushCel({ kind: 'award', title: n.text, subtitle: '' });
    else if (n.kind === 'milestone') pushCel({ kind: 'milestone', title: n.text, subtitle: '' });
    else {
      toast(n.text, n.tone, n.icon);
      if (n.kind === 'offer' || n.kind === 'sponsor' || n.kind === 'callup' || n.kind === 'transfer') audio.play('notify', 0.6);
    }
  });

  // Detect a freshly finished week and overall level-ups; a loaded save is silently adopted.
  useEffect(() => {
    if (!state) { seen.current = null; return; }
    const r = state.career.lastWeekReport;
    const key = r ? `${r.season}-${r.week}` : '';
    const p = state.world.players[state.career.playerId];
    const ovr = p ? overall(p) : 0;
    const s = seen.current;
    if (!s || s.id !== state.id) { seen.current = { id: state.id, key, ovr }; return; }
    if (game.advancing) return;
    if (r && key !== s.key) { setReport(r); resetEventSnooze(); }
    if (ovr > s.ovr) pushCel({ kind: 'levelup', title: t('shell.cel.levelupTitle', { n: ovr }), subtitle: t('shell.cel.levelupSub', { from: s.ovr, to: ovr }) });
    s.key = key;
    s.ovr = ovr;
  }, [state, version, pushCel]);

  const active = !!state && !QUIET.includes(route);
  const pending: GameEvent[] = state ? state.events.filter((e) => !e.resolved && e.choices.length > 0) : [];
  const focusedEv = focused ? pending.find((e) => e.id === focused) : undefined;
  const nextEv = focusedEv ?? pending.find((e) => !snoozed.has(e.id));

  const choose = useCallback((ev: GameEvent, choice: EventChoice) => {
    setBusy(true);
    try {
      const text = game.resolveEvent(ev.id, choice.id);
      setResult({ event: ev, choice, text });
      audio.play('click');
    } catch (e) {
      toast(errText(e), 'danger', 'shield_alert');
    } finally {
      setBusy(false);
    }
  }, []);

  const showReport = active && report;
  const showCel = active && !showReport ? cels[0] : undefined;
  const showEvent = active && !showReport && !showCel;
  const evForModal = showEvent && !result ? nextEv ?? null : null;
  const resForModal = showEvent ? result : null;

  return (
    <>
      <EventModal
        event={evForModal} result={resForModal} busy={busy}
        remaining={pending.filter((e) => e.id !== resForModal?.event.id).length}
        onChoose={choose}
        onLater={(e) => snoozeEvent(e.id)}
        onContinue={() => { setResult(null); clearFocusedEvent(); }}
      />
      {state && <WeekReportModal report={showReport ? report : null} state={state} onClose={() => setReport(null)} />}
      <AnimatePresence>
        {showCel && <Celebration key={showCel.id} item={showCel} onClose={() => setCels((q) => q.filter((x) => x.id !== showCel.id))} />}
      </AnimatePresence>
    </>
  );
}
