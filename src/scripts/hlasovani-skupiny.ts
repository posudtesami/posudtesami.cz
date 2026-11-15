/** Jmenné seznamy u hlasování. Na telefonu zabral seznam celé sněmovny 4 409 px z 4 824 — pět a půl
 *  obrazovky jmen pod sebou. Skupiny (Pro, Proti, Zdržel se nebo nehlasoval, Omluven) se proto sbalí
 *  na nadpis, který i tak nese počet, a jména se rozbalí klepnutím. Souhrn hlasování ani tabulka
 *  klubů se nehnuly, ty zůstávají nahoře vidět.
 *
 *  Tlačítko vzniká ve skriptu, ne ve značce: bez JavaScriptu se nic nesbalí, takže by nebylo co
 *  rozbalovat, a skupiny se vypisují na dvou místech (všichni poslanci a oddíl každého klubu).
 *
 *  Jestli se sbaluje, říká CSS proměnná --sbalit-skupiny, ne šířka okna v JavaScriptu. Zlom tak
 *  zůstává v CSS na jednom místě a odpověď platí i pro skupiny, které zrovna schoval filtr klubu
 *  a nejdou změřit. */
export function inicializujSkupinyHlasovani(): void {
  const skupiny = [...document.querySelectorAll<HTMLElement>('.hl-skupina')];
  if (!skupiny.length) return;

  const sbaluje = () => getComputedStyle(document.documentElement).getPropertyValue('--sbalit-skupiny').trim() === '1';
  const tlacitka: HTMLButtonElement[] = [];

  for (const skupina of skupiny) {
    const jmena = skupina.querySelector('ul');
    const nadpis = skupina.querySelector('h3');
    if (!jmena || !nadpis) continue;
    if (!jmena.id) jmena.id = `hl-jmena-${tlacitka.length + 1}`;

    const tlacitko = document.createElement('button');
    tlacitko.type = 'button';
    tlacitko.className = 'hl-vice';
    tlacitko.hidden = true;
    tlacitko.setAttribute('aria-controls', jmena.id);

    // Tlačítek je pět pod sebou a všechna by se jmenovala „ukázat jména“. Jméno pro čtečku proto
    // nese i skupinu; viditelný text v něm zůstává celý, aby fungovalo hlasové ovládání (WCAG 2.5.3).
    const nazevSkupiny = nadpis.textContent?.trim().replace(/\s+/g, ' ') ?? '';
    const nastav = (otevreno: boolean) => {
      skupina.classList.toggle('rozbalene', otevreno);
      tlacitko.setAttribute('aria-expanded', String(otevreno));
      tlacitko.textContent = otevreno ? 'skrýt jména' : 'ukázat jména';
      if (nazevSkupiny) tlacitko.setAttribute('aria-label', `${tlacitko.textContent} — ${nazevSkupiny}`);
    };
    tlacitko.addEventListener('click', () => nastav(tlacitko.getAttribute('aria-expanded') !== 'true'));

    nadpis.after(tlacitko);
    nastav(false);
    tlacitka.push(tlacitko);
  }

  const prepocti = () => { const s = sbaluje(); tlacitka.forEach(t => { t.hidden = !s; }); };
  prepocti();
  addEventListener('resize', prepocti);
}
