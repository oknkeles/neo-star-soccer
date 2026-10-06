/** News screen parts: newspaper front page, article columns and the reader. */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { NewsArticle } from '../../../core/types';
import { hasKey, t } from '../../../core/i18n';
import { Button, EmptyState, Icon, Modal, clsx } from '../../components/kit';
import { Chip, listItem, type Life } from './shared';
import { filterNews, headlineOf, heroOf, paragraphs, sortNews, tagCounts } from './logic';

const TAG_ICON: Record<string, string> = {
  user: 'star', transfer: 'handshake', match: 'target', league: 'trophy', rival: 'swords', scandal: 'siren', press: 'mic', contract: 'handshake',
  injury: 'hospital', retirement: 'crown', award: 'medal', cup: 'medal', derby: 'flame', continental: 'globe', international: 'flag',
  family: 'house', story: 'book_open', manager: 'target', sponsor: 'dollar_badge', title: 'trophy', record: 'rocket',
};

export const tagLabel = (tag: string): string =>
  hasKey(`life.news.tag.${tag}`) ? t(`life.news.tag.${tag}`) : tag.charAt(0).toLocaleUpperCase() + tag.slice(1).replace(/_/g, ' ');

const tagIcon = (a: NewsArticle): string => TAG_ICON[a.tags.find((x) => TAG_ICON[x]) ?? ''] ?? 'newspaper';

const seasonLabel = (season: number) => `${season}/${String(season + 1).slice(2)}`;

function AiRibbon({ big }: { big?: boolean }) {
  return (
    <span title={t('life.news.aiTitle')} className={clsx('inline-flex items-center gap-1 rounded-full bg-violet/18 text-violet font-bold tracking-wider', big ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]')}>
      <Icon name="sparkles" size={big ? 12 : 10} />{t('life.news.ai')}
    </span>
  );
}

// ───────── masthead ─────────

export function Masthead({ outlet, season, week }: { outlet: string; season: number; week: number }) {
  return (
    <header className="border-y-[3px] border-double border-ink/30 py-3 text-center relative">
      <div className="flex items-center justify-between text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-ink-mute px-1">
        <span>{t('life.news.edition', { a: season, b: String(season + 1).slice(2), n: week + 1 })}</span>
        <span className="hidden sm:inline">{t('life.news.sections')}</span>
        <span>{t('life.news.issue', { n: (season - 2026) * 52 + week + 1 })}</span>
      </div>
      <h2 className="font-display text-[2.6rem] sm:text-7xl leading-none tracking-[0.04em] mt-1 neon-text truncate px-2">{outlet}</h2>
    </header>
  );
}

// ───────── hero ─────────

export function HeroStory({ a, onOpen }: { a: NewsArticle; onOpen: (a: NewsArticle) => void }) {
  const lede = paragraphs(a.body)[0] ?? '';
  return (
    <motion.article {...listItem(0)} onClick={() => onOpen(a)} className="group grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-5 cursor-pointer">
      <div className="order-2 md:order-1">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-accent font-bold">
          <span>{t('life.news.top')}</span>
          {a.ai && <AiRibbon big />}
          {a.aboutUser && <Chip icon="star" tone="gold">{t('life.news.about')}</Chip>}
        </div>
        <h3 className="font-display text-4xl sm:text-6xl leading-[0.95] mt-2 group-hover:text-accent transition-colors">{headlineOf(a)}</h3>
        <p className="font-serif text-base text-ink-dim leading-relaxed mt-3 line-clamp-5">{lede}</p>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs text-ink-mute">{t('life.news.week', { n: a.week + 1 })} · {seasonLabel(a.season)}</span>
          {a.tags.slice(0, 3).map((x) => <Chip key={x}>{tagLabel(x)}</Chip>)}
        </div>
        <Button variant="secondary" size="sm" className="mt-4">{t('life.news.continue')}</Button>
      </div>
      <div className="order-1 md:order-2 relative rounded-2xl overflow-hidden min-h-[160px] md:min-h-[240px] bg-gradient-to-br from-[#16402a] via-[#0e2a2a] to-[#1a2f55] border border-line">
        <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(circle,rgba(255,255,255,0.16)_1px,transparent_1.6px)] [background-size:7px_7px]" />
        <div className="absolute -right-6 -bottom-8 text-accent/25 group-hover:text-accent/40 transition-colors"><Icon name={tagIcon(a)} size={190} /></div>
        <div className="absolute left-3 bottom-3 right-3 flex items-end justify-between">
          <span className="font-display text-xl tracking-wide text-white/85 drop-shadow">{a.outlet}</span>
          <span className="text-[10px] uppercase tracking-widest text-white/60">{a.tags[0] ? tagLabel(a.tags[0]) : ''}</span>
        </div>
      </div>
    </motion.article>
  );
}

// ───────── columns ─────────

export function StoryCard({ a, i, onOpen }: { a: NewsArticle; i: number; onOpen: (a: NewsArticle) => void }) {
  const lede = paragraphs(a.body)[0] ?? '';
  return (
    <motion.article {...listItem(i)} onClick={() => onOpen(a)} className="break-inside-avoid mb-5 border-t-2 border-ink/15 pt-3 cursor-pointer group relative">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-ink-mute">
        <Icon name={tagIcon(a)} size={12} className="text-accent" />
        <span className="truncate">{a.outlet}</span>
        <span>· {t('life.news.week', { n: a.week + 1 })}</span>
        {a.ai && <span className="ml-auto"><AiRibbon /></span>}
      </div>
      <h4 className="font-serif font-bold text-xl leading-tight mt-1.5 group-hover:text-accent transition-colors">{headlineOf(a)}</h4>
      <p className="font-serif text-sm text-ink-dim leading-relaxed mt-1.5 line-clamp-4">{lede}</p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {a.aboutUser && <Chip tone="gold" icon="star">{t('life.news.about')}</Chip>}
        {a.tags.filter((x) => x !== 'user').slice(0, 2).map((x) => <Chip key={x}>{tagLabel(x)}</Chip>)}
      </div>
    </motion.article>
  );
}

// ───────── reader ─────────

export function ArticleReader({ a, onClose }: { a: NewsArticle | null; onClose: () => void }) {
  const paras = a ? paragraphs(a.body) : [];
  return (
    <Modal open={!!a} onClose={onClose} size="lg" title={a?.outlet ?? ''}>
      {a && (
        <article>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-ink-mute flex-wrap">
            <span>{t('life.news.week', { n: a.week + 1 })} · {seasonLabel(a.season)}</span>
            {a.ai && <AiRibbon big />}
          </div>
          <h3 className="font-display text-4xl sm:text-5xl leading-[0.98] mt-2">{headlineOf(a)}</h3>
          <div className="h-px bg-line my-4" />
          <div className="font-serif text-[1.05rem] leading-[1.75] text-ink/90 space-y-4">
            {paras.map((p, i) => (
              <p key={i} className={clsx(i === 0 && 'first-letter:font-display first-letter:text-6xl first-letter:float-left first-letter:mr-2 first-letter:leading-[0.8] first-letter:text-accent first-letter:mt-1')}>{p}</p>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-5">
            {a.aboutUser && <Chip tone="gold" icon="star">{t('life.news.about')}</Chip>}
            {a.tags.map((x) => <Chip key={x}>{tagLabel(x)}</Chip>)}
          </div>
        </article>
      )}
    </Modal>
  );
}

// ───────── page body ─────────

export function NewsBody({ life }: { life: Life }) {
  const { state } = life;
  const [tag, setTag] = useState<string | null>(null);
  const [open, setOpen] = useState<NewsArticle | null>(null);
  const [limit, setLimit] = useState(18);
  const sorted = useMemo(() => sortNews(state.news), [state.news, state.news.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const tags = useMemo(() => tagCounts(sorted).slice(0, 12), [sorted]);
  const filtered = useMemo(() => filterNews(sorted, tag), [sorted, tag]);
  const hero = useMemo(() => heroOf(filtered), [filtered]);
  const rest = filtered.filter((a) => a.id !== hero?.id);

  if (!sorted.length) return <EmptyState icon="newspaper" title={t('life.news.title')} text={t('life.news.empty')} />;
  return (
    <div className="space-y-6">
      <Masthead outlet={hero?.outlet ?? sorted[0].outlet} season={hero?.season ?? state.season} week={hero?.week ?? state.week} />
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        <button onClick={() => setTag(null)} className={clsx('rounded-full px-3 h-8 text-xs font-semibold whitespace-nowrap cursor-pointer transition', tag === null ? 'bg-accent text-bg' : 'bg-white/6 text-ink-dim hover:bg-white/12')}>{t('life.news.filter.all')} · {sorted.length}</button>
        {tags.map(({ tag: x, count }) => (
          <button key={x} onClick={() => setTag(tag === x ? null : x)} className={clsx('rounded-full px-3 h-8 text-xs font-semibold whitespace-nowrap cursor-pointer transition flex items-center gap-1.5', tag === x ? 'bg-accent text-bg' : 'bg-white/6 text-ink-dim hover:bg-white/12')}>
            <Icon name={TAG_ICON[x] ?? 'newspaper'} size={12} />{tagLabel(x)} <span className="opacity-60">{count}</span>
          </button>
        ))}
      </div>
      {hero && <HeroStory a={hero} onOpen={setOpen} />}
      {rest.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4"><div className="h-px flex-1 bg-ink/20" /><span className="text-[11px] uppercase tracking-[0.2em] text-ink-mute font-bold">{t('life.news.more')}</span><div className="h-px flex-1 bg-ink/20" /></div>
          <div className="columns-1 md:columns-2 xl:columns-3 gap-8">
            {rest.slice(0, limit).map((a, i) => <StoryCard key={a.id} a={a} i={i} onOpen={setOpen} />)}
          </div>
          {rest.length > limit && <div className="text-center"><Button variant="secondary" onClick={() => setLimit((l) => l + 18)}>{t('life.news.loadMore')}</Button></div>}
        </section>
      )}
      <ArticleReader a={open} onClose={() => setOpen(null)} />
    </div>
  );
}
