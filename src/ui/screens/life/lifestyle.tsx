/** Lifestyle screen parts: activities grid, shop with collection showcase, finances. */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Effects, GameState } from '../../../core/types';
import { t, tl } from '../../../core/i18n';
import {
  ACTIVITIES, ACTIONS_PER_WEEK, SHOP_ITEMS, canDoActivity, resaleValue, sponsorCategoryName, weeklyFinances,
  type ActivityDef, type ShopCategory, type ShopItem,
} from '../../../career/api';
import { game } from '../../../game/api';
import { Badge, Button, Card, CountUp, EmptyState, Icon, Modal, StatTile, Tabs, clsx, toast } from '../../components/kit';
import { Chip, Sparkline, listItem, safe, type Life } from './shared';
import { effectChips, money, signed, type ChipTone } from './logic';
import { loadMoney, projectMoney, recordMoney } from './moneylog';

const effectLabel = (key: string): string => {
  if (key.startsWith('rel.')) return t(`common.${key}`);
  if (key.startsWith('attr.')) return t(`common.${key}`);
  return t(`life.effect.${key}`);
};

function EffectChips({ effects, skip }: { effects?: Effects; skip?: string[] }) {
  const chips = effectChips(effects, effectLabel).filter((c) => !skip?.includes(c.key));
  return (
    <>
      {chips.map((c) => (
        <Chip key={c.key} icon={c.icon} tone={c.tone}>
          {c.label} {c.key === 'money' ? `${c.value > 0 ? '+' : '−'}${money(Math.abs(c.value))}` : signed(c.value)}
        </Chip>
      ))}
    </>
  );
}

// ───────── activities ─────────

const CAT_ICON: Record<string, string> = {
  rest: 'bed', social: 'users', family: 'house', media: 'mic', nightlife: 'party', charity: 'hand_heart', training: 'dumbbell', romance: 'heart',
};
const CAT_TINT: Record<string, string> = {
  rest: 'bg-info/14 text-info', social: 'bg-accent/14 text-accent', family: 'bg-gold/14 text-gold', media: 'bg-violet/14 text-violet',
  nightlife: 'bg-danger/14 text-danger', charity: 'bg-accent-2/14 text-accent-2', training: 'bg-accent/14 text-accent', romance: 'bg-danger/14 text-danger',
};

interface ActivityResult { id: string; name: string; text: string; notes: string[]; ok: boolean }

export function ActivitiesTab({ life }: { life: Life }) {
  const { state, career } = life;
  const [cat, setCat] = useState('all');
  const [result, setResult] = useState<ActivityResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const list = useMemo(() => safe(() => ACTIVITIES, [] as ActivityDef[]), []);
  const cats = useMemo(() => ['all', ...new Set(list.map((a) => a.category))], [list]);
  const shown = list.filter((a) => cat === 'all' || a.category === cat);

  const run = (a: ActivityDef) => {
    if (busy) return;
    setBusy(a.id);
    try {
      const res = game.doActivity(a.id);
      setResult({ id: a.id, name: tl(a.name), text: res.text, notes: res.notes, ok: res.ok });
      toast(res.ok ? res.text : res.text || t('life.lifestyle.failed'), res.ok ? 'accent' : 'danger', a.icon);
    } catch {
      toast(t('life.lifestyle.errored'), 'danger', 'siren');
    } finally {
      setBusy(null);
    }
  };

  if (!list.length) return <EmptyState icon="zap" title={t('life.unavailable.title')} text={t('life.unavailable.text')} />;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-ink-mute font-bold">{t('life.lifestyle.actions')}</div>
            <div className="flex gap-1.5 mt-2">
              {Array.from({ length: Math.max(ACTIONS_PER_WEEK, career.actionsLeft) }, (_, i) => (
                <motion.span key={i} animate={{ scale: i < career.actionsLeft ? 1 : 0.8 }} className={clsx('w-8 h-8 rounded-xl grid place-items-center', i < career.actionsLeft ? 'bg-accent text-bg' : 'bg-white/6 text-ink-mute')}>
                  <Icon name="zap" size={15} />
                </motion.span>
              ))}
            </div>
          </div>
          <div className="min-w-[44%] max-w-[52%]">
            <div className="flex items-center justify-between text-xs mb-1 text-ink-dim"><span className="flex items-center gap-1.5"><Icon name="zap" size={12} />{t('common.energy')}</span><span className="font-bold text-accent tabular-nums">{Math.round(career.energy)}</span></div>
            <div className="h-2.5 rounded-full bg-white/6 overflow-hidden"><motion.div className={clsx('h-full rounded-full', career.energy < 33 ? 'bg-danger' : career.energy < 60 ? 'bg-gold' : 'bg-accent')} animate={{ width: `${career.energy}%` }} /></div>
          </div>
        </div>
        {career.actionsLeft <= 0 && <p className="text-xs text-gold mt-3">{t('life.lifestyle.noActions')}</p>}
      </Card>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <Card glow={result.ok ? 'accent' : 'danger'} title={t('life.lifestyle.result')} icon="sparkles" action={<button onClick={() => setResult(null)} className="text-ink-mute hover:text-ink cursor-pointer"><Icon name="eye" size={14} /></button>}>
              <div className="font-semibold">{result.name}</div>
              <p className="text-sm text-ink-dim mt-1 leading-snug">{result.text}</p>
              {!!result.notes.length && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {result.notes.map((n, i) => <motion.span key={i} {...listItem(i)}><Chip tone="accent">{n}</Chip></motion.span>)}
                </div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Tabs
        value={cat} onChange={setCat}
        tabs={cats.map((c) => ({ id: c, label: t(`life.lifestyle.cat.${c}`), icon: c === 'all' ? 'sparkles' : CAT_ICON[c] }))}
      />

      {shown.length === 0 && <EmptyState icon="zap" title={t('life.lifestyle.empty')} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {shown.map((a, i) => (
          <ActivityCard key={a.id} a={a} i={i} state={state} busy={busy === a.id} onRun={() => run(a)} />
        ))}
      </div>
    </div>
  );
}

function ActivityCard({ a, i, state, onRun, busy }: { a: ActivityDef; i: number; state: GameState; onRun: () => void; busy: boolean }) {
  const can = safe(() => canDoActivity(state, a.id), { ok: false, reason: undefined as string | undefined });
  const gain = a.energy < 0;
  return (
    <motion.div {...listItem(i)}>
      <Card className={clsx('h-full flex flex-col gap-3', !can.ok && 'opacity-90')}>
        <div className="flex items-start gap-3">
          <span className={clsx('w-11 h-11 rounded-2xl grid place-items-center shrink-0', CAT_TINT[a.category] ?? 'bg-white/8 text-ink-dim')}><Icon name={a.icon} size={22} /></span>
          <div className="min-w-0">
            <div className="font-semibold leading-tight">{tl(a.name)}</div>
            <p className="text-xs text-ink-dim mt-1 leading-snug line-clamp-3">{tl(a.desc)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {a.energy !== 0 && <Chip icon="zap" tone={gain ? 'accent' : 'gold'}>{gain ? t('life.lifestyle.energyGain', { n: Math.abs(a.energy) }) : t('life.lifestyle.energyCost', { n: a.energy })}</Chip>}
          {a.cost > 0 && <Chip icon="coin" tone="gold">{money(a.cost)}</Chip>}
          {a.minFame ? <Chip icon="star" tone="violet">{t('life.lifestyle.fameReq', { n: a.minFame })}</Chip> : null}
          <EffectChips effects={a.effects} skip={['energy']} />
          {a.risk && (
            <span title={tl(a.risk.text)}><Badge tone="danger"><Icon name="siren" size={11} />{t('life.lifestyle.risk', { n: Math.round(a.risk.chance * 100) })}</Badge></span>
          )}
        </div>
        <div className="mt-auto space-y-1.5">
          <Button variant={can.ok ? 'primary' : 'secondary'} block disabled={!can.ok} loading={busy} icon="zap" onClick={onRun}>{t('life.lifestyle.do')}</Button>
          {!can.ok && can.reason && <div className="text-[11px] text-danger text-center leading-tight">{can.reason}</div>}
        </div>
      </Card>
    </motion.div>
  );
}

// ───────── shop ─────────

const TIER_STYLE: Record<ShopItem['tier'], { ring: string; glow: string; icon: string; label: string }> = {
  1: { ring: 'border-line', glow: '', icon: 'bg-white/8 text-ink-dim', label: 'text-ink-mute' },
  2: { ring: 'border-info/30', glow: '', icon: 'bg-info/14 text-info', label: 'text-info' },
  3: { ring: 'border-violet/40', glow: 'shadow-[0_0_26px_-12px_rgba(169,139,255,0.7)]', icon: 'bg-violet/16 text-violet', label: 'text-violet' },
  4: { ring: 'border-accent/50', glow: 'shadow-[0_0_30px_-10px_rgba(184,255,60,0.55)]', icon: 'bg-accent/16 text-accent', label: 'text-accent' },
  5: { ring: 'border-gold/70', glow: 'shadow-[0_0_44px_-8px_rgba(255,203,71,0.6)]', icon: 'bg-gold text-bg', label: 'text-gold' },
};

const SHOP_CAT_ICON: Record<ShopCategory, string> = {
  car: 'car_front', house: 'house', watch: 'watch', fashion: 'shirt', tech: 'smartphone', pet: 'paw', staff: 'briefcase', boat: 'boat', jet: 'plane', art: 'palette',
};

function perkChips(item: ShopItem) {
  const p = item.perks;
  const out: { key: string; text: string; tone: ChipTone }[] = [];
  if (p.energyRegen) out.push({ key: 'e', text: `${t('life.perk.energyRegen')} ${signed(p.energyRegen)}`, tone: 'accent' });
  if (p.trainingBoost) out.push({ key: 't', text: `${t('life.perk.trainingBoost')} +${Math.round(p.trainingBoost * 100)}%`, tone: 'violet' });
  if (p.fameWeekly) out.push({ key: 'f', text: `${t('life.perk.fameWeekly')} ${signed(p.fameWeekly)}`, tone: 'gold' });
  if (p.morale) out.push({ key: 'm', text: `${t('life.perk.morale')} ${signed(p.morale)}`, tone: 'info' });
  if (p.injuryResist) out.push({ key: 'i', text: `${t('life.perk.injuryResist')} +${Math.round(p.injuryResist * 100)}%`, tone: 'accent' });
  for (const [k, v] of Object.entries(p.rel ?? {})) if (v) out.push({ key: `r${k}`, text: `${t(`common.rel.${k}`)} ${signed(v)}`, tone: 'info' });
  return out;
}

export function ShopTab({ life }: { life: Life }) {
  const { career } = life;
  const [cat, setCat] = useState<'all' | ShopCategory>('all');
  const [confirm, setConfirm] = useState<{ item: ShopItem; mode: 'buy' | 'sell' } | null>(null);
  const items = useMemo(() => safe(() => SHOP_ITEMS, [] as ShopItem[]), []);
  const owned = new Set(career.inventory.map((o) => o.itemId));
  const ownedItems = items.filter((i) => owned.has(i.id));
  const cats = useMemo(() => ['all', ...new Set(items.map((i) => i.category))] as ('all' | ShopCategory)[], [items]);
  const shown = items.filter((i) => cat === 'all' || i.category === cat).sort((a, b) => a.tier - b.tier || a.price - b.price);
  const totalValue = ownedItems.reduce((s, i) => s + i.price, 0);
  const totalUpkeep = ownedItems.reduce((s, i) => s + i.upkeep, 0);

  if (!items.length) return <EmptyState icon="shopping" title={t('life.unavailable.title')} text={t('life.unavailable.text')} />;

  const exec = () => {
    if (!confirm) return;
    const { item, mode } = confirm;
    const name = tl(item.name);
    setConfirm(null);
    try {
      if (mode === 'buy') {
        const res = game.buyItem(item.id);
        if (res.ok) toast(t(item.category === 'staff' ? 'life.lifestyle.shop.hiredToast' : 'life.lifestyle.shop.bought', { name }), 'gold', item.icon);
        else toast(res.reason ?? t('life.lifestyle.shop.failed'), 'danger', 'lock');
      } else {
        const res = game.sellItem(item.id);
        if (res.ok) toast(t('life.lifestyle.shop.sold', { name, money: money(res.refund) }), 'gold', 'coin');
        else toast(t('life.lifestyle.shop.failed'), 'danger', 'lock');
      }
    } catch {
      toast(t('life.lifestyle.shop.failed'), 'danger', 'lock');
    }
  };

  return (
    <div className="space-y-4">
      <Card title={t('life.lifestyle.shop.collection')} icon="gem" glow={ownedItems.some((i) => i.tier === 5) ? 'gold' : undefined}
        action={ownedItems.length > 0 && <span className="text-xs text-ink-dim">{ownedItems.length}</span>}>
        {ownedItems.length === 0 ? (
          <p className="text-sm text-ink-dim">{t('life.lifestyle.shop.collectionEmpty')}</p>
        ) : (
          <>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {ownedItems.map((it, i) => {
                const ts = TIER_STYLE[it.tier];
                return (
                  <motion.button key={it.id} {...listItem(i)} whileHover={{ y: -3 }} onClick={() => setConfirm({ item: it, mode: 'sell' })}
                    className={clsx('shrink-0 w-[92px] rounded-2xl border p-2.5 bg-white/3 text-center cursor-pointer', ts.ring, ts.glow)} title={tl(it.name)}>
                    <span className={clsx('w-11 h-11 mx-auto rounded-2xl grid place-items-center', ts.icon)}><Icon name={it.icon} size={22} /></span>
                    <div className="text-[11px] mt-1.5 leading-tight line-clamp-2 h-[28px]">{tl(it.name)}</div>
                  </motion.button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <StatTile label={t('life.lifestyle.shop.totalValue')} value={money(totalValue)} tone="gold" icon="coin" />
              <StatTile label={t('life.lifestyle.shop.totalUpkeep')} value={totalUpkeep ? money(totalUpkeep) : '–'} tone={totalUpkeep ? 'danger' : 'accent'} icon="wallet" />
            </div>
          </>
        )}
      </Card>

      <Tabs value={cat} onChange={(v) => setCat(v as 'all' | ShopCategory)}
        tabs={cats.map((c) => ({ id: c, label: t(`life.lifestyle.shop.cat.${c}`), icon: c === 'all' ? 'sparkles' : SHOP_CAT_ICON[c] }))} />

      {shown.length === 0 && <EmptyState icon="shopping" title={t('life.lifestyle.shop.empty')} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {shown.map((it, i) => (
          <ShopCard key={it.id} item={it} i={i} owned={owned.has(it.id)} fame={career.fame} balance={career.money}
            onBuy={() => setConfirm({ item: it, mode: 'buy' })} onSell={() => setConfirm({ item: it, mode: 'sell' })} />
        ))}
      </div>

      <Modal
        open={!!confirm} onClose={() => setConfirm(null)} size="sm"
        title={confirm ? (confirm.mode === 'buy' ? t('life.lifestyle.shop.confirmBuy', { name: tl(confirm.item.name) }) : t('life.lifestyle.shop.confirmSell', { name: tl(confirm.item.name) })) : ''}
        footer={confirm && (
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
            <Button variant={confirm.mode === 'buy' ? 'gold' : 'danger'} icon={confirm.mode === 'buy' ? 'coin' : 'wallet'} onClick={exec}
              disabled={confirm.mode === 'buy' && career.money < confirm.item.price}>
              {t(`life.lifestyle.shop.${confirm.mode === 'buy' ? (confirm.item.category === 'staff' ? 'hire' : 'buy') : confirm.item.category === 'staff' ? 'release' : 'sell'}`)}
            </Button>
          </>
        )}
      >
        {confirm && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={clsx('w-14 h-14 rounded-2xl grid place-items-center', TIER_STYLE[confirm.item.tier].icon)}><Icon name={confirm.item.icon} size={28} /></span>
              <div>
                <div className="font-semibold">{tl(confirm.item.name)}</div>
                <div className={clsx('text-xs font-bold uppercase tracking-wider', TIER_STYLE[confirm.item.tier].label)}>{t(`life.lifestyle.shop.tier.${confirm.item.tier}`)}</div>
              </div>
            </div>
            {confirm.mode === 'buy' ? (
              <div className="rounded-2xl bg-white/4 border border-line divide-y divide-line text-sm">
                <Row k={t('life.lifestyle.shop.price')} v={money(confirm.item.price)} tone="text-gold" />
                <Row k={t('life.fin.upkeep')} v={confirm.item.upkeep ? t('life.lifestyle.shop.upkeep', { money: money(confirm.item.upkeep) }) : t('life.lifestyle.shop.noUpkeep')} />
                <Row k={t('life.lifestyle.shop.balanceAfter')} v={money(career.money - confirm.item.price)} tone={career.money - confirm.item.price < 0 ? 'text-danger' : 'text-accent'} />
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-ink-dim">{t(confirm.item.category === 'staff' ? 'life.lifestyle.shop.confirmReleaseText' : 'life.lifestyle.shop.confirmSellText')}</p>
                {resaleValue(confirm.item) > 0 && (
                  <div className="rounded-2xl bg-white/4 border border-line text-sm"><Row k={t('life.lifestyle.shop.refund')} v={`+${money(resaleValue(confirm.item))}`} tone="text-gold" /></div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return <div className="flex items-center justify-between px-3 py-2.5"><span className="text-ink-dim">{k}</span><span className={clsx('font-semibold tabular-nums', tone)}>{v}</span></div>;
}

function ShopCard({ item, i, owned, fame, balance, onBuy, onSell }: {
  item: ShopItem; i: number; owned: boolean; fame: number; balance: number; onBuy: () => void; onSell: () => void;
}) {
  const ts = TIER_STYLE[item.tier];
  const locked = fame < item.minFame && !owned;
  const poor = !owned && !locked && balance < item.price;
  const perks = perkChips(item);
  const staff = item.category === 'staff';
  return (
    <motion.div {...listItem(i)} whileHover={{ y: -2 }} className={clsx('relative rounded-[var(--radius-card)] border p-4 flex flex-col gap-3 overflow-hidden bg-gradient-to-b from-white/[0.05] to-white/[0.015] h-full', ts.ring, ts.glow)}>
      {item.tier === 5 && <div className="shine absolute inset-0 pointer-events-none opacity-70" />}
      <div className="relative flex items-start gap-3">
        <span className={clsx('w-12 h-12 rounded-2xl grid place-items-center shrink-0', ts.icon)}><Icon name={item.icon} size={24} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight">{tl(item.name)}</div>
          <div className={clsx('text-[10px] font-bold uppercase tracking-[0.14em] mt-0.5', ts.label)}>
            {'★'.repeat(item.tier)} {t(`life.lifestyle.shop.tier.${item.tier}`)}
          </div>
        </div>
        {owned && <Badge tone="accent"><Icon name="verified" size={11} />{t(staff ? 'life.lifestyle.shop.hired' : 'life.lifestyle.shop.owned')}</Badge>}
      </div>
      <p className="relative text-xs text-ink-dim leading-snug line-clamp-3">{tl(item.desc)}</p>
      <div className="relative flex flex-wrap gap-1.5">
        {perks.map((p) => <Chip key={p.key} tone={p.tone}>{p.text}</Chip>)}
        <EffectChips effects={item.onBuy} />
      </div>
      <div className="relative mt-auto flex items-end justify-between gap-2">
        <div>
          <div className="font-display text-3xl leading-none text-gold">{money(item.price)}</div>
          <div className="text-[11px] text-ink-mute mt-1">{item.upkeep ? t('life.lifestyle.shop.upkeep', { money: money(item.upkeep) }) : t('life.lifestyle.shop.noUpkeep')}</div>
        </div>
        {owned ? (
          <Button size="sm" variant="secondary" onClick={onSell}>{t(staff ? 'life.lifestyle.shop.release' : 'life.lifestyle.shop.sell')}</Button>
        ) : (
          <Button size="sm" variant={locked || poor ? 'secondary' : 'gold'} icon={locked ? 'lock' : 'coin'} disabled={locked} onClick={onBuy}>
            {locked ? t('life.lifestyle.shop.locked', { n: item.minFame }) : t(staff ? 'life.lifestyle.shop.hire' : 'life.lifestyle.shop.buy')}
          </Button>
        )}
      </div>
      {locked && <div className="absolute inset-0 bg-bg/35 pointer-events-none" />}
    </motion.div>
  );
}

// ───────── finances ─────────

export function FinancesTab({ life }: { life: Life }) {
  const { state, career, player } = life;
  const fin = safe(() => weeklyFinances(state), null);
  const [history, setHistory] = useState(() => loadMoney(state.id));
  useEffect(() => {
    setHistory(recordMoney(state.id, { k: state.season * 100 + state.week, v: career.money }));
  }, [state.id, state.season, state.week, career.money]);

  const net = fin?.total ?? 0;
  const useHistory = history.length >= 2;
  const series = useHistory ? history.map((h) => h.v) : projectMoney(career.money, net);
  const income = fin ? fin.wage + fin.sponsors : 0;
  const costs = fin ? fin.upkeep + fin.tax : 0;
  const maxRow = Math.max(1, fin?.wage ?? 0, fin?.sponsors ?? 0, fin?.upkeep ?? 0, fin?.tax ?? 0);
  const deals = career.sponsors;

  return (
    <div className="space-y-4">
      <Card glow="gold" className="relative overflow-hidden">
        <div className="absolute -right-4 -top-8 font-display text-[9rem] leading-none text-gold/[0.06] select-none pointer-events-none">€</div>
        <div className="relative flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-ink-mute font-bold">{t('life.fin.balance')}</div>
            <div className={clsx('font-display text-6xl leading-none mt-1', career.money < 0 ? 'text-danger' : 'text-gold')}><CountUp value={career.money} format={(v) => money(v)} /></div>
          </div>
          {fin && <Chip icon={net >= 0 ? 'trend_up' : 'trend_down'} tone={net >= 0 ? 'accent' : 'danger'} className="!text-sm !px-3 !py-1.5">{t('life.fin.net')} {net >= 0 ? '+' : '−'}{money(Math.abs(net))}{t('common.perWeek')}</Chip>}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={t('life.fin.weekly')} icon="wallet">
          {fin ? (
            <div className="space-y-3">
              {([
                ['wage', fin.wage, 'accent', t('life.fin.wage')], ['sponsors', fin.sponsors, 'accent', t('life.fin.sponsors')],
                ['upkeep', fin.upkeep, 'danger', t('life.fin.upkeep')], ['tax', fin.tax, 'danger', t('life.fin.tax')],
              ] as const).map(([k, v, tone, label]) => (
                <div key={k}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-ink-dim">{label}</span>
                    <span className={clsx('font-semibold tabular-nums', tone === 'accent' ? 'text-accent' : 'text-danger')}>{tone === 'accent' ? '+' : '−'}{money(v)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/6 overflow-hidden">
                    <motion.div className={clsx('h-full rounded-full', tone === 'accent' ? 'bg-accent' : 'bg-danger')} initial={{ width: 0 }} animate={{ width: `${(v / maxRow) * 100}%` }} transition={{ type: 'spring', stiffness: 90, damping: 20 }} />
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-3 border-t border-line">
                <span className="text-xs text-ink-mute">{t('life.fin.incomeOut')} {money(income)} · {t('life.fin.expenseOut')} {money(costs)}</span>
                <span className={clsx('font-display text-3xl leading-none', net >= 0 ? 'text-accent' : 'text-danger')}>{net >= 0 ? '+' : '−'}{money(Math.abs(net))}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-dim">{t('life.unavailable.text')}</p>
          )}
        </Card>

        <Card title={t('life.fin.trend')} icon="chart" action={<span className="text-[11px] text-ink-mute">{useHistory ? t('life.fin.history') : t('life.fin.projection')}</span>}>
          <Sparkline values={series} height={120} width={320} color={useHistory ? '#ffcb47' : '#49c6ff'} dots={useHistory && series.length <= 24} label={t('life.fin.trend')} />
          <div className="flex justify-between text-[11px] text-ink-mute mt-1 tabular-nums">
            <span>{money(series[0])}</span><span>{money(series[series.length - 1])}</span>
          </div>
        </Card>
      </div>

      <Card title={t('life.fin.sponsorsTitle')} icon="handshake" action={<span className="text-xs text-ink-dim">{player.contract ? `${t('life.fin.contract')}: ${money(player.contract.wage)}${t('common.perWeek')}` : ''}</span>}>
        {deals.length === 0 ? (
          <p className="text-sm text-ink-dim">{t('life.fin.noSponsors')}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {deals.map((d, i) => (
              <motion.div key={d.id} {...listItem(i)} className="rounded-2xl bg-white/4 border border-line p-3 flex items-center gap-3">
                <span className="w-11 h-11 rounded-xl bg-gold/14 text-gold grid place-items-center shrink-0"><Icon name={d.category === 'boots' ? 'footprints' : d.category === 'watches' ? 'watch' : d.category === 'drinks' ? 'coffee' : 'dollar_badge'} size={22} /></span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{d.brand}</div>
                  <div className="text-[11px] text-ink-mute truncate">{safe(() => sponsorCategoryName(d.category), d.category)} · {t('life.fin.until', { season: `${d.endSeason}/${String(d.endSeason + 1).slice(2)}` })}{d.requirement ? ` · ${d.requirement}` : ''}</div>
                </div>
                <div className="text-right"><div className="font-display text-2xl text-gold leading-none">{money(d.weekly)}</div><div className="text-[10px] text-ink-mute">{t('common.perWeek')}</div></div>
              </motion.div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
