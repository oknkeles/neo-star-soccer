/** Route 'people' — relationships, your circle and the messaging drawer. */
import { useEffect, useState } from 'react';
import { t } from '../../core/i18n';
import { ScreenHeader } from '../components/kit';
import { buildCircle, type CircleEntry } from './life/circle';
import { ChatDrawer, CircleSection, RelationshipGrid } from './life/people';
import { NoCareer, Page, useLife } from './life/shared';

export default function PeopleScreen({ params }: { params: Record<string, string> }) {
  const life = useLife();
  const [chat, setChat] = useState<CircleEntry | null>(null);
  const state = life?.state ?? null;
  // `params.chat` (a persona kind) opens that conversation straight away.
  useEffect(() => {
    if (!state || !params.chat) return;
    const hit = buildCircle(state).find((e) => e.persona === params.chat);
    if (hit) setChat(hit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.chat]);
  if (!life) return <NoCareer />;
  return (
    <Page>
      <ScreenHeader icon="users" backTo="hub" title={t('life.people.title')} subtitle={t('life.people.subtitle')} />
      <RelationshipGrid life={life} />
      <CircleSection life={life} onChat={setChat} />
      <ChatDrawer life={life} entry={chat} onClose={() => setChat(null)} />
    </Page>
  );
}
