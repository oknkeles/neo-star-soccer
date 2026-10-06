# ⚽ Neo Star Soccer

**Yapay zekâ destekli, modern bir futbol kariyer oyunu. Her kariyer yeni bir hikâye.**
*An AI-assisted football career game inspired by the classic New Star Soccer. Every career is a new story.*

▶️ **Oyna / Play:** https://oknkeles.github.io/neo-star-soccer/

---

## 🇹🇷 Türkçe

17 yaşında bir futbolcusun. Tek bir oyuncuyu yönetirsin. Maçların sadece seni ilgilendiren anlarını gerçek zamanlı 3D olarak oynarsın. Saha dışında antrenman, para, ilişkiler, transferler, basın ve milli takım seni bekler.

### Öne çıkanlar
- **Falso Çizgisi:** Topa bas, şutun yolunu çiz. Çizginin uzunluğu gücü, kıvrımı falsoyu belirler. Top Magnus etkisiyle gerçekten döner. Rüzgâr, ıslak zemin, direkler ve üst direk hesaba katılır. Kaleciler son anda dönen topa aldanabilir.
- **Anlar, 90 dakika değil:** Maç hızlı bir anlatımla akar. Sen yalnızca sana düşen anları oynarsın: karşı atak, birebir, orta, serbest vuruş, penaltı, savunma. Her an maç puanını değiştirir.
- **8 lig, 2 kademe:** İngiltere, İspanya, İtalya, Almanya, Fransa, Portekiz, Hollanda ve **Süper Lig**. Kulüpler kurgusal, şehirler gerçek. Kupa, Şampiyonlar Kupası, milli maçlar, Dünya Kupası ve Kıta Kupası da var.
- **Her kariyer farklı:** Dünya tohumdan üretilir. Gizli potansiyel ve şifreli bir kader ipucu, yaşıtın olan bir rakip, bir akıl hocası, rastgele kişilik özellikleri, hikâye yayları ve kariyer hedefleri her oyunda yeniden belirlenir.
- **Saha dışı hayat:** Teknik direktör, takım arkadaşları, taraftar, medya, aile, partner, menajer ve sponsorlarla ilişkiler. Enerji, haftalık aktiviteler, alışveriş (Boğaz'da yalıdan özel jete), seçimli olaylar.
- **Transferler:** Pencerelerde teklifler gelir. Maaş, süre, rol, serbest kalma bedeli ve imza parası üzerine pazarlık edersin.
- **Yapay zekâ anlatıcısı (isteğe bağlı):** Kendi Claude API anahtarını girersen Claude yazar. Geçmiş hikâyeni, gazeteyi ve sosyal medya akışını o yazar. Basın toplantısında soruları o sorar, serbest yazdığın cevapları o değerlendirir. Sözleşme masasında sportif direktörü o canlandırır. Emeklilik belgeselini de o kaleme alır. Anahtar olmadan da her şey zengin şablonlarla çalışır.

### Yapay zekâyı açmak
**Ayarlar → Yapay Zekâ** bölümünden anahtarını gir ve özellikleri seç. Anahtar yalnızca bu tarayıcının `localStorage`'ında tutulur ve yalnızca `api.anthropic.com`'a gönderilir. Kullanım ücreti kendi Anthropic hesabına yansır.

---

## 🇬🇧 English

You are a 17-year-old footballer. You control one player and play only the moments that involve you, in real-time 3D. Off the pitch: training, money, relationships, transfers, the press and the national team.

- **The Curve Line:** press on the ball and draw your shot. Length sets power, the bend sets curl (real Magnus physics, wind, wet pitches, woodwork, keepers fooled by late bend).
- **Moments, not 90 minutes:** NSS-style ticker with real-time moments that shape your match rating.
- **8 countries × 2 tiers** (big 7 + Türkiye), cups, the Champions Cup, internationals, World & Continental Cups. Fictional clubs, real cities.
- **Every career is unique:** seeded world, hidden potential, a rival, a mentor, traits, storylines and career goals.
- **Optional Claude narrator** with your own API key: backstory, newspaper, social feed, press conferences with free-text answers, contract negotiation role-play, bespoke events, retirement documentary. Everything works offline with procedural templates too.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (vitest)
npm run build    # type-check + production build
```

Stack: React 19, TypeScript, Vite, three.js, Tailwind CSS, framer-motion, `@anthropic-ai/sdk`. Architecture and design notes: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

*Fan project. All clubs, players, competitions and brands in the game are fictional.*
