/**
 * Lifestyle shop: cars, homes, watches, fashion, tech, pets, staff, boats, aircraft, art.
 * Items carry weekly upkeep and passive perks; staff are "hired" (no resale value).
 */
import type { GameState, RelKey } from '../core/types';
import { getLang, t } from '../core/i18n';
import { formatMoney } from '../core/util';
import type { ShopItem } from './model';
import { applyEffects } from './effects';

export const SHOP_ITEMS: ShopItem[] = [
  // ── watches ──
  {
    id: 'w_smart', category: 'watch', tier: 1, price: 2_000, upkeep: 0, minFame: 0, icon: 'watch',
    name: { tr: 'Akıllı Spor Saati', en: 'Smart Sports Watch' },
    desc: { tr: 'Nabzını, uykunu, sprintlerini ölçer. Antrenmanı biraz daha bilinçli yaparsın.', en: 'Tracks heart rate, sleep and sprints. Train a little smarter.' },
    perks: { trainingBoost: 0.03 },
  },
  {
    id: 'w_steel', category: 'watch', tier: 2, price: 12_000, upkeep: 0, minFame: 8, icon: 'watch',
    name: { tr: 'Çelik Kronograf', en: 'Steel Chronograph' },
    desc: { tr: 'İlk ciddi saatin. Bileğine her baktığında nereden geldiğini hatırlarsın.', en: 'Your first serious watch. A reminder of how far you have come.' },
    perks: { morale: 1 },
  },
  {
    id: 'w_bazaar', category: 'watch', tier: 3, price: 85_000, upkeep: 0, minFame: 25, icon: 'gem',
    name: { tr: 'Kapalıçarşı Ustası İmzalı Altın Saat', en: "Grand Bazaar Master Jeweller's Gold Watch" },
    desc: { tr: 'Üç kuşaktır Kapalıçarşı\'da çalışan bir ustanın elinden. Babana gösterdiğinde gözleri doldu.', en: 'Hand-finished by a third-generation Grand Bazaar jeweller. Your father welled up when he saw it.' },
    perks: { morale: 2, rel: { family: 0.2 } },
  },
  {
    id: 'w_tourbillon', category: 'watch', tier: 4, price: 420_000, upkeep: 0, minFame: 45, icon: 'watch',
    name: { tr: 'Tourbillon Koleksiyon Saati', en: 'Tourbillon Collector\'s Piece' },
    desc: { tr: 'Dünyada yalnızca 25 adet. Röportajlarda kameralar önce bileğine zoom yapar.', en: 'Only 25 exist. In interviews the cameras zoom on your wrist first.' },
    perks: { morale: 2, fameWeekly: 0.08 },
  },
  {
    id: 'w_skeleton', category: 'watch', tier: 5, price: 1_800_000, upkeep: 0, minFame: 70, icon: 'diamond',
    name: { tr: 'Pırlanta Taşlı İskelet Saat', en: 'Diamond-set Skeleton Watch' },
    desc: { tr: 'Mekanizması görünen, pırlantalarla çevrili bir sanat eseri. Biraz fazla mı?', en: 'An open-worked movement ringed with diamonds. A little much? Perhaps.' },
    perks: { morale: 3, fameWeekly: 0.15 },
  },
  // ── cars ──
  {
    id: 'car_hatch', category: 'car', tier: 1, price: 9_000, upkeep: 60, minFame: 0, icon: 'car',
    name: { tr: 'İkinci El Hatchback', en: 'Second-hand Hatchback' },
    desc: { tr: 'Klimanın yarısı çalışıyor ama antrenmana otobüsle gitmekten iyidir.', en: 'Half the air-con works, but it beats the bus to training.' },
    perks: { energyRegen: 1 },
  },
  {
    id: 'car_anadol', category: 'car', tier: 2, price: 38_000, upkeep: 150, minFame: 8, icon: 'car_front',
    name: { tr: 'Restore Edilmiş Klasik Anadol', en: 'Restored Classic Anadol' },
    desc: { tr: 'Fiber kaportalı, sıfırdan restore edilmiş bir efsane. Taraftarlar seni trafikte görünce korna çalıyor.', en: 'A fibreglass-bodied Turkish classic, restored bolt by bolt. Fans honk when they spot you in traffic.' },
    perks: { morale: 2, rel: { fans: 0.2 } },
    onBuy: { followers: 2_500 },
  },
  {
    id: 'car_suv', category: 'car', tier: 3, price: 95_000, upkeep: 400, minFame: 18, icon: 'car_front',
    name: { tr: 'Lüks SUV', en: 'Luxury SUV' },
    desc: { tr: 'Deri koltuklar, sessiz kabin. Antrenmandan eve dinlenerek dönersin.', en: 'Leather seats, whisper-quiet cabin. You get home rested.' },
    perks: { energyRegen: 2, morale: 1 },
  },
  {
    id: 'car_ev', category: 'car', tier: 3, price: 140_000, upkeep: 220, minFame: 22, icon: 'zap',
    name: { tr: 'Elektrikli Spor Sedan', en: 'Electric Sports Saloon' },
    desc: { tr: '0-100 üç saniyede, egzoz sıfır. Basın "çevreci yıldız" diye yazıyor.', en: '0-60 in three seconds, zero exhaust. The press calls you "the green star".' },
    perks: { energyRegen: 2, rel: { media: 0.2 } },
  },
  {
    id: 'car_super', category: 'car', tier: 4, price: 320_000, upkeep: 1_500, minFame: 45, icon: 'car',
    name: { tr: 'İtalyan Süper Spor', en: 'Italian Supercar' },
    desc: { tr: 'Kırmızı, alçak, gürültülü. Kulüp otoparkında hoca kaşlarını kaldırıyor.', en: 'Red, low and loud. The manager raises an eyebrow in the club car park.' },
    perks: { morale: 3, fameWeekly: 0.12, rel: { manager: -0.15 } },
  },
  {
    id: 'car_roadster', category: 'car', tier: 4, price: 650_000, upkeep: 1_200, minFame: 50, icon: 'car',
    name: { tr: '1967 Model Klasik Roadster', en: '1967 Classic Roadster' },
    desc: { tr: 'Sahil yolunda üstü açık, radyoda eski bir şarkı. Kafa dinlemenin en şık yolu.', en: 'Top down on the coast road, an old song on the radio. The classiest way to unwind.' },
    perks: { morale: 3, energyRegen: 1 },
  },
  {
    id: 'car_hyper', category: 'car', tier: 5, price: 2_800_000, upkeep: 6_000, minFame: 70, icon: 'rocket',
    name: { tr: 'Sınırlı Üretim Hiper Otomobil', en: 'Limited-run Hypercar' },
    desc: { tr: '1.500 beygir, 99 adet. Sosyal medyada paylaştığın an trend oluyorsun.', en: '1,500 horsepower, 99 made. Post it and you are trending in minutes.' },
    perks: { morale: 4, fameWeekly: 0.25 },
    onBuy: { followers: 150_000 },
  },
  // ── homes ──
  {
    id: 'h_parents', category: 'house', tier: 2, price: 350_000, upkeep: 0, minFame: 5, icon: 'heart',
    name: { tr: 'Annene Babana Ev', en: 'A Home for Your Parents' },
    desc: { tr: 'Yıllarca kirada oturdular, seni maçlara taşıdılar. Anahtarı annene verdiğin an hayatının en güzel anı.', en: 'They rented for years and drove you to every game. Handing your mum the keys is the best moment of your life.' },
    perks: { morale: 2, rel: { family: 0.3 } },
    onBuy: { rel: { family: 15 }, morale: 8, followers: 5_000 },
  },
  {
    id: 'h_flat', category: 'house', tier: 2, price: 180_000, upkeep: 350, minFame: 0, icon: 'building',
    name: { tr: 'Şehir Merkezinde 2+1 Daire', en: 'City-centre Two-bed Flat' },
    desc: { tr: 'Kulüp tesislerine yirmi dakika. Kendi evin, kendi düzenin.', en: 'Twenty minutes from the training ground. Your own place, your own rules.' },
    perks: { energyRegen: 2, morale: 1 },
  },
  {
    id: 'h_stone', category: 'house', tier: 3, price: 650_000, upkeep: 900, minFame: 15, icon: 'house',
    name: { tr: 'Ege\'de Zeytinlikli Taş Ev', en: 'Aegean Stone House with Olive Grove' },
    desc: { tr: 'Sabah zeytinyağlı kahvaltı, akşam gün batımı. Ailen her yaz burada.', en: 'Olive-oil breakfasts and Aegean sunsets. Your family spends every summer here.' },
    perks: { energyRegen: 3, morale: 3, rel: { family: 0.3 } },
  },
  {
    id: 'h_penthouse', category: 'house', tier: 3, price: 1_200_000, upkeep: 2_500, minFame: 30, icon: 'building',
    name: { tr: 'Manzaralı Penthouse', en: 'Skyline Penthouse' },
    desc: { tr: 'Şehrin ışıkları ayaklarının altında. Teras partileri efsane olmaya aday.', en: 'The city lights at your feet. Terrace parties of legend await.' },
    perks: { energyRegen: 3, morale: 2, fameWeekly: 0.05 },
  },
  {
    id: 'h_bodrum', category: 'house', tier: 4, price: 4_500_000, upkeep: 8_000, minFame: 50, icon: 'sun',
    name: { tr: 'Bodrum\'da Deniz Manzaralı Villa', en: 'Sea-view Villa in Bodrum' },
    desc: { tr: 'Sonsuzluk havuzu, begonvil kaplı duvarlar ve Ege. Tatiller artık burada.', en: 'Infinity pool, bougainvillea walls and the Aegean. Holidays happen here now.' },
    perks: { energyRegen: 4, morale: 3, rel: { partner: 0.4, family: 0.2 } },
  },
  {
    id: 'h_mansion', category: 'house', tier: 5, price: 9_000_000, upkeep: 14_000, minFame: 65, icon: 'castle',
    name: { tr: 'Kapılı Sitede Malikâne', en: 'Gated Mansion' },
    desc: { tr: 'Kendi spor salonu, sineması, yarı olimpik havuzu. Komşun da bir film yıldızı.', en: 'Private gym, cinema and pool. Your neighbour is a film star.' },
    perks: { energyRegen: 4, morale: 3, fameWeekly: 0.15, trainingBoost: 0.04 },
  },
  {
    id: 'h_yali', category: 'house', tier: 5, price: 28_000_000, upkeep: 25_000, minFame: 75, icon: 'castle',
    name: { tr: 'Boğaz Kıyısında Tarihi Yalı', en: 'Historic Bosphorus Yalı' },
    desc: { tr: '19. yüzyıldan kalma, ahşap, kayıkhaneli bir yalı. Sabah çayını Boğaz\'dan geçen gemilere bakarak içiyorsun.', en: 'A 19th-century wooden waterside mansion with its own boathouse. Morning tea, watching ships slide down the Bosphorus.' },
    perks: { energyRegen: 5, morale: 5, fameWeekly: 0.3, rel: { family: 0.5, partner: 0.3 } },
    onBuy: { fame: 2, followers: 400_000 },
  },
  // ── fashion ──
  {
    id: 'f_tracksuit', category: 'fashion', tier: 1, price: 2_500, upkeep: 0, minFame: 0, icon: 'shirt',
    name: { tr: 'Tasarım Eşofman Takımı', en: 'Designer Tracksuit' },
    desc: { tr: 'Takım otobüsünden inerken herkes sana bakıyor.', en: 'All eyes on you stepping off the team bus.' },
    perks: { morale: 1 },
  },
  {
    id: 'f_sneakers', category: 'fashion', tier: 2, price: 30_000, upkeep: 0, minFame: 12, icon: 'footprints',
    name: { tr: 'Sınırlı Seri Sneaker Koleksiyonu', en: 'Limited Sneaker Collection' },
    desc: { tr: 'Kutusundan hiç çıkmamış 40 çift. Takipçilerin bayılıyor.', en: 'Forty pairs, never out of the box. Your followers love it.' },
    perks: { fameWeekly: 0.04 },
    onBuy: { followers: 20_000 },
  },
  {
    id: 'f_suit', category: 'fashion', tier: 2, price: 18_000, upkeep: 0, minFame: 15, icon: 'shirt',
    name: { tr: 'Nişantaşı Terzisinden Ismarlama Takım', en: 'Bespoke Suit from an Istanbul Tailor' },
    desc: { tr: 'Ölçüler üç kez alındı, astarına baş harflerin işlendi. Ödül gecelerine hazırsın.', en: 'Measured three times, your initials stitched into the lining. Ready for award nights.' },
    perks: { rel: { media: 0.2, sponsors: 0.1 } },
  },
  {
    id: 'f_couture', category: 'fashion', tier: 4, price: 250_000, upkeep: 500, minFame: 50, icon: 'sparkles',
    name: { tr: 'Haute Couture Gardırop', en: 'Haute Couture Wardrobe' },
    desc: { tr: 'Moda haftalarının ön sırası artık senin. Stil ikonu oldun.', en: 'Front row at fashion week. You are a style icon now.' },
    perks: { fameWeekly: 0.15, rel: { media: 0.3, sponsors: 0.3 } },
  },
  // ── tech ──
  {
    id: 't_console', category: 'tech', tier: 1, price: 3_000, upkeep: 0, minFame: 0, icon: 'gamepad',
    name: { tr: 'Oyun Konsolu ve Dev Ekran', en: 'Games Console & Giant Screen' },
    desc: { tr: 'Takım arkadaşlarınla gece yarısına kadar online maçlar. Kendini oynamak tuhaf.', en: 'Online games with teammates until midnight. Playing as yourself is weird.' },
    perks: { morale: 2, rel: { teammates: 0.2 } },
  },
  {
    id: 't_analysis', category: 'tech', tier: 2, price: 15_000, upkeep: 80, minFame: 5, icon: 'laptop',
    name: { tr: 'Kişisel Maç Analiz Yazılımı', en: 'Personal Match-Analysis Suite' },
    desc: { tr: 'Her dokunuşun, her koşun veriye dönüşür. Hatalarını bir daha yapmazsın.', en: 'Every touch and run turned into data. You stop repeating mistakes.' },
    perks: { trainingBoost: 0.06 },
  },
  {
    id: 't_homegym', category: 'tech', tier: 2, price: 28_000, upkeep: 50, minFame: 5, icon: 'dumbbell',
    name: { tr: 'Ev Spor Salonu', en: 'Home Gym' },
    desc: { tr: 'Bodrum katta ağırlıklar, koşu bandı ve esneme alanı.', en: 'Weights, treadmill and a stretching area in the basement.' },
    perks: { trainingBoost: 0.05, injuryResist: 0.04 },
  },
  {
    id: 't_studio', category: 'tech', tier: 2, price: 22_000, upkeep: 100, minFame: 10, icon: 'mic',
    name: { tr: 'Yayın Stüdyosu', en: 'Streaming Studio' },
    desc: { tr: 'Mikrofon, ışıklar, kamera. Taraftarlarla canlı yayınlar artık profesyonel.', en: 'Mic, lights, camera. Your fan streams look professional now.' },
    perks: { fameWeekly: 0.06, rel: { fans: 0.15 } },
    onBuy: { followers: 15_000 },
  },
  {
    id: 't_cryo', category: 'tech', tier: 3, price: 45_000, upkeep: 120, minFame: 10, icon: 'snow',
    name: { tr: 'Kriyoterapi Kabini', en: 'Cryotherapy Chamber' },
    desc: { tr: 'Eksi 110 derecede üç dakika. Kasların ertesi sabah yepyeni.', en: 'Three minutes at minus 110. Your muscles feel brand new the next morning.' },
    perks: { energyRegen: 4, injuryResist: 0.08 },
  },
  {
    id: 't_vr', category: 'tech', tier: 3, price: 85_000, upkeep: 200, minFame: 20, icon: 'eye',
    name: { tr: 'Sanal Gerçeklik Antrenman Sistemi', en: 'VR Training Rig' },
    desc: { tr: 'Rakip savunmaları sanal ortamda yüzlerce kez çözersin. Vizyonun keskinleşir.', en: 'Unlock virtual defences hundreds of times. Your vision sharpens.' },
    perks: { trainingBoost: 0.08 },
  },
  // ── pets ──
  {
    id: 'p_vancat', category: 'pet', tier: 1, price: 2_000, upkeep: 25, minFame: 0, icon: 'paw',
    name: { tr: 'Van Kedisi', en: 'Van Cat' },
    desc: { tr: 'Bir gözü mavi, bir gözü kehribar. Yüzmeyi seviyor, takipçilerin onu senden çok seviyor.', en: 'One blue eye, one amber. Loves swimming; your followers love it more than you.' },
    perks: { morale: 1 },
    onBuy: { followers: 8_000 },
  },
  {
    id: 'p_kangal', category: 'pet', tier: 1, price: 2_500, upkeep: 40, minFame: 0, icon: 'dog',
    name: { tr: 'Kangal Yavrusu', en: 'Kangal Puppy' },
    desc: { tr: 'Şimdilik yavru, iki yıl sonra bir aslan. Sabah koşularının vazgeçilmez ortağı.', en: 'A puppy today, a lion in two years. Your loyal morning-run partner.' },
    perks: { morale: 2, rel: { family: 0.2 } },
  },
  {
    id: 'p_horse', category: 'pet', tier: 4, price: 220_000, upkeep: 900, minFame: 40, icon: 'heart',
    name: { tr: 'Safkan Arap Atı', en: 'Thoroughbred Arabian Horse' },
    desc: { tr: 'Hafta sonları çiftlikte binicilik. Kafanı futboldan uzaklaştırmanın en asil yolu.', en: 'Weekend riding at the farm. The noblest way to switch off from football.' },
    perks: { morale: 3, fameWeekly: 0.04 },
  },
  // ── staff ──
  {
    id: 's_chef', category: 'staff', tier: 2, price: 5_000, upkeep: 1_500, minFame: 10, icon: 'utensils',
    name: { tr: 'Özel Aşçı', en: 'Personal Chef' },
    desc: { tr: 'Gramajı hesaplanmış menüler; ara sıra da annenin tarifinden mantı.', en: 'Macro-counted menus — and the odd plate of your mum\'s dumplings.' },
    perks: { energyRegen: 3, trainingBoost: 0.03 },
  },
  {
    id: 's_driver', category: 'staff', tier: 2, price: 3_000, upkeep: 900, minFame: 15, icon: 'car_front',
    name: { tr: 'Özel Şoför', en: 'Private Chauffeur' },
    desc: { tr: 'Trafikte geçen saatler artık uyku ve video analiz zamanı.', en: 'Hours in traffic become nap time and video study.' },
    perks: { energyRegen: 2 },
  },
  {
    id: 's_psych', category: 'staff', tier: 2, price: 5_000, upkeep: 1_800, minFame: 10, icon: 'brain',
    name: { tr: 'Spor Psikoloğu', en: 'Sports Psychologist' },
    desc: { tr: 'Penaltı öncesi nefes, kötü maçtan sonra sakinlik. Kafan rahat.', en: 'Breathing before penalties, calm after bad games. A clear head.' },
    perks: { morale: 3 },
  },
  {
    id: 's_physio', category: 'staff', tier: 3, price: 8_000, upkeep: 2_500, minFame: 15, icon: 'stethoscope',
    name: { tr: 'Kişisel Fizyoterapist', en: 'Personal Physio' },
    desc: { tr: 'Her antrenman sonrası masaj ve önleyici egzersizler. Sakatlıklar azalır, iyileşme hızlanır.', en: 'Post-session massage and prehab. Fewer injuries, faster recoveries.' },
    perks: { injuryResist: 0.18, energyRegen: 2 },
  },
  {
    id: 's_coach', category: 'staff', tier: 3, price: 10_000, upkeep: 3_000, minFame: 15, icon: 'graduation',
    name: { tr: 'Özel Antrenör', en: 'Private Coach' },
    desc: { tr: 'Eski bir milli oyuncu, artık sadece seninle çalışıyor. Ek seanslar, detaylı programlar.', en: 'A former international who now works only with you. Extra sessions, detailed plans.' },
    perks: { trainingBoost: 0.15 },
  },
  {
    id: 's_pr', category: 'staff', tier: 3, price: 12_000, upkeep: 3_500, minFame: 25, icon: 'megaphone',
    name: { tr: 'PR Yöneticisi', en: 'PR Manager' },
    desc: { tr: 'Hangi röportaja çıkacağını, ne paylaşacağını bilir. Krizleri büyümeden söndürür.', en: 'Knows which interview to give and what to post. Puts out fires before they spread.' },
    perks: { fameWeekly: 0.12, rel: { media: 0.4, sponsors: 0.3 } },
  },
  {
    id: 's_bodyguard', category: 'staff', tier: 3, price: 6_000, upkeep: 2_200, minFame: 40, icon: 'shield',
    name: { tr: 'Koruma', en: 'Bodyguard' },
    desc: { tr: 'Gece çıkışlarında paparazziler sana yaklaşamaz. Skandal riski yarıya iner.', en: 'Paparazzi cannot get near you on nights out. Scandal risk is halved.' },
    perks: { morale: 1 },
  },
  // ── boats ──
  {
    id: 'b_speed', category: 'boat', tier: 3, price: 180_000, upkeep: 900, minFame: 25, icon: 'boat',
    name: { tr: 'Sürat Teknesi', en: 'Speedboat' },
    desc: { tr: 'Koydan koya, dalgaların üstünde. Takım arkadaşların her hafta sonu davet bekliyor.', en: 'Bay to bay over the waves. Teammates expect an invite every weekend.' },
    perks: { morale: 2, rel: { teammates: 0.15 } },
  },
  {
    id: 'b_gulet', category: 'boat', tier: 4, price: 1_600_000, upkeep: 4_000, minFame: 40, icon: 'boat',
    name: { tr: 'Ahşap Gulet', en: 'Wooden Gulet' },
    desc: { tr: 'Bodrumlu ustaların elinden çıkma, iki direkli ahşap tekne. Mavi yolculuk artık ailece.', en: 'A two-masted wooden gulet built by Bodrum craftsmen. Blue Voyages with the whole family.' },
    perks: { morale: 4, energyRegen: 2, rel: { family: 0.3, partner: 0.3 } },
  },
  {
    id: 'b_mega', category: 'boat', tier: 5, price: 45_000_000, upkeep: 60_000, minFame: 85, icon: 'boat',
    name: { tr: 'Mega Yat', en: 'Superyacht' },
    desc: { tr: 'Helikopter pisti, 12 kişilik mürettebat. Akdeniz\'in en çok fotoğraflanan teknesi.', en: 'Helipad and a crew of 12. The most photographed yacht in the Mediterranean.' },
    perks: { morale: 5, fameWeekly: 0.4 },
    onBuy: { fame: 2, followers: 600_000 },
  },
  // ── aircraft ──
  {
    id: 'j_balloon', category: 'jet', tier: 3, price: 320_000, upkeep: 1_000, minFame: 30, icon: 'wind',
    name: { tr: 'Kapadokya\'da Kendi Sıcak Hava Balonun', en: 'Your Own Hot-air Balloon in Cappadocia' },
    desc: { tr: 'Gün doğarken peri bacalarının üstünde, sadece sen ve sevdiklerin. Pilotu da dahil.', en: 'Sunrise over the fairy chimneys, just you and your loved ones. Pilot included.' },
    perks: { morale: 3, rel: { partner: 0.4, family: 0.2 } },
    onBuy: { followers: 40_000 },
  },
  {
    id: 'j_share', category: 'jet', tier: 4, price: 3_500_000, upkeep: 12_000, minFame: 55, icon: 'plane',
    name: { tr: 'Özel Jet Hisse Payı', en: 'Private Jet Share' },
    desc: { tr: 'Milli takım kampına, memlekete, tatile; havalimanı kuyrukları artık geçmişte.', en: 'National team camps, hometown, holidays — airport queues are history.' },
    perks: { energyRegen: 3 },
  },
  {
    id: 'j_own', category: 'jet', tier: 5, price: 80_000_000, upkeep: 90_000, minFame: 90, icon: 'plane',
    name: { tr: 'Kişisel Özel Jet', en: 'Personal Private Jet' },
    desc: { tr: 'Kuyruğunda forma numaran yazıyor. Futbolun en tepesindesin.', en: 'Your shirt number on the tail fin. You are at the summit of football.' },
    perks: { energyRegen: 6, fameWeekly: 0.5, morale: 4 },
    onBuy: { fame: 3, followers: 1_000_000 },
  },
  // ── art ──
  {
    id: 'a_print', category: 'art', tier: 1, price: 4_000, upkeep: 0, minFame: 0, icon: 'palette',
    name: { tr: 'Sınırlı Baskı Sokak Sanatı', en: 'Limited-edition Street Art Print' },
    desc: { tr: 'Mahallenin duvarlarını boyayan bir sanatçıdan. Salonuna renk kattı.', en: 'From an artist who paints your old neighbourhood\'s walls. Brightens up the living room.' },
    perks: { morale: 1 },
  },
  {
    id: 'a_ebru', category: 'art', tier: 2, price: 9_000, upkeep: 0, minFame: 5, icon: 'palette',
    name: { tr: 'Ebru Sanatı Koleksiyonu', en: 'Ebru Marbling Collection' },
    desc: { tr: 'Suyun üstünde dans eden boyalar. Her biri bir kez yapılabilen, tek eserler.', en: 'Pigments dancing on water — each piece can only ever be made once.' },
    perks: { morale: 1, rel: { family: 0.1 } },
  },
  {
    id: 'a_hat', category: 'art', tier: 3, price: 75_000, upkeep: 0, minFame: 20, icon: 'book_open',
    name: { tr: 'Osmanlı Hat Sanatı Levhası', en: 'Ottoman Calligraphy Panel' },
    desc: { tr: 'Usta bir hattatın elinden, yüz elli yıllık bir levha. Dedene bakarken gözleri parladı.', en: 'A 150-year-old panel by a master calligrapher. Your grandfather\'s eyes lit up.' },
    perks: { morale: 2, rel: { family: 0.2 } },
  },
  {
    id: 'a_modern', category: 'art', tier: 4, price: 2_200_000, upkeep: 0, minFame: 50, icon: 'palette',
    name: { tr: 'Çağdaş Sanat Başyapıtı', en: 'Contemporary Masterpiece' },
    desc: { tr: 'Müzayedede rekor kıran tablo artık senin salonunda. Sanat dergileri seni yazıyor.', en: 'The record-breaking auction piece now hangs in your lounge. Art magazines write about you.' },
    perks: { fameWeekly: 0.1, rel: { media: 0.2 } },
  },
];

export function shopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}

export function ownsItem(state: GameState, id: string): boolean {
  return state.career.inventory.some((o) => o.itemId === id);
}

export interface PerkTotals { energyRegen: number; trainingBoost: number; fameWeekly: number; morale: number; injuryResist: number; rel: Partial<Record<RelKey, number>>; upkeep: number }

/** Sum of passive perks of everything owned (with sane caps). */
export function itemPerks(state: GameState): PerkTotals {
  const out: PerkTotals = { energyRegen: 0, trainingBoost: 0, fameWeekly: 0, morale: 0, injuryResist: 0, rel: {}, upkeep: 0 };
  for (const owned of state.career.inventory) {
    const it = shopItem(owned.itemId);
    if (!it) continue;
    out.upkeep += it.upkeep;
    out.energyRegen += it.perks.energyRegen ?? 0;
    out.trainingBoost += it.perks.trainingBoost ?? 0;
    out.fameWeekly += it.perks.fameWeekly ?? 0;
    out.morale += it.perks.morale ?? 0;
    out.injuryResist += it.perks.injuryResist ?? 0;
    for (const [k, v] of Object.entries(it.perks.rel ?? {}) as [RelKey, number][]) out.rel[k] = (out.rel[k] ?? 0) + v;
  }
  out.energyRegen = Math.min(out.energyRegen, 18);
  out.trainingBoost = Math.min(out.trainingBoost, 0.4);
  out.morale = Math.min(out.morale, 8);
  out.injuryResist = Math.min(out.injuryResist, 0.5);
  out.fameWeekly = Math.min(out.fameWeekly, 1.2);
  return out;
}

export function buyItem(state: GameState, itemId: string): { ok: boolean; reason?: string } {
  const it = shopItem(itemId);
  if (!it) return { ok: false, reason: t('career.shop.unknown') };
  if (state.career.retired) return { ok: false, reason: t('career.shop.retired') };
  if (ownsItem(state, itemId)) return { ok: false, reason: t('career.shop.owned') };
  if (state.career.fame < it.minFame) return { ok: false, reason: t('career.shop.fame', { n: it.minFame }) };
  if (state.career.money < it.price) return { ok: false, reason: t('career.shop.money', { price: formatMoney(it.price, getLang()) }) };
  state.career.money -= it.price;
  state.career.inventory.push({ itemId, boughtSeason: state.season, boughtWeek: state.week });
  if (it.onBuy) applyEffects(state, it.onBuy);
  return { ok: true };
}

/** Resale value: 60% of the price; staff have no resale value (you just let them go). */
export function resaleValue(it: ShopItem): number {
  return it.category === 'staff' ? 0 : Math.round(it.price * 0.6);
}

export function sellItem(state: GameState, itemId: string): { ok: boolean; refund: number } {
  const idx = state.career.inventory.findIndex((o) => o.itemId === itemId);
  const it = shopItem(itemId);
  if (idx < 0 || !it) return { ok: false, refund: 0 };
  state.career.inventory.splice(idx, 1);
  const refund = resaleValue(it);
  state.career.money += refund;
  return { ok: true, refund };
}
