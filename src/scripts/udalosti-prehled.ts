/** Přehled všech událostí v liště listování (telefon).
 *
 *  Mini-osa se na telefonu neukazuje, takže listování je jediná cesta chronologií — a k události
 *  uprostřed třicetidílné kauzy by vedlo patnáct klepnutí. Prostřední tlačítko lišty proto otevře
 *  seznam dat a názvů, kterým se skočí kamkoli: dvě klepnutí místo patnácti. Zároveň je to jediné
 *  místo, kde je po zrušení osy vidět celý průběh kauzy naráz.
 *
 *  Na počítači tohle ovládání není potřeba (je tam osa) a CSS ho schová. Rozhodnutí „kdy se
 *  ukazuje“ tím zůstává v upravy.css, stejně jako u ostatních sbalování. */

export interface Prehled {
  /** Po kroku listováním nebo skoku zvenčí: přepsat počítadlo a vyznačit událost v seznamu. */
  obnov(akt: number): void;
  /** Zavřít (přepnutí záložky, skok na událost). */
  zavri(): void;
}

/** Vytvoří tlačítko s počítadlem a seznam událostí uvnitř lišty listování.
 *  `skoc` dostane pořadí události; vrací se null tam, kde se nemá co přehlížet. */
export function vytvorPrehled(
  listovani: HTMLElement | null,
  polozky: HTMLElement[],
  skoc: (i: number) => void,
): Prehled | null {
  if (!listovani || polozky.length < 2) return null;
  // inicializujDetail běží při každém načtení kauzy do téhož dialogu: zbytek po předchozí kauze pryč
  listovani.querySelectorAll('.listovani-prehled, .udalosti-prehled').forEach(e => e.remove());

  const celkem = polozky.length;
  const tlacitko = document.createElement('button');
  tlacitko.type = 'button';
  tlacitko.className = 'listovani-prehled';
  tlacitko.setAttribute('aria-expanded', 'false');
  tlacitko.setAttribute('aria-controls', 'detail-prehled');

  const seznam = document.createElement('div');
  seznam.className = 'udalosti-prehled';
  seznam.id = 'detail-prehled';
  seznam.hidden = true;
  const ol = document.createElement('ol');
  polozky.forEach((li, i) => {
    const datum = li.querySelector('time')?.firstChild?.textContent?.trim() ?? '';
    const nazev = li.querySelector('h3')?.textContent?.trim() ?? '';
    const polozka = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.i = String(i);
    b.innerHTML = '<span class="pr-datum"></span><span class="pr-nazev"></span>';
    b.querySelector<HTMLElement>('.pr-datum')!.textContent = datum;
    b.querySelector<HTMLElement>('.pr-nazev')!.textContent = nazev;
    polozka.append(b);
    ol.append(polozka);
  });
  seznam.append(ol);
  // Tlačítko stojí mezi předchozí a další, a to i v DOM, aby pořadí pro klávesnici a čtečku odpovídalo
  // tomu, co je vidět. Seznam stojí nad lištou jako překryv (CSS), v toku lišty nemá místo.
  listovani.insertBefore(tlacitko, listovani.querySelector('button[data-krok="1"]'));
  listovani.append(seznam);

  const prvky = [...ol.querySelectorAll<HTMLButtonElement>('button[data-i]')];
  let otevreno = false;

  const zavri = (vratFokus = false) => {
    if (!otevreno) return;
    otevreno = false;
    seznam.hidden = true;
    tlacitko.setAttribute('aria-expanded', 'false');
    if (vratFokus) tlacitko.focus();
  };
  const otevri = () => {
    otevreno = true;
    seznam.hidden = false;
    tlacitko.setAttribute('aria-expanded', 'true');
    prvky.find(b => b.getAttribute('aria-current') === 'true')?.scrollIntoView({ block: 'center' });
  };

  const obnov = (akt: number) => {
    tlacitko.textContent = `${akt + 1} z ${celkem}`;
    // Jméno pro čtečku začíná tím, co je vidět — hlasové ovládání tak pořád najde, co uživatel čte.
    tlacitko.setAttribute('aria-label', `${akt + 1} z ${celkem} — přehled všech událostí`);
    prvky.forEach((b, i) => b.setAttribute('aria-current', String(i === akt)));
  };

  tlacitko.addEventListener('click', () => (otevreno ? zavri() : otevri()));
  ol.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
    if (!b) return;
    skoc(Number(b.dataset.i));
    zavri(true);
  });
  // Escape zavírá přehled, ne celý detail: jinak by se čtenář klávesou z kauzy vystřelil ven.
  // Zavření modálního <dialog> je výchozí akce klávesy, zastaví ho jen preventDefault. Platí i s fokusem
  // na tlačítku přehledu, nejen v seznamu.
  const naEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && otevreno) { e.preventDefault(); e.stopPropagation(); zavri(true); }
  };
  seznam.addEventListener('keydown', naEscape);
  tlacitko.addEventListener('keydown', naEscape);

  obnov(polozky.length - 1);
  return { obnov, zavri: () => zavri() };
}
