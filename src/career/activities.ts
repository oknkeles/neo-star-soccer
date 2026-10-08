/**
 * Weekly lifestyle activities (3 actions per week): rest, social life, family, media,
 * nightlife, charity, extra training and romance. Traits and owned items bend both the
 * rewards and the risks.
 */
import type { AttrKey, Effects, GameState, Localized, Person, RelKey } from '../core/types';
import type { Rng } from '../core/rng';
import { getLang, t } from '../core/i18n';
import { clamp, formatMoney, nextId } from '../core/util';
import type { ActivityDef } from './model';
import { getFlagNum, hasTrait, loc, niceMoney, nowIndex, userPlayer } from './helpers';
import { applyEffects } from './effects';
import { TRAINING_FOCUSES, markActivity } from './progression';
import { ownsItem } from './shop';
import { injuryName } from './injuries';


export const ACTIVITIES: ActivityDef[] = [
  // ── rest ──
  {
    id: 'rest_home', category: 'rest', icon: 'bed', energy: -26, cost: 0,
    name: { tr: 'Evde Tam Dinlenme', en: 'Full Rest Day at Home' },
    desc: { tr: 'Telefon sessizde, perdeler kapalı. On iki saat uyku ve bol su.', en: 'Phone on silent, curtains drawn. Twelve hours of sleep and plenty of water.' },
    effects: { morale: 1 },
  },
  {
    id: 'rest_hamam', category: 'rest', icon: 'heart_pulse', energy: -22, cost: 150,
    name: { tr: 'Tarihi Hamamda Kese ve Köpük', en: 'Scrub & Foam at a Historic Hamam' },
    desc: { tr: 'Göbek taşında terle, natır kesesiyle yenilen. Kasların yağ gibi olur.', en: 'Sweat it out on the heated marble, get scrubbed down. Your muscles melt.' },
    effects: { morale: 2 },
  },
  {
    id: 'rest_spa', category: 'rest', icon: 'sparkles', energy: -30, cost: 1_200, minFame: 10,
    name: { tr: 'Lüks Spa ve Spor Masajı', en: 'Luxury Spa & Sports Massage' },
    desc: { tr: 'Derin doku masajı, tuz odası, buz havuzu. Pazartesi yeni doğmuş gibisin.', en: 'Deep-tissue massage, salt room, ice plunge. You feel reborn by Monday.' },
    effects: { morale: 2, form: 1 },
  },
  // ── social ──
  {
    id: 'social_mangal', category: 'social', icon: 'flame', energy: 5, cost: 600,
    name: { tr: 'Takım Arkadaşlarına Mangal', en: 'Barbecue for Your Teammates' },
    desc: { tr: 'Bahçede mangal, közde biber, sonunda çay. Soyunma odası böyle kaynaşır.', en: 'Grill in the garden, charred peppers, tea to finish. This is how a dressing room bonds.' },
    effects: { rel: { teammates: 5 }, morale: 2 },
  },
  {
    id: 'social_kahvehane', category: 'social', icon: 'coffee', energy: 3, cost: 20,
    name: { tr: 'Mahalle Kahvesinde Tavla', en: 'Backgammon at the Neighbourhood Café' },
    desc: { tr: 'Eski mahallende amcalarla tavla. "Mars oldun evlat!" diye gülüyorlar.', en: 'Backgammon with the old-timers back home. They roar with laughter when you lose.' },
    effects: { rel: { fans: 3 }, morale: 3, followers: 400 },
    risk: { chance: 0.25, effects: { followers: 12_000, rel: { fans: 3 }, fame: 0.3 }, text: { tr: 'Biri gizlice video çekti, "yıldızın alçakgönüllülüğü" diye viral oldu!', en: 'Someone filmed you on the sly — it went viral as "the humble superstar"!' } },
  },
  {
    id: 'social_fans', category: 'social', icon: 'users', energy: 6, cost: 0,
    name: { tr: 'Taraftar Derneğini Ziyaret Et', en: 'Visit a Supporters\' Club' },
    desc: { tr: 'Forma imzala, fotoğraf çektir, tribün bestelerini dinle.', en: 'Sign shirts, pose for photos, listen to the terrace songs.' },
    effects: { rel: { fans: 6 }, fame: 0.3, followers: 1_500 },
  },
  {
    id: 'social_mentor', category: 'social', icon: 'graduation', energy: 3, cost: 0,
    name: { tr: 'Ağabeyinle Çay Sohbeti', en: 'Tea with Your Mentor' },
    desc: { tr: 'Takımın tecrübelisi anlatıyor: hakem psikolojisi, beden dili, kamp hayatı.', en: 'The dressing-room veteran talks referees, body language and life on the road.' },
    effects: { xp: { composure: 6, positioning: 5, vision: 4 }, rel: { teammates: 2 }, morale: 1 },
  },
  {
    id: 'social_paragliding', category: 'social', icon: 'wind', energy: 10, cost: 1_500,
    name: { tr: 'Ölüdeniz\'de Yamaç Paraşütü', en: 'Paragliding over Ölüdeniz' },
    desc: { tr: 'Babadağ\'dan atla, turkuaz lagünün üstünde süzül. Adrenalin tavan.', en: 'Leap off the mountain and glide over the turquoise lagoon. Pure adrenaline.' },
    effects: { morale: 6, followers: 6_000 },
    risk: { chance: 0.1, effects: { injuryWeeks: 3, rel: { manager: -7, media: -2 } }, text: { tr: 'Sert bir iniş! Ayak bileğin burkuldu ve hocan çılgına döndü.', en: 'A hard landing! You twisted your ankle and the manager is livid.' } },
  },
  // ── family ──
  {
    id: 'family_breakfast', category: 'family', icon: 'utensils', energy: -6, cost: 100,
    name: { tr: 'Ailecek Pazar Kahvaltısı', en: 'Sunday Family Breakfast' },
    desc: { tr: 'Menemen, sucuk, simit, annenin reçelleri. Babanın maç yorumları da cabası.', en: 'Eggs, spicy sausage, fresh bread and mum\'s jams — plus dad\'s match analysis.' },
    effects: { rel: { family: 6 }, morale: 3 },
  },
  {
    id: 'family_hometown', category: 'family', icon: 'house', energy: 8, cost: 1_500,
    name: { tr: 'Memlekete Ziyaret', en: 'Trip Back Home' },
    desc: { tr: 'Doğduğun sokakta top oynayan çocuklar seni görünce donakalıyor.', en: 'Kids playing on your old street freeze when they see you.' },
    effects: { rel: { family: 10, fans: 2 }, morale: 4, followers: 2_000 },
  },
  {
    id: 'family_gift', category: 'family', icon: 'gift', energy: 1, cost: 6_000,
    name: { tr: 'Ailene Sürpriz Hediye', en: 'Surprise Gift for Your Family' },
    desc: { tr: 'Babana yeni bir koltuk, annene bir İtalya turu, kardeşine yepyeni kramponlar.', en: 'A new armchair for dad, a holiday for mum, boots for your sibling.' },
    effects: { rel: { family: 9 }, morale: 2 },
  },
  // ── media ──
  {
    id: 'media_tvshow', category: 'media', icon: 'tv', energy: 5, cost: 0, minFame: 8,
    name: { tr: 'Spor Programına Konuk Ol', en: 'Guest on a TV Football Show' },
    desc: { tr: 'Gece yarısı tartışma programı: yorumcular, VAR pozisyonları, sıcak sorular.', en: 'Late-night panel show: pundits, VAR replays and spicy questions.' },
    effects: { rel: { media: 5 }, fame: 0.6, followers: 4_000 },
    risk: { chance: 0.14, effects: { rel: { manager: -6, media: -2 }, morale: -2 }, text: { tr: 'Ağzından kaçan bir söz ertesi sabah manşetteydi: "Hocayla aram limoni!"', en: 'A slip of the tongue made the morning headlines: "Me and the gaffer? Frosty."' } },
  },
  {
    id: 'media_content', category: 'media', icon: 'smartphone', energy: 3, cost: 0,
    name: { tr: 'Sosyal Medya İçeriği Çek', en: 'Shoot Social Media Content' },
    desc: { tr: 'Antrenman vlogu, frikik challenge\'ı, kulis görüntüleri.', en: 'Training vlog, free-kick challenge, behind-the-scenes clips.' },
    effects: { fame: 0.3, followers: 6_000, rel: { sponsors: 1, fans: 1 } },
    risk: { chance: 0.08, effects: { rel: { fans: -4, media: -2 }, followers: -3_000 }, text: { tr: 'Yanlış anlaşılan bir paylaşım linç kampanyasına dönüştü.', en: 'A misread post turned into a pile-on.' } },
  },
  {
    id: 'media_commercial', category: 'media', icon: 'film', energy: 10, cost: 0, minFame: 15,
    name: { tr: 'Reklam Filmi Çekimi', en: 'Shoot a TV Commercial' },
    desc: { tr: 'Bir gün boyunca ışıklar, kostümler ve 40 tekrar. Karşılığında dolgun bir çek.', en: 'A whole day of lights, costumes and forty takes — for a fat cheque.' },
    effects: { rel: { sponsors: 4 }, fame: 0.4, followers: 8_000 },
  },
  {
    id: 'media_podcast', category: 'media', icon: 'mic', energy: 4, cost: 0, minFame: 20,
    name: { tr: 'Popüler Podcast\'e Konuk Ol', en: 'Guest on a Popular Podcast' },
    desc: { tr: 'Üç saatlik samimi sohbet: çocukluğun, hayallerin, ilk kramponun.', en: 'Three hours of honest talk: childhood, dreams, your first pair of boots.' },
    effects: { rel: { media: 4, fans: 3 }, fame: 0.5, followers: 10_000 },
  },
  // ── nightlife ──
  {
    id: 'night_meyhane', category: 'nightlife', icon: 'wine', energy: 8, cost: 800,
    name: { tr: 'Boğaz\'da Meyhane Gecesi', en: 'Meyhane Night on the Bosphorus' },
    desc: { tr: 'Mezeler, fasıl, köprünün ışıkları. Takım arkadaşlarınla unutulmaz bir gece.', en: 'Meze, live fasıl music, the bridge lights. A night to remember with the lads.' },
    effects: { morale: 5, rel: { teammates: 3 } },
    risk: { chance: 0.08, effects: { rel: { media: -3, manager: -3 }, fame: 0.2 }, text: { tr: 'Paparazziler kapıdaydı. "Maç öncesi rakı sofrası" manşeti hocayı kızdırdı.', en: 'Paparazzi at the door. The "pre-match boozy dinner" headline annoyed the manager.' } },
  },
  {
    id: 'night_club', category: 'nightlife', icon: 'party', energy: 15, cost: 2_500,
    name: { tr: 'Gece Kulübünde Parti', en: 'Party at a Nightclub' },
    desc: { tr: 'VIP loca, DJ, sabaha kadar dans. Pazartesi antrenmanı biraz zor geçebilir.', en: 'VIP booth, a big-name DJ, dancing till dawn. Monday training might hurt.' },
    effects: { morale: 7, rel: { teammates: 1 }, form: -2 },
    risk: { chance: 0.16, effects: { rel: { media: -7, manager: -7, fans: -4 }, morale: -4, fame: 0.4 }, text: { tr: 'Sabaha karşı çekilen fotoğraflar her yerde: "Yıldız oyuncunun gece mesaisi!"', en: 'Photos from 4 a.m. are everywhere: "Star\'s late-night shift!"' } },
  },
  {
    id: 'night_vip', category: 'nightlife', icon: 'crown', energy: 14, cost: 8_000, minFame: 35,
    name: { tr: 'Ünlülerin VIP Partisi', en: 'Celebrity VIP Party' },
    desc: { tr: 'Oyuncular, şarkıcılar, modacılar. Herkes seninle fotoğraf çekilmek istiyor.', en: 'Actors, pop stars, designers — everyone wants a selfie with you.' },
    effects: { morale: 5, fame: 1, followers: 25_000, rel: { sponsors: 2 } },
    risk: { chance: 0.2, effects: { rel: { media: -8, manager: -6, family: -4 }, morale: -5, fame: 0.5 }, text: { tr: 'Magazin programları günlerce seni konuştu. Ailen bile aradı.', en: 'The gossip shows talked about nothing else for days. Even your family called.' } },
  },
  // ── charity ──
  {
    id: 'charity_hospital', category: 'charity', icon: 'hand_heart', energy: 6, cost: 0,
    name: { tr: 'Çocuk Hastanesi Ziyareti', en: 'Children\'s Hospital Visit' },
    desc: { tr: 'Lösemili çocuklarla top sektir, forma dağıt. Gözlerindeki ışık her şeye değer.', en: 'Juggle with young patients and hand out shirts. The light in their eyes is worth everything.' },
    effects: { rel: { fans: 4, media: 3 }, fame: 0.4, morale: 3 },
  },
  {
    id: 'charity_village', category: 'charity', icon: 'gift', energy: 5, cost: 12_000,
    name: { tr: 'Köy Okuluna Futbol Malzemesi', en: 'Football Kit for a Village School' },
    desc: { tr: 'Anadolu\'nun bir köyüne top, krampon, kale filesi. Öğretmen ağlayarak teşekkür etti.', en: 'Balls, boots and goal nets for a remote village school. The teacher thanked you in tears.' },
    effects: { rel: { fans: 6, media: 4 }, fame: 0.8, morale: 3, followers: 5_000 },
  },
  {
    id: 'charity_gala', category: 'charity', icon: 'hand_coins', energy: 8, cost: 60_000, minFame: 40,
    name: { tr: 'Vakfın İçin Yardım Galası', en: 'Gala for Your Foundation' },
    desc: { tr: 'Kendi vakfının yıllık galası: müzayede, konser ve bir okul daha.', en: 'Your foundation\'s annual gala: auction, concert — and one more school built.' },
    effects: { rel: { fans: 8, media: 6, sponsors: 4 }, fame: 2, morale: 4, followers: 40_000 },
  },
  // ── training ──
  {
    id: 'train_extra', category: 'training', icon: 'dumbbell', energy: 12, cost: 0,
    name: { tr: 'Ekstra Bireysel Antrenman', en: 'Extra Individual Session' },
    desc: { tr: 'Herkes gittikten sonra sahada sen ve toplar. Antrenman odağına göre çalışırsın.', en: 'Everyone has gone home; just you and a bag of balls. Works on your training focus.' },
    effects: { rel: { manager: 1 } },
  },
  {
    id: 'train_freekicks', category: 'training', icon: 'target', energy: 8, cost: 0,
    name: { tr: 'Antrenman Sonrası 100 Frikik', en: '100 Free Kicks After Training' },
    desc: { tr: 'Mankenlerden baraj, doksana asılı lastik. Falso bir sanattır.', en: 'Mannequin wall, a tyre hanging in the top corner. Curl is an art.' },
    effects: { xp: { curl: 9, shooting: 4 } },
  },
  {
    id: 'train_video', category: 'training', icon: 'laptop', energy: 3, cost: 0,
    name: { tr: 'Rakip Video Analizi', en: 'Opposition Video Analysis' },
    desc: { tr: 'Gelecek rakibin bek oyuncusu hep içe kat ediyor. Not alındı.', en: 'Next week\'s full-back always cuts inside. Noted.' },
    effects: { xp: { vision: 5, positioning: 5, composure: 3 }, rel: { manager: 1 } },
  },
  {
    id: 'train_yoga', category: 'training', icon: 'activity', energy: -6, cost: 200,
    name: { tr: 'Yoga ve Esneklik', en: 'Yoga & Mobility' },
    desc: { tr: 'Nefes, denge, esneklik. Sakatlıklara karşı en sessiz sigorta.', en: 'Breath, balance, flexibility. The quietest insurance against injury.' },
    effects: { xp: { stamina: 3, composure: 3 }, morale: 1 },
  },
  // ── romance ──
  {
    id: 'romance_meet', category: 'romance', icon: 'heart', energy: 6, cost: 300,
    name: { tr: 'Biriyle Tanışmaya Çık', en: 'Go Out and Meet Someone' },
    desc: { tr: 'Arkadaşının doğum günü, bir sanat galerisi açılışı, belki de kader.', en: 'A friend\'s birthday, a gallery opening — maybe fate.' },
    effects: { morale: 1 },
  },
  {
    id: 'romance_dinner', category: 'romance', icon: 'utensils', energy: 4, cost: 600,
    name: { tr: 'Romantik Akşam Yemeği', en: 'Romantic Dinner' },
    desc: { tr: 'Deniz kenarında mum ışığı, telefonlar kapalı. Sadece ikiniz.', en: 'Candlelight by the sea, phones off. Just the two of you.' },
    effects: { rel: { partner: 8 }, morale: 3 },
  },
  {
    id: 'romance_balloon', category: 'romance', icon: 'wind', energy: 8, cost: 7_500, minFame: 5,
    name: { tr: 'Kapadokya Balon Turu Kaçamağı', en: 'Cappadocia Balloon Getaway' },
    desc: { tr: 'Gün doğarken peri bacalarının üstünde, mağara otelde iki gece.', en: 'Sunrise over the fairy chimneys, two nights in a cave hotel.' },
    effects: { rel: { partner: 14 }, morale: 5, followers: 9_000 },
  },
  {
    id: 'romance_propose', category: 'romance', icon: 'gem', energy: 6, cost: 30_000,
    name: { tr: 'Evlilik Teklifi Et', en: 'Propose' },
    desc: { tr: 'Yüzük cebinde, kalbin ağzında. Diz çökme zamanı.', en: 'The ring in your pocket, your heart in your mouth. Time to kneel.' },
    effects: {},
  },
];

/** Result line shown after doing an activity. */
const RESULT: Record<string, Localized> = {
  rest_home: { tr: 'Güzel bir uyku çektin; pilin doldu.', en: 'A deep sleep — batteries recharged.' },
  rest_hamam: { tr: 'Hamamdan tüy gibi çıktın.', en: 'You walked out of the hamam light as a feather.' },
  rest_spa: { tr: 'Vücudun teşekkür ediyor; bacakların taze.', en: 'Your body thanks you; your legs feel fresh.' },
  social_mangal: { tr: 'Mangal başında kurulan dostluklar sahaya yansıyacak.', en: 'Friendships forged at the grill will show on the pitch.' },
  social_kahvehane: { tr: 'Tavlada yenildin ama mahallenin gönlünü kazandın.', en: 'You lost at backgammon but won the neighbourhood over.' },
  social_fans: { tr: 'Taraftarlar adını tezahürat yaptı; tüylerin diken diken.', en: 'The supporters chanted your name — goosebumps.' },
  social_mentor: { tr: 'Ağabeyinin tecrübeleri kafanda yeni kapılar açtı.', en: 'Your mentor\'s stories opened new doors in your head.' },
  social_paragliding: { tr: 'Gökyüzünde özgürdün; inişte yüzünde kocaman bir gülümseme vardı.', en: 'Free in the sky — you landed grinning ear to ear.' },
  family_breakfast: { tr: 'Annen "biraz daha ye" demekten yorulmadı.', en: 'Your mum never tired of saying "have a bit more".' },
  family_hometown: { tr: 'Memleket havası bambaşka; kökünü hatırladın.', en: 'The air back home is different — you remembered your roots.' },
  family_gift: { tr: 'Ailenin mutluluğu paha biçilemez.', en: 'Your family\'s joy is priceless.' },
  media_tvshow: { tr: 'Stüdyoda esprilerinle döktürdün; sosyal medya seni konuşuyor.', en: 'You were sharp and funny in the studio; social media is buzzing.' },
  media_content: { tr: 'Videon milyonlarca kez izlendi.', en: 'Your video racked up millions of views.' },
  media_commercial: { tr: 'Çekim bitti, çek hesabına yattı: {money}.', en: 'Wrapped! The cheque has cleared: {money}.' },
  media_podcast: { tr: 'Samimiyetin herkesi etkiledi; klipler her yerde.', en: 'Your honesty moved people; the clips are everywhere.' },
  night_meyhane: { tr: 'Fasıl, kahkaha, dostluk. Unutulmaz bir gece.', en: 'Music, laughter, brotherhood. An unforgettable night.' },
  night_club: { tr: 'Sabaha kadar dans ettin; enerjin bitik ama moralin tavan.', en: 'You danced till dawn — drained, but buzzing.' },
  night_vip: { tr: 'Ünlülerle omuz omuza; adın magazin sayfalarında.', en: 'Shoulder to shoulder with the stars; your name is in the gossip columns.' },
  charity_hospital: { tr: 'Çocukların gülümsemesi aklından çıkmıyor.', en: 'You cannot stop thinking about the children\'s smiles.' },
  charity_village: { tr: 'Köy okulunun bahçesinde ilk maç senin topunla oynandı.', en: 'The first match in the schoolyard was played with your ball.' },
  charity_gala: { tr: 'Gala büyük ses getirdi; vakfın yeni bir okul açıyor.', en: 'The gala made headlines; your foundation is opening another school.' },
  train_extra: { tr: 'Işıklar söndüğünde hâlâ sahadaydın.', en: 'You were still out there when the floodlights went off.' },
  train_freekicks: { tr: 'Son on frikikin yedisi doksandan girdi.', en: 'Seven of your last ten free kicks went top corner.' },
  train_video: { tr: 'Rakibi ezbere biliyorsun artık.', en: 'You know the opposition by heart now.' },
  train_yoga: { tr: 'Esnek, dengeli, sakin. Vücudun hafiflemiş.', en: 'Supple, balanced, calm. Your body feels lighter.' },
  romance_meet: { tr: '', en: '' },
  romance_dinner: { tr: 'Gecenin sonunda el ele yürüdünüz.', en: 'You walked home hand in hand.' },
  romance_balloon: { tr: 'Gökyüzünde, bulutların arasında… Bu anı hiç unutmayacaksınız.', en: 'Up among the clouds… a moment you will never forget.' },
  romance_propose: { tr: '', en: '' },
};

/** Minimum weeks between two uses of the same activity. */
const COOLDOWN: Record<string, number> = {
  media_commercial: 4, charity_gala: 10, family_gift: 3, night_vip: 2, social_paragliding: 3, romance_balloon: 4, romance_propose: 6,
};

const cooldownFlag = (id: string) => `career.act.${id}`;

export function activityDef(id: string): ActivityDef | undefined {
  return ACTIVITIES.find((a) => a.id === id);
}

/** Display text for the result of an activity (localized). */
export function activityResultText(id: string, params?: Record<string, string | number>): string {
  const r = RESULT[id];
  return r ? loc(r, getLang(), params) : '';
}

function mentorAvailable(state: GameState): boolean {
  const c = state.career;
  if (!c.mentorId) return false;
  const m = state.world.players[c.mentorId];
  const p = userPlayer(state);
  return !!m && !m.retired && !!p.clubId && m.clubId === p.clubId;
}

function partnerOf(state: GameState): Person | undefined {
  const c = state.career;
  return c.partnerId ? c.people.find((x) => x.id === c.partnerId) : undefined;
}

export function canDoActivity(state: GameState, id: string): { ok: boolean; reason?: string } {
  const def = activityDef(id);
  const c = state.career;
  if (!def) return { ok: false, reason: t('career.act.unknown') };
  if (c.retired) return { ok: false, reason: t('career.act.retired') };
  if (c.actionsLeft <= 0) return { ok: false, reason: t('career.act.noActions') };
  const p = userPlayer(state);
  if (def.minFame && c.fame < def.minFame) return { ok: false, reason: t('career.act.fame', { n: def.minFame }) };
  if (def.energy > 0 && c.energy < def.energy) return { ok: false, reason: t('career.act.energy') };
  if (def.cost > 0 && c.money < def.cost) return { ok: false, reason: t('career.act.money', { price: formatMoney(def.cost, getLang()) }) };
  if (p.injury && ((def.category === 'training' && id !== 'train_video') || id === 'social_paragliding' || id === 'night_club')) {
    return { ok: false, reason: t('career.act.injured') };
  }
  if ((id === 'social_mangal' || id === 'social_fans') && !p.clubId) return { ok: false, reason: t('career.act.noClub') };
  if (id === 'social_mentor' && !mentorAvailable(state)) return { ok: false, reason: t('career.act.noMentor') };
  if (id === 'romance_meet' && c.partnerId) return { ok: false, reason: t('career.act.hasPartner') };
  if ((id === 'romance_dinner' || id === 'romance_balloon' || id === 'romance_propose') && !c.partnerId) {
    return { ok: false, reason: t('career.act.needPartner') };
  }
  if (id === 'romance_propose') {
    if (state.flags['career.married']) return { ok: false, reason: t('career.act.married') };
    if (c.relationships.partner < 75) return { ok: false, reason: t('career.act.relTooLow', { name: partnerOf(state)?.name ?? '' }) };
  }
  const cd = COOLDOWN[id];
  if (cd) {
    const last = state.flags[cooldownFlag(id)];
    if (typeof last === 'number' && nowIndex(state) - last < cd) {
      return { ok: false, reason: t('career.act.cooldown', { n: cd - (nowIndex(state) - last) }) };
    }
  }
  return { ok: true };
}

// ───────── partner generation ─────────

const PARTNER_FIRST: Record<'tr' | 'intl', string[]> = {
  tr: ['Elif', 'Defne', 'Zeynep', 'Selin', 'Ece', 'Melis', 'Derin', 'Nehir', 'Ada', 'Lara', 'Ceren', 'İpek', 'Su', 'Asya', 'Deniz', 'Mert', 'Kerem', 'Arda'],
  intl: ['Chiara', 'Inès', 'Lena', 'Sofia', 'Maëlle', 'Julia', 'Noor', 'Valentina', 'Elena', 'Marta', 'Freya', 'Lucía', 'Alex', 'Sam', 'Mila', 'Clara'],
};
const PARTNER_LAST: Record<'tr' | 'intl', string[]> = {
  tr: ['Aksoy', 'Kaya', 'Erdem', 'Tuna', 'Sezer', 'Uçar', 'Karaca', 'Ateş', 'Bilgin', 'Duman', 'Ergün', 'Yalın'],
  intl: ['Moreau', 'Rossi', 'Varga', 'Lindqvist', 'Navarro', 'Duarte', 'Brandt', 'Vos', 'Keller', 'Ricci', 'Lambert', 'Silva'],
};
const PARTNER_JOBS: Localized[] = [
  { tr: 'mimar', en: 'an architect' }, { tr: 'çocuk doktoru', en: 'a paediatrician' }, { tr: 'şarkıcı', en: 'a singer' },
  { tr: 'tiyatro oyuncusu', en: 'a stage actor' }, { tr: 'şef', en: 'a chef' }, { tr: 'spor muhabiri', en: 'a sports reporter' },
  { tr: 'yazılım mühendisi', en: 'a software engineer' }, { tr: 'fotoğrafçı', en: 'a photographer' }, { tr: 'moda tasarımcısı', en: 'a fashion designer' },
  { tr: 'avukat', en: 'a lawyer' }, { tr: 'voleybolcu', en: 'a volleyball player' }, { tr: 'deniz biyoloğu', en: 'a marine biologist' },
];
const PARTNER_PLACES: Localized[] = [
  { tr: 'bir sanat galerisi açılışında', en: 'an art gallery opening' }, { tr: 'bir arkadaşının doğum gününde', en: "a friend's birthday party" },
  { tr: 'Moda sahilindeki bir kafede', en: 'a seaside café' }, { tr: 'bir yardım gecesinde', en: 'a charity dinner' },
  { tr: 'havalimanında rötar beklerken', en: 'the airport during a flight delay' }, { tr: 'bir kitapçının şiir dinletisinde', en: 'a bookshop poetry night' },
];
const PARTNER_PERSONALITY: Localized[] = [
  { tr: 'neşeli, maceracı', en: 'cheerful, adventurous' }, { tr: 'sakin, zeki', en: 'calm, clever' },
  { tr: 'tutkulu, hırslı', en: 'passionate, ambitious' }, { tr: 'esprili, dobra', en: 'witty, outspoken' },
  { tr: 'romantik, sanatçı ruhlu', en: 'romantic, artistic' },
];

function createPartner(state: GameState, rng: Rng): Person {
  const lang = state.lang;
  const p = userPlayer(state);
  const pool: 'tr' | 'intl' = p.nation === 'TUR' ? (rng.chance(0.8) ? 'tr' : 'intl') : rng.chance(0.25) ? 'tr' : 'intl';
  const name = `${rng.pick(PARTNER_FIRST[pool])} ${rng.pick(PARTNER_LAST[pool])}`;
  const job = rng.pick(PARTNER_JOBS)[lang];
  const place = rng.pick(PARTNER_PLACES)[lang];
  const person: Person = {
    id: nextId(state, 'PER'),
    name,
    role: 'partner',
    personality: rng.pick(PARTNER_PERSONALITY)[lang],
    bio: t('career.act.partnerBio', { name, job, place }, lang),
    relationship: 55,
  };
  return person;
}

// ───────── doing things ─────────

function scaleRel(e: Effects, key: RelKey, m: number): void {
  if (e.rel && e.rel[key] !== undefined && (e.rel[key] ?? 0) > 0) e.rel[key] = (e.rel[key] ?? 0) * m;
}

/** Trait & lifestyle twists on the base rewards. */
function personalise(state: GameState, def: ActivityDef, base: Effects): Effects {
  const p = userPlayer(state);
  const e: Effects = { ...base, rel: base.rel ? { ...base.rel } : undefined, xp: base.xp ? { ...base.xp } : undefined };
  const boost = (k: 'morale' | 'followers' | 'fame', m: number) => { if ((e[k] ?? 0) > 0) e[k] = (e[k] ?? 0) * m; };
  switch (def.category) {
    case 'family':
      if (hasTrait(p, 'family_first')) { scaleRel(e, 'family', 1.5); boost('morale', 1.5); }
      break;
    case 'nightlife':
      if (hasTrait(p, 'party_animal')) boost('morale', 1.6);
      break;
    case 'media':
      if (hasTrait(p, 'media_darling')) { scaleRel(e, 'media', 1.4); boost('followers', 1.3); }
      if (hasTrait(p, 'showman')) boost('followers', 1.2);
      break;
    case 'social':
      if (hasTrait(p, 'leader')) scaleRel(e, 'teammates', 1.35);
      if (hasTrait(p, 'fan_favourite')) scaleRel(e, 'fans', 1.25);
      break;
    case 'charity':
      if (hasTrait(p, 'fan_favourite')) scaleRel(e, 'fans', 1.25);
      if (hasTrait(p, 'media_darling')) scaleRel(e, 'media', 1.2);
      break;
    case 'training':
      if (e.xp && hasTrait(p, 'workaholic')) for (const k of Object.keys(e.xp) as AttrKey[]) e.xp[k] = (e.xp[k] ?? 0) * 1.3;
      if (def.id === 'train_freekicks' && e.xp && hasTrait(p, 'set_piece_specialist')) e.xp.curl = (e.xp.curl ?? 0) * 1.4;
      break;
    default:
      break;
  }
  return e;
}

function riskChance(state: GameState, def: ActivityDef): number {
  if (!def.risk) return 0;
  const p = userPlayer(state);
  let ch = def.risk.chance;
  const injuryRisk = (def.risk.effects.injuryWeeks ?? 0) > 0;
  if (injuryRisk) {
    if (hasTrait(p, 'glass_bones')) ch *= 1.6;
    if (hasTrait(p, 'iron_man')) ch *= 0.5;
  } else if (def.category === 'nightlife' || def.category === 'media') {
    if (def.category === 'nightlife' && hasTrait(p, 'party_animal')) ch *= 2;
    if (hasTrait(p, 'hothead')) ch *= 1.35;
    if (hasTrait(p, 'calm')) ch *= 0.75;
    if (def.category === 'media' && hasTrait(p, 'media_darling')) ch *= 0.6;
    if (ownsItem(state, 's_bodyguard') && def.category === 'nightlife') ch *= 0.5;
    if (ownsItem(state, 's_pr')) ch *= 0.7;
  }
  return clamp(ch, 0, 0.6);
}

/** Spend one weekly action. Returns localized result text + notes. */
export function doActivity(state: GameState, rng: Rng, id: string): { ok: boolean; text: string; notes: string[] } {
  const check = canDoActivity(state, id);
  if (!check.ok) return { ok: false, text: check.reason ?? '', notes: [] };
  const def = activityDef(id) as ActivityDef;
  const c = state.career;
  const p = userPlayer(state);
  const lang = getLang();
  const notes: string[] = [];
  let text = activityResultText(id);

  c.actionsLeft = Math.max(0, c.actionsLeft - 1);
  if (COOLDOWN[id]) state.flags[cooldownFlag(id)] = nowIndex(state);
  markActivity(state, def.category);

  // energy & money first
  const pay: Effects = {};
  if (def.energy !== 0) pay.energy = -def.energy;
  if (def.cost > 0) pay.money = -def.cost;
  notes.push(...applyEffects(state, pay));

  const e = personalise(state, def, def.effects);

  switch (id) {
    case 'train_extra': {
      const focus = TRAINING_FOCUSES.find((f) => f.id === c.trainingFocus) ?? TRAINING_FOCUSES[0];
      const per = (hasTrait(p, 'workaholic') ? 18 : 14) / Math.max(1, Math.min(focus.attrs.length, 4));
      e.xp = {};
      for (const k of focus.attrs.slice(0, 4)) e.xp[k] = per;
      break;
    }
    case 'media_commercial': {
      const fee = niceMoney(1_500 + Math.pow(c.fame, 2) * 55 * (hasTrait(p, 'media_darling') ? 1.25 : 1));
      e.money = fee;
      text = activityResultText(id, { money: formatMoney(fee, lang) });
      break;
    }
    case 'family_hometown': {
      if (state.career.genesis.hometownClubId && p.clubId === state.career.genesis.hometownClubId) {
        e.rel = { ...e.rel, fans: (e.rel?.fans ?? 0) + 3 };
      }
      break;
    }
    case 'romance_meet': {
      if (c.partnerId) { text = t('career.act.hasPartner'); break; } // never more than one partner
      const chance = clamp(0.32 + c.fame / 250 + (p.morale - 50) / 300 + (hasTrait(p, 'showman') ? 0.08 : 0), 0.15, 0.75);
      if (rng.chance(chance)) {
        const partner = createPartner(state, rng);
        c.people.push(partner);
        c.partnerId = partner.id;
        c.relationships.partner = partner.relationship;
        e.morale = (e.morale ?? 0) + 6;
        e.followers = (e.followers ?? 0) + Math.round(500 + c.followers * 0.01);
        text = t('career.act.met', { name: partner.name });
      } else {
        text = t('career.act.noSpark');
      }
      break;
    }
    case 'romance_propose': {
      const partner = partnerOf(state);
      const yes = rng.chance(clamp(0.25 + (c.relationships.partner - 70) / 30, 0.3, 0.97));
      if (yes) {
        state.flags['career.married'] = true;
        e.rel = { partner: 15, family: 6 };
        e.morale = 10;
        e.fame = 1;
        e.followers = Math.round(5_000 + c.followers * 0.04);
        text = t('career.act.proposeYes', { name: partner?.name ?? '' });
      } else {
        e.rel = { partner: -10 };
        e.morale = -6;
        text = t('career.act.proposeNo', { name: partner?.name ?? '' });
      }
      break;
    }
    default:
      break;
  }

  notes.push(...applyEffects(state, e));

  // the gamble
  if (def.risk && rng.chance(riskChance(state, def))) {
    const riskNotes = applyEffects(state, def.risk.effects);
    notes.push(...riskNotes);
    text = `${text} ${loc(def.risk.text, lang)}`.trim();
    if (p.injury && (def.risk.effects.injuryWeeks ?? 0) > 0) {
      notes.push(t('career.inj.happenedShort', { injury: injuryName(p.injury.key), n: p.injury.weeksLeft }));
    }
    if (def.category === 'nightlife' || def.category === 'media') state.flags['career.lastScandal'] = nowIndex(state);
  }
  state.flags['career.activities'] = getFlagNum(state, 'career.activities') + 1;
  return { ok: true, text, notes };
}

/** Activities ordered for display, with availability for the current week. */
export function activityAvailability(state: GameState): { def: ActivityDef; ok: boolean; reason?: string }[] {
  return ACTIVITIES.map((def) => ({ def, ...canDoActivity(state, def.id) }));
}

