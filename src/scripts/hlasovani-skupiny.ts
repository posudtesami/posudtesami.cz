/** Jmenné seznamy u hlasování. Na telefonu zabral seznam celé sněmovny 4 409 px z 4 824 — pět a půl
 *  obrazovky jmen pod sebou. Skupiny (Pro, Proti, Zdržel se nebo nehlasoval, Omluven) se proto sbalí
 *  na nadpis, který i tak nese počet, a jména se rozbalí klepnutím. Souhrn hlasování ani tabulka
 *  klubů se nehnuly, ty zůstávají nahoře vidět.
 *
 *  Podle řádu ovládání (upravy.css) je skupina „řádek“: terčem je celý nadpis, ne slova vedle něj.
 *  Obsah nadpisu se proto přestěhuje do tlačítka uvnitř <h3> — obvyklá stavba rozbalovacího oddílu.
 *  Jménem tlačítka pro čtečku je tím pádem sama skupina s počtem („Pro (86)“), takže pět tlačítek
 *  pod sebou se od sebe pozná bez aria-label navíc.
 *
 *  Tlačítko vzniká ve skriptu, ne ve značce: bez JavaScriptu se nic nesbalí, takže by nebylo co
 *  rozbalovat, a skupiny se vypisují na dvou místech (všichni poslanci a oddíl každého klubu).
 *
 *  Jestli se sbaluje, říká CSS proměnná --sbalit-skupiny, ne šířka okna v JavaScriptu. Zlom tak
 *  zůstává v CSS na jednom místě a odpověď platí i pro skupiny, které zrovna schoval filtr klubu
 *  a nejdou změřit. Kde se nesbaluje (počítač), vrací se nadpisu jeho obsah a tlačítko mizí:
 *  nadpis s tlačítkem, které nic nedělá, by čtečku jen mátl. */
export function inicializujSkupinyHlasovani(): void {
  const skupiny = [...document.querySelectorAll<HTMLElement>('.hl-skupina')];
  if (!skupiny.length) return;

  const sbaluje = () => getComputedStyle(document.documentElement).getPropertyValue('--sbalit-skupiny').trim() === '1';
  const polozky: { skupina: HTMLElement; nadpis: HTMLElement; tlacitko: HTMLButtonElement }[] = [];

  for (const skupina of skupiny) {
    const jmena = skupina.querySelector('ul');
    const nadpis = skupina.querySelector<HTMLElement>('h3');
    if (!jmena || !nadpis) continue;
    if (!jmena.id) jmena.id = `hl-jmena-${polozky.length + 1}`;

    const tlacitko = document.createElement('button');
    tlacitko.type = 'button';
    tlacitko.className = 'hl-vice';
    tlacitko.setAttribute('aria-controls', jmena.id);
    tlacitko.setAttribute('aria-expanded', 'false');
    tlacitko.addEventListener('click', () => {
      const otevreno = !skupina.classList.contains('rozbalene');
      skupina.classList.toggle('rozbalene', otevreno);
      tlacitko.setAttribute('aria-expanded', String(otevreno));
    });
    polozky.push({ skupina, nadpis, tlacitko });
  }

  /** Nadpis je tlačítkem jen tam, kde se sbaluje; jinde se mu obsah vrátí. */
  const prepocti = () => {
    const s = sbaluje();
    for (const { skupina, nadpis, tlacitko } of polozky) {
      const uvnitr = tlacitko.parentElement === nadpis;
      if (s && !uvnitr) {
        tlacitko.append(...nadpis.childNodes);
        nadpis.append(tlacitko);
      } else if (!s && uvnitr) {
        nadpis.append(...tlacitko.childNodes);
        tlacitko.remove();
        skupina.classList.remove('rozbalene');
        tlacitko.setAttribute('aria-expanded', 'false');
      }
    }
  };
  prepocti();
  addEventListener('resize', prepocti);
}
