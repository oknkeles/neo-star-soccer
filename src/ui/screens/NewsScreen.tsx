/** Route 'news' — newspaper front page with an article reader. */
import { t } from '../../core/i18n';
import { ScreenHeader } from '../components/kit';
import { NewsBody } from './life/news';
import { NoCareer, Page, useLife } from './life/shared';

export default function NewsScreen(_props: { params: Record<string, string> }) {
  const life = useLife();
  if (!life) return <NoCareer />;
  return (
    <Page>
      <ScreenHeader icon="newspaper" backTo="hub" title={t('life.news.title')} subtitle={t('life.news.subtitle')} />
      <NewsBody life={life} />
    </Page>
  );
}
