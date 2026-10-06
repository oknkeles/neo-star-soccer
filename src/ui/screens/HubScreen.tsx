/** Route 'hub' — "Kariyer Merkezi". Owner: ui-shell agent. */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { t } from '../../core/i18n';
import { audio } from '../../audio/api';
import { GameBlockedError, game, useGame } from '../../game/api';
import { navigate } from '../router';
import { Button, EmptyState, ScreenHeader, toast } from '../components/kit';
import Hero from './shell/hub/Hero';
import { AiChip, EventsBanner, InboxPreview, MiniTable, NewsCarousel, SocialPreview } from './shell/hub/FeedPanels';
import { GoalsPanel, PlayerCard, QuickActions, RelationsPanel, SeasonStrip } from './shell/hub/PlayerPanels';
import TrialOffers from './shell/TrialOffers';
import { errText, leagueNameOf, useAgenda, useLang, userView } from './shell/helpers';
import './shell/strings';

function AdvancingVeil() {
  return (
    <motion.div className="fixed inset-0 z-[55] grid place-items-center bg-bg/80 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="text-center">
        <motion.div className="mx-auto size-16 rounded-full bg-white border-4 border-bg shadow-[0_0_40px_rgba(184,255,60,0.5)]" animate={{ y: [0, -46, 0], scaleY: [1, 1.05, 0.85, 1] }} transition={{ duration: 0.8, repeat: Infinity, ease: 'easeOut' }} />
        <div className="mx-auto mt-2 h-2 w-16 rounded-full bg-black/50 blur-[2px]" />
        <div className="font-display text-3xl mt-4">{t('shell.hub.advancing')}</div>
      </div>
    </motion.div>
  );
}

export default function HubScreen() {
  useLang();
  const { state } = useGame();
  const agenda = useAgenda();
  const [advancing, setAdvancing] = useState(false);

  if (!state || !agenda) {
    return <EmptyState icon="home" title={t('shell.hub.noCareer')} text={t('shell.hub.noCareerSub')} action={<Button variant="primary" onClick={() => navigate('title')}>{t('shell.hub.toTitle')}</Button>} />;
  }

  const v = userView(state);
  const advance = async () => {
    setAdvancing(true);
    try {
      audio.play('whistle_short', 0.5);
      await game.advanceWeek();
    } catch (e) {
      toast(e instanceof GameBlockedError ? e.blockers[0] ?? errText(e) : `${t('shell.hub.advanceFail')}: ${errText(e)}`, 'danger', 'shield_alert');
    } finally {
      setAdvancing(false);
    }
  };
  const press = () => navigate('press', agenda.pressAvailable ? { occasion: agenda.pressAvailable } : {});

  return (
    <div>
      <ScreenHeader
        title={t('shell.hub.title')}
        subtitle={v?.club ? `${v.club.name} · ${leagueNameOf(state, v.club)}` : t('shell.status.noClub')}
        icon="home"
        right={<div className="hidden sm:block"><AiChip /></div>}
      />

      <div className="sm:hidden -mt-2 mb-4"><AiChip /></div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-5 items-start">
        <div className="grid grid-cols-1 gap-4 min-w-0 @container">
          <EventsBanner agenda={agenda} />
          {agenda.needsClub ? (
            <div className="rounded-3xl border border-gold/35 bg-gold/6 p-4 sm:p-6">
              <h2 className="font-display text-3xl sm:text-4xl leading-none text-gold">{t('shell.hub.needsClub')}</h2>
              <p className="text-ink-dim text-sm mt-1.5 mb-5">{t('shell.hub.needsClubSub')}</p>
              <TrialOffers state={state} />
            </div>
          ) : (
            <Hero state={state} agenda={agenda} advancing={advancing} onAdvance={advance} onPlay={(fixtureId) => navigate('match', { fixtureId })} onPress={press} />
          )}
          <div className="xl:hidden grid grid-cols-1 gap-4 md:grid-cols-2 items-start"><PlayerCard state={state} /><QuickActions state={state} agenda={agenda} /></div>
          <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
            <InboxPreview state={state} />
            <MiniTable state={state} />
          </div>
          <SeasonStrip state={state} />
          <NewsCarousel state={state} />
          <SocialPreview state={state} />
        </div>

        <div className="grid grid-cols-1 gap-4 min-w-0 md:grid-cols-2 xl:grid-cols-1 xl:sticky xl:top-20 items-start">
          <div className="hidden xl:grid gap-4"><PlayerCard state={state} /><QuickActions state={state} agenda={agenda} /></div>
          <RelationsPanel state={state} />
          <GoalsPanel state={state} />
        </div>
      </div>

      <AnimatePresence>{advancing && <AdvancingVeil />}</AnimatePresence>
    </div>
  );
}
