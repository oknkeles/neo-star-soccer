/**
 * Contract talks. The game has already run the deterministic negotiation step, so `neg.current` is the
 * club's new proposal and `neg.status` the outcome. The sporting director only gives it a voice.
 */
import type { ContractTerms, Negotiation } from '../core/types';
import type { NarrativeContext, NegotiationReply } from '../core/narrative-types';
import '../core/strings';
import { t } from '../core/i18n';
import { formatMoney } from '../core/util';
import { fill, pickFilled, rngFrom, sayF, type Bank, type Slots } from './grammar';
import { ctxSlots, inventedPerson, langOf } from './ctxutil';
import { readFreeText } from './press';
import { clubById } from './safe';

const b = (tr: string[], en: string[]): Bank => ({ tr, en });

const AGREED = b(
  ['Anlaştık! {director} elini uzattı: «{club} ailesine hoş geldin. Bu imza uzun bir hikâyenin başlangıcı olsun.»', '«Tamamdır, kâğıtları hazırlatıyorum,» dedi {director} gülümseyerek. «{club}, doğru adamı buldu.»', '{director} masadan kalktı, elini sıktı: «Pazarlık zordu ama adil. Şimdi sahada konuşalım.»'],
  ['Done deal! {director} offered a handshake: "Welcome to the {club} family. May this signature begin a long story."', '"That\'s it, I\'ll have the papers drawn up," said {director} with a smile. "{club} has found the right man."', '{director} stood and shook your hand: "A tough negotiation, but a fair one. Let\'s talk on the pitch now."'],
);
const COLLAPSED = b(
  ['{director} dosyayı kapattı: «Üzgünüm, bu şartlarla yürümüyor. {club} başka seçeneklere yönelecek.»', '«Sabrımız tükendi,» dedi {director} ve sandalyesini geri itti. «Teklifimizi çekiyoruz.»', 'Oda buz kesti. {director}: «Bu masada artık konuşacak bir şey kalmadı. Hayırlı olsun.»'],
  ['{director} closed the folder: "I\'m sorry, it doesn\'t work on these terms. {club} will explore other options."', '"Our patience has run out," said {director}, pushing his chair back. "We\'re withdrawing the offer."', 'The room went cold. {director}: "There\'s nothing left to discuss at this table. Good luck."'],
);
const CLOSE = b(
  ['«Neredeyse aynı yerdeyiz,» dedi {director}. «Şu rakamı kabul edebilirim, gerisi ayrıntı.»', '{director} başını salladı: «Beklentilerinize yaklaştık. Bu son esnemeye çok yakın bir teklif.»', '«Doğru yoldayız,» dedi {director}, kalemini masaya bıraktı. «Küçük bir adım daha yeter.»'],
  ['"We\'re almost in the same place," said {director}. "I can live with this figure; the rest is detail."', '{director} nodded: "We\'ve come close to your expectations. This is near the limit of our flexibility."', '"We\'re on the right track," said {director}, setting down his pen. "One small step more will do."'],
);
const MIDDLE = b(
  ['{director} bir süre sessiz kaldı: «İstediğiniz rakam bizim için zor, ama genç bir yeteneğe yatırım yapmaya hazırız. Şu teklifi düşünün.»', '«Biraz esnedik,» dedi {director}. «Siz de bir adım atarsanız anlaşmaya varırız.»', '{director} hesap makinesine baktı, sonra size: «Bütçe sınırlı; ama {club} sizi istiyor. İşte yeni teklifimiz.»'],
  ['{director} was quiet a while: "Your figure is hard for us, but we are ready to invest in young talent. Consider this offer."', '"We\'ve flexed a little," said {director}. "Meet us part way and we have a deal."', '{director} glanced at the calculator, then at you: "The budget is tight, but {club} wants you. Here is our new offer."'],
);
const FAR = b(
  ['{director} gözlüğünü çıkarıp silkti: «Beklentileriniz bütçemizin çok üstünde. Ancak şu kadarını verebiliriz.»', '«Bu rakam yönetim kurulundan geçmez,» dedi {director}. «Gerçekçi bir yere inelim.»', '{director} yüzünü ekşitti: «İstekler büyük, ama biz de boş gelmedik. Karşı teklifimiz bu.»'],
  ['{director} took off his glasses: "Your expectations are far above our budget. This is what we can offer."', '"That figure won\'t clear the board," said {director}. "Let\'s land somewhere realistic."', '{director} winced: "The demands are big, but we didn\'t come empty-handed. This is our counter."'],
);
const FINAL = b(
  ['«Bu son teklifimiz,» dedi {director} net bir sesle. «Almazsanız masadan kalkarız.»', '{director} dosyayı itti: «Daha fazlası yok. Karar sizin.»'],
  ['"This is our final offer," said {director} flatly. "Take it or we walk."', '{director} pushed the folder across: "There is no more. The decision is yours."'],
);
const IMPATIENT = b(
  ['{director} saatine baktı. ', '{director} sabırsızca parmaklarını masaya vurdu. '],
  ['{director} glanced at his watch. ', '{director} drummed his fingers on the table. '],
);
const REACT: Record<string, Bank> = {
  fans: b(['«Taraftara verdiğin değeri biliyoruz, bu bize de hoş geliyor.» ', 'Taraftar sevgisine dair sözlerin {director:acc} yumuşattı. '], ['"We know what the fans mean to you, and we like that." ', 'Your words about the supporters softened {director} a little. ']),
  stay: b(['«Bu kulübe bağlılığın bizi memnun etti.» ', '{director} gülümsedi: «Kalma niyetin güzel haber.» '], ['"Your commitment to this club pleases us." ', '{director} smiled: "Good news that you intend to stay." ']),
  leave: b(['«Başka kapıları yokladığını duymak istemezdik.» ', '{director:gen} yüzü asıldı: «Ayrılık lafı müzakereyi sertleştirir.» '], ['"We\'d rather not hear about you knocking on other doors." ', '{director} frowned: "Talk of leaving hardens negotiations." ']),
  insult: b(['{director} kaşlarını çattı: «Bu üslupla müzakere yürümez.» ', '«Saygı sınırlarını aşma,» dedi {director} soğukça. '], ['{director} frowned: "Negotiation doesn\'t work in this tone." ', '"Don\'t cross the line of respect," said {director} coldly. ']),
  arrogant: b(['«Özgüvenin güzel ama rakamlar başka bir hikâye anlatıyor.» ', '{director} kaşını kaldırdı: «Sahada ispatla, masada değil.» '], ['"Confidence is good, but the numbers tell another story." ', '{director} raised an eyebrow: "Prove it on the pitch, not at the table." ']),
  humble: b(['«Mütevazı yaklaşımın hoşuma gitti.» ', '{director} başını salladı: «Böyle konuşan oyuncuyla çalışmak kolay olur.» '], ['"I like your humble approach." ', '{director} nodded: "A player who speaks like that is easy to work with." ']),
};

const money = (v: number, lang: 'tr' | 'en') => formatMoney(v, lang);

function summary(terms: ContractTerms, lang: 'tr' | 'en'): string {
  const role = t(`common.role.${terms.role}`, undefined, lang);
  const parts: string[] = lang === 'tr'
    ? [`haftalık ${money(terms.wage, lang)}`, `${terms.years} yıl`, `${role} rolü`]
    : [`${money(terms.wage, lang)} a week`, `${terms.years} ${terms.years === 1 ? 'year' : 'years'}`, `${role} role`];
  if (terms.signingBonus > 0) parts.push(lang === 'tr' ? `${money(terms.signingBonus, lang)} imza parası` : `${money(terms.signingBonus, lang)} signing bonus`);
  if (terms.goalBonus > 0) parts.push(lang === 'tr' ? `gol başına ${money(terms.goalBonus, lang)}` : `${money(terms.goalBonus, lang)} per goal`);
  if (terms.releaseClause) parts.push(lang === 'tr' ? `${money(terms.releaseClause, lang)} serbest kalma bedeli` : `${money(terms.releaseClause, lang)} release clause`);
  return (lang === 'tr' ? 'Şartlar: ' : 'Terms: ') + parts.join(', ') + '.';
}

export function negotiationReply(ctx: NarrativeContext, neg: Negotiation, ask: ContractTerms, message: string | null): NegotiationReply {
  const lang = langOf(ctx);
  const rng = rngFrom('neg', ctx.season, ctx.week, neg.offerId, neg.round, neg.status, message?.slice(0, 40));
  const club = clubById(neg.clubId);
  const clubName = club?.name ?? (lang === 'tr' ? 'kulüp' : 'the club');
  const slots: Slots = { ...ctxSlots(ctx), club: clubName, director: inventedPerson(ctx, 'director', neg.clubId) };
  const cur = neg.current;

  let text: string;
  if (neg.status === 'agreed') {
    text = sayF(AGREED, lang, slots, rng);
  } else if (neg.status === 'collapsed') {
    text = sayF(COLLAPSED, lang, slots, rng);
  } else {
    // how far is the club from the ask?
    const gap = ask.wage > 0 ? (ask.wage - cur.wage) / ask.wage : 0;
    const last = neg.round >= neg.maxRounds - 1 || neg.patience <= 25;
    const bank = last ? FINAL : gap <= 0.07 ? CLOSE : gap <= 0.25 ? MIDDLE : FAR;
    const pre: string[] = [];
    if (neg.patience < 35 && !last) pre.push(fill(pickFilled(IMPATIENT[lang], slots, rng), slots, rng, lang));
    if (message && message.trim()) {
      const r = readFreeText(message, ctx);
      const key = r.insults > 0 ? 'insult' : r.leave ? 'leave' : r.stay ? 'stay' : r.fans > 0 ? 'fans' : r.arrogance > 0 ? 'arrogant' : r.humility > 0 ? 'humble' : '';
      if (key) pre.push(fill(pickFilled(REACT[key][lang], slots, rng), slots, rng, lang));
    }
    text = [...pre, sayF(bank, lang, slots, rng)].join(' ');
    // call out the points where the club moved against the ask
    const notes: string[] = [];
    if (cur.role !== ask.role) notes.push(lang === 'tr' ? `Rol konusunda ${t(`common.role.${cur.role}`, undefined, lang)} olarak düşünüyoruz.` : `On the role, we see you as a ${t(`common.role.${cur.role}`, undefined, lang)}.`);
    if (ask.years !== cur.years) notes.push(lang === 'tr' ? `Süre olarak ${cur.years} yıl uygun görüyoruz.` : `On length, ${cur.years} ${cur.years === 1 ? 'year' : 'years'} works for us.`);
    if (ask.releaseClause !== cur.releaseClause && cur.releaseClause) notes.push(lang === 'tr' ? 'Serbest kalma bedelini yüksek tutmak istiyoruz.' : 'We want to keep the release clause high.');
    if (notes.length) text += ' ' + notes.slice(0, 2).join(' ');
  }
  text = `${text} ${summary(cur, lang)}`.replace(/\s+/g, ' ').trim();
  return { text, terms: { ...cur }, patienceDelta: 0, walkAway: neg.status === 'collapsed' };
}
