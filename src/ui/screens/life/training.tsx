/** Training screen parts: focus picker, attribute panel, progression strip, drills. */
import { motion } from 'framer-motion';
import type { AttrKey, MomentType, TrainingFocus } from '../../../core/types';
import { t, tl } from '../../../core/i18n';
import { ATTR_GROUPS } from '../../../core/ratings';
import { TRAINING_FOCUSES, SHOP_ITEMS } from '../../../career/api';
import { game } from '../../../game/api';
import { navigate } from '../../router';
import { Button, Card, Icon, Meter, clsx, toast } from '../../components/kit';
import { Chip, SectionLabel, listItem, safe, type Life } from './shared';
import { drillDone, signed } from './logic';

/** Relative weekly energy load of each programme (mirrors the career module's tuning). */
const INTENSITY: Record<TrainingFocus, 1 | 2 | 3 | 4> = {
  mental: 1, passing: 1, setpieces: 1, balanced: 2, shooting: 2, dribbling: 3, defending: 3, physical: 4,
};

const attrName = (k: AttrKey) => t(`common.attr.${k}`);

export function attrTone(v: number): string {
  return v >= 80 ? 'text-gold' : v >= 65 ? 'text-accent' : v >= 50 ? 'text-ink' : 'text-ink-dim';
}
function attrBar(v: number): string {
  return v >= 80 ? 'bg-gold' : v >= 65 ? 'bg-accent' : v >= 50 ? 'bg-info' : 'bg-ink-mute';
}

export function Bar({ pct, className, h = 'h-1.5' }: { pct: number; className: string; h?: string }) {
  return (
    <div className={clsx('w-full rounded-full bg-white/6 overflow-hidden', h)}>
      <motion.div className={clsx('h-full rounded-full', className)} initial={false} animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }} transition={{ type: 'spring', stiffness: 110, damping: 20 }} />
    </div>
  );
}

// ───────── hero ─────────

export function TrainingHero({ life }: { life: Life }) {
  const { state, player, career, ovr } = life;
  const club = player.clubId ? state.world.clubs[player.clubId] : null;
  const boost = career.inventory.reduce((s, o) => s + (SHOP_ITEMS.find((i) => i.id === o.itemId)?.perks.trainingBoost ?? 0), 0);
  return (
    <Card glow="accent" className="relative overflow-hidden">
      <div className="absolute -right-6 -top-10 font-display text-[11rem] leading-none text-accent/[0.06] select-none pointer-events-none">{ovr}</div>
      <div className="relative grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 items-center">
        <div className="flex items-end gap-3">
          <div className="font-display text-7xl leading-[0.85] text-accent neon-text">{ovr}</div>
          <div className="pb-1">
            <div className="text-[11px] uppercase tracking-[0.14em] text-ink-mute font-bold">{t('life.training.overallLabel')}</div>
            <div className="text-xs text-ink-dim">{t('common.potential')}: ???</div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Meter value={career.energy} label={t('life.training.energyNow')} icon="zap" />
          <Meter value={club?.facilities ?? 0} label={t('life.training.facilities')} icon="dumbbell" tone="info" />
          <div className="flex items-center gap-2 sm:justify-end">
            <Chip icon="watch" tone={boost > 0 ? 'gold' : 'neutral'}>{t('life.training.boost')} {boost > 0 ? `+${Math.round(boost * 100)}%` : '–'}</Chip>
          </div>
        </div>
      </div>
      {career.genesis.destinyHint && (
        <div className="relative mt-4 flex gap-3 rounded-2xl bg-white/4 border border-line p-3">
          <Icon name="eye" size={18} className="text-violet shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.14em] text-violet font-bold">{t('life.training.destiny')}</div>
            <p className="text-sm text-ink-dim italic leading-snug">“{career.genesis.destinyHint}”</p>
          </div>
        </div>
      )}
    </Card>
  );
}

// ───────── focus picker ─────────

export function FocusPicker({ life }: { life: Life }) {
  const { career } = life;
  const focuses = safe(() => TRAINING_FOCUSES, []);
  if (!focuses.length) return null;
  const pick = (id: TrainingFocus, name: string) => {
    if (career.retired || id === career.trainingFocus) return;
    safe(() => game.setTrainingFocus(id), undefined);
    toast(t('life.training.focusSet', { name }), 'accent', 'dumbbell');
  };
  return (
    <section>
      <SectionLabel icon="target">{t('life.training.focus')}</SectionLabel>
      <p className="text-xs text-ink-mute -mt-1 mb-3">{t('life.training.focusHint')}</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {focuses.map((f, i) => {
          const active = career.trainingFocus === f.id;
          const level = INTENSITY[f.id] ?? 2;
          return (
            <motion.button
              key={f.id} {...listItem(i)} whileTap={{ scale: 0.97 }}
              onClick={() => pick(f.id, tl(f.name))}
              className={clsx(
                'relative text-left rounded-2xl p-3 border transition cursor-pointer overflow-hidden min-h-[132px] flex flex-col gap-2',
                active ? 'bg-accent/10 border-accent/60 shadow-[0_0_30px_-10px_rgba(184,255,60,0.6)]' : 'bg-white/3 border-line hover:border-accent/30 hover:bg-white/5',
              )}
            >
              <div className="flex items-start justify-between">
                <span className={clsx('w-9 h-9 rounded-xl grid place-items-center', active ? 'bg-accent text-bg' : 'bg-white/6 text-accent')}>
                  <Icon name={f.icon} size={18} />
                </span>
                {active && <span className="text-[10px] font-bold uppercase tracking-wider text-accent flex items-center gap-1"><Icon name="verified" size={12} />{t('life.training.active')}</span>}
              </div>
              <div className="font-semibold text-sm leading-tight">{tl(f.name)}</div>
              <div className="flex flex-wrap gap-1 mt-auto">
                {f.attrs.slice(0, 3).map((a) => <span key={a} className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/6 text-ink-dim">{attrName(a)}</span>)}
                {f.attrs.length > 3 && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/6 text-ink-mute">+{f.attrs.length - 3}</span>}
              </div>
              <div className="flex items-center gap-1" title={`${t('life.training.intensity')}: ${t(`life.training.intensity.${level}`)}`}>
                {[1, 2, 3, 4].map((n) => <span key={n} className={clsx('h-1 flex-1 rounded-full', n <= level ? (level >= 4 ? 'bg-danger' : level >= 3 ? 'bg-gold' : 'bg-accent') : 'bg-white/10')} />)}
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}

// ───────── attributes ─────────

const GROUPS: { id: 'technical' | 'physical' | 'mental'; icon: string }[] = [
  { id: 'technical', icon: 'crosshair' }, { id: 'physical', icon: 'dumbbell' }, { id: 'mental', icon: 'brain' },
];

export function AttributePanel({ life }: { life: Life }) {
  const { player, career } = life;
  const focus = safe(() => TRAINING_FOCUSES.find((f) => f.id === career.trainingFocus), undefined);
  const focusAttrs = new Set<AttrKey>(focus?.attrs ?? []);
  const deltas = new Map<AttrKey, number>();
  for (const p of career.lastWeekReport?.progression ?? []) deltas.set(p.attr, (deltas.get(p.attr) ?? 0) + p.delta);
  return (
    <section>
      <SectionLabel icon="chart">{t('life.training.attributes')}</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {GROUPS.map((g, gi) => {
          const keys = ATTR_GROUPS[g.id];
          const avg = Math.round(keys.reduce((s, k) => s + player.attrs[k], 0) / keys.length);
          return (
            <motion.div key={g.id} {...listItem(gi)}>
              <Card title={t(`life.training.group.${g.id}`)} icon={g.icon} action={<span className={clsx('font-display text-2xl', attrTone(avg))}>{avg}</span>} className="h-full">
                <div className="divide-y divide-line/60">
                  {keys.map((k) => {
                    const v = player.attrs[k];
                    const xp = career.xp[k] ?? 0;
                    const d = deltas.get(k);
                    return (
                      <div key={k} className="py-2.5 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm truncate">{attrName(k)}</span>
                          {focusAttrs.has(k) && <Icon name="sparkles" size={12} className="text-accent shrink-0" />}
                          {!!d && <Chip tone={d > 0 ? 'accent' : 'danger'} className="!py-0.5">{signed(d)}</Chip>}
                          <span className={clsx('ml-auto font-display text-2xl leading-none tabular-nums', attrTone(v))}>{v}</span>
                        </div>
                        <div className="mt-1.5 space-y-1" title={t('life.training.nextPoint', { pct: Math.round(xp) })}>
                          <Bar pct={v} className={attrBar(v)} />
                          <Bar pct={xp} className="bg-violet/80" h="h-1" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-2 text-[11px] text-ink-mute">
        <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-accent" />{t('common.overall')}</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded-full bg-violet/80" />{t('life.training.xpLegend')}</span>
        <span className="flex items-center gap-1.5"><Icon name="sparkles" size={11} className="text-accent" />{t('life.training.focusAttr')}</span>
      </div>
    </section>
  );
}

// ───────── recent progression ─────────

export function ProgressionStrip({ life }: { life: Life }) {
  const rep = life.career.lastWeekReport;
  const rows = (rep?.progression ?? []).filter((p) => p.delta !== 0);
  return (
    <Card title={t('life.training.recent')} icon="trend_up" action={rep && <span className="text-[11px] text-ink-mute">{t('life.training.recentWeek', { week: rep.week + 1 })}</span>}>
      {rows.length ? (
        <div className="flex flex-wrap gap-2">
          {rows.map((p, i) => (
            <motion.span key={`${p.attr}${i}`} {...listItem(i)} className={clsx('inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold', p.delta > 0 ? 'bg-accent/12 text-accent' : 'bg-danger/12 text-danger')}>
              <Icon name={p.delta > 0 ? 'trend_up' : 'trend_down'} size={14} />{attrName(p.attr)} <span className="font-display text-lg leading-none">{signed(p.delta)}</span>
            </motion.span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-dim">{t('life.training.recentEmpty')}</p>
      )}
    </Card>
  );
}

// ───────── drills ─────────

const DRILLS: { type: Extract<MomentType, 'drill_free_kick' | 'drill_finishing' | 'drill_passing'>; icon: string; attrs: AttrKey[] }[] = [
  { type: 'drill_free_kick', icon: 'crosshair', attrs: ['curl', 'shooting', 'composure'] },
  { type: 'drill_finishing', icon: 'target', attrs: ['shooting', 'composure', 'positioning'] },
  { type: 'drill_passing', icon: 'footprints', attrs: ['passing', 'vision', 'firstTouch'] },
];

export function DrillsSection({ life }: { life: Life }) {
  const { state, career } = life;
  return (
    <section>
      <SectionLabel icon="gamepad">{t('life.training.drills')}</SectionLabel>
      <p className="text-xs text-ink-mute -mt-1 mb-3">{t('life.training.drillsHint')}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {DRILLS.map((d, i) => {
          const done = drillDone(state, d.type);
          return (
            <motion.div key={d.type} {...listItem(i)}>
              <Card className={clsx('h-full flex flex-col gap-3', done && 'opacity-80')}>
                <div className="flex items-center gap-3">
                  <span className={clsx('w-11 h-11 rounded-2xl grid place-items-center', done ? 'bg-white/6 text-ink-dim' : 'bg-accent/12 text-accent')}><Icon name={d.icon} size={22} /></span>
                  <div className="min-w-0">
                    <div className="font-display text-2xl leading-none">{t(`life.training.drill.${d.type}.name`)}</div>
                    <div className="text-[11px] text-ink-mute mt-1">{t('life.training.drillCost')}</div>
                  </div>
                </div>
                <p className="text-sm text-ink-dim leading-snug">{t(`life.training.drill.${d.type}.desc`)}</p>
                <div className="flex flex-wrap gap-1 items-center">
                  <span className="text-[10px] uppercase tracking-wider text-ink-mute mr-1">{t('life.training.drillTrains')}</span>
                  {d.attrs.map((a) => <Chip key={a} tone="violet">{attrName(a)}</Chip>)}
                </div>
                <div className="mt-auto">
                  {done ? (
                    <div className="flex items-center justify-center gap-2 h-10 rounded-xl bg-white/5 text-accent text-sm font-semibold"><Icon name="verified" size={16} />{t('life.training.drillDone')}</div>
                  ) : (
                    <Button variant="primary" block disabled={career.retired} icon="gamepad" onClick={() => navigate('drill', { type: d.type })}>{t('life.training.drillStart')}</Button>
                  )}
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
