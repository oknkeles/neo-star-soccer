/** Transfers screen parts: contract card, offer cards and the negotiation room. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ContractTerms, GameState, Lang, Negotiation, SquadRole, TransferOffer } from '../../../core/types';
import { t } from '../../../core/i18n';
import { greedOf, ownerAcceptsFee, userMarketValue } from '../../../career/api';
import { game } from '../../../game/api';
import { Badge, Button, Card, Crest, Icon, Meter, Modal, clsx, toast } from '../../components/kit';
import { AIBadge, Chip, Toggle, listItem, safe, useClaudeOn, type Life } from './shared';
import { askRanges, money, offerWeeksLeft, ROLE_ORDER, sameTerms, stepMoney, type ChipTone } from './logic';

const leagueOf = (state: GameState, clubId: string): string => {
  const c = state.world.clubs[clubId];
  return c ? state.world.leagues.find((l) => l.country === c.country && l.tier === c.tier)?.name ?? c.city : '';
};

const KIND_TONE: Record<TransferOffer['kind'], ChipTone> = { transfer: 'accent', loan: 'info', free: 'gold', renewal: 'neutral', trial: 'violet' };

export const isLive = (o: TransferOffer) => o.status === 'pending' || o.status === 'negotiating';

// ───────── contract ─────────

export function ContractCard({ life }: { life: Life }) {
  const { state, player, career, lang } = life;
  const c = player.contract;
  const club = c ? state.world.clubs[c.clubId] : null;
  const value = safe(() => userMarketValue(state), player.value);
  const left = c ? c.endSeason - state.season + 1 : 0;
  const owner = c?.loan ? state.world.clubs[c.loan.parentClubId] : null;

  const toggle = (on: boolean) => {
    try {
      game.setTransferListed(on);
      toast(t(on ? 'life.transfers.list.toastOn' : 'life.transfers.list.toastOff'), on ? 'gold' : 'neutral', 'megaphone');
    } catch {
      toast(t('life.transfers.failed'), 'danger', 'siren');
    }
  };

  return (
    <Card glow={club ? undefined : 'gold'} className="relative overflow-hidden">
      {club && <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: `linear-gradient(${club.kit.primary}, ${club.kit.secondary})` }} />}
      <div className="flex items-center gap-4 flex-wrap">
        {club ? <Crest kit={club.kit} label={club.shortName} size={58} /> : <span className="w-14 h-14 rounded-2xl bg-white/6 grid place-items-center text-ink-mute"><Icon name="handshake" size={26} /></span>}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-mute font-bold">{t('life.transfers.contract')}</div>
          <div className="font-display text-3xl leading-none truncate mt-0.5">{club?.name ?? t('life.noClub')}</div>
          {club && <div className="text-xs text-ink-dim mt-1">{leagueOf(state, club.id)}{owner && ` · ${t('life.transfers.loanFrom', { club: owner.name })}`}</div>}
        </div>
        {c && <Chip tone={left <= 1 ? 'danger' : 'accent'} icon="calendar" className="!text-xs !py-1.5">{left <= 1 ? t('life.transfers.endsThisSeason') : t('life.transfers.yearsLeft', { n: left })}</Chip>}
      </div>

      {c ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Fact label={t('common.wage')} value={money(c.wage, lang)} sub={t('common.perWeek')} tone="text-gold" />
          <Fact label={t('life.transfers.role')} value={t(`common.role.${c.role}`)} />
          <Fact label={t('life.transfers.clause')} value={c.releaseClause ? money(c.releaseClause, lang) : t('life.transfers.noClause')} />
          <Fact label={t('common.value')} value={money(value, lang)} tone="text-accent" />
          {(c.goalBonus > 0 || c.appearanceBonus > 0) && (
            <div className="col-span-2 md:col-span-4 flex flex-wrap gap-2 text-xs">
              <span className="text-ink-mute uppercase tracking-wider font-bold text-[10px] self-center">{t('life.transfers.bonuses')}</span>
              {c.goalBonus > 0 && <Chip icon="target" tone="gold">{money(c.goalBonus, lang)} {t('life.transfers.perGoal')}</Chip>}
              {c.appearanceBonus > 0 && <Chip icon="footprints" tone="gold">{money(c.appearanceBonus, lang)} {t('life.transfers.perApp')}</Chip>}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-dim mt-3">{t('life.transfers.noContract')}</p>
      )}

      {club && !career.retired && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/4 border border-line p-3">
          <span className={clsx('w-10 h-10 rounded-xl grid place-items-center shrink-0', career.transferListed ? 'bg-gold/16 text-gold' : 'bg-white/6 text-ink-mute')}><Icon name="megaphone" size={19} /></span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm flex items-center gap-2">{t('life.transfers.list.title')}<span className={clsx('text-[10px] font-bold uppercase', career.transferListed ? 'text-gold' : 'text-ink-mute')}>{t(career.transferListed ? 'life.transfers.list.on' : 'life.transfers.list.off')}</span></div>
            <p className="text-[11px] text-ink-mute leading-snug">{t('life.transfers.list.desc')}</p>
          </div>
          <Toggle on={career.transferListed} onChange={toggle} label={t('life.transfers.list.title')} />
        </div>
      )}
    </Card>
  );
}

function Fact({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-white/4 border border-line p-3 min-w-0">
      <div className="text-[10px] uppercase tracking-[0.12em] text-ink-mute font-bold">{label}</div>
      <div className={clsx('font-display text-2xl leading-tight mt-0.5 truncate', tone)}>{value}{sub && <span className="font-sans text-[11px] text-ink-mute ml-1">{sub}</span>}</div>
    </div>
  );
}

// ───────── offers ─────────

export function OfferCard({ life, offer, i, focused, negotiating, onNegotiate }: {
  life: Life; offer: TransferOffer; i: number; focused: boolean; negotiating: boolean; onNegotiate: (o: TransferOffer) => void;
}) {
  const { state, player, lang } = life;
  const club = state.world.clubs[offer.fromClubId];
  const live = isLive(offer);
  const [confirm, setConfirm] = useState<'accept' | 'reject' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const weeks = offerWeeksLeft(offer.expiresWeek, state.season, state.week);
  const cur = player.contract?.wage ?? 0;
  const wageDelta = cur > 0 ? Math.round((offer.terms.wage / cur - 1) * 100) : null;
  const sellable = offer.kind !== 'transfer' || safe(() => ownerAcceptsFee(state, offer.fee), offer.parentClubAccepts);
  const t_ = offer.terms;

  useEffect(() => { if (focused) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [focused]);

  const act = (kind: 'accept' | 'reject') => {
    setConfirm(null);
    try {
      game.respondOffer(offer.id, kind);
      if (kind === 'reject') toast(t('life.transfers.rejected'), 'neutral', 'handshake');
    } catch {
      toast(t('life.transfers.failed'), 'danger', 'siren');
    }
  };

  if (!club) return null;
  return (
    <motion.div ref={ref} {...listItem(i)}>
      <Card
        glow={focused ? 'accent' : offer.kind === 'trial' ? undefined : undefined} padded={false}
        className={clsx('relative overflow-hidden', !live && 'opacity-70', focused && 'ring-2 ring-accent/60')}
      >
        <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: `linear-gradient(${club.kit.primary}, ${club.kit.secondary})` }} />
        <div className="p-4 pl-5 space-y-4">
          <div className="flex items-start gap-3">
            <Crest kit={club.kit} label={club.shortName} size={50} />
            <div className="min-w-0 flex-1">
              <div className="font-display text-2xl leading-none truncate">{club.name}</div>
              <div className="text-xs text-ink-dim mt-1 truncate">{leagueOf(state, club.id)} · {club.city}</div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Chip tone={KIND_TONE[offer.kind]}>{t(`life.transfers.kind.${offer.kind}`)}</Chip>
                {negotiating && <Chip tone="violet" icon="message">{t('life.transfers.status.negotiating')}</Chip>}
                {!live && <Chip>{t(`life.transfers.status.${offer.status}`)}</Chip>}
                {live && <Chip tone={weeks <= 0 ? 'danger' : weeks <= 1 ? 'gold' : 'neutral'} icon="timer">{weeks <= 0 ? t('life.transfers.expiresNow') : t('life.transfers.expires', { n: weeks })}</Chip>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-ink-mute font-bold">{t('life.transfers.fee')}</div>
              <div className="font-display text-3xl leading-none text-gold">{offer.fee > 0 ? money(offer.fee, lang) : t('common.free')}</div>
            </div>
          </div>

          {offer.note && <p className="text-sm text-ink-dim italic leading-snug border-l-2 border-line pl-3">“{offer.note}”</p>}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Term label={t('life.transfers.wage')} value={money(t_.wage, lang)} hint={wageDelta !== null && offer.kind !== 'renewal' ? `${wageDelta >= 0 ? '+' : ''}${wageDelta}% ${t('life.transfers.vsCurrent')}` : undefined} good={wageDelta !== null && wageDelta >= 0} />
            <Term label={t('life.transfers.years')} value={t('life.transfers.yearsValue', { n: t_.years })} />
            <Term label={t('life.transfers.role')} value={t(`common.role.${t_.role}`)} />
            <Term label={t('life.transfers.clause')} value={t_.releaseClause ? money(t_.releaseClause, lang) : t('life.transfers.noClause')} />
            {t_.signingBonus > 0 && <Term label={t('life.transfers.signing')} value={money(t_.signingBonus, lang)} />}
            {t_.goalBonus > 0 && <Term label={t('life.transfers.goalBonus')} value={money(t_.goalBonus, lang)} />}
          </div>

          {live && offer.kind === 'transfer' && (
            <div className={clsx('flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-snug', sellable ? 'bg-accent/8 text-accent' : 'bg-danger/10 text-danger')}>
              <Icon name={sellable ? 'verified' : 'shield_alert'} size={14} className="shrink-0 mt-0.5" />
              <span>{t(sellable ? 'life.transfers.parentYes' : 'life.transfers.parentNo')}</span>
            </div>
          )}

          {live && (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon="handshake" disabled={!sellable} onClick={() => setConfirm('accept')}>{t('life.transfers.accept')}</Button>
              <Button variant="secondary" icon="message" disabled={!sellable || negotiating} onClick={() => onNegotiate(offer)}>{t('life.transfers.negotiate')}</Button>
              <Button variant="ghost" onClick={() => setConfirm('reject')}>{t('life.transfers.reject')}</Button>
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={confirm !== null} onClose={() => setConfirm(null)} size="sm"
        title={confirm === 'accept' ? t('life.transfers.confirmAccept', { club: club.name }) : t('life.transfers.confirmReject')}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
          <Button variant={confirm === 'accept' ? 'primary' : 'danger'} onClick={() => act(confirm === 'accept' ? 'accept' : 'reject')}>{confirm === 'accept' ? t('life.transfers.accept') : t('life.transfers.reject')}</Button>
        </>}
      >
        <p className="text-sm text-ink-dim">{confirm === 'accept' ? t('life.transfers.confirmAcceptText') : t('life.transfers.confirmRejectText', { club: club.name })}</p>
      </Modal>
    </motion.div>
  );
}

function Term({ label, value, hint, good }: { label: string; value: string; hint?: string; good?: boolean }) {
  return (
    <div className="rounded-xl bg-white/4 px-3 py-2 min-w-0">
      <div className="text-[10px] uppercase tracking-[0.12em] text-ink-mute font-bold truncate">{label}</div>
      <div className="font-semibold text-sm truncate">{value}</div>
      {hint && <div className={clsx('text-[10px] truncate', good ? 'text-accent' : 'text-danger')}>{hint}</div>}
    </div>
  );
}

// ───────── negotiation room ─────────

type NumField = 'wage' | 'signingBonus' | 'goalBonus' | 'releaseClause';

function MoneyControl({ value, onChange, min, max, club }: { value: number; onChange: (v: number) => void; min: number; max: number; club: number; lang: Lang }) {
  const diff = value - club;
  const step = Math.max(100, Math.round((max - min) / 200 / 100) * 100);
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(stepMoney(value, -1, min, max))} aria-label="−" className="w-8 h-8 rounded-lg bg-white/6 hover:bg-white/12 cursor-pointer text-lg leading-none shrink-0">−</button>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 min-w-0 accent-accent" />
      <button onClick={() => onChange(stepMoney(value, 1, min, max))} aria-label="+" className="w-8 h-8 rounded-lg bg-white/6 hover:bg-white/12 cursor-pointer text-lg leading-none shrink-0">+</button>
      <div className="w-[86px] text-right shrink-0">
        <div className="font-display text-xl leading-none">{money(value)}</div>
        <div className={clsx('text-[10px] leading-none mt-0.5', diff > 0 ? 'text-gold' : diff < 0 ? 'text-info' : 'text-ink-mute')}>
          {diff === 0 ? t('life.transfers.neg.same') : `${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}`}
        </div>
      </div>
    </div>
  );
}

function TermRow({ icon, label, club, children }: { icon: string; label: string; club: string; children: ReactNode }) {
  return (
    <div className="py-3 border-b border-line/60 last:border-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="flex items-center gap-2 text-sm font-semibold"><Icon name={icon} size={14} className="text-accent" />{label}</span>
        <span className="text-[11px] text-ink-mute">{t('life.transfers.neg.clubOffer')}: <b className="text-ink-dim">{club}</b></span>
      </div>
      {children}
    </div>
  );
}

function greedLevel(g: number): 'low' | 'mid' | 'high' {
  return g <= 0.02 ? 'low' : g < 0.35 ? 'mid' : 'high';
}

export function NegotiationRoom({ life, neg }: { life: Life; neg: Negotiation }) {
  const { state, lang } = life;
  const club = state.world.clubs[neg.clubId];
  const [ask, setAsk] = useState<ContractTerms>({ ...neg.current });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [walk, setWalk] = useState(false);
  const aiOn = useClaudeOn('negotiation');
  const endRef = useRef<HTMLDivElement>(null);
  const ranges = useMemo(() => askRanges(neg), [neg.offerId, neg.round, neg.current]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = neg.status === 'open';
  const agreed = neg.status === 'agreed';
  const collapsed = neg.status === 'collapsed';
  const finalRound = open && neg.round >= neg.maxRounds;

  // after every club move the ask resets to the club's latest proposal
  useEffect(() => { setAsk({ ...neg.current }); }, [neg.offerId, neg.round, neg.lines.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [neg.lines.length, busy]);

  const set = <K extends keyof ContractTerms>(k: K, v: ContractTerms[K]) => setAsk((a) => ({ ...a, [k]: v }));
  const greed = safe(() => greedOf(neg, ask), 0);
  const level = greedLevel(greed);
  const cur = neg.current;

  const send = async () => {
    if (busy || !open) return;
    setBusy(true);
    try {
      await game.negotiate(ask, message.trim() || null);
      setMessage('');
    } catch {
      toast(t('life.transfers.neg.error'), 'danger', 'siren');
    } finally {
      setBusy(false);
    }
  };
  const accept = () => {
    try { game.acceptNegotiatedTerms(); } catch { toast(t('life.transfers.failed'), 'danger', 'siren'); }
  };
  const leave = () => {
    setWalk(false);
    try { game.walkAway(); } catch { toast(t('life.transfers.failed'), 'danger', 'siren'); }
  };

  if (!club) return null;
  const bubbleTone: Record<string, string> = {
    club: 'self-start bg-panel-2 border border-line rounded-bl-md',
    agent: 'self-start bg-gold/10 border border-gold/30 rounded-bl-md',
    player: 'self-end bg-accent text-bg rounded-br-md',
    system: 'self-center bg-white/5 text-ink-dim text-xs text-center',
  };

  return (
    <Card glow={agreed ? 'gold' : collapsed ? 'danger' : 'accent'} className="relative overflow-hidden">
      <div className="flex items-center gap-3 flex-wrap">
        <Crest kit={club.kit} label={club.shortName} size={46} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-accent font-bold"><Icon name="handshake" size={13} />{t('life.transfers.neg.title')}</div>
          <div className="font-display text-3xl leading-none truncate mt-0.5">{club.name}</div>
        </div>
        <div className="w-full sm:w-52 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-ink-dim"><span>{t('life.transfers.neg.round', { n: Math.min(neg.round + (open ? 1 : 0), neg.maxRounds), max: neg.maxRounds })}</span><span className="text-ink-mute">{t('life.transfers.neg.patience')}</span></div>
          <Meter value={neg.patience} tone="auto" showValue={false} />
        </div>
      </div>

      {agreed && <Banner tone="gold" icon="verified" text={t('life.transfers.neg.agreed')} />}
      {collapsed && <Banner tone="danger" icon="siren" text={t('life.transfers.neg.collapsed')} />}
      {finalRound && <Banner tone="gold" icon="timer" text={t('life.transfers.neg.lastRound')} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
        <div>
          {open ? (
            <>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-ink-dim">{t('life.transfers.neg.yourAsk')}</div>
                <button className="text-[11px] text-ink-mute hover:text-ink cursor-pointer" onClick={() => setAsk({ ...cur })} disabled={sameTerms(ask, cur)}>{t('life.transfers.neg.reset')}</button>
              </div>
              <TermRow icon="coin" label={t('life.transfers.wage')} club={money(cur.wage, lang)}>
                <MoneyControl value={ask.wage} onChange={(v) => set('wage', v)} min={ranges.wage[0]} max={ranges.wage[1]} club={cur.wage} lang={lang} />
              </TermRow>
              <TermRow icon="calendar" label={t('life.transfers.years')} club={t('life.transfers.yearsValue', { n: cur.years })}>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map((y) => (
                    <button key={y} onClick={() => set('years', y)} className={clsx('h-9 rounded-lg text-sm font-semibold cursor-pointer transition', ask.years === y ? 'bg-accent text-bg' : 'bg-white/6 text-ink-dim hover:bg-white/12')}>{y}</button>
                  ))}
                </div>
              </TermRow>
              <TermRow icon="star" label={t('life.transfers.role')} club={t(`common.role.${cur.role}`)}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {ROLE_ORDER.map((r: SquadRole) => (
                    <button key={r} onClick={() => set('role', r)} className={clsx('h-9 rounded-lg text-xs font-semibold cursor-pointer transition px-1 truncate', ask.role === r ? 'bg-accent text-bg' : 'bg-white/6 text-ink-dim hover:bg-white/12')}>{t(`common.role.${r}`)}</button>
                  ))}
                </div>
              </TermRow>
              <TermRow icon="lock" label={t('life.transfers.clause')} club={cur.releaseClause ? money(cur.releaseClause, lang) : t('life.transfers.noClause')}>
                <div className="flex items-center gap-3">
                  <Toggle on={ask.releaseClause !== null} onChange={(v) => set('releaseClause', v ? Math.max(ranges.releaseClause[0], cur.releaseClause ?? Math.round((ranges.releaseClause[0] + ranges.releaseClause[1]) / 3)) : null)} label={t('life.transfers.neg.withClause')} />
                  <div className="flex-1 min-w-0">
                    {ask.releaseClause !== null
                      ? <MoneyControl value={ask.releaseClause} onChange={(v) => set('releaseClause', v)} min={ranges.releaseClause[0]} max={ranges.releaseClause[1]} club={cur.releaseClause ?? 0} lang={lang} />
                      : <span className="text-sm text-ink-mute">{t('life.transfers.neg.noClause')}</span>}
                  </div>
                </div>
              </TermRow>
              <TermRow icon="gift" label={t('life.transfers.signing')} club={money(cur.signingBonus, lang)}>
                <MoneyControl value={ask.signingBonus} onChange={(v) => set('signingBonus', v)} min={ranges.signingBonus[0]} max={ranges.signingBonus[1]} club={cur.signingBonus} lang={lang} />
              </TermRow>
              <TermRow icon="target" label={t('life.transfers.goalBonus')} club={money(cur.goalBonus, lang)}>
                <MoneyControl value={ask.goalBonus} onChange={(v) => set('goalBonus', v)} min={ranges.goalBonus[0]} max={ranges.goalBonus[1]} club={cur.goalBonus} lang={lang} />
              </TermRow>

              <div className="flex items-center justify-between mt-3 text-xs">
                <span className="text-ink-dim">{t('life.transfers.neg.greed')}</span>
                <span className="flex items-center gap-2">
                  <span className="flex gap-1">{[0, 1, 2].map((n) => <span key={n} className={clsx('w-6 h-1.5 rounded-full', n <= ['low', 'mid', 'high'].indexOf(level) ? (level === 'high' ? 'bg-danger' : level === 'mid' ? 'bg-gold' : 'bg-accent') : 'bg-white/10')} />)}</span>
                  <b className={level === 'high' ? 'text-danger' : level === 'mid' ? 'text-gold' : 'text-accent'}>{t(`life.transfers.neg.greed.${level}`)}</b>
                </span>
              </div>

              <div className="mt-4">
                <div className="flex items-center gap-2 mb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-ink-dim">{t('life.transfers.neg.message')}{aiOn && <AIBadge />}</div>
                <textarea
                  value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={500} disabled={busy}
                  placeholder={t('life.transfers.neg.messagePh')}
                  className="w-full resize-none rounded-xl bg-white/5 border border-line focus:border-accent/50 outline-none px-3 py-2.5 text-sm placeholder:text-ink-mute"
                />
                {aiOn && <p className="text-[11px] text-violet mt-1">{t('life.transfers.neg.messageAi')}</p>}
              </div>
            </>
          ) : (
            <TermsSummary terms={cur} lang={lang} />
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            {open && <Button variant="primary" icon="message" loading={busy} onClick={send}>{t('life.transfers.neg.send')}</Button>}
            {(open || agreed) && <Button variant={agreed ? 'gold' : 'secondary'} icon="handshake" disabled={busy} onClick={accept}>{t(agreed ? 'life.transfers.neg.sign' : 'life.transfers.neg.acceptCurrent')}</Button>}
            {collapsed ? <Button variant="secondary" onClick={leave}>{t('life.transfers.neg.leave')}</Button> : <Button variant="ghost" disabled={busy} onClick={() => setWalk(true)}>{t('life.transfers.neg.walk')}</Button>}
          </div>
        </div>

        <div className="flex flex-col min-h-[260px] lg:max-h-[640px]">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-ink-dim mb-2">{t('life.transfers.neg.conversation')}</div>
          <div className="flex-1 overflow-y-auto rounded-2xl bg-black/20 border border-line p-3 flex flex-col gap-2.5 max-h-[520px]">
            {neg.lines.map((l, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={clsx('max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-snug', bubbleTone[l.from])}>
                {l.from !== 'system' && <div className={clsx('text-[10px] font-bold uppercase tracking-wider mb-1', l.from === 'player' ? 'text-bg/70' : l.from === 'agent' ? 'text-gold' : 'text-accent')}>{t(`life.transfers.neg.who.${l.from}`)}</div>}
                <div className="whitespace-pre-wrap">{l.text}</div>
                {l.terms && l.from !== 'system' && (
                  <div className={clsx('flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px] tabular-nums', l.from === 'player' ? 'text-bg/75' : 'text-ink-mute')}>
                    <span>{money(l.terms.wage, lang)}{t('common.perWeek')}</span><span>{t('life.transfers.yearsValue', { n: l.terms.years })}</span><span>{t(`common.role.${l.terms.role}`)}</span>
                  </div>
                )}
              </motion.div>
            ))}
            <AnimatePresence>
              {busy && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="self-start flex items-center gap-2">
                  <div className="bg-panel-2 border border-line rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
                    {[0, 1, 2].map((d) => <motion.span key={d} className="w-1.5 h-1.5 rounded-full bg-ink-dim" animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 0.9, delay: d * 0.15 }} />)}
                  </div>
                  <span className="text-[11px] text-ink-mute">{t('life.transfers.neg.typing')}</span>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={endRef} />
          </div>
        </div>
      </div>

      <Modal open={walk} onClose={() => setWalk(false)} size="sm" title={t('life.transfers.neg.walkConfirm')}
        footer={<><Button variant="ghost" onClick={() => setWalk(false)}>{t('common.cancel')}</Button><Button variant="danger" onClick={leave}>{t('life.transfers.neg.walk')}</Button></>}>
        <p className="text-sm text-ink-dim">{t('life.transfers.neg.walkText')}</p>
      </Modal>
    </Card>
  );
}

function Banner({ tone, icon, text }: { tone: 'gold' | 'danger'; icon: string; text: string }) {
  return (
    <div className={clsx('mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold', tone === 'gold' ? 'bg-gold/12 text-gold' : 'bg-danger/12 text-danger')}>
      <Icon name={icon} size={16} />{text}
    </div>
  );
}

function TermsSummary({ terms, lang }: { terms: ContractTerms; lang: Lang }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Term label={t('life.transfers.wage')} value={money(terms.wage, lang)} />
      <Term label={t('life.transfers.years')} value={t('life.transfers.yearsValue', { n: terms.years })} />
      <Term label={t('life.transfers.role')} value={t(`common.role.${terms.role}`)} />
      <Term label={t('life.transfers.clause')} value={terms.releaseClause ? money(terms.releaseClause, lang) : t('life.transfers.noClause')} />
      <Term label={t('life.transfers.signing')} value={money(terms.signingBonus, lang)} />
      <Term label={t('life.transfers.goalBonus')} value={money(terms.goalBonus, lang)} />
    </div>
  );
}

export function OfferEmpty() {
  return (
    <Card className="text-center py-8">
      <Icon name="handshake" size={28} className="mx-auto text-ink-mute" />
      <p className="text-sm text-ink-dim mt-3 max-w-sm mx-auto">{t('life.transfers.offersEmpty')}</p>
    </Card>
  );
}

export function WindowBadge({ open, className }: { open: boolean; className?: string }) {
  return <Badge tone={open ? 'accent' : 'neutral'} className={clsx('whitespace-nowrap', className)}><Icon name={open ? 'verified' : 'lock'} size={11} />{t(open ? 'life.transfers.windowOpen' : 'life.transfers.windowClosed')}</Badge>;
}

