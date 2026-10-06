/**
 * Genesis: a unique origin story per career — backstory, motto, dream, theme, a cryptic
 * destiny hint, a family with personalities, an agent, the rival and the mentor.
 * Driven by `seedFlavor` (one of GENESIS_FLAVORS) + nation + position + traits.
 */
import type { Lang, TraitId } from '../core/types';
import type { GenesisInput, Narrator } from '../core/narrative-types';
import type { Rng } from '../core/rng';
import { fill, paragraph, rngFrom, say, type Bank, type Slots } from './grammar';
import { cultureOf, firstName, fullPersonName, lastName, type Culture, type Gender } from './names';

export const GENESIS_FLAVORS = [
  'prodigy', 'redemption', 'outsider', 'family_legacy', 'late_bloomer',
  'street', 'refugee', 'small_town', 'second_chance', 'rich_kid',
] as const;
export type GenesisFlavor = (typeof GENESIS_FLAVORS)[number];

const ALIASES: Record<string, GenesisFlavor> = {
  legacy: 'family_legacy', family: 'family_legacy', 'family legacy': 'family_legacy',
  street_footballer: 'street', 'street footballer': 'street', streets: 'street',
  refugee_made_good: 'refugee', 'refugee-made-good': 'refugee',
  'small-town': 'small_town', 'small town': 'small_town', small_town_hero: 'small_town', 'small-town hero': 'small_town', hometown: 'small_town',
  'second-chance': 'second_chance', 'second chance': 'second_chance', comeback: 'second_chance',
  rich: 'rich_kid', 'rich kid': 'rich_kid', privileged: 'rich_kid',
  'late bloomer': 'late_bloomer', 'late-bloomer': 'late_bloomer',
  wonderkid: 'prodigy', underdog: 'outsider',
};

export function normalizeFlavor(seed: string, rng: Rng): GenesisFlavor {
  const k = (seed ?? '').trim().toLowerCase();
  if ((GENESIS_FLAVORS as readonly string[]).includes(k)) return k as GenesisFlavor;
  const alias = ALIASES[k] ?? ALIASES[k.replace(/_/g, ' ')];
  return alias ?? rng.pick(GENESIS_FLAVORS);
}

interface FlavorText { origin: Bank; turning: Bank; theme: Bank; dream: Bank; motto: Bank }

const FLAVORS: Record<GenesisFlavor, FlavorText> = {
  prodigy: {
    origin: {
      tr: [
        '{hometown:gen} [toprak sahalarında|halı sahalarında] {first} daha yedi yaşındayken kendinden beş yaş büyüklerle oynuyor, üstelik onları utandırıyordu.',
        '{hometown} her zaman bir futbol şehriydi ama bir süredir herkes aynı ismi konuşuyordu: dokuz yaşında yaş grubunun gol rekorunu kıran {first}.',
      ],
      en: [
        'On the [dusty|floodlit five-a-side] pitches of {hometown}, {first} was already embarrassing boys five years older at the age of seven.',
        'Everyone in {hometown} knew the name before the kid could tie his own boots: {first}, who broke the age-group scoring record at nine.',
      ],
    },
    turning: {
      tr: [
        'On üç yaşındayken bir izci maçtan sonra {father:dat} yaklaşıp "Bu çocuğu kimseye kaptırmayın" dedi; o günden beri telefon hiç susmadı.',
        'Bir yaz turnuvasında tribün Avrupa\'nın izcileriyle doluydu; {first} dört maçta yedi gol attı ve herkesin not defterine adını yazdırdı.',
      ],
      en: [
        'At thirteen a scout cornered {father} after a game and said, "Don\'t let anyone take this kid from you." The phone hasn\'t stopped ringing since.',
        'At a summer tournament with half of Europe\'s scouts in the stand, {first} scored seven in four games and ended up in every notebook.',
      ],
    },
    theme: {
      tr: ['Herkesin "geleceğin yıldızı" dediği çocuk: şimdi o beklentiyi omuzlama zamanı.', 'Harika çocuk efsanesi: erken parlayan yıldız sönmeyecek mi?'],
      en: ['The kid everyone called "the future" — now he has to carry it.', 'The wonderkid myth: will the early star keep burning?'],
    },
    dream: {
      tr: ['Henüz yirmisine basmadan Altın Top sahnesine çıkmak.', 'Hakkındaki bütün övgülerin az kaldığını kanıtlamak.'],
      en: ['To walk onto the Golden Ball stage before he turns twenty.', 'To prove that all the hype was an understatement.'],
    },
    motto: { tr: ['Beklenti bir yük değil, bir yakıttır.', 'Yetenek kapıyı açar, emek içeri sokar.'], en: ['Expectation is fuel, not weight.', 'Talent opens the door; work walks you through it.'] },
  },
  redemption: {
    origin: {
      tr: [
        '{first} bir zamanlar {hometown:gen} en çok konuşulan genç yeteneğiydi; sonra akademiden disiplinsizlik gerekçesiyle kapı dışarı edildi.',
        'On beş yaşında {first:gen} adı bir soyunma odası kavgasıyla yerel gazetelere düştü ve altyapıdaki yeri bir gecede kayboldu.',
      ],
      en: [
        '{first} was once the most talked-about kid in {hometown} — until his academy showed him the door for indiscipline.',
        'At fifteen, {first} made the local papers for a dressing-room brawl, and his academy place vanished overnight.',
      ],
    },
    turning: {
      tr: [
        'İki yıl boyunca {father:ins} birlikte sabahın beşinde pazarda kasa taşıdı, akşamları da tek başına duvara şut çekti. Sessizce, inatla.',
        'Herkes vazgeçmişken {mother} vazgeçmedi: "Hata yaptın, bitti mi? Kalk ve göster." {first} kalktı.',
      ],
      en: [
        'For two years he hauled crates at the market with {father} at five every morning and spent his evenings hammering shots against a wall. Quietly. Stubbornly.',
        'Everyone gave up on him except {mother}: "You made a mistake. Is that the end? Get up and show them." He got up.',
      ],
    },
    theme: {
      tr: ['Bir kefaret hikâyesi: düştüğü yerden kalkan bir {pos}.', 'İkinci perde: herkesin silip attığı çocuk geri dönüyor.'],
      en: ['A redemption story: a {pos} picking himself up off the floor.', 'Act two: the kid everyone wrote off is coming back.'],
    },
    dream: {
      tr: ['Onu kapı dışarı eden akademinin kulübüne karşı, o tribünlerin önünde gol atmak.', 'Bir gün aynı soyunma odasına kaptan olarak girmek.'],
      en: ['To score against the club whose academy threw him out, in front of those very stands.', 'To walk back into that same dressing room one day — as captain.'],
    },
    motto: { tr: ['Düşmek serbest, yerde kalmak yasak.', 'Geçmişimi değiştiremem, yarınımı yazarım.'], en: ['Falling is allowed. Staying down isn\'t.', 'I can\'t change yesterday, but I write tomorrow.'] },
  },
  outsider: {
    origin: {
      tr: [
        '{first} hiçbir akademiden geçmedi; {hometown:gen} kenar mahallelerinde, kale direği yerine iki taşın konduğu sahalarda büyüdü.',
        'İzcilerin haritasında {hometown:gen} o semti yoktu. {first} de yoktu — ta ki biri onu bir amatör lig maçında fark edene kadar.',
      ],
      en: [
        '{first} never went through an academy; he grew up on the edges of {hometown}, where two stones made a goal.',
        'That part of {hometown} wasn\'t on any scout\'s map. Neither was {first} — until someone spotted him in an amateur league game.',
      ],
    },
    turning: {
      tr: [
        'Amatör takımında bir sezonda 41 gol attı; videoları internette dolaşmaya başlayınca kulüpler, adını yeni öğrendikleri bu çocuğu aramaya başladı.',
        'Bir seçmeye davetsiz gitti, kenarda bekledi ve son on dakikada oyuna alındı. İki gol, bir asist. Kimse ona bir daha "Sen kimsin?" diye sormadı.',
      ],
      en: [
        'He scored 41 in one amateur season; when the clips went round online, clubs started calling a kid whose name they\'d only just learned.',
        'He turned up uninvited to an open trial, waited on the touchline and got the last ten minutes. Two goals, one assist. Nobody asked who he was again.',
      ],
    },
    theme: {
      tr: ['Sistemin dışından gelen çocuk: kapıyı açmazlarsa kıracak.', 'Kimsenin listesinde olmayan isim, herkesin manşetine yürüyor.'],
      en: ['The outsider: no invitation, so he\'ll kick the door in.', 'The name on nobody\'s list, marching onto every front page.'],
    },
    dream: {
      tr: ['Onu görmezden gelen bütün kulüplerin önünde, büyük bir finalde oynamak.', 'Mahalledeki taş kaleleri gerçek kalelerle değiştirmek.'],
      en: ['To play in a great final in front of every club that ignored him.', 'To replace the stone goalposts back home with real ones.'],
    },
    motto: { tr: ['Kimse kapıyı açmazsa duvarı yık.', 'Konuşma, göster.'], en: ['If nobody opens the door, go through the wall.', 'Don\'t tell them. Show them.'] },
  },
  family_legacy: {
    origin: {
      tr: [
        '{father} bir zamanlar {hometown:gen} sevilen bir oyuncusuydu; dizi koptuğunda henüz yirmi dört yaşındaydı. {first} o yarım kalan kariyerin gölgesinde büyüdü.',
        '{last} soyadı {hometown:dat} yabancı değil: dedesi de babası da bu şehrin formasını giydi. Şimdi sıra {first:dat} geldi.',
      ],
      en: [
        '{father} was once a fan favourite in {hometown}; his knee gave way when he was just twenty-four. {first} grew up in the shadow of that unfinished career.',
        'The {last} name means something in {hometown}: grandfather and father both wore the city\'s shirt. Now it\'s {first:gen} turn.',
      ],
    },
    turning: {
      tr: [
        'Babasının eski kramponlarını hâlâ dolabında saklıyor. {father} hiçbir zaman "Benim yarım kalanımı sen tamamla" demedi — ama {first} bunu her antrenmanda duyuyor.',
        'Babasının eski takım arkadaşları onu görünce hep aynı şeyi söylüyor: "Babanın vuruşu, ama daha hızlı." {first} bu benzetmeyi aşmak istiyor.',
      ],
      en: [
        'He still keeps his father\'s old boots in his wardrobe. {father} never once said "finish what I started" — but {first} hears it at every session.',
        'His dad\'s old teammates always say the same thing: "Your father\'s touch, only quicker." {first} wants to outgrow the comparison.',
      ],
    },
    theme: {
      tr: ['Soyadının ağırlığı: babanın yarım kalan hikâyesini tamamlamak.', 'Bir aile destanının üçüncü kuşağı: bu kez sonu mutlu mu bitecek?'],
      en: ['The weight of a surname: finishing his father\'s unfinished story.', 'The third generation of a family saga — will this one get a happy ending?'],
    },
    dream: {
      tr: ['Babasının hiç çıkamadığı o büyük finale çıkmak ve madalyayı onun boynuna takmak.', 'Soyadını, babasının değil kendi golleriyle anılır hâle getirmek.'],
      en: ['To reach the big final his father never got to play, and hang the medal round his neck.', 'To make the family name famous for his own goals, not his father\'s.'],
    },
    motto: { tr: ['Soyadım bir miras, adım bir söz.', 'Babamın bıraktığı yerden, daha ileriye.'], en: ['My surname is a legacy; my name is a promise.', 'From where Dad stopped — and further.'] },
  },
  late_bloomer: {
    origin: {
      tr: [
        '{first} on beş yaşına kadar takımın en kısa, en yavaş oyuncusuydu; maçların çoğunu yedek kulübesinde, iki beden büyük montunun içinde izledi.',
        'Altyapı hocaları {first} için hep aynı notu düştü: "Zeki ama fiziği yetersiz." Kimse beklemeye niyetli değildi.',
      ],
      en: [
        'Until fifteen, {first} was the shortest, slowest boy in the team, watching most games from the bench in a coat two sizes too big.',
        'Every academy report said the same about {first}: "Clever, but physically not there." Nobody was willing to wait.',
      ],
    },
    turning: {
      tr: [
        'Sonra bir yazda on iki santim uzadı. Eylülde sahaya çıkan çocuğu kimse tanıyamadı: oyunu okuyuşu aynıydı, sadece artık herkesten hızlıydı.',
        '{mother} onu her sabah "Senin vaktin gelecek" diyerek uğurladı. Vakit geldi: on altısında takımın en skorer oyuncusu oldu.',
      ],
      en: [
        'Then one summer he grew twelve centimetres. The boy who walked out in September was unrecognisable — same brain for the game, only now he was quicker than everyone.',
        '{mother} sent him off every morning with "Your time will come." It came: at sixteen he was the team\'s top scorer.',
      ],
    },
    theme: {
      tr: ['Geç açan çiçek: hakkında yazılan bütün raporları tek tek sildirecek.', 'Sabrın ödülü: kulübede büyüyen çocuk sahneye çıkıyor.'],
      en: ['The late bloomer: here to make them rewrite every report.', 'Patience rewarded: the boy who grew up on the bench takes the stage.'],
    },
    dream: {
      tr: ['Ona "fiziği yetersiz" diyen hocanın takımına karşı hat-trick yapmak.', 'Otuzundan sonra bile her sezon bir öncekinden iyi olmak.'],
      en: ['To score a hat-trick against the coach who called him "physically not there".', 'To keep getting better every single season, even past thirty.'],
    },
    motto: { tr: ['Sabır acıdır, meyvesi tatlıdır.', 'Geç olsun, güç olmasın.'], en: ['Patience is bitter, its fruit is sweet.', 'Late, but never too late.'] },
  },
  street: {
    origin: {
      tr: [
        '{first:gen} ilk sahası {hometown:gen} dar bir sokağıydı: kale bir garaj kapısı, hakem de pencereden bağıran komşu teyzeydi.',
        'Mahallede maç, sokak lambaları yanana kadar sürerdi; {first} her akşam eve en son giren çocuktu.',
      ],
      en: [
        '{first:gen} first pitch was a narrow street in {hometown}: the goal was a garage door and the referee was the neighbour yelling from her window.',
        'Street games ran until the lamps came on, and {first} was always the last kid to go home.',
      ],
    },
    turning: {
      tr: [
        'Asfaltta öğrendiği çalımlar halı sahalarda efsaneye dönüştü; bir gün semtin amatör kulübünün hocası {coach} maçın ortasında sahaya girip onu kolundan tuttu: "Yarın antrenmana geliyorsun."',
        'Ayakkabıları yırtılana kadar oynadı. Bir akşam {coach} adında bir amatör takım hocası sokak maçını yarıda kesip ona bir forma uzattı.',
      ],
      en: [
        'The tricks he learned on asphalt became legend on the five-a-side courts, until a local amateur coach, {coach}, walked on mid-game, took his arm and said: "Training. Tomorrow."',
        'He played until his trainers fell apart. Then one evening an amateur coach called {coach} stopped a street game and handed him a shirt.',
      ],
    },
    theme: {
      tr: ['Sokaktan stadyuma: asfaltın çocuğu çimlerde.', 'Mahallenin çalım ustası büyük sahnede: kuralları sokak yazar.'],
      en: ['From the street to the stadium: a kid of the asphalt on real grass.', 'The neighbourhood trickster on the big stage — street rules apply.'],
    },
    dream: {
      tr: ['Mahallede, adını taşıyan ışıklı bir halı saha yaptırmak.', 'Seksen bin kişinin önünde, sokakta öğrendiği o çalımı atmak.'],
      en: ['To build a floodlit pitch with his name on it, back in the old neighbourhood.', 'To pull off the trick he learned on the street in front of eighty thousand.'],
    },
    motto: { tr: ['Mahalle unutulmaz.', 'Sokak öğretti, saha gösterecek.'], en: ['Never forget the street.', 'The street taught me; the pitch will show you.'] },
  },
  refugee: {
    origin: {
      tr: [
        '{first} altı yaşındayken ailesi, savaşın yıktığı bir şehirden {hometown:dat} iki bavul ve bir topla geldi.',
        'Ailesi {hometown:dat} hiçbir şeyi olmadan geldi; dili bilmediği o ilk aylarda {first:gen} tek tercümanı ayağındaki toptu.',
      ],
      en: [
        '{first} was six when his family reached {hometown} from a city torn apart by war, carrying two suitcases and a football.',
        'His family arrived in {hometown} with nothing; in those first months, before he spoke the language, the ball was {first:gen} only translator.',
      ],
    },
    turning: {
      tr: [
        '{father} eskiden öğretmendi; burada gece vardiyasında çalıştı. {first} her golünü o yorgun yüzü güldürmek için attı.',
        'Okul takımının hocası onu bir turnuvaya yazdırabilmek için haftalarca evrak peşinde koştu. {first} o turnuvada gol kralı oldu ve kimse ona bir daha "yabancı çocuk" demedi.',
      ],
      en: [
        'Back home {father} was a teacher; here he worked night shifts, and {first} scored every goal to make that tired face smile.',
        'His school coach spent weeks chasing paperwork just to register him for a tournament. {first} finished top scorer, and nobody called him "the foreign kid" again.',
      ],
    },
    theme: {
      tr: ['Hiçbir şeyi olmadan gelenlerin hikâyesi: her gol bir teşekkür.', 'Yeni bir vatan, yeni bir forma, aynı inat.'],
      en: ['A story of arriving with nothing: every goal a thank-you.', 'A new home, a new shirt, the same defiance.'],
    },
    dream: {
      tr: ['{nation} formasıyla sahaya çıkıp marşı tribündeki ailesiyle birlikte söylemek.', 'Ailesine, geride bıraktıkları evden daha güzel bir ev almak.'],
      en: ['To walk out in a {nation} shirt and sing the anthem with his family in the stand.', 'To buy his family a home even finer than the one they left behind.'],
    },
    motto: { tr: ['Nereden geldiğini unutma, nereye gittiğini bil.', 'Kaybedecek bir şeyi olmayan, her şeyi kazanabilir.'], en: ['Remember where you came from; know where you\'re going.', 'Those with nothing to lose can win everything.'] },
  },
  small_town: {
    origin: {
      tr: [
        '{first}, {hometown:dat} bağlı, tek fırını ve tek futbol sahası olan küçük bir kasabada büyüdü; kasabanın tamamı onun maçlarına gelirdi.',
        '{first:gen} kasabasında ne sinema vardı ne AVM; bir çamurlu saha ve bir hayal vardı.',
      ],
      en: [
        '{first} grew up in a small town outside {hometown}, with one bakery, one pitch, and the whole town at every one of his games.',
        'There was no cinema in {first:gen} town, no shopping centre — just a muddy pitch and a dream.',
      ],
    },
    turning: {
      tr: [
        'Kasaba halkı aralarında para toplayıp onu büyük şehirdeki seçmelere gönderdi. Otobüse binerken {mother} cebine bir not sıkıştırdı: "Sakın kupasız dönme."',
        '{father} yedi yıl boyunca, fırını açmadan önce onu her sabah kırk dakikalık yoldan antrenmana bıraktı. Şimdi kasabada herkes aynı şeyi soruyor: "Bizim çocuk ne zaman televizyona çıkacak?"',
      ],
      en: [
        'The townspeople passed the hat to send him to trials in the big city. As he got on the bus, {mother} slipped a note into his pocket: "Don\'t you dare come back without a trophy."',
        'For seven years {father} drove him forty minutes to training every morning before opening the bakery. Now the whole town asks the same question: "When\'s our boy on telly?"',
      ],
    },
    theme: {
      tr: ['Kasabanın umudu: bütün bir kasaba onun omuzlarında.', 'Küçük yerin büyük çocuğu.'],
      en: ['Small-town hero: an entire town riding on his shoulders.', 'Big dreams from a very small place.'],
    },
    dream: {
      tr: ['Bir kupayla kasabaya dönmek ve meydanda herkesle birlikte kaldırmak.', 'Kasabanın çamurlu sahasına gerçek çim döşetmek.'],
      en: ['To bring a trophy home and lift it in the town square with everyone.', 'To give the town\'s muddy pitch real grass.'],
    },
    motto: { tr: ['Damlaya damlaya göl olur.', 'Küçük yerden gelenin hayali büyük olur.'], en: ['Drop by drop, the lake fills.', 'The smaller the town, the bigger the dream.'] },
  },
  second_chance: {
    origin: {
      tr: [
        'On beş yaşında ağır bir diz sakatlığı geçirdi; doktorlar {first:dat} profesyonel futbolu unutmasını söyledi.',
        'Bir akademiden "yeterince iyi değil" notuyla gönderildikten sonra {first} bir yıl boyunca topa dokunmadı; onu yeniden sahaya {sibling} sürükledi.',
      ],
      en: [
        'At fifteen a serious knee injury had doctors telling {first} to forget about professional football.',
        'Released by an academy as "not good enough", {first} didn\'t touch a ball for a year — until {sibling} dragged him back onto the pitch.',
      ],
    },
    turning: {
      tr: [
        'On sekiz ay süren rehabilitasyonda her gün aynı merdivenleri çıktı. Dönüşündeki ilk antrenman golünü kimse alkışlamadı; çünkü herkes ağlıyordu.',
        'Mahalle takımında hiçbir şey beklemeden yeniden başladı. Ama oyunu artık başka türlü seviyordu — onu kaybetmenin ne demek olduğunu bilen biri gibi.',
      ],
      en: [
        'Eighteen months of rehab, the same flight of stairs every single day. Nobody applauded his first goal back in training — they were too busy crying.',
        'He started over at a local side, expecting nothing. But he loved the game differently now — like someone who knows what losing it feels like.',
      ],
    },
    theme: {
      tr: ['İkinci şans: elinden alınan rüyayı geri almaya geldi.', 'Bir kez kaybettiğin şeye daha sıkı sarılırsın.'],
      en: ['Second chance: back to reclaim a dream that was taken from him.', 'You hold on tighter to what you\'ve lost once.'],
    },
    dream: {
      tr: ['Onu ameliyat eden doktoru, ilk büyük maçında VIP tribünde ağırlamak.', 'Kariyerinin her dakikasını, bir daha alınmayacakmış gibi değil, alınabilirmiş gibi yaşamak.'],
      en: ['To host the surgeon who rebuilt his knee in the VIP box at his first big game.', 'To play every minute as if it could be taken away — because it can.'],
    },
    motto: { tr: ['Her maç bir hediye.', 'Bir kez düştüm, bir daha düşmekten korkmuyorum.'], en: ['Every match is a gift.', 'I\'ve fallen once. I\'m not afraid of falling again.'] },
  },
  rich_kid: {
    origin: {
      tr: [
        '{first}, {hometown:gen} en varlıklı ailelerinden birinin oğlu: özel okul, yazlık, binicilik dersleri... ama o hep okulun arka bahçesinde top oynayan çocuktu.',
        '{father} bir gün {first:gen} aile şirketinin başına geçmesini istiyordu. {first} ise toplantı ajandası yerine halı saha rezervasyonlarıyla meşguldü.',
      ],
      en: [
        '{first} is the son of one of the wealthiest families in {hometown}: private school, a summer house, riding lessons... and yet always the kid kicking a ball behind the school.',
        '{father} wanted {first} to take over the family firm one day. {first} was busy booking five-a-side pitches instead of meetings.',
      ],
    },
    turning: {
      tr: [
        'Herkes onu "babasının parasıyla oynayan çocuk" olarak gördü. O da seçmelere hiçbir zaman şoförlü arabayla değil, belediye otobüsüyle gitti ve sözü ayaklarına bıraktı.',
        'On altısında babasıyla bir anlaşma yaptı: "Bana bir yıl ver. Profesyonel olamazsam takım elbiseyi giyerim." Saat işliyor.',
      ],
      en: [
        'Everyone saw him as "the rich kid playing with daddy\'s money". So he always took the city bus to trials, never his father\'s driver, and let his feet do the talking.',
        'At sixteen he struck a deal with his father: "Give me one year. If I don\'t turn pro, I\'ll wear the suit." The clock is ticking.',
      ],
    },
    theme: {
      tr: ['Zengin çocuğun inadı: parayla alınamayan tek şeyin peşinde.', 'Gümüş kaşıkla doğdu, altın madalya için ter dökecek.'],
      en: ['The rich kid\'s obsession: chasing the one thing money can\'t buy.', 'Born with a silver spoon, sweating for gold.'],
    },
    dream: {
      tr: ['Babasına, takım elbisenin yerini bir kupanın da alabileceğini göstermek.', 'Kimsenin "parayla oynuyor" diyemeyeceği bir kariyer kurmak.'],
      en: ['To show his father that a trophy can take the place of a suit.', 'To build a career nobody could ever say was bought.'],
    },
    motto: { tr: ['Parayla ter satın alınmaz.', 'Soyadım değil, sahadaki adım konuşsun.'], en: ['Money can\'t buy sweat.', 'Judge my game, not my surname.'] },
  },
};

const SIGNATURE: Record<string, Bank> = {
  ST: {
    tr: ['Ceza sahasında doğmuş gibi; kaleyi görmeden önce hissediyor.', 'Antrenmanlarda son top hep ona gidiyor, çünkü o topu kaçırmıyor.'],
    en: ['He seems born in the box — he feels the goal before he sees it.', 'In training the last ball always goes to him, because he doesn\'t miss.'],
  },
  W: {
    tr: ['Kanatta topu aldığında tribünden bir uğultu yükseliyor: hız, çalım, sonra yine hız.', 'Çizgiye inip içeri kat ettiği an, savunmacılar ne yapacaklarını bilemiyor.'],
    en: ['When he picks it up on the wing a murmur rises from the crowd: pace, a feint, then more pace.', 'The moment he hits the byline and cuts inside, defenders simply don\'t know what to do.'],
  },
  AM: {
    tr: ['Topu almadan önce üç pas sonrasını görüyor; mahallede ona "Profesör" derlerdi.', 'Ara pasları cetvelle çizilmiş gibi; forvetler onunla oynamaya bayılıyor.'],
    en: ['He sees three passes ahead before the ball even arrives; back home they called him "the Professor".', 'His through balls look ruler-drawn; strikers love playing with him.'],
  },
  CM: {
    tr: ['Oyunun ritmini ayağıyla ayarlıyor; ne zaman yavaşlatacağını, ne zaman hızlandıracağını biliyor.', 'Hem top kapıyor hem oyun kuruyor; hocaları ona "iki kişilik oyuncu" diyor.'],
    en: ['He sets the tempo with his feet, knowing exactly when to slow it down and when to go.', 'He wins it and he builds it; his coaches call him "two players in one shirt".'],
  },
  CB: {
    tr: ['Hava toplarında kimseye geçit vermiyor; forvetler onunla eşleşmekten nefret ediyor.', 'Henüz çok genç ama savunmayı bir orkestra şefi gibi yönetiyor.'],
    en: ['Nothing gets past him in the air; strikers hate drawing him as their marker.', 'Still so young, yet he organises a back line like a conductor.'],
  },
  FB: {
    tr: ['Doksan dakika boyunca çizgide bir aşağı bir yukarı koşabilen, ciğerleri bitmeyen bir bek.', 'Bindirmeleri hiç bitmiyor; ortaları ise forvetlerin alnına adres sorarak gidiyor.'],
    en: ['A full-back with lungs that never run out, bombing up and down the line for ninety minutes.', 'His overlaps never stop, and his crosses arrive on strikers\' foreheads like they had a postcode.'],
  },
};

const FOOT_LINE: Record<'L' | 'R', Bank> = {
  L: {
    tr: ['Solak; sol ayağıyla çektiği falsolu vuruşlar mahallede hâlâ anlatılıyor.', 'O nadir sol ayak, duran toplarda ayrı bir silah.'],
    en: ['A left-footer, and the curling shots off that left boot are still talked about back home.', 'That rare left foot is a weapon of its own at set pieces.'],
  },
  R: {
    tr: ['Sağ ayağının içiyle verdiği falsolar, kalecilerin kabusu olmaya aday.', 'Sağ ayağıyla çektiği şutların sesi, antrenman sahasında ayrı duyuluyor.'],
    en: ['The bend he puts on it with the inside of his right foot could become a goalkeeper\'s nightmare.', 'You can hear the difference when his right foot strikes the ball in training.'],
  },
};

const TRAIT_LINE: Partial<Record<TraitId, Bank>> = {
  showman: { tr: ['Isınırken bile tribüne şov yapmayı ihmal etmiyor.'], en: ['Even in the warm-up he can\'t resist putting on a show.'] },
  hothead: { tr: ['Tek kusuru, sigortasının biraz kısa olması.'], en: ['His one flaw: a fuse that\'s a little too short.'] },
  leader: { tr: ['Henüz çok genç ama soyunma odasında sesi şimdiden duyuluyor.'], en: ['Still a kid, yet his voice already carries in the dressing room.'] },
  workaholic: { tr: ['Antrenman sahasının ışıklarını kapatan hep o oluyor.'], en: ['He\'s always the one who switches off the training-ground lights.'] },
  party_animal: { tr: ['Gece hayatının ışıkları onu biraz fazla çekiyor.'], en: ['The bright lights of the city tempt him a little too much.'] },
  family_first: { tr: ['Ne olursa olsun, pazar akşamları ailesinin sofrasında.'], en: ['Whatever happens, Sunday dinner is with his family.'] },
  calm: { tr: ['Baskı altında nabzı hiç yükselmiyor gibi.'], en: ['Under pressure his pulse never seems to rise.'] },
  trickster: { tr: ['Topla yaptığı numaralar, rakiplerini sinirden çıldırtıyor.'], en: ['His tricks drive opponents up the wall.'] },
  speedster: { tr: ['Yüz metreyi okulda kimse onun kadar hızlı koşamadı.'], en: ['Nobody at school could ever catch him over a hundred metres.'] },
  set_piece_specialist: { tr: ['Serbest vuruşlarda topun başına geçtiğinde baraj kendiliğinden geriliyor.'], en: ['When he stands over a free kick, the wall gets nervous.'] },
  loyal: { tr: ['Ona inananlara karşı vefası dillere destan.'], en: ['His loyalty to those who believed in him is legendary.'] },
  mercenary: { tr: ['Romantizme pek inanmıyor; ona göre futbol bir meslek.'], en: ['He doesn\'t buy the romance — to him football is a profession.'] },
};

const PRESENT: Bank = {
  tr: [
    'Şimdi {club} kapıyı araladı: bir deneme şansı. Gerisi ona kalmış.',
    'Bugün {club} ile ilk deneme antrenmanına çıkacak; çantasında kramponlar ve {mother:gen} hazırladığı börek var.',
    'Ve şimdi {club} başta olmak üzere birkaç kulüp onu yakından görmek istiyor. Gerisi sahada yazılacak.',
  ],
  en: [
    'Now {club} have opened the door a crack: a trial. The rest is up to him.',
    'Today is his first trial session at {club}; in his bag are his boots and something {mother} baked.',
    'And now a handful of clubs, {club} among them, want a closer look. The rest will be written on the pitch.',
  ],
};

const GENERIC_DREAMS: Bank = {
  tr: [
    '{nation} formasıyla bir Dünya Kupası finalinde oynamak.',
    'Annesine deniz manzaralı bir ev almak.',
    'Şampiyonlar Kupası\'nı kaldırmak ve kupayı {hometown:dat} götürmek.',
    'Seksen bin kişinin adını tezahürat olarak haykırdığını duymak.',
    'Altın Top\'u kazanmak ve sahneye ailesini çağırmak.',
  ],
  en: [
    'To play in a World Cup final in a {nation} shirt.',
    'To buy his mum a house by the sea.',
    'To lift the Champions Cup and bring it home to {hometown}.',
    'To hear eighty thousand people chant his name.',
    'To win the Golden Ball and bring his family up on stage.',
  ],
};

const GENERIC_MOTTOS: Bank = {
  tr: ['Ter yalan söylemez.', 'Önce takım, sonra ben.', 'Her antrenman bir final.', 'Korkuyla değil, cesaretle oyna.', 'Bugün ter, yarın zafer.', 'Hayal et, çalış, tekrarla.'],
  en: ['Sweat doesn\'t lie.', 'Team first, always.', 'Every session is a final.', 'Play brave, not scared.', 'Pressure is a privilege.', 'Dream it, graft for it, repeat.'],
};

const DESTINY: Bank = {
  tr: [
    'Yaşlı bir izcinin not defterinde, adının yanında tek kelime yazıyor: "Bekleyin."',
    'Bazı yetenekler erken parlar, bazıları geç. Seninki henüz kendini tam göstermedi.',
    'Tavan mı? Kimse bilmiyor. Belki de yoktur.',
    'İçinde henüz adı konmamış bir şey var; doğru hocayla, doğru zamanda uyanacak.',
    'Rüyalarında hep aynı stadı görüyorsun. Orada henüz hiç oynamadın.',
    'İlk hocan bir keresinde demişti: "Bu çocuğun en iyisini henüz kimse görmedi."',
    'Ayak izlerin derin, ama yolun ne kadar uzun olduğunu henüz kimse ölçemedi.',
  ],
  en: [
    'In an old scout\'s notebook, next to your name, a single word: "Wait."',
    'Some talents shine early, some late. Yours hasn\'t fully shown itself yet.',
    'The ceiling? Nobody knows. Maybe there isn\'t one.',
    'There\'s something in you that doesn\'t have a name yet; the right coach, at the right time, will wake it.',
    'You keep dreaming of the same stadium. You\'ve never played there.',
    'Your first coach once said: "Nobody has seen the best of this kid yet."',
    'Your footprints run deep, but nobody has measured how far the road goes.',
  ],
};

const DESTINY_TRAIT: Partial<Record<TraitId, Bank>> = {
  wonderkid: { tr: ['Erken geldin; dünya henüz sana hazır değil.'], en: ['You arrived early. The world isn\'t ready for you yet.'] },
  late_bloomer: { tr: ['Senin en iyi hâlin, herkes vazgeçtikten sonra gelecek.'], en: ['Your best will come after everyone else has given up waiting.'] },
  big_game: { tr: ['Işıklar ne kadar parlaksa, sen o kadar parlıyorsun. Henüz en parlak ışıkları görmedin.'], en: ['The brighter the lights, the brighter you shine — and you haven\'t seen the brightest yet.'] },
};

const RIVAL_BLURB: Bank = {
  tr: [
    '{rival} ile ilk kez bir U-14 turnuvasında karşılaştınız; finalde attığı gol hâlâ rüyalarına giriyor. Şimdi {rivalClub} formasıyla herkesin konuştuğu isim o.',
    '{rival} hep bir adım öndeydi: önce akademi, önce millî takım, önce manşet. Şimdi {rivalClub} forması giyiyor ve senin adını hiç duymamış gibi yapıyor.',
    'Aynı yaş, aynı hayal, aynı forma numarası. {rival} ({rivalClub}) ile kaderiniz birbirine düğümlenmiş gibi.',
  ],
  en: [
    'You first met {rival} at an under-14 tournament; his winner in the final still haunts your dreams. Now he\'s the name everyone\'s talking about at {rivalClub}.',
    '{rival} was always one step ahead: first to an academy, first to a national cap, first to a headline. Now he\'s at {rivalClub} and pretends he\'s never heard of you.',
    'Same age, same dream, same shirt number. Your fate and {rival:gen} ({rivalClub}) seem to be tied in a knot.',
  ],
};

const MENTOR_BLURB: Bank = {
  tr: [
    '{mentor} soyunma odasının en tecrübeli ismi; senin yaşındayken o da kimsenin inanmadığı bir çocuktu.',
    '{mentor} az konuşur, ama konuştuğunda herkes susar. Seni daha ilk antrenmanda fark etti.',
    '{mentor} kariyerinin son virajında. Bildiği her şeyi birine devretmek istiyor — ve gözü sende.',
  ],
  en: [
    '{mentor} is the dressing room\'s elder statesman; at your age, he too was a kid nobody believed in.',
    '{mentor} rarely speaks, but when he does the room goes quiet. He noticed you at your very first session.',
    '{mentor} is on the last bend of his career and wants to pass on everything he knows — and he\'s got his eye on you.',
  ],
};

const NO_MENTOR: Bank = {
  tr: ['Henüz yol gösteren bir ağabeyin yok; ama doğru kişi, doğru zamanda karşına çıkacak.'],
  en: ['No mentor yet — but the right veteran will turn up at the right time.'],
};

// ───────── family & agent ─────────

interface Role { personality: [string, string]; bio: [string, string] }

const FATHERS: Role[] = [
  { personality: ['sert ama gururlu', 'stern but proud'], bio: ['Hiçbir maçını kaçırmaz; ama tebriği hep evde, kapı kapandıktan sonra eder.', 'Never misses a game, but only ever says "well done" at home, once the door is shut.'] },
  { personality: ['sessiz, çalışkan', 'quiet, hard-working'], bio: ['Otuz yıldır {job}. Konuşmayı sevmez ama oğlunun her haberini gazeteden kesip bir dosyada saklar.', 'A {job} for thirty years. Not one for words, but he clips every article about his son and files it away.'] },
  { personality: ['kenardan bağıran antrenör baba', 'touchline-shouting coach dad'], bio: ['Eski amatör forvet. Tribünden bütün maç boyunca taktik verir; hakemlerle arası hiç iyi olmadı.', 'An old amateur striker who coaches from the stand for ninety minutes. Has never got on with a referee.'] },
  { personality: ['esprili, her şeyi şakaya vuran', 'jokey, never serious'], bio: ['Mahallenin kahvesinde herkes onun "benim oğlan" hikâyelerini ezbere bilir.', 'Everyone at the local café knows his "my boy" stories by heart.'] },
];

const MOTHERS: Role[] = [
  { personality: ['koruyucu, keskin zekâlı', 'protective, sharp-witted'], bio: ['Ailenin asıl menajeri. Sözleşmeleri menajerden önce o okur.', 'The family\'s real manager. She reads every contract before the agent does.'] },
  { personality: ['şefkatli, duasını eksik etmeyen', 'warm, always praying for him'], bio: ['Her maçtan önce arar: "Üşüme, karnını doyur, dikkat et." Maçı izleyemez; bitene kadar mutfakta bekler.', 'Calls before every game: "Wrap up, eat properly, be careful." Can\'t bear to watch — she waits in the kitchen until it\'s over.'] },
  { personality: ['disiplinli öğretmen', 'disciplined teacher'], bio: ['Lise öğretmeni. Diploma alınmadan imza atılmayacağı konusunda hâlâ ısrarcı.', 'A secondary-school teacher, still adamant that no contract gets signed before the diploma.'] },
  { personality: ['tribünün en yüksek sesi', 'the loudest voice in the stand'], bio: ['Amatör maçlarda hakemlere en çok bağıran oydu. Şimdi stat görevlileri onu adıyla tanıyor.', 'She was the one screaming at referees in the amateur days. Now stadium stewards know her by name.'] },
];

const SIBLINGS: (Role & { gender: Gender; elder: boolean })[] = [
  { gender: 'm', elder: true, personality: ['kendisi de oynamış, gölgede kalan ağabey', 'older brother who played too, now in the shadows'], bio: ['Bir zamanlar ailenin yıldızı oydu. Şimdi kardeşinin en sert eleştirmeni ve en büyük hayranı.', 'He used to be the family\'s star. Now he\'s his little brother\'s harshest critic and biggest fan.'] },
  { gender: 'f', elder: false, personality: ['sosyal medya dâhisi küçük kız kardeş', 'social-media whizz little sister'], bio: ['On dört yaşında ve abisinin hesaplarını o yönetiyor; takipçi sayılarını her sabah rapor ediyor.', 'Fourteen, runs her brother\'s accounts, and reports the follower count every morning.'] },
  { gender: 'm', elder: false, personality: ['abisine tapan küçük kardeş', 'little brother who worships him'], bio: ['Altyapı seçmelerine hazırlanıyor ve abisinin her hareketini kopyalıyor — saç modeli dahil.', 'Preparing for academy trials and copying his big brother\'s every move — haircut included.'] },
  { gender: 'f', elder: true, personality: ['avukat abla, ailenin aklı', 'lawyer big sister, the family brains'], bio: ['Hukuk okudu; menajerin gönderdiği her sözleşmede kırmızı kalem onun elinde.', 'Studied law; every contract the agent sends comes back covered in her red pen.'] },
];

const FATHER_JOBS: [string, string][] = [['otobüs şoförü', 'bus driver'], ['marangoz', 'carpenter'], ['fırıncı', 'baker'], ['balıkçı', 'fisherman'], ['elektrikçi', 'electrician'], ['taksici', 'taxi driver']];

const FLAVOR_FATHER: Partial<Record<GenesisFlavor, Role>> = {
  family_legacy: { personality: ['eski profesyonel, yarım kalmış bir kariyer', 'former pro with an unfinished career'], bio: ['{hometown:gen} sevilen oyuncusuydu; yirmi dört yaşında dizi onu yarı yolda bıraktı. Şimdi bütün hırsını belli etmemeye çalışıyor.', 'A fan favourite in {hometown} until his knee betrayed him at twenty-four. Now he tries hard not to show how badly he wants this.'] },
  refugee: { personality: ['onurlu, yorgun, umutlu', 'dignified, tired, hopeful'], bio: ['Eskiden öğretmendi. Şimdi gece vardiyasında çalışıyor ve hâlâ her akşam oğluna bir şiir okuyor.', 'He used to be a teacher. Now he works night shifts and still reads his son a poem every evening.'] },
  rich_kid: { personality: ['iş insanı, şüpheci', 'businessman, sceptical'], bio: ['Şirketini sıfırdan kurdu. Futbolu bir "risk" olarak görüyor — ama son maçı gizlice izlediği söyleniyor.', 'Built his company from nothing. Sees football as "a risk" — though rumour has it he watched the last game in secret.'] },
  small_town: { personality: ['kasabanın fırıncısı, yumuşak kalpli', 'the town baker, soft-hearted'], bio: ['Kasabanın fırınını işletiyor; dükkânın duvarı oğlunun fotoğraflarıyla dolu.', 'Runs the town bakery; the shop walls are covered in photos of his son.'] },
};

const SINGLE_MOTHER: Role = {
  personality: ['iki işte çalışan, yılmaz', 'works two jobs, unbreakable'],
  bio: ['{first:dat} krampon alabilmek için yıllarca iki işte çalıştı. Oğlunun ilk profesyonel maaşıyla bir tatile çıkmayı hayal ediyor.', 'Worked two jobs for years so {first} could have boots. She dreams of a holiday paid for by his first professional wage.'],
};

const AGENTS: Role[] = [
  { personality: ['kurnaz ama sadık', 'shrewd but loyal'], bio: ['Yirmi yıldır bu işin içinde. Telefon rehberi altın değerinde, yüzünden hiçbir şey okunmaz.', 'Twenty years in the game. His contacts book is worth its weight in gold, and his poker face never cracks.'] },
  { personality: ['gösterişli, bağlantıları güçlü', 'flashy, well-connected'], bio: ['Güneş gözlüğünü kışın bile çıkarmaz. Avrupa\'nın yarısındaki sportif direktörlerle aynı mesaj grubunda.', 'Wears sunglasses in December. Shares a group chat with half the sporting directors in Europe.'] },
  { personality: ['eski usul, dürüst', 'old-school, honest'], bio: ['El sıkışmayı imzadan önemli sayar. Az konuşur, çok dinler; komisyonu da hep adildir.', 'Believes a handshake matters more than a signature. Talks little, listens a lot, and his commission is always fair.'] },
  { personality: ['agresif pazarlıkçı', 'aggressive dealmaker'], bio: ['Masadan hep bir fazlasıyla kalkar. Kulüp yöneticileri onu görünce cüzdanlarına sarılır.', 'Always leaves the table with one thing more. Club directors clutch their wallets when he walks in.'] },
  { personality: ['acemi ama hevesli aile dostu', 'eager rookie, family friend'], bio: ['{father:gen} eski bir dostunun oğlu; lisansını yeni aldı. Tecrübesi az ama sana inancı tam.', 'The son of an old friend of {father}, freshly licensed. Short on experience, long on belief in you.'] },
  { personality: ['soğukkanlı, veri meraklısı', 'cool-headed, data-obsessed'], bio: ['Her toplantıya bir tabletle gelir: ısı haritaları, sprint verileri, piyasa grafikleri.', 'Brings a tablet to every meeting: heat maps, sprint data, market charts.'] },
];

const L = (lang: Lang, pair: [string, string]) => (lang === 'tr' ? pair[0] : pair[1]);

type GenesisResult = Awaited<ReturnType<Narrator['genesis']>>;

export function templateGenesis(input: GenesisInput): GenesisResult {
  const lang: Lang = input.lang === 'en' ? 'en' : 'tr';
  const rng = rngFrom('genesis', input.firstName, input.lastName, input.nation, input.position, input.seedFlavor, input.hometownHint, input.rivalName);
  const flavor = normalizeFlavor(input.seedFlavor, rng);
  const culture: Culture = cultureOf(input.nation);
  const familyName = input.lastName;
  const ownSurnameMother = culture === 'es' || culture === 'pt';

  // family
  const singleMother = flavor === 'street' || (flavor === 'outsider' && rng.chance(0.5)) || (flavor === 'second_chance' && rng.chance(0.35));
  const job = rng.pick(FATHER_JOBS);
  const fatherName = `${firstName(rng, culture, 'm', true)} ${familyName}`;
  const motherName = `${firstName(rng, culture, 'f', true)} ${ownSurnameMother ? lastName(rng, culture) : familyName}`;
  const sib = rng.pick(SIBLINGS);
  const siblingName = `${firstName(rng, culture, sib.gender, false)} ${familyName}`;

  const slots: Slots = {
    first: input.firstName,
    last: input.lastName,
    hometown: input.hometownHint,
    nation: input.nationName,
    pos: input.positionName ? input.positionName.toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en-GB') : '',
    club: input.startingClubName,
    rival: input.rivalName,
    rivalClub: input.rivalClub,
    mentor: input.mentorName ?? '',
    father: (singleMother ? motherName : fatherName).split(' ')[0],
    mother: motherName.split(' ')[0],
    sibling: siblingName.split(' ')[0],
    coach: `${firstName(rng, culture, 'm', true)} ${lastName(rng, culture)}`,
    job: L(lang, job),
  };

  const family: GenesisResult['family'] = [];
  if (!singleMother) {
    const fr = FLAVOR_FATHER[flavor] ?? rng.pick(FATHERS);
    family.push({ name: fatherName, role: 'father', personality: L(lang, fr.personality), bio: fill(L(lang, fr.bio), slots, rng, lang) });
    const mr = rng.pick(MOTHERS);
    family.push({ name: motherName, role: 'mother', personality: L(lang, mr.personality), bio: fill(L(lang, mr.bio), slots, rng, lang) });
    if (rng.chance(0.6) || flavor === 'second_chance') {
      family.push({ name: siblingName, role: 'sibling', personality: L(lang, sib.personality), bio: fill(L(lang, sib.bio), slots, rng, lang) });
    }
  } else {
    family.push({ name: motherName, role: 'mother', personality: L(lang, SINGLE_MOTHER.personality), bio: fill(L(lang, SINGLE_MOTHER.bio), slots, rng, lang) });
    family.push({ name: siblingName, role: 'sibling', personality: L(lang, sib.personality), bio: fill(L(lang, sib.bio), slots, rng, lang) });
    if (rng.chance(0.35)) {
      const other = SIBLINGS.find((s) => s !== sib && s.gender !== sib.gender) ?? SIBLINGS[0];
      family.push({ name: `${firstName(rng, culture, other.gender)} ${familyName}`, role: 'sibling', personality: L(lang, other.personality), bio: fill(L(lang, other.bio), slots, rng, lang) });
    }
  }

  // agent: usually a compatriot, sometimes an international operator
  const agentCulture: Culture = rng.chance(0.7) ? culture : rng.pick<Culture>(['en', 'it', 'pt', 'es', 'de']);
  const agentRole = rng.pick(AGENTS);
  const agent = {
    name: fullPersonName(rng, agentCulture, rng.chance(0.75) ? 'm' : 'f', true),
    personality: L(lang, agentRole.personality),
    bio: fill(L(lang, agentRole.bio), slots, rng, lang),
  };

  // backstory: origin → turning point → signature (position/foot/trait) → present
  const ft = FLAVORS[flavor];
  const sentences = [say(ft.origin, lang, slots, rng), say(ft.turning, lang, slots, rng)];
  const traitBank = input.traits.map((t) => TRAIT_LINE[t]).find(Boolean);
  const sigRoll = rng.next();
  if (traitBank && sigRoll < 0.4) sentences.push(say(traitBank, lang, slots, rng));
  else if (sigRoll < 0.75) sentences.push(say(SIGNATURE[input.position] ?? SIGNATURE.CM, lang, slots, rng));
  else sentences.push(say(FOOT_LINE[input.foot === 'L' ? 'L' : 'R'], lang, slots, rng));
  sentences.push(say(PRESENT, lang, slots, rng));
  const backstory = paragraph(sentences, lang);

  const dream = rng.chance(0.55) ? say(ft.dream, lang, slots, rng) : say(GENERIC_DREAMS, lang, slots, rng);
  const motto = rng.chance(0.5) ? say(ft.motto, lang, slots, rng) : say(GENERIC_MOTTOS, lang, slots, rng);
  const theme = say(ft.theme, lang, slots, rng);
  const destinyBank = input.traits.map((t) => DESTINY_TRAIT[t]).find(Boolean);
  const destinyHint = destinyBank && rng.chance(0.6) ? say(destinyBank, lang, slots, rng) : say(DESTINY, lang, slots, rng);

  return {
    hometown: input.hometownHint,
    backstory,
    motto,
    dream,
    theme,
    destinyHint,
    family,
    agent,
    rivalBlurb: input.rivalName ? say(RIVAL_BLURB, lang, slots, rng) : '',
    mentorBlurb: input.mentorName ? say(MENTOR_BLURB, lang, slots, rng) : say(NO_MENTOR, lang, slots, rng),
    ai: false,
  };
}

/** Banks exported for i18n-parity tests. */
export const GENESIS_BANKS: Bank[] = [
  ...Object.values(FLAVORS).flatMap((f) => [f.origin, f.turning, f.theme, f.dream, f.motto]),
  ...Object.values(SIGNATURE), FOOT_LINE.L, FOOT_LINE.R, ...Object.values(TRAIT_LINE).filter((b): b is Bank => !!b),
  PRESENT, GENERIC_DREAMS, GENERIC_MOTTOS, DESTINY, ...Object.values(DESTINY_TRAIT).filter((b): b is Bank => !!b),
  RIVAL_BLURB, MENTOR_BLURB, NO_MENTOR,
];
