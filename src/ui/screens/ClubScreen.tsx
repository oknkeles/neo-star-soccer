/** Route 'club' — your club (or any club via params.club): hero, manager, squad, derbies and honours. */
import { t } from '../../core/i18n';
import { Button, EmptyState, ScreenHeader } from '../components/kit';
import { navigate } from '../router';
import { ClubHero, DerbyRivals, HonoursCard, ManagerCard, SquadTable } from './life/club';
import { NoCareer, Page, useLife } from './life/shared';

export default function ClubScreen({ params }: { params: Record<string, string> }) {
  const life = useLife();
  if (!life) return <NoCareer />;
  const { state, player } = life;
  const ownId = player.clubId;
  const club = state.world.clubs[params.club ?? ownId ?? ''] ?? null;
  const mine = !!club && club.id === ownId;
  if (!club) {
    return (
      <Page>
        <ScreenHeader icon="shield" backTo="hub" title={t('life.club.title')} subtitle={t('life.club.subtitle')} />
        <EmptyState
          icon="shield" title={t('life.club.noClub.title')} text={t('life.club.noClub.text')}
          action={<Button variant="primary" icon="handshake" onClick={() => navigate('transfers')}>{t('life.club.noClub.cta')}</Button>}
        />
      </Page>
    );
  }
  return (
    <Page>
      <ScreenHeader
        icon="shield" backTo={mine ? 'hub' : 'back'} title={mine ? t('life.club.title') : club.shortName}
        subtitle={mine ? t('life.club.subtitle') : t('life.club.viewing')}
        right={!mine && ownId ? <Button size="sm" variant="secondary" onClick={() => navigate('club')}>{t('life.club.backToMine')}</Button> : undefined}
      />
      <ClubHero life={life} club={club} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ManagerCard life={life} club={club} mine={mine} />
        <DerbyRivals life={life} club={club} />
        <HonoursCard life={life} club={club} />
      </div>
      <SquadTable life={life} club={club} />
    </Page>
  );
}
