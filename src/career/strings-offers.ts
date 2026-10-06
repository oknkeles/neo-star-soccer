import { registerStrings } from '../core/i18n';

/** Offer pitches, negotiation lines and romance results (namespace 'career'). */
registerStrings('career', {
  tr: {
    'act.cooldown': 'Bunu tekrar yapabilmek için {n} hafta beklemelisin.',
    'act.proposeYes': '{name} gözyaşları içinde "Evet!" dedi. Kalbin yerinden çıkacak gibi!',
    'act.proposeNo': '{name} biraz zamana ihtiyacı olduğunu söyledi. Yüzük cebinde kaldı.',

    // transfer pitches
    'offer.up1': '{club}, yeni sezonda seni projesinin merkezine koymak istiyor. {manager}: "Bu çocuk sistemimizin aradığı parça."',
    'offer.up2': '{city} tribünleri adını fısıldıyor. {club}, seni büyük sahnede görmek istiyor: daha büyük kulüp, daha büyük hayaller.',
    'offer.up3': '{club} gözlemcileri aylardır seni izliyordu. Teklif masada; böyle fırsat her gün kapını çalmaz.',
    'offer.same1': '{club}, seni kadrosuna katmak istiyor. {manager}, oyun tarzının sana çok yakıştığını düşünüyor.',
    'offer.same2': '{club} sportif direktörü telefonda net konuştu: "Bu pozisyonda sana ihtiyacımız var." Teklif ciddi.',
    'offer.down1': '{club}, büyük bir rol vaat ediyor: forma garantisi ve takımın etrafında kurulacağı bir yol. Daha az ışık ama daha çok dakika.',
    'offer.down2': 'Daha küçük bir kulüp, daha büyük bir sorumluluk. {club}, yeni sezonu senin üzerine kurmak istiyor.',
    'offer.listed1': 'Transfer listesinde olduğunu duyan {club} hemen harekete geçti. Menajerine "Şartlarımız uygun, konuşalım" dediler.',
    'offer.listed2': '{club}, transfer listesindeki ismini görür görmez telefona sarıldı. Fırsatı kaçırmak istemiyorlar.',

    // loans
    'offer.loan1': '{club}, seni sezon boyu kiralamak istiyor. {manager}: "Burada oynar, büyür, güçlenip geri dönersin."',
    'offer.loan2': 'Forma sırası gelmiyorsa maç oynamak gerek. {club} kiralık bir ayrılık öneriyor: dakika, güven ve tecrübe.',

    // renewals
    'offer.renewal1': '{club} yönetimi sözleşmeni uzatmak istiyor: "Bu formayı taşımaya devam etmeni istiyoruz."',
    'offer.renewal2': 'Sözleşmenin bitmesine az kaldı ve {club} seni kaybetmek istemiyor. Masada yeni bir teklif var.',
    'offer.renewal_great1': 'Muhteşem sezonunun ardından {club} seni bırakmak istemiyor: tribünlerin gözdesine yeni ve güçlü bir sözleşme.',

    // free agent
    'offer.free1': 'Serbest oyuncu olduğunu duyan {club} kapıyı çaldı. Bonservis bedeli yok, imza masada.',
    'offer.free2': '{club}, serbest kalan oyuncular arasında ilk senin ismini seçti. {manager} seni yeni sezon planına yazmış.',

    // trials
    'offer.trial1': '{club} altyapı gözlemcileri seni izledi. Denemeye gel; gençlik sözleşmesi hazır, gerisi ayağında.',
    'offer.trial2': '{city} sokaklarından {club} antrenman sahasına… Tek bir deneme ve hayatın değişebilir.',
    'offer.trial3': '{manager} seni bizzat izledi: "Bu çocukta bir şey var." {club} sana ilk profesyonel sözleşmeni önerdi.',

    // negotiation voice
    'neg.open.transfer': '"Hoş geldin. Teklifimiz net: haftalık {wage}, {years} yıl, {role} rolü. Şartları konuşalım."',
    'neg.open.loan': '"Bir sezonluk kiralık: haftalık {wage}, {role} rolü. Sana düzenli süre vaat ediyoruz."',
    'neg.open.free': '"Bonservis ödemediğimiz için esneğiz. Haftalık {wage}, {years} yıl, {role} rolü. Ne dersin?"',
    'neg.open.renewal': '"Seni ailemizden ayırmak istemiyoruz. Haftalık {wage}, {years} yıl, {role} rolü; devamını konuşalım."',
    'neg.open.trial': '"Denemede iyi iş çıkardın. Haftalık {wage}, {years} yıl; kadroda {role} olarak başlarsın."',
    'neg.reply.open': '"Bir kısmını karşılayabiliriz, bütçemizin sınırları var. Son halimiz bu; bir daha bakalım."',
    'neg.reply.agreed': '"Anlaştık! Kâğıtları hazırlatıyoruz. Hoş geldin!"',
    'neg.reply.collapsed': '"Bu pazarlık artık bir yere varmıyor." {club} masadan kalktı.',
  },
  en: {
    'act.cooldown': 'You have to wait {n} more weeks before doing this again.',
    'act.proposeYes': '{name} said "Yes!" through happy tears. Your heart is about to burst!',
    'act.proposeNo': '{name} said they need more time. The ring stays in your pocket.',

    'offer.up1': '{club} want to put you at the heart of their project. {manager}: "This kid is the piece our system is missing."',
    'offer.up2': 'The {city} stands are whispering your name. {club} want you on the big stage: a bigger club, bigger dreams.',
    'offer.up3': '{club} scouts have been following you for months. The offer is on the table; chances like this do not knock every day.',
    'offer.same1': '{club} would like to add you to their squad. {manager} believes your game is a perfect fit.',
    'offer.same2': 'The {club} sporting director was blunt on the phone: "We need you in this position." The offer is serious.',
    'offer.down1': '{club} promise a big role: a guaranteed shirt and a team built around you. Less spotlight, more minutes.',
    'offer.down2': 'A smaller club, a bigger responsibility. {club} want to build their new season on you.',
    'offer.listed1': '{club} heard you are on the transfer list and moved at once. "Our terms are good, let us talk," they told your agent.',
    'offer.listed2': '{club} reached for the phone the moment they saw your name on the transfer list. They do not want to miss out.',

    'offer.loan1': '{club} would like you on loan for the season. {manager}: "Play here, grow, come back stronger."',
    'offer.loan2': 'If the shirt is not coming, you need games. {club} propose a loan: minutes, trust and experience.',

    'offer.renewal1': 'The {club} board wants to extend your contract: "We want you to keep wearing this shirt."',
    'offer.renewal2': 'Your deal is running down and {club} do not want to lose you. A new offer is on the table.',
    'offer.renewal_great1': 'After your superb season {club} refuse to let you go: a new, powerful contract for a fan favourite.',

    'offer.free1': '{club} heard you are a free agent and came knocking. No transfer fee, the pen is ready.',
    'offer.free2': '{club} picked your name first among the free agents. {manager} has written you into the plans for next season.',

    'offer.trial1': '{club} academy scouts watched you play. Come for a trial; a youth contract is ready, the rest is up to your feet.',
    'offer.trial2': 'From the streets of {city} to the {club} training pitch… one trial and your life could change.',
    'offer.trial3': '{manager} came to watch you in person: "There is something about this kid." {club} offer you your first professional contract.',

    'neg.open.transfer': '"Welcome. Our offer is clear: {wage} a week, {years} years, {role} role. Let us talk terms."',
    'neg.open.loan': '"A season-long loan: {wage} a week, {role} role. We promise you regular minutes."',
    'neg.open.free': '"As there is no fee, we can be flexible. {wage} a week, {years} years, {role} role. What do you say?"',
    'neg.open.renewal': '"We do not want to lose you from the family. {wage} a week, {years} years, {role} role; let us talk it through."',
    'neg.open.trial': '"You did well in the trial. {wage} a week, {years} years; you would start as a {role} in the squad."',
    'neg.reply.open': '"We can meet part of that, but the budget has limits. This is our best shape of the deal; take another look."',
    'neg.reply.agreed': '"Deal! We are getting the papers ready. Welcome aboard!"',
    'neg.reply.collapsed': '"This is going nowhere." {club} walked away from the table.',
  },
});

registerStrings('career', {
  tr: {
    'ret.forced': 'Kırk yaşına geldin; artık kramponları asma vakti. Futbol sana çok şey verdi.',
    'ret.injury': 'Bu sakatlık kariyerini tehdit ediyor. Bırakmak da bir seçenek.',
    'ret.age': '{age} yaşındasın. İstersen şimdi, alkışlar eşliğinde kramponları asabilirsin.',
  },
  en: {
    'ret.forced': 'You have reached forty; it is time to hang up the boots. Football gave you everything.',
    'ret.injury': 'This injury threatens your career. Calling it a day is an option.',
    'ret.age': 'You are {age} years old. If you wish, you can hang up your boots now to a standing ovation.',
  },
});
