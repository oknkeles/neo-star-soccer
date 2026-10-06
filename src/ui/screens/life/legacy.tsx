/** Legacy screen parts: cinematic hero, retirement, career card, biography, timeline and records. */
import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { t } from '../../../core/i18n';
import { age as ageOf, fullName } from '../../../core/util';

import { careerTotals, hallOfFameScore, retirementReason, retirementStatus } from '../../../career/api';
import { game } from '../../../game/api';
import { Badge, Button, Card, CountUp, Crest, Icon, Modal, StatTile, clsx, toast } from '../../components/kit';
import { navigate } from '../../router';
import { Chip, PlayerFace, SectionLabel, Sparkline, listItem, safe, type Life } from './shared';
import { careerRecords, careerSpan, clubStints, HALL_TIERS, hallProgress, hallTier, legacySummaryText, money, type LegacyFacts } from './logic';

const FALLBACK_KIT = { primary: '#2a4436', secondary: '#9db5a7', style: 'plain' as const };

/** Score shown on the page: the frozen value after retirement, the live projection before. */
export function legacyScore(life: Life): number {
  const { state, career } = life;
  if (career.retired && career.hallOfFame > 0) return Math.round(career.hallOfFame);
  return safe(() => hallOfFameScore(state), Math.round(career.hallOfFame));
}

export function legacyFacts(life: Life): LegacyFacts {
  const { state, player, lang } = life;
  const score = legacyScore(life);
  const totals = safe(() => careerTotals(state), null);
  const stints = clubStints(state);
  return {
    name: fullName(player), tier: t(`life.legacy.tier.${hallTier(score).id}`), score, span: careerSpan(state),
    clubs: stints.map((s) => s.clubName),
    apps: totals?.apps ?? player.career.apps, goals: totals?.goals ?? player.career.goals, assists: totals?.assists ?? player.career.assists,
    trophies: state.career.trophies.length, caps: totals?.caps ?? player.intlCaps,
    peakOvr: totals?.peakOverall ?? 0, peakValue: money(totals?.peakValue ?? player.value, lang),
  };
}

// ───────── hero ─────────

function Sparks() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {Array.from({ length: 14 }, (_, i) => (
        <motion.span
          key={i} className="absolute bottom-0 w-1 h-1 rounded-full bg-gold"
          style={{ left: `${(i * 37 + 7) % 100}%` }}
          initial={{ y: 0, opacity: 0 }} animate={{ y: -220 - (i % 4) * 40, opacity: [0, 0.9, 0] }}
          transition={{ duration: 5 + (i % 5), delay: i * 0.55, repeat: Infinity, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

export function LegacyHero({ life }: { life: Life }) {
  const { state, player, career, lang } = life;
  const reduce = useReducedMotion();
  const score = legacyScore(life);
  const tier = hallTier(score);
  const idx = HALL_TIERS.findIndex((x) => x.id === tier.id);
  const next = idx > 0 ? HALL_TIERS[idx - 1] : null;
  const club = player.clubId ? state.world.clubs[player.clubId] : state.world.clubs[clubStints(state).at(-1)?.clubId ?? ''];
  const age = ageOf(player, state.season);
  return (
    <Card padded={false} glow="gold" className="relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(90%_120%_at_50%_0%,rgba(255,203,71,0.22),transparent_62%)] pointer-events-none" />
      <motion.div
        className="absolute -inset-[70%] opacity-[0.13] pointer-events-none"
        style={{ background: 'conic-gradient(from 0deg, transparent 0 8%, #ffcb47 10%, transparent 12% 25%, #ffcb47 27%, transparent 29% 50%, #ffcb47 52%, transparent 54% 75%, #ffcb47 77%, transparent 79%)' }}
        animate={reduce ? undefined : { rotate: 360 }} transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}
      />
      <Sparks />
      <div className="relative px-4 py-7 sm:py-9 flex flex-col items-center text-center">
        <Badge tone={career.retired ? 'gold' : 'accent'}>{career.retired ? t('life.legacy.badge.done') : t('life.legacy.badge.live')}</Badge>
        <motion.div className="mt-4" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 16 }}>
          <PlayerFace p={player} kit={club?.kit} size={116} ring="gold" />
        </motion.div>
        <h2 className="font-display text-5xl sm:text-6xl leading-none mt-4 tracking-wide">{fullName(player)}</h2>
        <div className="text-sm text-ink-dim mt-1.5">{careerSpan(state)} · {t('life.career.age', { n: age })}</div>

        <motion.div
          initial={{ opacity: 0, y: 14, letterSpacing: '0.4em' }} animate={{ opacity: 1, y: 0, letterSpacing: '0.12em' }} transition={{ delay: 0.35, duration: 0.9 }}
          className="font-display text-4xl sm:text-6xl mt-5 uppercase bg-gradient-to-b from-[#fff3c4] via-[#ffcb47] to-[#b8860b] bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(255,203,71,0.35)]"
        >
          {t(`life.legacy.tier.${tier.id}`)}
        </motion.div>
        <p className="text-sm text-ink-dim max-w-md mt-1.5">{t(`life.legacy.line.${tier.id}`)}</p>

        <div className="mt-5 flex items-end gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-mute font-bold pb-2">{t('life.legacy.score')}</span>
          <span className="font-display text-7xl leading-[0.85] text-gold neon-text"><CountUp value={score} /></span>
        </div>
        <div className="w-full max-w-md mt-4">
          <div className="h-2 rounded-full bg-white/8 overflow-hidden">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-[#b8860b] via-gold to-[#fff3c4]" initial={{ width: 0 }} animate={{ width: `${Math.round((next ? hallProgress(score) : 1) * 100)}%` }} transition={{ duration: 1.2, delay: 0.4, ease: 'easeOut' }} />
          </div>
          <div className="text-xs text-ink-dim mt-1.5">
            {next
              ? t('life.legacy.nextTier', { tier: t(`life.legacy.tier.${next.id}`), n: Math.max(0, next.min - score) })
              : t('life.legacy.topTier')}
          </div>
        </div>

        {career.genesis.motto && (
          <div className="mt-6 text-sm italic text-ink-dim max-w-md">
            <span className="text-[10px] uppercase tracking-[0.16em] text-gold not-italic font-bold block mb-0.5">{t('life.legacy.motto')}</span>
            “{career.genesis.motto}”
          </div>
        )}
        <span className="sr-only">{lang}</span>
      </div>
    </Card>
  );
}

// ───────── retirement ─────────

export function RetirePanel({ life }: { life: Life }) {
  const { state, career } = life;
  const [confirm, setConfirm] = useState(false);
  if (career.retired) return null;
  const status = safe(() => retirementStatus(state), { canRetire: false, forced: false });
  const reason = safe(() => retirementReason(state), '');
  const go = () => {
    setConfirm(false);
    game.retire().catch(() => toast(t('life.legacy.retire.failed'), 'danger', 'siren'));
  };
  return (
    <>
      <Card glow={status.forced ? 'danger' : undefined} className="flex flex-col sm:flex-row sm:items-center gap-4">
        <span className="w-12 h-12 rounded-2xl bg-gold/12 text-gold grid place-items-center shrink-0"><Icon name="footprints" size={24} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-2xl leading-none">{t('life.legacy.retire.title')}</div>
          <p className="text-sm text-ink-dim mt-1.5 leading-snug">
            {status.canRetire ? t('life.legacy.retire.canText') : t('life.legacy.retire.cannotText')}
          </p>
          {reason && status.canRetire && <p className="text-xs text-gold mt-1">{status.forced ? t('life.legacy.retire.forced') : reason}</p>}
        </div>
        <Button variant={status.forced ? 'danger' : 'primary'} icon="flag" disabled={!status.canRetire} onClick={() => setConfirm(true)}>{t('life.legacy.retire.btn')}</Button>
      </Card>
      <Modal
        open={confirm} onClose={() => setConfirm(false)} size="sm" title={t('life.legacy.retire.confirmTitle')}
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>{t('life.legacy.retire.cancel')}</Button><Button variant="danger" icon="check" onClick={go}>{t('life.legacy.retire.confirm')}</Button></>}
      >
        <p className="text-sm text-ink-dim leading-relaxed">{t('life.legacy.retire.confirmText')}</p>
      </Modal>
    </>
  );
}

// ───────── share card ─────────

export function CareerCard({ life }: { life: Life }) {
  const { state, player, lang } = life;
  const f = legacyFacts(life);
  const stints = clubStints(state);
  const labels = {
    score: t('life.legacy.score'), apps: t('life.career.stat.apps'), goals: t('life.career.stat.goals'), assists: t('life.career.stat.assists'),
    trophies: t('life.career.stat.trophies'), caps: t('life.career.stat.caps'), peak: t('life.legacy.card.peak'), value: t('life.legacy.card.peakValue'),
  };
  const text = legacySummaryText(f, labels);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast(t('life.legacy.card.copied'), 'accent', 'check');
    } catch {
      toast(t('life.legacy.card.copyFailed'), 'danger', 'siren');
    }
  };
  const share = () => { navigator.share({ title: f.name, text }).catch(() => undefined); };
  const cells: { label: string; value: string | number; tone: string }[] = [
    { label: labels.apps, value: f.apps, tone: 'text-ink' }, { label: labels.goals, value: f.goals, tone: 'text-accent' },
    { label: labels.assists, value: f.assists, tone: 'text-info' }, { label: labels.trophies, value: f.trophies, tone: 'text-gold' },
    { label: labels.caps, value: f.caps, tone: 'text-violet' }, { label: labels.peak, value: f.peakOvr, tone: 'text-accent' },
  ];
  return (
    <div>
      <SectionLabel icon="award">{t('life.legacy.card.title')}</SectionLabel>
      <div className="rounded-[1.6rem] p-[2px] bg-gradient-to-br from-[#ffe08a] via-[#b8ff3c]/70 to-[#49c6ff]/70 shadow-[0_0_50px_-14px_rgba(255,203,71,0.55)]">
        <div className="rounded-[1.5rem] bg-gradient-to-br from-[#0d1a13] via-[#101f17] to-[#0a1410] p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <PlayerFace p={player} kit={state.world.clubs[player.clubId ?? stints.at(-1)?.clubId ?? '']?.kit} size={72} ring="gold" />
            <div className="min-w-0 flex-1">
              <div className="font-display text-3xl leading-none truncate">{f.name}</div>
              <div className="text-xs text-ink-dim mt-1">{f.span}</div>
              <div className="font-display text-xl text-gold mt-1 leading-none uppercase tracking-wider">{f.tier}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[9px] uppercase tracking-[0.16em] text-ink-mute font-bold">{labels.score}</div>
              <div className="font-display text-4xl leading-none text-gold">{f.score}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {cells.map((c) => (
              <div key={c.label} className="rounded-xl bg-white/4 border border-line px-3 py-2 text-center">
                <div className={clsx('font-display text-3xl leading-none', c.tone)}>{c.value}</div>
                <div className="text-[10px] uppercase tracking-wider text-ink-mute mt-1 truncate">{c.label}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 mt-4">
            <div className="flex items-center -space-x-2 min-w-0 overflow-hidden">
              {stints.slice(0, 8).map((s) => <Crest key={s.from + s.clubId} kit={state.world.clubs[s.clubId]?.kit ?? FALLBACK_KIT} size={26} />)}
            </div>
            <div className="text-[11px] text-ink-mute whitespace-nowrap">{labels.value}: <span className="text-gold font-semibold">{f.peakValue}</span></div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button size="sm" variant="secondary" icon="save" onClick={copy}>{t('life.legacy.card.copy')}</Button>
        {canShare && <Button size="sm" variant="ghost" icon="upload" onClick={share}>{t('life.legacy.card.share')}</Button>}
        <span className="sr-only">{lang}</span>
      </div>
    </div>
  );
}

// ───────── biography ─────────

const LINES = [0.95, 0.82, 0.9, 0.6, 0.88, 0.7];

export function BiographyCard({ life }: { life: Life }) {
  const { career } = life;
  const bio = career.biography?.trim();
  const paras = bio ? bio.split(/\n{1,}/).map((s) => s.trim()).filter(Boolean) : [];
  return (
    <Card title={t('life.legacy.bio.title')} icon="book_open">
      {paras.length > 0 ? (
        <div className="space-y-3.5 text-[15px] leading-relaxed text-ink/90 max-w-3xl">
          {paras.map((p, i) => (
            <motion.p
              key={i} initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: i * 0.25, duration: 0.7 }}
              className={clsx(i === 0 && 'first-letter:font-display first-letter:text-6xl first-letter:text-gold first-letter:float-left first-letter:leading-[0.8] first-letter:mr-2 first-letter:mt-1')}
            >
              {p}
            </motion.p>
          ))}
        </div>
      ) : career.retired ? (
        <div className="py-2" role="status">
          <div className="flex items-center gap-3">
            <motion.span animate={{ rotate: [-14, 10, -14], x: [0, 6, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} className="w-11 h-11 rounded-2xl bg-gold/12 text-gold grid place-items-center">
              <Icon name="pen" size={22} />
            </motion.span>
            <div>
              <div className="font-semibold">{t('life.legacy.bio.writing')}</div>
              <div className="text-xs text-ink-dim">{t('life.legacy.bio.writingSub')}</div>
            </div>
          </div>
          <div className="mt-4 space-y-2.5">
            {LINES.map((w, i) => (
              <motion.div
                key={i} className="h-2.5 rounded-full bg-white/10" style={{ width: `${w * 100}%` }}
                animate={{ opacity: [0.25, 0.75, 0.25] }} transition={{ duration: 1.8, delay: i * 0.18, repeat: Infinity }}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-dim">{t('life.legacy.bio.waiting')}</p>
      )}
    </Card>
  );
}

// ───────── timeline ─────────

export function Timeline({ life }: { life: Life }) {
  const { state, career, player } = life;
  const stints = clubStints(state);
  const current = player.clubId ? state.world.clubs[player.clubId] : null;
  const series = [...career.history].sort((a, b) => a.season - b.season).map((h) => h.overall);
  return (
    <div>
      <SectionLabel icon="calendar">{t('life.legacy.timeline')}</SectionLabel>
      {series.length > 1 && (
        <Card className="mb-3">
          <div className="flex items-center justify-between text-xs text-ink-dim mb-1"><span>{t('life.career.chart.overall')}</span><span className="font-display text-xl text-accent">{series[series.length - 1]}</span></div>
          <Sparkline values={series} height={70} label={t('life.career.chart.overall')} />
        </Card>
      )}
      {stints.length === 0 ? (
        <Card><p className="text-sm text-ink-dim">{t('life.legacy.timeline.empty')}</p></Card>
      ) : (
        <ol className="relative ml-4 sm:ml-5 border-l-2 border-line space-y-4 pb-1">
          {stints.map((s, i) => {
            const kit = state.world.clubs[s.clubId]?.kit ?? FALLBACK_KIT;
            const years = s.from === s.to ? `${s.from}/${String(s.from + 1).slice(2)}` : `${s.from}/${String(s.from + 1).slice(2)} – ${s.to}/${String(s.to + 1).slice(2)}`;
            return (
              <motion.li key={`${s.clubId}-${s.from}`} {...listItem(i)} className="relative pl-6 sm:pl-7">
                <span className="absolute -left-[9px] top-5 w-4 h-4 rounded-full border-2 border-bg" style={{ background: kit.primary, boxShadow: `0 0 0 3px ${kit.secondary}55` }} />
                <Card className="!p-3.5">
                  <div className="flex items-center gap-3">
                    <Crest kit={kit} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-2xl leading-none truncate">{s.clubName}</div>
                      <div className="text-xs text-ink-dim mt-1">{years}</div>
                    </div>
                    {s.trophies.length > 0 && <Chip tone="gold" icon="trophy">{t('life.legacy.stint.trophies', { n: s.trophies.length })}</Chip>}
                  </div>
                  <div className="text-xs text-ink-dim mt-2.5">{t('life.legacy.stint.line', { apps: s.apps, goals: s.goals, assists: s.assists })}</div>
                  {s.trophies.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">{s.trophies.slice(0, 6).map((n, k) => <Chip key={k} tone="gold">{n}</Chip>)}</div>
                  )}
                </Card>
              </motion.li>
            );
          })}
          {!career.retired && current && (
            <li className="relative pl-6 sm:pl-7">
              <span className="absolute -left-[9px] top-3 w-4 h-4 rounded-full bg-accent border-2 border-bg animate-pulse" />
              <div className="text-sm text-accent font-semibold">{t('life.legacy.timeline.now')} · {current.name}</div>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

// ───────── records & rival ─────────

export function RecordsGrid({ life }: { life: Life }) {
  const { state, lang } = life;
  const r = careerRecords(state);
  const season = (y: number) => t('life.legacy.rec.in', { a: y, b: String(y + 1).slice(2) });
  const tiles: { label: string; value: string; sub: string; icon: string; tone: 'accent' | 'gold' | 'info' | 'violet' }[] = [
    { label: t('life.legacy.rec.bestSeasonGoals'), value: r.bestSeasonGoals ? String(r.bestSeasonGoals.goals) : '–', sub: r.bestSeasonGoals ? season(r.bestSeasonGoals.season) : t('life.legacy.rec.none'), icon: 'target', tone: 'accent' },
    { label: t('life.legacy.rec.bestRating'), value: r.bestRating ? r.bestRating.rating.toFixed(2) : '–', sub: r.bestRating ? season(r.bestRating.season) : t('life.legacy.rec.none'), icon: 'star', tone: 'gold' },
    { label: t('life.legacy.rec.peakOverall'), value: r.peakOverall ? String(r.peakOverall.overall) : '–', sub: r.peakOverall ? season(r.peakOverall.season) : t('life.legacy.rec.none'), icon: 'trend_up', tone: 'info' },
    { label: t('life.legacy.rec.peakValue'), value: r.peakValue ? money(r.peakValue.value, lang) : '–', sub: r.peakValue ? season(r.peakValue.season) : t('life.legacy.rec.none'), icon: 'coin', tone: 'gold' },
    { label: t('life.legacy.rec.mostApps'), value: r.mostApps ? String(r.mostApps.apps) : '–', sub: r.mostApps ? season(r.mostApps.season) : t('life.legacy.rec.none'), icon: 'footprints', tone: 'violet' },
  ];
  return (
    <div>
      <SectionLabel icon="medal">{t('life.legacy.records')}</SectionLabel>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {tiles.map((x) => <StatTile key={x.label} label={x.label} value={x.value} sub={x.sub} icon={x.icon} tone={x.tone} />)}
      </div>
    </div>
  );
}

export function RivalDuel({ life }: { life: Life }) {
  const { state, player } = life;
  const rival = state.world.players[state.career.rivalId];
  if (!rival) return null;
  const totals = safe(() => careerTotals(state), null);
  const mine = { goals: totals?.goals ?? player.career.goals, apps: totals?.apps ?? player.career.apps };
  const theirs = { goals: rival.career.goals, apps: rival.career.apps };
  const verdict = mine.goals > theirs.goals ? 'Won' : mine.goals < theirs.goals ? 'Lost' : 'Even';
  const bar = (a: number, b: number) => (a + b > 0 ? Math.round((a / (a + b)) * 100) : 50);
  const rows = [
    { label: t('life.legacy.rivalGoals'), a: mine.goals, b: theirs.goals },
    { label: t('life.legacy.rivalApps'), a: mine.apps, b: theirs.apps },
  ];
  return (
    <Card title={t('life.legacy.rival')} icon="swords">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0 text-left"><div className="text-xs text-accent font-bold uppercase tracking-wider">{t('life.club.you')}</div><div className="font-semibold truncate">{fullName(player)}</div></div>
        <div className="font-display text-xl text-ink-mute">{t('common.vs')}</div>
        <div className="min-w-0 text-right"><div className="text-xs text-danger font-bold uppercase tracking-wider">{t('life.people.role.rival')}</div><div className="font-semibold truncate">{fullName(rival)}</div></div>
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between text-sm font-display"><span className="text-accent text-2xl leading-none">{r.a}</span><span className="text-[10px] font-sans uppercase tracking-wider text-ink-mute">{r.label}</span><span className="text-danger text-2xl leading-none">{r.b}</span></div>
            <div className="h-2 rounded-full bg-danger/40 overflow-hidden mt-1"><motion.div className="h-full bg-accent rounded-full" initial={{ width: 0 }} animate={{ width: `${bar(r.a, r.b)}%` }} transition={{ duration: 0.9, ease: 'easeOut' }} /></div>
          </div>
        ))}
      </div>
      <p className="text-sm text-ink-dim mt-3 italic">{t(`life.legacy.rival${verdict}`)}</p>
    </Card>
  );
}

// ───────── footer ─────────

export function LegacyActions({ life }: { life: Life }) {
  const retired = life.career.retired;
  return (
    <Card className="text-center">
      {retired && <p className="text-sm text-ink-dim mb-3">{t('life.legacy.newCareerHint')}</p>}
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {retired && <Button variant="primary" size="lg" icon="rocket" onClick={() => navigate('new-career')}>{t('life.legacy.newCareer')}</Button>}
        <Button variant={retired ? 'ghost' : 'secondary'} size={retired ? 'md' : 'lg'} icon="home" onClick={() => navigate(retired ? 'title' : 'hub')}>{retired ? t('life.noCareer.cta') : t('life.legacy.backHub')}</Button>
      </div>
    </Card>
  );
}
