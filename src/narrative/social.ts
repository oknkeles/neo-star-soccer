/**
 * The feed: posts from varied author archetypes (ultras, haters, meme pages, journalists, pundits,
 * rival fans, brands, teammates, the partner, the club account …) whose mood follows the trigger.
 */
import type { SocialPost } from '../core/types';
import type { NarrativeContext, SocialTrigger } from '../core/narrative-types';
import { cap, fill, pickFilled, rngFrom, type Bank, type Slots } from './grammar';
import { ctxCulture, ctxSlots, inventedPerson, langOf } from './ctxutil';
import { firstName, lastName, slug } from './names';
import { matchSlots } from './news';
import { outletsFor } from './outlets';
import { ctxCountry } from './ctxutil';

type Mood = 'good' | 'bad' | 'mixed' | 'hype' | 'betray' | 'idle';
type Arch = 'ultra' | 'hater' | 'meme' | 'journalist' | 'pundit' | 'rivalFan' | 'brand' | 'teammate' | 'partner' | 'club' | 'rival' | 'oldFan' | 'fan';
type PostKind = SocialPost['author']['kind'];

const b = (tr: string[], en: string[]): Bank => ({ tr, en });

const POSTS: Record<Arch, Partial<Record<Mood, Bank>>> = {
  ultra: {
    good: b(
      ['Helal olsun {first}! {club} seninle gurur duyuyor! 🔥', 'Bu çocuk başka! Tribün tek ses: {first}, {first}, {first}!', 'Kuzey tribünü ayakta! {first} gibi evlat yetiştiren {club} sağ olsun!', 'İşte bu be! Formayı böyle terletirler. Helal olsun {last}!'],
      ['Take a bow {first}! {club} is proud of you 🔥', 'This kid is different! The whole end is singing: {first}, {first}, {first}!', 'North stand on its feet! {first} is the real deal.', 'That\'s how you sweat for the shirt. Come on {last}!'],
    ),
    bad: b(
      ['Yönetim istifa! Bu kadro bu formayı hak etmiyor. {first}, sahada ter göremedik.', 'Tribün seni sevdi {first}, sen bizi sevdin mi? Bugün hiç yoktun.', 'Bu forma ağır, {first}. Ya sahada can ver ya da yol ver.'],
      ['Board out! This squad doesn\'t deserve the shirt. {first}, we didn\'t see any fight.', 'The stand loves you {first} — did you love us back today? You weren\'t there.', 'This shirt is heavy, {first}. Fight for it or step aside.'],
    ),
    mixed: b(
      ['{first} bugün sönüktü ama bizim çocuk. Desteğimiz tam, bir sonraki maça bakalım. 💪', 'Her maç parlanmaz. {first} arkasında {club} tribünü var.'],
      ['{first} was quiet today but he\'s ours. The support is unconditional, onto the next one. 💪', 'Nobody shines every week. {first} has the whole {club} end behind him.'],
    ),
    hype: b(
      ['{club} ailesine hoş geldin {first}! Bu şehir seni bağrına basacak!', 'Hoş geldin {first}! Kuzey tribününde adına pankart hazırlıyoruz bile 🔥'],
      ['Welcome to the {club} family {first}! This city will take you to its heart!', 'Welcome {first}! We are already painting your banner for the north stand 🔥'],
    ),
    idle: b(
      ['Hafta sonu {club} maçı için biletler tükendi! Tribünde buluşalım!', 'Bu takımın ruhunu anlatamazsın, yaşarsın. {club} her zaman!'],
      ['Tickets for the weekend sold out! See you on the terraces!', 'You can\'t explain this club\'s soul, you have to live it. {club} forever!'],
    ),
  },
  oldFan: {
    betray: b(
      ['Gittin {first}. Gönlümüzde yerin hep olacak ama bu formayı unutma.', 'Hakkımızı helal ediyoruz {first}. Git, başarılı ol — ama bize karşı değil!', '"Sadakat" dediğin bu muymuş {first}... Yine de iyi şanslar.'],
      ['You\'re gone {first}. You\'ll always have a place in our hearts, just don\'t forget this shirt.', 'No hard feelings {first}. Go and succeed — just not against us!', 'Is this what loyalty looks like, {first}? Good luck anyway.'],
    ),
    mixed: b(
      ['{first} gitti, hayat devam. Teşekkürler her şey için.'],
      ['{first} has gone and life goes on. Thanks for everything.'],
    ),
  },
  hater: {
    good: b(
      ['Bir maçta gol atınca kral mı oldu? Bekleyelim bakalım.', 'Tek parlama. Şişirmeyin şu çocuğu, {first} henüz bir şey kanıtlamadı.', 'Rakip savunma uyuyordu, {first} ne yaptıysa bedavaydı.'],
      ['One good game and he\'s a king? Let\'s wait and see.', 'One flash in the pan. Don\'t inflate this lad, {first} hasn\'t proved anything yet.', 'The defence was asleep. Anything {first} did was gifted.'],
    ),
    bad: b(
      ['Buna mı yatırım yaptınız? Yazık parasına. {first} abartıldı, açık söyleyeyim.', 'Bugünkü performans rezalet. {first} bu seviyeye yetişemez.', '{first} altyapıya dönsün, orada daha çok öğrenir.'],
      ['You invested in THIS? {first} is overrated, I\'ll say it.', 'Today\'s display was shambolic. {first} is not at this level.', '{first} should go back to the academy and learn something.'],
    ),
    mixed: b(
      ['Ortalama bir oyun. {first} daha çok çalışmalı, bu kadar reklam fazla.'],
      ['Average. {first} needs to work harder, all this hype is too much.'],
    ),
    hype: b(
      ['{club} yine yanlış adama yatırım yaptı, göreceğiz.', 'Bu transfer neden? {first} bu takıma yaramaz.'],
      ['{club} have backed the wrong man again. We\'ll see.', 'Why this signing? {first} won\'t suit this team.'],
    ),
    idle: b(
      ['Bu sezon {club} bir şey kazanamaz, yazın bir kenara.', 'Transfer politikası ortada: sıfır vizyon.'],
      ['{club} won\'t win a thing this season, mark my words.', 'The transfer policy speaks for itself: zero vision.'],
    ),
  },
  meme: {
    good: b(
      ['{first} gol attı → herkes: "Ben biliyordum" 😎', 'Kaleci: "Bu top nereden geldi?" {first}: "Falsodan." 🌀', 'Haftanın adamı: {first}. Haftanın kalecisi: tarif edilemez.'],
      ['{first} scores → everyone: "I knew it all along" 😎', 'Keeper: "Where did that come from?" {first}: "The curl." 🌀', 'Man of the week: {first}. Goalkeeper of the week: indescribable.'],
    ),
    bad: b(
      ['Bugünkü {first} performansı: GPS kapalıydı sanırım 📍', '{first} için kayıp ilanı: son görüldüğü yer orta saha çizgisi.'],
      ['{first}\'s performance today: I think his GPS was off 📍', 'Missing poster for {first}: last seen near the halfway line.'],
    ),
    mixed: b(
      ['{first} koştu, top da koştu, ikisi hiç buluşmadı.', 'Beklenti: büyük gece. Gerçek: "bir sonraki maça bakarız."'],
      ['{first} ran, the ball ran, they never met.', 'Expectation: big night. Reality: "we\'ll look at the next one."'],
    ),
    hype: b(
      ['{first} {club} formasıyla ilk poz: forma bol, hayaller daha bol 📸', 'Taraftar: "Kim bu?" Menajer: "Bekleyin." 😏'],
      ['{first} in a {club} shirt for the first time: the kit is baggy, the dreams are bigger 📸', 'Fans: "Who is this?" Agent: "Just wait." 😏'],
    ),
    idle: b(
      ['Hafta içi: "Bu takım kupa alır." Hafta sonu: ... 🙃', 'Taraftar: "Hocayı değiştirin." Hoca: "Bu yıl üçüncü kez duydum." 😅'],
      ['Midweek: "We\'re winning the cup." Weekend: ... 🙃', 'Fans: "Sack the manager." Manager: "Third time this year." 😅'],
    ),
  },
  journalist: {
    good: b(
      ['{first} bu akşam tek kişilik orkestraydı. {club}, genç yeteneğine güveniyor.', 'Maç sonrası: {first}, {score} biten karşılaşmanın en çok konuşulan ismi.', 'Genç oyuncu {first} yükselişini sürdürüyor; teknik heyet memnun.'],
      ['{first} was a one-man orchestra tonight. {club} trust their young talent.', 'After the game: {first} is the talking point of the {score} result.', '{first} continues his rise and the coaching staff are pleased.'],
    ),
    bad: b(
      ['{first} için zor bir akşamdı. Hocanın performansı değerlendirmesi bekleniyor.', 'Soyunma odasında sessizlik: {club} ve {first} için unutulması gereken bir gün.'],
      ['A tough night for {first}. The manager is expected to assess his performance.', 'Silence in the dressing room: a day {club} and {first} will want to forget.'],
    ),
    mixed: b(
      ['{club} farklı oynadı; {first} ise topla buluştuğu anlarda iyiydi.', 'Karma bir akşam: {first} umut verdi ama bitirici olamadı.'],
      ['A mixed evening: {first} showed promise but lacked the finishing touch.', '{club} played differently; {first} looked good whenever he got on the ball.'],
    ),
    hype: b(
      ['SON DAKİKA: {first}, {club} ile imzayı attı. Detaylar geliyor.', 'Transferin perde arkası: {first} neden {club}\'ı seçti?'],
      ['BREAKING: {first} signs for {club}. Details to follow.', 'Inside the deal: why did {first} choose {club}?'],
    ),
    idle: b(
      ['Kulislerden: {club} yönetimi yaz için genç yeteneklere el atıyor.', 'Haftanın gündemi: {club} cephesinde sakin ama kararlı bir hafta.'],
      ['From the corridors: {club} are lining up young talent for the summer.', 'This week at {club}: quiet, but with purpose.'],
    ),
  },
  pundit: {
    good: b(
      ['Bu çocuğun topla ilişkisi farklı. Gelecek vadediyor ama sabır lazım.', 'Dikkat edin: {first} sadece gol atmıyor, oyunu okuyor. Bu ayrım önemli.'],
      ['This lad\'s relationship with the ball is different. Promising, but patience is needed.', 'Watch closely: {first} doesn\'t just score, he reads the game. That distinction matters.'],
    ),
    bad: b(
      ['{first} bugün iyi değildi ama bu yaşta iniş çıkış normal. Asıl önemli olan tepkisi.', 'Genç oyuncuya yüklenmek kolay. Önemli olan bir sonraki hafta nasıl döneceği.'],
      ['{first} wasn\'t at his best, but ups and downs are normal at this age. What matters is the response.', 'It\'s easy to pile on a young player. The real test is how he bounces back next week.'],
    ),
    mixed: b(
      ['{first} potansiyel gösterdi, tutarlılık hâlâ eksik. Bu tamamen normal.'],
      ['{first} showed potential; consistency is still missing, which is perfectly normal.'],
    ),
    hype: b(
      ['{club}, {first} transferiyle akıllıca bir hamle yaptı. Piyasa değerinin üzerinde bir potansiyel var.'],
      ['{club} have made a smart move for {first}. There\'s potential above his market value.'],
    ),
    idle: b(
      ['Bu sezon ligin en ilginç hikâyelerinden biri {club} cephesinde yaşanıyor.'],
      ['One of the most interesting stories of the season is unfolding at {club}.'],
    ),
  },
  rivalFan: {
    good: b(
      ['Güzel oynadı, kabul. Ama {rival} daha iyi!', 'Gol attı diye seviniyorsunuz ama {rival} her hafta bunu yapıyor.'],
      ['Fine, he played well. But {rival} is better!', 'You celebrate one goal; {rival} does that every week.'],
    ),
    bad: b(
      ['{first} mi? Hahah, {rival} olsa bunu çözerdi.', 'Gelen gelsin, {first} gibisi yok. Yani iyi bir anlamda değil. 😂'],
      ['{first}? Hahaha, {rival} would\'ve sorted that out.', 'Come on {first}, is that all you\'ve got? 😂'],
    ),
    mixed: b(
      ['{first} fena değil ama bizim {rival} gibi değil, kabul edin.'],
      ['{first} isn\'t bad, but he\'s no {rival}. Admit it.'],
    ),
    hype: b(
      ['{club} {first} için bunca parayı mı verdi? Biz {rival} ile mutluyuz, sağ olun.'],
      ['{club} paid that for {first}? We\'re happy with {rival}, thanks.'],
    ),
    idle: b(
      ['{rival} bu sezon uçuyor. Göreceksiniz!'],
      ['{rival} is flying this season. You\'ll see!'],
    ),
  },
  brand: {
    good: b(
      ['Tebrikler {first}! Sahada ve bizimle her zaman bir adım önde. 👏', 'Bu performans için bir alkış daha: {first}, sahanın yıldızı! ⭐'],
      ['Congratulations {first}! Always a step ahead, on the pitch and with us. 👏', 'One more round of applause for {first}, star of the pitch! ⭐'],
    ),
    hype: b(
      ['Yeni bir bölüm başlıyor. Yolun açık olsun {first}! #YeniSayfa', '{first} ile yeni sezona hazırız. Birlikte daha ileriye!'],
      ['A new chapter begins. All the best {first}! #NewPage', 'Ready for the new season with {first}. Further, together!'],
    ),
    idle: b(
      ['Haftanın antrenman rutini: {first} ile sahada bir gün. 🎬', 'Sporcularımız sahada, biz yanlarındayız. #HepBirlikte'],
      ['Training day with {first}. 🎬', 'Our athletes on the pitch, us by their side. #AllTogether'],
    ),
  },
  teammate: {
    good: b(
      ['Helal olsun kardeşim {first}! Bu akşam senindi 🙌', 'Böyle oyun soyunma odasının morali. Aferin {first}!'],
      ['Class, mate! Tonight was yours 🙌', 'That\'s the kind of game that lifts the dressing room. Well done {first}!'],
    ),
    bad: b(
      ['Boş ver {first}, bir sonraki maç bizim. Kafayı kaldır 💪', 'Hepimiz kötü gün geçiririz. Yanındayız {first}.'],
      ['Forget it {first}, next one is ours. Head up 💪', 'We all have bad days. We\'re with you {first}.'],
    ),
    mixed: b(
      ['Zor maçtı ama dik durduk. Teşekkürler {first}.'],
      ['Hard game but we stood tall. Thanks {first}.'],
    ),
    hype: b(
      ['Takıma hoş geldin {first}! Soyunma odası hazır 😄', 'Yeni transfer {first}, ilk çay senden! ☕'],
      ['Welcome to the squad {first}! The dressing room is ready 😄', 'New signing {first}, first round of teas is on you! ☕'],
    ),
  },
  partner: {
    good: b(['Seninle gurur duyuyorum {first} ❤️'], ['So proud of you {first} ❤️']),
    bad: b(['Zor gün ama ben hep yanındayım. ❤️'], ['Tough day, but I\'m always with you. ❤️']),
    mixed: b(['Eve gel, çay hazır. Futbol da geçer. ☕'], ['Come home, tea\'s ready. Football passes too. ☕']),
    hype: b(['Yeni şehir, yeni heyecan. Seninle her yere {first} ✈️'], ['New city, new excitement. With you anywhere {first} ✈️']),
  },
  club: {
    good: b(
      ['⚽ {first} sahne aldı! Maç görüntüleri kulüp kanalımızda.', '{first} maçın yıldızı! Tebrikler genç yeteneğimize.'],
      ['⚽ {first} steps up! Highlights are on our channel.', '{first} the star of the match! Congratulations to our young talent.'],
    ),
    hype: b(
      ['RESMEN | {club}, {player} ile anlaştı! Hoş geldin {first}.', 'Yeni transferimiz {player}! Kulübümüze hoş geldin.'],
      ['OFFICIAL | {club} have signed {player}! Welcome {first}.', 'Our new signing {player}! Welcome to the club.'],
    ),
    idle: b(
      ['Biletler satışta: bu haftaki maç için son gün. 🎟️', 'Antrenmandan kareler: takım hazır.'],
      ['Tickets on sale: last day for this week\'s match. 🎟️', 'Snaps from training: the squad is ready.'],
    ),
  },
  rival: {
    good: b(
      ['Tebrikler {first}. Bir sonraki karşılaşmada görüşürüz. 👊', 'Fena oynamadı. Ama benim hikâyem daha yeni başlıyor.'],
      ['Congratulations {first}. See you in the next meeting. 👊', 'Not bad at all. But my story is only just starting.'],
    ),
    bad: b(
      ['Zor bir gün mü, {first}? Sahada bunu çözerim. 😉', 'Bazı oyuncular manşetle yaşar. Ben sahada.'],
      ['Tough day, {first}? I\'d have sorted that out on the pitch. 😉', 'Some players live by headlines. I live on the pitch.'],
    ),
    mixed: b(
      ['İzliyorum, {first}. Rekabet güzeldir.'],
      ['I\'m watching, {first}. Competition is healthy.'],
    ),
    hype: b(
      ['Yeni kulüp, yeni başlangıç. Yolda görüşürüz {first}.'],
      ['New club, new start. See you on the road, {first}.'],
    ),
  },
  fan: {
    good: b(
      ['{first} bu akşam harikaydı! Maç sonrası bir imza için bekliyoruz 🙏', 'Çocuğum bu akşam {first} forması ile uyudu. Teşekkürler {first}!'],
      ['{first} was brilliant tonight! Waiting after the game for an autograph 🙏', 'My kid went to bed in a {first} shirt tonight. Thank you {first}!'],
    ),
    bad: b(
      ['Üzülme {first}, biz yanındayız. Bir kötü gün olur.', 'Zor maç. Ama {first} dönecek, biliyorum.'],
      ['Chin up {first}, we\'re with you. Everyone has a bad day.', 'Rough game. But {first} will bounce back, I know it.'],
    ),
    mixed: b(
      ['Fena değildi {first}. Gelişiyor, sabır!', 'Bugünkü maçtan sonra {first} hakkında ne düşünüyorsunuz?'],
      ['Not bad {first}. He\'s getting there, patience!', 'What did you make of {first} after tonight?'],
    ),
    hype: b(
      ['{first} bizim takımda! Forma almak için sıraya giriyorum 😍', 'Sonunda! {first} {club} formasıyla nasıl görünecek, çok merak ediyorum.'],
      ['{first} is ours! I\'m queueing up for the shirt 😍', 'Finally! Can\'t wait to see {first} in a {club} shirt.'],
    ),
    idle: b(
      ['Bu hafta sonu stadyumda olacağım. Hazırım! ⚽', '{club} maçı için bilet buldum, mutluyum 🎟️'],
      ['I\'ll be at the ground this weekend. Ready! ⚽', 'Found a ticket for the {club} game, so happy 🎟️'],
    ),
  },
};

const KIND: Record<Arch, PostKind> = {
  ultra: 'fan', oldFan: 'fan', hater: 'fan', meme: 'fan', journalist: 'journalist', pundit: 'pundit', rivalFan: 'fan',
  brand: 'brand', teammate: 'player', partner: 'partner', club: 'club', rival: 'rival', fan: 'fan',
};

/** Share of the player's follower base an archetype tends to reach. */
const REACH: Record<Arch, number> = {
  ultra: 0.02, oldFan: 0.02, hater: 0.012, meme: 0.05, journalist: 0.05, pundit: 0.04, rivalFan: 0.012, brand: 0.03,
  teammate: 0.03, partner: 0.035, club: 0.08, rival: 0.04, fan: 0.01,
};

const MEME_NAMES: Bank = {
  tr: ['Mizah Tribün', 'Pozisyon Var Mı?', 'Kahvehane Analiz', 'Penaltı mı Değil mi', 'Orta Saha Şakaları'],
  en: ['Terrace Banter', 'Is It A Foul?', 'Pub Pundit Daily', 'Overlap Memes', 'Row Z Comedy'],
};
const BRANDS: Bank = {
  tr: ['Zirve Spor', 'Volt Enerji', 'Arda Mobil', 'Nova Krampon', 'Kuzey Bank'],
  en: ['Stride Boots', 'Volt Energy', 'Apex Mobile', 'Nova Sportswear', 'Northline Bank'],
};
const HANDLE_SUFFIX = ['', '_', '10', '07', '1905', '34', '61', '99', '_fc', 'tv'];

const MOOD_POOL: Record<Mood, [Arch, number][]> = {
  good: [['ultra', 4], ['fan', 3], ['meme', 3], ['journalist', 2], ['pundit', 2], ['teammate', 2], ['hater', 2], ['rivalFan', 1.5], ['brand', 1.5], ['club', 1.5], ['partner', 1], ['rival', 1]],
  bad: [['ultra', 3], ['hater', 4], ['meme', 3], ['journalist', 2], ['pundit', 1.5], ['teammate', 1.5], ['fan', 2], ['rivalFan', 2], ['partner', 1], ['rival', 1]],
  mixed: [['ultra', 2], ['fan', 3], ['meme', 2], ['journalist', 2.5], ['pundit', 2], ['hater', 2], ['teammate', 1.5], ['rivalFan', 1.5], ['partner', 0.8]],
  hype: [['ultra', 3], ['fan', 3], ['oldFan', 3], ['journalist', 3], ['club', 2.5], ['meme', 2], ['hater', 1.5], ['rivalFan', 1.5], ['pundit', 2], ['brand', 1.5], ['teammate', 2], ['partner', 1], ['rival', 1]],
  betray: [['oldFan', 4], ['ultra', 1.5], ['journalist', 2], ['meme', 2]],
  idle: [['ultra', 3], ['fan', 3], ['meme', 3], ['journalist', 3], ['pundit', 1.5], ['hater', 2], ['club', 1.5], ['brand', 1.5], ['rivalFan', 1]],
};

function moodFor(trigger: SocialTrigger): Mood {
  switch (trigger.kind) {
    case 'match':
      if (trigger.goals > 0 || trigger.rating >= 7.4) return 'good';
      if (trigger.rating < 5.8 || (trigger.won === false && trigger.rating < 6.4)) return 'bad';
      return 'mixed';
    case 'transfer': return 'hype';
    case 'user_post': {
      const tone = (trigger.tone || '').toLowerCase();
      if (/humble|emotional|diplomatic|thanks|grateful/.test(tone)) return 'good';
      if (/provocative|arrogant|insult/.test(tone)) return 'mixed';
      return tone === 'confident' ? 'good' : 'mixed';
    }
    case 'event': {
      const f = (trigger.facts ?? '').toLowerCase();
      if (/skandal|scandal|kavga|fight|ceza|banned|sakat|injur/.test(f)) return 'bad';
      if (/ödül|award|şampiy|champion|kupa|trophy|imza|signed|rekor|record/.test(f)) return 'good';
      return 'mixed';
    }
    default: return 'idle';
  }
}

function sentimentFor(arch: Arch, mood: Mood, rng: ReturnType<typeof rngFrom>): number {
  const j = rng.float(-0.12, 0.12);
  const base: Record<Mood, number> = { good: 0.75, bad: -0.7, mixed: 0.05, hype: 0.65, betray: -0.35, idle: 0.1 };
  let v = base[mood] + j;
  if (arch === 'hater' || arch === 'rivalFan') v = mood === 'good' || mood === 'hype' ? -0.45 + j : mood === 'bad' ? -0.85 + j : -0.5 + j;
  if (arch === 'rival' && mood !== 'bad') v = 0.05 + j;
  if (arch === 'rival' && mood === 'bad') v = -0.5 + j;
  if (arch === 'meme') v = mood === 'bad' ? -0.35 + j : 0.35 + j;
  if (arch === 'journalist' || arch === 'pundit') v = Math.max(-0.5, Math.min(0.6, v * 0.5));
  if (arch === 'oldFan' && mood === 'mixed') v = 0.1 + j;
  return Math.max(-1, Math.min(1, Math.round(v * 100) / 100));
}

function author(arch: Arch, ctx: NarrativeContext, rng: ReturnType<typeof rngFrom>, salt: number): SocialPost['author'] {
  const lang = langOf(ctx);
  const cul = ctxCulture(ctx);
  const club = ctx.club?.name ?? (lang === 'tr' ? 'Kulüp' : 'Club');
  const person = () => `${firstName(rng, cul, rng.chance(0.6) ? 'm' : 'f')} ${lastName(rng, cul)}`;
  const withNum = (s: string) => `@${slug(s)}${rng.pick(HANDLE_SUFFIX)}`.slice(0, 22);
  switch (arch) {
    case 'ultra': {
      const name = lang === 'tr' ? `${club} Kuzey Tribünü` : `${club} North End`;
      return { name, handle: `@${slug(club)}_${lang === 'tr' ? 'kuzey' : 'north'}`.slice(0, 22), kind: 'fan', verified: false };
    }
    case 'oldFan': {
      const name = lang === 'tr' ? 'Eski Kulüp Taraftarı' : 'Old Club Supporter';
      return { name: `${person()} (${name})`, handle: withNum(person()), kind: 'fan', verified: false };
    }
    case 'meme': {
      const name = rng.pick(MEME_NAMES[lang]);
      return { name, handle: `@${slug(name)}`.slice(0, 22), kind: 'fan', verified: false };
    }
    case 'journalist': {
      const name = inventedPerson(ctx, 'reporter', salt + 3);
      return { name, handle: `@${slug(name)}_${slug(rng.pick(outletsFor(ctxCountry(ctx)))).slice(0, 6)}`.slice(0, 24), kind: 'journalist', verified: true };
    }
    case 'pundit': {
      const name = inventedPerson(ctx, 'pundit', salt + 1);
      return { name, handle: `@${slug(name)}`.slice(0, 22), kind: 'pundit', verified: true };
    }
    case 'brand': {
      const name = rng.pick(BRANDS[lang]);
      return { name, handle: `@${slug(name)}`.slice(0, 22), kind: 'brand', verified: true };
    }
    case 'teammate': {
      const name = inventedPerson(ctx, 'teammate', salt + 7);
      return { name, handle: `@${slug(name)}`.slice(0, 22), kind: 'player', verified: true };
    }
    case 'partner': {
      const name = ctx.partner?.name ?? person();
      return { name, handle: `@${slug(name)}`.slice(0, 22), kind: 'partner', verified: false };
    }
    case 'club':
      return { name: club, handle: `@${slug(club)}`.slice(0, 22), kind: 'club', verified: true };
    case 'rival': {
      const name = ctx.rival?.name ?? person();
      return { name, handle: `@${slug(name)}`.slice(0, 22), kind: 'rival', verified: true };
    }
    case 'rivalFan': {
      const name = person();
      return { name, handle: withNum(name), kind: 'fan', verified: false };
    }
    default: {
      const name = person();
      return { name, handle: withNum(name), kind: 'fan', verified: false };
    }
  }
}

export function writeSocial(ctx: NarrativeContext, trigger: SocialTrigger, count: number): Omit<SocialPost, 'id' | 'season' | 'week'>[] {
  const lang = langOf(ctx);
  const rng = rngFrom('social', ctx.season, ctx.week, ctx.player.name, trigger.kind, 'facts' in trigger ? trigger.facts.slice(0, 80) : '', count);
  const mood = moodFor(trigger);
  const slots: Slots = { ...ctxSlots(ctx) };
  if (trigger.kind === 'match') Object.assign(slots, matchSlots(trigger.facts, ctx));
  if (trigger.kind === 'transfer') slots.club = ctx.club?.name ?? slots.club;
  const n = Math.max(0, Math.min(12, Math.round(count)));
  const out: Omit<SocialPost, 'id' | 'season' | 'week'>[] = [];
  const used = new Map<Arch, number>();
  const pool = MOOD_POOL[mood].filter(([a]) => {
    if (a === 'partner') return !!ctx.partner;
    if (a === 'rival' || a === 'rivalFan') return !!ctx.rival;
    if (a === 'brand') return ctx.player.fame >= 25;
    if (a === 'pundit') return ctx.player.fame >= 15 || mood === 'hype';
    if (a === 'oldFan') return mood === 'betray' || mood === 'hype' || mood === 'mixed';
    return true;
  });
  // transfers: the old club's fans must appear first
  const forced: Arch[] = trigger.kind === 'transfer' ? ['oldFan'] : [];
  for (let i = 0; i < n; i++) {
    const arch: Arch = forced[i] ?? rng.weighted(pool, ([a, w]) => w / (1 + (used.get(a) ?? 0) * 1.4))[0];
    used.set(arch, (used.get(arch) ?? 0) + 1);
    const archMood: Mood = arch === 'oldFan' ? (trigger.kind === 'transfer' ? 'betray' : mood === 'hype' ? 'betray' : 'mixed') : mood;
    const bank = POSTS[arch][archMood] ?? POSTS[arch].mixed ?? POSTS.fan.mixed!;
    const tpl = pickFilled(bank[lang], slots, rng, new Set(['score', 'opp']));
    const sentiment = sentimentFor(arch, archMood, rng);
    const reach = Math.max(500, ctx.player.followers) * REACH[arch];
    const likes = Math.max(2, Math.round(reach * rng.float(0.25, 1.7) * (0.65 + Math.abs(sentiment) * 0.7)));
    out.push({
      author: author(arch, ctx, rng, i),
      text: cap(fill(tpl, slots, rng, lang), lang),
      likes,
      reposts: Math.round(likes * rng.float(0.05, 0.24)),
      sentiment,
      ai: false,
    });
  }
  return out;
}
