/** Career screen parts: hero, stat grid, radar, development chart, seasons, trophies, matches. */
import { useId, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { AttrKey, CareerSeasonRecord, Footballer } from '../../../core/types';
import { t, tl } from '../../../core/i18n';
import { ATTR_GROUPS } from '../../../core/ratings';
import { age as ageOf, fullName } from '../../../core/util';

import { TRAITS, careerTotals, goalProgress, userMarketValue } from '../../../career/api';
import { positionName } from '../../../world/api';
import { Card, Crest, EmptyState, Icon, StatTile, Tabs, clsx } from '../../components/kit';
import { Chip, Flag, PlayerFace, RatingChip, SectionLabel, Sparkline, listItem, nationName, safe, type Life } from './shared';
import { avgRating, lineGeometry, money, polar, radarPath, trophyShelves, trophyStyle } from './logic';

const RADAR_KEYS: AttrKey[] = [...ATTR_GROUPS.technical, ...ATTR_GROUPS.physical, ...ATTR_GROUPS.mental];
const GROUP_COLOR = { technical: '#b8ff3c', physical: '#49c6ff', mental: '#a98bff' } as const;
const groupOf = (k: AttrKey): keyof typeof GROUP_COLOR => (ATTR_GROUPS.technical.includes(k) ? 'technical' : ATTR_GROUPS.physical.includes(k) ? 'physical' : 'mental');

function careerAvg(p: Footballer, history: CareerSeasonRecord[]): number {
  if (p.career.apps > 0 && p.career.ratingSum > 0) return avgRating(p.career.ratingSum, p.career.apps);
  const apps = history.reduce((s, h) => s + h.stats.apps, 0);
  return apps ? history.reduce((s, h) => s + h.avgRating * h.stats.apps, 0) / apps : 0;
}

// ───────── hero ─────────

export function PlayerHero({ life }: { life: Life }) {
  const { state, player, career, ovr, lang } = life;
  const club = player.clubId ? state.world.clubs[player.clubId] : null;
  const value = safe(() => userMarketValue(state), player.value);
  const sp = career.setPieces;
  return (
    <Card glow="accent" className="relative overflow-hidden">
      <div className="absolute -right-4 -top-10 font-display text-[12rem] leading-none text-accent/[0.06] select-none pointer-events-none">{ovr}</div>
      <div className="relative flex items-center gap-4 flex-wrap">
        <PlayerFace p={player} kit={club?.kit} size={84} ring="gold" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-4xl sm:text-5xl leading-none truncate">{fullName(player)}</div>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-ink-dim">
            <span className="flex items-center gap-1.5"><Flag code={player.nation} className="text-lg" />{nationName(player.nation, lang)}</span>
            <span>· {t('life.career.age', { n: ageOf(player, state.season) })}</span>
            <Chip tone="accent">{safe(() => positionName(player.position), player.position)}</Chip>
            {club && <span className="flex items-center gap-1.5"><Crest kit={club.kit} size={16} />{club.name}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {(['freeKicks', 'penalties', 'corners'] as const).map((k) => sp[k] && <Chip key={k} tone="gold" icon="target">{t(`life.career.sp.${k}`)}</Chip>)}
          </div>
        </div>
        <div className="flex items-end justify-between gap-5 w-full sm:w-auto sm:ml-auto">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-mute font-bold">{t('common.value')}</div>
            <div className="font-display text-3xl leading-none text-gold">{money(value, lang)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-mute font-bold">{t('common.overall')}</div>
            <div className="font-display text-6xl leading-[0.85] text-accent neon-text">{ovr}</div>
          </div>
        </div>
      </div>
      {(career.genesis.motto || career.genesis.theme) && (
        <div className="relative mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {career.genesis.motto && <Quote label={t('life.career.motto')} text={career.genesis.motto} />}
          {career.genesis.theme && <Quote label={t('life.career.theme')} text={career.genesis.theme} />}
        </div>
      )}
    </Card>
  );
}

function Quote({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-2xl bg-white/4 border border-line px-3.5 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.14em] text-accent font-bold">{label}</div>
      <p className="text-sm text-ink-dim italic leading-snug mt-0.5">“{text}”</p>
    </div>
  );
}

// ───────── stats ─────────

export function StatGrid({ life }: { life: Life }) {
  const { state, player, career, lang } = life;
  const totals = safe(() => careerTotals(state), null);
  const apps = totals?.apps ?? player.career.apps;
  const goals = totals?.goals ?? player.career.goals;
  const assists = totals?.assists ?? player.career.assists;
  const avg = careerAvg(player, career.history);
  const peak = totals?.peakValue ?? player.value;
  const items = [
    { k: 'apps', label: t('life.career.stat.apps'), value: apps, icon: 'footprints', tone: 'accent' as const },
    { k: 'goals', label: t('life.career.stat.goals'), value: goals, icon: 'target', tone: 'accent' as const },
    { k: 'assists', label: t('life.career.stat.assists'), value: assists, icon: 'handshake', tone: 'info' as const },
    { k: 'rating', label: t('life.career.stat.rating'), value: avg ? avg.toFixed(2) : '–', icon: 'star', tone: 'gold' as const },
    { k: 'trophies', label: t('life.career.stat.trophies'), value: career.trophies.length, icon: 'trophy', tone: 'gold' as const },
    { k: 'caps', label: t('life.career.stat.caps'), value: player.intlCaps, sub: t('life.career.stat.capsSub', { n: player.intlGoals }), icon: 'flag', tone: 'violet' as const },
    { k: 'value', label: t('life.career.stat.value'), value: money(safe(() => userMarketValue(state), player.value), lang), sub: t('life.career.stat.peakSub', { v: money(peak, lang) }), icon: 'coin', tone: 'gold' as const },
    { k: 'motm', label: t('life.career.stat.motm'), value: player.career.motm, icon: 'medal', tone: 'accent' as const },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((it, i) => (
        <motion.div key={it.k} {...listItem(i)}>
          <StatTile label={it.label} value={typeof it.value === 'number' ? it.value.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB') : it.value} sub={it.sub} icon={it.icon} tone={it.tone} />
        </motion.div>
      ))}
    </div>
  );
}

// ───────── radar ─────────

export function RadarChart({ life }: { life: Life }) {
  const { player } = life;
  const W = 400;
  const C = W / 2;
  const R = 112;
  const n = RADAR_KEYS.length;
  const values = RADAR_KEYS.map((k) => player.attrs[k]);
  const rings = [25, 50, 75, 100];
  return (
    <Card title={t('life.career.radar')} icon="target" className="h-full">
      <svg viewBox={`0 0 ${W} ${W}`} className="w-full max-w-[460px] mx-auto" role="img" aria-label={t('life.career.radar')}>
        {rings.map((r) => (
          <polygon key={r} points={RADAR_KEYS.map((_, i) => { const p = polar(i, n, (r / 100) * R, C, C); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ')} fill={r === 100 ? 'rgba(255,255,255,0.025)' : 'none'} stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
        ))}
        {RADAR_KEYS.map((_, i) => { const p = polar(i, n, R, C, C); return <line key={i} x1={C} y1={C} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.07)" />; })}
        <motion.path
          d={radarPath(values, 100, R, C, C)} fill="rgba(184,255,60,0.22)" stroke="#b8ff3c" strokeWidth="2.2" strokeLinejoin="round"
          initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} style={{ transformOrigin: `${C}px ${C}px` }} transition={{ type: 'spring', stiffness: 90, damping: 16 }}
        />
        {RADAR_KEYS.map((k, i) => {
          const dot = polar(i, n, (values[i] / 100) * R, C, C);
          const lab = polar(i, n, R + 16, C, C);
          const cos = Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / n);
          const anchor = cos > 0.25 ? 'start' : cos < -0.25 ? 'end' : 'middle';
          const g = groupOf(k);
          return (
            <g key={k}>
              <circle cx={dot.x} cy={dot.y} r="3.4" fill={GROUP_COLOR[g]} />
              <text x={lab.x} y={lab.y} textAnchor={anchor} dominantBaseline="middle" fontSize="10" fill="rgba(233,245,238,0.78)" fontFamily="Inter, sans-serif">
                {t(`common.attr.${k}`)} <tspan fill={GROUP_COLOR[g]} fontWeight="700">{values[i]}</tspan>
              </text>
            </g>
          );
        })}
        <text x={C} y={C - 4} textAnchor="middle" fontFamily="Bebas Neue, sans-serif" fontSize="40" fill="#b8ff3c">{life.ovr}</text>
        <text x={C} y={C + 12} textAnchor="middle" fontSize="9" letterSpacing="2" fill="rgba(157,181,167,0.9)">{t('common.overall').toLocaleUpperCase()}</text>
      </svg>
      <div className="flex justify-center gap-4 text-[11px] text-ink-dim">
        {(['technical', 'physical', 'mental'] as const).map((g) => (
          <span key={g} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: GROUP_COLOR[g] }} />{t(`life.training.group.${g}`)}</span>
        ))}
      </div>
    </Card>
  );
}

// ───────── development chart ─────────

export function HistoryChart({ life }: { life: Life }) {
  const { state, career, ovr, lang, player } = life;
  const [mode, setMode] = useState<'overall' | 'value'>('overall');
  const gid = useId().replace(/:/g, '');
  const pts = useMemo(() => {
    const rows = [...career.history].sort((a, b) => a.season - b.season).map((h) => ({ x: h.season, overall: h.overall, value: h.value }));
    const last = rows[rows.length - 1];
    const cur = { x: state.season, overall: ovr, value: safe(() => userMarketValue(state), player.value) };
    if (!last || last.x !== state.season) rows.push(cur); else rows[rows.length - 1] = cur;
    return rows;
  }, [career.history, state, ovr, player.value]);
  const values = pts.map((p) => p[mode]);
  const W = 420, H = 190, PL = 44, PR = 14, PT = 14, PB = 26;
  const lo = mode === 'overall' ? Math.max(20, Math.min(...values) - 4) : 0;
  const hi = mode === 'overall' ? Math.min(99, Math.max(...values) + 4) : Math.max(1, Math.max(...values) * 1.12);
  const g = lineGeometry(values, W - PL - PR, H - PT - PB, 8, lo, hi);
  const fmt = (v: number) => (mode === 'overall' ? String(Math.round(v)) : money(v, lang));
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const yOf = (v: number) => PT + 8 + (H - PT - PB - 16) - ((v - lo) / (hi - lo)) * (H - PT - PB - 16);
  return (
    <Card title={t('life.career.chart.title')} icon="chart" className="h-full"
      action={<Tabs value={mode} onChange={(v) => setMode(v as 'overall' | 'value')} tabs={[{ id: 'overall', label: t('life.career.chart.overall') }, { id: 'value', label: t('life.career.chart.value') }]} className="!p-0.5 scale-90 origin-right" />}>
      {pts.length < 2 ? (
        <>
          <p className="text-sm text-ink-dim mb-2">{t('life.career.chart.empty')}</p>
          <div className="font-display text-5xl text-accent">{fmt(values[0])}</div>
        </>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t('life.career.chart.title')}>
          <defs>
            <linearGradient id={`hc${gid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b8ff3c" stopOpacity="0.32" /><stop offset="100%" stopColor="#b8ff3c" stopOpacity="0" /></linearGradient>
          </defs>
          {ticks.map((v, i) => (
            <g key={i}>
              <line x1={PL} x2={W - PR} y1={yOf(v)} y2={yOf(v)} stroke="rgba(255,255,255,0.07)" />
              <text x={PL - 6} y={yOf(v)} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="rgba(157,181,167,0.85)">{fmt(v)}</text>
            </g>
          ))}
          <g transform={`translate(${PL},${PT})`}>
            <path d={g.area} fill={`url(#hc${gid})`} />
            <motion.path d={g.line} fill="none" stroke="#b8ff3c" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }} />
            {g.pts.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={i === g.pts.length - 1 ? 4.5 : 3} fill={i === g.pts.length - 1 ? '#fff' : '#b8ff3c'} />
                {(i === g.pts.length - 1 || pts.length <= 8) && (
                  <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#e9f5ee">{fmt(values[i])}</text>
                )}
              </g>
            ))}
          </g>
          {pts.map((p, i) => {
            const x = PL + g.pts[i].x;
            const show = pts.length <= 10 || i % Math.ceil(pts.length / 8) === 0 || i === pts.length - 1;
            return show ? <text key={p.x} x={x} y={H - 6} textAnchor="middle" fontSize="9" fill="rgba(157,181,167,0.85)">{String(p.x).slice(2)}/{String(p.x + 1).slice(2)}</text> : null;
          })}
        </svg>
      )}
    </Card>
  );
}

// ───────── traits & goals ─────────

export function TraitsCard({ life }: { life: Life }) {
  const defs = safe(() => TRAITS, []);
  const list = life.player.traits.map((id) => defs.find((d) => d.id === id)).filter((d): d is NonNullable<typeof d> => !!d);
  return (
    <Card title={t('life.career.traits')} icon="sparkles" className="h-full">
      {list.length === 0 ? <p className="text-sm text-ink-dim">{t('life.career.traitsEmpty')}</p> : (
        <div className="space-y-2.5">
          {list.map((d, i) => (
            <motion.div key={d.id} {...listItem(i)} className="flex gap-3 rounded-2xl bg-white/4 border border-line p-3">
              <span className={clsx('w-10 h-10 rounded-xl grid place-items-center shrink-0', d.positive ? 'bg-accent/14 text-accent' : 'bg-danger/14 text-danger')}><Icon name={d.icon} size={20} /></span>
              <div className="min-w-0">
                <div className="font-semibold text-sm">{tl(d.name)}</div>
                <p className="text-xs text-ink-dim leading-snug mt-0.5">{tl(d.desc)}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function GoalsCard({ life }: { life: Life }) {
  const { state, career } = life;
  const goals = career.genesis.goals;
  return (
    <Card title={t('life.career.goals')} icon="target" className="h-full">
      {goals.length === 0 ? <p className="text-sm text-ink-dim">{t('life.career.goalsEmpty')}</p> : (
        <div className="space-y-2.5">
          {goals.map((g, i) => {
            const prog = g.done ? null : safe(() => goalProgress(state, g), null);
            const pct = prog ? Math.min(100, (prog.current / prog.target) * 100) : 0;
            return (
              <motion.div key={g.id} {...listItem(i)} className={clsx('flex gap-3 rounded-2xl border p-3', g.done ? 'bg-accent/8 border-accent/30' : 'bg-white/4 border-line')}>
                <span className={clsx('w-7 h-7 rounded-full grid place-items-center shrink-0 mt-0.5', g.done ? 'bg-accent text-bg' : 'border-2 border-ink-mute')}>{g.done && <Icon name="verified" size={16} />}</span>
                <div className="min-w-0 flex-1">
                  <div className={clsx('text-sm font-medium leading-snug', g.done && 'text-accent')}>{g.text}</div>
                  {g.done && g.doneSeason && <div className="text-[11px] text-ink-mute mt-0.5">{t('life.career.goalDone', { a: g.doneSeason, b: String(g.doneSeason + 1).slice(2) })}</div>}
                  {prog && (
                    <div className="mt-2">
                      <div className="h-1.5 rounded-full bg-white/8 overflow-hidden"><motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${pct}%` }} /></div>
                      <div className="text-[10px] text-ink-mute mt-1 tabular-nums">{Math.round(prog.current).toLocaleString()} / {Math.round(prog.target).toLocaleString()}</div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ───────── seasons ─────────

export function SeasonTable({ life }: { life: Life }) {
  const { state, player, career, lang, ovr } = life;
  const rows = useMemo(() => {
    const done = [...career.history].sort((a, b) => a.season - b.season).map((h) => ({ ...h, live: false }));
    const club = player.clubId ? state.world.clubs[player.clubId] : null;
    if (club && player.season.apps > 0 && !done.some((h) => h.season === state.season)) {
      done.push({
        season: state.season, clubId: club.id, clubName: club.name, league: state.world.leagues.find((l) => l.country === club.country && l.tier === club.tier)?.name ?? '',
        leaguePos: null, stats: player.season, avgRating: avgRating(player.season.ratingSum, player.season.apps), overall: ovr, value: player.value,
        trophies: career.trophies.filter((x) => x.season === state.season).map((x) => x.name), live: true,
      });
    }
    return done.reverse();
  }, [career.history, career.trophies, player, state, ovr]);
  if (!rows.length) return <EmptyState icon="calendar" title={t('life.career.table.empty')} />;
  const th = 'px-2.5 py-2 text-[10px] uppercase tracking-wider text-ink-mute font-bold text-right whitespace-nowrap';
  return (
    <Card padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px] tabular-nums">
          <thead>
            <tr className="border-b border-line">
              <th className={clsx(th, 'text-left pl-4')}>{t('life.career.table.season')}</th><th className={clsx(th, 'text-left')}>{t('life.career.table.club')}</th>
              <th className={th}>{t('life.career.table.pos')}</th><th className={th}>{t('life.career.table.apps')}</th><th className={th}>{t('life.career.table.goals')}</th>
              <th className={th}>{t('life.career.table.assists')}</th><th className={th}>{t('life.career.table.avg')}</th><th className={th}>{t('life.career.table.ovr')}</th>
              <th className={th}>{t('life.career.table.value')}</th><th className={clsx(th, 'pr-4')}>{t('life.career.table.trophies')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <motion.tr key={r.season} {...listItem(i)} className={clsx('border-b border-line/50 last:border-0', r.live && 'bg-accent/8')}>
                <td className="pl-4 py-2.5 font-semibold whitespace-nowrap">{r.season}/{String(r.season + 1).slice(2)}{r.live && <span className="ml-2 text-[10px] text-accent uppercase">{t('life.career.table.current')}</span>}</td>
                <td className="px-2.5 py-2.5 text-ink-dim"><span className="inline-flex items-center gap-2"><Crest kit={state.world.clubs[r.clubId]?.kit ?? { primary: '#2a4436', secondary: '#9db5a7', style: 'plain' }} size={16} />{r.clubName}</span><div className="text-[10px] text-ink-mute">{r.league}</div></td>
                <td className="px-2.5 text-right text-ink-dim">{r.leaguePos ?? '–'}</td>
                <td className="px-2.5 text-right">{r.stats.apps}</td>
                <td className="px-2.5 text-right text-accent font-semibold">{r.stats.goals}</td>
                <td className="px-2.5 text-right text-info">{r.stats.assists}</td>
                <td className="px-2.5 text-right">{r.avgRating ? <RatingChip r={r.avgRating} size="sm" /> : '–'}</td>
                <td className="px-2.5 text-right font-display text-xl">{r.overall}</td>
                <td className="px-2.5 text-right text-gold">{money(r.value, lang)}</td>
                <td className="px-2.5 pr-4 text-right">{r.trophies.length ? <span className="inline-flex items-center gap-1 text-gold font-semibold"><Icon name="trophy" size={13} />{r.trophies.length}</span> : <span className="text-ink-mute">–</span>}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ───────── trophies & awards ─────────

export const TROPHY_TONE = {
  gold: 'from-[#ffe08a] via-[#ffcb47] to-[#b8860b] text-[#5a3d00]', info: 'from-[#bfeaff] via-[#49c6ff] to-[#1b7fa8] text-[#06324a]',
  violet: 'from-[#d9ccff] via-[#a98bff] to-[#5b3fc2] text-[#241257]', accent: 'from-[#e6ffb0] via-[#b8ff3c] to-[#6aa800] text-[#243300]',
} as const;

export function TrophyCabinet({ life }: { life: Life }) {
  const shelves = trophyShelves(life.career.trophies);
  if (!shelves.length) {
    return <Card title={t('life.career.cabinet')} icon="trophy"><EmptyState icon="trophy" title={t('life.career.cabinetEmpty')} /></Card>;
  }
  const rows: (typeof shelves)[] = [];
  for (let i = 0; i < shelves.length; i += 3) rows.push(shelves.slice(i, i + 3));
  let n = 0;
  return (
    <Card title={t('life.career.cabinet')} icon="trophy" glow="gold" action={<span className="text-xs text-gold font-bold">{life.career.trophies.length}</span>}>
      <div className="rounded-2xl bg-gradient-to-b from-[#0b1711] to-[#101c16] border border-line p-3 space-y-5">
        {rows.map((row, ri) => (
          <div key={ri}>
            <div className="grid grid-cols-3 gap-2 items-end px-1">
              {row.map((s) => {
                const st = trophyStyle(s.key);
                const idx = n++;
                return (
                  <motion.div key={s.key} initial={{ opacity: 0, y: 24, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: idx * 0.08, type: 'spring', stiffness: 220, damping: 16 }} className="flex flex-col items-center text-center min-w-0">
                    <div className="relative">
                      <span className={clsx('w-16 h-16 sm:w-20 sm:h-20 rounded-[1.4rem] grid place-items-center bg-gradient-to-br shadow-[0_0_34px_-6px_rgba(255,203,71,0.55)]', TROPHY_TONE[st.tone])}>
                        <Icon name={st.icon} size={34} />
                      </span>
                      {s.seasons.length > 1 && <span className="absolute -top-1.5 -right-2 min-w-6 h-6 px-1.5 rounded-full bg-bg border border-gold text-gold text-xs font-bold grid place-items-center">×{s.seasons.length}</span>}
                    </div>
                    <div className="text-xs font-semibold mt-2 leading-tight line-clamp-2">{s.name}</div>
                    <div className="text-[10px] text-ink-mute mt-0.5 leading-tight">{s.seasons.slice(-4).map((y) => `${String(y).slice(2)}/${String(y + 1).slice(2)}`).join(' · ')}{s.seasons.length > 4 ? ' …' : ''}</div>
                  </motion.div>
                );
              })}
            </div>
            <div className="h-3 mt-2 rounded-md bg-gradient-to-b from-[#7a5628] to-[#3a2812] shadow-[0_10px_18px_-8px_rgba(0,0,0,0.8)]" />
          </div>
        ))}
      </div>
    </Card>
  );
}

const AWARD_ICON: Record<string, string> = { golden_ball: 'crown', league_top_scorer: 'target', young_player: 'sparkles', league_mvp: 'star', team_of_season: 'users' };

export function AwardsList({ life }: { life: Life }) {
  const awards = [...life.career.awards].sort((a, b) => b.season - a.season);
  return (
    <Card title={t('life.career.awards')} icon="medal">
      {awards.length === 0 ? <p className="text-sm text-ink-dim">{t('life.career.awardsEmpty')}</p> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {awards.map((a, i) => (
            <motion.div key={`${a.key}${a.season}${i}`} {...listItem(i)} className="flex items-center gap-3 rounded-2xl bg-white/4 border border-line p-3">
              <span className="w-10 h-10 rounded-xl bg-gold/14 text-gold grid place-items-center shrink-0"><Icon name={AWARD_ICON[a.key] ?? 'medal'} size={20} /></span>
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{a.name || t(`life.career.award.${a.key}`)}</div>
                <div className="text-[11px] text-ink-mute truncate">{a.season}/{String(a.season + 1).slice(2)}{a.detail ? ` · ${a.detail}` : ''}</div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ───────── match log ─────────

export function MatchLog({ life }: { life: Life }) {
  const matches = life.career.matches;
  const recent = [...matches].slice(-15).reverse();
  if (!recent.length) return <EmptyState icon="footprints" title={t('life.career.matchEmpty')} />;
  const last10 = matches.slice(-10).map((m) => m.rating);
  const avg = last10.reduce((s, v) => s + v, 0) / (last10.length || 1);
  return (
    <div className="space-y-4">
      <Card title={t('life.career.form10')} icon="chart" action={<span className="font-display text-3xl text-gold">{avg.toFixed(2)}</span>}>
        <Sparkline values={last10} min={4} max={10} height={70} width={320} color="#ffcb47" dots label={t('life.career.form10')} />
      </Card>
      <SectionLabel icon="footprints">{t('life.career.matchLog')}</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {recent.map((m, i) => {
          const res = m.goalsFor > m.goalsAgainst ? 'W' : m.goalsFor < m.goalsAgainst ? 'L' : 'D';
          return (
            <motion.div key={`${m.fixtureId}${i}`} {...listItem(i)} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] border border-line px-3 py-2.5">
              <span className={clsx('w-8 h-8 rounded-lg grid place-items-center text-xs font-black shrink-0', res === 'W' ? 'bg-accent text-bg' : res === 'D' ? 'bg-white/20' : 'bg-danger text-white')}>{res === 'W' ? 'G' : res === 'D' ? 'B' : 'M'}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{m.home ? '' : '@ '}{m.opponent} <span className="font-display text-lg tabular-nums ml-1">{m.goalsFor}–{m.goalsAgainst}</span></div>
                <div className="text-[11px] text-ink-mute truncate flex items-center gap-2">
                  <span>{m.compName} · {t('common.week')} {m.week + 1}</span>
                  <span>{m.home ? t('life.career.matchHome') : t('life.career.matchAway')}</span>
                  <span>{t('life.career.min', { n: m.minutes })}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {m.goals > 0 && <Chip tone="accent" icon="target">{m.goals}</Chip>}
                {m.assists > 0 && <Chip tone="info" icon="handshake">{m.assists}</Chip>}
                {m.motm && <span title={t('life.career.motm')} className="text-gold"><Icon name="star" size={16} /></span>}
                <RatingChip r={m.rating} />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
