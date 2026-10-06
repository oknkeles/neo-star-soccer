/**
 * News banks, part 3: league round-ups, the rival, and storyline beats.
 * Slots in trailer data: team team2 person n score streak pts gap weeks …
 */
import type { NewsEntry } from './news_match';

export const NEWS_STORY: Record<string, NewsEntry> = {
  // ───────── league round-ups ─────────
  upset: {
    group: 'league',
    h: {
      tr: [
        'Sürpriz! {team}, {team2:acc} {score} devirdi',
        '{team2} büyük şok yaşadı: {team} karşısında {score}',
        'Büyük sürpriz: küçük {team}, dev {team2:acc} yıktı',
        'Hafta sonu sürprizi: {team} {team2:abl} {score} kazandı',
      ],
      en: [
        'Shock! {team} beat {team2} {score}',
        '{team2} stunned: {score} defeat at {team}',
        'Giant-killing: little {team} topple big {team2}',
        'Weekend upset: {team} win {score} against {team2}',
      ],
    },
    f: {
      tr: [
        '{pundit} «Kâğıt üzerinde herkes {team2:acc} favori görüyordu ama futbol kâğıtta oynanmıyor» dedi.',
        'Kaybeden tarafta soyunma odası sessizliğe gömüldü; taraftarlar yönetimi hedef aldı.',
      ],
      en: [
        '{pundit}: “On paper everyone had {team2} as favourites, but football is not played on paper.”',
        'The dressing room on the losing side fell silent while supporters aimed their anger at the board.',
      ],
    },
  },
  thrashing: {
    group: 'league',
    h: {
      tr: [
        'Gol yağmuru! {team}, {team2:acc} {score} ezdi',
        '{team2} paramparça: {team} karşısında {score}',
        '{team} fark attı: {score}',
      ],
      en: [
        'Goal feast! {team} crush {team2} {score}',
        '{team2} in tatters: {score} defeat against {team}',
        '{team} run riot: {score}',
      ],
    },
    f: {
      tr: [
        'Maçın ardından kaybeden takımın hocası «Utanç verici bir geceydi, özür dilerim» dedi.',
        'Tribünlerde taraftarlar yer yer stadı terk etti; kazanan taraftar ise şarkılarla sahneyi doldurdu.',
      ],
      en: [
        'The losing manager admitted afterwards: “An embarrassing night, I apologise.”',
        'Some home fans left early, while the travelling support filled the night with songs.',
      ],
    },
  },
  leader_change: {
    group: 'league',
    h: {
      tr: [
        'Zirvede el değiştirdi! Yeni lider {team}',
        '{team} liderliğe oturdu',
        'Tahtın yeni sahibi: {team} ({pts} puan)',
      ],
      en: [
        'Change at the top! {team} are the new leaders',
        '{team} take over at the summit',
        'New king of the hill: {team} on {pts} points',
      ],
    },
    f: {
      tr: [
        'Lider takımın hocası «Henüz çok erken, ayaklarımız yerde» diyerek sakin kalmaya çalıştı.',
        'Rakipler arasında liderliğe oynayan takımların sayısı gün geçtikçe artıyor.',
      ],
      en: [
        'The leaders’ manager tried to stay calm: “It is far too early, our feet are on the ground.”',
        'The number of teams in the title mix grows with every passing week.',
      ],
    },
  },
  win_streak: {
    group: 'league',
    h: {
      tr: [
        '{team} durdurulamıyor: üst üste {streak}. galibiyet!',
        '{streak} maçtır kaybetmeyen {team} ligin kâbusu',
        'Seri sürüyor: {team} {streak} maçlık galibiyet serisinde',
      ],
      en: [
        '{team} unstoppable: {streak} wins in a row!',
        '{team}, unbeaten in {streak}, are the league’s nightmare',
        'The run goes on: {team} win again, {streak} straight',
      ],
    },
    f: {
      tr: [
        'Serinin sırrını soran gazetecilere hoca «Çalışma, çalışma, bir de çalışma» yanıtını verdi.',
        'Rakip teknik direktörler bu takıma karşı artık daha tedbirli girmeyi planlıyor.',
      ],
      en: [
        'Asked for the secret of the streak, the manager answered: “Work, work and more work.”',
        'Rival coaches are already planning a more cautious approach against them.',
      ],
    },
  },
  scorer_race: {
    group: 'league',
    h: {
      tr: [
        'Gol krallığında {person} fırtınası: {n} gol',
        '{person} {n} golle gol krallığı yarışında önde',
        'Krallık yarışı kızışıyor: zirvede {person} ({n} gol)',
      ],
      en: [
        'Golden Boot race: {person} storms on to {n} goals',
        '{person} leads the scoring charts with {n}',
        'Top-scorer race heats up: {person} on {n}',
      ],
    },
    f: {
      tr: [
        '{pundit} «Bu tempoyla sezon sonunda çok yüksek bir rakama ulaşabilir» dedi.',
        'Takipçilerinin farkı birkaç golle sınırlı; kral kim olacak, ligin en büyük merak konusu.',
      ],
      en: [
        '{pundit}: “At this pace he could finish the season with a huge total.”',
        'The chasing pack is only a few goals back; who will take the crown is the great question.',
      ],
    },
  },
  title_race: {
    group: 'league',
    h: {
      tr: [
        'Şampiyonluk yarışı kızıştı: fark sadece {gap} puan!',
        'Zirve savaşı: {team} ile {team2} arasında nefes nefese mücadele',
        'Zirvede kıran kırana: {team} lider, {team2} nefesini ensesinde hissettiriyor',
      ],
      en: [
        'Title race tightens: only {gap} points between them!',
        'Battle at the top: {team} and {team2} locked in a duel',
        '{team} lead, but {team2} are breathing down their necks',
      ],
    },
    f: {
      tr: [
        'Kalan haftalarda kritik virajlar var; iki takımın taraftarı da artık geceleri uyuyamıyor.',
        '{pundit}: «Bu şampiyonluk sinirlerin savaşı olacak.»',
      ],
      en: [
        'Crucial bends lie ahead in the run-in; fans of both clubs are losing sleep.',
        '{pundit}: “This title will be decided by nerves.”',
      ],
    },
  },
  relegation_fight: {
    group: 'league',
    h: {
      tr: [
        'Düşme hattında panik: {team} son sıralara geriledi',
        '{team} için kritik virajlar: küme düşme tehlikesi kapıda',
        'Yönetim istifa! {team} taraftarı hesap soruyor',
      ],
      en: [
        'Panic in the drop zone: {team} slip into the bottom places',
        'Critical weeks for {team}: relegation is knocking',
        'Board out! {team} fans demand answers',
      ],
    },
    f: {
      tr: [
        'Tribünlerde protesto pankartları açıldı, antrenman tesislerine giden yolda taraftar eylem yaptı.',
        'Hoca ise «Sonuna kadar savaşacağız, bu takımın kalitesi buna yeter» dedi.',
      ],
      en: [
        'Protest banners were unfurled in the stands and fans demonstrated on the road to the training ground.',
        'The manager insisted: “We will fight to the end, this squad has the quality to survive.”',
      ],
    },
  },
  apps_milestone: {
    group: 'milestone',
    h: {
      tr: [
        '{player} {n}. maçına çıktı',
        '{n}. maç: {player} sahada olgunlaşıyor',
        'Sayılar büyüyor: {player:gen} {n}. profesyonel maçı',
      ],
      en: [
        '{player} makes appearance number {n}',
        'Game {n}: {player} is maturing on the pitch',
        'The numbers grow: {player:gen} {n}th professional match',
      ],
    },
    f: {
      tr: [
        '{manager} oyuncu için «Her hafta bir basamak daha çıkıyor» dedi.',
        'Takım arkadaşları maç sonu soyunma odasında küçük bir pastayla sürpriz yaptı.',
      ],
      en: [
        '{manager} said of the player: “He climbs another step every week.”',
        'Teammates surprised him with a small cake in the dressing room after the match.',
      ],
    },
  },
  season_goals: {
    group: 'milestone',
    h: {
      tr: [
        '{player} sezonun {n}. golünü attı!',
        'Gol makinesi {player}: sezonda {n} gole ulaştı',
        '{player} çift hanelere çıktı: {n} gol',
      ],
      en: [
        '{player} bags his {n}th of the season!',
        'Goal machine {player}: {n} for the campaign',
        '{player} reaches {n} goals this season',
      ],
    },
    f: {
      tr: [
        'Tribünlerde “Gol {first}, gol!” tezahüratı yankılandı.',
        'Menajer {agent} rakamı «henüz başlangıç» diye değerlendirdi.',
      ],
      en: [
        'Chants of “{first}, {first}, give us a goal!” echoed through the stands.',
        'Agent {agent} called the figure “just the beginning.”',
      ],
    },
  },

  // ───────── the rival ─────────
  rival_goals: {
    group: 'story',
    h: {
      tr: [
        'Ezeli rakip {rival} durmuyor: {team} formasıyla {n} gol!',
        '{rival} şov yaptı! {n} golle manşetlerde',
        '{rival}’den cevap geldi: bu hafta {n} gol attı',
      ],
      en: [
        'Old rival {rival} on fire: {n} goals for {team}!',
        '{rival} steals the show with {n} goals',
        '{rival} answers back: {n} goals this week',
      ],
    },
    f: {
      tr: [
        'Gazeteler artık {player} - {rival} kıyaslamasını manşete taşıyor; iki genç oyuncunun düellosu ülkenin gündeminde.',
        '{rival} golden sonra kameraya yönelip kısa bir mesaj verdi; yorumcular mesajın kime gittiğini tartışıyor.',
      ],
      en: [
        'The papers now splash the {player} versus {rival} comparison across their front pages; the duel of the two youngsters is the talk of the nation.',
        'After scoring {rival} turned to the camera with a short message; pundits are debating who it was for.',
      ],
    },
  },
  rival_move: {
    group: 'story',
    h: {
      tr: [
        '{rival} takım değiştirdi: yeni adres {team}',
        'Rakip kampta hareket: {rival} {team2} yolundan {team} yolunu tuttu',
        'Transfer: {rival} artık {team:gen} oyuncusu',
      ],
      en: [
        '{rival} moves on: new address {team}',
        'Stir in the rival camp: {rival} leaves {team2} for {team}',
        'Transfer: {rival} is now a {team} player',
      ],
    },
    f: {
      tr: [
        '{player} cephesinden ilk açıklama kısa oldu: «Yolu açık olsun, sahada görüşürüz.»',
        'Yorumcular iki oyuncunun artık farklı sahnelerde aynı rekabeti sürdüreceğini belirtiyor.',
      ],
      en: [
        'The first reaction from {player}’s side was brief: “Good luck to him, see you on the pitch.”',
        'Pundits note that the two will continue the same rivalry on different stages.',
      ],
    },
  },
  rival_injury: {
    group: 'injury',
    h: {
      tr: [
        '{rival} sakatlandı: {weeks} hafta yok',
        'Rakip kampta geçmiş olsun: {rival} {weeks} hafta sahalardan uzak',
        '{rival} için kötü haber: {team} umutları sarsıldı',
      ],
      en: [
        '{rival} injured: out for {weeks} weeks',
        'Bad news in the rival camp: {rival} faces {weeks} weeks out',
        'Blow for {team}: {rival} sidelined',
      ],
    },
    f: {
      tr: [
        '{player}, rakibine sosyal medyadan geçmiş olsun mesajı gönderdi; rekabetin ötesinde bir centilmenlik örneği olarak yorumlandı.',
        'Uzmanlar, iki genç yıldızın yarışında bu sakatlığın ibreyi değiştirebileceğini söylüyor.',
      ],
      en: [
        '{player} sent a get-well message to his rival online, hailed as a gentlemanly gesture beyond the rivalry.',
        'Experts say the injury could tip the balance in the race between the two young stars.',
      ],
    },
  },
  rival_buildup: {
    group: 'story',
    h: {
      tr: [
        'Yüzyılın düellosu! {player} ile {rival} karşı karşıya',
        '{player} - {rival}: söz sahada!',
        'Genç yeteneklerin savaşı: {player} {rival:abl} bir adım önde mi?',
      ],
      en: [
        'Duel of the era! {player} meets {rival}',
        '{player} versus {rival}: let the pitch decide!',
        'Battle of the young guns: is {player} a step ahead of {rival}?',
      ],
    },
    f: {
      tr: [
        'Biri {club}, diğeri {rivalClub} forması giyen iki yıldızın hikâyesi yıllar önce başlamıştı. Şimdi sahne büyüdü.',
        '{pundit}: «Bu maçta iki oyuncu da kendi ölçüsünü gösterecek.»',
      ],
      en: [
        'One in {club} colours, the other in {rivalClub}’s, the two stars’ story began years ago. Now the stage has grown.',
        '{pundit}: “Both players will show their true measure in this game.”',
      ],
    },
  },
  rival_result_win: {
    group: 'story',
    h: {
      tr: [
        'Düelloyu {player} kazandı! {rival} karşısında gülen taraf belli',
        '{player}, {rival:acc} sahada sustursu: {score}',
        'Rekabette puan {player:gen}: {rival} boyun eğdi',
      ],
      en: [
        '{player} wins the duel! The last laugh against {rival}',
        '{player} silences {rival} on the pitch: {score}',
        'Point to {player} in the rivalry: {rival} bows out',
      ],
    },
    f: {
      tr: [
        'Maç sonunda iki oyuncu tünelde karşılaştı; kameralar sadece sert bir bakışmayı yakalayabildi.',
        '{rival} mixed zone’dan konuşmadan geçti, {first} ise «Skor tabelası her şeyi anlatıyor» dedi.',
      ],
      en: [
        'The two players met in the tunnel after the whistle; cameras caught only a hard stare.',
        '{rival} walked through the mixed zone in silence, while {first} said: “The scoreboard tells the whole story.”',
      ],
    },
  },
  rival_result_loss: {
    group: 'story',
    h: {
      tr: [
        'Düelloyu {rival} aldı! {player} için zor gece',
        '{rival}, {player:acc} gölgede bıraktı: {score}',
        'Rekabette puan {rival:gen}: {player} cevap arıyor',
      ],
      en: [
        '{rival} takes the duel! A hard night for {player}',
        '{rival} outshines {player}: {score}',
        'Point to {rival} in the rivalry: {player} looks for answers',
      ],
    },
    f: {
      tr: [
        '{rival} golden sonra susma işareti yapınca tribünler karıştı; hakem olayı sakin kapattı.',
        '{first} soyunma odasında uzun süre başı önünde oturdu. «Rövanşı alacağım» dediği duyuldu.',
      ],
      en: [
        'The stands erupted when {rival} cupped an ear after scoring; the referee calmed things down.',
        '{first} sat head bowed in the dressing room for a long time. He was heard to say: “I will get my revenge.”',
      ],
    },
  },
  rival_resolved: {
    group: 'story',
    h: {
      tr: [
        '{player} ile {rival} arasında buzlar eridi',
        'Ezeli rakipler el sıkıştı: {player} - {rival} barışı',
        'Rekabetin sonu mu? {player} ve {rival} birbirine saygı duruşu yaptı',
      ],
      en: [
        'The ice melts between {player} and {rival}',
        'Old rivals shake hands: {player} and {rival} make peace',
        'End of a rivalry? {player} and {rival} show mutual respect',
      ],
    },
    f: {
      tr: [
        'İki oyuncunun yıllardır süren çekişmesi futbolseverlere unutulmaz anlar yaşattı.',
        '{pundit}: «Büyük rekabetler büyük oyuncular yaratır; bunlar da onlardan.»',
      ],
      en: [
        'The years-long duel between the two gave football fans unforgettable moments.',
        '{pundit}: “Great rivalries make great players, and these two are the proof.”',
      ],
    },
  },

  // ───────── mentor ─────────
  mentor_praise: {
    group: 'story',
    h: {
      tr: [
        'Tecrübeli {mentor}’dan {player:dat} büyük övgü',
        '{mentor}: «Bu çocuk gelecek»',
        '{mentor} genç {player:acc} kanatları altına aldı',
      ],
      en: [
        'Veteran {mentor} showers praise on {player}',
        '{mentor}: “This kid is the future”',
        '{mentor} takes young {player} under his wing',
      ],
    },
    f: {
      tr: [
        'Soyunma odasının tecrübeli ismi, genç yeteneğe hem sahada hem sahada dışında yol göstermeyi sürdürüyor.',
        '{player}, usta oyuncuya «Bana yaşadığım şeyleri öğretiyor» diyerek teşekkür etti.',
      ],
      en: [
        'The experienced figure of the dressing room keeps guiding the young talent both on and off the pitch.',
        '{player} thanked the veteran: “He is teaching me what he has lived through.”',
      ],
    },
  },
  mentor_farewell: {
    group: 'story',
    h: {
      tr: [
        '{mentor} futbola veda ediyor: gözyaşlarıyla uğurlandı',
        'Bir devrin sonu: {mentor} kramponlarını astı',
        'Usta oyuncu {mentor} sahalara veda etti, {player} törende ağladı',
      ],
      en: [
        '{mentor} bids farewell to football in tears',
        'End of an era: {mentor} hangs up his boots',
        'Veteran {mentor} retires, {player} cries at the ceremony',
      ],
    },
    f: {
      tr: [
        'Veda töreninde tribünler ayağa kalktı; {mentor} sahadan çıkarken en uzun sarılmayı {first} ile yaptı.',
        '«Ona söyleyeceklerimi sahada söyledim, gerisini zaman gösterecek» diyen {mentor}, ayrılırken sadece gülümsedi.',
      ],
      en: [
        'The stands rose as {mentor} left the pitch, sharing his longest hug with {first}.',
        '“I said what I had to say on the pitch, time will show the rest,” {mentor} said, smiling as he left.',
      ],
    },
  },

  // ───────── hometown ─────────
  hometown_call: {
    group: 'story',
    h: {
      tr: [
        'Memleketin çağrısı: {hometown} {player:acc} geri istiyor',
        '{hometown} taraftarından {player:dat} çağrı: «Evine dön!»',
        'Sıla hasreti: {player} ve {hometown} arasındaki bağ ısınıyor',
      ],
      en: [
        'The call of home: {hometown} want {player} back',
        '{hometown} fans to {player}: “Come back home!”',
        'Homesick? {player} and {hometown} warm to one another',
      ],
    },
    f: {
      tr: [
        'Eski mahallenin duvarlarına {player} grafitileri çizildi; semt esnafı «Bizim çocuk» pankartları hazırlıyor.',
        'Menajer {agent} ise konuya «Şu an gündemimizde yok, ama romantizme de karşı değiliz» diyerek yanıt verdi.',
      ],
      en: [
        'Murals of {player} have appeared on the old neighbourhood’s walls; local shopkeepers are preparing “our boy” banners.',
        'Agent {agent} replied: “It is not on our agenda right now, but we are not against romance either.”',
      ],
    },
  },

  // ───────── manager feud ─────────
  feud_public: {
    group: 'story',
    h: {
      tr: [
        'Hoca ile yıldız arasında soğuk savaş: {manager} - {player} krizi',
        'Kulüpte kriz! {player} kadro dışı mı kalacak?',
        '{manager} ve {player} arasında gerginlik yönetime taşındı',
      ],
      en: [
        'Cold war at the club: {manager} versus {player}',
        'Crisis! Is {player} heading for the exit door?',
        'Tension between {manager} and {player} reaches the boardroom',
      ],
    },
    f: {
      tr: [
        'Kulis bilgilerine göre iki ismin antrenmanda göz göze gelmediği, selamın bile soğuk olduğu konuşuluyor.',
        '{pundit}: «Bu tür krizler genellikle ya büyük bir barışla ya da bir ayrılıkla biter.»',
      ],
      en: [
        'Sources say the pair avoid eye contact at training and even greetings are frosty.',
        '{pundit}: “Crises like this usually end with either a big reconciliation or a parting of the ways.”',
      ],
    },
  },
  feud_resolved: {
    group: 'story',
    h: {
      tr: [
        'Buzlar eridi: {manager} ve {player} barıştı',
        '{player} - {manager} krizi sona erdi',
        'Tünelde sarılma! {manager} ve {player} el sıkıştı',
      ],
      en: [
        'Ice thaws: {manager} and {player} make up',
        'The {player}-{manager} crisis is over',
        'Hug in the tunnel! {manager} and {player} bury the hatchet',
      ],
    },
    f: {
      tr: [
        'İki isim de basına yaptığı açıklamada «Takımın çıkarı her şeyin üstünde» dedi.',
        'Taraftarlar, uzun süredir beklenen barış haberini tezahüratla karşıladı.',
      ],
      en: [
        'Both men said in statements to the press: “The team’s interests come before everything.”',
        'Fans welcomed the long-awaited peace with a roar of chants.',
      ],
    },
  },

  // ───────── love ─────────
  love_tabloid: {
    group: 'story',
    h: {
      tr: [
        'Aşk mı var? {player} ve {partner} objektiflere yakalandı!',
        'Magazin dünyası kaynıyor: {player} {partner} ile görüntülendi',
        'Kalpler çarpıyor: {player} ve {partner} el ele',
      ],
      en: [
        'Love in the air? {player} and {partner} caught on camera!',
        'Gossip pages buzzing: {player} spotted with {partner}',
        'Hearts racing: {player} and {partner}, hand in hand',
      ],
    },
    f: {
      tr: [
        'Yakın çevreleri çiftin «birbirine gerçekten değer verdiğini» söylüyor. Tabloların peşi ise bırakmıyor.',
        'Fotoğraflar sosyal medyada birkaç saatte yüz binlerce kez paylaşıldı.',
      ],
      en: [
        'People close to them say the couple “truly care about each other.” The tabloids are not letting up.',
        'The photos were shared hundreds of thousands of times within hours.',
      ],
    },
  },
  love_engaged: {
    group: 'story',
    h: {
      tr: [
        'Yüzükler takıldı! {player} ve {partner} nişanlandı',
        '{player} dünya evine giriyor: {partner} «evet» dedi',
        'Mutlu haber: {player} - {partner} çifti nişanlandı',
      ],
      en: [
        'Rings exchanged! {player} and {partner} are engaged',
        '{player} pops the question: {partner} said yes',
        'Happy news: {player} and {partner} are engaged',
      ],
    },
    f: {
      tr: [
        'Çift, yakın aile ve dostlarla kutlama yaptı; takım arkadaşları sürpriz bir tezahüratla tebrik etti.',
        'Sosyal medyada binlerce tebrik mesajı yağdı.',
      ],
      en: [
        'The couple celebrated with close family and friends; teammates congratulated them with a surprise chant.',
        'Thousands of congratulations poured in on social media.',
      ],
    },
  },
  love_split: {
    group: 'story',
    h: {
      tr: [
        'Ayrılık haberi: {player} ve {partner} yollarını ayırdı',
        'Magazinde sürpriz: {player} - {partner} çifti bitti',
        '{player} yalnız kaldı: {partner} ile yollar ayrıldı',
      ],
      en: [
        'Split news: {player} and {partner} go their separate ways',
        'Gossip shock: {player} and {partner} are over',
        '{player} single again: the road ends with {partner}',
      ],
    },
    f: {
      tr: [
        'Yakın çevre ayrılığın «karşılıklı ve olgun» yaşandığını anlatıyor; taraftarlar ise sosyal medyada moral mesajları gönderiyor.',
        'Oyuncunun önümüzdeki maçlara odaklanacağı belirtiliyor.',
      ],
      en: [
        'Those close to them say the split was “mutual and mature”, while fans send support on social media.',
        'The player is said to be focusing on the matches ahead.',
      ],
    },
  },

  // ───────── scandal ─────────
  scandal_break: {
    group: 'story',
    h: {
      tr: [
        'Skandal! {player} hakkında şok iddialar',
        'Yönetim toplandı: {player} krizi büyüyor',
        '{player} cephesinde fırtına: gazeteler aynı manşette',
      ],
      en: [
        'Scandal! Shock claims about {player}',
        'Board meets: the {player} crisis deepens',
        'Storm around {player}: every paper has the same headline',
      ],
    },
    f: {
      tr: [
        'Kulüp, oyuncunun savunmasını aldıktan sonra açıklama yapacağını duyurdu. Sponsorlar “yakından takip ediyoruz” demekle yetindi.',
        'Taraftarlar ikiye bölündü: kimi «Hepsi tezgâh» diyor, kimi «Bu kadarı da fazla.»',
      ],
      en: [
        'The club said it will comment after hearing the player’s side. Sponsors said only that they are “following closely.”',
        'Supporters are split: some cry “It’s all a stitch-up”, others say “this is too much.”',
      ],
    },
  },
  scandal_fade: {
    group: 'story',
    h: {
      tr: [
        'Fırtına dindi: {player} yeniden futbolu konuşuyor',
        'Skandalın ardından sayfa çevrildi: {player} sahaya odaklandı',
        '{player}: «Konu kapandı, şimdi sadece gol var»',
      ],
      en: [
        'Storm passes: {player} is talking football again',
        'Page turned after the scandal: {player} focuses on the pitch',
        '{player}: “That is closed, now it’s only about goals”',
      ],
    },
    f: {
      tr: [
        'Taraftarlar yeniden tribünde; kulüp yönetimi oyuncuya desteğini yeniledi.',
        'Medya artık gündemi başka konulara kaydırdı; ama bazı yazarlar «unutmadık» demeyi sürdürüyor.',
      ],
      en: [
        'Fans are back in the stands; the board has renewed its support for the player.',
        'The media has moved on to other topics, though a few columnists keep saying “we have not forgotten.”',
      ],
    },
  },

  // ───────── comeback ─────────
  comeback_return: {
    group: 'story',
    h: {
      tr: [
        'Hoş geldin {player}! Sakatlıktan döndü',
        'Küllerinden doğdu: {player} sahalara geri döndü',
        '{player} geri döndü: tribünler ayağa kalktı',
      ],
      en: [
        'Welcome back {player}! Returns from injury',
        'Rises from the ashes: {player} is back on the pitch',
        '{player} is back: the stands rise to their feet',
      ],
    },
    f: {
      tr: [
        'Uzun tedavi sürecinin ardından ilk kez forma giyen oyuncu, tribünün selamına elini kalbine koyarak karşılık verdi.',
        'Fizyoterapistler, oyuncunun «tarif edilen programın bir gün bile dışına çıkmadığını» söyledi.',
      ],
      en: [
        'After a long rehabilitation the player pulled on the shirt again and answered the crowd’s salute with a hand on his heart.',
        'The physios said he “never missed a single day of the programme.”',
      ],
    },
  },
  comeback_setback: {
    group: 'injury',
    h: {
      tr: [
        'Tedavide aksilik: {player:gen} dönüşü gecikebilir',
        '{player} için endişe: iyileşme beklenenden uzun sürüyor',
        'Moraller bozuk: {player} sakatlıkla boğuşuyor',
      ],
      en: [
        'Setback in treatment: {player:gen} return may be delayed',
        'Worry over {player}: recovery is taking longer than expected',
        'Spirits low as {player} wrestles with injury',
      ],
    },
    f: {
      tr: [
        'Kulüp doktorları «Sabır ve istikrar bu sürecin anahtarı» dedi.',
        'Taraftarlar sosyal medyada «#YanındayızDeniz» benzeri destek etiketleri açtı.',
      ],
      en: [
        'Club doctors said: “Patience and consistency are the keys to this process.”',
        'Fans started supportive hashtags on social media.',
      ],
    },
  },

  // ───────── wonderkid ─────────
  wonderkid_buzz: {
    group: 'story',
    h: {
      tr: [
        'Altyapıdan yeni yıldız: {person} {player:gen} yerine göz dikti',
        'Genç {person} patladı! {player} için rekabet başladı',
        '{club:gen} yeni gözdesi {person}: «Hedefim ilk 11»',
      ],
      en: [
        'New academy star: {person} has {player:gen} shirt in his sights',
        'Young {person} explodes! Competition for {player} begins',
        '{club:gen} new darling {person}: “My target is the first XI”',
      ],
    },
    f: {
      tr: [
        'Teknik direktör {manager}, «Rekabet her zaman iyidir» diyerek iki oyuncuya da eşit şans vereceğini duyurdu.',
        'Tribünlerde {person} için yeni tezahüratlar bile türedi; {player} bu rekabeti yakından takip ediyor.',
      ],
      en: [
        'Manager {manager} said “competition is always healthy”, promising both players an equal chance.',
        'The terraces have even coined new chants for {person}; {player} is watching the contest closely.',
      ],
    },
  },
  wonderkid_loan: {
    group: 'story',
    h: {
      tr: [
        '{person} kiralık gidiyor: {player} yerini korudu',
        'Veliaht yolcu: {person} tecrübe için kiralandı',
        '{club} genç yeteneği {person:acc} kiraya verdi',
      ],
      en: [
        '{person} heads out on loan: {player} keeps his place',
        'Heir apparent leaves: {person} loaned for experience',
        '{club} send young {person} out on loan',
      ],
    },
    f: {
      tr: [
        'Genç oyuncu veda mesajında «Bu formaya döneceğim» dedi.',
        '{manager} kararı «oyuncunun gelişimi için en doğrusu» diye açıkladı.',
      ],
      en: [
        'In his farewell message the youngster promised: “I will be back in this shirt.”',
        '{manager} explained the decision as “best for the player’s development.”',
      ],
    },
  },

  // ───────── agent ─────────
  agent_split: {
    group: 'story',
    h: {
      tr: [
        '{player} menajeriyle yollarını ayırdı',
        'Menajer krizi: {agent} ile {player} yolları ayırdı',
        'Kulis: {player} yeni bir menajerle çalışacak',
      ],
      en: [
        '{player} parts ways with his agent',
        'Agent crisis: {agent} and {player} split',
        'Whispers: {player} to work with a new agent',
      ],
    },
    f: {
      tr: [
        'Ayrılığın nedeni olarak «güven sorunları» gösterildi; iki taraf da ayrıntı vermekten kaçındı.',
        'Piyasadaki birçok menajer oyuncuyla temas kurmak için sıraya girdi.',
      ],
      en: [
        '“Trust issues” were cited as the reason; neither side offered details.',
        'Many agents on the market are already queueing to make contact with the player.',
      ],
    },
  },

  // ───────── national team ─────────
  golden_call: {
    group: 'story',
    h: {
      tr: [
        'Altın jenerasyon doğuyor: {player} millî takımın yeni yıldızlarından',
        'Millî takımda yeni bir kuşak: başında {player}',
        '{nation} için parlak gelecek: {player} ve arkadaşları',
      ],
      en: [
        'A golden generation is born: {player} among the national team’s new stars',
        'New wave for the national side, led by {player}',
        'Bright future for {nation}: {player} and friends',
      ],
    },
    f: {
      tr: [
        'Federasyon yetkilileri genç yeteneklerin yan yana gelmesini «yılların hayali» olarak değerlendirdi.',
        'Taraftarlar, bu kuşakla büyük turnuvalarda hayal kurmaya başladı.',
      ],
      en: [
        'Federation officials called the coming together of these young talents “a dream years in the making.”',
        'Supporters have begun to dream about big tournaments with this generation.',
      ],
    },
  },

  // ───────── underdog title race ─────────
  underdog_rise: {
    group: 'story',
    h: {
      tr: [
        'Masal gerçek oluyor! {club} zirve yarışında',
        'Kimse şans vermemişti: {club} liderlik koltuğunda',
        '{club:gen} yükselişi ligi şaşırttı',
      ],
      en: [
        'The fairy tale is real! {club} in the title race',
        'Nobody gave them a chance: {club} sit at the top',
        '{club:gen} rise stuns the league',
      ],
    },
    f: {
      tr: [
        'Bütçesi küçük, hayalleri büyük bu takım için tribünler her hafta biraz daha doluyor.',
        '{manager}: «Biz sadece bir maç, sonra bir maç daha diyoruz. Gerisini konuşmayacağız.»',
      ],
      en: [
        'With a small budget and big dreams, the stands fill a little more every week.',
        '{manager}: “We just say one game, then another. We won’t talk about the rest.”',
      ],
    },
  },
  underdog_title: {
    group: 'story',
    h: {
      tr: [
        'İMKÂNSIZ OLDU! {club} şampiyon!',
        'Masal tamam: {club} şampiyonluğa uzandı',
        'Tarihi şampiyonluk: {club} ligi kazandı, {player} kahraman',
      ],
      en: [
        'IMPOSSIBLE MADE REAL! {club} are champions!',
        'The fairy tale is complete: {club} win the title',
        'Historic title: {club} take the league, {player} the hero',
      ],
    },
    f: {
      tr: [
        'Şehir sabaha kadar sokaktaydı; stat çevresinde yürüyüşler, korna sesleri ve gözyaşları birbirine karıştı.',
        '«Bu bir takım değil, bir aile» diyen {manager}, şampiyonluğu şehre armağan etti.',
      ],
      en: [
        'The city was on the streets until dawn; marches, car horns and tears all mixed together around the stadium.',
        '“This is not a team, it is a family,” said {manager}, dedicating the title to the city.',
      ],
    },
  },
  underdog_near: {
    group: 'story',
    h: {
      tr: [
        'Masal bitmedi ama ucu ucuna: {club} sezonu yüksek bitirdi',
        '{club} şampiyonluğu kaçırdı ama kimse üzgün değil',
        'Kalpler {club:dat}: kupa gelmedi, saygı geldi',
      ],
      en: [
        'The tale is not over, but a near miss: {club} finish high',
        '{club} just miss the title yet nobody is sad',
        'Hearts for {club}: no trophy, plenty of respect',
      ],
    },
    f: {
      tr: [
        'Tribünler sezon sonunda oyunculara ayakta alkış tuttu. «Haftaya yine buradayız» pankartı açıldı.',
        '{manager} sezonu «bu şehrin yıllarca anlatacağı bir hikâye» diye özetledi.',
      ],
      en: [
        'The stands gave the players a standing ovation at the end of the season. A banner read: “We’ll be back next week.”',
        '{manager} summed up the campaign as “a story this city will tell for years.”',
      ],
    },
  },

  // ───────── contract ─────────
  standoff_public: {
    group: 'transfer',
    h: {
      tr: [
        'Sözleşme krizi! {player} yönetimle masada kilitlendi',
        '{player} için imza krizi: «Şartlarım belli»',
        'Başkan cephesi sert, {player} cephesi kararlı: sözleşme gerginliği',
      ],
      en: [
        'Contract crisis! {player} and the board are deadlocked',
        'Signature standoff for {player}: “My terms are clear”',
        'Chairman’s camp firm, {player}’s camp resolute: contract tension',
      ],
    },
    f: {
      tr: [
        'Menajer {agent} «Kulübümüze saygımız tam, ama değerimizi de biliyoruz» dedi.',
        'Taraftarlar tribünde «İmzayı at!» pankartı açtı; sosyal medyada ise görüşler ikiye bölündü.',
      ],
      en: [
        'Agent {agent} said: “We have full respect for the club, but we know our worth.”',
        'Fans unfurled a “Sign it!” banner in the stands while opinion on social media is split.',
      ],
    },
  },
  standoff_signed: {
    group: 'transfer',
    h: {
      tr: [
        'Kriz bitti! {player} yeni sözleşmeyi imzaladı',
        'Sözleşme krizi çözüldü: {player} kalıyor',
        'İmza töreni: {player} ve {club} uzlaştı',
      ],
      en: [
        'Crisis over! {player} signs the new deal',
        'Contract saga resolved: {player} stays',
        'Signing ceremony: {player} and {club} reach agreement',
      ],
    },
    f: {
      tr: [
        'Taraftarlar uzun süredir beklenen haberi coşkuyla karşıladı.',
        'Başkan «Sonunda ortak akılda buluştuk» diyerek gülümsedi.',
      ],
      en: [
        'Supporters welcomed the long-awaited news with joy.',
        'The chairman smiled: “In the end common sense prevailed.”',
      ],
    },
  },
};
