export const STAVY = [
  'provereni', 'obvineni', 'obzaloba',
  'nepravomocne-odsouzen', 'pravomocne-odsouzen',
  'nepravomocne-zprosten', 'pravomocne-zprosten',
  'odlozeno', 'zastaveno', 'promlceno',
  'soudni-rizeni', 'uredni-zjisteni', 'jine',
] as const;

export type Stav = (typeof STAVY)[number];

/** Stav popisuje kauzu, ne osobu (obviněná může být i firma), proto podstatná jména, ne „odsouzen“. */
const POPISKY: Record<Stav, string> = {
  'provereni': 'Prověřování',
  'obvineni': 'Obvinění',
  'obzaloba': 'Obžaloba',
  'nepravomocne-odsouzen': 'Nepravomocné odsouzení',
  'pravomocne-odsouzen': 'Pravomocné odsouzení',
  'nepravomocne-zprosten': 'Nepravomocné zproštění',
  'pravomocne-zprosten': 'Pravomocné zproštění',
  'odlozeno': 'Odloženo',
  'zastaveno': 'Zastaveno',
  'promlceno': 'Promlčeno',
  'soudni-rizeni': 'Soudní řízení',
  'uredni-zjisteni': 'Úřední zjištění',
  'jine': 'Jiné',
};

export function popisekStavu(s: Stav): string {
  return POPISKY[s];
}

/** Druhý pád pro větu filtru „Ukázat kauzy ve stavu …“. */
const VE_STAVU: Record<Exclude<Stav, 'jine'>, string> = {
  'provereni': 'prověřování',
  'obvineni': 'obvinění',
  'obzaloba': 'obžaloby',
  'nepravomocne-odsouzen': 'nepravomocného odsouzení',
  'pravomocne-odsouzen': 'pravomocného odsouzení',
  'nepravomocne-zprosten': 'nepravomocného zproštění',
  'pravomocne-zprosten': 'pravomocného zproštění',
  'odlozeno': 'odložení',
  'zastaveno': 'zastavení',
  'promlceno': 'promlčení',
  'soudni-rizeni': 'soudního řízení',
  'uredni-zjisteni': 'úředního zjištění',
};

/** Volba filtru podle stavu: „ve stavu obžaloby“, u zbytkového stavu „s jiným stavem“. */
export function volbaStavu(s: Stav): string {
  return s === 'jine' ? 's jiným stavem' : `ve stavu ${VE_STAVU[s]}`;
}

/** U kterých neuzavřených kauz připomínáme presumpci neviny: trestní řízení, které pravomocně neskončilo.
 *  Audit, pokuta úřadu ani občanskoprávní spor o vině nerozhodují, tam věta nepatří. Zbytkový stav „jine“
 *  připomínku nechává, protože se pod ním může skrývat i trestní větev (například odložené prověřování). */
const S_PRESUMPCI: readonly Stav[] = ['provereni', 'obvineni', 'obzaloba', 'nepravomocne-odsouzen', 'nepravomocne-zprosten', 'jine'];
export const pripominaPresumpci = (s: Stav): boolean => S_PRESUMPCI.includes(s);

/** Slovníček stavů řízení: jeden zdroj pro Metodiku i pro řádek výkladu pod stavem v detailu kauzy.
 *  Odsouzení a zproštění mají společné heslo, liší se jen právní mocí. */
export const SLOVNICEK_STAVU: { heslo: string; vyklad: string; stavy: readonly Stav[] }[] = [
  { heslo: 'Prověřování', vyklad: 'Policie zjišťuje, zda se stal trestný čin. Nikdo zatím není obviněn.', stavy: ['provereni'] },
  { heslo: 'Obvinění', vyklad: 'Policie zahájila trestní stíhání konkrétní osoby.', stavy: ['obvineni'] },
  { heslo: 'Obžaloba', vyklad: 'Státní zástupce podal k soudu obžalobu.', stavy: ['obzaloba'] },
  { heslo: 'Nepravomocné odsouzení / zproštění', vyklad: 'Soud rozhodl, ale proti rozhodnutí se lze odvolat.', stavy: ['nepravomocne-odsouzen', 'nepravomocne-zprosten'] },
  { heslo: 'Pravomocné odsouzení / zproštění', vyklad: 'Rozhodnutí už nelze napadnout řádným opravným prostředkem.', stavy: ['pravomocne-odsouzen', 'pravomocne-zprosten'] },
  { heslo: 'Odloženo', vyklad: 'Věc byla odložena bez zahájení trestního stíhání.', stavy: ['odlozeno'] },
  { heslo: 'Zastaveno', vyklad: 'Trestní stíhání skončilo bez rozhodnutí soudu o vině.', stavy: ['zastaveno'] },
  { heslo: 'Promlčeno', vyklad: 'Uplynula zákonná lhůta, čin už nelze stíhat.', stavy: ['promlceno'] },
  { heslo: 'Soudní řízení', vyklad: 'Věc projednává soud mimo trestní řízení, například v občanskoprávním sporu.', stavy: ['soudni-rizeni'] },
  { heslo: 'Úřední zjištění', vyklad: 'Závěr úřadu mimo trestní řízení, například audit Evropské komise nebo NKÚ.', stavy: ['uredni-zjisteni'] },
  { heslo: 'Jiné', vyklad: 'Žádný z uvedených stavů kauzu nevystihuje, například když skončil občanskoprávní spor, řízení běží víc najednou nebo žádné. Místo slova „Jiné“ proto u kauzy píšeme pár slovy, jak věc stojí, a podrobnosti jsou v poznámce u kauzy.', stavy: ['jine'] },
];

/** Jedna věta, co stav znamená. Zbytkový stav „jine“ výklad nemá: co se děje, říká krátký popis a poznámka u kauzy. */
export function vykladStavu(s: Stav): string | undefined {
  return s === 'jine' ? undefined : SLOVNICEK_STAVU.find(p => p.stavy.includes(s))?.vyklad;
}

/** Nejvýš tolik znaků smí mít krátký popis stavu, aby se vešel do řádku osy (jako nejdelší popisek stavu). */
export const NEJVIC_STAV_KRATCE = 24;

/** Stav, jak ho čtenář uvidí: u zbytkového stavu „jine“ krátký popis kauzy („Soud nařídil omluvu“), jinak popisek stavu. */
export function stavKauzy(k: { stav: Stav; stavKratce?: string }): string {
  return k.stav === 'jine' && k.stavKratce ? k.stavKratce : popisekStavu(k.stav);
}
