/** Route 'social' — the social feed with a compose box. */
import { t } from '../../core/i18n';
import { ScreenHeader } from '../components/kit';
import { NoCareer, Page, useLife } from './life/shared';
import { ComposeBox, Feed, SocialHeader } from './life/social';

export default function SocialScreen(_props: { params: Record<string, string> }) {
  const life = useLife();
  if (!life) return <NoCareer />;
  return (
    <Page>
      <ScreenHeader icon="message" backTo="hub" title={t('life.social.title')} subtitle={t('life.social.subtitle')} />
      <SocialHeader life={life} />
      {!life.career.retired && <ComposeBox life={life} />}
      <Feed life={life} />
    </Page>
  );
}
