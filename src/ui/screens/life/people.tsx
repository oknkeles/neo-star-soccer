/** People screen parts: relationship meters, person cards, messaging drawer. */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Send } from 'lucide-react';
import type { RelKey } from '../../../core/types';
import type { PersonaKind } from '../../../core/narrative-types';
import { t } from '../../../core/i18n';
import { overall } from '../../../core/ratings';
import { REL_KEYS, relationshipLabel } from '../../../career/api';
import { game } from '../../../game/api';
import { Card, Icon, Meter, toast, clsx } from '../../components/kit';
import { AIBadge, Chip, Drawer, Initials, PlayerFace, SectionLabel, listItem, safe, useClaudeOn, type Life } from './shared';
import { buildCircle, relBand, type CircleEntry } from './circle';

const REL_ICON: Record<RelKey, string> = {
  manager: 'target', teammates: 'users', fans: 'megaphone', media: 'newspaper', family: 'house', partner: 'heart', agent: 'handshake', sponsors: 'dollar_badge',
};

export function relLabel(v: number): string {
  return safe(() => relationshipLabel(v), '') || t(`life.people.band.${relBand(v)}`);
}

// ───────── relationship meters ─────────

export function RelationshipGrid({ life }: { life: Life }) {
  const rel = life.career.relationships;
  const keys = safe(() => REL_KEYS, [] as RelKey[]);
  return (
    <section>
      <SectionLabel icon="heart">{t('life.people.relationships')}</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {keys.filter((k) => k !== 'partner' || life.career.partnerId || rel.partner > 0).map((k, i) => (
          <motion.div key={k} {...listItem(i)}>
            <Card className="h-full !p-3.5">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-white/6 grid place-items-center text-accent shrink-0"><Icon name={REL_ICON[k]} size={19} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-sm truncate">{t(`common.rel.${k}`)}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wide text-ink-dim whitespace-nowrap">{relLabel(rel[k])}</span>
                  </div>
                  <div className="mt-1.5"><Meter value={rel[k]} tone="auto" size="sm" showValue={false} /></div>
                </div>
                <span className="font-display text-2xl tabular-nums w-9 text-right">{Math.round(rel[k])}</span>
              </div>
              <p className="text-[11px] text-ink-mute leading-snug mt-2">{t(`life.people.rel.${k}`)}</p>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ───────── person cards ─────────

function Portrait({ life, e, size = 52 }: { life: Life; e: CircleEntry; size?: number }) {
  const p = e.footballerId ? life.state.world.players[e.footballerId] : null;
  if (p) {
    const kit = p.clubId ? life.state.world.clubs[p.clubId]?.kit : undefined;
    return <PlayerFace p={p} kit={kit} size={size} />;
  }
  return <Initials name={e.name} size={size} />;
}

export function PersonCard({ life, e, i, onChat }: { life: Life; e: CircleEntry; i: number; onChat: (e: CircleEntry) => void }) {
  const { state, player, ovr } = life;
  const other = e.footballerId ? state.world.players[e.footballerId] : null;
  const otherClub = other?.clubId ? state.world.clubs[other.clubId]?.name : null;
  const history = e.persona ? state.chats?.[e.persona]?.length ?? 0 : 0;
  return (
    <motion.div {...listItem(i)}>
      <Card className="h-full flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Portrait life={life} e={e} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold leading-tight truncate">{e.name}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <Chip tone={e.role === 'rival' ? 'danger' : e.role === 'mentor' ? 'violet' : e.role === 'manager' ? 'info' : 'accent'}>{t(`life.people.role.${e.role}`)}</Chip>
              {e.temperament && <Chip>{t(`life.temper.${e.temperament}`)}</Chip>}
              {otherClub && <Chip icon="shield">{otherClub}</Chip>}
            </div>
          </div>
        </div>
        {(e.personality || e.bio) && (
          <div className="text-xs text-ink-dim leading-snug space-y-1">
            {e.personality && <div className="text-ink font-medium first-letter:uppercase">{e.personality}</div>}
            {e.bio && <p className="line-clamp-3">{e.bio}</p>}
          </div>
        )}
        {e.role === 'rival' && other && (
          <div className="text-xs text-ink-dim">{t('life.people.rivalVs', { them: overall(other), you: ovr })}</div>
        )}
        {e.role === 'manager' && <ManagerExtras life={life} e={e} />}
        {e.relationship !== undefined && (
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-ink-mute">{e.relKey ? t(`common.rel.${e.relKey}`) : t('life.people.relationships')}</span>
              <span className="font-bold text-ink-dim uppercase tracking-wide">{relLabel(e.relationship)}</span>
            </div>
            <Meter value={e.relationship} tone="auto" size="sm" showValue={false} />
          </div>
        )}
        <div className="mt-auto pt-1">
          {e.persona ? (
            <button
              onClick={() => onChat(e)} disabled={player.retired}
              className="w-full h-10 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-40"
            >
              <Icon name="message" size={16} />{t('life.people.message')}
              {history > 0 && <span className="text-[10px] bg-accent/20 rounded-full px-1.5 py-0.5">{history}</span>}
            </button>
          ) : (
            <div className="h-10 rounded-xl bg-white/3 text-ink-mute text-xs grid place-items-center">{t('life.people.noChat')}</div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function ManagerExtras({ life, e }: { life: Life; e: CircleEntry }) {
  const { state, player } = life;
  const club = player.clubId ? state.world.clubs[player.clubId] : null;
  const mgr = club ? state.world.managers[club.managerId] : null;
  if (!mgr || `mgr-${mgr.id}` !== e.id) return null;
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="rounded-xl bg-white/4 px-2.5 py-2"><div className="text-ink-mute text-[10px] uppercase tracking-wider">{t('life.people.managerStyle')}</div><div className="font-semibold mt-0.5">{t(`life.style.${mgr.style}`)}</div></div>
      <div className="rounded-xl bg-white/4 px-2.5 py-2"><div className="text-ink-mute text-[10px] uppercase tracking-wider">{t('life.people.trustsYouth')}</div><div className="font-semibold mt-0.5">{mgr.trustsYouth}</div></div>
    </div>
  );
}

export function CircleSection({ life, onChat }: { life: Life; onChat: (e: CircleEntry) => void }) {
  const circle = buildCircle(life.state);
  if (!circle.length) return <Card><p className="text-sm text-ink-dim">{t('life.people.noPeople')}</p></Card>;
  const groups: ('work' | 'family' | 'rival')[] = ['work', 'family', 'rival'];
  let n = 0;
  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const list = circle.filter((e) => e.group === g);
        if (!list.length) return null;
        return (
          <section key={g}>
            <SectionLabel icon={g === 'work' ? 'briefcase' : g === 'family' ? 'house' : 'swords'}>{t(`life.people.group.${g}`)}</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {list.map((e) => <PersonCard key={e.id} life={life} e={e} i={n++} onChat={onChat} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ───────── chat drawer ─────────

export function ChatDrawer({ life, entry, onClose }: { life: Life; entry: CircleEntry | null; onClose: () => void }) {
  const persona: PersonaKind | null = entry?.persona ?? null;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const aiOn = useClaudeOn('chat');
  const endRef = useRef<HTMLDivElement>(null);
  const history = persona ? safe(() => game.chatHistory(persona), []) : [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [history.length, busy, entry?.id]);
  useEffect(() => { setText(''); }, [entry?.id]);

  const send = async (raw?: string) => {
    const msg = (raw ?? text).trim();
    if (!msg || !persona || busy) return;
    setText('');
    setBusy(true);
    try {
      await game.chat(persona, msg);
    } catch {
      toast(t('life.people.chat.error'), 'danger', 'message');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={!!entry} onClose={onClose}
      title={entry ? (
        <span className="flex items-center gap-3">
          <Portrait life={life} e={entry} size={36} />
          <span className="truncate">{entry.name}</span>
        </span>
      ) : ''}
      subtitle={entry ? (
        <span className="flex items-center gap-2">
          {t(`life.people.role.${entry.role}`)}
          {aiOn ? <AIBadge /> : <span className="text-ink-mute">· {t('life.people.chat.template')}</span>}
        </span>
      ) : undefined}
      footer={persona && (
        <form onSubmit={(ev) => { ev.preventDefault(); void send(); }} className="flex items-end gap-2">
          <textarea
            value={text} onChange={(ev) => setText(ev.target.value)} rows={1} maxLength={600}
            onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); void send(); } }}
            placeholder={t('life.people.chat.placeholder')}
            className="flex-1 resize-none max-h-28 rounded-2xl bg-white/5 border border-line focus:border-accent/50 outline-none px-4 py-2.5 text-sm placeholder:text-ink-mute"
          />
          <button type="submit" disabled={!text.trim() || busy} aria-label={t('life.people.chat.send')}
            className="w-11 h-11 rounded-2xl bg-accent text-bg grid place-items-center cursor-pointer disabled:opacity-40 active:scale-95 transition shrink-0">
            <Send size={18} />
          </button>
        </form>
      )}
    >
      {entry && persona && (
        <div className="p-4 flex flex-col gap-2.5 min-h-full">
          {history.length === 0 && !busy && (
            <div className="my-auto text-center py-8">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-white/5 grid place-items-center text-ink-mute"><Icon name="message" size={26} /></div>
              <p className="text-sm text-ink-dim mt-3 max-w-[16rem] mx-auto">{t('life.people.chat.empty')}</p>
              <div className="flex flex-col gap-2 mt-4 items-center">
                {[1, 2].map((n) => (
                  <button key={n} onClick={() => void send(t(`life.people.quick.${persona}.${n}`))}
                    className="rounded-full border border-line hover:border-accent/50 hover:bg-accent/8 px-4 py-2 text-sm text-ink-dim hover:text-ink transition cursor-pointer">
                    {t(`life.people.quick.${persona}.${n}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {history.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              className={clsx('max-w-[84%] rounded-2xl px-3.5 py-2.5 text-sm leading-snug whitespace-pre-wrap',
                m.from === 'user' ? 'self-end bg-accent text-bg rounded-br-md' : 'self-start bg-panel-2 text-ink border border-line rounded-bl-md')}>
              {m.text}
            </motion.div>
          ))}
          <AnimatePresence>
            {busy && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="self-start flex items-center gap-2" aria-live="polite">
                <div className="bg-panel-2 border border-line rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
                  {[0, 1, 2].map((d) => (
                    <motion.span key={d} className="w-1.5 h-1.5 rounded-full bg-ink-dim" animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 0.9, delay: d * 0.15 }} />
                  ))}
                </div>
                <span className="text-[11px] text-ink-mute">{t('life.people.chat.typing', { name: entry.name.split(' ')[0] })}</span>
              </motion.div>
            )}
          </AnimatePresence>
          {history.length > 0 && <p className="text-[10px] text-ink-mute text-center mt-2">{t('life.people.chat.hint')}</p>}
          <div ref={endRef} />
        </div>
      )}
    </Drawer>
  );
}
