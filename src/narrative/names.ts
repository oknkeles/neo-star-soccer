/**
 * Invented-character name pools by culture. Used for family, agents, journalists,
 * partners and fan accounts so names fit the nation. Common names only — combinations
 * are random and never meant to reference real people.
 */
import type { Rng } from '../core/rng';

export type Culture =
  | 'tr' | 'en' | 'es' | 'pt' | 'it' | 'de' | 'fr' | 'nl' | 'ar' | 'wa' | 'sl' | 'nord' | 'gr' | 'jp' | 'kr';

interface Pool { male: string[]; female: string[]; last: string[]; elderMale?: string[]; elderFemale?: string[] }

const POOLS: Record<Culture, Pool> = {
  tr: {
    male: ['Emre', 'Burak', 'Mert', 'Kerem', 'Oğuz', 'Kaan', 'Onur', 'Selim', 'Ufuk', 'Barış', 'Efe', 'Alper', 'Tuna', 'Doruk', 'Yiğit'],
    female: ['Zeynep', 'Elif', 'Merve', 'Selin', 'Defne', 'Ecrin', 'Nehir', 'Ela', 'İrem', 'Duygu', 'Buse', 'Ceren', 'Melis', 'Aslı'],
    elderMale: ['Mehmet', 'Hüseyin', 'Hasan', 'Mustafa', 'İbrahim', 'Osman', 'Yaşar', 'Cemal', 'Halil', 'Kâzım', 'Şükrü', 'Rıza', 'Nurettin'],
    elderFemale: ['Ayşe', 'Fatma', 'Emine', 'Hatice', 'Hülya', 'Nurcan', 'Sevgi', 'Gülsüm', 'Nermin', 'Saadet', 'Songül', 'Leyla'],
    last: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldırım', 'Aydın', 'Öztürk', 'Arslan', 'Doğan', 'Kılıç', 'Çetin', 'Koç', 'Kurt', 'Polat', 'Erdem', 'Güneş', 'Avcı', 'Bulut', 'Akın', 'Uysal', 'Kaplan', 'Karakaya', 'Sarı', 'Ateş', 'Tekin'],
  },
  en: {
    male: ['James', 'Tom', 'Callum', 'Josh', 'Liam', 'Ryan', 'Danny', 'Owen', 'Jack', 'Lewis', 'Harry', 'Connor', 'Sam'],
    female: ['Sophie', 'Chloe', 'Emma', 'Grace', 'Megan', 'Holly', 'Lucy', 'Amy', 'Ellie', 'Hannah', 'Jess', 'Rachel'],
    elderMale: ['Paul', 'Steve', 'Gary', 'Mick', 'Ian', 'Keith', 'Colin', 'Dave', 'Trevor', 'Graham'],
    elderFemale: ['Karen', 'Linda', 'Julie', 'Sue', 'Tracey', 'Debbie', 'Mandy', 'Carol', 'Jackie'],
    last: ['Hartley', 'Whitmore', 'Bradshaw', 'Pennington', 'Ashworth', 'Fletcher', 'Holloway', 'Marsh', 'Kendrick', 'Thornton', 'Crowley', 'Dalton', 'Bramwell', 'Haworth', 'Sutcliffe'],
  },
  es: {
    male: ['Álvaro', 'Pablo', 'Diego', 'Javier', 'Hugo', 'Mateo', 'Iker', 'Rubén', 'Sergio', 'Adrián', 'Marcos', 'Nicolás'],
    female: ['Lucía', 'Marta', 'Paula', 'Carmen', 'Elena', 'Sara', 'Nerea', 'Alba', 'Irene', 'Claudia', 'Valentina', 'Camila'],
    elderMale: ['Manolo', 'Paco', 'Antonio', 'José Luis', 'Ramón', 'Fermín', 'Julián', 'Eusebio'],
    elderFemale: ['Pilar', 'Rosario', 'Mercedes', 'Concha', 'Amparo', 'Remedios', 'Maite'],
    last: ['Navarro', 'Ortega', 'Delgado', 'Castillo', 'Romero', 'Molina', 'Herrero', 'Vidal', 'Serrano', 'Prieto', 'Gallardo', 'Cabrera', 'Robles', 'Soler', 'Aguirre'],
  },
  pt: {
    male: ['João', 'Tiago', 'Rafael', 'Gonçalo', 'Duarte', 'Rodrigo', 'Lucas', 'Gabriel', 'Thiago', 'Vinícius', 'Matheus', 'Caio'],
    female: ['Inês', 'Beatriz', 'Mariana', 'Leonor', 'Carolina', 'Joana', 'Larissa', 'Juliana', 'Fernanda', 'Bianca', 'Rita'],
    elderMale: ['Joaquim', 'Manuel', 'Aurélio', 'Sebastião', 'Valdir', 'Josué', 'Arlindo'],
    elderFemale: ['Conceição', 'Fátima', 'Graça', 'Lurdes', 'Rosângela', 'Socorro', 'Odete'],
    last: ['Ferreira', 'Carvalho', 'Moreira', 'Barbosa', 'Teixeira', 'Pinheiro', 'Cardoso', 'Machado', 'Rocha', 'Azevedo', 'Monteiro', 'Brandão', 'Correia', 'Nogueira'],
  },
  it: {
    male: ['Marco', 'Luca', 'Matteo', 'Davide', 'Simone', 'Federico', 'Lorenzo', 'Alessio', 'Tommaso', 'Riccardo', 'Gabriele'],
    female: ['Giulia', 'Chiara', 'Martina', 'Francesca', 'Sara', 'Alessia', 'Elisa', 'Giorgia', 'Valeria', 'Ilaria'],
    elderMale: ['Giuseppe', 'Salvatore', 'Franco', 'Vittorio', 'Enzo', 'Gianni', 'Carmine', 'Aldo'],
    elderFemale: ['Rosa', 'Antonietta', 'Carla', 'Lucia', 'Assunta', 'Gabriella', 'Nunzia'],
    last: ['Ferraro', 'Esposito', 'Colombo', 'Marchetti', 'Bellini', 'Santoro', 'Fontana', 'Caruso', 'Rinaldi', 'Lombardi', 'Moretti', 'Galli', 'Barone', 'Pellegrini'],
  },
  de: {
    male: ['Lukas', 'Jonas', 'Leon', 'Felix', 'Maximilian', 'Niklas', 'Tim', 'Paul', 'Julian', 'Moritz', 'Jannik'],
    female: ['Lena', 'Anna', 'Lea', 'Hannah', 'Laura', 'Johanna', 'Marie', 'Sophie', 'Katharina', 'Nele'],
    elderMale: ['Jürgen', 'Klaus', 'Dieter', 'Rainer', 'Uwe', 'Wolfgang', 'Bernd', 'Holger'],
    elderFemale: ['Petra', 'Sabine', 'Monika', 'Birgit', 'Heike', 'Ursula', 'Gisela'],
    last: ['Becker', 'Hoffmann', 'Schäfer', 'Koch', 'Richter', 'Wolf', 'Neumann', 'Krüger', 'Brandt', 'Vogel', 'Lehmann', 'Hartmann', 'Engel', 'Ziegler'],
  },
  fr: {
    male: ['Lucas', 'Hugo', 'Théo', 'Maxime', 'Antoine', 'Julien', 'Mathis', 'Quentin', 'Bastien', 'Yanis', 'Nathan'],
    female: ['Camille', 'Manon', 'Léa', 'Chloé', 'Inès', 'Juliette', 'Clara', 'Margaux', 'Pauline', 'Océane'],
    elderMale: ['Jean-Pierre', 'Michel', 'Gérard', 'Patrick', 'Alain', 'Didier', 'Serge', 'Bernard'],
    elderFemale: ['Martine', 'Sylvie', 'Nathalie', 'Brigitte', 'Christine', 'Françoise', 'Véronique'],
    last: ['Lefèvre', 'Moreau', 'Girard', 'Roux', 'Fournier', 'Mercier', 'Blanchard', 'Gauthier', 'Chevalier', 'Perrin', 'Marchand', 'Dufour', 'Lacroix', 'Baron'],
  },
  nl: {
    male: ['Daan', 'Sem', 'Jesse', 'Thijs', 'Bram', 'Lars', 'Ruben', 'Stijn', 'Joep', 'Milan', 'Niels'],
    female: ['Sanne', 'Fleur', 'Lotte', 'Eva', 'Femke', 'Noor', 'Iris', 'Anouk', 'Maud', 'Lieke'],
    elderMale: ['Henk', 'Kees', 'Gerard', 'Wim', 'Joop', 'Arie', 'Piet', 'Ton'],
    elderFemale: ['Ria', 'Annemiek', 'Ingrid', 'Marja', 'Truus', 'Joke', 'Wilma'],
    last: ['de Vries', 'Bakker', 'Visser', 'Smit', 'Meijer', 'Mulder', 'de Boer', 'Bos', 'Vermeulen', 'Dekker', 'Brouwer', 'van Dijk', 'Kuipers', 'Hendriks'],
  },
  ar: {
    male: ['Youssef', 'Karim', 'Amine', 'Hamza', 'Bilal', 'Ilyas', 'Anas', 'Mehdi', 'Omar', 'Rayan', 'Walid'],
    female: ['Yasmine', 'Salma', 'Nour', 'Imane', 'Leila', 'Rania', 'Sara', 'Meryem', 'Hiba', 'Ines'],
    elderMale: ['Abdelkader', 'Mohamed', 'Rachid', 'Mustapha', 'Hassan', 'Driss', 'Lahcen', 'Ahmed'],
    elderFemale: ['Fatima', 'Khadija', 'Malika', 'Aicha', 'Zohra', 'Naima', 'Rachida'],
    last: ['Benali', 'El Amrani', 'Haddad', 'Mansouri', 'Bouzid', 'Cherif', 'Saidi', 'Belkacem', 'El Idrissi', 'Ziani', 'Rahmani', 'Tahiri'],
  },
  wa: {
    male: ['Chinedu', 'Kwame', 'Emeka', 'Kofi', 'Moussa', 'Ibrahima', 'Tunde', 'Yaw', 'Samuel', 'Ousmane', 'Daniel'],
    female: ['Adaeze', 'Ama', 'Ngozi', 'Aminata', 'Fatou', 'Abena', 'Chioma', 'Esi', 'Mariama', 'Grace'],
    elderMale: ['Babatunde', 'Kojo', 'Mamadou', 'Augustine', 'Ebenezer', 'Abdoulaye', 'Festus'],
    elderFemale: ['Folake', 'Akosua', 'Awa', 'Comfort', 'Ndeye', 'Patience', 'Funmilayo'],
    last: ['Okafor', 'Mensah', 'Diallo', 'Adeyemi', 'Boateng', 'Ndiaye', 'Owusu', 'Eze', 'Traoré', 'Asante', 'Sow', 'Nwosu', 'Konaté', 'Ofori'],
  },
  sl: {
    male: ['Luka', 'Marko', 'Ivan', 'Filip', 'Mateusz', 'Jakub', 'Nikola', 'Petar', 'Andriy', 'Tomáš', 'Dominik'],
    female: ['Ana', 'Petra', 'Ivana', 'Kasia', 'Marta', 'Jelena', 'Natalia', 'Tereza', 'Mila', 'Olena'],
    elderMale: ['Zoran', 'Dragan', 'Stanisław', 'Miroslav', 'Branko', 'Vasyl', 'Josip'],
    elderFemale: ['Mirjana', 'Danuta', 'Vesna', 'Halyna', 'Snežana', 'Jadwiga'],
    last: ['Novak', 'Horvat', 'Kowalczyk', 'Petrović', 'Marić', 'Dvořák', 'Kovalenko', 'Babić', 'Wiśniewski', 'Jurić', 'Popović', 'Nowicki'],
  },
  nord: {
    male: ['Erik', 'Magnus', 'Oskar', 'Mikkel', 'Henrik', 'Emil', 'Anders', 'Sindre', 'Viktor', 'Rasmus'],
    female: ['Ingrid', 'Freja', 'Astrid', 'Maja', 'Sofie', 'Ida', 'Signe', 'Elin', 'Linnea', 'Thea'],
    elderMale: ['Bjørn', 'Lars', 'Per', 'Svein', 'Torbjörn', 'Leif', 'Ole'],
    elderFemale: ['Kirsten', 'Birgitta', 'Grete', 'Solveig', 'Inger', 'Anneli'],
    last: ['Lindqvist', 'Halvorsen', 'Søndergaard', 'Berglund', 'Nyström', 'Haugen', 'Mikkelsen', 'Dahl', 'Ekberg', 'Strand', 'Holm'],
  },
  gr: {
    male: ['Giorgos', 'Nikos', 'Dimitris', 'Kostas', 'Panagiotis', 'Stelios', 'Thanos', 'Vasilis'],
    female: ['Eleni', 'Maria', 'Katerina', 'Sofia', 'Despina', 'Ioanna', 'Christina'],
    elderMale: ['Spyros', 'Yannis', 'Michalis', 'Lefteris', 'Stavros'],
    elderFemale: ['Vasiliki', 'Georgia', 'Anastasia', 'Paraskevi'],
    last: ['Papadakis', 'Nikolaidis', 'Georgiou', 'Antoniou', 'Kostopoulos', 'Manolas', 'Pappas', 'Vlachos', 'Stathopoulos'],
  },
  jp: {
    male: ['Haruto', 'Ren', 'Sota', 'Yuto', 'Kaito', 'Daiki', 'Takumi', 'Shota', 'Riku'],
    female: ['Yui', 'Aoi', 'Hina', 'Sakura', 'Mio', 'Nanami', 'Rin', 'Haruka'],
    elderMale: ['Hiroshi', 'Takeshi', 'Kenji', 'Masaru', 'Osamu'],
    elderFemale: ['Keiko', 'Yoko', 'Michiko', 'Naoko', 'Emiko'],
    last: ['Takahashi', 'Watanabe', 'Kobayashi', 'Yamamoto', 'Inoue', 'Shimizu', 'Fujita', 'Matsuda', 'Okada', 'Ishikawa'],
  },
  kr: {
    male: ['Min-jun', 'Seo-jun', 'Ji-ho', 'Hyun-woo', 'Do-yun', 'Jae-won', 'Tae-yang', 'Sung-min'],
    female: ['Seo-yeon', 'Ji-woo', 'Ha-eun', 'Min-seo', 'Yu-na', 'Soo-ah', 'Da-eun'],
    elderMale: ['Young-ho', 'Sang-chul', 'Dong-hyun', 'Kwang-soo'],
    elderFemale: ['Mi-kyung', 'Eun-hee', 'Young-sook', 'Kyung-ja'],
    last: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Yoon', 'Jang', 'Han', 'Shin'],
  },
};

const NATION_CULTURE: Record<string, Culture> = {
  TUR: 'tr', AZE: 'tr',
  ENG: 'en', SCO: 'en', WAL: 'en', IRL: 'en', NIR: 'en', USA: 'en', CAN: 'en', AUS: 'en', NZL: 'en', JAM: 'en',
  ESP: 'es', MEX: 'es', ARG: 'es', URU: 'es', COL: 'es', CHI: 'es', PER: 'es', ECU: 'es', VEN: 'es', PAR: 'es', CRC: 'es',
  POR: 'pt', BRA: 'pt', ANG: 'pt', CPV: 'pt',
  ITA: 'it',
  GER: 'de', AUT: 'de', SUI: 'de',
  FRA: 'fr', BEL: 'fr', LUX: 'fr',
  NED: 'nl',
  MAR: 'ar', ALG: 'ar', TUN: 'ar', EGY: 'ar', KSA: 'ar', QAT: 'ar', IRQ: 'ar', JOR: 'ar',
  NGA: 'wa', GHA: 'wa', CIV: 'wa', SEN: 'wa', CMR: 'wa', MLI: 'wa', GUI: 'wa', BFA: 'wa', RSA: 'wa',
  CRO: 'sl', SRB: 'sl', POL: 'sl', UKR: 'sl', CZE: 'sl', SVK: 'sl', SVN: 'sl', BIH: 'sl', RUS: 'sl', BUL: 'sl', MKD: 'sl', MNE: 'sl',
  DEN: 'nord', SWE: 'nord', NOR: 'nord', ISL: 'nord', FIN: 'nord',
  GRE: 'gr', CYP: 'gr',
  JPN: 'jp', KOR: 'kr',
};

/** Muslim-majority football nations (Ramadan / bayram flavour). */
export const MUSLIM_NATIONS = new Set(['TUR', 'AZE', 'MAR', 'ALG', 'TUN', 'EGY', 'KSA', 'QAT', 'IRQ', 'JOR', 'SEN', 'MLI', 'GUI', 'BFA', 'BIH', 'ALB', 'KOS', 'IRN']);

export function cultureOf(nation: string): Culture {
  return NATION_CULTURE[nation?.toUpperCase?.() ?? ''] ?? 'en';
}

export function cultureOfCountry(country: string): Culture {
  return cultureOf(country);
}

export type Gender = 'm' | 'f';

export function firstName(rng: Rng, culture: Culture, gender: Gender, elder = false): string {
  const p = POOLS[culture];
  const list = elder
    ? (gender === 'm' ? p.elderMale ?? p.male : p.elderFemale ?? p.female)
    : gender === 'm' ? p.male : p.female;
  return rng.pick(list);
}

export function lastName(rng: Rng, culture: Culture): string {
  return rng.pick(POOLS[culture].last);
}

export function fullPersonName(rng: Rng, culture: Culture, gender: Gender = rng.chance(0.5) ? 'm' : 'f', elder = false): string {
  return `${firstName(rng, culture, gender, elder)} ${lastName(rng, culture)}`;
}

/** Handle-safe ASCII slug ("Gol Postası" → "golpostasi"). */
export function slug(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}
