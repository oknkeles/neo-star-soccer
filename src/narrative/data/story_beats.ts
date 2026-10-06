/**
 * Storyline beats: the decision moments that punctuate each arc (see ../storylines.ts for the arcs
 * themselves). They are never drawn by the weekly lottery — only a storyline can fire them.
 */
import { choice, L, type EventDef } from '../eventkit';
import { cash } from '../facts';

const never = () => false;

export const STORY_BEATS: EventDef[] = [
  // ───────────────────────── rival ─────────────────────────
  {
    id: 'rival_buildup', icon: 'swords', cooldown: 4, weight: 0, when: never, persona: (f) => f.rivalName, story: 'rival',
    title: L('Düello Öncesi Ateş Hattı', 'Before the Showdown'),
    body: L(
      'Gazeteler haftanın maçını "{player} - {rival}" diye duyurdu. {rivalClub} forması giyen {rival} "O sadece bir çocuk" demiş. Mikrofonlar yüzüne uzanıyor; tüm kahvehaneler bu düelloyu konuşuyor.',
      'The papers are billing the week as "{player} vs {rival}". The {rivalClub} man said: "He\'s just a kid." Microphones are being pushed into your face and every café in town has a view on the duel.',
    ),
    choices: [
      choice('fire', L('"Cumartesi sahada konuşuruz."', '"We\'ll talk on the pitch."'),
        L('Cümlen sosyal medyada bir saatte yüz bin paylaşım aldı. Taraftar bayram ediyor!', 'Your line got a hundred thousand shares in an hour. The fans are delighted!'),
        { rel: { fans: 5, media: 3 }, fame: 2, morale: 3, followers: 15000 },
        { risk: { chance: 0.3, fx: { morale: -4, rel: { manager: -3 } }, text: L('Hoca bu ateşli açıklamayı hiç sevmedi; "Önce işini yap" dedi.', 'The gaffer hated the fiery quote: "Do your job first," he said.') } }),
      choice('respect', L('Saygıyla an, işine odaklan', 'Speak respectfully and focus on the job'),
        L('Olgun cevabın basında övgü topladı. Hoca onayla başını salladı.', 'Your mature answer earned praise in the press. The gaffer nodded in approval.'),
        { rel: { media: 4, manager: 3 }, morale: 1, fame: 0.5 }),
      choice('silence', L('Sessiz kal, cevabı sahada ver', 'Stay silent and answer on the pitch'),
        L('Telefonu kapattın, müziği açtın. Cumartesi için tek hedefin var.', 'Phone off, music on. You have one target for Saturday.'),
        { form: 3, morale: 2, rel: { media: -1 } }),
    ],
  },
  {
    id: 'rival_after_win', icon: 'trophy', cooldown: 4, weight: 0, when: never, persona: (f) => f.rivalName, story: 'rival',
    title: L('Düello Senin', 'The Duel Is Yours'),
    body: L(
      '{rival} ile aranızdaki karşılaşmayı sen kazandın. Soyunma odasında telefonlar çalıyor, herkes bu galibiyetin hikâyesini sana soruyor. {rival} ise tünele sessizce yürüdü.',
      'You won the duel with {rival}. Phones are ringing in the dressing room and everybody wants the story. {rival} walked quietly down the tunnel.',
    ),
    choices: [
      choice('taunt', L('Rakibinin eski sözünü paylaş: "Sadece bir çocuk mu?"', 'Post his old quote: "Just a kid?"'),
        L('İnternet kudurdu! Taraftar seni göklere çıkardı, {rival:gen} taraftarları ise savaş ilan etti.', 'The internet exploded! Your fans carried you shoulder-high; his fans declared war.'),
        { followers: 40000, fame: 3, rel: { fans: 5, media: -2, manager: -2 }, flags: { 'narr.rival.beef': true } }),
      choice('class', L('{rival} ile tünelde el sıkış', 'Shake hands with {rival} in the tunnel'),
        L('Kameralar bu anı yakaladı. Manşet: "Büyük oyuncular büyük davranır."', 'The cameras caught it. The headline: "Big players act big."'),
        { rel: { media: 5, fans: 2, manager: 2 }, fame: 1.5, morale: 3 }),
      choice('quiet', L('Kutlamayı arkadaşlarınla yap, açıklama yok', 'Celebrate with your mates, no statements'),
        L('Soyunma odasında şarkılar, kahkahalar. Bu zaferi ailen ve takımın hak ediyor.', 'Songs and laughter in the dressing room. The team and family deserve this win.'),
        { rel: { teammates: 5 }, morale: 5 }),
    ],
  },
  {
    id: 'rival_after_loss', icon: 'skull', cooldown: 4, weight: 0, when: never, persona: (f) => f.rivalName, story: 'rival',
    title: L('Düello Rakibin Oldu', 'The Duel Went to Your Rival'),
    body: L(
      '{rival} bu kez daha iyiydi. Maç sonu tüneldeki o hafif gülümsemeyi unutamıyorsun. Gazeteler "Genç yıldızın sınavı" diye yazıyor.',
      '{rival} was better this time. You can\'t shake that faint smile in the tunnel at full time. The papers call it "the young star\'s exam".',
    ),
    choices: [
      choice('revenge', L('Akşam antrenmana geri dön, gece yarısına kadar vur', 'Go back to training and shoot until midnight'),
        L('Işıklar sönene kadar kaleye şut çektin. Eve geldiğinde ayakların yanıyordu ama kafan netti.', 'You fired at goal until the lights went out. Your feet burned but your head was clear.'),
        { energy: -10, xp: { shooting: 3, composure: 3 }, morale: 1, rel: { manager: 2 } }),
      choice('accept', L('Yenilgiyi kabul et, {rival:acc} tebrik et', 'Accept it and congratulate {rival}'),
        L('Basın bu centilmenliği övdü; ama içindeki ateş hâlâ yanıyor.', 'The press praised the sportsmanship, but the fire inside is still burning.'),
        { rel: { media: 4, fans: 1 }, morale: -1 }),
      choice('shrug', L('Omuz silk: "Bir maç, bir sezon değil."', 'Shrug: "One game isn\'t a season."'),
        L('Soğukkanlılığın dikkat çekti, ama taraftarın bir kısmı "ciddiyetsiz" dedi.', 'Your coolness got noticed, though some fans called it casual.'),
        { morale: 2, rel: { fans: -1, teammates: 1 } }),
    ],
  },
  {
    id: 'rival_resolution', icon: 'handshake', cooldown: 20, weight: 0, when: never, persona: (f) => f.rivalName, story: 'rival',
    title: L('Buzlar Çözülüyor mu?', 'Is the Ice Melting?'),
    body: L(
      'Bir tören sonrası {rival} yanına geldi, ilk kez gülümsemeden: "Bunca zamandır birbirimizi yorduk. Belki de ikimiz de aynı şeyi istiyoruz: tarihe geçmek." Çevrede fotoğraf makineleri.',
      'After a ceremony {rival} came over, for once not smiling: "We\'ve worn each other out all this time. Maybe we both want the same thing: to make history." Cameras are all around.',
    ),
    choices: [
      choice('handshake', L('Elini sık, "Seninle yarışmak onurdu" de', 'Shake his hand: "It was an honour to compete with you"'),
        L('Fotoğraf ertesi gün tüm gazetelerde: iki rakip, tek saygı. Taraftarlar bile alkışladı.', 'The photo ran in every paper the next day: two rivals, one respect. Even the fans applauded.'),
        { rel: { media: 6, fans: 4, manager: 2 }, fame: 2, morale: 4, flags: { 'narr.rival.friends': true } }),
      choice('swap', L('Formaları değiş tokuş edin', 'Swap shirts'),
        L('İki forma, iki hikâye. Çocuklar bu fotoğrafı duvarlarına asacak.', 'Two shirts, two stories. Kids will put this photo on their walls.'),
        { followers: 30000, fame: 2.5, rel: { fans: 4, media: 3 }, morale: 3, flags: { 'narr.rival.friends': true } }),
      choice('hostile', L('Elini sıkma: "Sahada görüşürüz."', 'Don\'t shake: "See you on the pitch."'),
        L('Gerginlik sürecek. Taraftar bu inatçılığı seviyor ama basın "kibirli" yazdı.', 'The tension stays. Fans love the stubbornness but the press wrote "arrogant".'),
        { rel: { fans: 4, media: -3 }, fame: 1, morale: 1, flags: { 'narr.rival.beef': true } }),
    ],
  },

  // ───────────────────────── mentor ─────────────────────────
  {
    id: 'mentor_lesson_1', icon: 'graduation', cooldown: 20, weight: 0, when: never, persona: (f) => f.mentorName ?? '', story: 'mentor',
    title: L('Ağabeyin İlk Dersi', 'The First Lesson'),
    body: L(
      'Antrenmandan sonra {mentor} seni kenara çekti: "Bir şey göstereyim. Top sana gelmeden önce omzunun üstünden bak; bir saniye sonra nerede olacağını bil. Futbol topla değil, boşlukla oynanır."',
      'After training {mentor} pulled you aside: "Let me show you something. Look over your shoulder before the ball arrives; know where you\'ll be one second later. Football is played with space, not the ball."',
    ),
    choices: [
      choice('listen', L('Dikkatle dinle, not al', 'Listen carefully and take notes'),
        L('Bir saat boyunca tekrar ettiniz. Akşam eve dönerken kafan hâlâ haritalarla doluydu.', 'You drilled it for an hour. On the way home your head was still full of maps.'),
        { xp: { vision: 4, positioning: 3 }, rel: { teammates: 2 }, energy: -5 }),
      choice('more', L('Daha fazlasını iste: "Bir de bitirişi göster"', 'Ask for more: "Show me finishing too"'),
        L('{mentor} güldü: "Aç gözlüsün, işte bu iyi." Ekstra yarım saat çalıştınız.', '{mentor} laughed: "You\'re greedy — good." You worked another half hour.'),
        { xp: { shooting: 3, composure: 2 }, energy: -9, morale: 2 }),
      choice('joke', L('Şakayla karşıla: "Ben ayağımla düşünürüm abi."', 'Joke back: "I think with my feet, bro."'),
        L('Soyunma odası yıkıldı. {mentor} bile güldü; ama dersin yarısı havada kaldı.', 'The dressing room cracked up. Even {mentor} laughed, but half the lesson went over your head.'),
        { rel: { teammates: 4 }, morale: 3 }),
    ],
  },
  {
    id: 'mentor_lesson_2', icon: 'coffee', cooldown: 20, weight: 0, when: never, persona: (f) => f.mentorName ?? '', story: 'mentor',
    title: L('Çay Başında Kariyer Sohbeti', 'Career Advice Over Tea'),
    body: L(
      '{mentor} otelin lobisinde iki çay söyledi. "Bu işin sahada olan kısmı kolay," dedi. "Zor olan; para, şöhret ve etrafındaki insanlar. Sana üç şey söyleyeceğim ama sadece birini seçmeni isterim."',
      '{mentor} ordered two teas in the hotel lobby. "The part on the pitch is easy," he said. "The hard parts are money, fame and the people around you. I\'ll tell you three things but I want you to choose just one."',
    ),
    choices: [
      choice('money', L('"Paranı nasıl koruyacağımı anlat."', '"Tell me how to protect my money."'),
        L('Bir saat boyunca vergi, yatırım ve "hayır diyebilme" üzerine konuştunuz. Not defterin doldu.', 'For an hour you talked taxes, saving and saying no. Your notebook filled up.'),
        { rel: { agent: 2, family: 2 }, morale: 2, flags: { 'narr.mentor.money': true } }),
      choice('press', L('"Basınla nasıl baş ederim?"', '"How do I handle the press?"'),
        L('"Kısa konuş, doğru konuş, asla öfkeyle konuşma." Bu üç cümleyi telefonuna not aldın.', '"Speak short, speak true, never speak in anger." You saved those three lines on your phone.'),
        { rel: { media: 5, manager: 1 }, morale: 1 }),
      choice('ego', L('"Egomla nasıl başa çıkarım?"', '"How do I deal with my ego?"'),
        L('{mentor} uzun uzun güldü: "İlk kez biri bunu soruyor. Demek ki yolundasın."', '{mentor} laughed long: "First time anyone has asked me that. You\'re on the right path."'),
        { rel: { teammates: 4, fans: 1 }, morale: 3, xp: { composure: 3 } }),
    ],
  },
  {
    id: 'mentor_farewell', icon: 'mail', cooldown: 60, weight: 0, when: never, persona: (f) => f.mentorName ?? '', story: 'mentor',
    title: L('Veda Mektubu', 'A Farewell Letter'),
    body: L(
      '{mentor} sezon sonunda kramponlarını astığını açıkladı. Dolabında sana bir zarf bıraktı: içinde eski bir forma bandı ve tek satırlık bir not: "Ben bıraktığım yerden sen devam et."',
      '{mentor} announced he is hanging up his boots at the end of the season. He left an envelope in your locker: an old captain\'s tape and a single line: "Carry on from where I stopped."',
    ),
    choices: [
      choice('number', L('Formasını ve numarasını taşıyacağını söyle', 'Promise to carry his number'),
        L('Tribün ayağa kalktı. {mentor} gözyaşlarını saklamak için şapkasını indirdi.', 'The stand rose. {mentor} pulled his cap down to hide the tears.'),
        { rel: { fans: 6, teammates: 3, media: 2 }, morale: 4, fame: 1.5, flags: { 'narr.mentor.number': true } }),
      choice('speech', L('Veda töreninde konuşma yap', 'Give a speech at his farewell ceremony'),
        L('Konuşman kısa ve yürekten çıktı. O akşam herkes gözlerini sildi.', 'Your speech was short and from the heart. That night everyone wiped their eyes.'),
        { rel: { fans: 5, media: 3, teammates: 2 }, fame: 2, followers: 12000, morale: 3 }),
      choice('private', L('Özel bir akşam yemeği: sadece ikiniz', 'A private dinner, just the two of you'),
        L('Eski hikâyeler, bol kahkaha ve bir teşekkür. Bu akşam sana hayat boyu yeter.', 'Old stories, plenty of laughter and one thank-you. That evening will last you a lifetime.'),
        { morale: 6, rel: { family: 1 }, xp: { composure: 2 } }),
    ],
  },

  // ───────────────────────── hometown ─────────────────────────
  {
    id: 'hometown_call', icon: 'house', cooldown: 30, weight: 0, when: never, persona: (f) => f.agentName, story: 'hometown',
    title: L('Memleketten Haber', 'News from Home'),
    body: L(
      '{agent}: "{hometown} kulübünün başkanı beni aradı. Seni geri istiyorlar. Şimdilik sadece ön görüşme ama bütün şehir senin adını anıyor."',
      '{agent}: "The president of the {hometown} club rang me. They want you back. For now it\'s only a first contact, but the whole city is saying your name."',
    ),
    choices: [
      choice('one_day', L('"Bir gün mutlaka döneceğim."', '"I\'ll come back one day, for sure."'),
        L('Söz haberlerde yankılandı. {hometown} sokaklarında pankartlar asıldı.', 'The promise echoed on the news. Banners went up on the streets of {hometown}.'),
        { rel: { fans: 4, media: 2, family: 3 }, fame: 1, morale: 3, flags: { 'narr.hometown.promise': true } }),
      choice('not_now', L('"Şimdi değil, hedeflerim büyük."', '"Not now — my goals are bigger."'),
        L('Net cevabın saygı gördü ama memlekette bazıları kırıldı.', 'The clear answer earned respect, though some at home felt hurt.'),
        { rel: { agent: 2, family: -2, fans: -1 }, fame: 0.5 }),
      choice('visit', L('Hafta sonu memlekete git', 'Travel home for the weekend'),
        L('Mahalle sokakları, anne yemeği ve eski dostlar... Pilin doldu.', 'The old streets, mum\'s cooking, old friends... fully recharged.'),
        (f) => ({ energy: -8, morale: 7, rel: { family: 6, fans: 2 }, money: -cash(f, 3000, 1) })),
    ],
  },
  {
    id: 'hometown_second_call', icon: 'flag', cooldown: 30, weight: 0, when: never, persona: (f) => f.motherName ?? '', story: 'hometown',
    title: L('Çocukluk Stadyumu Seni Çağırıyor', 'The Boyhood Ground Calls'),
    body: L(
      '{hometown} belediyesi, adına bir saha açılışı yapmak istiyor. Çocuklar fotoğrafını duvarlara yapıştırmış; mahallenin berberi "bizim çocuk" diye gazetecilere poz veriyor.',
      '{hometown} council wants to open a pitch in your name. Kids have stuck your photo on their walls and the local barber poses for journalists, saying "our boy".',
    ),
    choices: [
      choice('attend', L('Açılışa git, çocuklarla top oyna', 'Attend the opening and play with the kids'),
        L('Toprak sahada ayakkabını kirlettin, kalbini doldurdun. Gazeteler "Memleketin evladı" yazdı.', 'You muddied your boots and filled your heart. The papers called you "the hometown son".'),
        { energy: -8, morale: 5, fame: 2, rel: { fans: 6, family: 4, media: 2 }, followers: 20000 }),
      choice('send_kit', L('Gidemezsen forma ve top gönder', 'Send kit and balls if you can\'t make it'),
        L('Kutular tren yolunda; birkaç gün sonra fotoğraflar geldi. Çocuklar yeni formalarla sahada!', 'The boxes were on their way; days later the photos arrived. The kids are on the pitch in your shirts!'),
        { money: -2000, rel: { fans: 2, family: 1 }, morale: 1 }),
      choice('politely', L('Nazikçe reddet: takvim çok sıkışık', 'Politely decline: the calendar is packed'),
        L('Anlayışla karşılandı ama annenin sesi biraz kırgındı.', 'Understood, though your mum sounded a little hurt.'),
        { rel: { family: -2, fans: -1 }, energy: 3 }),
    ],
  },
  {
    id: 'hometown_homecoming', icon: 'party', cooldown: 999, weight: 0, when: never, story: 'hometown',
    title: L('Eve Dönüş', 'Homecoming'),
    body: L(
      'Havalimanında yüzlerce kişi seni bekliyordu. Sokaklar bayraklarla dolu, çocukluk arkadaşların omuzlarında seni taşımak için sıraya girmiş. {hometown} bu gece bayram ediyor.',
      'Hundreds waited at the airport. The streets are full of flags and your childhood friends queue to carry you on their shoulders. {hometown} is celebrating tonight.',
    ),
    choices: [
      choice('parade', L('Açık otobüsle şehri dolaş', 'Tour the city on an open-top bus'),
        L('Kornalar, flamalar, bir şehrin kalbi. Bu günü hayatın boyunca unutmayacaksın.', 'Horns, flares, the heart of a whole city. You\'ll never forget this day.'),
        { rel: { fans: 8, family: 5, media: 3 }, fame: 3, followers: 60000, morale: 7, energy: -8 }),
      choice('old_pitch', L('Önce çocukluk sahasına git', 'Go to your childhood pitch first'),
        L('Eski kale direklerine dokundun. Bir şeyi kanıtlamak için değil, teşekkür etmek için gelmişsin.', 'You touched the old goalposts. Not to prove anything — to say thanks.'),
        { rel: { fans: 6, family: 6 }, morale: 8, fame: 1.5 }),
      choice('family', L('Doğruca aile sofrasına otur', 'Head straight to the family table'),
        L('Anne yemeği, baba öğüdü, kardeş şakaları. Başka bir şeye ihtiyacın yok.', 'Mum\'s food, dad\'s advice, sibling jokes. You need nothing else.'),
        { rel: { family: 8, fans: 2 }, morale: 8, energy: 8 }),
    ],
  },

  // ───────────────────────── manager feud ─────────────────────────
  {
    id: 'feud_public', icon: 'newspaper', cooldown: 20, weight: 0, when: never, persona: (f) => f.npc('journalist'), story: 'manager_feud',
    title: L('Soyunma Odası Sızdı', 'The Dressing Room Leaked'),
    body: L(
      'Dünkü tartışmanız bir gazetenin manşetinde: "{player} ile {manager} arasında soğuk savaş". {journo} arayıp açıklama istiyor. Soyunma odasında herkes seninle hocanın arasını izliyor.',
      'Yesterday\'s argument is on a front page: "Cold war between {player} and {manager}". {journo} is calling for a comment. The whole dressing room is watching you and the gaffer.',
    ),
    choices: [
      choice('deny', L('"Yalan, hocayla aramız çok iyi."', '"Lies — the gaffer and I are fine."'),
        L('Açıklaman bugünlük yangını söndürdü, ama hoca yalanlamayı biraz erken buldu.', 'Your denial put out today\'s fire, though the gaffer thought it a little early.'),
        { rel: { media: -1, manager: 1 }, morale: -1 },
        { risk: { chance: 0.3, fx: { rel: { media: -4, manager: -2 } }, text: L('Bir ses kaydı sızdı; yalanlaman biraz boş kaldı.', 'An audio clip leaked; your denial looked hollow.') } }),
      choice('own', L('"Evet gerginlik var, çözeceğiz."', '"Yes there\'s tension, we\'ll solve it."'),
        L('Dürüstlüğün takdir gördü; ama {manager} kamuoyu önünde bunu konuşmak istemiyordu.', 'Your honesty was appreciated; but {manager} didn\'t want this discussed in public.'),
        { rel: { media: 4, fans: 2, manager: -2 }, morale: 1 }),
      choice('meet', L('Hocayı kahveye çağır, aranızı düzelt', 'Invite the gaffer for a coffee and clear the air'),
        L('Kahve soğudu ama aranızdaki buz biraz çözüldü. {manager} sonunda konuşmaya başladı.', 'The coffee went cold but the ice between you thawed. {manager} finally began to talk.'),
        { rel: { manager: 5, media: 1 }, morale: 2 }),
    ],
  },
  {
    id: 'feud_summit', icon: 'handshake', cooldown: 20, weight: 0, when: never, persona: (f) => f.managerName, story: 'manager_feud',
    title: L('Hocanın Odasında', 'In the Gaffer\'s Office'),
    body: L(
      '{manager} seni odasına çağırdı. Kapı kapalı; masada iki fincan çay, aranızda yıllardır birikmiş gibi duran bir sessizlik. "Konuşalım," dedi sadece.',
      '{manager} called you into his office. Door closed, two cups of tea on the desk and a silence that feels years old. "Let\'s talk," he said, simply.',
    ),
    choices: [
      choice('apologise', L('Özür dile, sayfayı çevir', 'Apologise and turn the page'),
        L('{manager} uzun süre baktı, sonra elini uzattı. "Futbolda gurur pahalıdır, evladım."', '{manager} looked at you a long moment, then held out his hand. "Pride is expensive in football, son."'),
        { rel: { manager: 9, teammates: 2 }, morale: -1 }),
      choice('stand', L('Haklı olduğunu savun', 'Stand your ground'),
        L('Odadan dik çıktın; ama soyunma odasında hava buz kesti.', 'You left the office head high, but the dressing room turned icy.'),
        { rel: { manager: -5, fans: 3, teammates: -1 }, morale: 3, flags: { 'narr.feud.hard': true } }),
      choice('agent', L('Menajerinin devreye girmesini iste', 'Ask your agent to step in'),
        L('{agent} bir akşam yemeğiyle iki tarafı da yatıştırmaya çalıştı; sonuç yarı yarıya.', '{agent} tried to soothe both sides over dinner; the result was half and half.'),
        { rel: { agent: 3, manager: 1 }, flags: { 'narr.feud.agent': true } }),
    ],
  },

  // ───────────────────────── love ─────────────────────────
  {
    id: 'love_paparazzi', icon: 'camera', cooldown: 30, weight: 0, when: never, persona: (f) => f.partnerName ?? '', story: 'love',
    title: L('Objektiflerin Önünde', 'Caught on Camera'),
    body: L(
      'Dün akşam restorandan çıkarken {partner} ile fotoğrafınız çekildi; sabaha tüm magazin sayfalarında. {partner} telefonunu uzatıyor: "Peki, ne yapıyoruz?"',
      'You were photographed leaving a restaurant with {partner} last night; this morning it\'s on every gossip page. {partner} holds out the phone: "So — what do we do?"',
    ),
    choices: [
      choice('public', L('Birlikte bir fotoğraf paylaş', 'Post a photo together'),
        L('Paylaşım yarım milyon beğeni topladı; taraftarlar "çok yakıştınız" yazıyor.', 'The post got half a million likes; the fans say "you look perfect together".'),
        { rel: { partner: 6, fans: 2, media: -1 }, followers: 30000, fame: 1.5, morale: 4 }),
      choice('private', L('Sessiz kal, mahremiyetini koru', 'Stay quiet and protect your privacy'),
        L('Basın biraz kırıldı ama {partner} için bu en iyi cevaptı.', 'The press was a little cross, but this was the best answer for {partner}.'),
        { rel: { partner: 3, media: -2 }, morale: 2 }),
      choice('joke', L('Mizahla geç: "Sadece yemek yiyorduk!"', 'Laugh it off: "We were just having dinner!"'),
        L('Kısa bir komik video attın, magazin sayfaları "tatlı çift" diye yazdı.', 'You posted a funny clip and the gossip pages wrote "cute couple".'),
        { rel: { partner: 3, media: 2 }, fame: 1, followers: 10000, morale: 2 }),
    ],
  },
  {
    id: 'love_proposal', icon: 'gem', cooldown: 60, weight: 0, when: never, persona: (f) => f.partnerName ?? '', story: 'love',
    title: L('Yüzük Kutusu', 'The Ring Box'),
    body: L(
      '{partner} ile aranız aylardır çok iyi. Vitrinde bir yüzük gördün ve bir an durdun. Belki de gerçek adımı atma vaktidir; ya da henüz erken.',
      'Things with {partner} have been wonderful for months. You saw a ring in a shop window and stopped for a moment. Maybe it\'s time for the real step — or maybe it\'s too early.',
    ),
    choices: [
      choice('big', L('Tribünde, tüm stadyumun önünde evlenme teklif et', 'Propose in the stands in front of the whole stadium'),
        L('Stad ayakta! {partner} "Evet" dedi, dev ekran gözyaşlarını yakaladı.', 'The stadium is on its feet! {partner} said "Yes" and the big screen caught the tears.'),
        (f) => ({ money: -cash(f, 15000, 5), rel: { partner: 8, fans: 4, media: 2 }, fame: 2.5, followers: 80000, morale: 7, flags: { 'narr.love.engaged': true } }),
        { then: (c) => { if (c.storyline) c.storyline.data.engaged = true; } }),
      choice('quiet', L('Sahilde, sadece ikiniz', 'On the beach, just the two of you'),
        L('Gün batımı, bir diz, bir yüzük. Dünya durdu.', 'A sunset, a knee, a ring. The world stopped.'),
        (f) => ({ money: -cash(f, 8000, 3), rel: { partner: 8 }, morale: 8, flags: { 'narr.love.engaged': true } }),
        { then: (c) => { if (c.storyline) c.storyline.data.engaged = true; } }),
      choice('wait', L('Henüz erken, beklemeyi seç', 'It\'s too early, choose to wait'),
        L('{partner} anladığını söyledi ama bakışında küçük bir gölge vardı.', '{partner} said they understood, but there was a small shadow in the eyes.'),
        { rel: { partner: -3 }, morale: -1 }),
    ],
  },
  {
    id: 'love_breakup', icon: 'heart', cooldown: 60, weight: 0, when: never, story: 'love',
    title: L('Boş Kalan Koltuk', 'The Empty Seat'),
    body: L(
      'Telefon sessiz. Evde birinin eksikliği duvarlara siniyor. {friend} kapıya geldi: "Kalk, dışarı çıkıyoruz." İçinde ne yapacağını bilmiyorsun.',
      'The phone is silent. Someone\'s absence seeps into the walls. {friend} appears at the door: "Get up, we\'re going out." You don\'t know what to do with yourself.',
    ),
    choices: [
      choice('train', L('Acını antrenmana dök', 'Pour the pain into training'),
        L('Üç saat koştun, iki saat vurdun. Hoca "Bu çocuğa ne oldu?" diye şaşırdı.', 'Three hours running, two shooting. The gaffer wondered what had got into you.'),
        { energy: -12, form: 4, morale: -2, rel: { manager: 3 } }),
      choice('family', L('Ailenin yanına git', 'Go to your family'),
        L('Annenin çorbası, babanın sessiz omzu. İyileşmenin ilk adımı.', 'Mum\'s soup, dad\'s silent shoulder. The first step to healing.'),
        { rel: { family: 6 }, morale: 4, energy: 3 }),
      choice('out', L('Arkadaşlarla çık, her şeyi unut', 'Go out with friends and forget it all'),
        L('Eğlendin ama ertesi sabah bir fotoğrafın internete düştü.', 'You had fun, but the next morning a photo hit the internet.'),
        { morale: 3, rel: { teammates: 3, media: -3, manager: -2 }, followers: 5000 }),
    ],
  },

  // ───────────────────────── scandal ─────────────────────────
  {
    id: 'scandal_press', icon: 'siren', cooldown: 40, weight: 0, when: never, persona: (f) => f.agentName, story: 'scandal',
    title: L('Manşet Krizi', 'Headline Crisis'),
    body: L(
      'Olay sabah gazetelerinde bomba gibi patladı. {agent} acil toplantı istiyor: "Şimdi doğru adımı atmazsak bu hikâye bir hafta içinde kariyerin kadar büyür. Üç yolumuz var."',
      'The story exploded across this morning\'s papers. {agent} is demanding an emergency meeting: "If we don\'t take the right step now, this story will outgrow your career within a week. We have three roads."',
    ),
    choices: [
      choice('apologise', L('Açıkça özür dile', 'Apologise openly'),
        L('Dik duruşlu bir özür basında olumlu karşılandı. Biraz canın yansa da hikâye küçüldü.', 'A dignified apology was received well in the press. It stung, but the story shrank.'),
        { rel: { media: 3, fans: 2, sponsors: -1, family: 1 }, morale: -2, fame: -0.5 }),
      choice('deny', L('Her şeyi yalanla', 'Deny everything'),
        L('Kısa vadede ateş söndü; ama ya kanıt çıkarsa?', 'The fire died down in the short term — but what if proof emerges?'),
        { rel: { media: -2, fans: 1 }, morale: 1 },
        { risk: { chance: 0.45, fx: { rel: { media: -8, sponsors: -5, fans: -3 }, fame: -3, morale: -4 }, text: L('Yalanın ortaya çıktı: sponsorlar uzaklaştı, basın seni hedef aldı.', 'Your denial fell apart: sponsors backed away and the press went after you.') } }),
      choice('lawyer', L('Avukata devret, sessiz kal', 'Hand it to the lawyers and stay silent'),
        L('Avukatın tek cümlelik açıklaması sonrası sessizlik başladı. Pahalı ama temiz bir çıkış.', 'After your lawyer\'s one-line statement, silence set in. Expensive, but a clean exit.'),
        (f) => ({ money: -cash(f, 12000, 3), rel: { media: -1, sponsors: 1 }, morale: 1 })),
    ],
  },

  // ───────────────────────── injury comeback ─────────────────────────
  {
    id: 'comeback_rehab', icon: 'stethoscope', cooldown: 20, weight: 0, when: never, persona: (f) => f.npc('physio'), story: 'injury_comeback',
    title: L('Rehabilitasyonun Sınavı', 'The Rehab Test'),
    body: L(
      '{physio} iyileşme programını masaya koydu: sıkıcı, ağır ama hayati. İçindeki ses "Geri dön, hemen şimdi!" diye bağırıyor. Bu kararın nereye varacağını bilmiyorsun.',
      '{physio} laid the recovery programme on the desk: dull, heavy, essential. The voice in your head screams "Get back, right now!" You don\'t know where this decision leads.',
    ),
    choices: [
      choice('plan', L('Programa harfiyen uy', 'Follow the plan to the letter'),
        L('Gün gün, hafta hafta... Sabırla ilerledin. {physio} "Sen harikasın" dedi.', 'Day by day, week by week... you progressed patiently. {physio} said, "You\'re remarkable."'),
        { morale: 2, rel: { manager: 3 }, xp: { composure: 3 } }),
      choice('rush', L('Erken dön: bir iki seansı atla', 'Come back early: skip a few sessions'),
        L('Bir iki seans atladın; bacağın "yeter" diyor gibi.', 'You skipped a couple of sessions; your leg seems to be saying "enough".'),
        { morale: 3, form: 2 },
        { risk: { chance: 0.35, fx: { injuryWeeks: 3, morale: -5 }, text: L('Fazla zorladın: aynı bölgede yeniden ağrı başladı, rehabilitasyon uzayacak.', 'You pushed too hard: the same spot flared up and rehab will drag on.') },
          then: (c) => { if (c.storyline && c.riskHit) c.storyline.data.setback = true; } }),
      choice('extra', L('{physio} ile ekstra seanslar yap', 'Add extra sessions with {physio}'),
        L('Akşam seanslarında {physio} sana yeni egzersizler gösterdi. Dizin her gün daha sağlam.', 'In the evening sessions {physio} showed you new exercises. Your knee is firmer each day.'),
        (f) => ({ money: -cash(f, 4000, 1), morale: 3, xp: { stamina: 2 }, energy: -6, rel: { manager: 2 } })),
    ],
  },
  {
    id: 'comeback_return', icon: 'rocket', cooldown: 20, weight: 0, when: never, persona: (f) => f.managerName, story: 'injury_comeback',
    title: L('Geri Döndün', 'You\'re Back'),
    body: L(
      'Tedavi odasından sahaya: {manager} seni kadroya geri çağırdı. Tünelden çıkarken tribünde bir pankart gördün: "Hoş geldin kahraman." Dizin titremiyor, kalbin titriyor.',
      'From the treatment room to the pitch: {manager} has called you back into the squad. Walking out you spot a banner in the stand: "Welcome back, hero." Your knee isn\'t shaking — your heart is.',
    ),
    choices: [
      choice('thanks', L('Taraftara teşekkür paylaşımı yap', 'Post a thank-you to the fans'),
        L('Paylaşımın çok konuşuldu; taraftarlar "bizim çocuk döndü" diyor.', 'Your post was shared widely; fans say "our boy is back".'),
        { rel: { fans: 6, media: 2 }, morale: 5, followers: 20000, fame: 1 }),
      choice('gift', L('Fizyoterapi ekibine hediye al', 'Buy a gift for the physio team'),
        L('Çiçekler, çikolata ve el yazısı bir not. Ekip gözyaşlarını saklayamadı.', 'Flowers, chocolates and a handwritten note. The team couldn\'t hide their tears.'),
        (f) => ({ money: -cash(f, 3000, 1), rel: { teammates: 4, manager: 2 }, morale: 4 })),
      choice('hungry', L('"Geri döndüm ve daha açım."', '"I\'m back, and hungrier."'),
        L('Cümlen manşet oldu. Basın "Küllerinden doğan yıldız" yazdı.', 'Your line became a headline. The press called you "the star risen from the ashes".'),
        { fame: 2, rel: { media: 3, fans: 3 }, form: 2, morale: 3 }),
    ],
  },

  // ───────────────────────── wonderkid threat ─────────────────────────
  {
    id: 'wonderkid_buzz', icon: 'star', cooldown: 30, weight: 0, when: never, persona: (f) => f.youngster ?? '', story: 'wonderkid_threat',
    title: L('Veliaht Geliyor', 'The Heir Arrives'),
    body: L(
      'Altyapıdan yükselen {youngster} antrenmanlarda gözleri parlatıyor. Soyunma odasında "veliaht" lakabı şimdiden yayıldı. Onun mevkii, tam olarak senin mevkiin.',
      'Academy graduate {youngster} is lighting up training. The nickname "the heir" has already spread through the dressing room. His position is exactly yours.',
    ),
    choices: [
      choice('mentor', L('Onu kanatların altına al', 'Take him under your wing'),
        L('Gençle bir sürü şey paylaştın; hoca ve takım bu olgunluğu çok sevdi.', 'You shared a lot with the lad; the gaffer and squad loved the maturity.'),
        { rel: { teammates: 4, manager: 3 }, morale: -1, flags: { 'narr.kid.mentored': true } }),
      choice('compete', L('Rekabeti kabul et, her antrenmanda ez', 'Embrace the rivalry and beat him in every session'),
        L('Her antrenman bir final oldu. Formun ve yorgunluğun aynı anda arttı.', 'Every training session became a final. Your form and your fatigue rose together.'),
        { form: 3, energy: -7, xp: { dribbling: 2, stamina: 2 } }),
      choice('ignore', L('Aldırma: "Ben zaten buradayım."', 'Ignore it: "I\'m already here."'),
        L('Rahat tavrın güven verdi... ya da dikkatsizlik gibi göründü.', 'Your relaxed air looked confident... or careless.'),
        { morale: 1 },
        { risk: { chance: 0.3, fx: { morale: -3, rel: { manager: -2 } }, text: L('Hoca bu rahatlığı kibre yordu.', 'The gaffer read the relaxed attitude as arrogance.') } }),
    ],
  },
  {
    id: 'wonderkid_pressure', icon: 'timer', cooldown: 30, weight: 0, when: never, persona: (f) => f.managerName, story: 'wonderkid_threat',
    title: L('Rotasyon Sinyali', 'A Rotation Hint'),
    body: L(
      '{manager}: "{youngster} bu hafta ilk onbirde. Seni cezalandırmıyorum, sadece rekabet olsun istiyorum." Yedek kulübesinin soğuk tahtası gözünün önüne geldi.',
      '{manager}: "{youngster} starts this week. I\'m not punishing you, I just want competition." You picture the cold bench already.',
    ),
    choices: [
      choice('prove', L('Antrenmanda ezici üstünlük kur', 'Dominate in training'),
        L('Hafta içi her şeyi verdin. Hoca notlarını bir kez daha gözden geçirdi.', 'You gave everything all week. The gaffer reread his notes.'),
        { form: 4, energy: -9, rel: { manager: 2 } }),
      choice('talk', L('Hocayla açık konuş', 'Talk openly with the gaffer'),
        L('{manager} dinledi; "Yolun hâlâ açık" dedi. Ama sana söz vermedi.', '{manager} listened: "Your path is still open." But he promised nothing.'),
        { rel: { manager: 3 }, morale: -1 }),
      choice('agent', L('Menajeri devreye sok', 'Put your agent on it'),
        L('{agent} kulübe telefon açtı. Sonuç: hoca soğudu, ama alternatifler masada.', '{agent} phoned the club. The result: the gaffer cooled, but alternatives are on the table.'),
        { rel: { agent: 3, manager: -4 }, flags: { 'narr.loan.open': true } }),
    ],
  },

  // ───────────────────────── agent drama ─────────────────────────
  {
    id: 'agent_whisper', icon: 'eye', cooldown: 30, weight: 0, when: never, persona: (f) => f.npc('friend'), story: 'agent_drama',
    title: L('Kulağıma Çalındı', 'A Whisper in Your Ear'),
    body: L(
      '{friend} aradı, sesi kısık: "Bunu bilmen lazım. {agent}, bir kulüple senin adına gizli bir komisyon pazarlığı yapmış diyorlar. Kesin değil, ama duman var."',
      '{friend} rang, voice low: "You need to know this. They say {agent} struck a secret commission deal with a club behind your back. Nothing certain, but there\'s smoke."',
    ),
    choices: [
      choice('ignore', L('Aldırma, güven', 'Shrug it off and trust'),
        L('Güven göstermek kolay değil; ama bazen en akıllıca yoldur.', 'Showing trust isn\'t easy, but it\'s sometimes the wisest road.'),
        { rel: { agent: 2 }, morale: -1 }),
      choice('ask', L('Doğrudan sor', 'Ask directly'),
        L('{agent} bir an duraksadı: "Kim söyledi sana bunu?" Cevabı pek ikna edici değildi.', '{agent} paused: "Who told you that?" The answer wasn\'t very convincing.'),
        { rel: { agent: -3 }, morale: -1, flags: { 'narr.agent.asked': true } }),
      choice('audit', L('Gizlice bir muhasebeci tut', 'Quietly hire an accountant'),
        L('Muhasebeci iki hafta sonra döndü: "Her şey temiz görünüyor... şimdilik." Yine de içinde bir kıpırtı kaldı.', 'The accountant returned after two weeks: "Everything looks clean... for now." A flicker of doubt remains.'),
        (f) => ({ money: -cash(f, 6000, 2), rel: { agent: -1 }, flags: { 'narr.agent.audit': true } })),
    ],
  },
  {
    id: 'agent_confront', icon: 'briefcase', cooldown: 30, weight: 0, when: never, persona: (f) => f.agentName, story: 'agent_drama',
    title: L('Masada Yüzleşme', 'The Showdown'),
    body: L(
      '{agent} karşında oturuyor; sessiz, gergin, gözleri gözlerinde. "Güven olmadan bu iş yürümez," diyor. "Kararı sen ver."',
      '{agent} sits across from you, silent, tense, eyes locked on yours. "This job doesn\'t work without trust," he says. "You decide."',
    ),
    choices: [
      choice('fire', L('Yollarınızı ayırın', 'Part ways'),
        L('Bir dönem kapandı. Yeni bir temsilci, yeni bir hikâye.', 'A chapter closed. A new representative, a new story.'),
        { rel: { agent: 6 }, morale: -1, fame: -0.5, flags: { 'narr.agent.fired': true } }, // the new agent starts fresh
        { then: (c) => { c.state.flags['narr.agent.replace'] = true; } }),
      choice('forgive', L('Bir şans daha ver', 'Give one more chance'),
        L('{agent} gözlerini kapadı: "Bunu unutmayacağım." Aranızdaki bağ eskisinden güçlü.', '{agent} closed his eyes: "I won\'t forget this." Your bond is stronger than before.'),
        { rel: { agent: 8 }, morale: 2 }),
      choice('terms', L('Yeni, şeffaf bir sözleşme iste', 'Demand a new, transparent contract'),
        L('Komisyon yüzdesi düştü, raporlar haftalık. Çözüm işlevsel, ama biraz soğuk.', 'The commission dropped and reports go weekly. A workable fix, if slightly cold.'),
        { rel: { agent: 3 }, flags: { 'narr.agent.renegotiated': true } }),
    ],
  },

  // ───────────────────────── golden generation ─────────────────────────
  {
    id: 'golden_camp', icon: 'flag', cooldown: 30, weight: 0, when: never, persona: (f) => f.teammate, story: 'golden_generation',
    title: L('Kampta Bir Gece', 'A Night at Camp'),
    body: L(
      'Millî kamp odasında yeni kuşağın çocukları oyun konsolunun başında. "Biz bir şey başaracağız," diyor biri, yarı şaka yarı ciddi. Herkes sana bakıyor.',
      'In the national-camp lounge the new generation sits around a console. "We\'re going to win something," says one, half joking, half serious. Everyone looks at you.',
    ),
    choices: [
      choice('bond', L('Bu akşam birlikte olun, şarkılar söyleyin', 'Spend the evening together, sing songs'),
        L('Gecenin sonunda bir takım değil, bir kardeşlik doğmuştu.', 'By the end of the night a brotherhood, not just a team, was born.'),
        { rel: { teammates: 5 }, morale: 5, energy: -3, flags: { 'narr.golden.bond': true } }),
      choice('serious', L('Gülerek dinle ama erken yat', 'Smile but turn in early'),
        L('Erken yattın, taze kalktın. Hoca fark etti.', 'You turned in early and woke fresh. The coach noticed.'),
        { energy: 6, rel: { manager: 3 }, morale: 1 }),
      choice('leader', L('Bir konuşma yap: "Bu bayrak hepimizin."', 'Give a speech: "This flag belongs to all of us."'),
        L('Odada sessizlik oldu, sonra alkış. Yeni kuşağın dili artık bu.', 'Silence in the room, then applause. This is the new generation\'s language now.'),
        { rel: { teammates: 4, manager: 2, media: 2 }, fame: 1.5, morale: 3 }),
    ],
  },
  {
    id: 'golden_tournament', icon: 'trophy', cooldown: 60, weight: 0, when: never, persona: (f) => f.managerName, story: 'golden_generation',
    title: L('Büyük Sahne', 'The Big Stage'),
    body: L(
      'Turnuvada ülke senin ve arkadaşlarının peşinde. Kapıdaki pankartlarda "Altın Jenerasyon" yazıyor; her maç bir ulusal bayram havasında. Yük büyük, ışıklar daha da büyük.',
      'At the tournament a nation is following you and your mates. Banners say "Golden Generation" and every match feels like a national holiday. The load is heavy, the lights heavier.',
    ),
    choices: [
      choice('seize', L('Sahneyi sahiplen, topu iste', 'Seize the stage and demand the ball'),
        L('Her top sende, her bakış sende. Ülke sana baktı, sen de ona.', 'Every pass through you, every eye on you. The nation looked at you and you looked back.'),
        { fame: 3, followers: 90000, morale: 4, rel: { fans: 4, media: 3 } },
        { risk: { chance: 0.3, fx: { morale: -4, rel: { media: -2 } }, text: L('Yük ağır geldi; kritik bir pozisyonda kaçırdığın top günlerce konuşuldu.', 'The weight told: a miss at a key moment was talked about for days.') } }),
      choice('team', L('Takım için oyna: "Biz kazanırız, ben değil."', 'Play for the team: "We win, not me."'),
        L('Takım arkadaşların bu cümleyi dövme yaptırır gibi yazdı. Altın jenerasyonun ruhu buydu.', 'Your teammates wrote that line like a tattoo. That was the soul of the golden generation.'),
        { rel: { teammates: 5, fans: 3, manager: 2 }, fame: 1.5, morale: 3 }),
      choice('rest', L('Enerjini koru, kritik maça sakla', 'Save your energy for the key game'),
        L('Kendini hissettin. Ama analistler "temkinli" yazdı.', 'You felt yourself. The analysts wrote "cautious".'),
        { energy: 10, rel: { manager: 2, media: -1 } }),
    ],
  },

  // ───────────────────────── underdog title ─────────────────────────
  {
    id: 'underdog_rise', icon: 'rocket', cooldown: 60, weight: 0, when: never, persona: (f) => f.managerName, story: 'underdog_title',
    title: L('Masal Başlıyor', 'The Fairy Tale Begins'),
    body: L(
      '{club} beklenmedik şekilde üst sıralarda. Şehirdeki kahvehanelerde herkes "Bu sene bizim yıl" diyor. {manager} ise sakin: "Önce bir sonraki maç. Başka bir şey yok."',
      '{club} are unexpectedly near the top. Every café in the city says "This is our year". {manager} stays calm: "The next game first. Nothing else."',
    ),
    choices: [
      choice('believe', L('Hayal kur, herkesi coştur', 'Dream out loud and fire everyone up'),
        L('Taraftar seni omuzladı. Soyunma odasında inanç tavan yaptı.', 'The fans carried you on shoulders. Belief in the dressing room hit the roof.'),
        { rel: { fans: 5, teammates: 3 }, morale: 4, fame: 1 }),
      choice('ground', L('Ayakları yere bastır: "Önce bir sonraki maç."', 'Keep feet on the ground: "Next game first."'),
        L('Hocanın yüzünde bir gülümseme belirdi. Disiplin bu masalın sırrı.', 'A smile crossed the gaffer\'s face. Discipline is this tale\'s secret.'),
        { rel: { manager: 4, teammates: 3 }, morale: 1, form: 2 }),
      choice('tease', L('Rakiplere gönderme yap', 'Throw a jab at the big clubs'),
        L('Basın bayıldı; "Küçük takımın cesur oyuncusu".', 'The press loved it — "the small team\'s brave one".'),
        { rel: { media: 3, fans: 2 }, fame: 1.5, followers: 15000 },
        { risk: { chance: 0.25, fx: { form: -3, morale: -2 }, text: L('"Nazar değdi" dediler; ertesi hafta tökezledin.', '"The evil eye," they said; you stumbled the very next week.') } }),
    ],
  },
  {
    id: 'underdog_dream', icon: 'crown', cooldown: 60, weight: 0, when: never, persona: (f) => f.managerName, story: 'underdog_title',
    title: L('Zirvenin Soğuk Havası', 'The Thin Air at the Top'),
    body: L(
      'Puan tablosunda zirvedesiniz ve son haftalar yaklaşıyor. Şehir bayraklarla donandı, çocuklar sizin için şarkı yazıyor. {manager} soyunma odasında sadece şunu dedi: "Bu hikâyeyi tamamlayalım."',
      'You\'re at the top of the table with the final weeks coming. The city is dressed in flags and kids are writing songs about you. {manager} said just one thing in the dressing room: "Let\'s finish this story."',
    ),
    choices: [
      choice('lead', L('Soyunma odasında liderliği üstlen', 'Take the lead in the dressing room'),
        L('Sessiz geçen toplantıdan sonra herkes aynı hedefe kilitlenmişti.', 'After a silent meeting, everyone was locked onto the same target.'),
        { rel: { teammates: 5, manager: 3 }, morale: 4, form: 3, energy: -4 }),
      choice('fans', L('Taraftarla birlikte antrenmana çık', 'Train alongside the fans'),
        L('Binlerce kişi antrenmanı izledi. Stad değil, bir şehir ayakta.', 'Thousands watched training. Not a stadium — a whole city on its feet.'),
        { rel: { fans: 7, media: 2 }, morale: 5, fame: 1.5, energy: -5 }),
      choice('focus', L('Her şeyi kapat, sadece futbol', 'Shut everything off, only football'),
        L('Sosyal medyayı bıraktın, telefonu çekmeceye koydun. Gözlerin sadece kaleyi görüyor.', 'You quit social media and locked the phone in a drawer. Your eyes only see the goal.'),
        { form: 4, morale: 2, rel: { media: -2 } }),
    ],
  },
  {
    id: 'underdog_parade', icon: 'trophy', cooldown: 999, weight: 0, when: never, story: 'underdog_title',
    title: L('Şampiyonluk Turu', 'The Championship Parade'),
    body: L(
      'ŞAMPİYONUZ! Kimsenin şans vermediği {club}, ligin zirvesine çıktı. Şehrin her sokağı mavi-beyaz değil, tek bir renk: sevinç. Açık otobüsün tepesinde birkaç yüz bin kişiye bakıyorsun.',
      'CHAMPIONS! Nobody gave {club} a chance, yet here they are on top. Every street is one colour: joy. From the top of the open bus you look out over hundreds of thousands.',
    ),
    choices: [
      choice('bus', L('Açık otobüste kupayı kaldır', 'Lift the trophy on the open bus'),
        L('Şehir seni hayatın boyunca unutmayacak. Sen de bu geceyi.', 'The city will never forget you. Neither will you forget tonight.'),
        { fame: 4, followers: 150000, rel: { fans: 8, media: 4, sponsors: 4 }, morale: 8, money: 25000, flags: { 'narr.underdog.champion': true } }),
      choice('chant', L('Tribünde taraftarla birlikte şarkı söyle', 'Sing with the fans in the stand'),
        L('Boğazın kısıldı, gözlerin doldu; ama o şarkıyı hayatın boyunca söylerken buldun kendini.', 'Your voice cracked, your eyes filled; you\'ll be humming that song for life.'),
        { rel: { fans: 8, teammates: 4 }, morale: 8, fame: 2.5, flags: { 'narr.underdog.champion': true } }),
      choice('quiet', L('Önce ailenle sessiz bir an yaşa', 'Take a quiet moment with your family first'),
        L('Annenle sarıldınız, hiçbir şey konuşmadan. O an, kupadan değerli.', 'You hugged your mum, without a word. That moment is worth more than the trophy.'),
        { rel: { family: 8, fans: 4 }, morale: 8, fame: 2, flags: { 'narr.underdog.champion': true } }),
    ],
  },
  {
    id: 'underdog_so_close', icon: 'frown', cooldown: 60, weight: 0, when: never, story: 'underdog_title',
    title: L('Bir Adım Kala', 'One Step Short'),
    body: L(
      'Sezon bitti ve masal şampiyonlukla bitmedi. Soyunma odasında bazıları gözyaşı döküyor, bazıları sessiz. Ama şehir hâlâ ayakta ve sana alkış tutuyor.',
      'The season is over and the fairy tale didn\'t end in a title. Some in the dressing room are in tears, others silent. But the city is still on its feet applauding you.',
    ),
    choices: [
      choice('thank', L('Taraftara teşekkür turu at', 'Do a lap of thanks to the fans'),
        L('Alkışlar kupa kadar sıcaktı. Geleceğe umutla bakıyorsun.', 'The applause was as warm as a trophy. You look to the future with hope.'),
        { rel: { fans: 6, teammates: 3 }, morale: 3, fame: 1 }),
      choice('promise', L('"Gelecek yıl yine buradayız." diye söz ver', 'Promise: "We\'ll be back here next year."'),
        L('Söz tribünleri coşturdu. Ağır bir yük, tatlı bir söz.', 'The pledge thrilled the stands. A heavy load, a sweet word.'),
        { rel: { fans: 4, media: 2 }, morale: 4, fame: 1 }),
      choice('rest', L('Tatile çık, kafa dinle', 'Go on holiday and clear your head'),
        L('Güneş, deniz ve sıfır telefon. Pilin yeniden doluyor.', 'Sun, sea and no phone. You recharge fully.'),
        { energy: 15, morale: 3, rel: { family: 2 } }),
    ],
  },

  // ───────────────────────── contract standoff ─────────────────────────
  {
    id: 'standoff_ultimatum', icon: 'briefcase', cooldown: 30, weight: 0, when: never, persona: (f) => f.agentName, story: 'contract_standoff',
    title: L('Son Teklif Masası', 'The Final Offer'),
    body: L(
      '{agent}: "Kulüp son teklifini gönderdi. Rakam beklentimizin altında ve süre kısıtlı. Ya kabul ederiz ya da piyasaya çıkarız. Nasıl oynayalım?"',
      '{agent}: "The club has sent its final offer. The figure is below our expectation and time is short. Either we accept or we go to market. How do we play it?"',
    ),
    choices: [
      choice('push', L('Sonuna kadar pazarlık et', 'Haggle to the end'),
        L('{agent} masayı sarstı; kulüp bir adım geri attı ama atmosfer gerildi.', '{agent} shook the table; the club took a step back but the mood tightened.'),
        { rel: { agent: 2, manager: -3, fans: -2 }, flags: { 'narr.standoff.hard': true } }),
      choice('soft', L('"Burada kalmak istiyorum."', '"I want to stay here."'),
        L('Taraftar bu cümleyi tezahüratlara dönüştürdü. Hoca da memnun.', 'The fans turned that line into a chant. The gaffer is pleased too.'),
        { rel: { fans: 5, manager: 4, agent: -2 }, morale: 2, flags: { 'narr.standoff.soft': true } }),
      choice('media', L('Basına sızdır: "Değerimi bilsinler"', 'Leak to the press: "Let them know my worth"'),
        L('Manşetler çözüm getirdi mi bilinmez, ama gündem sensin.', 'Whether the headlines helped is unclear, but you\'re the talk of town.'),
        { rel: { media: 3, agent: 1 }, fame: 1.5, followers: 12000 },
        { risk: { chance: 0.3, fx: { rel: { fans: -5, manager: -3, sponsors: -2 } }, text: L('Taraftar bunu kibir olarak okudu; tribünden ıslık seslerini duydun.', 'The fans read it as arrogance; you heard whistles from the stand.') } }),
    ],
  },
];
