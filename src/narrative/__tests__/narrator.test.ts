import { describe, expect, it } from 'vitest';
import { templateNarrator, buildNarrativeContext, outletsFor, GENESIS_FLAVORS } from '../api';
import { ctxOf, noHoles, stateFor } from './kit';
import type { GenesisInput, NewsSeed, PressOccasion, PersonaKind, SocialTrigger } from '../../core/narrative-types';
import type { Negotiation } from '../../core/types';
import { setLang } from '../../core/i18n';

const LANGS = ['tr', 'en'] as const;

describe('buildNarrativeContext', () => {
  it('builds a complete context without raw potential', () => {
    for (const lang of LANGS) {
      const ctx = buildNarrativeContext(stateFor(lang));
      expect(ctx.lang).toBe(lang);
      expect(ctx.player.name).toContain('Deniz');
      expect(ctx.player.age).toBe(17);
      expect(ctx.player.potentialHint).not.toMatch(/\d/);
      expect(ctx.club?.name).toBe('Test City 0');
      expect(ctx.seasonStats.goals).toBe(4);
      expect(ctx.seasonStats.avgRating).toBeCloseTo(7, 1);
      expect(ctx.rival).not.toBeNull();
      expect(ctx.mentor).not.toBeNull();
      expect(ctx.agent?.name).toBe('Kemal Usta');
      expect(ctx.recentResults.length).toBe(1);
      expect(ctx.hometown).toBe('Ankara');
      expect(() => JSON.stringify(ctx)).not.toThrow();
    }
  });
});

describe('templateNarrator.genesis', () => {
  const base = (lang: 'tr' | 'en', flavor: string): GenesisInput => ({
    lang, firstName: 'Deniz', lastName: 'Yıldız', nation: 'TUR', nationName: 'Türkiye', position: 'ST', positionName: lang === 'tr' ? 'Santrfor' : 'Striker',
    foot: 'L', traits: ['clinical'], hometownHint: 'Trabzon', rivalName: 'Kerem Aksoy', rivalClub: 'Test City 3', mentorName: 'Ali Usta',
    startingClubName: 'Test City 0', seedFlavor: flavor,
  });
  it('writes a unique, well-formed origin for every flavour in both languages', async () => {
    const seen = new Set<string>();
    for (const lang of LANGS) {
      for (const flavor of [...GENESIS_FLAVORS, 'weird_unknown_word']) {
        const g = await templateNarrator.genesis(base(lang, flavor));
        for (const f of [g.backstory, g.motto, g.dream, g.theme, g.destinyHint, g.rivalBlurb, g.mentorBlurb, g.agent.bio]) {
          expect(f.length).toBeGreaterThan(10);
          expect(noHoles(f)).toBe(true);
        }
        const sentences = g.backstory.split(/(?<=[.!?])\s+/).length;
        expect(sentences).toBeGreaterThanOrEqual(3);
        expect(sentences).toBeLessThanOrEqual(7);
        expect(g.family.length).toBeGreaterThanOrEqual(2);
        expect(g.family.length).toBeLessThanOrEqual(3);
        expect(g.agent.name).toBeTruthy();
        expect(g.hometown).toBe('Trabzon');
        seen.add(g.backstory);
      }
    }
    expect(seen.size).toBeGreaterThan(15);
  });
});

describe('templateNarrator.news', () => {
  const seeds = (lang: 'tr' | 'en'): NewsSeed[] => [
    { kind: 'match', aboutUser: true, importance: 0.7, tags: ['match', 'user'], facts: lang === 'tr'
      ? 'Test Division: Test City 0 2-1 Test City 3. Test City 0 açısından sonuç: galibiyet. Deniz Yıldız: 1 gol, 1 asist, maç puanı 8.1. Maçın adamı seçildi. Maç bir derbiydi.'
      : 'Test Division: Test City 0 2-1 Test City 3. Result for Test City 0: win. Deniz Yıldız: 1 goals, 1 assists, match rating 8.1. Named man of the match. It was a derby.' },
    { kind: 'match', aboutUser: true, importance: 0.4, tags: [], facts: lang === 'tr'
      ? 'Test Division: Test City 4 3-0 Test City 0. Test City 0 açısından sonuç: mağlubiyet. Deniz Yıldız bu maçta forma giymedi.'
      : 'Test Division: Test City 4 3-0 Test City 0. Result for Test City 0: defeat. Deniz Yıldız did not get on the pitch.' },
    { kind: 'injury', aboutUser: true, importance: 0.5, tags: ['injury'], facts: lang === 'tr' ? 'Deniz Yıldız sakatlandı; yaklaşık 6 hafta sahalardan uzak kalacak.' : 'Deniz Yıldız picked up an injury and faces around 6 weeks out.' },
    { kind: 'milestone', aboutUser: true, importance: 0.6, tags: [], facts: lang === 'tr' ? 'Deniz Yıldız, profesyonel kariyerindeki 10. golünü attı.' : 'Deniz Yıldız scored professional career goal number 10.' },
    { kind: 'transfer_done', aboutUser: true, importance: 0.8, tags: [], facts: lang === 'tr' ? 'Deniz Yıldız, €12M bonservis bedeliyle A kulübünden Test City 0 takımına transfer oldu. Sözleşme: 4 yıl, haftalık €40K.' : 'Deniz Yıldız completed a €12M move from A to Test City 0. Contract: 4 years, €40K a week.' },
    { kind: 'transfer_rumour', aboutUser: true, importance: 0.5, tags: [], facts: lang === 'tr' ? 'Mega Kulüp, Deniz Yıldız için yaklaşık €20M değerinde resmi teklif yaptı.' : 'Mega Club have made a formal offer worth around €20M for Deniz Yıldız.' },
    { kind: 'award', aboutUser: true, importance: 0.8, tags: [], facts: lang === 'tr' ? 'Deniz Yıldız, 2026/27 sezonunda Yılın Genç Oyuncusu ödülünü kazandı.' : 'Deniz Yıldız won the Young Player for the 2026/27 season.' },
    { kind: 'league', aboutUser: false, importance: 0.5, tags: ['league'], facts: lang === 'tr' ? 'Test Division şampiyonu: Test City 5.' : 'Test Division champions: Test City 5.' },
    { kind: 'callup', aboutUser: true, importance: 0.7, tags: [], facts: lang === 'tr' ? 'Deniz Yıldız, kariyerinde ilk kez Türkiye kadrosuna davet edildi.' : 'Deniz Yıldız has been called up by England for the first time.' },
    { kind: 'scandal', aboutUser: true, importance: 0.4, tags: [], facts: 'something odd' },
    { kind: 'story', aboutUser: false, importance: 0.2, tags: [], facts: '' },
    { kind: 'rival', aboutUser: true, importance: 0.6, tags: ['rival'], facts: 'k=rival_goals | say=Kerem Aksoy bu sezon 10 gole ulaştı. | rival=Kerem Aksoy | n=10 | team=Test City 3' },
  ];
  it('writes faithful, hole-free articles in both languages', async () => {
    for (const lang of LANGS) {
      const ctx = ctxOf(lang);
      const input = seeds(lang);
      const out = await templateNarrator.news(ctx, input);
      expect(out).toHaveLength(input.length);
      out.forEach((a, i) => {
        expect(a.headline.length).toBeGreaterThan(8);
        expect(a.body.length).toBeGreaterThan(20);
        expect(noHoles(a.headline)).toBe(true);
        expect(noHoles(a.body)).toBe(true);
        expect(a.importance).toBeCloseTo(input[i].importance, 5);
        expect(a.aboutUser).toBe(input[i].aboutUser);
        expect(a.ai).toBe(false);
        expect([...outletsFor('ENG'), ...outletsFor('TUR')]).toContain(a.outlet);
      });
      // match report stays faithful to the facts
      expect(out[0].body).toContain('2-1');
      expect(out[1].body).toMatch(/3-0/);
      expect(out[3].body + out[3].headline).toContain('10');
      expect(out[4].body + out[4].headline).toMatch(/12M|12 ?M/);
    }
  });
});

describe('templateNarrator.social', () => {
  const triggers: SocialTrigger[] = [
    { kind: 'match', facts: 'Test Division: Test City 0 2-1 Test City 3. Result for Test City 0: win.', rating: 8.4, goals: 2, won: true },
    { kind: 'match', facts: 'x', rating: 4.9, goals: 0, won: false },
    { kind: 'transfer', facts: 'moved' },
    { kind: 'user_post', text: 'hello', tone: 'provocative' },
    { kind: 'event', facts: 'scandal' },
    { kind: 'idle' },
  ];
  it('produces plausible posts for every trigger', async () => {
    for (const lang of LANGS) {
      const ctx = ctxOf(lang);
      for (const tr of triggers) {
        const posts = await templateNarrator.social(ctx, tr, 5);
        expect(posts).toHaveLength(5);
        const kinds = new Set(posts.map((p) => p.author.kind));
        expect(kinds.size).toBeGreaterThanOrEqual(2);
        for (const p of posts) {
          expect(p.text.length).toBeGreaterThan(6);
          expect(noHoles(p.text)).toBe(true);
          expect(p.author.handle.startsWith('@')).toBe(true);
          expect(p.likes).toBeGreaterThanOrEqual(0);
          expect(p.reposts).toBeLessThanOrEqual(p.likes);
          expect(p.sentiment).toBeGreaterThanOrEqual(-1);
          expect(p.sentiment).toBeLessThanOrEqual(1);
        }
      }
    }
  });
  it('mood follows the trigger', async () => {
    const ctx = ctxOf('en');
    const good = await templateNarrator.social(ctx, triggers[0], 8);
    const bad = await templateNarrator.social(ctx, triggers[1], 8);
    const avg = (xs: { sentiment: number }[]) => xs.reduce((a, b) => a + b.sentiment, 0) / xs.length;
    expect(avg(good)).toBeGreaterThan(avg(bad));
  });
  it('scales reach with fame', async () => {
    const small = stateFor('tr'); small.career.followers = 600;
    const big = stateFor('tr'); big.career.followers = 4_000_000;
    const sum = async (s: typeof small) => (await templateNarrator.social(buildNarrativeContext(s), triggers[0], 6)).reduce((a, p) => a + p.likes, 0);
    expect(await sum(big)).toBeGreaterThan((await sum(small)) * 10);
  });
});

describe('templateNarrator press', () => {
  const occasions: PressOccasion[] = ['pre_match', 'post_match', 'transfer', 'scandal', 'milestone', 'unveiling'];
  it('asks three well-formed questions per occasion', async () => {
    for (const lang of LANGS) {
      const ctx = ctxOf(lang);
      for (const occ of occasions) {
        const qs = await templateNarrator.pressQuestions(ctx, occ, lang === 'tr' ? 'Deniz Yıldız (Test City 0), Test Division kapsamındaki Test City 3 maçı öncesinde basının karşısında.' : 'x');
        expect(qs).toHaveLength(3);
        expect(new Set(qs.map((q) => q.id)).size).toBe(3);
        for (const q of qs) {
          expect(noHoles(q.text)).toBe(true);
          expect(q.journalist).toBeTruthy();
          expect(q.outlet).toBeTruthy();
          expect(q.options.length).toBeGreaterThanOrEqual(3);
          expect(q.options.length).toBeLessThanOrEqual(4);
          expect(new Set(q.options.map((o) => o.tone)).size).toBe(q.options.length);
          for (const o of q.options) expect(noHoles(o.text)).toBe(true);
        }
      }
    }
  });
  it('mentions the opponent in pre-match questions when known', async () => {
    const ctx = ctxOf('tr');
    const all = (await Promise.all([1, 2, 3, 4, 5, 6].map((w) => templateNarrator.pressQuestions({ ...ctx, week: w }, 'pre_match', 'Deniz Yıldız (Test City 0), Test Division kapsamındaki Test City 3 maçı öncesinde basının karşısında.')))).flat();
    expect(all.some((q) => q.text.includes('Test City 3'))).toBe(true);
  });
  it('maps tones to bounded, sensible effects', async () => {
    const ctx = ctxOf('en');
    const [q] = await templateNarrator.pressQuestions(ctx, 'post_match', 'x');
    const results: Record<string, Awaited<ReturnType<typeof templateNarrator.evaluatePress>>> = {};
    for (const o of q.options) results[o.tone] = await templateNarrator.evaluatePress(ctx, q, { optionId: o.id });
    for (const [tone, r] of Object.entries(results)) {
      expect(r.tone).toBe(tone);
      expect(noHoles(r.headline)).toBe(true);
      expect(r.feedback.length).toBeGreaterThan(5);
      for (const v of Object.values(r.effects.rel ?? {})) expect(Math.abs(v as number)).toBeLessThanOrEqual(8);
      expect(Math.abs(r.effects.fame ?? 0)).toBeLessThanOrEqual(4);
      expect(Math.abs(r.effects.morale ?? 0)).toBeLessThanOrEqual(6);
    }
  });
  it('scores free text with TR + EN heuristics', async () => {
    const [q] = await templateNarrator.pressQuestions(ctxOf('tr'), 'post_match', 'x');
    const run = async (lang: 'tr' | 'en', text: string) => templateNarrator.evaluatePress(ctxOf(lang), q, { text });
    const humbleTr = await run('tr', 'Önce takım arkadaşlarıma ve hocama teşekkür ederim, çok çalışmaya devam edeceğim.');
    const insultTr = await run('tr', 'Bu soru aptalca, siz salaksınız.');
    expect(humbleTr.tone).toBe('humble');
    expect(insultTr.tone).toBe('provocative');
    expect((insultTr.effects.rel?.media ?? 0)).toBeLessThan(0);
    expect((humbleTr.effects.rel?.media ?? 0)).toBeGreaterThan(0);
    const humbleEn = await run('en', 'Credit goes to my teammates and the gaffer, I just keep working hard and learning.');
    const insultEn = await run('en', 'That is a stupid question, you clown, shut up.');
    const deflectEn = await run('en', 'No comment.');
    expect(humbleEn.tone).toBe('humble');
    expect(insultEn.tone).toBe('provocative');
    expect(insultEn.effects.rel?.manager ?? 0).toBeLessThan(0);
    expect(deflectEn.tone).toBe('deflect');
    const emptyAnswer = await templateNarrator.evaluatePress(ctxOf('en'), q, {});
    expect(emptyAnswer.tone).toBe('deflect');
  });
  it('lets the rival mention set the beef flag', async () => {
    const ctx = ctxOf('en');
    const [q] = await templateNarrator.pressQuestions(ctx, 'pre_match', 'x');
    const name = ctx.rival!.name.split(' ').slice(-1)[0];
    const r = await templateNarrator.evaluatePress(ctx, q, { text: `${name} is trash, I am the best and nobody beats me` });
    expect(r.effects.flags?.['narr.rival.beef']).toBe(true);
  });
});

describe('templateNarrator.negotiate', () => {
  const neg = (status: Negotiation['status']): Negotiation => ({
    offerId: 'O1', clubId: 'ENG-1-03', round: 2, maxRounds: 5, patience: 60, status,
    current: { wage: 30_000, years: 3, releaseClause: 40_000_000, role: 'starter', signingBonus: 100_000, goalBonus: 2000 },
    limits: { maxWage: 60_000, maxYears: 5, minReleaseClause: null, maxSigningBonus: 500_000, maxGoalBonus: 10_000, roles: ['rotation', 'starter'] },
    lines: [],
  });
  const ask = { wage: 45_000, years: 4, releaseClause: null, role: 'star' as const, signingBonus: 300_000, goalBonus: 5000 };
  it('voices the club proposal without changing the terms', async () => {
    for (const lang of LANGS) {
      for (const status of ['open', 'agreed', 'collapsed'] as const) {
        const n = neg(status);
        const r = await templateNarrator.negotiate(ctxOf(lang), n, ask, status === 'open' ? 'Taraftarlarımı çok seviyorum / I love the fans' : null);
        expect(r.terms).toEqual(n.current);
        expect(r.patienceDelta).toBe(0);
        expect(r.walkAway).toBe(status === 'collapsed');
        expect(r.text.length).toBeGreaterThan(40);
        expect(noHoles(r.text)).toBe(true);
      }
    }
  });
  it('mentions the proposed wage', async () => {
    const r = await templateNarrator.negotiate(ctxOf('en'), neg('open'), ask, null);
    expect(r.text).toMatch(/€30K/);
  });
});

describe('templateNarrator chat', () => {
  const personas: PersonaKind[] = ['agent', 'manager', 'mentor', 'partner', 'family', 'rival'];
  const messages = ['Merhaba', 'hello there', 'Başka kulüpten teklif var mı?', 'Do I get a raise?', 'Neden oynamıyorum?', 'I got injured', 'seni seviyorum', 'aptal', 'Teşekkürler', 'How did we do?', 'asdf qwerty'];
  it('replies in character to every kind of message', async () => {
    for (const lang of LANGS) {
      for (const persona of personas) {
        for (const m of messages) {
          const r = await templateNarrator.chat(ctxOf(lang), persona, 'Test Person', [], m);
          expect(r.length).toBeGreaterThan(5);
          expect(noHoles(r)).toBe(true);
        }
      }
    }
  });
  it('does not repeat itself word for word', async () => {
    const ctx = ctxOf('tr');
    const history: { from: 'user' | 'persona'; text: string }[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const r = await templateNarrator.chat(ctx, 'agent', 'Kemal', history, 'Transfer olacak mı?');
      expect(seen.has(r)).toBe(false);
      seen.add(r);
      history.push({ from: 'user', text: 'Transfer olacak mı?' }, { from: 'persona', text: r });
    }
  });
  it('is topic-aware', async () => {
    const ctx = ctxOf('en');
    const injury = await templateNarrator.chat(ctx, 'family', 'Mum', [], 'My knee hurts, I think I am injured');
    expect(injury).toMatch(/doctor|rest|soup|scared|OK/i);
  });
});

describe('dynamicEvent & biography', () => {
  it('dynamicEvent is null', async () => {
    expect(await templateNarrator.dynamicEvent(ctxOf('tr'))).toBeNull();
    expect(templateNarrator.kind).toBe('template');
  });
  it('writes a 5-6 paragraph documentary from the career facts', async () => {
    const facts = {
      tr: ['Deniz Yıldız — Türkiye, Santrfor. Profesyonel kariyer: 2026–2043.', 'Kulüpler: Test City 0, Mega Kulüp, Eski Dostlar', 'Kulüp kariyeri: 612 maç, 301 gol, 140 asist.', 'Kupalar: Lig 2030, Kupa 2031', 'Bireysel ödüller: Gol Kralı 2031', 'Millî takım: 71 maç, 28 gol.', 'Zirve: genel güç 88, piyasa değeri €95M.', 'Memleketi: Ankara. Çocukluk hayali: Final golü atmak.', 'Ezeli rakibi: Kerem Aksoy (240 kariyer golü).', 'Gerçekleşen hedefler: Lig şampiyonluğu; 100 gol', 'Efsane puanı: 1850'].join('\n'),
      en: ['Deniz Yıldız — Türkiye, Striker. Professional career: 2026–2043.', 'Clubs: Test City 0, Mega Club, Old Friends', 'Club career: 612 appearances, 301 goals, 140 assists.', 'Trophies: League 2030, Cup 2031', 'Individual awards: Golden Boot 2031', 'International: 71 caps, 28 goals.', 'Peak: overall 88, market value €95M.', 'Hometown: Ankara. Childhood dream: Score a final goal.', 'Great rival: Kerem Aksoy (240 career goals).', 'Goals achieved: League title; 100 goals', 'Legend score: 1850'].join('\n'),
    };
    for (const lang of LANGS) {
      const bio = await templateNarrator.biography(ctxOf(lang), facts[lang]);
      const paras = bio.split('\n\n');
      expect(paras.length).toBeGreaterThanOrEqual(5);
      expect(paras.length).toBeLessThanOrEqual(7);
      expect(noHoles(bio)).toBe(true);
      expect(bio).toContain('612');
      expect(bio).toContain('Kerem Aksoy');
      expect(bio).toMatch(/büyükler|great/i);
    }
  });
  it('survives empty facts', async () => {
    const bio = await templateNarrator.biography(ctxOf('en'), '');
    expect(bio.length).toBeGreaterThan(80);
  });
});

setLang('tr');
