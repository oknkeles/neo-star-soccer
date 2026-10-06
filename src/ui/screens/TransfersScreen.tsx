/** Route 'transfers' — contract, transfer list, offers and the negotiation room. */
import { useState } from 'react';
import { t } from '../../core/i18n';
import { weekInfo } from '../../competition/api';
import { game } from '../../game/api';
import { Button, ScreenHeader, toast } from '../components/kit';
import { NoCareer, Page, SectionLabel, safe, useLife } from './life/shared';
import { ContractCard, NegotiationRoom, OfferCard, OfferEmpty, WindowBadge, isLive } from './life/transfers';

export default function TransfersScreen({ params }: { params: Record<string, string> }) {
  const life = useLife();
  const [history, setHistory] = useState(false);
  if (!life) return <NoCareer />;
  const { state } = life;
  const neg = state.negotiation;
  const windowOpen = safe(() => weekInfo(state.season, state.week).transferWindow, false);
  const live = state.offers.filter(isLive).sort((a, b) => a.expiresWeek - b.expiresWeek || b.fee - a.fee);
  const past = state.offers.filter((o) => !isLive(o)).slice(-8).reverse();

  const open = (id: string) => {
    game.openNegotiation(id).catch(() => toast(t('life.transfers.failed'), 'danger', 'siren'));
  };

  return (
    <Page>
      <ScreenHeader icon="handshake" backTo="hub" title={t('life.transfers.title')} subtitle={t('life.transfers.subtitle')} right={<div className="hidden sm:block"><WindowBadge open={windowOpen} /></div>} />
      <div className="sm:hidden -mt-3"><WindowBadge open={windowOpen} /></div>
      {neg && <NegotiationRoom key={neg.offerId} life={life} neg={neg} />}
      <ContractCard life={life} />
      <section>
        <SectionLabel icon="mail" right={live.length > 0 && <span className="text-xs text-ink-dim">{live.length}</span>}>{t('life.transfers.offers')}</SectionLabel>
        {live.length === 0 ? <OfferEmpty /> : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {live.map((o, i) => (
              <OfferCard key={o.id} life={life} offer={o} i={i} focused={params.offer === o.id} negotiating={neg?.offerId === o.id && neg.status !== 'collapsed'} onNegotiate={(x) => open(x.id)} />
            ))}
          </div>
        )}
      </section>
      {past.length > 0 && (
        <section>
          <SectionLabel icon="calendar" right={<Button size="sm" variant="ghost" onClick={() => setHistory((v) => !v)}>{history ? t('life.transfers.historyHide') : t('life.transfers.historyShow')}</Button>}>{t('life.transfers.history')}</SectionLabel>
          {history && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {past.map((o, i) => <OfferCard key={o.id} life={life} offer={o} i={i} focused={false} negotiating={false} onNegotiate={() => undefined} />)}
            </div>
          )}
        </section>
      )}
    </Page>
  );
}
