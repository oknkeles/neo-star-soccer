/** Route 'career' — stats, radar, development curve, seasons, trophies and match log. */
import { useState } from 'react';
import { t } from '../../core/i18n';
import { ScreenHeader, Tabs } from '../components/kit';
import { AwardsList, GoalsCard, HistoryChart, MatchLog, PlayerHero, RadarChart, SeasonTable, StatGrid, TraitsCard, TrophyCabinet } from './life/career';
import { NoCareer, Page, useLife } from './life/shared';

export default function CareerScreen({ params }: { params: Record<string, string> }) {
  const life = useLife();
  const [tab, setTab] = useState(['overview', 'seasons', 'trophies', 'matches'].includes(params.tab) ? params.tab : 'overview');
  if (!life) return <NoCareer />;
  return (
    <Page>
      <ScreenHeader icon="chart" backTo="hub" title={t('life.career.title')} subtitle={t('life.career.subtitle')} />
      <PlayerHero life={life} />
      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { id: 'overview', label: t('life.career.tab.overview'), icon: 'chart' },
          { id: 'seasons', label: t('life.career.tab.seasons'), icon: 'calendar' },
          { id: 'trophies', label: t('life.career.tab.trophies'), icon: 'trophy' },
          { id: 'matches', label: t('life.career.tab.matches'), icon: 'footprints' },
        ]}
      />
      {tab === 'overview' && (
        <div className="space-y-5">
          <StatGrid life={life} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RadarChart life={life} />
            <HistoryChart life={life} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GoalsCard life={life} />
            <TraitsCard life={life} />
          </div>
        </div>
      )}
      {tab === 'seasons' && <div className="space-y-4"><HistoryChart life={life} /><SeasonTable life={life} /></div>}
      {tab === 'trophies' && <div className="space-y-4"><TrophyCabinet life={life} /><AwardsList life={life} /></div>}
      {tab === 'matches' && <MatchLog life={life} />}
    </Page>
  );
}
