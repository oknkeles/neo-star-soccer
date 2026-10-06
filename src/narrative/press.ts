/**
 * Press conferences: three questions per occasion with prepared answers in different tones, and an
 * evaluator that turns a prepared tone or a free-text answer into bounded effects, a headline and feedback.
 */
import type { Effects, RelKey } from '../core/types';
import type { NarrativeContext, PressEvaluation, PressOccasion, PressQuestion, PressTone } from '../core/narrative-types';
import { cap, fill, normText, pickFilled, rngFrom, type Bank, type Slots } from './grammar';
import { ctxCountry, ctxSlots, inventedPerson, langOf } from './ctxutil';
import { outletsFor } from './outlets';

const b = (tr: string[], en: string[]): Bank => ({ tr, en });
export const TONES: PressTone[] = ['humble', 'confident', 'provocative', 'diplomatic', 'emotional', 'deflect'];

// ───────────────────────────── questions ─────────────────────────────

const Q: Record<string, Bank> = {
  match_pre: b(
    ['{opp} karşısında nasıl bir maç bekliyorsunuz? Sizden ne bekleyelim?', 'Hafta sonu {opp} maçı var. Kendinizi nasıl hissediyorsunuz?', 'Hoca sizi {opp} maçında düşünüyor mu? İlk onbirde olacak mısınız?', 'Bu maçta tribünün sizden beklentisi yüksek. Baskıyı hissediyor musunuz?'],
    ['What kind of game do you expect against {opp}? What should we expect from you?', '{opp} at the weekend. How are you feeling?', 'Has the manager told you whether you start against {opp}?', 'The crowd expects a lot from you in this one. Do you feel the pressure?'],
  ),
  match_good: b(
    ['Bu galibiyet sizin için ne ifade ediyor? Bu akşam sahada çok iyiydiniz.', 'Sahanın en iyisi sizdiniz. Bu performansın sırrı ne?', 'Bu skorun ardından soyunma odasında hava nasıl?'],
    ['What does this win mean to you? You were excellent tonight.', 'You were the best player on the pitch. What\'s the secret?', 'What\'s the mood in the dressing room after that result?'],
  ),
  match_bad: b(
    ['Bu akşam beklentilerin altında kaldınız. Ne yanlış gitti?', 'Taraftar bu sonuçtan memnun değil. Onlara ne söylersiniz?', 'Kendi performansınızı nasıl değerlendiriyorsunuz?'],
    ['You fell short of expectations tonight. What went wrong?', 'The fans are unhappy with the result. What would you say to them?', 'How do you rate your own performance?'],
  ),
  match_mixed: b(
    ['Karışık bir maçtı. Sonuçtan ve kendi oyunundan memnun musun?', 'Bu akşam bazı anlarda iyiydiniz bazı anlarda kayboldunuz. Nasıl gördünüz?'],
    ['A mixed game. Are you happy with the result and your own display?', 'You were good in spells and quiet in others tonight. How did you see it?'],
  ),
  form: b(
    ['Son haftalardaki formunuzu nasıl değerlendiriyorsunuz?', 'Bu sezon {goals} golünüz var. Hedefiniz kaç?', 'Bu yaşta bu kadar beklenti altında olmak zor mu?'],
    ['How do you assess your form in recent weeks?', 'You have {goals} goals this season. What is your target?', 'Is it hard carrying this much expectation at your age?'],
  ),
  rival: b(
    ['{rival} ile sürekli kıyaslanıyorsunuz. Onun hakkında ne düşünüyorsunuz?', '"{rival} daha iyi" diyenler var. Cevabınız ne?', 'Sizinle {rival} arasındaki rekabet gerçek mi, yoksa medyanın yarattığı bir hikâye mi?'],
    ['You\'re constantly compared with {rival}. What do you make of him?', 'Some say {rival} is better. What\'s your answer?', 'Is the rivalry with {rival} real, or something the media created?'],
  ),
  manager: b(
    ['Teknik direktör {manager} ile ilişkiniz nasıl?', '{manager} sizin için "umut vadeden ama sabır isteyen" dedi. Katılıyor musunuz?', 'Hocanızın taktik anlayışı sizin oyununuza uyuyor mu?'],
    ['How is your relationship with manager {manager}?', '{manager} called you "promising but needing patience". Do you agree?', 'Does your manager\'s tactical approach suit your game?'],
  ),
  transfer: b(
    ['Sizinle ilgili transfer söylentileri dolaşıyor. {club} kulübünden ayrılmayı düşünüyor musunuz?', 'Büyük kulüplerin ilgisi sizi etkiliyor mu? Menajeriniz {agent} ne diyor?', 'Gelecek yaz nerede olacaksınız?'],
    ['Transfer rumours are circling you. Are you considering leaving {club}?', 'Does interest from bigger clubs affect you? What does your agent {agent} say?', 'Where will you be next summer?'],
  ),
  fans: b(
    ['Taraftara bir mesajınız var mı?', 'Tribünün size olan sevgisini nasıl karşılıyorsunuz?', 'Sosyal medyada taraftarlar sizi çok konuşuyor. Okuyor musunuz?'],
    ['Do you have a message for the fans?', 'How do you take the love the stands have shown you?', 'Fans are talking about you a lot on social media. Do you read it?'],
  ),
  personal: b(
    ['Futbolun dışında hayatınızda neler oluyor? Aileniz bu süreci nasıl karşılıyor?', 'Bu yaşta şöhret ve para sizi nasıl etkiledi?', '{hometown} günlerinizden bu yana ne değişti?'],
    ['What is happening in your life off the pitch? How is your family taking all this?', 'How have fame and money changed you at such a young age?', 'What has changed since your days back in {hometown}?'],
  ),
  team: b(
    ['Takımın havası nasıl? Bu sezon hedef ne olmalı?', '{club} bu sezon neyi hedeflemeli sizce?', 'Soyunma odasında sizin rolünüz ne?'],
    ['How is the mood in the squad? What should the target be this season?', 'What should {club} be aiming for this season?', 'What is your role in the dressing room?'],
  ),
  ambition: b(
    ['Hayaliniz ne? En büyük hedefiniz nedir?', 'Beş yıl sonra kendinizi nerede görüyorsunuz?', 'Dünyanın en iyisi olmak istiyor musunuz?'],
    ['What is your dream? What is your biggest goal?', 'Where do you see yourself in five years?', 'Do you want to be the best in the world?'],
  ),
  scandal: b(
    ['Hakkınızdaki haberler için ne diyeceksiniz? Doğru mu?', 'Taraftarlardan özür dilemeyi düşünüyor musunuz?', 'Bu olay kariyerinizi nasıl etkileyecek?'],
    ['What do you say about the stories written about you? Are they true?', 'Are you considering apologising to the fans?', 'How will this affect your career?'],
  ),
  national: b(
    ['Millî takım hakkında ne düşünüyorsunuz? Formayı giymek ne demek?', 'Millî takım hocası sizi çağırırsa hazır mısınız?'],
    ['What are your thoughts on the national team? What does wearing the shirt mean?', 'If the national manager calls, are you ready?'],
  ),
  contract: b(
    ['Sözleşme görüşmeleri nasıl gidiyor? Kalacak mısınız?', 'Yönetim size yeni bir teklif yaptı mı?'],
    ['How are the contract talks going? Will you stay?', 'Has the board made you a new offer?'],
  ),
};

const GENERIC: Record<PressTone, Bank> = {
  humble: b(
    ['Ben sadece işimi yapmaya çalışıyorum. Önce takım, sonra ben.', 'Öğrenmem gereken çok şey var. Hocama ve arkadaşlarıma minnettarım.', 'Konuşmak kolay; önemli olan sahada ter dökmek. Mütevazı kalmak istiyorum.'],
    ['I\'m just trying to do my job. Team first, me second.', 'I still have so much to learn. I\'m grateful to the gaffer and my teammates.', 'Talking is easy; what matters is sweating on the pitch. I want to stay humble.'],
  ),
  confident: b(
    ['Kendime güveniyorum. Ne yapmam gerektiğini biliyorum.', 'Hedefim yüksek ve ona ulaşacağıma inanıyorum. Göreceksiniz.', 'Buraya kazanmak için geldim, başka seçeneğim yok.'],
    ['I believe in myself. I know what I need to do.', 'My goals are high and I believe I\'ll reach them. You\'ll see.', 'I came here to win, there is no other option.'],
  ),
  provocative: b(
    ['Beni bitmiş sananlar yanılıyor; ben daha yeni başlıyorum.', 'Eleştirenler yazmaya devam etsin, ben de sahada cevap vermeye devam edeyim.', 'Beni küçümseyenler çok yakında biletini alıp beni izlemeye gelecek.'],
    ['Those who think I\'m finished are wrong; I\'m just getting started.', 'Let the critics keep writing; I\'ll keep answering on the pitch.', 'Those who looked down on me will soon be buying tickets to watch me.'],
  ),
  diplomatic: b(
    ['Herkesin görüşüne saygım var. Zaman gösterecek.', 'Her iki tarafın da haklı yanları var. Önemli olan kulübün çıkarı.', 'Bu konuşmak için doğru zaman değil ama herkese saygılarımı sunarım.'],
    ['I respect everyone\'s opinion. Time will tell.', 'Both sides have a point. What matters is the club\'s interest.', 'This isn\'t the right time to discuss it, but I respect everyone involved.'],
  ),
  emotional: b(
    ['Bu benim için sadece futbol değil, ailemin, mahallemin hayali. Duygulanmamak elde değil.', 'Küçükken bu anı hayal ederdim. Şimdi yaşıyor olmak gözlerimi doldurdu.', 'Kalbimi bu işe koydum. Her maçta ailem aklımda.'],
    ['This is not just football; it\'s my family\'s dream, my neighbourhood\'s dream. I can\'t help getting emotional.', 'I dreamed of this moment as a kid. Living it now brings tears to my eyes.', 'My heart is in this. My family is on my mind in every match.'],
  ),
  deflect: b(
    ['Yorum yok. Bir sonraki soru lütfen.', 'Bunu menajerime sormalısınız. Ben sadece futbola odaklıyım.', 'Şu an tek konum antrenman. Gerisi için zaman var.'],
    ['No comment. Next question, please.', 'You should ask my agent. I\'m only focused on football.', 'Right now my only topic is training. There\'s time for the rest.'],
  ),
};

const SPECIFIC: Record<string, Partial<Record<PressTone, Bank>>> = {
  rival: {
    humble: b(['{rival} çok iyi bir oyuncu; onunla yarışmak beni daha iyi yapıyor.'], ['{rival} is a very good player; competing with him makes me better.']),
    confident: b(['{rival} iyi, ama beni kimse durduramaz. Aradaki farkı sahada göreceksiniz.'], ['{rival} is good, but nobody stops me. You\'ll see the difference on the pitch.']),
    provocative: b(['{rival} mı? Haberlerde çok görüyorum, sahada pek değil.', 'İki kişilik yarış değil bu; ben koşuyorum, o arkamdan bakıyor.'], ['{rival}? I see him a lot in the headlines, not so much on the pitch.', 'It\'s not a race of two; I run, he watches from behind.']),
    diplomatic: b(['{rival} büyük saygı hak ediyor. İkimiz de aynı hayali kuruyoruz; bu rekabet futbola yarıyor.'], ['{rival} deserves great respect. We both chase the same dream; this rivalry is good for football.']),
    emotional: b(['Onunla aynı yıllarda büyüdük, aynı hayalleri kurduk. Kim kazanırsa kazansın bu hikâye güzel.'], ['We grew up in the same years chasing the same dreams. Whoever wins, it\'s a beautiful story.']),
    deflect: b(['Rakiplerim hakkında konuşmak yerine kendi işime bakmayı tercih ederim.'], ['I\'d rather focus on my own job than talk about opponents.']),
  },
  manager: {
    humble: b(['{manager} bana çok şey öğretti. Her kararına saygı duyuyorum.'], ['{manager} has taught me a lot. I respect every decision he makes.']),
    confident: b(['Hocamın bana güvendiğini biliyorum. O güveni sahada ödeyeceğim.'], ['I know the manager trusts me. I\'ll repay that on the pitch.']),
    provocative: b(['Sahada olmam gerektiğini düşünüyorum. Dakika konusunda hocanın cevap vermesi lazım.'], ['I think I should be on the pitch. The manager owes an answer on minutes.']),
    diplomatic: b(['Hocamla ilişkim profesyonel ve sağlıklı. Ortak amacımız kulübün başarısı.'], ['My relationship with the manager is professional and healthy. We share one goal: the club\'s success.']),
    emotional: b(['{manager}, bana inandığı için ona minnettarım. Bir abi gibi.'], ['I\'m grateful to {manager} for believing in me. Like an older brother.']),
    deflect: b(['Taktik konuları hocamıza sormak lazım. Ben sadece uygulayıcıyım.'], ['Tactical matters are for the manager. I just carry them out.']),
  },
  transfer: {
    humble: b(['Şu an {club} oyuncusuyum ve burada mutluyum. Gerisi menajerimin işi.'], ['I\'m a {club} player right now and happy here. The rest is my agent\'s job.']),
    confident: b(['İlgiyi hak ediyorum ama önce burada başarılı olmalıyım.'], ['I deserve the interest, but first I must succeed here.']),
    provocative: b(['Büyükler beni istiyorsa bunun bir nedeni var. {club} yönetimi bunu iyi bilir.'], ['If the big clubs want me, there\'s a reason. The {club} board knows it well.']),
    diplomatic: b(['Kulübüme saygım sonsuz; menajerim ve yönetim konuşuyor, doğru karar verilecek.'], ['I have endless respect for my club; my agent and the board are talking and the right decision will be made.']),
    emotional: b(['Bu forma bana çok şey verdi. Kalbim burada, ama kariyer de kısa.'], ['This shirt has given me so much. My heart is here, but careers are short.']),
    deflect: b(['Transferi menajerime sorun; ben sahaya bakıyorum.'], ['Ask my agent about transfers; I look at the pitch.']),
  },
  scandal: {
    humble: b(['Hata yaptıysam sorumluluğunu alırım. Taraftardan ve ailemden özür dilerim.'], ['If I made a mistake, I take responsibility. I apologise to the fans and my family.']),
    confident: b(['Gerçekler ortaya çıkınca herkes görecek. Temiz bir vicdanla sahaya çıkıyorum.'], ['Everyone will see once the facts come out. I take the pitch with a clear conscience.']),
    provocative: b(['Bu bir karalama kampanyası. Haberleri yazanlar mahkemede görüşmeye hazır olsun.'], ['This is a smear campaign. Those who wrote it should be ready to meet me in court.']),
    diplomatic: b(['Süreç içinde açıklama yapacağız. Şimdilik kulübümün prosedürüne saygı gösteriyorum.'], ['We will make a statement in due course. For now I respect the club\'s procedure.']),
    emotional: b(['Beni tanıyan bilir. Ailem için çok üzücü; lütfen sınırı aşmayın.'], ['Those who know me, know. It\'s very painful for my family; please don\'t cross the line.']),
    deflect: b(['Yorum yapmayacağım. Açıklamayı avukatım yapacak.'], ['I won\'t comment. My lawyer will make a statement.']),
  },
};
SPECIFIC.contract = SPECIFIC.transfer;

const TOPIC_BY_OCCASION: Record<PressOccasion, [string, number][]> = {
  pre_match: [['match', 4], ['form', 2.5], ['rival', 2], ['team', 2], ['manager', 1.5], ['fans', 1.5]],
  post_match: [['match', 4.5], ['form', 2], ['manager', 1.5], ['fans', 1.5], ['rival', 1.5], ['team', 1.5]],
  transfer: [['transfer', 5], ['contract', 2.5], ['fans', 2], ['ambition', 2], ['manager', 1.5], ['personal', 1]],
  scandal: [['scandal', 6], ['personal', 2], ['fans', 2], ['manager', 1.5], ['team', 1]],
  milestone: [['ambition', 3], ['fans', 3], ['personal', 2], ['team', 2], ['national', 1.5], ['rival', 1.5], ['form', 1.5]],
  unveiling: [['ambition', 3], ['transfer', 2], ['fans', 3], ['manager', 2], ['personal', 1.5], ['team', 2]],
};

/** Pull the opponent / score / personal numbers out of the game's free-text press facts. */
function parsePressFacts(facts: string): Slots {
  const out: Slots = {};
  const opp = facts.match(/kapsamındaki (.+?) maçı/)?.[1]
    ?? facts.match(/\), (.+?) maçının \(/)?.[1]
    ?? facts.match(/match against (.+?) \(/)?.[1]
    ?? facts.match(/match against (.+?)\.?$/)?.[1];
  if (opp) out.opp = opp.trim();
  const sc = facts.match(/\((\d+)-(\d+)\)/);
  if (sc) { out.gf = sc[1]; out.ga = sc[2]; out.score = `${sc[1]}-${sc[2]}`; }
  return out;
}

export function makePressQuestions(ctx: NarrativeContext, occasion: PressOccasion, facts: string): PressQuestion[] {
  const lang = langOf(ctx);
  const rng = rngFrom('press', ctx.season, ctx.week, ctx.player.name, occasion, (facts ?? '').slice(0, 100));
  const parsed = parsePressFacts(facts ?? '');
  const slots: Slots = { ...ctxSlots(ctx), ...parsed };
  const sc = facts?.match(/\((\d+)-(\d+)\)/);
  const goodGame = sc ? Number(sc[1]) > Number(sc[2]) : ctx.recentResults[ctx.recentResults.length - 1]?.startsWith(lang === 'tr' ? 'G' : 'W');
  const badGame = sc ? Number(sc[1]) < Number(sc[2]) : false;
  const topicPool = TOPIC_BY_OCCASION[occasion].filter(([tp]) => {
    if (tp === 'rival') return !!ctx.rival;
    if (tp === 'manager') return !!ctx.club?.managerName;
    if (tp === 'national') return ctx.careerStats.caps > 0 || ctx.player.fame > 30;
    if (tp === 'match' && occasion === 'pre_match') return !!parsed.opp || true;
    return true;
  });
  const topics: string[] = [];
  while (topics.length < 3 && topics.length < topicPool.length) {
    const t = rng.weighted(topicPool.filter(([x]) => !topics.includes(x)), ([, w]) => w)[0];
    topics.push(t);
  }
  // the first question should be the occasion's "headline" topic
  const lead = TOPIC_BY_OCCASION[occasion][0][0];
  if (!topics.includes(lead)) topics[0] = lead;

  const traitBias = (tone: PressTone): number => {
    const has = (t: string) => (ctx.player.traits as string[]).includes(t);
    let w = 1;
    if (has('showman') && (tone === 'provocative' || tone === 'confident')) w += 1.2;
    if (has('hothead') && tone === 'provocative') w += 1.5;
    if (has('calm') && (tone === 'diplomatic' || tone === 'humble')) w += 1;
    if (has('family_first') && tone === 'emotional') w += 1.2;
    if (has('media_darling')) w += 0.3;
    return w;
  };

  return topics.map((topic, i) => {
    const key = topic === 'match'
      ? (occasion === 'pre_match' ? 'match_pre' : badGame ? 'match_bad' : goodGame ? 'match_good' : 'match_mixed')
      : topic;
    const bank = Q[key] ?? Q.form;
    const text = cap(fill(pickFilled(bank[lang], slots, rng, new Set(['score'])), slots, rng, lang), lang);
    // three tones + one extra on important questions: always one safe, one bold
    const safe: PressTone[] = ['humble', 'diplomatic', 'deflect'];
    const bold: PressTone[] = ['confident', 'provocative'];
    const pickTone = (from: PressTone[], not: PressTone[]) => rng.weighted(from.filter((x) => !not.includes(x)), traitBias);
    const chosen: PressTone[] = [];
    chosen.push(pickTone(safe, chosen));
    chosen.push(pickTone(bold, chosen));
    chosen.push(pickTone(['emotional', 'diplomatic', 'humble', 'confident'] as PressTone[], chosen));
    if (topic === 'scandal' || topic === 'rival' || topic === 'transfer' || rng.chance(0.4)) chosen.push(pickTone(TONES, chosen));
    rng.shuffle(chosen);
    const qid = `PQ-${ctx.season}-${ctx.week}-${i}`;
    const options = chosen.map((tone) => {
      const bankT = SPECIFIC[topic]?.[tone] && rng.chance(0.85) ? SPECIFIC[topic][tone]! : GENERIC[tone];
      return { id: `${qid}.${tone}`, tone, text: cap(fill(pickFilled(bankT[lang], slots, rng), slots, rng, lang), lang) };
    });
    return {
      id: qid,
      journalist: inventedPerson(ctx, 'journalist', `${occasion}${i}`),
      outlet: rng.pick(outletsFor(ctxCountry(ctx))),
      text,
      topic,
      options,
    };
  });
}

// ───────────────────────────── evaluation ─────────────────────────────

const BASE: Record<PressTone, { rel: Partial<Record<RelKey, number>>; fame: number; morale: number }> = {
  humble: { rel: { media: 3, fans: 2, manager: 2, teammates: 2 }, fame: 0.5, morale: 0 },
  confident: { rel: { media: 1, fans: 3, teammates: 1 }, fame: 1.5, morale: 2 },
  provocative: { rel: { media: 3, fans: 3, manager: -3, teammates: -1 }, fame: 3, morale: 1 },
  diplomatic: { rel: { media: 2, manager: 2, teammates: 1 }, fame: 0.5, morale: 0 },
  emotional: { rel: { fans: 4, media: 1, family: 2 }, fame: 1, morale: 2 },
  deflect: { rel: { media: -3, fans: -1, manager: 1 }, fame: -0.5, morale: 0 },
};

const KW = {
  humble: ['takım', 'arkadaş', 'hocam', 'teşekkür', 'mütevazı', 'çalış', 'sabır', 'saygı', 'öğren', 'minnettar', 'team', 'teammates', 'thank', 'humble', 'work hard', 'respect', 'grateful', 'learn'],
  arrogant: ['en iyi', 'ben bilirim', 'çok kolay', 'kimse', 'rakip yok', 'zayıf', 'efsane', 'easy', 'the best', 'nobody', 'better than', 'weak', 'legend', 'i am the', 'beat anyone', 'ezerim'],
  insult: ['aptal', 'salak', 'gerizekal', 'rezil', 'şerefsiz', 'ahmak', 'pislik', 'çöp', 'idiot', 'stupid', 'trash', 'garbage', 'loser', 'clown', 'pathetic', 'shut up', 'moron', 'bastard', 'fuck', 'siktir'],
  fans: ['taraftar', 'tribün', 'destek', 'sevgi', 'fans', 'supporters', 'support', 'love you'],
  emotional: ['kalb', 'gözyaş', 'hayal', 'duygu', 'gurur', 'aile', 'anne', 'baba', 'heart', 'tears', 'dream', 'emotional', 'proud', 'family', 'mum', 'dad'],
  diplomatic: ['saygı', 'zaman gösterecek', 'her iki', 'kulübün çıkar', 'profesyonel', 'both sides', 'time will tell', 'professional', 'respect everyone', 'at the right time'],
  confident: ['güveniyor', 'inanıyor', 'göreceksiniz', 'kazanaca', 'hedef', 'şampiyon', 'i believe', 'i will', "we'll win", 'we will win', 'confident', 'trust myself', 'goal is'],
  deflect: ['yorum yok', 'bilmiyorum', 'menajer', 'sonraki soru', 'no comment', "don't know", 'next question', 'ask my agent', 'ask the club'],
  leave: ['ayrıl', 'gitmek istiyorum', 'başka kulüp', 'leave', 'move on', 'want out', 'new challenge'],
  stay: ['kalıyorum', 'buradayım', 'bu formayı', 'sadık', 'stay', 'loyal', 'not going anywhere', 'happy here'],
};

const hits = (txt: string, list: string[]) => list.reduce((n, k) => n + (txt.includes(k) ? 1 : 0), 0);

export interface FreeTextRead { tone: PressTone; insults: number; arrogance: number; humility: number; fans: number; mentionsRival: boolean; mentionsManager: boolean; leave: boolean; stay: boolean; words: number }

/** Keyword + sentiment reading of a typed answer (TR and EN). */
export function readFreeText(raw: string, ctx: NarrativeContext): FreeTextRead {
  const txt = normText(raw);
  const words = txt.split(/\s+/).filter(Boolean).length;
  const insults = hits(txt, KW.insult);
  const arrogance = hits(txt, KW.arrogant);
  const humility = hits(txt, KW.humble);
  const fans = hits(txt, KW.fans);
  const rivalLast = normText(ctx.rival?.name ?? '').split(/\s+/).slice(-1)[0];
  const mgrLast = normText(ctx.club?.managerName ?? '').split(/\s+/).slice(-1)[0];
  const mentionsRival = !!rivalLast && rivalLast.length > 2 && txt.includes(rivalLast);
  const mentionsManager = (!!mgrLast && mgrLast.length > 2 && txt.includes(mgrLast)) || /hocam|teknik direktör|gaffer|boss|manager/.test(txt);
  const scores: Record<PressTone, number> = {
    humble: humility * 1.2 - arrogance * 1.5 - insults * 2,
    confident: hits(txt, KW.confident) * 1.2 + arrogance * 0.8,
    provocative: insults * 3 + arrogance * 1.2 + (mentionsRival && arrogance + insults > 0 ? 2 : 0),
    diplomatic: hits(txt, KW.diplomatic) * 1.5,
    emotional: hits(txt, KW.emotional) * 1.1 + (/[❤️😢🥹]/.test(raw) ? 1 : 0),
    deflect: hits(txt, KW.deflect) * 2.5 + (words <= 3 ? 2 : 0),
  };
  const tone = (Object.entries(scores) as [PressTone, number][]).sort((a, c) => c[1] - a[1])[0];
  return {
    tone: tone[1] > 0 ? tone[0] : words > 12 ? 'diplomatic' : 'deflect',
    insults, arrogance, humility, fans, mentionsRival, mentionsManager, words,
    leave: hits(txt, KW.leave) > 0, stay: hits(txt, KW.stay) > 0,
  };
}

const HEAD: Record<PressTone, Bank> = {
  humble: b(
    ['{first}: «{quote}» — mütevazı bir duruş', 'Alçakgönüllü {first}: «{quote}»', '{first}\'tan olgun açıklama: «{quote}»'],
    ['{first}: "{quote}" — a humble stance', 'Down-to-earth {first}: "{quote}"', 'Mature words from {first}: "{quote}"'],
  ),
  confident: b(
    ['{first} iddialı konuştu: «{quote}»', '{player}: «{quote}» — özgüven tam!', '«{quote}» diyen {first} hedefi büyüttü'],
    ['{first} talks big: "{quote}"', '{player}: "{quote}" — full of confidence!', '"{quote}" says {first}, raising the bar'],
  ),
  provocative: b(
    ['{first} ortalığı karıştırdı: «{quote}»', 'Olay açıklama! {first}: «{quote}»', '{player} fırtına kopardı: «{quote}»'],
    ['{first} stirs the pot: "{quote}"', 'Explosive quote! {first}: "{quote}"', '{player} sparks a storm: "{quote}"'],
  ),
  diplomatic: b(
    ['{first} dengeyi korudu: «{quote}»', 'Diplomat {first}: «{quote}»', '{first} ipleri gerginleştirmedi: «{quote}»'],
    ['{first} keeps the balance: "{quote}"', 'The diplomat {first}: "{quote}"', '{first} keeps the peace: "{quote}"'],
  ),
  emotional: b(
    ['{first} duygulandı: «{quote}»', 'Yürekten konuştu: {first} «{quote}»', '{first}\'tan kalpten sözler: «{quote}»'],
    ['{first} gets emotional: "{quote}"', 'Straight from the heart: {first} "{quote}"', 'Heartfelt words from {first}: "{quote}"'],
  ),
  deflect: b(
    ['{first} sorulara yan çizdi', '{first} cevap vermedi: «{quote}»', 'Soru çok, cevap az: {first} geçiştirdi'],
    ['{first} dodges the questions', '{first} gives nothing away: "{quote}"', 'Plenty asked, little answered: {first} sidesteps'],
  ),
};

const FEEDBACK: Record<PressTone, { good: Bank; bad: Bank }> = {
  humble: {
    good: b(['Basın bu olgun duruşu takdir etti; hoca ve takım da memnun.', 'Mütevazı cevabın hem soyunma odasında hem tribünde karşılık buldu.'], ['The press liked the maturity; the manager and squad are pleased.', 'Your humble answer landed well in the dressing room and in the stands.']),
    bad: b(['Fazla çekingen kaldın; bazıları "kendine güvensiz" diye yazdı.'], ['A touch too timid; some wrote that you lack self-belief.']),
  },
  confident: {
    good: b(['Özgüvenin taraftarı coşturdu; basın seni konuşuyor.', 'İddialı duruşun soyunma odasına da moral verdi.'], ['Your confidence fired up the fans and the press is talking about you.', 'The bold stance lifted the dressing room too.']),
    bad: b(['İddialı sözler formsuzluk döneminde "kibir" olarak okundu.', 'Söylediklerini sahada ödemek zorundasın; basın not aldı.'], ['Big words during a poor run read as arrogance.', 'You now have to back it up on the pitch; the press took note.']),
  },
  provocative: {
    good: b(['Manşetleri sen yazdın! Taraftar coştu, ama hoca kaşını çattı.', 'Sert çıkış ses getirdi; takipçi sayın fırladı.'], ['You wrote the headlines! Fans loved it, though the gaffer frowned.', 'The sharp comment made noise; your follower count jumped.']),
    bad: b(['Sözlerin bumerang gibi döndü; basın ve yönetim tepkili.', 'Bu kadar sert konuşmak hem hocayı hem sponsorları rahatsız etti.'], ['The words boomeranged; press and board are unhappy.', 'Talking this hard upset the manager and the sponsors alike.']),
  },
  diplomatic: {
    good: b(['Dengeli çıkış herkesi memnun etti; yangın çıkmadı.', 'Diplomatik cevap hocanın ve yönetimin takdirini kazandı.'], ['A balanced answer kept everyone happy; no fires started.', 'The diplomatic reply earned the respect of manager and board.']),
    bad: b(['Fazla kaçamak göründün; taraftar net bir söz bekliyordu.'], ['You looked evasive; the fans wanted something clear.']),
  },
  emotional: {
    good: b(['Samimiyetin taraftarın kalbine dokundu.', 'Duygusal cevap sosyal medyada paylaşım rekoru kırdı.'], ['Your sincerity touched the supporters.', 'The emotional answer was shared widely online.']),
    bad: b(['Bazı yorumcular duygusallığı "profesyonellik eksikliği" diye yorumladı.'], ['Some pundits read the emotion as a lack of professionalism.']),
  },
  deflect: {
    good: b(['Konuyu kapattın; bugünlük kimse peşini bırakmayacak gibi görünmüyor.'], ['You shut the topic down; nobody seems to be chasing you today.']),
    bad: b(['Cevap vermemek basını kızdırdı; "kaçıyor" yazıldı.', 'Geçiştirmen gazetecilerin hoşuna gitmedi.'], ['Dodging irritated the press; "he runs away" was written.', 'The journalists did not appreciate being brushed off.']),
  },
};

const cl = (v: number, m: number) => Math.max(-m, Math.min(m, v));

const quoteOf = (s: string, lang: 'tr' | 'en'): string => {
  const t = s.trim().replace(/\s+/g, ' ');
  const sentence = t.split(/(?<=[.!?…])\s/)[0] ?? t;
  const out = sentence.length > 74 ? `${sentence.slice(0, 71).trimEnd()}…` : sentence;
  return out.replace(/[«»"]/g, '').replace(/[.]$/, lang === 'tr' ? '' : '');
};

export function evaluateAnswer(ctx: NarrativeContext, q: PressQuestion, answer: { optionId?: string; text?: string }): PressEvaluation {
  const lang = langOf(ctx);
  const opt = answer.optionId ? q.options.find((o) => o.id === answer.optionId) : undefined;
  const free = (answer.text ?? '').trim();
  const text = free || opt?.text || '';
  const read = free ? readFreeText(free, ctx) : null;
  const tone: PressTone = (free ? read!.tone : opt?.tone) ?? read?.tone ?? 'deflect';
  const rng = rngFrom('pressEval', ctx.season, ctx.week, q.id, tone, text.slice(0, 40));
  const topic = q.topic;
  const has = (t: string) => (ctx.player.traits as string[]).includes(t);
  const base = BASE[tone];
  const rel: Partial<Record<RelKey, number>> = { ...base.rel };
  let fame = base.fame;
  let morale = base.morale;
  const add = (k: RelKey, d: number) => { rel[k] = (rel[k] ?? 0) + d; };

  // topic modulation
  switch (topic) {
    case 'rival':
      if (tone === 'provocative') { fame += 1; add('fans', 1); add('media', 1); }
      if (tone === 'humble' || tone === 'diplomatic') add('media', 1);
      break;
    case 'manager':
      if (tone === 'provocative') add('manager', -3);
      if (tone === 'humble' || tone === 'emotional') add('manager', 2);
      if (tone === 'deflect') add('manager', 1);
      break;
    case 'transfer': case 'contract':
      if (tone === 'confident' || tone === 'provocative') { add('fans', -2); add('agent', 2); }
      if (tone === 'emotional' || tone === 'humble') add('fans', 2);
      if (tone === 'deflect') { add('agent', 1); add('media', 2); }
      break;
    case 'scandal':
      if (tone === 'provocative') { add('media', -6); add('fans', -2); add('sponsors', -3); fame -= 1; }
      if (tone === 'humble' || tone === 'emotional') { add('media', 3); add('fans', 2); add('sponsors', 1); }
      if (tone === 'deflect') add('media', -2);
      if (tone === 'confident') { add('media', -2); add('sponsors', -1); }
      break;
    case 'fans':
      if (tone === 'emotional' || tone === 'humble') add('fans', 2);
      if (tone === 'deflect') add('fans', -2);
      break;
    case 'personal':
      if (tone === 'emotional') { add('family', 2); add('partner', 1); }
      if (tone === 'deflect') add('media', 1);
      break;
    case 'team': case 'match':
      if (tone === 'humble' || tone === 'diplomatic') add('teammates', 1);
      if (tone === 'provocative') add('teammates', -2);
      break;
    default: break;
  }

  // form context: boasting while out of form backfires, boasting while hot lands
  const hot = ctx.player.form >= 62 || ctx.seasonStats.avgRating >= 7.2;
  const cold = ctx.player.form <= 40 || (ctx.seasonStats.apps > 3 && ctx.seasonStats.avgRating < 6.0);
  if (tone === 'confident' || tone === 'provocative') {
    if (hot) { fame += 0.8; add('fans', 1); }
    if (cold) { add('media', -2); morale -= 1; fame -= 0.5; }
  }

  // traits
  if (has('showman') && (tone === 'provocative' || tone === 'confident')) { fame += 1; add('fans', 1); }
  if (has('hothead') && tone === 'provocative') { add('media', -1); add('teammates', -1); }
  if (has('media_darling')) add('media', 1);
  if (has('calm') && (tone === 'diplomatic' || tone === 'humble')) add('media', 1);
  if (has('leader') && tone === 'confident') add('teammates', 1);
  if (has('family_first') && tone === 'emotional') add('family', 1);
  if (has('loyal') && (topic === 'transfer' || topic === 'contract') && (tone === 'humble' || tone === 'emotional')) add('fans', 1);
  if (has('mercenary') && tone === 'emotional' && (topic === 'transfer' || topic === 'contract')) add('fans', -1);

  // relationships: a friendly press forgives and amplifies; a hostile one doesn't
  const mediaRel = ctx.relationships.media ?? 50;
  const fansRel = ctx.relationships.fans ?? 50;
  const mm = 0.8 + mediaRel / 250;
  const fm = 0.8 + fansRel / 250;
  if (rel.media) rel.media *= rel.media > 0 ? mm : 2 - mm;
  if (rel.fans) rel.fans *= rel.fans > 0 ? fm : 2 - fm;

  // free text refinements
  let insulted = false;
  const flags: Record<string, string | number | boolean> = {};
  if (read) {
    if (read.insults > 0) {
      insulted = true;
      add('media', -3 - Math.min(3, read.insults)); add('fans', -1); add('manager', -3); add('sponsors', -2); fame += 1.5; morale -= 1;
    }
    if (read.arrogance > 0 && read.insults === 0) { add('media', -1); add('teammates', -1); fame += 0.5; }
    if (read.humility > 1 && read.arrogance === 0) add('manager', 1);
    if (read.fans > 0 && read.insults === 0) add('fans', Math.min(3, read.fans + 1));
    if (read.mentionsRival && (read.insults > 0 || read.arrogance > 0)) { flags['narr.rival.beef'] = true; fame += 1; add('fans', 1); }
    if (read.mentionsManager && read.insults === 0 && read.humility > 0) add('manager', 2);
    if (read.leave && (topic === 'transfer' || topic === 'contract')) { add('fans', -4); add('agent', 2); add('manager', -2); }
    if (read.stay && (topic === 'transfer' || topic === 'contract')) { add('fans', 3); add('manager', 1); }
    if (read.words >= 18 && read.insults === 0) add('media', 1); // took the question seriously
    if (read.words <= 3 && tone !== 'deflect') add('media', -1);
  }
  if (tone === 'provocative' && topic === 'rival') flags['narr.rival.beef'] = true;
  if (topic === 'scandal') flags['narr.press.scandal'] = tone;

  // the press has a mood too
  const jitter = (v: number) => v + rng.float(-0.4, 0.4);
  const effects: Effects = { rel: {}, fame: Math.round(cl(fame, 4) * 10) / 10, morale: Math.round(cl(morale, 6)) };
  let net = 0;
  for (const k of Object.keys(rel) as RelKey[]) {
    const v = Math.round(cl(jitter(rel[k] ?? 0), 8));
    if (v !== 0) { effects.rel![k] = v; if (k === 'media' || k === 'fans' || k === 'manager') net += v; }
  }
  if (!effects.fame) delete effects.fame;
  if (!effects.morale) delete effects.morale;
  if (Object.keys(flags).length) effects.flags = flags;

  const quote = quoteOf(text || q.text, lang);
  const headSlots: Slots = { ...ctxSlots(ctx), quote };
  let headline = cap(fill(pickFilled(HEAD[insulted ? 'provocative' : tone][lang], headSlots, rng), headSlots, rng, lang), lang);
  if (!text) headline = headline.replace(/[«"]\s*[»"]/g, '');
  const fb = net >= 2 || (net >= 0 && (effects.fame ?? 0) > 1) ? FEEDBACK[tone].good : FEEDBACK[tone].bad;
  const feedback = insulted
    ? (lang === 'tr' ? 'Hakaret içeren sözler gündem oldu; basın ve yönetim tepkili.' : 'The insults became the story; press and board are furious.')
    : cap(fill(pickFilled(fb[lang], headSlots, rng), headSlots, rng, lang), lang);
  return { tone, effects, headline: headline.slice(0, 160), feedback };
}
