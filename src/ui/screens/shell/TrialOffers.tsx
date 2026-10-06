/** Club offer cards (trial offers for a new career; also the Hub's "choose a club" chooser). */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, MapPin, Wallet } from 'lucide-react';
import type { GameState, TransferOffer } from '../../../core/types';
import { t } from '../../../core/i18n';
import { game } from '../../../game/api';
import { Badge, Button, Crest, Stars, clsx, toast } from '../../components/kit';
import { errText, leagueNameOf, money } from './helpers';

export function openClubOffers(state: GameState): TransferOffer[] {
  const pending = state.offers.filter((o) => o.status === 'pending' || o.status === 'negotiating');
  const trials = pending.filter((o) => o.kind === 'trial');
  return trials.length ? trials : pending;
}

export default function TrialOffers({ state, onAccepted }: { state: GameState; onAccepted?: (clubName: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const offers = openClubOffers(state);

  const accept = (o: TransferOffer) => {
    setBusy(o.id);
    try {
      game.respondOffer(o.id, 'accept');
      onAccepted?.(state.world.clubs[o.fromClubId]?.name ?? '');
    } catch (e) {
      toast(errText(e), 'danger', 'shield_alert');
      setBusy(null);
    }
  };

  if (offers.length === 0) return <p className="text-sm text-ink-dim py-4 text-center">{t('shell.hub.noOffers')}</p>;

  return (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
      {offers.map((o, i) => {
        const club = state.world.clubs[o.fromClubId];
        if (!club) return null;
        const mgr = state.world.managers[club.managerId];
        return (
          <motion.div
            key={o.id}
            initial={{ opacity: 0, y: 30, rotateX: 18 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: 0.15 + i * 0.14, type: 'spring', stiffness: 150, damping: 17 }}
            className="relative overflow-hidden rounded-3xl border border-line p-5 flex flex-col"
            style={{ background: `radial-gradient(120% 70% at 50% 0%, ${club.kit.primary}38, transparent 65%), linear-gradient(180deg, #112219, #0a130e)` }}
          >
            <div className="flex items-center gap-3">
              <Crest kit={club.kit} label={club.shortName} size={58} />
              <div className="min-w-0">
                <div className="font-display text-[26px] sm:text-[28px] leading-[0.95] line-clamp-2">{club.name}</div>
                <div className="text-xs text-ink-dim mt-1 flex items-center gap-1 truncate"><MapPin size={11} />{club.city} · {leagueNameOf(state, club)}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Stars value={Math.max(0.5, Math.min(5, Math.round(club.reputation / 10) / 2))} size={15} />
              <span className="text-[11px] text-ink-mute uppercase tracking-wider font-bold">{t('shell.nc.offers.rep')}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/5 py-2"><div className="font-display text-lg text-gold leading-none flex items-center justify-center gap-1 whitespace-nowrap"><Wallet size={12} className="shrink-0" />{money(o.terms.wage)}</div><div className="text-[10px] text-ink-mute mt-1">{t('common.perWeek')}</div></div>
              <div className="rounded-xl bg-white/5 py-2"><div className="font-display text-xl leading-none flex items-center justify-center gap-1"><Calendar size={13} />{o.terms.years}</div><div className="text-[10px] text-ink-mute mt-1">{t('common.years')}</div></div>
              <div className="rounded-xl bg-white/5 py-2 px-1"><div className="text-[13px] font-bold leading-[1.1] text-accent min-h-[1.1em]">{t(`common.role.${o.terms.role}`)}</div><div className="text-[10px] text-ink-mute mt-1">{t('shell.nc.offers.role')}</div></div>
            </div>
            {o.note && <p className="mt-3.5 text-sm text-ink/85 leading-relaxed italic">“{o.note}”</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge>{club.stadium.name}</Badge>
              {mgr && <Badge>{mgr.firstName[0]}. {mgr.lastName}</Badge>}
              {o.kind !== 'trial' && <Badge tone="gold">{t(`shell.offerKind.${o.kind}`)}</Badge>}
            </div>
            <div className="flex-1" />
            <Button variant="primary" size="lg" block className={clsx('mt-5')} loading={busy === o.id} disabled={busy !== null} onClick={() => accept(o)}>
              {t('shell.nc.offers.accept')}
            </Button>
          </motion.div>
        );
      })}
    </div>
  );
}
