/** Hub panels about the world: inbox preview, headline carousel, mini table, social, events banner, AI chip. */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, ChevronRight, Heart, Loader2, Newspaper, Repeat2 } from 'lucide-react';
import type { Competition, GameState, TableRow } from '../../../../core/types';
import { t } from '../../../../core/i18n';
import { aiStatus, onAIStatus, type AIStatus } from '../../../../ai/api';
import { sortedTable } from '../../../../competition/api';
import { useSettings, type Agenda } from '../../../../game/api';
import { Badge, Card, Crest, Icon, clsx } from '../../../components/kit';
import { navigate } from '../../../router';
import { KIND_ICON, KIND_TONE, TONE_BG, TONE_TEXT, attempt, num, openEvent, relativeWeek, teamView, userView } from '../helpers';

function SeeAll({ to, label }: { to: Parameters<typeof navigate>[0]; label?: string }) {
  return (
    <button onClick={() => navigate(to)} className="text-xs text-ink-dim hover:text-accent flex items-center cursor-pointer">
      {label ?? t('shell.hub.all')}<ChevronRight size={14} />
    </button>
  );
}

export function EventsBanner({ agenda }: { agenda: Agenda }) {
  const pending = agenda.pendingEvents.filter((e) => e.choices.length > 0);
  if (!pending.length) return null;
  return (
    <motion.button
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      onClick={() => openEvent(pending[0].id)}
      className="w-full flex items-center gap-3 rounded-2xl border border-violet/40 bg-violet/10 px-4 py-3 text-left cursor-pointer hover:bg-violet/15 transition-colors"
    >
      <span className="relative grid place-items-center size-10 rounded-xl bg-violet/20 text-violet shrink-0">
        <Icon name="sparkles" size={20} />
        <span className="absolute -top-1 -right-1 size-3 rounded-full bg-danger animate-nss-pulse" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{t('shell.hub.events', { n: pending.length })}</span>
        <span className="block text-xs text-ink-dim truncate">{pending[0].title}</span>
      </span>
      <ChevronRight size={18} className="text-violet" />
    </motion.button>
  );
}

export function InboxPreview({ state }: { state: GameState }) {
  const latest = [...state.inbox].slice(-3).reverse();
  const unread = state.inbox.filter((m) => !m.read).length;
  return (
    <Card title={<>{t('shell.hub.inbox')}{unread > 0 && <span className="ml-2 min-w-5 h-5 px-1.5 rounded-full bg-danger text-white text-[11px] inline-grid place-items-center normal-case">{unread}</span>}</>} icon="inbox" action={<SeeAll to="inbox" />}>
      {latest.length === 0 ? <div className="text-sm text-ink-dim py-3 text-center">{t('shell.hub.inboxEmpty')}</div> : (
        <ul className="grid grid-cols-1 gap-1.5">
          {latest.map((m) => (
            <li key={m.id}>
              <button onClick={() => navigate('inbox', { id: m.id })} className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-white/5 text-left cursor-pointer">
                <span className={clsx('grid place-items-center size-9 rounded-xl shrink-0', TONE_BG[KIND_TONE[m.kind]], TONE_TEXT[KIND_TONE[m.kind]])}><Icon name={KIND_ICON[m.kind]} size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className={clsx('block text-sm truncate', m.read ? 'text-ink-dim' : 'font-bold')}>{m.subject}</span>
                  <span className="block text-xs text-ink-mute truncate">{m.from} · {relativeWeek(state, m.season, m.week)}</span>
                </span>
                {!m.read && <span className="size-2 rounded-full bg-accent shrink-0 shadow-[0_0_8px_rgba(184,255,60,0.9)]" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function NewsCarousel({ state }: { state: GameState }) {
  const items = useMemo(() => [...state.news].slice(-8).reverse(), [state.news, state.news.length]);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || items.length < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % items.length), 5600);
    return () => clearInterval(id);
  }, [paused, items.length]);
  const cur = items[Math.min(i, items.length - 1)];
  return (
    <Card title={t('shell.hub.news')} icon="newspaper" action={<SeeAll to="news" />}>
      <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="min-h-[104px]">
        {!cur ? <div className="text-sm text-ink-dim py-4 text-center">{t('shell.hub.newsEmpty')}</div> : (
          <AnimatePresence mode="wait">
            <motion.button
              key={cur.id} onClick={() => navigate('news')}
              initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}
              className="block w-full text-left cursor-pointer"
            >
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-mute">
                <Newspaper size={12} />{cur.outlet}<span>· {relativeWeek(state, cur.season, cur.week)}</span>
                {cur.aboutUser && <Badge tone="accent">{t('shell.hub.aboutYou')}</Badge>}
              </span>
              <span className="block font-display text-2xl sm:text-3xl leading-tight mt-1.5 line-clamp-3">{cur.headline}</span>
            </motion.button>
          </AnimatePresence>
        )}
      </div>
      {items.length > 1 && (
        <div className="flex gap-1.5 mt-3">{items.map((n, k) => <button key={n.id} aria-label={String(k + 1)} onClick={() => setI(k)} className={clsx('h-1 rounded-full transition-all cursor-pointer', k === i ? 'w-6 bg-accent' : 'w-2 bg-white/15')} />)}</div>
      )}
    </Card>
  );
}

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

export function MiniTable({ state }: { state: GameState }) {
  const v = userView(state);
  const data = v?.club ? userTable(state, v.club.id) : null;
  if (!v?.club || !data) return null;
  const idx = data.rows.findIndex((r) => r.teamId === v.club!.id);
  const start = Math.max(0, Math.min(Math.max(0, data.rows.length - 7), idx - 3));
  const slice = data.rows.slice(start, start + 7);
  return (
    <Card title={data.comp.name} icon="trophy" action={<SeeAll to="competitions" />} padded={false} className="p-4 pb-2">
      <div className="grid grid-cols-[22px_1fr_28px_34px_34px] gap-x-2 text-[10px] uppercase tracking-wider font-bold text-ink-mute px-1 mb-1">
        <span>#</span><span /><span className="text-right">{t('shell.hub.tableP')}</span><span className="text-right">{t('shell.hub.tableGD')}</span><span className="text-right">{t('shell.hub.tablePts')}</span>
      </div>
      <div className="grid">
        {slice.map((r, k) => {
          const mine = r.teamId === v.club!.id;
          const tv = teamView(state, r.teamId);
          const pos = start + k + 1;
          const gd = r.gf - r.ga;
          return (
            <div key={r.teamId} className={clsx('grid grid-cols-[22px_1fr_28px_34px_34px] gap-x-2 items-center rounded-lg px-1 h-9 text-sm', mine && 'bg-accent/12 ring-1 ring-accent/30 font-bold')}>
              <span className={clsx('tabular-nums text-xs', mine ? 'text-accent' : 'text-ink-mute')}>{pos}</span>
              <span className="flex items-center gap-2 min-w-0"><Crest kit={tv.kit} size={16} /><span className="truncate">{tv.name}</span></span>
              <span className="text-right tabular-nums text-ink-dim">{r.played}</span>
              <span className="text-right tabular-nums text-ink-dim">{gd > 0 ? `+${gd}` : gd}</span>
              <span className={clsx('text-right tabular-nums font-bold', mine && 'text-accent')}>{r.points}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function SocialPreview({ state }: { state: GameState }) {
  const posts = [...state.social].slice(-3).reverse();
  return (
    <Card title={t('shell.hub.social')} icon="message" action={<SeeAll to="social" />}>
      {posts.length === 0 ? <div className="text-sm text-ink-dim py-3 text-center">{t('shell.hub.socialEmpty')}</div> : (
        <ul className="grid grid-cols-1 gap-3">
          {posts.map((p) => (
            <li key={p.id} className="flex gap-3">
              <span className="grid place-items-center size-9 rounded-full bg-white/8 text-xs font-bold shrink-0 text-ink-dim">{p.author.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-sm"><span className="font-bold truncate">{p.author.name}</span>{p.author.verified && <BadgeCheck size={13} className="text-info shrink-0" />}<span className="text-ink-mute text-xs truncate">@{p.author.handle.replace(/^@/, '')}</span></div>
                <div className="text-sm text-ink/90 line-clamp-2">{p.text}</div>
                <div className="flex gap-3 text-[11px] text-ink-mute mt-1"><span className="flex items-center gap-1"><Heart size={11} />{num(p.likes)}</span><span className="flex items-center gap-1"><Repeat2 size={11} />{num(p.reposts)}</span></div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Small chip showing whether Claude is writing the story right now. */
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
      title={status?.lastError ?? t('shell.hub.ai.tip')}
      className={clsx('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-bold uppercase tracking-wider cursor-pointer',
        !on ? 'border-line text-ink-mute bg-white/4' : paused ? 'border-gold/40 text-gold bg-gold/10' : 'border-accent/40 text-accent bg-accent/10')}
    >
      {busy && on ? <Loader2 size={12} className="animate-spin" /> : <Icon name="bot" size={12} />}{label}
    </button>
  );
}
