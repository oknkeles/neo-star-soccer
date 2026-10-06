/** Social screen parts: header stats, compose box and the feed. */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, Heart, Repeat2 } from 'lucide-react';
import type { SocialPost } from '../../../core/types';
import { t } from '../../../core/i18n';
import { game } from '../../../game/api';
import { Button, Card, CountUp, EmptyState, Icon, Meter, toast, clsx } from '../../components/kit';
import { AIBadge, Chip, Initials, PlayerFace, listItem, type Life } from './shared';
import { compactNumber, postAgeWeeks, sentimentTone } from './logic';

const MAX = 280;
const FILTERS = ['all', 'fan', 'media', 'football', 'mine'] as const;
type Filter = (typeof FILTERS)[number];

const filterKinds: Record<Exclude<Filter, 'all'>, SocialPost['author']['kind'][]> = {
  fan: ['fan'], media: ['journalist', 'pundit'], football: ['player', 'club', 'rival', 'partner'], mine: ['user'],
};

export function SocialHeader({ life }: { life: Life }) {
  const { career, lang } = life;
  return (
    <Card glow="gold" className="relative overflow-hidden">
      <div className="absolute -right-4 -top-8 text-gold/[0.07] pointer-events-none"><Icon name="users" size={170} /></div>
      <div className="relative grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-4 items-end">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-mute font-bold">{t('life.social.followers')}</div>
          <div className="font-display text-6xl leading-none text-gold mt-1"><CountUp value={career.followers} format={(v) => compactNumber(v, lang)} /></div>
          <div className="text-xs text-ink-mute mt-1 tabular-nums">{Math.round(career.followers).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB')}</div>
        </div>
        <Meter value={career.fame} label={t('life.social.fame')} icon="star" tone="gold" />
      </div>
    </Card>
  );
}

export function ComposeBox({ life }: { life: Life }) {
  const { player, state } = life;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const club = player.clubId ? state.world.clubs[player.clubId] : null;
  const left = MAX - text.length;
  const ready = text.trim().length > 0 && !busy;

  const post = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      await game.postSocial(text);
      setText('');
      toast(t('life.social.posted'), 'accent', 'message');
    } catch {
      toast(t('life.social.error'), 'danger', 'siren');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex gap-3">
        <PlayerFace p={player} kit={club?.kit} size={46} />
        <div className="flex-1 min-w-0">
          <textarea
            value={text} onChange={(e) => setText(e.target.value.slice(0, MAX))} rows={3} disabled={busy} aria-label={t('life.social.compose')}
            placeholder={t('life.social.placeholder')}
            className="w-full resize-none bg-transparent outline-none text-[15px] leading-snug placeholder:text-ink-mute"
          />
          <div className="flex flex-wrap gap-1.5 pb-3 border-b border-line/70">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setText(t(`life.social.tpl.${n}`))} disabled={busy} title={t('life.social.templates')}
                className="text-[11px] rounded-full border border-line px-2.5 py-1 text-ink-dim hover:border-accent/50 hover:text-ink cursor-pointer transition max-w-full truncate">
                {t(`life.social.tpl.${n}`)}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 pt-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className={clsx('text-xs tabular-nums font-semibold', left < 20 ? 'text-gold' : 'text-ink-mute')}>{left}</span>
              <span className="text-[11px] text-ink-mute hidden sm:inline truncate">{t('life.social.limitHint')}</span>
            </div>
            <Button variant="primary" icon="message" loading={busy} disabled={!ready} onClick={post}>{busy ? t('life.social.posting') : t('life.social.post')}</Button>
          </div>
          <AnimatePresence>
            {busy && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-accent mt-2 animate-nss-pulse">{t('life.social.reactions')}</motion.p>}
          </AnimatePresence>
        </div>
      </div>
    </Card>
  );
}

function ageLabel(weeks: number): string {
  return weeks <= 0 ? t('life.social.now') : t('life.social.weeksAgo', { n: weeks });
}

export function PostCard({ life, post, i }: { life: Life; post: SocialPost; i: number }) {
  const { state, lang } = life;
  const [liked, setLiked] = useState(false);
  const tone = sentimentTone(post.sentiment);
  const isUser = post.author.kind === 'user';
  const hue = post.author.kind === 'club' ? 140 : post.author.kind === 'journalist' ? 200 : post.author.kind === 'brand' ? 40 : undefined;
  return (
    <motion.article
      {...listItem(i)}
      className={clsx('relative rounded-[var(--radius-card)] p-4 border-l-[3px] glass', tone === 'accent' ? 'border-l-accent' : tone === 'danger' ? 'border-l-danger' : 'border-l-transparent', isUser && 'ring-1 ring-accent/30')}
    >
      <div className="flex gap-3">
        {isUser ? <PlayerFace p={life.player} kit={life.player.clubId ? state.world.clubs[life.player.clubId]?.kit : undefined} size={42} /> : <Initials name={post.author.name} size={42} tone={hue} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold truncate max-w-[60%]">{post.author.name}</span>
            {post.author.verified && <BadgeCheck size={15} className="text-info shrink-0" aria-label={t('life.social.verified')} />}
            <span className="text-xs text-ink-mute truncate">@{post.author.handle.replace(/^@/, '')}</span>
            <span className="text-xs text-ink-mute">· {ageLabel(postAgeWeeks(post, state.season, state.week))}</span>
            <span className="ml-auto flex items-center gap-1.5">
              {post.ai && <AIBadge />}
              {post.author.kind !== 'fan' && <Chip tone={isUser ? 'accent' : 'neutral'}>{t(`life.social.kind.${post.author.kind}`)}</Chip>}
            </span>
          </div>
          <p className="text-[15px] leading-snug mt-1.5 whitespace-pre-wrap break-words">{post.text}</p>
          <div className="flex items-center gap-5 mt-3 text-xs text-ink-mute">
            <button onClick={() => setLiked((v) => !v)} className={clsx('flex items-center gap-1.5 cursor-pointer transition hover:text-danger', liked && 'text-danger')} title={t('life.social.like')}>
              <motion.span key={String(liked)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}><Heart size={16} fill={liked ? 'currentColor' : 'none'} /></motion.span>
              <span className="tabular-nums">{compactNumber(post.likes + (liked ? 1 : 0), lang)}</span>
            </button>
            <span className="flex items-center gap-1.5" title={t('life.social.repost')}><Repeat2 size={16} /><span className="tabular-nums">{compactNumber(post.reposts, lang)}</span></span>
            {tone !== 'neutral' && (
              <span className={clsx('ml-auto flex items-center gap-1 font-semibold', tone === 'accent' ? 'text-accent' : 'text-danger')}>
                <Icon name={tone === 'accent' ? 'smile' : 'frown'} size={13} />{t(tone === 'accent' ? 'life.social.mood.good' : 'life.social.mood.bad')}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
}

export function Feed({ life }: { life: Life }) {
  const { state } = life;
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(24);
  const all = useMemo(() => [...state.social].reverse(), [state.social, state.social.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = filter === 'all' ? all : all.filter((p) => filterKinds[filter].includes(p.author.kind));
  return (
    <section className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={clsx('rounded-full px-3.5 h-8 text-xs font-semibold whitespace-nowrap cursor-pointer transition', filter === f ? 'bg-accent text-bg' : 'bg-white/6 text-ink-dim hover:bg-white/12')}>{t(`life.social.filter.${f}`)}</button>
        ))}
      </div>
      {list.length === 0 ? <EmptyState icon="message" title={t('life.social.empty')} /> : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
          {list.slice(0, limit).map((p, i) => <PostCard key={p.id} life={life} post={p} i={i} />)}
        </div>
      )}
      {list.length > limit && <div className="text-center"><Button variant="secondary" onClick={() => setLimit((l) => l + 24)}>{t('life.social.more')}</Button></div>}
    </section>
  );
}
