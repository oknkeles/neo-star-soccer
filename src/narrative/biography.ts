/**
 * The retirement documentary: five or six paragraphs composed from the career facts the game hands over
 * (header / clubs / totals / trophies / awards / international / peak / origin / rival / goals / legend score).
 */
import type { NarrativeContext } from '../core/narrative-types';
import { cap, fill, paragraph, rngFrom, sayF, type Bank, type Slots } from './grammar';
import { ctxSlots, langOf } from './ctxutil';

const b = (tr: string[], en: string[]): Bank => ({ tr, en });

interface ParsedFacts {
  name?: string; from?: string; to?: string; clubs: string[]; apps: number; goals: number; assists: number;
  trophies: string[]; awards: string[]; caps: number; intlGoals: number; peakOvr: number; peakValue: string;
  rival?: string; rivalGoals: number; achieved: string[]; hof: number;
}

const none = /^(yok|none|-|—)$/i;
const list = (s: string | undefined, sep = /,\s*/): string[] => (s ?? '').split(sep).map((x) => x.trim()).filter((x) => x && !none.test(x));

export function parseCareerFacts(facts: string): ParsedFacts {
  const out: ParsedFacts = { clubs: [], apps: 0, goals: 0, assists: 0, trophies: [], awards: [], caps: 0, intlGoals: 0, peakOvr: 0, peakValue: '', rivalGoals: 0, achieved: [], hof: 0 };
  for (const raw of (facts ?? '').split('\n')) {
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(.+?) — .+?, .+?\. (?:Profesyonel kariyer|Professional career): (\d+)[–-](\d+)/))) { out.name = m[1]; out.from = m[2]; out.to = m[3]; }
    else if ((m = line.match(/^(?:Kulüpler|Clubs): (.+)$/))) out.clubs = list(m[1]);
    else if ((m = line.match(/(\d+) maç, (\d+) gol, (\d+) asist/) ?? line.match(/(\d+) appearances, (\d+) goals, (\d+) assists/))) { out.apps = +m[1]; out.goals = +m[2]; out.assists = +m[3]; }
    else if ((m = line.match(/^(?:Kupalar|Trophies): (.+)$/))) out.trophies = list(m[1]);
    else if ((m = line.match(/^(?:Bireysel ödüller|Individual awards): (.+)$/))) out.awards = list(m[1]);
    else if ((m = line.match(/(\d+) maç, (\d+) gol/) ?? line.match(/(\d+) caps, (\d+) goals/))) { out.caps = +m[1]; out.intlGoals = +m[2]; }
    else if ((m = line.match(/(?:genel güç|overall) (\d+), (?:piyasa değeri|market value) (.+?)\.?$/))) { out.peakOvr = +m[1]; out.peakValue = m[2]; }
    else if ((m = line.match(/^(?:Ezeli rakibi|Great rival): (.+?) \((\d+)/))) { out.rival = m[1]; out.rivalGoals = +m[2]; }
    else if ((m = line.match(/^(?:Gerçekleşen hedefler|Goals achieved): (.+)$/))) out.achieved = list(m[1], /;\s*/);
    else if ((m = line.match(/(?:Efsane puanı|Legend score): (\d+)/))) out.hof = +m[1];
  }
  return out;
}

const TIERS: [number, 'immortal' | 'great' | 'star' | 'respected' | 'journeyman' | 'unknown'][] = [
  [2600, 'immortal'], [1700, 'great'], [1000, 'star'], [500, 'respected'], [200, 'journeyman'], [0, 'unknown'],
];

const OPEN = b(
  ['{hometown:loc} {first} adında bir çocuk, topu ayağından hiç ayırmadan büyüdü. {back}', 'Her büyük hikâyenin bir başlangıcı vardır; {first:gen} başlangıcı {hometown} sokaklarındaydı. {back}', 'Belgeselimiz {hometown:loc}, toprak bir sahada başlıyor. Orada {first} adında bir çocuk vardı. {back}'],
  ['A boy named {first} grew up in {hometown} without ever letting the ball leave his feet. {back}', 'Every great story has a beginning; {first:gen} began on the streets of {hometown}. {back}', 'Our documentary begins on a dusty pitch in {hometown}. A boy named {first} was playing there. {back}'],
);
const RISE: Bank = b(
  ['Profesyonel yolculuk {from} yılında {firstClub} formasıyla başladı{moreClubs}. Zamanla {apps} maça çıktı, {goals} gol attı, {assists} golün de asistini yaptı.', '{firstClub} ile başlayan serüven {to} yılına kadar sürdü{moreClubs}. Geride {apps} maç, {goals} gol ve {assists} asist bıraktı.'],
  ['The professional journey began in {from} in a {firstClub} shirt{moreClubs}. In time he made {apps} appearances, scored {goals} goals and set up {assists} more.', 'The adventure that started at {firstClub} ran until {to}{moreClubs}. He left behind {apps} games, {goals} goals and {assists} assists.'],
);
const PEAK = b(
  ['Zirvede genel gücü {peakOvr:dat}, piyasa değeri {peakValue} seviyesine ulaştı; {pos} mevkiinde kuşağının en çok konuşulan isimlerinden biri oldu.', 'Zirve yılları geldiğinde genel gücü {peakOvr:dat} yükselmişti; mevkisinin en çok konuşulan isimlerinden biri olmuştu.', 'En parlak döneminde gücü {peakOvr}, piyasa değeri {peakValue} idi; stadyumlar onun adını tezahürat yapıyordu.'],
  ['At his peak his overall touched {peakOvr} and his market value {peakValue}; he became one of the most talked-about {pos}s of his generation.', 'By his peak years his rating had climbed to {peakOvr}, making him one of the most talked-about names in his position.', 'At his brightest his rating was {peakOvr} and his value {peakValue}; stadiums sang his name.'],
);
const TROPHIES = b(
  ['Vitrinindeki kupalar: {trophies}.', 'Kupa dolabı boş kalmadı: {trophies}.'],
  ['The trophies on his shelf: {trophies}.', 'The cabinet never stayed empty: {trophies}.'],
);
const NO_TROPHIES = b(
  ['Kupa dolabı boş kaldı belki, ama taraftarın kalbinde yer kazandı.', 'Büyük kupalar yanından geçti ama oynadığı her maçta emek vardı.'],
  ['The trophy cabinet may have stayed empty, but he won a place in the supporters\' hearts.', 'The big trophies passed him by, yet every match he played carried effort.'],
);
const AWARDS = b(
  ['Bireysel olarak ise şu ödüllerle anıldı: {awards}.'],
  ['Individually he was honoured with: {awards}.'],
);
const RIVAL = b(
  ['Kariyerine damga vuran rekabet {rival} ile oldu; rakibi {rivalGoals} gol atarak kendi hikâyesini yazdı ama iki ismi birlikte anmadan bu dönemi anlatmak mümkün değil.', 'Sahanın öbür tarafında hep {rival} vardı. {rivalGoals} gollük kariyerine rağmen onun adı, {first:gen} hikâyesinin ayrılmaz parçası.'],
  ['The rivalry that defined his career was with {rival}, who wrote his own story with {rivalGoals} goals, but nobody can tell this era without naming them together.', '{rival} was always on the other side of the pitch. Despite his {rivalGoals} career goals, his name is an inseparable part of {first:gen} story.'],
);
const MENTOR = b(
  ['Yol arkadaşları arasında {mentor} ayrı bir yere sahipti; «bir ağabey, bir okul» diye anardı onu.', '{mentor:gen} öğütleri, sahada yaptığı birçok hareketin ardındaki sessiz kahramandı.'],
  ['Among his companions {mentor} held a special place; he called him "an older brother, a school".', '{mentor:gen} advice was the quiet hero behind many of his moves on the pitch.'],
);
const PARTNER = b(
  ['Sahanın dışında {partner} her zaman yanındaydı; tribündeki en sadık yüz oydu.', 'Hayatın zor anlarında {partner} onun limanı oldu.'],
  ['Off the pitch {partner} was always at his side; the most loyal face in the stands.', 'In the hard moments of life {partner} was his harbour.'],
);
const INTL = b(
  ['Millî formayla {caps} maça çıktı ve {intlGoals} gol attı; bayrağı göğsünde taşımak onun için her zaman ayrı bir gururdu.', '{caps} kez millî takım formasını giydi, {intlGoals} kez sevinç çığlığı attı. Ülke onun için ayağa kalkıyordu.'],
  ['He won {caps} caps for his country and scored {intlGoals}; carrying the flag on his chest was always a special pride.', 'He pulled on the national shirt {caps} times and celebrated {intlGoals} goals. A whole country rose for him.'],
);
const GOALS_DONE = b(
  ['Çocukluk hayallerinden şunları gerçeğe dönüştürdü: {achieved}.'],
  ['He turned these childhood dreams into reality: {achieved}.'],
);
const VERDICT: Record<string, Bank> = {
  immortal: b(['Futbol tarihi onu efsaneler arasında anacak. Adı, stadyumun girişine kazınacak kadar büyük.', 'Bir oyuncu daha değildi; bir dönemdi. Efsane kelimesi onun için icat edilmiş gibi.'], ['Football history will place him among the legends. His name is big enough to be carved over the stadium gate.', 'He wasn\'t just a player, he was an era. The word legend might have been invented for him.']),
  great: b(['Tarihin büyükleri arasında anılacak, çocuklar onun forma numarasını sokaklarda sırtlarında taşıyacak.', 'Futbolun hafızası onu unutmayacak: tarihin büyüklerinden biri.'], ['He will be remembered among the all-time greats; children will wear his number in the streets.', 'The memory of football will not forget him: one of the greats.']),
  star: b(['Bir dönemin yıldızıydı; sahayı terk etse de anıları tribünlerde yaşamaya devam edecek.', 'Yıldızlar sönmez, yön gösterir: o da kuşağın yıldızlarından biriydi.'], ['He was the star of an era; though he leaves the pitch, his memories live on in the stands.', 'Stars don\'t fade, they guide: he was one of his generation\'s stars.']),
  respected: b(['Saygın bir kariyer bıraktı: çok iş yapan, az konuşan, her zaman hakkını veren bir futbolcu.', 'Büyük manşetler çekmedi belki ama oynadığı her yerde saygı gördü.'], ['He leaves a respected career: a player who did much, spoke little and always gave his all.', 'He may not have grabbed the big headlines, but he earned respect wherever he played.']),
  journeyman: b(['Kahramanlığı gösterişte değil, süreklilikteydi; alt liglerin emektarı olarak hatırlanacak.', 'Gün gelir unutulur ama oynadığı her sahada ter bırakmıştır; futbol işçisi dediğimiz tam olarak budur.'], ['His heroism lay in consistency rather than show; he will be remembered as a stalwart of the lower leagues.', 'Maybe forgotten one day, but he left sweat on every pitch he played; this is exactly what a football workman is.']),
  unknown: b(['Belki bu hikâyeyi çok kişi bilmiyor, ama {first} bir zamanlar bir hayal kurmuştu; ve en azından denedi.', 'Anonim kalan her futbolcu, aslında bir hayalin yarı yolunda kalmış cesur bir yürektir.'], ['Perhaps few know this story, but {first} once had a dream; and at least he tried.', 'Every anonymous footballer is, in truth, a brave heart who stopped halfway through a dream.']),
};
const CLOSE = b(
  ['Ve son düdük çaldığında, {first} kramponlarını duvara astı; geriye bir hikâye, bir miras ve yeni bir çocuğun top peşinde koştuğu sokaklar kaldı.', 'Kramponlar duvara asıldı, ama top bir yerlerde hâlâ yuvarlanıyor: yeni bir çocuk, yeni bir hayal için.'],
  ['And when the final whistle blew, {first} hung his boots on the wall; what remained was a story, a legacy and the streets where a new child chases a ball.', 'The boots are on the wall, but somewhere the ball keeps rolling: for a new child, for a new dream.']);

export function writeBiography(ctx: NarrativeContext, careerFacts: string): string {
  const lang = langOf(ctx);
  const tr = lang === 'tr';
  const rng = rngFrom('bio', ctx.player.name, ctx.season, careerFacts.slice(0, 200));
  const pf = parseCareerFacts(careerFacts);
  const first = ctx.player.nickname ?? ctx.player.name.split(/\s+/)[0];
  const slots: Slots = {
    ...ctxSlots(ctx),
    first,
    hometown: ctx.hometown || (tr ? 'küçük bir kasaba' : 'a small town'),
    motto: '',
    back: (ctx.backstory.split(/(?<=[.!?])\s/).slice(0, 2).join(' ')).trim(),
    from: pf.from ?? '', to: pf.to ?? '',
    firstClub: pf.clubs[0] ?? ctx.club?.name ?? '',
    moreClubs: pf.clubs.length > 1
      ? (tr ? `; sonrasında ${pf.clubs.slice(1).join(', ')} formalarını da giydi` : `; later he also wore the shirts of ${pf.clubs.slice(1).join(', ')}`)
      : '',
    apps: pf.apps || ctx.careerStats.apps,
    goals: pf.goals || ctx.careerStats.goals,
    assists: pf.assists || ctx.careerStats.assists,
    peakOvr: pf.peakOvr || ctx.player.overall,
    peakValue: pf.peakValue || '',
    trophies: pf.trophies.join(', '),
    awards: pf.awards.join(', '),
    caps: pf.caps || ctx.careerStats.caps,
    intlGoals: pf.intlGoals,
    rival: pf.rival ?? ctx.rival?.name ?? '',
    rivalGoals: pf.rivalGoals || ctx.rival?.goals || 0,
    achieved: pf.achieved.join('; '),
  };

  const paras: string[] = [];
  // 1 origin
  paras.push(paragraph([sayF(OPEN, lang, slots, rng), ctx.dream ? (tr ? `Hayali basitti: ${ctx.dream.replace(/^[a-zçğıöşü]/, (c) => c.toLocaleLowerCase('tr-TR'))}` : `His dream was simple: ${ctx.dream.charAt(0).toLowerCase()}${ctx.dream.slice(1)}`) : ''], lang));
  // 2 rise
  paras.push(paragraph([sayF(RISE, lang, slots, rng), pf.peakOvr ? sayF(PEAK, lang, slots, rng) : ''], lang));
  // 3 honours
  const honours: string[] = [];
  honours.push(pf.trophies.length ? sayF(TROPHIES, lang, slots, rng) : sayF(NO_TROPHIES, lang, slots, rng));
  if (pf.awards.length) honours.push(sayF(AWARDS, lang, slots, rng));
  if (pf.achieved.length) honours.push(sayF(GOALS_DONE, lang, slots, rng));
  if ((pf.caps || ctx.careerStats.caps) > 0) honours.push(sayF(INTL, lang, slots, rng));
  paras.push(paragraph(honours, lang));
  // 4 people
  const people: string[] = [];
  if (slots.rival) people.push(sayF(RIVAL, lang, slots, rng));
  if (ctx.mentor) people.push(sayF(MENTOR, lang, { ...slots, mentor: ctx.mentor.name }, rng));
  if (ctx.partner) people.push(sayF(PARTNER, lang, { ...slots, partner: ctx.partner.name }, rng));
  if (ctx.storylines.some((s) => s.kind === 'injury_comeback')) {
    people.push(tr ? 'Sakatlıkla verdiği mücadele, onu sahadan daha çok karakterinde büyüttü.' : 'His fight with injury made him grow more in character than on the pitch.');
  }
  if (people.length) paras.push(paragraph(people, lang));
  // 5 legacy
  const tier = TIERS.find(([min]) => pf.hof >= min)?.[1] ?? 'unknown';
  paras.push(paragraph([sayF(VERDICT[tier], lang, slots, rng)], lang));
  // 6 close
  paras.push(paragraph([sayF(CLOSE, lang, slots, rng)], lang));
  return paras.filter((p) => p.trim()).map((p) => cap(p, lang)).join('\n\n');
}
