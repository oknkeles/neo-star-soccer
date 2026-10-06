/** Route 'lifestyle' — weekly activities, the shop and the finances. */
import { useState } from 'react';
import { t } from '../../core/i18n';
import { ScreenHeader, Tabs } from '../components/kit';
import { ActivitiesTab, FinancesTab, ShopTab } from './life/lifestyle';
import { Chip, NoCareer, Page, useLife } from './life/shared';
import { money } from './life/logic';

export default function LifestyleScreen({ params }: { params: Record<string, string> }) {
  const life = useLife();
  const [tab, setTab] = useState(['activities', 'shop', 'finances'].includes(params.tab) ? params.tab : 'activities');
  if (!life) return <NoCareer />;
  const { state, career } = life;
  return (
    <Page>
      <ScreenHeader
        icon="sparkles" backTo="hub" title={t('life.lifestyle.title')}
        subtitle={t('life.lifestyle.subtitle', { week: state.week + 1, n: career.actionsLeft })}
        right={<Chip icon="coin" tone="gold" className="!text-sm !px-3 !py-1.5">{money(career.money, life.lang)}</Chip>}
      />
      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { id: 'activities', label: t('life.lifestyle.tab.activities'), icon: 'zap' },
          { id: 'shop', label: t('life.lifestyle.tab.shop'), icon: 'shopping' },
          { id: 'finances', label: t('life.lifestyle.tab.finances'), icon: 'wallet' },
        ]}
      />
      {tab === 'activities' && <ActivitiesTab life={life} />}
      {tab === 'shop' && <ShopTab life={life} />}
      {tab === 'finances' && <FinancesTab life={life} />}
    </Page>
  );
}
