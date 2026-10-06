/** Live commentary: ticker lines for macro match events and short calls for real-time moments. */
import type { Lang, MatchEventKind, MomentEvent } from '../core/types';
import type { Rng } from '../core/rng';
import { getLang } from '../core/i18n';
import { fill, type Bank, type Slots } from './grammar';

type MatchBanks = Record<MatchEventKind, Bank>;

export const MATCH_LINES: MatchBanks = {
  goal: {
    tr: [
      '{minute}\' [Ve gol|GOOOL|Ve top ağlarda]! {player} ağları havalandırdı! {score}',
      '{minute}\' Bu ne vuruş arkadaşlar! {player} [köşeye çaktı|füzeyi ateşledi|kaleciye şans tanımadı]. {score}',
      '{minute}\' [Muhteşem bir falso|Ne falso ama]! {player:gen} vuruşu kalecinin uzanamayacağı yere kıvrıldı! {score}',
      '{minute}\' Gol! {team} öne geçmek için ne gerekiyorsa yaptı, imza {player:gen}. {score}',
      '{minute}\' {player} ceza sahasında affetmedi! Tribünler [yıkılıyor|ayakta|çıldırıyor]! {score}',
      '{minute}\' Kaleci uzandı ama nafile! {player} topu filelere gönderdi. {score}',
      '{minute}\' [İşte gol|Ve beklenen gol geldi]! {team} sahnede, golü atan {player}. {score}',
      '{minute}\' Gol! Topu ağlara {player} yolladı. {score}',
      '{minute}\' Gol! {team} skoru değiştirdi. {score}',
    ],
    en: [
      '{minute}\' [GOAL|GOOOAL|It\'s in]! {player} has [buried it|smashed it home|found the net]! {score}',
      '{minute}\' What a strike! {player} [picks out the top corner|leaves the keeper rooted|lashes it in]. {score}',
      '{minute}\' [What a curler|Bent like a banana]! {player} wraps it round the keeper and in! {score}',
      '{minute}\' Goal! {team} make the breakthrough and it\'s {player} with the finish. {score}',
      '{minute}\' {player} makes no mistake inside the box — the stadium [erupts|is bouncing|goes wild]! {score}',
      '{minute}\' The keeper sprawls, but it\'s beyond him! {player} scores. {score}',
      '{minute}\' [There it is|And the pressure tells]! {team} strike — {player} the man. {score}',
      '{minute}\' Goal! {player} puts it away. {score}',
      '{minute}\' Goal for {team}! {score}',
    ],
  },
  own_goal: {
    tr: [
      '{minute}\' Eyvah! {player} topu kendi ağlarına gönderdi. {score}',
      '{minute}\' Talihsiz an! Kendi kalesine gol. {score}',
      '{minute}\' Ne şanssızlık! Seken top {team} lehine ağlarla buluştu. {score}',
    ],
    en: [
      '{minute}\' Oh dear! {player} turns it into his own net. {score}',
      '{minute}\' An own goal — nightmare moment. {score}',
      '{minute}\' Cruel deflection, and {team} gift-wrapped a goal. {score}',
    ],
  },
  penalty_goal: {
    tr: [
      '{minute}\' Penaltı noktasında {player}... GOL! Kaleciyi ters köşeye yatırdı. {score}',
      '{minute}\' {player} penaltıda soğukkanlı: top bir köşe, kaleci öbür köşe! {score}',
      '{minute}\' Panenka mı o?! {player} penaltıyı [aşırttı|kafa kafaya çaktı]! {score}',
      '{minute}\' Penaltı golü! {team} skoru değiştirdi. {score}',
    ],
    en: [
      '{minute}\' {player} steps up... and scores! Sends the keeper the wrong way. {score}',
      '{minute}\' Ice in the veins from {player} — one corner, keeper the other! {score}',
      '{minute}\' Was that a Panenka?! {player} [chips it|blasts it] down the middle! {score}',
      '{minute}\' Penalty converted. {team} score. {score}',
    ],
  },
  penalty_miss: {
    tr: [
      '{minute}\' Penaltı kaçtı! {player:gen} vuruşunu kaleci çıkardı!',
      '{minute}\' İnanılmaz! {player} penaltıda topu auta gönderdi!',
      '{minute}\' Kaleci kahraman! Penaltı kurtarıldı!',
      '{minute}\' Direkten döndü! Penaltı gole dönmedi!',
    ],
    en: [
      '{minute}\' Saved! The keeper reads {player} perfectly!',
      '{minute}\' Unbelievable — {player} skies the penalty!',
      '{minute}\' The keeper is the hero! Penalty saved!',
      '{minute}\' Off the post! The penalty stays out!',
    ],
  },
  yellow: {
    tr: [
      '{minute}\' Sarı kart: {player}. Hakem affetmedi.',
      '{minute}\' {player} geç kaldı, sarıyı gördü.',
      '{minute}\' Hakem cebine gitti — {player} için sarı kart.',
      '{minute}\' Sarı kart çıktı.',
    ],
    en: [
      '{minute}\' Yellow card for {player}. No complaints there.',
      '{minute}\' {player} arrives late and goes into the book.',
      '{minute}\' The referee reaches for his pocket — yellow for {player}.',
      '{minute}\' A yellow card is shown.',
    ],
  },
  red: {
    tr: [
      '{minute}\' KIRMIZI KART! {player} takımını 10 kişi bıraktı!',
      '{minute}\' Hakem direkt kırmızıyı gösterdi! {player} soyunma odasının yolunu tutuyor.',
      '{minute}\' İkinci sarıdan kırmızı! {player} oyun dışı!',
      '{minute}\' Kırmızı kart! {team} 10 kişi kaldı.',
    ],
    en: [
      '{minute}\' RED CARD! {player} leaves his side with ten men!',
      '{minute}\' Straight red! {player} makes the long walk.',
      '{minute}\' Second yellow, and {player} is off!',
      '{minute}\' Red card! {team} are down to ten.',
    ],
  },
  injury: {
    tr: [
      '{minute}\' {player} yerde kaldı, sağlık ekibi oyunda.',
      '{minute}\' Kötü görüntü... {player} sakatlandı, devam edemeyecek gibi.',
      '{minute}\' Oyun durdu, {player} yerde acı çekiyor.',
    ],
    en: [
      '{minute}\' {player} is down and the physios are on.',
      '{minute}\' That looks bad — {player} is hurt and may not continue.',
      '{minute}\' Play is stopped, {player} in real discomfort.',
    ],
  },
  sub: {
    tr: [
      '{minute}\' Oyuncu değişikliği: {player} girdi, {extra} çıktı.',
      '{minute}\' {team} hamlesini yaptı: {player} oyunda.',
      '{minute}\' Taze kan! {player} ısınmayı bitirdi ve oyuna giriyor.',
    ],
    en: [
      '{minute}\' Substitution: {player} on, {extra} off.',
      '{minute}\' {team} make a change — {player} comes on.',
      '{minute}\' Fresh legs! {player} is stripped and ready.',
    ],
  },
  chance: {
    tr: [
      '{minute}\' Aman efendim! {player} bu pozisyonu nasıl kaçırdı!',
      '{minute}\' {player} vurdu, top az farkla dışarıda!',
      '{minute}\' Büyük fırsat! {team} golü kıl payı kaçırdı.',
      '{minute}\' Tehlike! {player} kafayı vurdu, top üstten auta.',
      '{minute}\' Pozisyon! Top kalenin yanından dışarı.',
    ],
    en: [
      '{minute}\' How has {player} missed that?!',
      '{minute}\' {player} lets fly — just wide!',
      '{minute}\' Huge chance! {team} so nearly score.',
      '{minute}\' Danger! {player} gets his head to it, over the bar.',
      '{minute}\' Chance! It flashes past the post.',
    ],
  },
  save: {
    tr: [
      '{minute}\' Kaleci devleşti! {player:gen} şutunu çıkardı.',
      '{minute}\' Ne kurtarış! {player} golü bulmuştu ki eldivenler araya girdi.',
      '{minute}\' Uçtu, yakaladı! {team} kalecisi bugün geçit vermiyor.',
      '{minute}\' Kaleci yerinde! Tehlike savuşturuldu.',
    ],
    en: [
      '{minute}\' The keeper is a giant! {player} denied.',
      '{minute}\' What a save! {player} thought he\'d scored.',
      '{minute}\' Flying stop! The {team} keeper is unbeatable today.',
      '{minute}\' Good hands. Danger averted.',
    ],
  },
  woodwork: {
    tr: [
      '{minute}\' Direk! Top direkten döndü! {player} ellerini başına götürdü.',
      '{minute}\' Üst direk! {player:gen} füzesi yerinde titredi!',
      '{minute}\' Kale direkleri bu akşam rakibin en iyi oyuncusu!',
      '{minute}\' Direk! Ne talihsizlik!',
    ],
    en: [
      '{minute}\' Off the post! {player} can\'t believe it!',
      '{minute}\' Crossbar! {player} rattles the woodwork!',
      '{minute}\' The frame of the goal is having a blinder tonight!',
      '{minute}\' Woodwork! So unlucky!',
    ],
  },
  kickoff: {
    tr: [
      'Hakem başlama düdüğünü çaldı! Tribünler [hazır|dolu|coşkulu].',
      'Ve maç başlıyor! Bol şans {team}!',
      'Top ortadan çıktı, 90 dakikalık savaş başladı.',
    ],
    en: [
      'The referee gets us underway! The atmosphere is [electric|deafening|buzzing].',
      'And we\'re off! Here we go, {team}!',
      'Kick-off — ninety minutes of battle begins.',
    ],
  },
  halftime: {
    tr: ['İlk yarı sona erdi: {score}.', 'Devre arası. Skor tabelasında {score}.', 'Hakem ilk yarıyı bitirdi. {score}, soyunma odasında konuşulacak çok şey var.'],
    en: ['Half-time: {score}.', 'The break arrives with the scoreboard reading {score}.', 'That\'s the half. {score} — plenty to discuss in the dressing room.'],
  },
  fulltime: {
    tr: ['Maç bitti! {score}.', 'Son düdük! {score}.', 'Ve hakem maçı bitiriyor: {score}. [Tribünlerden alkış|Statta büyük coşku|Bir hikâye daha yazıldı].'],
    en: ['Full-time! {score}.', 'There\'s the final whistle: {score}.', 'It\'s all over: {score}. [Applause rings round the ground|What a night|Another story written].'],
  },
  moment: {
    tr: [
      '{minute}\' Top {player} ayağında... şimdi sahne senin!',
      '{minute}\' Pozisyon gelişiyor — {player} oyunun içinde!',
      '{minute}\' Herkes {player:dat} bakıyor...',
    ],
    en: [
      '{minute}\' The ball finds {player} — this is your moment!',
      '{minute}\' Something\'s on here — {player} involved!',
      '{minute}\' All eyes on {player}...',
    ],
  },
  var: {
    tr: ['{minute}\' VAR inceleniyor... Stat nefesini tuttu.', '{minute}\' Hakem kulaklığına dokundu: VAR kontrolü!', '{minute}\' VAR: karar değişiyor mu? Kalpler duracak!'],
    en: ['{minute}\' VAR is checking... the stadium holds its breath.', '{minute}\' The referee touches his earpiece — VAR check!', '{minute}\' VAR review: will the decision stand?'],
  },
  extra_time: {
    tr: ['Uzatmalara gidiyoruz! Bacaklar yorgun, yürekler sağlam.', '90 dakika yetmedi — 30 dakika daha!'],
    en: ['We\'re going to extra time! Tired legs, brave hearts.', 'Ninety minutes weren\'t enough — thirty more!'],
  },
  shootout: {
    tr: ['Seri penaltı atışları! Yürekler ağızda.', 'Penaltılar! Ya kahraman olacaksın ya da...', 'Seri penaltılar: {score}'],
    en: ['Penalties! Hearts in mouths.', 'It\'s a shootout. Heroes or heartbreak.', 'Shootout: {score}'],
  },
};

const SLOT_RE = /\{(\w+)/g;
function usedSlots(tpl: string): string[] {
  const out: string[] = [];
  for (const m of tpl.matchAll(SLOT_RE)) out.push(m[1]);
  return out;
}

/** Slots that may silently disappear (a line still reads fine without them). */
const SOFT = new Set(['score']);

/** Choose a template whose slots are all available, so lines never read with holes in them. */
function pickWithSlots(list: readonly string[], slots: Slots, rng: Rng): string {
  const has = (k: string) => SOFT.has(k) || (slots[k] !== undefined && slots[k] !== null && slots[k] !== '');
  const ok = list.filter((tpl) => usedSlots(tpl).every(has));
  return rng.pick(ok.length ? ok : list);
}

export function matchCommentary(
  kind: MatchEventKind,
  data: { player?: string; team?: string; minute: number; score?: string; extra?: string },
  rng: Rng,
  lang: Lang = getLang(),
): string {
  const bank = MATCH_LINES[kind] ?? MATCH_LINES.chance;
  const slots: Slots = { player: data.player, team: data.team, minute: Math.max(0, Math.round(data.minute ?? 0)), score: data.score, extra: data.extra };
  const tpl = pickWithSlots(bank[lang], slots, rng);
  return fill(tpl, slots, rng, lang).replace(/^0' /, '');
}

// ───────── real-time moments ─────────

const M = {
  goalUs: {
    tr: ['GOOOL! {a} ağları havalandırdı!', 'Ve gol! {a}, ne bitiriş!', 'Muhteşem bir falso! {a} köşeyi buldu!', 'GOL! Bu çocuk başka! {a}!', 'İnanılmaz! {a} topu ağlara gömdü!'],
    en: ['GOAL! {a} rips the net!', 'And it\'s in! {a} — what a finish!', 'What a curler! {a} finds the corner!', 'GOAL! This kid is something else! {a}!', 'Unbelievable! {a} buries it!'],
  },
  goalUsAssist: {
    tr: ['GOL! {b:gen} pasında {a} affetmedi!', 'Ve gol! {b} bıraktı, {a} vurdu!', 'Ne asist ama! {b} → {a}, GOL!'],
    en: ['GOAL! {b} picks him out, {a} finishes!', 'And it\'s in! {b} lays it on, {a} smashes it!', 'What a pass! {b} to {a} — GOAL!'],
  },
  goalThem: {
    tr: ['Gol yedik... {a} affetmedi.', 'Eyvah! {a} skoru değiştirdi.', 'Ağlarımızda top var. {a}.'],
    en: ['They\'ve scored... {a} punishes us.', 'Oh no! {a} finds the net.', 'It\'s in at the other end. {a}.'],
  },
  shotWide: {
    tr: ['Az farkla dışarı!', 'Kıl payı! Top direğin yanından çıktı.', '{a} denedi, top auta!', 'Uff! Çok yakındı!'],
    en: ['Just wide!', 'Inches away! Past the post.', '{a} tries his luck — off target!', 'Ooh! So close!'],
  },
  saveHeld: {
    tr: ['{a} topu kucakladı.', 'Kaleci {a} yerinde, top elinde.', 'Rahat kurtarış.'],
    en: ['{a} gathers it.', 'Comfortable for {a}.', 'Easy save.'],
  },
  saveParry: {
    tr: ['{a} çeldi! Top hâlâ oyunda!', 'Ne kurtarış! {a} uzandı!', 'Kaleci devleşti! Dönen top tehlikeli!'],
    en: ['Parried by {a}! It\'s still live!', 'What a save from {a}!', 'The keeper gets a hand to it — rebound!'],
  },
  post: {
    tr: ['Direk! Top direkten döndü!', 'DİREK! İnanılmaz!', 'Direğe çarptı!'],
    en: ['Off the post!', 'POST! Unbelievable!', 'It cannons off the upright!'],
  },
  bar: {
    tr: ['Üst direk! Kale sarsıldı!', 'Üst direkten döndü!', 'Üst direğe nişan aldı sanki!'],
    en: ['Crossbar! The goal shakes!', 'Off the bar!', 'Rattles the crossbar!'],
  },
  tackle: {
    tr: ['{a} topu kaptı!', 'Temiz müdahale! {a}!', '{a} kapı gibi!'],
    en: ['{a} wins it back!', 'Clean tackle from {a}!', '{a} stands firm!'],
  },
  foul: {
    tr: ['Faul! Hakem düdüğünü çaldı.', 'Sert giriş, faul!', 'Faul var! Düdük çaldı.'],
    en: ['Foul! The whistle goes.', 'Late challenge — free kick!', 'That\'s a foul.'],
  },
  offside: {
    tr: ['Ofsayt bayrağı kalktı.', '{a} ofsaytta! Yan hakem affetmedi.', 'Ofsayt!'],
    en: ['The flag is up.', '{a} is offside!', 'Offside!'],
  },
  nearMiss: {
    tr: ['Kıl payı!', 'Aman! Çok az farkla!', 'Ucu ucuna dışarı!'],
    en: ['So close!', 'Inches!', 'Agonisingly wide!'],
  },
  header: {
    tr: ['{a} kafayı vurdu...', '{a} yükseldi!', 'Kafa vuruşu, {a}!'],
    en: ['{a} gets his head to it...', '{a} rises highest!', 'Header from {a}!'],
  },
  corner: {
    tr: ['Korner.', 'Köşe vuruşu kazandık.'],
    en: ['Corner.', 'It\'s a corner.'],
  },
} satisfies Record<string, Bank>;

export const MOMENT_LINES = M;

export function momentCommentary(e: MomentEvent, nameOf: (id: string) => string, rng: Rng, lang: Lang = getLang()): string | null {
  const nm = (id: string | null | undefined) => {
    if (!id) return '';
    try { return nameOf(id) || ''; } catch { return ''; }
  };
  const line = (bank: Bank, slots: Slots = {}) => {
    const tpl = pickWithSlots(bank[lang], slots, rng);
    return fill(tpl, slots, rng, lang);
  };
  switch (e.t) {
    case 'goal':
      if (e.side === 'them') return line(M.goalThem, { a: nm(e.scorer) });
      if (e.assist && rng.chance(0.5)) return line(M.goalUsAssist, { a: nm(e.scorer), b: nm(e.assist) });
      return line(M.goalUs, { a: nm(e.scorer) });
    case 'shot':
      if (e.onTarget || e.xg < 0.12) return null;
      return line(M.shotWide, { a: nm(e.by) });
    case 'save':
      return line(e.held ? M.saveHeld : M.saveParry, { a: nm(e.by) });
    case 'woodwork':
      return line(e.part === 'post' ? M.post : M.bar);
    case 'tackle':
      if (e.foul) return line(M.foul);
      return e.won ? line(M.tackle, { a: nm(e.by) }) : null;
    case 'offside':
      return line(M.offside, { a: nm(e.player) });
    case 'near_miss':
      return line(M.nearMiss, { a: nm(e.by) });
    case 'header':
      return rng.chance(0.6) ? line(M.header, { a: nm(e.by) }) : null;
    case 'whistle':
      return e.kind === 'foul' ? line(M.foul) : null;
    case 'out':
      return e.restart === 'corner' ? line(M.corner) : null;
    default:
      return null;
  }
}
