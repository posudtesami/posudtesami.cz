import { POJMY, VYRAZY, ZKRATKY, OBECNE_ZNAME, NAZVY_VERZALKAMI, type Pojem } from '../data/slovnicek';
import { escapujHtml } from './html';

/* Okraje slova: \b v JavaScriptu nezná česká písmena, proto vlastní. */
const PRED = String.raw`(?<![\p{L}\p{N}])`;
const ZA = String.raw`(?![\p{L}\p{N}])`;
/* Zkratka ve spisové značce nebo čísle jednacím není zkratka úřadu k vysvětlení:
   „IV. ÚS 2980/22“, „2023/NIK/POK/3/19“, „MZE-24554/2026“, „SA.51501“. */
const PRED_ZKRATKY = String.raw`(?<![\p{L}\p{N}/]|\d-)`;
const ZA_ZKRATKY = String.raw`(?![\p{L}\p{N}]|[/.-]\d|\s\d+/)`;
/* Kontrola neznámých zkratek navíc přeskakuje označení s číslem („program DP 13“, „VTP-100“, „TOP 09“). */
const ZKRATKA = new RegExp(String.raw`${PRED_ZKRATKY}\p{Lu}{2,7}(?![\p{L}\p{N}]|[/.-]\d|\s\d)`, 'gu');
const RIMSKA = /^[IVXLCDM]+$/;

type Sestaveny = { pojem: Pojem; re: RegExp };
const mezipamet = new WeakMap<Pojem[], Sestaveny[]>();
function sestav(pojmy: Pojem[]): Sestaveny[] {
  let s = mezipamet.get(pojmy);
  if (!s) {
    s = pojmy.map(pojem => ({
      pojem,
      re: pojem.zkratka
        ? new RegExp(`${PRED_ZKRATKY}(?:${pojem.vzor})${ZA_ZKRATKY}`, 'gu')
        : new RegExp(`${PRED}(?:${pojem.vzor})${ZA}`, 'giu'),
    }));
    mezipamet.set(pojmy, s);
  }
  return s;
}

const tlacitko = (p: Pojem, text: string) => `<button type="button" class="pojem" popovertarget="pojem-${p.id}">${text}</button>`;

export type Oznacovac = {
  /** Prostý text → HTML (text se escapuje). Ve skupině se každý pojem označí jen při prvním výskytu. */
  text(t: string, skupina: string): string;
  /** Hotové HTML → HTML. Mění jen text mezi značkami, obsah odkazů a tlačítek nechává. */
  html(h: string, skupina: string): string;
  /** Pojmy označené aspoň jednou, v pořadí slovníčku. K nim patří výklad na stránce. */
  pouzite(): Pojem[];
};

/** Označovač pro jednu stránku (jeden detail). Skupina je část, kterou čtenář vidí najednou: záložka nebo
 *  jedna událost. Pojem se v ní vysvětluje jednou, aby text nebyl samá tečkovaná čára. */
export function vytvorOznacovac(pojmy: Pojem[] = POJMY): Oznacovac {
  const sestavene = sestav(pojmy);
  const videne = new Map<string, Set<string>>();
  const pouzite = new Set<string>();

  const oznac = (escapovany: string, skupina: string): string => {
    let uz = videne.get(skupina);
    if (!uz) videne.set(skupina, uz = new Set());
    let vystup = '';
    let od = 0;
    for (;;) {
      let nej: { i: number; d: number; pojem: Pojem } | null = null;
      for (const s of sestavene) {
        if (uz.has(s.pojem.id)) continue;
        s.re.lastIndex = od;
        const m = s.re.exec(escapovany);
        // nejdřívější výskyt; při shodě začátku vyhrává delší („dozorový státní zástupce“ před „státní zástupce“)
        if (m && (!nej || m.index < nej.i || (m.index === nej.i && m[0].length > nej.d))) nej = { i: m.index, d: m[0].length, pojem: s.pojem };
      }
      if (!nej) break;
      vystup += escapovany.slice(od, nej.i) + tlacitko(nej.pojem, escapovany.slice(nej.i, nej.i + nej.d));
      od = nej.i + nej.d;
      uz.add(nej.pojem.id);
      pouzite.add(nej.pojem.id);
    }
    return vystup + escapovany.slice(od);
  };

  return {
    text: (t, skupina) => oznac(escapujHtml(t), skupina),
    html: (h, skupina) => {
      let uvnitr = 0; // hloubka zanoření v <a> nebo <button>: tlačítko v odkazu být nesmí
      return h.split(/(<[^>]*>)/).map(cast => {
        if (cast.startsWith('<')) {
          if (/^<(a|button)[\s>]/i.test(cast)) uvnitr++;
          else if (/^<\/(a|button)>/i.test(cast)) uvnitr = Math.max(0, uvnitr - 1);
          return cast;
        }
        return uvnitr > 0 ? cast : oznac(cast, skupina);
      }).join('');
    },
    pouzite: () => pojmy.filter(p => pouzite.has(p.id)),
  };
}

function zkratky(text: string, jeZnama: (z: string) => boolean): string[] {
  const nalezene = new Set<string>();
  for (const m of text.matchAll(ZKRATKA)) if (!RIMSKA.test(m[0]) && !jeZnama(m[0])) nalezene.add(m[0]);
  return [...nalezene];
}

const BEZ_VYKLADU = new Set([...OBECNE_ZNAME, ...NAZVY_VERZALKAMI]);

/** Zkratky, které čtenáři nikdo nevysvětlí: nejsou ve slovníčku, nejsou obecně známé, nejsou to vlastní
 *  jména a text je sám nerozepisuje závorkou („Národní finanční prokuratura (PNF)“). */
export function nevysvetleneZkratky(text: string, pojmy: Pojem[] = POJMY): string[] {
  let zbytek = text;
  for (const s of sestav(pojmy)) zbytek = zbytek.replace(s.re, m => ' '.repeat(m.length));
  return zkratky(zbytek, z => BEZ_VYKLADU.has(z) || text.includes(`(${z})`));
}

/** Zkratky ve větě, která má být obyčejnou řečí („O co jde“). Hlásí i ty ze slovníčku: v takové větě
 *  se má úřad napsat celým názvem. Obecně známé zkratky (EU, DPH) a vlastní jména zůstávají. */
export function zkratkyVeVete(text: string): string[] {
  return zkratky(text, z => BEZ_VYKLADU.has(z));
}

const velkym = (t: string) => t.charAt(0).toLocaleUpperCase('cs') + t.slice(1);
/** Heslo, jak se ukáže nad výkladem: u výrazu s velkým písmenem, zkratka beze změny. */
export const nadpisPojmu = (p: Pojem): string => p.zkratka ? p.heslo : velkym(p.heslo);

/** Oba seznamy slovníčku pro Metodiku. Každé heslo má kotvu pojem-<id>, na kterou vede odkaz z výkladu v textu. */
export function slovnicekHtml(): string {
  const seznam = (pojmy: Pojem[], trida: string) => `<dl class="slovnicek ${trida}">\n${[...pojmy]
    .sort((a, b) => a.heslo.localeCompare(b.heslo, 'cs'))
    .map(p => `<dt id="pojem-${p.id}">${escapujHtml(p.heslo)}</dt><dd>${escapujHtml(p.vyklad)}</dd>`)
    .join('\n')}\n</dl>`;
  return `<h3 id="pojmy-vyrazy">Právní a úřední výrazy</h3>\n${seznam(VYRAZY, 'sl-vyrazy')}\n<h3 id="pojmy-zkratky">Zkratky</h3>\n${seznam(ZKRATKY, 'sl-zkratky')}`;
}
