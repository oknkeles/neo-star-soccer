import { it } from 'vitest';
import { GameController } from '../../game/controller';
import { memoryStorage } from '../../game/storage';
import { overall } from '../../core/ratings';
import { setLang } from '../../core/i18n';

it('integration probe 3', async () => {
  setLang('en');
  const g = new GameController({ storage: memoryStorage(), autosaveMs: 0 });
  await g.newCareer({
    firstName: 'Deniz', lastName: 'Yıldız', nation: 'TUR', position: 'CM', foot: 'R',
    appearance: { skin: 2, hairStyle: 2, hairColor: '#222', beard: 0, boots: '#fff', height: 180 }, trait: 'glass_bones', seed: 99,
  }, 0);
  let s = g.state!;
  g.respondOffer(s.offers.filter((o) => o.kind === 'trial')[0].id, 'accept');
  const notesSeen = new Set<string>();
  for (let w = 0; w < 52 * 5; w++) {
    const ag = g.agenda();
    for (const id of [...ag.pendingMatches]) await g.simulateUserMatch(id);
    for (const ev of g.state!.events.filter((e) => !e.resolved)) { try { g.resolveEvent(ev.id, ev.choices[0].id); } catch { /* */ } }
    // use activities
    for (let i = 0; i < 2; i++) { try { const ids = ['rest_home', 'family_breakfast', 'social_fans', 'media_content', 'train_extra']; g.doActivity(ids[(w + i) % ids.length]); } catch { /* */ } }
    const rep = await g.advanceWeek();
    for (const m of rep.messages) notesSeen.add(m.slice(0, 90));
    s = g.state!;
    const p = s.world.players[s.career.playerId];
    const live = s.offers.filter((o) => o.status === 'pending');
    if (s.week === 24 || s.week === 51) console.log(`S${s.season} w${s.week} ${p.clubId ? s.world.clubs[p.clubId].shortName + '/' + s.world.clubs[p.clubId].reputation : 'FREE'} ovr ${overall(p)}/${p.potential} age ${s.season - p.birthYear} val ${Math.round(p.value / 1000)}K fame ${s.career.fame} fol ${s.career.followers} money ${Math.round(s.career.money / 1000)}K mor ${Math.round(p.morale)} apps ${p.season.apps} g ${p.season.goals} offers ${live.map((o) => o.kind + ':' + s.world.clubs[o.fromClubId].shortName).join(',')} caps ${p.intlCaps} inj ${p.injury?.key ?? '-'} rel ${JSON.stringify(Object.fromEntries(Object.entries(s.career.relationships).map(([k, v]) => [k, Math.round(v)])))}`);
    if (!p.clubId && live.length) g.respondOffer(live[0].id, 'accept');
    else if (p.clubId) {
      const tr = live.filter((o) => o.kind === 'transfer' || o.kind === 'renewal');
      if (tr.length && (s.week % 3 === 0)) { try { g.respondOffer(tr[0].id, 'accept'); console.log('  -> accepted', tr[0].kind, s.world.clubs[tr[0].fromClubId].name, 'fee', tr[0].fee, 'wage', tr[0].terms.wage, tr[0].note.slice(0, 80)); } catch (e) { console.log('accept err', String(e).slice(0, 100)); } }
    }
  }
  console.log([...notesSeen].slice(0, 40).join('\n'));
}, 280_000);
