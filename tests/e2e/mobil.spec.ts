/** Mobilní zobrazení: projekt „mobil“ v playwright.config.ts (emulovaný telefon s dotykem).
 *  Každá stránka webu se vyfotí do snimky/mobil/ k vizuální kontrole (přehled: snimky/mobil/index.html)
 *  a zároveň se změří, co se změřit dá. Seznam stránek se bere z hotového buildu, takže nově přibylá
 *  stránka se začne focit sama, bez zásahu do testu. */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { HLAVNI, UZKY, otevri, vyfot, prvkyPresahujiciSirku, maleDotykoveCile } from './snimky';
import { overBezPosouvaniDoStrany } from './pomocne';

/** Všechny stránky z buildu dist-e2e: každý index.html je jedna adresa. */
function najdiStranky(koren = 'dist-e2e', cesta = ''): { cesta: string; nazev: string }[] {
  const nalezene: { cesta: string; nazev: string }[] = [];
  for (const polozka of readdirSync(path.join(koren, cesta), { withFileTypes: true })) {
    if (polozka.isDirectory()) {
      nalezene.push(...najdiStranky(koren, path.join(cesta, polozka.name)));
    } else if (polozka.name === 'index.html') {
      const adresa = '/' + cesta.split(path.sep).filter(Boolean).map(c => c + '/').join('');
      nalezene.push({ cesta: adresa, nazev: adresa === '/' ? '00-uvod' : adresa.replace(/^\/|\/$/g, '').replace(/\//g, '-') });
    } else if (polozka.name === '404.html' && !cesta) {
      nalezene.push({ cesta: '/404.html', nazev: 'zz-nenalezeno' });
    }
  }
  return nalezene.sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs'));
}

const STRANKY = najdiStranky();
const PRO_AXE = ['/', '/?pohled=mapa', '/kauzy/zeta-stret/', '/pravidla/', '/pravidla/zakon-omega/', '/metodika/', '/o-projektu/'];
const PRO_DOTYK = ['/', '/?pohled=mapa', '/kauzy/zeta-stret/', '/pravidla/', '/metodika/'];
// Na telefonu mají záložky krátké popisky, aby se vešlo všech pět. Krátký tvar je skutečný text
// tlačítka, takže je zároveň jeho jménem pro čtečku i pro hlasové ovládání — proto se vybírají jím.
const ZALOZKY = [
  { zalozka: 'Kdy', nazev: 'stav-detail-chronologie' },
  { zalozka: 'Vazby', nazev: 'stav-detail-souvislosti' },
  { zalozka: 'Stav', nazev: 'stav-detail-stav' },
  { zalozka: /^Zdroje/, nazev: 'stav-detail-zdroje' },
];

test.describe(`telefon ${HLAVNI.width}×${HLAVNI.height}`, () => {
  test.use({ viewport: HLAVNI });

  // Snímek a kontrola šířky pro každou stránku v buildu.
  for (const s of STRANKY) {
    test(`${s.cesta}: snímek a nic se neposouvá do strany`, async ({ page }) => {
      await otevri(page, s.cesta);
      await vyfot(page, s.nazev, s.cesta);
      await overBezPosouvaniDoStrany(page);
      expect(await prvkyPresahujiciSirku(page), 'prvky přesahující šířku okna').toEqual([]);
    });
  }

  // Stavy, do kterých se stránka dostane až ovládáním — na mobilu vypadají jinak než na počítači.
  test('kauzy: rozbalená témata a prázdný výsledek hledání', async ({ page }) => {
    await otevri(page, '/');
    await page.locator('.filtry .f-cipy .f-vice').click();
    await vyfot(page, 'stav-temata-rozbalena', 'Kauzy s rozbaleným seznamem témat („+N další“)');
    expect(await prvkyPresahujiciSirku(page), 'rozbalená témata nesmí přesahovat šířku').toEqual([]);

    await otevri(page, '/');
    await page.getByRole('searchbox', { name: 'Hledat v kauzách' }).fill('nic takoveho neexistuje');
    await expect(page.locator('.prazdno')).toBeVisible();
    await vyfot(page, 'stav-hledani-bez-vysledku', 'Kauzy — hledání bez výsledku');
    await overBezPosouvaniDoStrany(page);
  });

  test('mapa: vysvětlení vazby pod řádkem stromu', async ({ page }) => {
    await otevri(page, '/?pohled=mapa');
    const uzel = page.locator('.strom li[data-uzel="k:epsilon-fondy"][data-hlavni]');
    await uzel.locator(':scope > .s-radek .s-info').click();
    await expect(uzel.locator(':scope > .s-vazba')).toBeVisible();
    await vyfot(page, 'stav-mapa-vazba', 'Mapa — rozbalené vysvětlení vazby (ⓘ)');
    expect(await prvkyPresahujiciSirku(page), 'vysvětlení vazby nesmí přesahovat šířku').toEqual([]);
  });

  for (const z of ZALOZKY) {
    test(`detail kauzy: záložka ${z.zalozka}`, async ({ page }) => {
      await otevri(page, '/kauzy/zeta-stret/');
      await page.getByRole('tab', { name: z.zalozka }).click();
      await vyfot(page, z.nazev, `Detail kauzy zeta-stret, záložka ${z.zalozka}`);
      const d = await page.locator('dialog#detail').evaluate(e => ({ sw: e.scrollWidth, cw: e.clientWidth }));
      expect(d.sw, 'detail kauzy se nesmí posouvat do strany').toBeLessThanOrEqual(d.cw);
      await overBezPosouvaniDoStrany(page);
    });
  }

  // Hlavička detailu zabírala 518 z 844 px, než se čtenář dostal k textu kauzy. Tyhle tři testy drží,
  // čím se to zmenšilo — jinak se to při příští úpravě stylů nepozorovaně vrátí.
  test('detail kauzy: všech pět záložek je vidět najednou', async ({ page }) => {
    await otevri(page, '/kauzy/zeta-stret/');
    const lista = page.locator('dialog#detail .zalozky');
    const m = await lista.evaluate(e => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    expect(m.sw, 'lišta záložek nesmí pokračovat mimo obraz').toBeLessThanOrEqual(m.cw);
    await expect(page.getByRole('tab')).toHaveCount(5);
    for (const t of await page.getByRole('tab').all()) await expect(t).toBeInViewport();
  });

  test('detail kauzy: mini-osa je jen v Chronologii', async ({ page }) => {
    await otevri(page, '/kauzy/zeta-stret/');
    const osa = page.locator('dialog#detail .mini-osa');
    await expect(osa, 'v záložce Proč osa nepatří').toBeHidden();
    await page.getByRole('tab', { name: 'Kdy' }).click();
    await expect(osa, 'v Chronologii se osa ovládá, tam patří').toBeVisible();
    // body se měří až tady: dokud byla osa schovaná, měla nulovou šířku
    const sirky = await osa.locator('.bod').evaluateAll(b => b.map(x => x.style.getPropertyValue('--sirka')));
    expect(sirky.every(s => s !== ''), 'body osy musí mít spočítanou šířku').toBe(true);
    await page.getByRole('tab', { name: 'Vazby' }).click();
    await expect(osa).toBeHidden();
  });

  // gama-offshore je jediná fixtura s částkami: ostatní kauzy testují krátkou hlavičku.
  test('detail kauzy: částky jsou sbalené na čísla a tlačítko je rozbalí', async ({ page }) => {
    await otevri(page, '/kauzy/gama-offshore/');
    const popis = page.locator('dialog#detail .castky .popis-castky').first();
    const vice = page.locator('dialog#detail .castky-vice');
    await expect(page.locator('dialog#detail .castky strong').first(), 'částka samotná zůstává vidět').toBeVisible();
    await expect(popis, 'popis částky je na telefonu sbalený').toBeHidden();
    await expect(vice).toBeVisible();
    await vice.click();
    await expect(popis, 'po rozbalení je popis i s čísly zdrojů vidět').toBeVisible();
    await expect(vice).toHaveAttribute('aria-expanded', 'true');
  });

  test('kauzy: další filtry se otevírají tlačítkem a zvolený filtr se neschová', async ({ page }) => {
    await otevri(page, '/');
    const veta = page.locator('.filtry .f-dalsi');
    const upresnit = page.locator('.filtry .f-upresnit');
    await expect(veta, 'věta dalších filtrů je na telefonu sbalená').toBeHidden();
    await expect(upresnit).toBeVisible();
    await upresnit.click();
    await expect(veta).toBeVisible();
    await vyfot(page, 'stav-upresnit-vyber', 'Kauzy — rozbalené další filtry („Upřesnit výběr“)');
    // filtr zvolený ve větě ji musí nechat otevřenou a počítat se do popisku, až se zavře
    await page.locator('.f-dalsi select[data-filtr="stav"]').selectOption({ index: 1 });
    await upresnit.click();
    await expect(veta).toBeHidden();
    await expect(upresnit).toHaveText('Upřesnit výběr (1)');
    await overBezPosouvaniDoStrany(page);
  });

  // Jmenný seznam celé sněmovny byl na telefonu 4 409 px z 4 824 — pět a půl obrazovky jmen.
  test('hlasování: jmenné seznamy jsou sbalené a tlačítko je rozbalí', async ({ page }) => {
    await otevri(page, '/hlasovani/psp-10-5-12/');
    const skupina = page.locator('.hl-vsichni .hl-skupina').first();
    const jmena = skupina.locator('ul');
    const vice = skupina.locator('.hl-vice');
    await expect(skupina.locator('h3'), 'počet poslanců zůstává vidět i sbalený').toContainText(/\(\d+\)/);
    await expect(jmena, 'jména jsou na telefonu sbalená').toBeHidden();
    await expect(vice).toBeVisible();
    await vice.click();
    await expect(jmena, 'po klepnutí jsou jména vidět').toBeVisible();
    await expect(vice).toHaveAttribute('aria-expanded', 'true');
    await vyfot(page, 'stav-hlasovani-jmena', 'Hlasování — rozbalená jména v jedné skupině');
    await overBezPosouvaniDoStrany(page);
  });

  test('hlasování: souhrn i volba klubu zůstávají na první obrazovce', async ({ page }) => {
    await otevri(page, '/hlasovani/psp-10-5-12/');
    // To podstatné — jak hlasování dopadlo a kudy se dostat ke klubům — musí být vidět hned.
    // Tabulka klubů se na telefonu neukazuje odjakživa (hlasovani.css), místo ní jsou čipy.
    await expect(page.locator('.hl-vysledek')).toBeInViewport();
    await expect(page.locator('.hl-cipy')).toBeInViewport();
    await expect(page.locator('.hl-tabulka-obal'), 'tabulka klubů je na telefonu nahrazená čipy').toBeHidden();
  });

  for (const pohled of ['Seznam', 'Časová osa']) {
    test(`zákony a nařízení: pohled ${pohled}`, async ({ page }) => {
      await otevri(page, '/pravidla/');
      await page.locator('.pr-pohled button', { hasText: pohled }).click();
      await vyfot(page, `stav-pravidla-${pohled === 'Seznam' ? 'seznam' : 'osa'}`, `Zákony a nařízení — pohled ${pohled}`);
      await overBezPosouvaniDoStrany(page);
    });
  }

  for (const cesta of ['/metodika/', '/o-projektu/']) {
    test(`${cesta}: celé znění oddílu v modalu`, async ({ page }) => {
      await otevri(page, cesta);
      await page.locator('.v4-karta button').first().click();
      await expect(page.locator('dialog.v4-dlg')).toBeVisible();
      await vyfot(page, `stav-${cesta.replace(/\//g, '')}-cele-zneni`, `Celé znění oddílu v modalu (${cesta})`);
      await overBezPosouvaniDoStrany(page);
    });
  }

  test('detail kauzy jde otevřít dotykem a zavřít křížkem', async ({ page }) => {
    await otevri(page, '/');
    await page.locator('.radek a.radek-btn').first().tap();
    await expect(page.locator('dialog#detail')).toBeVisible();
    await page.locator('dialog#detail .zavrit').tap();
    await expect(page.locator('dialog#detail')).not.toBeVisible();
  });

  // Povinné minimum (24 px) je kontrola, doporučených 44 px se jen vypíše do zprávy z běhu jako příloha.
  for (const cesta of PRO_DOTYK) {
    test(`${cesta}: velikost dotykových cílů`, async ({ page }, info) => {
      await otevri(page, cesta);
      const pod44 = await maleDotykoveCile(page, 44);
      await info.attach('cile-pod-44px.txt', { body: pod44.join('\n') || 'žádné', contentType: 'text/plain' });
      expect(await maleDotykoveCile(page, 24), 'dotykové cíle pod povinnou hranicí WCAG 2.5.8').toEqual([]);
    });
  }

  for (const cesta of PRO_AXE) {
    test(`${cesta}: bez závažných chyb přístupnosti na mobilu`, async ({ page }) => {
      await otevri(page, cesta);
      const vysledek = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const zavazne = vysledek.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
      expect(zavazne.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
});

// Nejužší displej, se kterým počítáme. Snímky jen tam, kde se layout láme nejdřív.
const UZKE_STRANKY = ['00-uvod', 'kauzy-zeta-stret', 'pravidla', 'pravidla-oblasti-dotace-stret-zajmu', 'metodika'];

test.describe(`úzký telefon ${UZKY.width}×${UZKY.height}`, () => {
  test.use({ viewport: UZKY });

  for (const s of STRANKY.filter(s => UZKE_STRANKY.includes(s.nazev))) {
    test(`${s.cesta}: snímek a nic se neposouvá do strany`, async ({ page }) => {
      await otevri(page, s.cesta);
      await vyfot(page, s.nazev, s.cesta);
      await overBezPosouvaniDoStrany(page);
      expect(await prvkyPresahujiciSirku(page), 'prvky přesahující šířku okna').toEqual([]);
    });
  }
});
