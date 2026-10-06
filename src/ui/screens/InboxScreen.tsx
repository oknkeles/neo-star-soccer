/** Route 'inbox' (params.id optional). Master/detail messages with actionable refs. Owner: ui-shell agent. */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, CheckCheck } from 'lucide-react';
import type { GameState, InboxKind, InboxMessage } from '../../core/types';
import type { PressOccasion } from '../../core/narrative-types';
import { t } from '../../core/i18n';
import { game, useGame } from '../../game/api';
import { navigate } from '../router';
import { Badge, Button, Card, EmptyState, Icon, ScreenHeader, clsx, toast } from '../components/kit';
import { EffectChips } from './shell/EffectChips';
import { KIND_ICON, KIND_TONE, TONE_BG, TONE_TEXT, errText, money, openEvent, relativeWeek, useLang } from './shell/helpers';
import './shell/strings';

type Filter = 'all' | 'offers' | 'events' | 'sponsors' | 'press' | 'other';
const FILTERS: Filter[] = ['all', 'offers', 'events', 'sponsors', 'press', 'other'];
const GROUP: Record<InboxKind, Exclude<Filter, 'all'>> = {
  offer: 'offers', contract: 'offers', event: 'events', sponsor: 'sponsors', press: 'press',
  info: 'other', callup: 'other', award: 'other', manager: 'other', injury: 'other', story: 'other',
};
const OCCASIONS: PressOccasion[] = ['pre_match', 'post_match', 'transfer', 'scandal', 'milestone', 'unveiling'];

function Actions({ state, m }: { state: GameState; m: InboxMessage }) {
  const ref = m.ref;
  const run = (fn: () => void) => { try { fn(); } catch (e) { toast(errText(e), 'danger', 'shield_alert'); } };
  if (!ref) {
    if (m.kind === 'callup' || m.kind === 'award') return <Button variant="secondary" icon="arrow_right" onClick={() => navigate('career')}>{t('shell.inbox.toCareer')}</Button>;
    return null;
  }
  if (ref.type === 'offer' || ref.type === 'negotiation') {
    const offer = state.offers.find((o) => o.id === ref.id);
    const open = offer && (offer.status === 'pending' || offer.status === 'negotiating');
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" icon="handshake" onClick={() => navigate('transfers', { offer: ref.id })}>{t('shell.inbox.viewOffer')}</Button>
        {offer && !open && <Badge tone="neutral">{t(`shell.inbox.offerStatus.${offer.status}`)}</Badge>}
      </div>
    );
  }
  if (ref.type === 'event') {
    const ev = state.events.find((e) => e.id === ref.id);
    if (!ev) return <p className="text-sm text-ink-mute">{t('shell.inbox.gone')}</p>;
    if (!ev.resolved) return <Button variant="primary" icon="sparkles" onClick={() => openEvent(ev.id)}>{t('shell.inbox.decide')}</Button>;
    const choice = ev.choices.find((c) => c.id === ev.resolved?.choiceId);
    return (
      <div className="rounded-2xl border border-accent/30 bg-accent/8 p-3.5">
        <div className="text-[11px] uppercase tracking-wider font-bold text-accent mb-1">{t('shell.inbox.decided')}</div>
        {choice && <div className="font-semibold">{choice.label}</div>}
        {ev.resolved.text && <p className="text-sm text-ink-dim mt-1">{ev.resolved.text}</p>}
        {choice && <EffectChips effects={choice.effects} small className="mt-2.5" />}
      </div>
    );
  }
  if (ref.type === 'sponsor') {
    const deal = game.pendingSponsor(m.id);
    if (!deal) return <Badge>{t('shell.inbox.answered')}</Badge>;
    return (
      <div className="rounded-2xl border border-gold/35 bg-gold/8 p-4">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center size-11 rounded-xl bg-gold/15 text-gold"><Icon name="dollar_badge" size={22} /></span>
          <div className="min-w-0">
            <div className="font-display text-3xl leading-none truncate">{deal.brand}</div>
            <div className="text-xs text-ink-dim capitalize">{deal.category}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="font-display text-3xl text-gold leading-none">{money(deal.weekly)}</div>
            <div className="text-[11px] text-ink-mute">{t('common.perWeek')}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3 text-xs">
          <Badge>{t('shell.inbox.until', { y: deal.endSeason })}</Badge>
          {deal.requirement && <Badge tone="info">{deal.requirement}</Badge>}
        </div>
        <div className="flex gap-2.5 mt-4">
          <Button variant="gold" icon="check" onClick={() => run(() => game.acceptSponsor(m.id, true))}>{t('common.accept')}</Button>
          <Button variant="ghost" onClick={() => run(() => game.acceptSponsor(m.id, false))}>{t('common.reject')}</Button>
        </div>
      </div>
    );
  }
  if (ref.type === 'press') {
    const occ = OCCASIONS.find((o) => o === ref.id);
    return <Button variant="primary" icon="mic" onClick={() => navigate('press', occ ? { occasion: occ } : {})}>{t('shell.inbox.toPress')}</Button>;
  }
  return null;
}

function Detail({ state, m, onBack }: { state: GameState; m: InboxMessage; onBack: () => void }) {
  const tone = KIND_TONE[m.kind];
  return (
    <motion.div key={m.id} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
      <Card padded={false} className="p-5 sm:p-6">
        <button onClick={onBack} className="md:hidden flex items-center gap-1.5 text-sm text-ink-dim mb-4 cursor-pointer"><ArrowLeft size={16} />{t('common.back')}</button>
        <div className="flex items-start gap-3.5">
          <span className={clsx('grid place-items-center size-12 rounded-2xl shrink-0', TONE_BG[tone], TONE_TEXT[tone])}><Icon name={KIND_ICON[m.kind]} size={22} /></span>
          <div className="min-w-0">
            <h2 className="font-display text-3xl sm:text-4xl leading-[1.05]">{m.subject}</h2>
            <div className="text-sm text-ink-dim mt-1.5 flex flex-wrap items-center gap-x-2">
              <span className="font-semibold text-ink/90">{m.from}</span>
              <span className="text-ink-mute">· {t(`shell.inbox.kind.${m.kind}`)}</span>
              <span className="text-ink-mute">· {relativeWeek(state, m.season, m.week)}</span>
            </div>
          </div>
        </div>
        <div className="mt-5 text-[15px] leading-relaxed text-ink/90 whitespace-pre-line">{m.body}</div>
        <div className="mt-6"><Actions state={state} m={m} /></div>
      </Card>
    </motion.div>
  );
}

export default function InboxScreen({ params }: { params: Record<string, string> }) {
  useLang();
  const { state } = useGame();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(params.id ?? null);

  const all = useMemo(() => (state ? [...state.inbox].reverse() : []), [state, state?.inbox.length]);  // eslint-disable-line react-hooks/exhaustive-deps
  const list = filter === 'all' ? all : all.filter((m) => GROUP[m.kind] === filter);
  const current = state?.inbox.find((m) => m.id === selected) ?? null;

  useEffect(() => {
    if (current && !current.read) { try { game.markRead(current.id); } catch { /* state may be gone */ } }
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Desktop: always show something in the detail pane.
  useEffect(() => {
    if (!selected && list.length && typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) setSelected(list[0].id);
  }, [selected, list.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <EmptyState icon="inbox" title={t('shell.hub.noCareer')} action={<Button variant="primary" onClick={() => navigate('title')}>{t('shell.hub.toTitle')}</Button>} />;

  const unread = state.inbox.filter((m) => !m.read).length;
  const count = (f: Filter) => (f === 'all' ? all : all.filter((m) => GROUP[m.kind] === f)).filter((m) => !m.read).length;

  return (
    <div>
      <ScreenHeader
        title={t('shell.inbox.title')} subtitle={unread ? t('shell.inbox.unread', { n: unread }) : t('shell.inbox.allRead')} icon="inbox"
        right={unread > 0 ? <Button size="sm" variant="secondary" aria-label={t('shell.inbox.markAll')} title={t('shell.inbox.markAll')} onClick={() => game.markAllRead()}><CheckCheck size={15} /><span className="hidden sm:inline">{t('shell.inbox.markAll')}</span></Button> : undefined}
      />
      <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-1 px-1">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={clsx('flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-bold whitespace-nowrap border cursor-pointer transition-colors', filter === f ? 'bg-accent text-bg border-accent' : 'bg-white/4 border-line text-ink-dim hover:text-ink')}>
            {t(`shell.inbox.f.${f}`)}
            {count(f) > 0 && <span className={clsx('min-w-4 h-4 px-1 rounded-full text-[10px] grid place-items-center', filter === f ? 'bg-bg text-accent' : 'bg-danger text-white')}>{count(f)}</span>}
          </button>
        ))}
      </div>

      {all.length === 0 ? <EmptyState icon="inbox" title={t('shell.inbox.empty')} text={t('shell.inbox.emptySub')} /> : (
        <div className="grid md:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-4 items-start">
          <div className={clsx('grid grid-cols-1 gap-1.5', current && 'hidden md:grid')}>
            {list.length === 0 && <div className="text-sm text-ink-dim py-8 text-center">{t('shell.inbox.emptyFilter')}</div>}
            {list.map((m) => {
              const tone = KIND_TONE[m.kind];
              const active = m.id === selected;
              return (
                <button key={m.id} onClick={() => setSelected(m.id)}
                  className={clsx('relative flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left cursor-pointer transition-colors',
                    active ? 'border-accent/50 bg-accent/8' : m.read ? 'border-line/60 bg-white/2 hover:bg-white/5' : 'border-line bg-white/6 hover:bg-white/9')}>
                  <span className={clsx('grid place-items-center size-10 rounded-xl shrink-0', TONE_BG[tone], TONE_TEXT[tone])}><Icon name={KIND_ICON[m.kind]} size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={clsx('text-sm truncate', m.read ? 'text-ink-dim' : 'font-bold text-ink')}>{m.subject}</span>
                    </span>
                    <span className="block text-xs text-ink-mute truncate">{m.from}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="text-[11px] text-ink-mute">{relativeWeek(state, m.season, m.week)}</span>
                    {!m.read && <span className="size-2 rounded-full bg-accent shadow-[0_0_8px_rgba(184,255,60,0.9)]" />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className={clsx('md:sticky md:top-20', !current && 'hidden md:block')}>
            <AnimatePresence mode="wait">
              {current ? <Detail key={current.id} state={state} m={current} onBack={() => setSelected(null)} /> : (
                <div className="hidden md:grid place-items-center rounded-3xl border border-dashed border-line py-20 text-ink-mute text-sm">{t('shell.inbox.select')}</div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
