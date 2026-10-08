/** Route 'hub' — "Kariyer Merkezi": one calm column. Match + big action, league chip, player card, 3-4 shortcuts, 3 inbox rows. */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { t } from '../../core/i18n';
import { audio } from '../../audio/api';
import { GameBlockedError, game, useGame } from '../../game/api';
import { navigate } from '../router';
import { Button, EmptyState, toast } from '../components/kit';
import Hero from './shell/hub/Hero';
import { InboxPreview, LeagueChip } from './shell/hub/FeedPanels';
import { PlayerCard, QuickActions } from './shell/hub/PlayerPanels';
import TrialOffers from './shell/TrialOffers';
import { errText, useAgenda, useLang } from './shell/helpers';
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

  return (
    <div className="max-w-3xl mx-auto">
      <div className="grid grid-cols-1 gap-5 lg:gap-6">
        {agenda.needsClub ? (
          <div className="rounded-3xl border border-gold/35 bg-gold/6 p-4 sm:p-6">
            <h2 className="font-display text-3xl sm:text-4xl leading-none text-gold">{t('shell.hub.needsClub')}</h2>
            <p className="text-ink-dim text-sm mt-1.5 mb-5">{t('shell.hub.needsClubSub')}</p>
            <TrialOffers state={state} />
          </div>
        ) : (
          <Hero state={state} agenda={agenda} advancing={advancing} onAdvance={advance} onPlay={(fixtureId) => navigate('match', { fixtureId })} />
        )}
        {!agenda.needsClub && <LeagueChip state={state} />}
        <PlayerCard state={state} />
        <QuickActions state={state} agenda={agenda} />
        <InboxPreview state={state} agenda={agenda} />
      </div>

      <AnimatePresence>{advancing && <AdvancingVeil />}</AnimatePresence>
    </div>
  );
}
