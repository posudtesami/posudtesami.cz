/** Věta dalších filtrů a řazení („Ukázat kauzy v jakémkoli stavu, jakkoli dlouhé…“) zabere na telefonu
 *  tři řádky nad výpisem. Tady se schová za jeden odkaz „Upřesnit výběr“; na počítači se nic nemění.
 *
 *  Tlačítko vzniká až ve skriptu, ne ve značce: bez JavaScriptu by nebylo co rozbalovat, takže se věta
 *  ukáže rovnou. Zároveň je stejné pro kauzy i pro zákony a nařízení, které mají vlastní značku —
 *  jedno místo místo dvou kopií.
 *
 *  Zvolený filtr se nikdy neschová: když je některý nastavený (třeba z adresy), věta se otevře sama,
 *  a je-li zavřená, tlačítko nese počet zvolených filtrů. */
/** Událost na document: filtry se zrušily skriptem (výběry se vynulovaly bez události change). */
export const FILTRY_ZRUSENE = 'nv:filtry-zrusene';

export function inicializujUpresnit(): void {
  document.querySelectorAll<HTMLElement>('.f-dalsi').forEach((veta, poradi) => {
    const obal = veta.parentElement;
    if (!obal || veta.dataset.upresnit) return;
    veta.dataset.upresnit = 'ano';
    if (!veta.id) veta.id = `f-dalsi-${poradi + 1}`;

    const tlacitko = document.createElement('button');
    tlacitko.type = 'button';
    tlacitko.className = 'f-upresnit';
    tlacitko.setAttribute('aria-controls', veta.id);

    const zvolene = () => [...veta.querySelectorAll<HTMLSelectElement>('select[data-filtr]')].filter(s => s.value !== '').length;
    const nastav = (otevreno: boolean) => {
      const n = zvolene();
      obal.classList.toggle('upresneno', otevreno);
      tlacitko.setAttribute('aria-expanded', String(otevreno));
      tlacitko.textContent = otevreno ? 'Skrýt upřesnění' : n > 0 ? `Upřesnit výběr (${n})` : 'Upřesnit výběr';
    };

    tlacitko.addEventListener('click', () => nastav(tlacitko.getAttribute('aria-expanded') !== 'true'));
    veta.addEventListener('change', () => nastav(tlacitko.getAttribute('aria-expanded') === 'true'));
    // „Zrušit filtry“ nastaví výběry skriptem, bez události change: počet v tlačítku by zůstal starý
    document.addEventListener(FILTRY_ZRUSENE, () => nastav(tlacitko.getAttribute('aria-expanded') === 'true'));
    obal.insertBefore(tlacitko, veta);
    nastav(zvolene() > 0);
  });
}
