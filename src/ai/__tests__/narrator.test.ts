import { describe, expect, it } from 'vitest';
import { t } from '../../core/i18n';
import type { AIFeature } from '../../core/types';
import type { NewsSeed } from '../../core/narrative-types';
import { AIError } from '../errors';
import { createClaudeNarrator, type ClaudeNarratorOptions } from '../narrator';
import { Breaker, COOLDOWN_MS, Limiter, StatusTracker } from '../runtime';
import {
  fakeTemplate, fakeTransport, genesisInput, makeCtx, makeNegotiation, ok, question, terms, zeroEffects,
} from './fixtures';

const allOn = () => true;

function setup(answers: Parameters<typeof fakeTransport>[0], extra: Partial<ClaudeNarratorOptions> = {}) {
  const transport = fakeTransport(answers);
  const template = fakeTemplate();
  const narrator = createClaudeNarrator({ call: transport.call, fallback: template, isEnabled: allOn, ...extra });
  return { narrator, template, calls: transport.calls };
}

const genesisAnswer = {
  backstory: 'Deniz, Karşıyaka sahilinde martıları kovalayarak büyüdü.',
  motto: 'Asla pes etme',
  dream: 'Dünya Kupası’nda gol atmak.',
  theme: 'Sahilden Zirveye',
  destinyHint: 'Rüzgâr bazen geç eser.',
  rivalBlurb: 'Kaan ile U12 finalinden beri kanlı bıçaklılar.',
  mentorBlurb: 'Ozan abi ona ilk kramponunu hediye etti.',
  family: [
    { name: 'Hasan Yıldız', role: 'father', personality: 'sert ama adil', bio: 'Balıkçı.' },
    { name: 'Mehmet Yıldız', role: 'father', personality: 'duplicate', bio: 'Should be dropped.' },
    { name: 'Elif Yıldız', role: 'sibling', personality: 'neşeli', bio: 'Kardeşi.' },
  ],
  agent: { name: 'Necati Tilki', personality: 'kurnaz', bio: 'Eski kaleci.' },
};

describe('feature gating', () => {
  it('uses the template narrator without calling Claude when the feature is off', async () => {
    const enabled = new Set<AIFeature>(['chat']);
    const { narrator, template, calls } = setup({ news: ok({ articles: [] }) }, { isEnabled: (f) => enabled.has(f) });
    const seeds: NewsSeed[] = [{ kind: 'match', facts: 'Ege 2-1 Anadolu', aboutUser: true, importance: 0.8, tags: ['match'] }];
    const out = await narrator.news(makeCtx(), seeds);
    expect(calls).toHaveLength(0);
    expect(template.used).toEqual(['news']);
    expect(out[0].headline).toContain('TEMPLATE');
    expect(narrator.status.get().calls).toBe(0);
  });

  it('treats a throwing gate as disabled', async () => {
    const { narrator, calls } = setup({}, { isEnabled: () => { throw new Error('boom'); } });
    expect(await narrator.chat(makeCtx(), 'agent', 'Kemal', [], 'Selam')).toBe('TEMPLATE');
    expect(calls).toHaveLength(0);
  });

  it('sends the system prompt, schema and language to the transport', async () => {
    const { narrator, calls } = setup({ chat: ok({ reply: 'Merhaba evlat!' }) });
    expect(await narrator.chat(makeCtx(), 'agent', 'Kemal Usta', [{ from: 'user', text: 'Naber?' }], 'Transfer var mı?')).toBe('Merhaba evlat!');
    expect(calls[0].system).toContain('NEO STAR SOCCER');
    expect(calls[0].prompt).toContain('Turkish (tr)');
    expect(calls[0].prompt).toContain('Kemal Usta');
    expect(calls[0].maxTokens).toBeGreaterThan(0);
  });
});

describe('fallback on failure', () => {
  it('falls back when the transport throws, and records a localized error', async () => {
    const { narrator, template } = setup({ genesis: new AIError('auth', 'bad key', 401) });
    const g = await narrator.genesis(genesisInput);
    expect(g.backstory).toBe('TEMPLATE');
    expect(template.used).toEqual(['genesis']);
    const s = narrator.status.get();
    expect(s).toMatchObject({ calls: 1, failures: 1, pending: 0, lastFeature: 'genesis' });
    expect(s.lastError).toBe(t('ai.err.auth'));
  });

  it('falls back on invalid JSON text', async () => {
    const { narrator, template } = setup({ chat: { stopReason: 'end_turn', parsed: null, text: '{"reply": "yarım' } });
    expect(await narrator.chat(makeCtx(), 'manager', 'Hoca', [], 'Hocam?')).toBe('TEMPLATE');
    expect(template.used).toEqual(['chat']);
    expect(narrator.status.get().lastError).toBe(t('ai.err.invalid'));
  });

  it('falls back on a refusal stop reason even if content parses', async () => {
    const { narrator } = setup({ biography: { stopReason: 'refusal', parsed: { paragraphs: ['a', 'b'] } } });
    expect(await narrator.biography(makeCtx(), 'facts')).toBe('TEMPLATE');
    expect(narrator.status.get().lastError).toBe(t('ai.err.refusal'));
  });

  it('falls back when the output does not match the schema', async () => {
    const { narrator } = setup({ press: ok({ tone: 'humble', headline: 'x' }) });
    const ev = await narrator.evaluatePress(makeCtx(), question, { text: 'Kaan benim için sadece bir isim.' });
    expect(ev.headline).toBe('TEMPLATE');
  });

  it('parses JSON from raw text when parsed_output is missing', async () => {
    const { narrator } = setup({ chat: { stopReason: 'end_turn', parsed: null, text: '```json\n{"reply":"Tamamdır kardeşim"}\n```' } });
    expect(await narrator.chat(makeCtx(), 'mentor', 'Ozan', [], 'Abi?')).toBe('Tamamdır kardeşim');
  });

  it('uses the last resort when the template narrator throws too', async () => {
    const template = fakeTemplate();
    template.negotiate = async () => { throw new Error('template not implemented'); };
    const narrator = createClaudeNarrator({ call: async () => { throw new Error('offline'); }, fallback: template, isEnabled: allOn });
    const neg = makeNegotiation();
    const r = await narrator.negotiate(makeCtx(), neg, terms({ wage: 11_000 }), 'Biraz daha?');
    expect(r.terms).toEqual(neg.current);
    expect(r.patienceDelta).toBe(0);
    expect(r.text.length).toBeGreaterThan(0);
  });

  it('times out slow requests and falls back', async () => {
    const { narrator } = setup({ chat: () => new Promise(() => { /* never resolves */ }) }, { timeoutMs: 20 });
    expect(await narrator.chat(makeCtx(), 'agent', 'Kemal', [], 'Alo?')).toBe('TEMPLATE');
    expect(narrator.status.get().lastError).toBe(t('ai.err.timeout'));
  });

  it('never rejects even when every layer fails', async () => {
    const broken = new Proxy({}, { get: () => () => { throw new Error('stub'); } }) as never;
    const narrator = createClaudeNarrator({ call: async () => { throw new Error('x'); }, fallback: broken, isEnabled: allOn });
    const ctx = makeCtx();
    await expect(narrator.genesis(genesisInput)).resolves.toMatchObject({ hometown: 'İzmir', ai: false });
    await expect(narrator.news(ctx, [{ kind: 'league', facts: 'Lider kaybetti. Detaylar.', aboutUser: false, importance: 0.3, tags: ['league'] }]))
      .resolves.toHaveLength(1);
    await expect(narrator.social(ctx, { kind: 'idle' }, 3)).resolves.toEqual([]);
    await expect(narrator.pressQuestions(ctx, 'pre_match', '')).resolves.toHaveLength(2);
    await expect(narrator.evaluatePress(ctx, question, { optionId: 'q1-b' })).resolves.toMatchObject({ tone: 'provocative' });
    await expect(narrator.dynamicEvent(ctx)).resolves.toBeNull();
    await expect(narrator.chat(ctx, 'family', 'Anne', [], 'Anne?')).resolves.toBeTypeOf('string');
    await expect(narrator.biography(ctx, 'FACTS')).resolves.toBe('FACTS');
  });
});

describe('genesis', () => {
  it('cleans the result: fixed hometown, one father, ai flag', async () => {
    const { narrator } = setup({ genesis: ok(genesisAnswer) });
    const g = await narrator.genesis(genesisInput);
    expect(g.ai).toBe(true);
    expect(g.hometown).toBe('İzmir');
    expect(g.family.map((f) => f.role)).toEqual(['father', 'sibling']);
    expect(g.agent.name).toBe('Necati Tilki');
    expect(narrator.status.get()).toMatchObject({ calls: 1, failures: 0, lastError: null });
  });

  it('drops the mentor blurb when there is no mentor', async () => {
    const { narrator, calls } = setup({ genesis: ok(genesisAnswer) });
    const g = await narrator.genesis({ ...genesisInput, mentorName: null });
    expect(g.mentorBlurb).toBe('');
    expect(calls[0].prompt).toContain('there is no mentor');
  });
});

describe('news', () => {
  const seeds: NewsSeed[] = [
    { kind: 'match', facts: 'Ege 2-1 Anadolu, Deniz 2 gol', aboutUser: true, importance: 0.9, tags: ['match', 'user'] },
    { kind: 'league', facts: 'Lider Boğaziçi berabere kaldı', aboutUser: false, importance: 0.4, tags: ['league'] },
    { kind: 'rival', facts: 'Kaan hat-trick yaptı', aboutUser: false, importance: 0.6, tags: ['rival'] },
  ];

  it('maps by index and fills missing articles from the template', async () => {
    const { narrator, template } = setup({
      news: ok({ articles: [
        { index: 2, outlet: 'Tribün Gazetesi', headline: 'Kaan’dan hat-trick şov!', body: 'Rakip ateş püskürdü.' },
        { index: 0, outlet: 'Gol Postası', headline: 'Deniz fileleri iki kez havalandırdı', body: 'Ege üç puanı hanesine yazdırdı.' },
      ] }),
    });
    const out = await narrator.news(makeCtx(), seeds);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ outlet: 'Gol Postası', aboutUser: true, importance: 0.9, ai: true, tags: ['match', 'user'] });
    expect(out[1].headline).toContain('TEMPLATE');
    expect(out[2].headline).toBe('Kaan’dan hat-trick şov!');
    expect(template.used).toEqual(['news']);
  });

  it('maps by position when Claude renumbers a full batch (1-based)', async () => {
    const { narrator, template } = setup({
      news: ok({ articles: [1, 2, 3].map((index) => ({ index, outlet: 'Yeşil Saha', headline: `Haber ${index}`, body: 'Gövde.' })) }),
    });
    const out = await narrator.news(makeCtx(), seeds);
    expect(out.map((a) => a.headline)).toEqual(['Haber 1', 'Haber 2', 'Haber 3']);
    expect(out[0].aboutUser).toBe(true);
    expect(template.used).toEqual([]);
  });

  it('splits large weeks into batches', async () => {
    const many: NewsSeed[] = Array.from({ length: 5 }, (_, i) => ({ kind: 'league', facts: `f${i}`, aboutUser: false, importance: 0.2, tags: [] }));
    const { narrator, calls } = setup({
      news: (req) => {
        const indices = [...req.prompt.matchAll(/"index":(\d+)/g)].map((m) => Number(m[1]));
        return ok({ articles: indices.map((index) => ({ index, outlet: 'O', headline: `H${index}`, body: 'B' })) });
      },
    }, { newsBatchSize: 2 });
    const out = await narrator.news(makeCtx(), many);
    expect(calls).toHaveLength(3);
    expect(out.map((a) => a.headline)).toEqual(['H0', 'H1', 'H2', 'H3', 'H4']);
  });

  it('returns [] for no seeds without calling anything', async () => {
    const { narrator, calls } = setup({});
    expect(await narrator.news(makeCtx(), [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('social', () => {
  it('clamps engagement, sanitizes handles and caps the count', async () => {
    const post = { authorName: 'Çarşı Ruhu', handle: '@Çarşı Ruhu 1907!!', kind: 'fan', verified: false, text: 'Bu çocuk başka 🔥', likes: 9e9, reposts: 9e9, sentiment: 3 };
    const { narrator } = setup({ social: ok({ posts: Array.from({ length: 10 }, () => post) }) });
    const out = await narrator.social(makeCtx(), { kind: 'idle' }, 4);
    expect(out).toHaveLength(4);
    expect(out[0].author.handle).toBe('@carsi_ruhu_1907');
    expect(out[0].likes).toBe(10_000); // 25 % of 40K followers
    expect(out[0].reposts).toBeLessThanOrEqual(out[0].likes);
    expect(out[0].sentiment).toBe(1);
    expect(out[0].ai).toBe(true);
  });
});

describe('press', () => {
  it('builds questions with unique tones and stable ids', async () => {
    const { narrator } = setup({
      press: ok({ questions: [
        { journalist: 'Selin Ak', outlet: 'Saha Kenarı', topic: 'Rival', text: 'Kaan sizi geçti mi?', options: [
          { tone: 'humble', text: 'Herkesin günü gelir.' },
          { tone: 'humble', text: 'Duplicate tone.' },
          { tone: 'provocative', text: 'Kaan mı? Tanımıyorum.' },
          { tone: 'deflect', text: 'Maça odaklıyım.' },
        ] },
        { journalist: 'X', outlet: 'Y', topic: 'form', text: 'Only one option', options: [{ tone: 'humble', text: 'a' }] },
      ] }),
    });
    const qs = await narrator.pressQuestions(makeCtx(), 'pre_match', 'Derbi haftası');
    expect(qs).toHaveLength(1);
    expect(qs[0].options.map((o) => o.tone)).toEqual(['humble', 'provocative', 'deflect']);
    expect(new Set(qs[0].options.map((o) => o.id)).size).toBe(3);
    expect(qs[0].topic).toBe('rival');
  });

  it('judges free text with clamped effects', async () => {
    const { narrator, calls } = setup({
      press: ok({ tone: 'provocative', headline: '“Kaan mı? O kim?”', feedback: 'Salon buz kesti, tribünler bayıldı.',
        effects: { fame: 50, morale: -40, followers: 1e9, rel: [{ who: 'fans', delta: 99 }, { who: 'media', delta: -99 }, { who: 'aliens', delta: 5 }] } }),
    });
    const ev = await narrator.evaluatePress(makeCtx(), question, { text: 'Kaan mı? O kim?' });
    expect(ev.tone).toBe('provocative');
    expect(ev.effects).toEqual({ fame: 4, morale: -6, followers: 2_000, rel: { fans: 8, media: -8 } });
    expect(ev.headline).toBe('Kaan mı? O kim?');
    expect(calls[0].prompt).toContain('typed this answer freely');
  });

  it('keeps the tone of a prepared option', async () => {
    const { narrator, calls } = setup({
      press: ok({ tone: 'humble', headline: 'Deniz’den olay yanıt', feedback: 'Ortalık karıştı.', effects: { fame: 1, morale: 0, followers: 0, rel: [] } }),
    });
    const ev = await narrator.evaluatePress(makeCtx(), question, { optionId: 'q1-b' });
    expect(ev.tone).toBe('provocative');
    expect(calls[0].prompt).toContain('Kaan kim?');
  });
});

describe('negotiation', () => {
  it('clamps Claude terms into the mandate and limits', async () => {
    const neg = makeNegotiation();
    const ask = terms({ wage: 11_500, role: 'starter', signingBonus: 80_000, releaseClause: 15_000_000 });
    const { narrator } = setup({
      negotiation: ok({ text: 'Tamam, son sözümüz bu.', wage: 999_999, years: 9, releaseClause: 1, role: 'star',
        signingBonus: 1e9, goalBonus: -5, patienceDelta: -90, walkAway: false }),
    });
    const r = await narrator.negotiate(makeCtx(), neg, ask, 'Daha fazlasını hak ediyorum.');
    expect(r.terms.wage).toBeLessThanOrEqual(neg.limits.maxWage);
    expect(r.terms.wage).toBeLessThanOrEqual(10_800); // +8 % step
    expect(r.terms.years).toBe(4);
    expect(r.terms.releaseClause).toBeGreaterThanOrEqual(15_000_000);
    expect(r.terms.role).toBe('rotation'); // 'star' is outside the limits
    expect(r.terms.signingBonus).toBeLessThanOrEqual(neg.limits.maxSigningBonus);
    expect(r.terms.goalBonus).toBeGreaterThanOrEqual(0);
    expect(r.patienceDelta).toBe(-30);
  });

  it('only lets the director walk away when patience is nearly gone', async () => {
    const answer = ok({ text: 'Bu görüşme bitmiştir!', wage: 10_000, years: 3, releaseClause: 0, role: 'rotation', signingBonus: 50_000, goalBonus: 1_000, patienceDelta: -25, walkAway: true });
    const calm = setup({ negotiation: answer });
    expect((await calm.narrator.negotiate(makeCtx(), makeNegotiation({ patience: 90 }), terms(), 'hakaret')).walkAway).toBe(false);
    const tense = setup({ negotiation: answer });
    const r = await tense.narrator.negotiate(makeCtx(), makeNegotiation({ patience: 40 }), terms(), 'hakaret');
    expect(r.walkAway).toBe(true);
    expect(r.terms.releaseClause).toBe(20_000_000); // 0 → keep current clause
  });
});

describe('dynamic events', () => {
  const choice = (label: string, effects = zeroEffects(), gamble: unknown[] = []) => ({ label, resultText: 'Sonuç.', effects, gamble });

  it('clamps effects, validates icons and normalises choices', async () => {
    const huge = { money: 5e6, fame: 40, morale: -60, energy: 99, form: -99, followers: 1e9, injuryWeeks: 12,
      rel: [{ who: 'family', delta: 30 }, { who: 'family', delta: 30 }], xp: [{ attr: 'curl', delta: 50 }, { attr: 'magic', delta: 5 }] };
    const { narrator } = setup({
      events: ok({ event: {
        title: 'Mahalleden bir mektup', body: 'Çocukluk antrenörün hastanede. Seni görmek istiyor ama yarın kritik antrenman var.',
        icon: 'not-an-icon', persona: 'Hasan Hoca',
        choices: [
          choice('Hastaneye git', huge, [{ chance: 0.99, text: 'Antrenmanı kaçırdın.', effects: { ...zeroEffects(), rel: [{ who: 'manager', delta: -20 }] } }]),
          choice('Antrenmana katıl', zeroEffects(), [{ chance: 0.3, text: 'Second gamble ignored.', effects: zeroEffects() }]),
          choice('Telefonla ara'),
          choice('Fourth choice dropped'),
        ],
      } }),
    });
    const ev = await narrator.dynamicEvent(makeCtx());
    expect(ev).not.toBeNull();
    expect(ev!.icon).toBe('sparkles');
    expect(ev!.persona).toBe('Hasan Hoca');
    expect(ev!.choices.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(ev!.choices[0].effects).toEqual({
      money: 20_000, fame: 4, morale: -6, energy: 15, form: -8, followers: 2_000, injuryWeeks: 2, rel: { family: 8 }, xp: { curl: 10 },
    });
    expect(ev!.choices[0].risk).toEqual({ chance: 0.6, text: 'Antrenmanı kaçırdın.', effects: { rel: { manager: -8 } } });
    expect(ev!.choices[1].risk).toBeUndefined();
    expect(ev!.choices[2].effects).toEqual({});
  });

  it('returns null when Claude says nothing fits (no template call)', async () => {
    const { narrator, template } = setup({ events: ok({ event: null }) });
    expect(await narrator.dynamicEvent(makeCtx())).toBeNull();
    expect(template.used).toEqual([]);
  });

  it('falls back when fewer than two choices survive', async () => {
    const { narrator, template } = setup({
      events: ok({ event: { title: 'T', body: 'B', icon: 'star', persona: '', choices: [choice('Only one')] } }),
    });
    expect(await narrator.dynamicEvent(makeCtx())).toBeNull();
    expect(template.used).toEqual(['dynamicEvent']);
  });
});

describe('biography', () => {
  it('joins paragraphs and requires at least two', async () => {
    const { narrator } = setup({ biography: ok({ paragraphs: ['İzmir’de başladı.', 'Ve dünyayı fethetti.'] }) });
    expect(await narrator.biography(makeCtx(), 'facts')).toBe('İzmir’de başladı.\n\nVe dünyayı fethetti.');
  });
});

describe('queue & status', () => {
  it('never runs more than maxConcurrent requests at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const status = new StatusTracker();
    const pendingSeen: number[] = [];
    status.subscribe((s) => pendingSeen.push(s.pending));
    const narrator = createClaudeNarrator({
      isEnabled: allOn, fallback: fakeTemplate(), status, limiter: new Limiter(2),
      call: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return ok({ reply: 'ok' });
      },
    });
    const replies = await Promise.all(Array.from({ length: 6 }, () => narrator.chat(makeCtx(), 'agent', 'K', [], 'm')));
    expect(replies).toEqual(Array(6).fill('ok'));
    expect(peak).toBe(2);
    expect(Math.max(...pendingSeen)).toBe(6);
    expect(status.get()).toMatchObject({ calls: 6, failures: 0, pending: 0, lastFeature: 'chat' });
  });

  it('reports kind from the provided function', () => {
    let on = false;
    const narrator = createClaudeNarrator({ call: async () => ok({}), fallback: fakeTemplate(), kind: () => (on ? 'claude' : 'template') });
    expect(narrator.kind).toBe('template');
    on = true;
    expect(narrator.kind).toBe('claude');
  });
});

describe('breaker & load shedding', () => {
  function pausable(answers: Parameters<typeof fakeTransport>[0]) {
    let t = 0;
    let config = 'key-a|claude-opus-5-5';
    const now = () => t;
    const transport = fakeTransport(answers);
    const template = fakeTemplate();
    const narrator = createClaudeNarrator({
      call: transport.call, fallback: template, isEnabled: allOn, now, breaker: new Breaker(now), configKey: () => config,
    });
    return {
      narrator, template, calls: transport.calls,
      advance: (ms: number) => { t += ms; },
      setConfig: (c: string) => { config = c; },
    };
  }

  it('pauses Claude after an invalid key until the key changes', async () => {
    const h = pausable({ chat: new AIError('auth', 'bad key', 401) });
    expect(await h.narrator.chat(makeCtx(), 'agent', 'K', [], 'a')).toBe('TEMPLATE');
    expect(h.narrator.status.get().cooldownUntil).toBe(COOLDOWN_MS.auth);
    expect(await h.narrator.chat(makeCtx(), 'agent', 'K', [], 'b')).toBe('TEMPLATE');
    expect(h.calls).toHaveLength(1);
    expect(h.narrator.status.get()).toMatchObject({ calls: 1, failures: 1, pending: 0, lastError: t('ai.err.auth') });
    h.setConfig('key-b|claude-opus-5-5');
    await h.narrator.chat(makeCtx(), 'agent', 'K', [], 'c');
    expect(h.calls).toHaveLength(2);
  });

  it('resumes by itself after a rate-limit cooldown', async () => {
    let limited = true;
    const h = pausable({ chat: () => {
      if (limited) throw new AIError('rate_limit', 'slow down', 429);
      return ok({ reply: 'Geri döndüm!' });
    } });
    await h.narrator.chat(makeCtx(), 'agent', 'K', [], 'a');
    limited = false;
    h.advance(COOLDOWN_MS.rate_limit! - 1);
    expect(await h.narrator.chat(makeCtx(), 'agent', 'K', [], 'b')).toBe('TEMPLATE');
    expect(h.calls).toHaveLength(1);
    h.advance(1);
    expect(await h.narrator.chat(makeCtx(), 'agent', 'K', [], 'c')).toBe('Geri döndüm!');
    expect(h.narrator.status.get()).toMatchObject({ cooldownUntil: null, lastError: null });
  });

  it('does not pause on request-specific failures', async () => {
    const h = pausable({ chat: { stopReason: 'refusal', parsed: null } });
    await h.narrator.chat(makeCtx(), 'agent', 'K', [], 'a');
    await h.narrator.chat(makeCtx(), 'agent', 'K', [], 'b');
    expect(h.calls).toHaveLength(2);
    expect(h.narrator.status.get().cooldownUntil).toBeNull();
  });

  it('skips queued requests once another one trips the breaker', async () => {
    const status = new StatusTracker();
    let calls = 0;
    const narrator = createClaudeNarrator({
      isEnabled: allOn, fallback: fakeTemplate(), status, limiter: new Limiter(1), breaker: new Breaker(), configKey: () => 'k',
      call: async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 5));
        throw new AIError('connection', 'offline');
      },
    });
    const replies = await Promise.all([1, 2, 3].map(() => narrator.chat(makeCtx(), 'agent', 'K', [], 'm')));
    expect(replies).toEqual(['TEMPLATE', 'TEMPLATE', 'TEMPLATE']);
    expect(calls).toBe(1);
    expect(status.get()).toMatchObject({ calls: 1, failures: 1, pending: 0, lastError: t('ai.err.connection') });
  });

  it('answers from the fallback when a request waited too long in the queue', async () => {
    let t0 = 0;
    const transport = fakeTransport({
      chat: async () => {
        t0 += 20_000; // the first request occupies the only slot for 20 s
        return ok({ reply: 'ilk' });
      },
    });
    const narrator = createClaudeNarrator({
      call: transport.call, fallback: fakeTemplate(), isEnabled: allOn, limiter: new Limiter(1), now: () => t0,
      maxQueueWaitMs: 15_000, configKey: () => 'k',
    });
    const [a, b] = await Promise.all([
      narrator.chat(makeCtx(), 'agent', 'K', [], '1'),
      narrator.chat(makeCtx(), 'agent', 'K', [], '2'),
    ]);
    expect([a, b]).toEqual(['ilk', 'TEMPLATE']);
    expect(transport.calls).toHaveLength(1);
    expect(narrator.status.get()).toMatchObject({ calls: 1, failures: 0, pending: 0, lastError: null });
  });

  it('a success clears the previous error', async () => {
    let fail = true;
    const { narrator } = setup({ chat: () => {
      if (fail) throw new AIError('invalid_output', 'schema');
      return ok({ reply: 'tamam' });
    } }, { configKey: () => 'k' });
    await narrator.chat(makeCtx(), 'agent', 'K', [], 'a');
    expect(narrator.status.get().lastError).toBe(t('ai.err.invalid'));
    fail = false;
    await narrator.chat(makeCtx(), 'agent', 'K', [], 'b');
    expect(narrator.status.get()).toMatchObject({ lastError: null, failures: 1, calls: 2 });
  });
});
