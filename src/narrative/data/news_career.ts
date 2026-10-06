/**
 * News banks, part 2: transfers, injuries, milestones, awards, league news, call-ups and generic fallbacks.
 * Extra slots: fee other team name award trophy n weeks.
 */
import type { NewsEntry } from './news_match';

export const NEWS_CAREER: Record<string, NewsEntry> = {
  transfer_fee: {
    group: 'transfer',
    h: {
      tr: [
        'Resmen açıklandı! {player}, {fee} karşılığında {club} yolunda',
        '{player} imzayı attı: {club} {fee} ödedi',
        '{club}, {player:acc} {fee} karşılığında kadrosuna kattı',
        'Transferin tamamı: {player} artık {club:gen} oyuncusu',
      ],
      en: [
        'It’s official! {player} joins {club} for {fee}',
        '{player} signs: {club} pay {fee}',
        '{club} land {player} in a {fee} deal',
        'Done deal: {player} is now a {club} player',
      ],
    },
    f: {
      tr: [
        'Yeni kulübünün stadında düzenlenen tanıtım töreninde {first}, formayı öperek taraftara el salladı: «Burada tarih yazmaya geldim.»',
        'Menajer {agent} pazarlığı «zorlu ama adil» olarak tanımladı. Kulüp başkanı transferi bir yatırım olarak niteledi.',
        'Sosyal medya anında kaynadı; yeni forma satışları saatler içinde ilk sıraya yerleşti.',
      ],
      en: [
        'At the unveiling in his new stadium {first} kissed the shirt and waved to the fans: “I came here to make history.”',
        'Agent {agent} called the negotiation “tough but fair”, while the chairman described the move as an investment.',
        'Social media lit up instantly; replica shirts shot to the top of the sales chart within hours.',
      ],
    },
  },
  transfer_done: {
    group: 'transfer',
    h: {
      tr: [
        '{player} {club:gen} yeni oyuncusu!',
        'Yeni sayfa: {player}, {club:dat} imza verdi',
        '{player} için transfer tamam, {club:dat} hoş geldin',
      ],
      en: [
        '{player} is {club:gen} new man!',
        'New chapter: {player} signs for {club}',
        'Transfer complete: welcome to {club}, {player}',
      ],
    },
    f: {
      tr: [
        'Kulüp sosyal medya hesapları imza videosunu paylaştı; beğeni sayısı saatler içinde on binleri aştı.',
        '{manager}, yeni transferi için kısa ve net konuştu: «Ondan çok şey bekliyoruz.»',
      ],
      en: [
        'The club’s social channels posted the signing video, which passed tens of thousands of likes within hours.',
        '{manager} was short and sweet on his new signing: “We expect a lot from him.”',
      ],
    },
  },
  transfer_free: {
    group: 'transfer',
    h: {
      tr: [
        'Bedelsiz bomba! {player}, {club} formasını giyiyor',
        '{player} bonservissiz {club:dat} geldi',
        'Cebe para girmedi ama gönüller yerinde: {player} {club:dat} imzayı attı',
      ],
      en: [
        'Free-agent bombshell! {player} pulls on a {club} shirt',
        '{player} arrives at {club} on a free',
        'No fee, plenty of noise: {player} signs for {club}',
      ],
    },
    f: {
      tr: [
        'Bonservis bedeli ödenmediği için kulüp maaşa ağırlık verdi; menajer {agent} «Bu iş herkesi memnun etti» dedi.',
        'Taraftarlar, bedelsiz gelen oyuncuyu «kasadan çıkmadan gelen hediye» olarak karşıladı.',
      ],
      en: [
        'With no fee to pay, the club leaned on wages; agent {agent} said: “This suits everybody.”',
        'Fans welcomed the free arrival as “a gift that never touched the safe.”',
      ],
    },
  },
  transfer_loan: {
    group: 'transfer',
    h: {
      tr: [
        '{player} kiralık olarak {club:dat} gitti',
        'Forma peşinde: {player}, {club:dat} kiralandı',
        '{player} için yeni durak: {club}',
      ],
      en: [
        '{player} heads to {club} on loan',
        'Chasing minutes: {player} loaned to {club}',
        'New stop for {player}: {club}',
      ],
    },
    f: {
      tr: [
        '«Oynayarak büyümek en iyisi» diyen {first}, kiralık dönemin kariyerinde dönüm noktası olacağına inanıyor.',
        'Menajer {agent}, süreç boyunca oyuncunun oynama süresini yakından takip edeceğini duyurdu.',
      ],
      en: [
        '“Growing by playing is the best way,” said {first}, convinced the loan will be a turning point.',
        'Agent {agent} said he would monitor the playing time closely throughout the spell.',
      ],
    },
  },
  transfer_renewal: {
    group: 'transfer',
    h: {
      tr: [
        '{player}, {club:gen} yanında kalmaya devam ediyor',
        'İmzalar yenilendi: {player} {club:dat} bağlandı',
        'Yönetimden hamle: {player} ile yeni sözleşme',
      ],
      en: [
        '{player} extends his stay at {club}',
        'Pens out: {player} commits to {club}',
        'Board move: new deal for {player}',
      ],
    },
    f: {
      tr: [
        '«Burası evim, devamı için heyecanlıyım» diyen {first}, taraftarlara teşekkür etti.',
        'Başkan, genç oyuncunun kulübün geleceği için kritik olduğunu vurguladı.',
      ],
      en: [
        '“This is my home, I am excited for what comes next,” said {first}, thanking the supporters.',
        'The chairman stressed that the youngster is critical to the club’s future.',
      ],
    },
  },
  transfer_trial: {
    group: 'transfer',
    h: {
      tr: [
        'Denemeyi geçti! {player}, {club:dat} ilk profesyonel imzasını attı',
        'Büyük hayal gerçek oluyor: {player} artık {club:gen} oyuncusu',
        '{player}, {club:gen} kapısını araladı',
      ],
      en: [
        'Trial passed! {player} signs first pro deal with {club}',
        'A big dream comes true: {player} is now a {club} player',
        '{player} opens the door at {club}',
      ],
    },
    f: {
      tr: [
        'Ailesiyle birlikte sözleşme masasına oturan {first}, gözyaşlarını tutamadı. «Annemi arayacağım» dedi.',
        '{hometown} semtinde sokak futbolundan profesyonelliğe uzanan yolculuk herkesin diline düştü.',
      ],
      en: [
        '{first} sat down at the contract table with his family and could not hold back tears: “I am going to call my mum.”',
        'The journey from street football in {hometown} to the professional game is on everyone’s lips.',
      ],
    },
  },
  sponsor: {
    group: 'none',
    h: {
      tr: [
        '{player} reklam yüzü oldu!',
        'Marka {player:acc} seçti: yeni sponsor anlaşması',
        'Kampanyanın yüzü {player}',
      ],
      en: [
        '{player} becomes the face of a brand!',
        'Brand picks {player}: new sponsorship deal',
        '{player} fronts the new campaign',
      ],
    },
    f: {
      tr: [
        'Sözleşmenin detayları gizli tutulsa da kulis bilgilerine göre rakam, yaşıtları arasında dikkat çekici.',
        'Menajer {agent}, markanın oyuncunun «sahadaki enerjisini ve saha dışı duruşunu» sevdiğini söyledi.',
      ],
      en: [
        'The details are under wraps, but sources say the figure stands out among his peers.',
        'Agent {agent} said the brand loves the player’s “energy on the pitch and attitude off it.”',
      ],
    },
  },
  injury: {
    group: 'injury',
    h: {
      tr: [
        'Kötü haber! {player} sakatlandı, {weeks} hafta yok',
        '{player} için geçmiş olsun: {weeks} hafta sahalardan uzak',
        'Sakatlık şoku: {player:gen} {weeks} haftalık yolculuğu başladı',
      ],
      en: [
        'Bad news! {player} injured, out for {weeks} weeks',
        'Get well soon, {player}: {weeks} weeks on the sidelines',
        'Injury blow: {player} faces {weeks} weeks out',
      ],
    },
    f: {
      tr: [
        'Kulüp doktoru ilk değerlendirmede «Tedaviye iyi yanıt veriyor, acele etmeyeceğiz» dedi.',
        '{manager} oyuncunun yokluğunu «büyük kayıp» diye nitelerken taraftarlar sosyal medyadan moral mesajları yağdırdı.',
        '{first} sosyal medyadan kısa bir mesaj yazdı: «Güçlü döneceğim.»',
      ],
      en: [
        'The club doctor said on first assessment: “He is responding well to treatment, we will not rush.”',
        '{manager} called the absence a “big loss” while fans flooded social media with messages of support.',
        '{first} posted a short note: “I will be back stronger.”',
      ],
    },
  },
  milestone_goal: {
    group: 'milestone',
    h: {
      tr: [
        '{player} {n}. golüyle tarihe geçti!',
        '{n}. gol geldi: {player} büyüyor!',
        'Rakam büyüyor: {player} kariyerinde {n} gole ulaştı',
      ],
      en: [
        '{player} reaches goal number {n}!',
        'Goal {n} lands: {player} is growing!',
        'The tally climbs: {player} hits {n} career goals',
      ],
    },
    f: {
      tr: [
        'Golden sonra topu cebine sokan oyuncu, «Bu sayıyı ailem için kaydediyorum» dedi.',
        '{pundit}: «Bu gidişle kimsenin tahmin etmediği rakamlara ulaşır.»',
      ],
      en: [
        'After the goal the player pocketed the match ball: “I am saving this number for my family.”',
        '{pundit}: “At this rate he will reach figures nobody predicted.”',
      ],
    },
  },
  award: {
    group: 'milestone',
    h: {
      tr: [
        '{player} ödüle doymuyor!',
        'Ödül töreninin adamı: {player}',
        '{player:gen} vitrinine yeni bir ödül daha',
      ],
      en: [
        '{player} cannot stop collecting awards!',
        'Man of the night at the awards: {player}',
        'Another prize for {player:gen} cabinet',
      ],
    },
    f: {
      tr: [
        'Törende kürsüye çıkan {first}, takım arkadaşlarına, ailesine ve taraftara teşekkür ederek konuşmasını bitirdi.',
        'Sosyal medya, ödülün hemen ardından tebrik mesajlarıyla doldu.',
      ],
      en: [
        'On stage {first} ended his speech by thanking teammates, family and supporters.',
        'Social media filled with congratulations within minutes of the announcement.',
      ],
    },
  },
  trophy: {
    group: 'milestone',
    h: {
      tr: [
        'Şampiyonluk coşkusu: {player} kupayı kaldırdı!',
        'Kupa {club:dat} geldi! Kahraman {player}',
        '{player} kariyerinin ilk büyük kupasına uzandı',
      ],
      en: [
        'Champions! {player} lifts the trophy!',
        'The cup comes to {club}! Hero: {player}',
        '{player} reaches for a first major trophy',
      ],
    },
    f: {
      tr: [
        'Şehir sokaklara döküldü; açık otobüsün tepesinde kupayı sallayan {first}, uzun süre unutulmayacak bir akşam yaşadı.',
        '{manager} kutlamalarda gözyaşlarına hâkim olamadı: «Bu çocuklar bunu hak etti.»',
      ],
      en: [
        'The city poured into the streets; {first}, waving the cup from the open-top bus, lived an evening that will not be forgotten soon.',
        '{manager} fought back tears during the celebrations: “These lads deserve it.”',
      ],
    },
  },
  league_champion: {
    group: 'league',
    h: {
      tr: [
        'Zirvenin sahibi belli oldu: {team}!',
        '{team} şampiyonluğu ilan etti',
        'Şampiyon {team}: {comp} taçlandı',
      ],
      en: [
        'The champions are crowned: {team}!',
        '{team} seal the title',
        '{team} win {comp}',
      ],
    },
    f: {
      tr: [
        'Kutlamalar sabaha kadar sürdü; kentin meydanlarında flamalar yakıldı, havai fişekler gökyüzünü aydınlattı.',
        '{pundit}: «Bu sezon şampiyonluk bir tesadüf değil, planın ve emeğin sonucuydu.»',
      ],
      en: [
        'Celebrations ran until sunrise; flares were lit in the squares and fireworks lit the sky.',
        '{pundit}: “This title was no coincidence, it was the product of a plan and a lot of graft.”',
      ],
    },
  },
  transfer_rumour: {
    group: 'transfer',
    h: {
      tr: [
        'Dev kulüp harekete geçti! {other} {player:acc} istiyor',
        '{other:gen} radarında {player}: {fee} civarı teklif',
        '{player} için transfer kapıdan göründü',
        'Transfer iddiası: {other}, {player} için masada',
      ],
      en: [
        'Big club on the move! {other} want {player}',
        '{player} on {other:gen} radar: offer around {fee}',
        'Transfer storm brewing around {player}',
        'Transfer claim: {other} table a bid for {player}',
      ],
    },
    f: {
      tr: [
        'Konu hakkında konuşan menajer {agent} «Her zaman olduğu gibi tüm seçenekleri değerlendiriyoruz» dedi.',
        '{club} cephesi ise sessiz; yönetim kulis bilgilerini yorumlamaktan kaçındı.',
        'Taraftarlar sosyal medyada ikiye bölündü: kimi «Gitmesin» diyor, kimi «Büyük kulübe yakışır» yorumunu yapıyor.',
      ],
      en: [
        'Agent {agent} said only: “As always, we weigh every option.”',
        'The {club} camp is silent; the board declined to comment on the speculation.',
        'Supporters are split online: some begging him to stay, others saying he belongs at a bigger club.',
      ],
    },
  },
  gossip_user: {
    group: 'transfer',
    h: {
      tr: [
        'Kulis: {other} {player:gen} peşinde!',
        'Transfer iddiası: {player} için {other} devrede',
        '{other:gen} listesinde bir numara: {player}',
      ],
      en: [
        'Whispers: {other} are chasing {player}!',
        'Claim: {other} step in for {player}',
        '{player} is number one on {other:gen} shortlist',
      ],
    },
    f: {
      tr: [
        'İddialar henüz doğrulanmadı; ilgili kulüp yetkilileri konuya yorum yapmadı.',
        '{agent} cephesinden gelen yanıt kısa oldu: «Telefonlar çalıyor, doğru.»',
      ],
      en: [
        'The claims are unconfirmed; officials of the interested club declined to comment.',
        'The reply from the {agent} camp was short: “The phones are ringing, that much is true.”',
      ],
    },
  },
  callup_first: {
    group: 'milestone',
    h: {
      tr: [
        'İlk kez milli takımda! {player} {team} kadrosunda',
        '{player} için büyük gün: {team} kapısı açıldı',
        'Hayal gerçek: {player} {team} forması giyecek',
      ],
      en: [
        'First call-up! {player} named in the {team} squad',
        'Big day for {player}: the {team} door swings open',
        'Dream come true: {player} will wear the {team} shirt',
      ],
    },
    f: {
      tr: [
        'Haberi aldığında ilk olarak ailesini arayan {first}, «Bu forma için doğdum» dedi.',
        'Millî takım hocası genç oyuncunun seçilmesini «formunun ve cesaretinin ödülü» diye açıkladı.',
      ],
      en: [
        'The first person {first} called on hearing the news was his family: “I was born for this shirt.”',
        'The national manager described the selection as “a reward for his form and courage.”',
      ],
    },
  },
  callup: {
    group: 'milestone',
    h: {
      tr: [
        '{player} yeniden {team} kadrosunda',
        'Millî davet geldi: {player} yine listede',
        '{team} kadrosunda {player} sürprizi yok, güven var',
      ],
      en: [
        '{player} named in the {team} squad again',
        'National call arrives: {player} on the list once more',
        'No surprise, just trust: {player} is in the {team} squad',
      ],
    },
    f: {
      tr: [
        '{club} taraftarları, genç oyuncunun milli takımdaki yükselişini gururla izliyor.',
        'Millî takım hocası, {first} için «Bizim planlarımızın önemli bir parçası» dedi.',
      ],
      en: [
        '{club} supporters watch his rise with national colours with pride.',
        'The national manager called {first} “an important part of our plans.”',
      ],
    },
  },
  generic_user: {
    group: 'none',
    h: {
      tr: [
        '{player} gündemde',
        '{player} hakkında yeni gelişme',
        'Gözler {player} üzerinde',
      ],
      en: [
        '{player} in the headlines',
        'New development around {player}',
        'All eyes on {player}',
      ],
    },
    f: {
      tr: [
        '{club} çevrelerinde konunun yakından takip edildiği belirtiliyor.',
        'Taraftarlar gelişmeyi sosyal medyadan tartışmaya devam ediyor.',
      ],
      en: [
        'Sources around {club} say the matter is being followed closely.',
        'Fans keep debating the development online.',
      ],
    },
  },
  generic_other: {
    group: 'league',
    h: {
      tr: [
        'Ligde gündem değişiyor',
        'Haftanın konuşulan gelişmesi',
        'Futbol dünyasında sıcak gelişme',
      ],
      en: [
        'The league agenda shifts',
        'Talking point of the week',
        'Hot development in the football world',
      ],
    },
    f: {
      tr: [
        '{pundit} gelişmeyi «sezonun gidişatını etkileyebilecek bir detay» olarak yorumladı.',
        'Taraftar forumları bu konuyla çalkalanıyor.',
      ],
      en: [
        '{pundit} called it “a detail that could shape the course of the season.”',
        'Supporter forums are buzzing about it.',
      ],
    },
  },
};
