/** Fictional media outlets per country (invented titles — never real papers or channels). */
const OUTLETS: Record<string, string[]> = {
  TUR: ['Gol Postası', 'Tribün Gazetesi', 'Saha Kenarı', 'Futbol Ekspres', 'Manşet Spor', 'Son Düdük', 'Kale Arkası TV', 'Derbi Gecesi'],
  ENG: ['The Touchline', 'Evening Whistle', 'The Daily Volley', 'Terrace Times', 'The Back Page', 'Floodlight FM', 'The Dugout Gazette'],
  ESP: ['Diario Golazo', 'La Grada', 'Marcador Total', 'El Banquillo', 'Pizarra Deportiva', 'Onda Córner'],
  ITA: ['Il Fischietto', 'La Curva', 'Calcio Sera', 'Il Mister', 'Rete!', 'Radio Tribuna'],
  GER: ['Der Anstoß', 'Flutlicht', 'Tor! Magazin', 'Die Viererkette', 'Abendpfiff', 'Kurve TV'],
  FRA: ['Le Coup Franc', 'La Lucarne', 'Ballon Rond Quotidien', 'Le Petit Pont', 'Crampons', 'Radio Vestiaire'],
  POR: ['Bancada', 'O Apito', 'Golo Diário', 'Relvado', 'Rádio Balneário'],
  NED: ['De Middenstip', 'Het Doelnet', 'De Kantlijn', 'Oranje Tribune', 'Avondfluit'],
};

const INTERNATIONAL = ['World Football Wire', 'Global Goal Network', 'The Transfer Desk', 'Continental Football Weekly'];

export function outletsFor(country: string): string[] {
  const key = (country ?? '').toUpperCase();
  return [...(OUTLETS[key] ?? INTERNATIONAL)];
}

export function allOutlets(): string[] {
  return [...Object.values(OUTLETS).flat(), ...INTERNATIONAL];
}
