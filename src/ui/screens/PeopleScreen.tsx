/** Route 'people' — the small circle (manager, agent, parents, partner) and the messaging drawer. */
import { useEffect, useState } from 'react';
import { t } from '../../core/i18n';
import { ScreenHeader } from '../components/kit';
import { buildCircle, chatEntryFor, type CircleEntry } from './life/circle';
import { ChatDrawer, CircleSection } from './life/people';
import { NoCareer, Page, useLife } from './life/shared';

export default function PeopleScreen({ params }: { params: Record<string, string> }) {
  const life = useLife();
  const [chat, setChat] = useState<CircleEntry | null>(null);
  const state = life?.state ?? null;
  // `params.chat` (a persona kind) opens that conversation straight away.
  useEffect(() => {
    if (!state || !params.chat) return;
    const circle = buildCircle(state);
    const hit = circle.find((e) => e.persona === params.chat);
    if (hit) setChat(chatEntryFor(circle, hit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.chat]);
  if (!life) return <NoCareer />;
  return (
    <Page>
      <ScreenHeader icon="users" backTo="hub" title={t('life.people.title')} subtitle={t('life.people.subtitle')} />
      <CircleSection life={life} onChat={(e) => setChat(chatEntryFor(buildCircle(life.state), e))} />
      <ChatDrawer life={life} entry={chat} onClose={() => setChat(null)} />
    </Page>
  );
}
