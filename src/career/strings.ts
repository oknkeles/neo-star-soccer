import { registerStrings } from '../core/i18n';
import '../core/strings';
import './strings-offers';

/** UI-facing short texts of the career module (namespace 'career'). */
registerStrings('career', {
  tr: {
    // relationship labels
    'rel.hostile': 'Düşmanca', 'rel.strained': 'Gergin', 'rel.distant': 'Mesafeli', 'rel.neutral': 'Normal',
    'rel.good': 'İyi', 'rel.close': 'Çok İyi', 'rel.inseparable': 'Can Ciğer',

    // effect notes
    'note.injury': 'Sakatlık: {n} hafta',
    'note.injuryShorter': 'Sakatlık süresi {n} hafta kısaldı',

    // injuries
    'inj.knock': 'Darbe', 'inj.bruised_ankle': 'Ayak bileğinde ezilme', 'inj.tight_hamstring': 'Arka adalede gerginlik',
    'inj.calf_strain': 'Baldır zorlanması', 'inj.hamstring': 'Arka adale yırtığı', 'inj.groin': 'Kasık sakatlığı',
    'inj.ankle_sprain': 'Ayak bileği burkulması', 'inj.thigh_strain': 'Ön adale zorlanması', 'inj.concussion': 'Beyin sarsıntısı',
    'inj.acl': 'Çapraz bağ kopması', 'inj.metatarsal': 'Tarak kemiği kırığı', 'inj.achilles': 'Aşil tendonu yırtığı',
    'inj.shoulder': 'Omuz çıkığı', 'inj.meniscus': 'Menisküs yırtığı',
    'inj.happened': '{injury}! {n} hafta sahalardan uzak kalacaksın.',
    'inj.happenedShort': '{injury} — {n} hafta yoksun.',

    // weekly recovery
    'rec.healed': 'Sakatlığın tamamen geçti; sahalara dönmeye hazırsın!',
    'rec.injuryLeft': 'Tedavi sürüyor: dönüşe {n} hafta var.',
    'rec.physioFast': 'Kişisel fizyoterapistin sayesinde iyileşme bir hafta kısaldı.',
    'rec.lowEnergy': 'Enerjin dibe vurdu. Biraz dinlenmezsen sakatlık riski artacak.',
    'rec.benchMorale': 'Forma şansı bulamamak moralini bozuyor.',
    'rec.brokenPromise': 'Sözleşmende vaat edilen rol yerine getirilmiyor; hocayla aran limoni.',
    'rec.debt': 'Borçlar kapıya dayandı; moralin bozuk.',
    'rec.breakup': '{name} ile yollarınızı ayırdınız. Kalbin kırık.',
    'rec.partnerDrift': '{name} son zamanlarda kendini ihmal edilmiş hissediyor.',
    'rec.familyMiss': 'Ailen seni özlüyor; bir telefon bile olur.',

    // match
    'match.bonus': 'Maç primleri: {v}',
    'match.unused': 'Kulübede kaldın, oyuna giremedin.',
    'match.motm': 'Maçın adamı seçildin!',

    // shop
    'shop.unknown': 'Böyle bir ürün yok.',
    'shop.owned': 'Bu zaten sende var.',
    'shop.fame': 'Bunun için en az {n} şöhret gerekiyor.',
    'shop.money': 'Yeterli paran yok ({price}).',
    'shop.notOwned': 'Bu ürün sende yok.',
    'shop.retired': 'Emekli bir efsane olarak alışverişin tadını başka türlü çıkarıyorsun.',

    // finances
    'fin.repoSubject': 'Haciz kapıda!',
    'fin.repoBody': 'Borçların sınırı aştı. {item} elden çıkarıldı ve {refund} hesabına geçti. Harcamalarına dikkat et!',
    'fin.from': 'Bankan',

    // sponsors
    'spcat.boots': 'Krampon', 'spcat.drinks': 'İçecek', 'spcat.watches': 'Saat', 'spcat.cars': 'Otomobil',
    'spcat.gaming': 'Oyun', 'spcat.fashion': 'Moda', 'spcat.telecom': 'Telekom',

    // activities
    'act.unknown': 'Böyle bir etkinlik yok.',
    'act.noActions': 'Bu hafta başka bir şeye vaktin kalmadı.',
    'act.energy': 'Bunun için yeterli enerjin yok.',
    'act.money': 'Bunun için {price} gerekiyor.',
    'act.fame': 'Bunun için en az {n} şöhret gerekiyor.',
    'act.injured': 'Sakatken bunu yapamazsın.',
    'act.needPartner': 'Önce hayatına birinin girmesi gerek.',
    'act.hasPartner': 'Zaten bir ilişkin var.',
    'act.noMentor': 'Takımda bir ağabeyin, bir mentorun yok.',
    'act.relTooLow': '{name} ile ilişkiniz bu adım için henüz hazır değil.',
    'act.married': 'Zaten evlisin!',
    'act.retired': 'Emekli oldun; artık kariyer etkinlikleri yok.',
    'act.noClub': 'Bunun için bir kulübün olması gerekiyor.',
    'act.met': '{name} ile tanıştın. Aranızda gerçek bir kıvılcım var!',
    'act.noSpark': 'Güzel bir akşamdı ama kıvılcım çakmadı.',
    'act.partnerBio': '{name}, {job}. Seninle {place} tanıştı.',

    // contracts & transfers
    'contract.free': 'Sözleşmen sona erdi. Artık serbest oyuncusun — yeni bir kulüp bulman gerekiyor.',
    'contract.loanEnd': 'Kiralık dönemin bitti; {club} kulübüne geri döndün.',
    'contract.sponsorEnd': '{brand} ile sponsorluk anlaşman sona erdi.',
    'contract.offerExpired': '{club} teklifinin süresi doldu.',
    'contract.listedOn': 'Transfer listesine konuldun.',
    'contract.listedOff': 'Transfer listesinden çıkarıldın.',
    'neg.director': '{club} Sportif Direktörü',
    'neg.ask': 'Talebim: {wage}/hafta, {years} yıl, {role} rolü, {bonus} imza parası, gol başı {goal}{clause}.',
    'neg.askClause': ', serbest kalma bedeli {v}',
    'neg.askNoClause': ', serbest kalma maddesi yok',

    // retirement / goals misc
    'goal.done': 'Kariyer hedefi tamamlandı: {text}',
  },
  en: {
    'rel.hostile': 'Hostile', 'rel.strained': 'Strained', 'rel.distant': 'Distant', 'rel.neutral': 'Neutral',
    'rel.good': 'Good', 'rel.close': 'Close', 'rel.inseparable': 'Inseparable',

    'note.injury': 'Injury: {n} wk',
    'note.injuryShorter': 'Injury shortened by {n} wk',

    'inj.knock': 'Knock', 'inj.bruised_ankle': 'Bruised ankle', 'inj.tight_hamstring': 'Tight hamstring',
    'inj.calf_strain': 'Calf strain', 'inj.hamstring': 'Torn hamstring', 'inj.groin': 'Groin injury',
    'inj.ankle_sprain': 'Sprained ankle', 'inj.thigh_strain': 'Thigh strain', 'inj.concussion': 'Concussion',
    'inj.acl': 'Ruptured ACL', 'inj.metatarsal': 'Broken metatarsal', 'inj.achilles': 'Torn Achilles',
    'inj.shoulder': 'Dislocated shoulder', 'inj.meniscus': 'Torn meniscus',
    'inj.happened': '{injury}! You will be out for {n} weeks.',
    'inj.happenedShort': '{injury} — out for {n} weeks.',

    'rec.healed': 'You are fully fit again and ready to return!',
    'rec.injuryLeft': 'Rehab continues: {n} weeks to go.',
    'rec.physioFast': 'Your personal physio shaved a week off your recovery.',
    'rec.lowEnergy': 'You are running on empty. Rest up or risk an injury.',
    'rec.benchMorale': 'Not getting minutes is wearing you down.',
    'rec.brokenPromise': 'The role promised in your contract is not being honoured; things are frosty with the manager.',
    'rec.debt': 'The debts are piling up and it is getting to you.',
    'rec.breakup': 'You and {name} have split up. Heartbroken.',
    'rec.partnerDrift': '{name} has been feeling neglected lately.',
    'rec.familyMiss': 'Your family misses you — even a phone call would do.',

    'match.bonus': 'Match bonuses: {v}',
    'match.unused': 'An unused substitute today.',
    'match.motm': 'Man of the match!',

    'shop.unknown': 'No such item.',
    'shop.owned': 'You already own this.',
    'shop.fame': 'You need at least {n} fame for this.',
    'shop.money': 'Not enough money ({price}).',
    'shop.notOwned': 'You do not own this item.',
    'shop.retired': 'As a retired legend you enjoy your money in other ways.',

    'fin.repoSubject': 'Bailiffs at the door!',
    'fin.repoBody': 'Your debts went over the limit. {item} was repossessed and {refund} went back into your account. Watch your spending!',
    'fin.from': 'Your bank',

    'spcat.boots': 'Boots', 'spcat.drinks': 'Drinks', 'spcat.watches': 'Watches', 'spcat.cars': 'Cars',
    'spcat.gaming': 'Gaming', 'spcat.fashion': 'Fashion', 'spcat.telecom': 'Telecom',

    'act.unknown': 'No such activity.',
    'act.noActions': 'No time left for anything else this week.',
    'act.energy': 'You do not have enough energy for this.',
    'act.money': 'This costs {price}.',
    'act.fame': 'You need at least {n} fame for this.',
    'act.injured': 'Not while you are injured.',
    'act.needPartner': 'You need someone special in your life first.',
    'act.hasPartner': 'You are already in a relationship.',
    'act.noMentor': 'You have no mentor in the dressing room.',
    'act.relTooLow': 'Things with {name} are not quite there yet.',
    'act.married': 'You are already married!',
    'act.retired': 'You are retired — no more career activities.',
    'act.noClub': 'You need a club for this.',
    'act.met': 'You met {name}. There is a real spark between you!',
    'act.noSpark': 'A lovely evening, but no spark.',
    'act.partnerBio': '{name}, {job}. You met at {place}.',

    'contract.free': 'Your contract has expired. You are a free agent — time to find a new club.',
    'contract.loanEnd': 'Your loan spell is over; you are back at {club}.',
    'contract.sponsorEnd': 'Your sponsorship deal with {brand} has ended.',
    'contract.offerExpired': 'The offer from {club} has expired.',
    'contract.listedOn': 'You have been placed on the transfer list.',
    'contract.listedOff': 'You have been taken off the transfer list.',
    'neg.director': '{club} Sporting Director',
    'neg.ask': 'My terms: {wage}/week, {years} years, {role} role, {bonus} signing bonus, {goal} per goal{clause}.',
    'neg.askClause': ', release clause {v}',
    'neg.askNoClause': ', no release clause',

    'goal.done': 'Career goal achieved: {text}',
  },
});
