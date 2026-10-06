/** Route 'competitions' — your competitions plus a browser for all 16 leagues. */
import { useState } from 'react';
import { t } from '../../core/i18n';
import { EmptyState, ScreenHeader, Tabs } from '../components/kit';
import { CompetitionView, LeagueBrowser } from './life/competitions';
import { userCompetitions } from './life/logic';
import { NoCareer, Page, useLife } from './life/shared';

export default function CompetitionsScreen({ params }: { params: Record<string, string> }) {
  const life = useLife();
  const [tab, setTab] = useState<string | null>(params.comp ?? null);
  if (!life) return <NoCareer />;
  const mine = userCompetitions(life.state);
  const wanted = tab && (tab === 'browse' || mine.some((c) => c.id === tab)) ? tab : null;
  const active = wanted ?? mine[0]?.id ?? 'browse';
  const comp = mine.find((c) => c.id === active);
  const kindIcon = { league: 'trophy', cup: 'medal', continental: 'crown', international: 'globe' } as const;
  return (
    <Page>
      <ScreenHeader icon="trophy" backTo="hub" title={t('life.comp.title')} subtitle={t('life.comp.subtitle')} />
      <Tabs
        value={active} onChange={setTab}
        tabs={[
          ...mine.map((c) => ({ id: c.id, label: c.shortName, icon: kindIcon[c.kind] })),
          { id: 'browse', label: t('life.comp.browse'), icon: 'globe' },
        ]}
      />
      {active === 'browse' ? <LeagueBrowser life={life} /> : comp ? <CompetitionView key={comp.id} life={life} comp={comp} /> : (
        <EmptyState icon="trophy" title={t('life.comp.noCompetitions')} />
      )}
    </Page>
  );
}
