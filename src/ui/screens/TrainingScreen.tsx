/** Route 'training' — weekly focus, attributes with xp progress, drills. */
import { t } from '../../core/i18n';
import { EmptyState, ScreenHeader } from '../components/kit';
import { NoCareer, Page, useLife } from './life/shared';
import { AttributePanel, DrillsSection, FocusPicker, ProgressionStrip, TrainingHero } from './life/training';

export default function TrainingScreen(_props: { params: Record<string, string> }) {
  const life = useLife();
  if (!life) return <NoCareer />;
  const { state, player } = life;
  const club = player.clubId ? state.world.clubs[player.clubId]?.name : t('life.noClub');
  if (life.career.retired) return <EmptyState icon="dumbbell" title={t('life.training.title')} text={t('life.training.retired')} />;
  return (
    <Page>
      <ScreenHeader icon="dumbbell" title={t('life.training.title')} subtitle={t('life.training.subtitle', { week: state.week + 1, club: club ?? '' })} backTo="hub" />
      <TrainingHero life={life} />
      <FocusPicker life={life} />
      <ProgressionStrip life={life} />
      <AttributePanel life={life} />
      <DrillsSection life={life} />
    </Page>
  );
}
