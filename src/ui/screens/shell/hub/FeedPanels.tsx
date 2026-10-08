/** Hub panels about the world: a short inbox (pending decisions first), the one-line league chip and a tiny AI dot. */
import { useEffect, useState } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import type { Competition, GameState, TableRow } from '../../../../core/types';
import { t } from '../../../../core/i18n';
import { aiStatus, onAIStatus, type AIStatus } from '../../../../ai/api';
import { sortedTable } from '../../../../competition/api';
import { useSettings, type Agenda } from '../../../../game/api';
import { Card, Icon, clsx } from '../../../components/kit';
import { navigate } from '../../../router';
import { KIND_ICON, KIND_TONE, TONE_BG, TONE_TEXT, attempt, openEvent, relativeWeek, userView } from '../helpers';

function manualSort(rows: TableRow[]): TableRow[] {
  return [...rows].sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
}

export function userTable(state: GameState, clubId: string): { comp: Competition; rows: TableRow[] } | null {
  const comp = Object.values(state.competitions).find((c) => c.kind === 'league' && c.teamIds.includes(clubId));
  if (!comp) return null;
  const raw = comp.tables.main ?? Object.values(comp.tables)[0];
  if (!raw) return null;
  return { comp, rows: attempt(() => sortedTable(comp), manualSort(raw)) };
}

/** One quiet line: "Süper Lig · 3. sıra · 24 puan". */
export function LeagueChip({ state }: { state: GameState }) {
  const v = userView(state);
  const data = v?.club ? userTable(state, v.club.id) : null;
  if (!v?.club || !data) return null;
  const idx = data.rows.findIndex((r) => r.teamId === v.club!.id);
  if (idx < 0) return null;
  return (
    <button
      onClick={() => navigate('competitions')}
      className="w-full flex items-center gap-2.5 rounded-2xl border border-line bg-white/4 hover:bg-white/7 px-4 h-12 text-left cursor-pointer transition-colors"
    >
      <Icon name="trophy" size={17} className="text-gold shrink-0" />
      <span className="font-semibold truncate">{data.comp.name}</span>
      <span className="ml-auto text-sm text-ink-dim whitespace-nowrap tabular-nums">{t('shell.hub.leaguePos', { pos: idx + 1, pts: data.rows[idx].points })}</span>
      <ChevronRight size={16} className="text-ink-mute shrink-0" />
    </button>
  );
}

/** At most three rows: decisions waiting for you (highlighted) first, then the newest messages. */
export function InboxPreview({ state, agenda }: { state: GameState; agenda: Agenda }) {
  const pending = agenda.pendingEvents.filter((e) => e.choices.length > 0);
  const pendingIds = new Set(pending.map((e) => e.id));
  const msgs = [...state.inbox]
    .filter((m) => !(m.ref?.type === 'event' && pendingIds.has(m.ref.id)))
    .reverse();
  const unreadFirst = [...msgs.filter((m) => !m.read), ...msgs.filter((m) => m.read)];
  const rows = [
    ...pending.map((e) => ({ key: `e-${e.id}`, event: e, msg: null })),
    ...unreadFirst.map((m) => ({ key: m.id, event: null, msg: m })),
  ].slice(0, 3);
  const unread = state.inbox.filter((m) => !m.read).length;

  return (
    <Card
      title={<>{t('shell.hub.inbox')}{unread > 0 && <span className="ml-2 min-w-5 h-5 px-1.5 rounded-full bg-danger text-white text-[11px] inline-grid place-items-center normal-case">{unread}</span>}</>}
      icon="inbox"
      action={<button onClick={() => navigate('inbox')} className="text-xs text-ink-dim hover:text-accent flex items-center cursor-pointer">{t('shell.hub.all')}<ChevronRight size={14} /></button>}
    >
      {rows.length === 0 ? <div className="text-sm text-ink-dim py-3 text-center">{t('shell.hub.inboxEmpty')}</div> : (
        <ul className="grid grid-cols-1 gap-2">
          {rows.map((r) => r.event ? (
            <li key={r.key}>
              <button onClick={() => openEvent(r.event!.id)} className="w-full flex items-center gap-3 rounded-2xl border border-violet/40 bg-violet/10 hover:bg-violet/15 px-3 py-2.5 text-left cursor-pointer transition-colors">
                <span className="relative grid place-items-center size-10 rounded-xl bg-violet/20 text-violet shrink-0">
                  <Sparkles size={18} />
                  <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-danger animate-nss-pulse" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold truncate">{r.event.title}</span>
                  <span className="block text-xs text-violet truncate">{t('shell.hub.eventTag')}</span>
                </span>
                <ChevronRight size={16} className="text-violet shrink-0" />
              </button>
            </li>
          ) : (
            <li key={r.key}>
              <button onClick={() => navigate('inbox', { id: r.msg!.id })} className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-white/5 text-left cursor-pointer">
                <span className={clsx('grid place-items-center size-10 rounded-xl shrink-0', TONE_BG[KIND_TONE[r.msg!.kind]], TONE_TEXT[KIND_TONE[r.msg!.kind]])}><Icon name={KIND_ICON[r.msg!.kind]} size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className={clsx('block text-sm truncate', r.msg!.read ? 'text-ink-dim' : 'font-bold')}>{r.msg!.subject}</span>
                  <span className="block text-xs text-ink-mute truncate">{r.msg!.from} · {relativeWeek(state, r.msg!.season, r.msg!.week)}</span>
                </span>
                {!r.msg!.read && <span className="size-2 rounded-full bg-accent shrink-0 shadow-[0_0_8px_rgba(184,255,60,0.9)]" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** A tiny dot: is Claude writing the story right now? (details live in Settings) */
export function AiChip() {
  const settings = useSettings();
  const [status, setStatus] = useState<AIStatus | null>(() => attempt(aiStatus, null));
  useEffect(() => attempt(() => onAIStatus(setStatus), () => {}), []);
  const on = settings.ai.enabled && settings.ai.apiKey.trim().length > 10;
  const paused = !!status?.cooldownUntil && status.cooldownUntil > Date.now();
  const busy = (status?.pending ?? 0) > 0;
  const label = !on ? t('shell.hub.ai.off') : paused ? t('shell.hub.ai.paused') : busy ? t('shell.hub.ai.busy') : t('shell.hub.ai.on');
  return (
    <button
      onClick={() => navigate('settings')}
      title={status?.lastError ?? `${label} · ${t('shell.hub.ai.tip')}`}
      aria-label={label}
      className="inline-flex items-center gap-1.5 h-6 px-1 text-[10px] font-bold uppercase tracking-wider text-ink-mute hover:text-ink cursor-pointer"
    >
      <span className={clsx('size-2 rounded-full', !on ? 'bg-white/20' : paused ? 'bg-gold' : busy ? 'bg-accent animate-nss-pulse' : 'bg-accent')} />AI
    </button>
  );
}
