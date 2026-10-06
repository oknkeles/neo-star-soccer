/**
 * News banks, part 1: match reports and user-centred headlines.
 * Heads containing "!" are used by tabloid outlets, the others by sober ones.
 * Slots: player first last club opp score gf ga comp manager rival mentor agent hometown goals pundit reporter …
 */
import type { Bank } from '../grammar';

export type ReactionGroup = 'good' | 'bad' | 'transfer' | 'injury' | 'milestone' | 'league' | 'story' | 'none';

export interface NewsEntry {
  h: Bank;
  f: Bank;
  group: ReactionGroup;
  tags?: string[];
}

export const NEWS_MATCH: Record<string, NewsEntry> = {
  match_star_win: {
    group: 'good',
    h: {
      tr: [
        '{player} şov yaptı! {club}, {opp:acc} {score} devirdi',
        'Bu çocuk başka! {player} parladı, {club} {score} kazandı',
        '{player} gecesi: {club}, {opp:acc} {score} geçti',
        '{opp:gen} karşısında {score}: maçın üzerinde {player:gen} imzası var',
        '{player} adeta tek başına çözdü, {club} üç puanı kaptı',
      ],
      en: [
        '{player} runs the show! {club} beat {opp} {score}',
        'This kid is different! {player} shines as {club} win {score}',
        '{player} the difference as {club} see off {opp} {score}',
        '{score} against {opp}, with {player:gen} fingerprints all over it',
        '{player} all but wins it alone as {club} take the points',
      ],
    },
    f: {
      tr: [
        'Teknik direktör {manager} maçın ardından memnundu: «Böyle oynamaya devam ederse sınır yok.»',
        'Tribünler {first:gen} adını maç bittikten sonra da uzun süre haykırdı; soyunma odasında alkışlarla karşılandı.',
        '{first}, karma bölgeden koşar adım geçerken taraftarların tezahüratıyla uğurlandı.',
      ],
      en: [
        'Manager {manager} was glowing afterwards: “If he keeps playing like this, there is no ceiling.”',
        'The stands sang {first:gen} name long after the final whistle and the dressing room greeted him with applause.',
        '{first} hurried through the mixed zone, serenaded by the supporters all the way.',
      ],
    },
  },
  match_star_draw: {
    group: 'good',
    h: {
      tr: [
        '{player} çırpındı, {club} {opp:abl} {score} berabere kaldı',
        'Puan {player:gen} sayesinde: {opp} karşısında {score}',
        '{player} elinden geleni yaptı, maç {score} bitti',
        '{player} parladı ama {opp} puanı kopardı: {score}',
      ],
      en: [
        '{player} battles, {club} held {score} by {opp}',
        'A point thanks to {player}: {score} against {opp}',
        '{player} gives everything, game ends {score}',
        '{player} shines but {opp} hang on for {score}',
      ],
    },
    f: {
      tr: [
        '{manager} beraberlikten çok memnun değil ama {first:gen} performansını ayrıca övdü.',
        'Taraftar, genç oyuncuya alkış tutarken ekibin geri kalanına biraz sitem etti.',
      ],
      en: [
        '{manager} was not thrilled with the draw but singled out {first:gen} display for praise.',
        'The fans applauded the youngster while grumbling a little at the rest of the team.',
      ],
    },
  },
  match_star_loss: {
    group: 'good',
    h: {
      tr: [
        '{player} yıldızlaştı ama {club} {opp:abl} {score} yenildi',
        'Boşuna parladı: {player} oynadı, {opp} kazandı ({score})',
        '{opp} üç puanı aldı, {player} ise takdiri: {score}',
      ],
      en: [
        '{player} stars in defeat as {club} lose {score} to {opp}',
        'Shone in vain: {player} impresses but {opp} win {score}',
        '{opp} take the points, {player} takes the praise: {score}',
      ],
    },
    f: {
      tr: [
        'Yenilgi sonrası yalnız başına soyunma odasına yürüyen {first}, tribünlerden tek tek alkış topladı.',
        '{pundit}: «Böyle bir performansın mağlubiyetle bitmesi futbolun adaletsiz yanı.»',
      ],
      en: [
        '{first} trudged off alone after the defeat, collecting applause from the stands one section at a time.',
        '{pundit}: “A display like that ending in defeat shows football\'s cruel side.”',
      ],
    },
  },
  match_win: {
    group: 'good',
    h: {
      tr: [
        '{club}, {opp:acc} {score} yendi',
        '{club} evinde güldü: {opp} karşısında {score}',
        'Üç puan {club:gen}: {opp:abl} {score} galibiyet',
        '{club} kazandı, {first} da yerini korudu: {score}',
      ],
      en: [
        '{club} beat {opp} {score}',
        '{club} grind out a {score} win over {opp}',
        'Three points for {club}: {score} against {opp}',
        '{club} win it, {first} does his bit: {score}',
      ],
    },
    f: {
      tr: [
        'Kazanılan puanlar {club:gen} tablodaki iddiasını sürdürdü. {manager:gen} yüzü bu hafta gülüyor.',
        '{first}, maç sonunda «Önemli olan takımın kazanması» diyerek mütevazı konuştu.',
      ],
      en: [
        'The points keep {club:gen} season ticking along. {manager} will sleep well this week.',
        '{first} kept it modest afterwards: “The main thing is that the team won.”',
      ],
    },
  },
  match_draw: {
    group: 'none',
    h: {
      tr: [
        '{club} ile {opp} puanları paylaştı: {score}',
        '{club}, {opp:abl} {score} berabere kaldı',
        'Kazanan çıkmadı: {club} {opp} {score}',
      ],
      en: [
        '{club} and {opp} share the spoils: {score}',
        '{club} held {score} by {opp}',
        'No winner: {club} {score} {opp}',
      ],
    },
    f: {
      tr: [
        '{manager} sonuç için «Kabul edilebilir ama daha fazlasını istiyorduk» dedi.',
        'Taraftarlar tribünden karışık duygularla ayrıldı; kimi alkışladı, kimi ıslıkladı.',
      ],
      en: [
        '{manager} called it “acceptable, but we wanted more.”',
        'Supporters left with mixed feelings, some applauding and some whistling.',
      ],
    },
  },
  match_loss: {
    group: 'bad',
    h: {
      tr: [
        '{club}, {opp:abl} {score} yenildi',
        'Ağır darbe! {club} {opp} karşısında {score} kaybetti',
        '{opp} üç puanı aldı, {club} yaralı: {score}',
        'Moraller bozuk: {club:gen} {opp:abl} aldığı yenilgi',
      ],
      en: [
        '{club} lose {score} to {opp}',
        'Heavy blow! {club} go down {score} against {opp}',
        '{opp} take the points, {club} left hurting: {score}',
        'Gloom at {club} after {score} defeat to {opp}',
      ],
    },
    f: {
      tr: [
        'Taraftar maç sonunda sessizliğe gömüldü. {manager} «Hatalarımızı konuşacağız» dedi.',
        'Soyunma odasında uzun bir toplantı yapıldığı, ağır sözlerin havada uçuştuğu konuşuluyor.',
      ],
      en: [
        'The terraces fell silent at the whistle. {manager} promised: “We will talk about our mistakes.”',
        'A long meeting in the dressing room is rumoured, with some harsh words in the air.',
      ],
    },
  },
  match_bench: {
    group: 'none',
    h: {
      tr: [
        '{player} bu kez kulübeden izledi: {club} {opp} maçı {score}',
        '{player:gen} adı kadroda yoktu, {club} sahadan {score} ile ayrıldı',
        'Kulübede bekleyen {player}: {club} {opp} karşısında {score}',
      ],
      en: [
        '{player} watched from the sidelines as {club} and {opp} finished {score}',
        'No place for {player} as {club} finish {score} against {opp}',
        'On the bench: {player} sits out {club} {score} {opp}',
      ],
    },
    f: {
      tr: [
        'Genç oyuncunun neden oynamadığı soruldu; {manager} «Rotasyon, sabır ve doğru zaman» yanıtını verdi.',
        '{first:gen} menajeri {agent}, süreyi yakından takip ettiğini söyledi.',
      ],
      en: [
        'Asked why the youngster did not play, {manager} answered with “rotation, patience and the right moment.”',
        '{first:gen} agent {agent} said he is following the situation closely.',
      ],
    },
  },
  derby_hype: {
    group: 'story',
    h: {
      tr: [
        'Derbi heyecanı şehri sardı: gözler {player} üzerinde!',
        'Derbiye saatler kala kentte tek konu var: {player}',
        'Derbi haftası: {opp} karşısında {player} fırtınası beklentisi',
      ],
      en: [
        'Derby fever grips the city: all eyes on {player}!',
        'Hours before the derby there is only one topic in town: {player}',
        'Derby week: the {opp} showdown, and a {player} shaped storm',
      ],
    },
    f: {
      tr: [
        'Kahvehanelerde, berber koltuklarında, otobüs duraklarında herkesin tahmini hazır. {pundit} «Derbiyi küçük detaylar kazanır» diyor.',
        'Kombine biletler karaborsaya düştü, stadyum çevresinde bayraklar ve flamalar satan tezgâhlar kuruldu.',
      ],
      en: [
        'In cafés, barber chairs and bus stops everyone has a prediction ready. {pundit} says: “Derbies are won by small details.”',
        'Tickets have vanished to touts and stalls selling flags and scarves have sprung up around the ground.',
      ],
    },
  },
};
