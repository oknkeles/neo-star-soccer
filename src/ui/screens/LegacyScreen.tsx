/** Route 'legacy' — the career story: hall-of-fame tier, biography, timeline, records and trophies. */
import type { ReactNode } from 'react';
import { t } from '../../core/i18n';
import { ScreenHeader } from '../components/kit';
import { AwardsList, GoalsCard, TrophyCabinet } from './life/career';
import { BiographyCard, CareerCard, LegacyActions, LegacyHero, RecordsGrid, RetirePanel, RivalDuel, Timeline } from './life/legacy';
import { NoCareer, Page, useLife } from './life/shared';

/** Legacy renders full-bleed (no navigation layout), so it brings its own page frame. */
function Frame({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-5xl mx-auto px-4 sm:px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">{children}</div>;
}

export default function LegacyScreen(_props: { params: Record<string, string> }) {
  const life = useLife();
  if (!life) return <Frame><NoCareer /></Frame>;
  const retired = life.career.retired;
  return (
    <Frame>
      <Page>
        <ScreenHeader
          icon="crown" backTo={retired ? undefined : 'hub'} title={t('life.legacy.title')}
          subtitle={t(retired ? 'life.legacy.subtitleDone' : 'life.legacy.subtitleLive')}
        />
        <LegacyHero life={life} />
        <RetirePanel life={life} />
        <BiographyCard life={life} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <div className="space-y-5">
            <CareerCard life={life} />
            <RecordsGrid life={life} />
            <RivalDuel life={life} />
          </div>
          <Timeline life={life} />
        </div>
        <TrophyCabinet life={life} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <AwardsList life={life} />
          <GoalsCard life={life} />
        </div>
        <LegacyActions life={life} />
      </Page>
    </Frame>
  );
}
