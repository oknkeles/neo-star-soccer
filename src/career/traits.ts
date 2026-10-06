/**
 * Personality & playing traits. Every trait has a real mechanical effect somewhere in
 * the career module (growth, injuries, relationships, money, negotiations, selection).
 */
import type { AttrKey, Footballer, TraitId } from '../core/types';
import type { TraitDef } from './model';

export const TRAITS: TraitDef[] = [
  {
    id: 'big_game', icon: 'trophy', positive: true,
    name: { tr: 'Büyük Maç Oyuncusu', en: 'Big-Game Player' },
    desc: { tr: 'Derbilerde, finallerde ve Avrupa gecelerinde bambaşka biri olursun. Büyük maçlarda daha fazla şöhret ve form kazanırsın.', en: 'Derbies, finals and European nights bring out a different player. Bigger fame and form gains in big games.' },
  },
  {
    id: 'glass_bones', icon: 'hospital', positive: false,
    name: { tr: 'Cam Kemik', en: 'Glass Bones' },
    desc: { tr: 'Vücudun pek dayanıklı değil: sakatlanma ihtimalin daha yüksek ve iyileşmen daha uzun sürer.', en: 'Your body is fragile: you get injured more often and take longer to recover.' },
  },
  {
    id: 'late_bloomer', icon: 'trend_up', positive: true,
    name: { tr: 'Geç Açan Çiçek', en: 'Late Bloomer' },
    desc: { tr: 'Gençken yavaş gelişirsin ama 23 yaşından sonra patlama yaparsın; düşüşün de daha geç başlar.', en: 'Slow development as a teenager, then an explosion after 23 — and your decline starts later.' },
  },
  {
    id: 'wonderkid', icon: 'sparkles', positive: true,
    name: { tr: 'Harika Çocuk', en: 'Wonderkid' },
    desc: { tr: '21 yaşına kadar akranlarından çok daha hızlı gelişirsin. Scoutların listesinde ilk sıradasın.', en: 'You develop far faster than your peers until 21. Every scout has your name underlined.' },
  },
  {
    id: 'leader', icon: 'flag', positive: true,
    name: { tr: 'Lider', en: 'Leader' },
    desc: { tr: 'Soyunma odasında sözün geçer. Takım arkadaşlarıyla ilişkin daha hızlı gelişir, hocalar sana güvenir.', en: 'Your voice carries in the dressing room. Teammate relationships grow faster and managers trust you.' },
  },
  {
    id: 'showman', icon: 'film', positive: true,
    name: { tr: 'Şovmen', en: 'Showman' },
    desc: { tr: 'Topuklu paslar, rabonalar, gol sevinçleri… Şöhret ve takipçi kazanımın artar, top sürme gelişimin hızlanır.', en: 'Backheels, rabonas, iconic celebrations. More fame and followers, faster dribbling growth.' },
  },
  {
    id: 'hothead', icon: 'flame', positive: false,
    name: { tr: 'Asabi', en: 'Hothead' },
    desc: { tr: 'Kanın çabuk kaynar. Moralin iniş çıkışlı olur; kötü maçlar hocayla ve medyayla aranı daha çok bozar.', en: 'Short fuse. Your morale swings wildly; bad games hurt you more with the manager and the press.' },
  },
  {
    id: 'iron_man', icon: 'shield', positive: true,
    name: { tr: 'Demir Adam', en: 'Iron Man' },
    desc: { tr: 'Neredeyse hiç sakatlanmazsın ve daha hızlı toparlanırsın. Yaşlandıkça fiziğin daha yavaş düşer.', en: 'Rarely injured and quick to recover. Your physique fades more slowly with age.' },
  },
  {
    id: 'set_piece_specialist', icon: 'target', positive: true,
    name: { tr: 'Duran Top Ustası', en: 'Set-Piece Specialist' },
    desc: { tr: 'Frikiklerde topa öyle bir falso verirsin ki kaleciler sadece izler. Falso gelişimin çok hızlıdır, duran topları sen kullanırsın.', en: 'You bend free kicks so viciously that keepers just watch. Much faster curl growth and first call on set pieces.' },
  },
  {
    id: 'clinical', icon: 'crosshair', positive: true,
    name: { tr: 'Golcü İçgüdüsü', en: 'Clinical Finisher' },
    desc: { tr: 'Ceza sahasında soğukkanlısın. Şut ve soğukkanlılık daha hızlı gelişir, gollerin daha çok konuşulur.', en: 'Ice-cold in the box. Shooting and composure grow faster and your goals make more noise.' },
  },
  {
    id: 'playmaker', icon: 'brain', positive: true,
    name: { tr: 'Oyun Kurucu', en: 'Playmaker' },
    desc: { tr: 'Oyunu herkesten önce görürsün. Pas ve vizyon hızlı gelişir; asistlerin takım arkadaşlarını mest eder.', en: 'You see the game before anyone else. Passing and vision grow faster; your assists win teammates over.' },
  },
  {
    id: 'speedster', icon: 'zap', positive: true,
    name: { tr: 'Rüzgâr', en: 'Speedster' },
    desc: { tr: 'Hız ve ivmelenme senin doğanda var ve daha hızlı gelişir — ama 30 yaşından sonra hız ilk giden şey olur.', en: 'Pace and acceleration are in your blood and grow faster — but after 30 the legs are the first thing to go.' },
  },
  {
    id: 'fan_favourite', icon: 'heart', positive: true,
    name: { tr: 'Tribünlerin Sevgilisi', en: 'Fan Favourite' },
    desc: { tr: 'Tribünler seni bağrına basar. Taraftar ilişkin daha hızlı gelişir ve kolay kolay bozulmaz.', en: 'The stands adore you. Fan relationships grow faster and are slow to sour.' },
  },
  {
    id: 'media_darling', icon: 'mic', positive: true,
    name: { tr: 'Medyanın Gözdesi', en: 'Media Darling' },
    desc: { tr: 'Kameralar seni sever. Medya ilişkin hızlı gelişir, sponsorlar kapında sıraya girer.', en: 'Cameras love you. Media relations grow faster and sponsors queue at your door.' },
  },
  {
    id: 'family_first', icon: 'house', positive: true,
    name: { tr: 'Aile Babası', en: 'Family First' },
    desc: { tr: 'Ailen her şeyden önce gelir. Aile etkinlikleri sana çok daha iyi gelir; ailen mutluyken moralin yüksektir.', en: 'Family comes before everything. Family time pays off much more, and a happy home lifts your morale.' },
  },
  {
    id: 'party_animal', icon: 'party', positive: false,
    name: { tr: 'Gece Kuşu', en: 'Party Animal' },
    desc: { tr: 'Gece hayatı seni çağırır: eğlence moralini uçurur ama skandal riski de iki katına çıkar.', en: 'The nightlife calls: partying sends your morale soaring, but so does the scandal risk.' },
  },
  {
    id: 'workaholic', icon: 'dumbbell', positive: true,
    name: { tr: 'Antrenman Canavarı', en: 'Workaholic' },
    desc: { tr: 'Herkes gittikten sonra da sahadasın. Antrenmanlardan çok daha fazla gelişim elde edersin.', en: 'Still on the pitch long after everyone has gone home. Much more growth from training.' },
  },
  {
    id: 'loyal', icon: 'handshake', positive: true,
    name: { tr: 'Sadık', en: 'Loyal' },
    desc: { tr: 'Formanın hakkını verirsin. Taraftar seni sever, kulübün sözleşmeni seve seve uzatır; ama ayrılık seni çok üzer.', en: 'You honour the shirt. Fans love you and your club happily renews you — but leaving hurts.' },
  },
  {
    id: 'mercenary', icon: 'banknote', positive: false,
    name: { tr: 'Paragöz', en: 'Mercenary' },
    desc: { tr: 'Kalbin cüzdanında atar. Daha çok teklif alır, daha iyi imza parası koparırsın; taraftar sana pek ısınmaz.', en: 'Your heart beats in your wallet. More offers and bigger signing bonuses, but fans never fully warm to you.' },
  },
  {
    id: 'calm', icon: 'moon', positive: true,
    name: { tr: 'Buz Gibi Sakin', en: 'Ice Cool' },
    desc: { tr: 'Hiçbir şey seni germez. Moralin kolay bozulmaz, pazarlıklarda sabırlısın, soğukkanlılığın hızlı gelişir.', en: 'Nothing rattles you. Morale rarely dips, you stay patient in talks and your composure grows fast.' },
  },
  {
    id: 'trickster', icon: 'footprints', positive: true,
    name: { tr: 'Cambaz', en: 'Trickster' },
    desc: { tr: 'Ayağında top varken sokak futbolu ruhu konuşur. Top sürme ve ilk kontrol hızla gelişir.', en: 'With the ball at your feet the street-football soul takes over. Dribbling and first touch grow fast.' },
  },
  {
    id: 'aerial_threat', icon: 'rocket', positive: true,
    name: { tr: 'Hava Hâkimi', en: 'Aerial Threat' },
    desc: { tr: 'Havada senden üstünü yok. Kafa ve zıplama hızla gelişir; duran toplarda rakiplerin kâbusu olursun.', en: 'Nobody beats you in the air. Heading and jumping grow fast; a nightmare at set pieces.' },
  },
];

export function traitDef(id: TraitId): TraitDef | undefined {
  return TRAITS.find((t) => t.id === id);
}

/** Per-attribute xp multiplier from traits. */
const ATTR_TRAIT_MULT: Partial<Record<TraitId, Partial<Record<AttrKey, number>>>> = {
  set_piece_specialist: { curl: 1.5, shooting: 1.05 },
  clinical: { shooting: 1.2, composure: 1.1 },
  playmaker: { passing: 1.2, vision: 1.2 },
  speedster: { pace: 1.2, acceleration: 1.2 },
  aerial_threat: { heading: 1.25, jumping: 1.25 },
  trickster: { dribbling: 1.2, firstTouch: 1.15 },
  showman: { dribbling: 1.1 },
  calm: { composure: 1.2 },
  leader: { positioning: 1.05, vision: 1.05 },
  iron_man: { stamina: 1.1, strength: 1.1 },
};

export function traitAttrMult(p: Pick<Footballer, 'traits'>, attr: AttrKey): number {
  let m = 1;
  for (const t of p.traits) m *= ATTR_TRAIT_MULT[t]?.[attr] ?? 1;
  return m;
}
