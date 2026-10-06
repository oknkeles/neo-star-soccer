/**
 * Persona chat: the agent, manager, mentor, partner, family and rival answer in character. The reply is
 * picked by intent (detected from TR + EN keywords) and filled with facts from the career context.
 */
import type { NarrativeContext, ChatMessage, PersonaKind } from '../core/narrative-types';
import { formatMoney } from '../core/util';
import { cap, fill, normText, pickFilled, rngFrom, type Bank, type Slots } from './grammar';
import { ctxSlots, langOf } from './ctxutil';

const b = (tr: string[], en: string[]): Bank => ({ tr, en });

export type Intent =
  | 'greeting' | 'goodbye' | 'thanks' | 'transfer' | 'wage' | 'playtime' | 'advice' | 'injury' | 'love' | 'family' | 'trash' | 'form' | 'rival' | 'other';

const KEYS: [Intent, string[]][] = [
  ['trash', ['aptal', 'salak', 'rezil', 'kaybeden', 'seni yen', 'yeneceğim', 'ezeceğim', 'idiot', 'loser', 'pathetic', 'you suck', 'shut up', 'trash', "i'll beat you", 'overrated', 'şişirilmiş']],
  ['injury', ['sakat', 'ağrı', 'sızı', 'tedavi', 'doktor', 'topallı', 'injur', 'pain', 'hurt', 'physio', 'knock', 'strain']],
  ['love', ['aşk', 'sevgili', 'seviyorum', 'özledim', 'kalbim', 'canım', 'love you', 'miss you', 'darling', 'babe', 'date', 'dinner']],
  ['transfer', ['transfer', 'başka kulüp', 'teklif', 'ayrıl', 'gitmek', 'imza', 'kulüp değiş', 'move', 'offer', 'leave', 'sign', 'bid', 'new club', 'interest']],
  ['wage', ['maaş', 'zam', 'para', 'ücret', 'prim', 'sözleşme', 'wage', 'salary', 'money', 'pay', 'bonus', 'raise', 'contract', 'rich']],
  ['playtime', ['forma', 'süre', 'oynat', 'yedek', 'ilk 11', 'ilk onbir', 'kadro', 'dakika', 'bench', 'minutes', 'start me', 'lineup', 'squad', 'playing time', 'dropped', 'drop me']],
  ['rival', ['rakip', 'rival']],
  ['advice', ['tavsiye', 'öneri', 'ne yapmalı', 'nasıl gelişi', 'gelişmek', 'antrenman', 'ipucu', 'advice', 'tip', 'what should', 'how do i', 'improve', 'train', 'help me', 'yardım']],
  ['thanks', ['teşekkür', 'sağ ol', 'sağol', 'eyvallah', 'minnettar', 'thanks', 'thank you', 'grateful', 'cheers', 'appreciate']],
  ['family', ['aile', 'anne', 'baba', 'kardeş', 'family', 'mum', 'mom', 'dad', 'brother', 'sister', 'parents']],
  ['form', ['form', 'gol', 'maç', 'performans', 'puan', 'goal', 'game', 'performance', 'rating', 'played', 'result', 'match', 'season', 'sezon']],
  ['goodbye', ['görüşürüz', 'hoşça kal', 'kendine iyi bak', 'iyi geceler', 'bye', 'see you', 'goodbye', 'good night', 'later']],
  ['greeting', ['merhaba', 'selam', 'günaydın', 'naber', 'nasılsın', 'hello', 'hi ', 'hey', 'good morning', 'how are you', "what's up", 'sup']],
];

export function detectIntent(message: string, ctx?: NarrativeContext): Intent {
  const txt = ` ${normText(message)} `;
  const rivalLast = normText(ctx?.rival?.name ?? '').split(/\s+/).slice(-1)[0];
  let best: Intent = 'other';
  let bestScore = 0;
  for (const [intent, words] of KEYS) {
    let score = words.reduce((n, w) => n + (txt.includes(w) ? 1 : 0), 0);
    if (intent === 'rival' && rivalLast && rivalLast.length > 2 && txt.includes(rivalLast)) score += 2;
    if (score > bestScore) { best = intent; bestScore = score; }
  }
  if (bestScore === 0 && txt.trim().split(/\s+/).length <= 2 && /^(hi|hey|sa|slm|mrb)\b/.test(txt.trim())) return 'greeting';
  return best;
}

type PersonaBanks = Partial<Record<Intent, Bank>>;

const BANKS: Record<PersonaKind, PersonaBanks> = {
  agent: {
    greeting: b(['Selam {first}! Tam zamanında aradın, masamda üç dosya var. Neyi konuşalım?', 'Nasılsın şampiyon? Telefonlar çalıyor, ben de buradayım. Dinliyorum.', 'Hoş geldin. Önce iyi haber mi kötü haber mi?'], ['Hey {first}! Perfect timing, I\'ve got three folders on my desk. What shall we discuss?', 'How are you, champ? The phones are ringing and I\'m right here. Go ahead.', 'Welcome. Good news first or bad news?']),
    goodbye: b(['Hadi eyvallah. Bir şey olursa ilk beni ara.', 'İyi dinlen, gerisi bende.'], ['Alright, speak soon. If anything happens, ring me first.', 'Rest up, I\'ll handle the rest.']),
    thanks: b(['Boş ver, işim bu. Sen sahada parla, ben masada savaşırım.', 'Teşekkür etme, komisyonumu alıyorum zaten. Şaka şaka! Seninle çalışmak keyif.'], ['Don\'t mention it, it\'s my job. You shine on the pitch, I\'ll fight at the table.', 'No thanks needed, I take my commission anyway. Joking! It\'s a pleasure working with you.']),
    transfer: b(['Kulislerde adın geçiyor. {club} yönetimi biraz endişeli, ben de bunu bilerek masaya oturuyorum. Doğru zamanı bekleyelim; acele eden aldanır.', 'Telefonlar susmuyor ama her teklife "evet" demeyeceğiz. Sana en yüksek maaşı değil, en doğru yolu bulacağım.', 'Transfer mi? Şimdilik üç kulüple sessiz sessiz konuşuyorum. Hiçbir şey sızmasın, sen formanı giy ve oyna.'], ['Your name is doing the rounds. {club} are a bit nervous and I\'m heading into talks knowing that. Let\'s wait for the right moment; the one who rushes gets burned.', 'The phones haven\'t stopped, but we won\'t say yes to every offer. I\'ll find you the right path, not just the highest wage.', 'A move? Quietly talking to three clubs. Nothing leaks, you just pull on the shirt and play.']),
    wage: b(['Şu an haftalık {wage} alıyorsun. Gol sayın ve şöhretin artarken bunu masada kullanacağım; ama önce {club} yönetimini sıkıştırmayacağız.', 'Para konusunda panik yok. Performansın yükseldikçe rakamlar kendiliğinden büyür; ben sadece onu kâğıda dökerim.'], ['You earn {wage} a week right now. As your goals and fame rise I\'ll use that at the table, but we won\'t squeeze {club} too early.', 'No panic about money. As your performance rises the figures grow on their own; I just put it on paper.']),
    playtime: b(['Hocayla {manager} konuşacağım ama sen önce antrenmanda kendini göster. Dakikalar sahada kazanılır, telefonla değil.', 'Forma meselesi hassas. Teknik heyetle iyi geçinirsen {manager} seni düşünmek zorunda kalır.'], ['I\'ll speak to {manager}, but show it in training first. Minutes are earned on the pitch, not on the phone.', 'Playing time is delicate. Stay on good terms with the staff and {manager} will have to think of you.']),
    advice: b(['Üç şey: formunu koru, medyayla aranı bozma, kimseye "evet" deme. Kalan her şeyi bana bırak.', 'Bu sektörde herkes bir şey ister. Sen futbola odaklan; kime güvenip güvenmeyeceğini ben söylerim.'], ['Three things: keep your form, stay on good terms with the press, say "yes" to nobody. Leave everything else to me.', 'In this business everybody wants something. You focus on football; I\'ll tell you who to trust.']),
    injury: b(['Sakatlık mı? Önce sağlık. Doktorlar ne derse onu yap; bu işin telafisi yok. Sponsorlarla ben konuşurum.', 'Sakin ol, sözleşmen güvende. İyileşmeye bak; ben kulübe ve basına bilgi veririm.'], ['An injury? Health first. Do exactly what the doctors say; there are no shortcuts. I\'ll handle the sponsors.', 'Stay calm, your contract is safe. Focus on recovery and I\'ll brief the club and the press.']),
    form: b(['Son maç: {lastMatch}. Bu sezon {goals} gol, güzel gidiyoruz. Böyle devam edersen kapılar kendiliğinden açılır.', 'Rakamlar fena değil: {goals} gol. Ama yarın değil, uzun vadeyi düşün; ben bu işte yirmi yıldır bunu yapıyorum.'], ['Last game: {lastMatch}. {goals} goals this season; we\'re going well. Keep this up and doors open on their own.', 'The numbers aren\'t bad: {goals} goals. But think long term, not tomorrow; I\'ve been doing this for twenty years.']),
    rival: b(['{rival} bu hafta manşetlerde, evet. Ama sen kimseyle yarışmıyorsun; kendi hikâyeni yazıyorsun. Biraz sabır, markanı biz büyüteceğiz.'], ['{rival} is in the headlines this week, yes. But you\'re not racing anyone; you\'re writing your own story. Patience, we\'ll grow your brand.']),
    trash: b(['Sakin ol şampiyon, bunu bana değil sahada rakibine söylersin. Kameralar açıkken ağzını kolla.', 'Böyle konuşursan sponsorlar kaçar. Derin bir nefes al ve unutalım.'], ['Easy, champ, say that to your opponent on the pitch, not to me. Watch your mouth when cameras are on.', 'Talk like that and sponsors run. Take a deep breath, let\'s forget it.']),
    love: b(['Özel hayatın seni mutlu ediyorsa kesinlikle destekliyorum. Sadece basının önünde dikkatli ol; magazin acımasızdır.'], ['If your private life makes you happy I\'m all for it. Just be careful in front of the press; tabloids are merciless.']),
    family: b(['Ailen senin en büyük destekçin. Onlara zaman ayır; ama kararları masada ben vereceğim, tamam mı?'], ['Your family is your biggest supporter. Make time for them, but I make the calls at the table, deal?']),
    other: b(['Anlıyorum. Biraz daha açar mısın? Detayları bilmeden bir şey söylemem.', 'Hmm, ilginç. Bunu not alıyorum; önümüzdeki günlerde döneceğim.', 'Net konuşalım: bu işle ilgili bir sorun mu var yoksa bir fırsat mı?'], ['I see. Can you say a bit more? I don\'t speak without details.', 'Hmm, interesting. I\'m noting it; I\'ll come back to you in the coming days.', 'Let\'s be straight: is this a problem or an opportunity?']),
  },
  manager: {
    greeting: b(['Gel bakalım {first}. Antrenman nasıl geçti?', 'Buyur, dinliyorum. Kısa tut, taktik toplantım var.'], ['Come in, {first}. How was training?', 'Go on, I\'m listening. Keep it short, I\'ve a tactics meeting.']),
    goodbye: b(['Tamam. Yarın antrenmanda zamanında ol.', 'İyi. Dinlen ve sahaya hazır gel.'], ['Alright. Be on time for training tomorrow.', 'Good. Rest up and come ready for the pitch.']),
    thanks: b(['Teşekkür sahada edilir evladım. Bana bir güzel performans borçlusun.', 'Rica ederim. Ama unutma, burada herkes çalışır.'], ['Thanks are paid on the pitch, son. You owe me a good performance.', 'You\'re welcome. But remember, everyone works here.']),
    transfer: b(['Transferden bahsetmeyi bırak. Şu an burada oynuyorsun; gözünü {club} formasından ayırma.', 'Menajerinle konuş, bana değil. Ama bil ki gitmek isteyen oyuncuya yol veririm; kalacaksan %100 kal.'], ['Stop talking transfers. You play here now; keep your eyes on the {club} shirt.', 'Talk to your agent, not me. But know that I let those who want to leave go; if you stay, stay 100 percent.']),
    wage: b(['Para konusu yönetimi ilgilendirir. Benim işim senin sahada yapacağın şey.', 'Maaşını ben belirlemiyorum. Ama çok çalışanın karşılığı hep bulunur.'], ['Money is for the board. My job is what you do on the pitch.', 'I don\'t set your wage. But hard work always finds its reward.']),
    playtime: b(['Süre vermek için bahane bulmaya çalışıyorum evladım; sen de bana bahane bırakma. Antrenmanda göster, hafta sonu bakarız.', 'Kadroyu ben seçerim, ama formu sen belirlersin. {goals} gol iyi, ama daha fazlasını istiyorum.', 'Seni düşünüyorum. Ama ilk onbir hak edilir, hediye edilmez.'], ['I\'m trying to find reasons to give you minutes, son; don\'t leave me excuses. Show me in training and we\'ll see at the weekend.', 'I pick the team, but you decide the form. {goals} goals is good; I want more.', 'I\'m thinking about you. But the starting eleven is earned, not given.']),
    advice: b(['Topsuz koş, topla düşün. Gençlerin hatası tersini yapmak. Bunu içine sindir.', 'Sabır, disiplin, tekrar. Başka formül yok.'], ['Run without the ball, think with it. Young players do the opposite. Take that in.', 'Patience, discipline, repetition. There is no other formula.']),
    injury: b(['Doktorlarla konuş, risk alma. Seni yarım gaz kullanmaktansa bir hafta beklemeyi tercih ederim.', 'Sakatlığı saklama. Gizlersen hepimizin zararı olur.'], ['Talk to the doctors, don\'t take risks. I\'d rather wait a week than use you at half power.', 'Don\'t hide the injury. Concealing it hurts us all.']),
    form: b(['Son maç {lastMatch}. İyi şeyler var, ama kendimize yalan söylemeyelim; eksiklerimiz de var.', 'Bu sezon {goals} gol, güzel. Ama sezon uzun; ayakların yere bassın.'], ['Last game {lastMatch}. Good things there, but let\'s not lie to ourselves; we have weaknesses too.', '{goals} goals this season, good. But the season is long; keep your feet on the ground.']),
    rival: b(['{rival} mi? Benim işim onunla değil, seninle. Önce kendi oyununa bak.'], ['{rival}? My job isn\'t him, it\'s you. Look at your own game first.']),
    trash: b(['Bu ses tonuyla benimle konuşma. Bir daha olursa ceza yazarım.', 'Sinirini sahada çıkar, burada değil. Odadan çık, sakinleş.'], ['Don\'t take that tone with me. Do it again and there\'s a fine.', 'Let your anger out on the pitch, not here. Leave the room and cool off.']),
    love: b(['Özel hayatın seni ilgilendirir; yeter ki sahaya yansımasın.'], ['Your private life is your business, as long as it doesn\'t show on the pitch.']),
    family: b(['Aile önemli, bunu bilirim. Ama sezon içinde odağını kaybetme.'], ['Family matters, I know. But don\'t lose focus during the season.']),
    other: b(['Anladım. Antrenmanda konuşuruz.', 'Bunu kafana takma, işimize bakalım.'], ['Understood. We\'ll talk at training.', 'Don\'t dwell on it, let\'s get on with our job.']),
  },
  mentor: {
    greeting: b(['Gel evlat, çay demledim. Nasıl gidiyor?', 'Selam {first}. Yüzün bir şey diyor, anlat bakalım.'], ['Come on, kid, I\'ve brewed tea. How\'s it going?', 'Hey {first}. Your face says something; tell me.']),
    goodbye: b(['Kendine iyi bak evlat. Kapım hep açık.', 'Görüşürüz. Unutma: ayaklar yerde, kafa havada.'], ['Look after yourself, kid. My door is always open.', 'See you. Remember: feet on the ground, head up.']),
    thanks: b(['Bana değil, kendine teşekkür et. Ben sadece yolu gösterdim, yürüyen sensin.', 'Gururlandırıyorsun beni {first}. Bunu bir gün başkasına aktar.'], ['Don\'t thank me, thank yourself. I only showed the road; you did the walking.', 'You make me proud, {first}. Pass it on to someone else one day.']),
    transfer: b(['Büyük kulüp, büyük maaş cazip gelir; ama oynamadığın yerde büyüyemezsin. Önce dakika, sonra isim.', 'Ben de çok kapı çaldım. En önemli şey: seni neden istediklerini sorgula.'], ['A big club and a big wage tempt you, but you don\'t grow where you don\'t play. Minutes first, name later.', 'I knocked on many doors too. The key: ask why they want you.']),
    wage: b(['Para gelir geçer evlat. İyi oynarsan para arkandan koşar; para için oynarsan hiçbir yere varamazsın.'], ['Money comes and goes, kid. Play well and money runs behind you; play for money and you go nowhere.']),
    playtime: b(['Yedek kalmak herkesin başına gelir. Ben de kaç kez dışarıda kaldım; asıl mesele ertesi gün nasıl antrenman yaptığın.'], ['Everybody gets benched. I was left out plenty of times; what matters is how you train the next day.']),
    advice: b(['Basit tut. İlk dokunuşunu çalış, bitirmeyi çalış, sonra da kafanı çalıştır. Futbol bir zihin oyunu evlat.', 'Her gün bir küçük şey öğren. Beş sene sonra kimse seni tanıyamaz.', 'Eleştiriyi dinle ama içine alma; övgüyü dinle ama yaşama.'], ['Keep it simple. Work your first touch, work your finishing, then work your head. Football is a mind game, kid.', 'Learn one small thing a day. In five years nobody will recognise you.', 'Listen to criticism but don\'t absorb it; hear praise but don\'t live on it.']),
    injury: b(['Sakatlık seni durdurmaz, düşündürür. Bu süreyi izleyerek, okuyarak, dinleyerek geçir. Ben dizim yüzünden en çok o zaman öğrendim.'], ['An injury doesn\'t stop you, it makes you think. Use the time to watch, read, listen. I learned the most during my knee trouble.']),
    form: b(['Son maç {lastMatch}. Güzel. Ama bir gol seni yarım yapar, bir hata da yıkmaz. Dengeyi bul.', '{goals} gol, fena değil. Asıl göstergen koşu mesafen, bunu unutma.'], ['Last game {lastMatch}. Nice. But one goal doesn\'t make you, one error doesn\'t break you. Find the balance.', '{goals} goals, not bad. The real indicator is your running distance, don\'t forget.']),
    rival: b(['{rival} seni iyi yapan şeylerden biri. Rakibin yoksa gelişmezsin. Ona kin tutma, ondan öğren.'], ['{rival} is one of the things that makes you better. Without a rival you don\'t grow. Don\'t hold grudges; learn from him.']),
    trash: b(['Bağırma, evlat. Öfke seni sahada yer, burada beni değil.'], ['Don\'t shout, kid. Anger eats you on the pitch, not me here.']),
    love: b(['Gönül işleri futbola benzer: sabır ister. Seni mutlu ediyorsa iyi, yormasın yeter.'], ['Matters of the heart are like football: they take patience. If it makes you happy, good; just don\'t let it drain you.']),
    family: b(['Aileni ihmal etme. Ben kendiminkini ihmal ettim, bugün pişmanım.'], ['Don\'t neglect your family. I neglected mine and I regret it today.']),
    other: b(['Hım. Otur, anlat. Acele yok.', 'Her sorunun cevabı bende yok evlat, ama birlikte düşünebiliriz.'], ['Hmm. Sit, tell me. No rush.', 'I don\'t have every answer, kid, but we can think together.']),
  },
  partner: {
    greeting: b(['Merhaba canım! Günün nasıl geçti?', 'Selam aşkım, seni düşünüyordum tam.'], ['Hi darling! How was your day?', 'Hey love, I was just thinking about you.']),
    goodbye: b(['Kendine dikkat et. Seni seviyorum ❤️', 'Akşam görüşürüz, yemeği ben yaparım.'], ['Take care of yourself. I love you ❤️', 'See you tonight, I\'ll cook.']),
    thanks: b(['Ne demek, sen benim için her şeyi yaparsın zaten.', 'Seninle olmak teşekkür edilecek bir şey değil, bir şans.'], ['Don\'t mention it, you\'d do anything for me too.', 'Being with you isn\'t something to thank, it\'s a gift.']),
    transfer: b(['Başka bir şehre taşınmak mı? Korkutucu ama seninle her yer güzel. Yeter ki bu seni mutlu etsin.', 'Gitsen de kalsan da yanındayım. Yalnız beni de fikrine kat, olur mu?'], ['Move to another city? Scary, but anywhere is beautiful with you. As long as it makes you happy.', 'Whether you go or stay I\'m with you. Just include me in your thinking, okay?']),
    wage: b(['Para mı? Beni ilgilendirmiyor ama sana yük olmasın. Önemli olan huzur.'], ['Money? That\'s not what I care about; just don\'t let it weigh on you. Peace is what matters.']),
    playtime: b(['Oynamasan bile ben senin en büyük taraftarınım. Kafayı kaldır, fırsat gelecek.'], ['Even when you don\'t play I\'m your biggest fan. Chin up, the chance will come.']),
    advice: b(['Kendi içindeki sese güven. Herkes bir şey söyler ama sen kendini en iyi tanıyorsun.'], ['Trust the voice inside you. Everyone has something to say but you know yourself best.']),
    injury: b(['Çok üzüldüm canım. Bu süreçte yanındayım; moral lazım, ben buradayım. Her gün seni ziyaret edeceğim.', 'Sakin ol, her sakatlık geçer. Önce kendini toparla, gerisi önemli değil.'], ['I\'m so sorry, love. I\'m with you through this; you need morale, I\'m here. I\'ll visit every day.', 'Stay calm, every injury passes. Get yourself together first, nothing else matters.']),
    love: b(['Ben de seni seviyorum. Bu hayat çok hızlı akıyor ama seninle yavaşlıyor. ❤️', 'Beni çok mutlu ediyorsun. Bir de bu akşam seni görebilsem...'], ['I love you too. This life moves so fast but it slows down with you. ❤️', 'You make me so happy. If only I could see you tonight...']),
    family: b(['Ailen çok değerli. Bu hafta sonu birlikte ziyaret edelim mi?'], ['Your family is precious. Shall we visit them together this weekend?']),
    form: b(['Son maçı izledim: {lastMatch}. Ne olursa olsun benim kahramanımsın.', '{goals} gol atmışsın, daha ne olsun! Gurur duyuyorum.'], ['I watched the last game: {lastMatch}. Whatever happens, you\'re my hero.', '{goals} goals, what more do you want! I\'m proud of you.']),
    trash: b(['Bana böyle konuşma lütfen. Zor bir gün geçirmiş olabilirsin ama ben düşmanın değilim.'], ['Please don\'t talk to me like that. You may have had a hard day but I\'m not your enemy.']),
    rival: b(['{rival} mı? Onunla uğraşma, sen kendi yolundasın. Ben sana inanıyorum.'], ['{rival}? Don\'t bother with him, you\'re on your own road. I believe in you.']),
    other: b(['Hmm, anlat bakalım ne düşünüyorsun.', 'Seni dinliyorum canım, biraz daha anlat.'], ['Hmm, tell me what\'s on your mind.', 'I\'m listening, love, say a little more.']),
  },
  family: {
    greeting: b(['Hoş geldin yavrum! Yemek hazır, yemeden gitmek yok.', 'Merhaba yavrum, nasılsın? Çok özledik seni.'], ['Welcome home! Dinner\'s ready and you\'re not leaving without eating.', 'Hello, sweetheart, how are you? We miss you so much.']),
    goodbye: b(['Kendine iyi bak, eksik olma. Seni seviyoruz.', 'Allah yolunu açık etsin. Aklımız hep sende.'], ['Look after yourself. We love you.', 'May the road open before you. You\'re always on our minds.']),
    thanks: b(['Ne teşekkürü, sen bizim her şeyimizsin.'], ['Don\'t thank us, you are everything to us.']),
    transfer: b(['Ne karar verirsen ver, biz arkandayız. Yeter ki sağlıklı ve mutlu ol.', 'Başka şehir mi? Biraz uzak ama yürüyüş seninle bitmez. Hem {hometown} her zaman burada.'], ['Whatever you decide, we\'re behind you. Just be healthy and happy.', 'Another city? A bit far but we walk with you. And {hometown} will always be here.']),
    wage: b(['Para güzel ama sakın şımarma. Bizi düşünme, kendini düşün.', 'Biraz biriktir yavrum. Futbolcu ömrü kısadır.'], ['Money is nice but don\'t get carried away. Don\'t worry about us, think of yourself.', 'Save a little, sweetheart. A footballer\'s life is short.']),
    playtime: b(['Oynamasan da sorun değil, çalışmaya devam et. Zamanı gelince oynarsın.'], ['It\'s fine if you don\'t play, keep working. Your time will come.']),
    advice: b(['Dürüst ol, alçakgönüllü ol, hep çalış. Ailemizin sözüdür: "Önce insan ol, sonra futbolcu."', 'Büyüklerini dinle, kimseyi kırma. Gerisi gelir.'], ['Be honest, be humble, keep working. As we always say in this family: "Be a person first, a footballer second."', 'Listen to your elders, hurt nobody. The rest follows.']),
    injury: b(['Aman Allahım, iyi misin?! Doktora gittin mi? Hemen ailece yanına geliyoruz.', 'Çok korktum yavrum. Dinlen, sıcak çorba içir kendine.'], ['Oh my goodness, are you OK?! Did you see the doctor? We\'re coming to you right now.', 'You scared me, sweetheart. Rest, and have some hot soup.']),
    love: b(['Güzel yavrum, birini sevmek güzel şey. Ama ayakların yerde olsun.'], ['That\'s lovely, sweetheart. Loving someone is a good thing. Just keep your feet on the ground.']),
    family: b(['Hepimiz iyiyiz, merak etme. Anneannen de seni soruyor. Yazın gelirsin değil mi?'], ['We\'re all fine, don\'t worry. Your gran asks about you too. You\'ll come in summer, won\'t you?']),
    form: b(['Maçı televizyondan izledik! {lastMatch}. Komşular bayram etti.', 'Sen sahada koştukça yürek hop hop atıyor. {goals} gol atmışsın, gurur duyuyoruz.'], ['We watched the game on TV! {lastMatch}. The neighbours celebrated.', 'Every time you run my heart skips. {goals} goals — we\'re so proud.']),
    trash: b(['Bu ne üslup yavrum? Seni böyle yetiştirmedik.'], ['What kind of tone is that? We didn\'t raise you like this.']),
    rival: b(['{rival} dediğin çocuk da bir anne babanın evladı. Rekabet iyi ama kötü söz olmasın.'], ['That {rival} boy is someone\'s son too. Competition is fine, but no bad words.']),
    other: b(['Yavrum, sesin üzgün geliyor. Anlat bakalım, anne/baba dinler.', 'Tamam, tamam, sakin ol. Biz her zaman buradayız.'], ['You sound sad. Tell us, we\'re listening.', 'OK, OK, calm down. We\'re always here.']),
  },
  rival: {
    greeting: b(['Ooo, {first}! Neyin var, benim iyiliğimi mi merak ettin?', 'Selam. Yine mi sen?'], ['Oh, {first}! What\'s up, checking on my health?', 'Hi. You again?']),
    goodbye: b(['Görüşürüz. Sahada.', 'Hadi bakalım. Bir sonraki karşılaşmaya kadar.'], ['See you. On the pitch.', 'Off you go. Until the next meeting.']),
    thanks: b(['Teşekkür mü? Şüpheli. Ne istiyorsun?'], ['Thanks? Suspicious. What do you want?']),
    transfer: b(['Büyük kulüp mü? Gelirsem önce sen oradan gidersin. Şaka şaka... belki.', 'Ben bu yaz şehir değiştiririm, sen de bir yol bul bakalım.'], ['A big club? If I come, you leave first. Joking... maybe.', 'I\'ll change city this summer; you find a way too.']),
    form: b(['Ben {goals} gol attım bu sezon; sen kaç? Sayıları karşılaştırınca konuşalım.', 'Maç sonuçlarını izledim, güzel. Ama ben daha iyi oynuyorum, kabul et.'], ['I\'ve scored {goals} this season; how many have you? Let\'s talk when we compare numbers.', 'I saw your results, nice. But I\'m playing better, admit it.']),
    trash: b(['Ha ha, güzel konuşuyorsun. Sahada cevap vereceğim. Bak bakalım, bir sonraki maçta.', 'Boş laf ucuz, {first}. Sahada buluşalım.', 'İşte bunu bekliyordum. Hadi, sahaya!'], ['Ha ha, nice words. I\'ll answer on the pitch. Watch the next game.', 'Cheap talk is cheap, {first}. Meet me on the pitch.', 'That\'s what I was waiting for. Come on, let\'s play!']),
    rival: b(['Rekabet dediğin böyle olur: sen beni, ben seni izliyoruz. Kimse bırakmıyor.'], ['That\'s what rivalry is: you watch me, I watch you. Nobody lets go.']),
    advice: b(['Tavsiye mi? Düşmanından tavsiye mi alıyorsun? Pekâlâ: daha çok çalış. Ama beni yenmeyi başaramayacaksın.'], ['Advice? From your enemy? Fine: work harder. You still won\'t beat me.']),
    injury: b(['Duydum sakatlandığını. Geçmiş olsun, ama bu fırsatı bana verirsen kullanırım. 😉'], ['I heard you\'re injured. Get well soon — but I\'ll use the chance if you give it to me. 😉']),
    other: b(['Konuşmak istiyorsan sahada konuşalım.', 'Hmm... bunu ciddiye almadım. Haydi, bir sonraki maça!'], ['If you want to talk, let\'s do it on the pitch.', 'Hmm... I didn\'t take that seriously. On to the next game!']),
  },
};

const COLD: Partial<Record<PersonaKind, Bank>> = {
  agent: b(['Açık konuşayım, bu aralar aramızda mesafe var. ', 'Biraz uzaklaştık, farkındayım. '], ['Let me be honest, there\'s been distance between us lately. ', 'We\'ve drifted a bit, I know. ']),
  manager: b(['Aramız pek iyi değil, bunu ikimiz de biliyoruz. ', 'Kısa tutalım. '], ['Things aren\'t great between us and we both know it. ', 'Let\'s keep it short. ']),
  partner: b(['Biraz kırgınım, söylemeden olmaz. ', 'Bu aralar bana yeterince zaman ayırmıyorsun. '], ['I\'m a bit hurt, I have to say it. ', 'You haven\'t made much time for me lately. ']),
  family: b(['Bizi pek aramıyorsun yavrum... ', 'Annen hâlâ telefon başında seni bekliyor. '], ['You hardly call us, sweetheart... ', 'Your mum is still waiting by the phone. ']),
};

const REL_KEY: Partial<Record<PersonaKind, string>> = { agent: 'agent', manager: 'manager', partner: 'partner', family: 'family' };

const FALLBACK_INTENT: Partial<Record<Intent, Intent>> = { goodbye: 'goodbye', greeting: 'greeting' };

export function chatReply(ctx: NarrativeContext, persona: PersonaKind, personaName: string, history: ChatMessage[], message: string): string {
  const lang = langOf(ctx);
  const intentRaw = detectIntent(message, ctx);
  const banks = BANKS[persona] ?? BANKS.agent;
  const intent: Intent = banks[intentRaw] ? intentRaw : FALLBACK_INTENT[intentRaw] && banks[FALLBACK_INTENT[intentRaw]!] ? FALLBACK_INTENT[intentRaw]! : 'other';
  const bank = banks[intent] ?? banks.other!;
  const lastMatch = ctx.recentResults[ctx.recentResults.length - 1] ?? (lang === 'tr' ? 'henüz maç yok' : 'no games yet');
  const slots: Slots = {
    ...ctxSlots(ctx),
    name: personaName,
    lastMatch,
    wage: formatMoney(ctx.player.wage, lang),
    leaguePos: ctx.club?.leaguePos ?? '',
    age: ctx.player.age,
  };
  const prevPersona = new Set(history.filter((m) => m.from === 'persona').map((m) => m.text.trim()));
  let text = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const rng = rngFrom('chat', ctx.season, ctx.week, persona, intent, message.slice(0, 60), history.length, attempt);
    let cand = cap(fill(pickFilled(bank[lang], slots, rng), slots, rng, lang), lang);
    // a cold relationship colours the opening
    const relKey = REL_KEY[persona];
    const rel = relKey ? ctx.relationships[relKey] : undefined;
    const cold = COLD[persona];
    if (cold && rel !== undefined && rel < 35 && intent !== 'goodbye' && rng.chance(0.6)) {
      cand = `${fill(pickFilled(cold[lang], slots, rng), slots, rng, lang)} ${cand}`;
    }
    text = cand;
    if (!prevPersona.has(text.trim())) break;
  }
  return text;
}
