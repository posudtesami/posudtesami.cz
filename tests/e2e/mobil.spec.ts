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
const PRO_DOTYK = ['/', '/?pohled=mapa', '/kauzy/zeta-stret/', '/kauzy/gama-offshore/', '/pravidla/', '/metodika/', '/hlasovani/psp-10-5-12/'];
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

  test('kauzy: svislá osa místo pruhů — rok začátku vlevo, konec a délka nad názvem', async ({ page }) => {
    // pruh na ose 1980–letošek měl na telefonu 6,8 px na rok a čitelný byl jen popisek (díl vybraný 15. 11.)
    await page.goto('/');
    await expect(page.locator('.osa-roku')).toBeHidden();
    const radek = page.locator('.radek[data-slug="alfa-dotace"]');
    await expect(radek.locator('.pruh')).toBeHidden();
    await expect(radek.locator('.r-konec')).toHaveText('dosud · ' + (new Date().getFullYear() - 2007) + ' let');
    await expect(page.locator('.radek[data-slug="delta-dluhopisy"] .r-konec')).toHaveText('do 2014 · 2 roky');
    // „a dál“ se na telefonu nepíše: „dosud“ říká totéž
    for (const t of await page.locator('.radek:not([hidden]) .r-konec').allTextContents()) expect(t).not.toContain('a dál');
    // rok stojí ve sloupci vlevo od textu, ne nad ním
    const rok = (await radek.locator('.r-rok').boundingBox())!, nazev = (await radek.locator('strong').boundingBox())!;
    expect(rok.x + rok.width).toBeLessThanOrEqual(nazev.x);
    expect(rok.y).toBeLessThan(nazev.y);
    // čtečka slyší název i začátek: „… od 2007 dosud · 19 let“
    await expect(radek.locator('a')).toHaveAccessibleName(/^Testovací kauza Alfa.*od 2007 dosud · \d+ let/);
    // žádná dvojice ve fixturách nezačíná stejným rokem: rok je vidět u každé kauzy
    await expect(page.locator('.radek[data-stejny-rok]')).toHaveCount(0);
    await expect(page.locator('.legenda i')).toHaveCount(3);
    await expect(page.locator('.legenda i').first()).toBeHidden();
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

  // Menu mělo na telefonu písmo 12 px, aby se čtyři položky vešly na řádek se značkou — pod
  // hranicí 14 px, a to u nejdůležitějšího ovládání webu. Teď má značka vlastní řádek a menu
  // pod ní 15 px. Výšku hlavičky hlídáme: je to cena, která nesmí potichu růst.
  test('hlavička: značka má vlastní řádek a menu pod ní čitelné písmo', async ({ page }) => {
    for (const cesta of ['/', '/pravidla/', '/metodika/', '/hlasovani/psp-10-5-12/']) {
      await otevri(page, cesta);
      const m = await page.evaluate(() => {
        const top = document.querySelector('.top')!, znacka = top.querySelector('.brand')!;
        const odkazy = [...top.querySelectorAll('nav a')];
        return {
          vyska: Math.round(top.getBoundingClientRect().height),
          pismo: Math.min(...odkazy.map(a => parseFloat(getComputedStyle(a).fontSize))),
          znacka: parseFloat(getComputedStyle(znacka).fontSize),
          podZnackou: Math.min(...odkazy.map(a => a.getBoundingClientRect().top)) >= znacka.getBoundingClientRect().bottom - 1,
          rada: new Set(odkazy.map(a => Math.round(a.getBoundingClientRect().top))).size,
        };
      });
      expect(m.pismo, `${cesta}: písmo menu`).toBeGreaterThanOrEqual(14);
      expect(m.znacka, `${cesta}: značka je v plné velikosti`).toBe(18);
      expect(m.podZnackou, `${cesta}: menu stojí pod značkou`).toBe(true);
      expect(m.rada, `${cesta}: odkazy menu jsou v jedné řadě`).toBe(1);
      expect(m.vyska, `${cesta}: hlavička nesmí být vyšší než 104 px`).toBeLessThanOrEqual(104);
    }
  });

  // Zákon má pět až sedm záložek. S plnými názvy byly dvě ze šesti mimo obraz a třetí uříznutá,
  // mezi nimi Zdroje. Teď mají krátké popisky jako kauzy, a co se nevejde, zalomí se na druhý
  // řádek, místo aby ujelo do strany.
  test('detail zákona: žádná záložka není mimo obraz ani pod zavíracím křížkem', async ({ page }) => {
    for (const cesta of ['/pravidla/zakon-omega/', '/pravidla/usneseni-kappa/']) {
      await otevri(page, cesta);
      const m = await page.evaluate(() => {
        const lista = document.querySelector('dialog#detail .zalozky')!;
        const k = document.querySelector('dialog#detail .zavrit')!.getBoundingClientRect();
        const zal = [...lista.querySelectorAll('[role="tab"]')].map(b => b.getBoundingClientRect());
        return {
          pocet: zal.length, vyska: Math.round(lista.getBoundingClientRect().height),
          mimo: zal.filter(r => r.right > innerWidth + 0.5 || r.left < -0.5).length,
          podKrizkem: zal.filter(r => r.right > k.left && r.left < k.right && r.bottom > k.top && r.top < k.bottom).length,
          posouvaSe: lista.scrollWidth > lista.clientWidth + 1,
        };
      });
      expect(m.pocet, `${cesta}: detail má záložky`).toBeGreaterThanOrEqual(4);
      expect(m.mimo, `${cesta}: záložky mimo obraz`).toBe(0);
      expect(m.podKrizkem, `${cesta}: záložky pod zavíracím křížkem`).toBe(0);
      expect(m.posouvaSe, `${cesta}: lišta se nesmí posouvat do strany`).toBe(false);
      expect(m.vyska, `${cesta}: lišta má nejvýš dva řádky`).toBeLessThanOrEqual(88);
      for (const t of await page.getByRole('tab').all()) await expect(t).toBeInViewport();
    }
    // krátký popisek je skutečné jméno tlačítka, ne aria-label navíc
    await otevri(page, '/pravidla/zakon-omega/');
    await expect(page.getByRole('tab', { name: 'Výhrady', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Výhrady a stanovisko' })).toHaveCount(0);
    await vyfot(page, 'stav-zakon-zalozky', 'Detail zákona — krátké popisky záložek ve dvou řádcích');
  });

  // Hlavička detailu zabírala 518 z 844 px, než se čtenář dostal k textu kauzy. Tyhle tři testy drží,
  // čím se to zmenšilo — jinak se to při příští úpravě stylů nepozorovaně vrátí.
  test('detail kauzy: všech pět záložek je vidět najednou', async ({ page }) => {
    await otevri(page, '/kauzy/zeta-stret/');
    const lista = page.locator('dialog#detail .zalozky');
    const m = await lista.evaluate(e => ({ sw: e.scrollWidth, cw: e.clientWidth, v: Math.round(e.getBoundingClientRect().height) }));
    expect(m.sw, 'lišta záložek nesmí pokračovat mimo obraz').toBeLessThanOrEqual(m.cw);
    // pět krátkých popisků kauzy se vejde na jeden řádek; druhý by z displeje bral 44 px navíc
    expect(m.v, 'záložky kauzy jsou v jednom řádku').toBeLessThanOrEqual(45);
    await expect(page.getByRole('tab')).toHaveCount(5);
    for (const t of await page.getByRole('tab').all()) await expect(t).toBeInViewport();
  });

  // Mini-osa na telefonu jako ovladač nefungovala: u delší kauzy leželo 24 z 30 bodů na sobě
  // a konkrétní událost se prstem trefit nedala. Na telefonu se proto neukazuje vůbec a událostmi
  // se listuje tlačítky — ta jsou tím pádem jediné ovládání a musí fungovat dotykem.
  test('detail kauzy: na telefonu se událostmi listuje tlačítky, osa se neukazuje', async ({ page }) => {
    await otevri(page, '/kauzy/zeta-stret/');
    const osa = page.locator('dialog#detail .mini-osa');
    await expect(osa, 'v záložce Proč osa není').toBeHidden();
    await page.getByRole('tab', { name: 'Kdy' }).tap();
    await expect(osa, 'ani v Chronologii se osa na telefonu neukazuje').toBeHidden();

    const udalost = page.locator('.udalosti-seznam > li:not([hidden])');
    // Kde v posloupnosti čtenář je, říká tlačítko přehledu v liště. V události samotné se to
    // neopakuje (řád ovládání: žádný údaj není zároveň na liště i v obsahu).
    const poradi = page.locator('dialog#detail .listovani-prehled');
    const [zpet, dal] = [page.locator('.listovani [data-krok="-1"]'), page.locator('.listovani [data-krok="1"]')];
    const celkem = await page.locator('.udalosti-seznam > li').count();
    await expect(poradi, 'čtenář vidí, kde v posloupnosti je').toHaveText(`${celkem} z ${celkem}`);
    await expect(udalost.locator('time small'), 'pořadí se v obsahu neopakuje').toBeHidden();
    await expect(dal, 'na poslední události není kam dál').toBeDisabled();

    await zpet.tap();
    await expect(poradi).toHaveText(`${celkem - 1} z ${celkem}`);
    await expect(dal).toBeEnabled();
    await dal.tap();
    await expect(poradi).toHaveText(`${celkem} z ${celkem}`);

    // obě tlačítka jsou pohodlný terč a tlačítko říká, kam krok povede
    for (const t of [zpet, dal]) {
      const r = (await t.boundingBox())!;
      expect(Math.min(r.width, r.height), 'listovací tlačítko je aspoň 44 px').toBeGreaterThanOrEqual(44);
    }
    await expect(zpet.locator('span'), 'tlačítko nese název sousední události').not.toBeEmpty();
    await vyfot(page, 'stav-detail-listovani', 'Detail kauzy — chronologie se na telefonu listuje tlačítky');
  });

  // Lišta listování stála v toku za textem události: u delší události sjela pod okraj displeje
  // a pokaždé byla jinde. Přilepená dole je v dosahu palce a na stejném místě — za cenu 77 px,
  // o které se panel musí zmenšit, aby poslední řádek události nezůstal pod ní.
  test('detail kauzy: lišta listování je přilepená dole a nepřekrývá událost', async ({ page }) => {
    await otevri(page, '/kauzy/zeta-stret/');
    await page.getByRole('tab', { name: 'Kdy' }).tap();
    const lista = page.locator('dialog#detail .listovani');
    const m = await lista.evaluate(e => ({ poloha: getComputedStyle(e).position, dno: e.getBoundingClientRect().bottom }));
    expect(m.poloha, 'lišta je přilepená k displeji').toBe('fixed');
    expect(Math.abs(m.dno - HLAVNI.height), 'a drží se u spodního okraje').toBeLessThanOrEqual(2);

    // konec textu události musí zůstat nad lištou, i když se čtenář posune na konec
    await page.locator('dialog#detail').evaluate(e => { e.scrollTop = e.scrollHeight; });
    await page.waitForTimeout(150);
    const prekryv = await page.evaluate(() => {
      const l = document.querySelector('.listovani')!.getBoundingClientRect();
      const t = document.querySelector('.udalosti-seznam > li:not([hidden]) .udalost-velka > div')!.getBoundingClientRect();
      return Math.round(Math.max(0, t.bottom - l.top));
    });
    expect(prekryv, 'lišta nesmí překrýt konec události').toBe(0);
    await expect(lista, 'a sama zůstává vidět i po posunutí').toBeInViewport();
    await vyfot(page, 'stav-detail-listovani-dole', 'Detail kauzy — lišta listování přilepená dole');
  });

  // Bez osy by k události uprostřed třicetidílné kauzy vedlo patnáct klepnutí a čtenář by nevěděl,
  // co v kauze vůbec je, dokud by to neprolistoval. Přehled je obojí: rozcestník i pohled na celek.
  test('detail kauzy: přehled událostí v liště skočí kamkoli dvěma klepnutími', async ({ page }) => {
    await otevri(page, '/kauzy/zeta-stret/');
    await page.getByRole('tab', { name: 'Kdy' }).tap();
    const celkem = await page.locator('.udalosti-seznam > li').count();
    const prehled = page.locator('dialog#detail .listovani-prehled');
    // jméno pro čtečku začíná tím, co je vidět (pořadí) — hlasové ovládání najde, co čtenář čte
    await expect(prehled, 'tlačítko nese pořadí').toHaveText(`${celkem} z ${celkem}`);
    await expect(prehled).toHaveAccessibleName(new RegExp(`^${celkem} z ${celkem} — `));
    await expect(prehled).toHaveAttribute('aria-expanded', 'false');

    const seznam = page.locator('dialog#detail .udalosti-prehled');
    await expect(seznam).toBeHidden();
    await prehled.tap();
    await expect(seznam, 'přehled se otevře nad lištou').toBeVisible();
    const polozky = seznam.locator('button[data-i]');
    await expect(polozky, 'v přehledu jsou všechny události').toHaveCount(celkem);
    for (const b of await polozky.all()) {
      const r = (await b.boundingBox())!;
      expect(r.height, 'položka přehledu je pohodlný terč').toBeGreaterThanOrEqual(44);
    }
    // přehled nese datum i název, aby se dalo vybírat očima
    await expect(polozky.first().locator('.pr-datum')).not.toBeEmpty();
    const prvniNazev = (await page.locator('.udalosti-seznam > li').first().locator('h3').textContent())!.trim();
    await expect(polozky.first().locator('.pr-nazev')).toHaveText(prvniNazev);
    await vyfot(page, 'stav-detail-prehled-udalosti', 'Detail kauzy — přehled všech událostí nad lištou');

    await polozky.first().tap();
    await expect(seznam, 'po skoku se přehled zavře').toBeHidden();
    await expect(page.locator('.udalosti-seznam > li:not([hidden])'), 'ukázala se první událost').toHaveAttribute('data-i', '0');
    await expect(prehled, 'počítadlo jde s událostí').toHaveText(`1 z ${celkem}`);

    // jiná záložka přehled zavře, ať nezůstane viset nad obsahem
    await prehled.tap();
    await expect(seznam).toBeVisible();
    await page.getByRole('tab', { name: 'Stav' }).tap();
    await expect(prehled).toHaveAttribute('aria-expanded', 'false');
  });

  test('vyhledávací pole má aspoň 16 px, aby iPhone po klepnutí nepřibližoval', async ({ page }) => {
    for (const cesta of ['/', '/pravidla/']) {
      await otevri(page, cesta);
      const pismo = await page.locator('.filtry .f-hledat input').evaluate(e => parseFloat(getComputedStyle(e).fontSize));
      expect(pismo, `${cesta}: písmo vyhledávacího pole`).toBeGreaterThanOrEqual(16);
      // totéž platí pro výběry ve větě dalších filtrů — ty jsou schované za „Upřesnit výběr“,
      // takže je měření stránky, jak se načte, nikdy nevidělo
      await page.locator('.filtry .f-upresnit').click();
      const vybery = await page.locator('.filtry .f-dalsi select').evaluateAll(l => l.map(e => parseFloat(getComputedStyle(e).fontSize)));
      expect(vybery.length, `${cesta}: věta filtrů má výběry`).toBeGreaterThan(0);
      expect(Math.min(...vybery), `${cesta}: písmo výběrů ve větě filtrů`).toBeGreaterThanOrEqual(16);
    }
    // a přibližování samo zůstává povolené — vypnout ho by byla chyba přístupnosti
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport, 'přibližování nesmí být vypnuté').not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/);
  });

  // gama-offshore je jediná fixtura s částkami: ostatní kauzy testují krátkou hlavičku.
  test('detail kauzy: částky jsou sbalené na čísla a tlačítko je rozbalí', async ({ page }) => {
    await otevri(page, '/kauzy/gama-offshore/');
    const popis = page.locator('dialog#detail .castky .popis-castky').first();
    const vice = page.locator('dialog#detail .castky-vice');
    await expect(page.locator('dialog#detail .castky strong').first(), 'částka samotná zůstává vidět').toBeVisible();
    await expect(popis, 'popis částky je na telefonu sbalený').toBeHidden();
    await expect(vice).toBeVisible();
    // Tlačítko je součást seznamu částek, takže s nimi sdílí řádek, kdykoli je na něm místo (u kauzy
    // s jednou částkou), a jinak se zalomí pod ně. Na skutečném obsahu se vejde u 6 kauz z 21;
    // hlídáme proto stavbu, ne polohu — ta závisí na délce částek.
    await expect(page.locator('dialog#detail .castky .castky-vice'), 'tlačítko je uvnitř seznamu částek').toHaveCount(1);
    await expect(page.locator('dialog#detail .m2-hlava > .castky-vice'), 'a nestojí jako samostatný blok pod ním').toHaveCount(0);
    // Terčem je celý řádek částek: slova by si vedle nich vzala vlastní řádek (vešla se jen u 5 kauz
    // z 21). Tlačítko se proto přes řádek roztáhne a jeho popisek zůstane jen pro čtečku.
    const pokryti = await page.evaluate(() => {
      const c = document.querySelector('.castky')!.getBoundingClientRect();
      const t = document.querySelector('.castky-vice')!.getBoundingClientRect();
      return { sirka: t.width / c.width, vyska: t.height / c.height, terc: Math.min(t.width, t.height) };
    });
    expect(pokryti.sirka, 'tlačítko kryje celou šířku řádku částek').toBeGreaterThan(0.95);
    expect(pokryti.vyska, 'i celou jeho výšku').toBeGreaterThan(0.95);
    expect(pokryti.terc, 'terč je pohodlný').toBeGreaterThanOrEqual(44);
    await expect(vice, 'popisek zůstává jménem tlačítka pro čtečku').toHaveAccessibleName(/částk/);
    await expect(page.locator('dialog#detail .castky'), 'styly poznají sbalený řádek podle atributu').toHaveAttribute('data-sbalene', '');
    await vice.click();
    await expect(popis, 'po rozbalení je popis i s čísly zdrojů vidět').toBeVisible();
    await expect(vice).toHaveAttribute('aria-expanded', 'true');
    // rozbalené částky už tlačítko nepřekrývá: odkaz na metodiku i čísla zdrojů jdou klepnout
    await expect(page.locator('dialog#detail .castky-metodika a')).toBeVisible();
    expect(await page.locator('dialog#detail .castky-vice').evaluate(e => getComputedStyle(e).position),
      'tlačítko se vrátí mezi ostatní, aby nepřekrývalo odkazy').not.toBe('absolute');
  });

  // Kauza se čtyřmi částkami měla hlavičku o řádek vyšší než ostatní (385 px proti 252–294).
  test('detail kauzy: na telefonu jsou vidět nejvýš dvě částky', async ({ page }) => {
    await otevri(page, '/kauzy/gama-offshore/');
    const polozky = page.locator('dialog#detail .castky li:not(.castky-metodika):not(.castky-ovladani)');
    const vsech = await polozky.count();
    expect(vsech, 'fixtura musí mít víc než dvě částky, jinak se strop nemá na čem projevit').toBeGreaterThan(2);
    const videt = async () => (await polozky.evaluateAll(li => li.filter(x => x.getClientRects().length).length));
    expect(await videt(), 'na telefonu se ukážou dvě částky').toBe(2);
    // Schéma dovolí nejvýš tři částky, takže se schovává jedna až jedna — popisek proto hlídáme
    // slovem, ne číslem („další částka“ u jedné, „další 2 částky“ u dvou).
    const vice = page.locator('dialog#detail .castky-vice');
    await expect(vice, 'tlačítko musí říct, že jsou další částky schované').toContainText(/dalš/);
    // Popisek je na telefonu jen pro čtečku, takže počet schovaných částek nese i šipka za nimi.
    await expect(page.locator('dialog#detail .castky'), 'kolik částek je schovaných, je vidět u šipky')
      .toHaveAttribute('data-skryte', String(vsech - 2));
    if (vsech - 2 > 1) await expect(vice).toContainText(String(vsech - 2));
    await vice.click();
    expect(await videt(), 'po rozbalení jsou vidět všechny').toBe(vsech);
  });

  // Řád ovládání (upravy.css): web měl šest různých tvarů pro jednu akci „je toho víc, klepni sem“.
  // Odkaz, který rozbaluje blok textu, má všude stejný řez — ať je to shrnutí, filtry nebo znění.
  test('rozbalovací odkazy mají na celém webu jeden vzhled', async ({ page }) => {
    const KDE: [string, string][] = [
      ['/kauzy/gama-offshore/', 'dialog#detail .perex-vice'],
      ['/', '.filtry .f-upresnit'],
      ['/', '.filtry .f-cipy .f-vice'],
      ['/metodika/', '.v4-karta button'],
    ];
    const tvary: Record<string, string> = {};
    for (const [cesta, sel] of KDE) {
      await otevri(page, cesta);
      const prvek = page.locator(sel).first();
      if (!(await prvek.isVisible())) continue; // odkaz se ukazuje jen tam, kde je co rozbalit
      tvary[sel] = await prvek.evaluate(e => {
        const c = getComputedStyle(e);
        return [c.fontSize, c.fontWeight, c.fontStyle, c.textDecorationLine, c.borderTopWidth, c.color].join(' · ');
      });
    }
    const ruzne = [...new Set(Object.values(tvary))];
    expect(Object.keys(tvary).length, 'aspoň tři odkazy se musí dát změřit').toBeGreaterThanOrEqual(3);
    expect(ruzne, `rozbalovací odkazy se liší: ${JSON.stringify(tvary, null, 1)}`).toHaveLength(1);
    expect(ruzne[0], 'řez podle řádu: 14 px, 600, bez kurzívy, podtržené, bez rámečku').toMatch(/^14px · 600 · normal · underline · 0px · /);
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
    // Řád ovládání, tvar „řádek“: terčem je celý nadpis skupiny, ne slova vedle něj. Tlačítko je
    // uvnitř nadpisu a kryje jeho šířku — jinak by pět skupin stálo pět řádků navíc.
    await expect(skupina.locator('h3 > .hl-vice'), 'tlačítko je uvnitř nadpisu skupiny').toHaveCount(1);
    const [n, t] = await Promise.all([skupina.locator('h3').boundingBox(), vice.boundingBox()]);
    expect(t!.width / n!.width, 'tlačítko kryje celý řádek nadpisu').toBeGreaterThan(0.95);
    expect(t!.height, 'a je pohodlný terč').toBeGreaterThanOrEqual(44);
    // každé se pro čtečku jmenuje svou skupinou s počtem, ne pětkrát stejně
    await expect(vice).toHaveAccessibleName(/\(\d+\)/);
    const jmenaTlacitek = await page.locator('.hl-vsichni .hl-vice').evaluateAll(l => l.map(b => b.textContent!.trim()));
    expect(new Set(jmenaTlacitek).size, 'tlačítka skupin se od sebe liší jménem').toBe(jmenaTlacitek.length);
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

  // Povinné minimum je 24 px (WCAG 2.5.8, AA), pohodlné 44 px (WCAG 2.5.5 AAA, shodně Apple
  // i Material). Web drží tu vyšší hranici, proto se kontroluje rovnou 44.
  for (const cesta of PRO_DOTYK) {
    test(`${cesta}: velikost dotykových cílů`, async ({ page }) => {
      await otevri(page, cesta);
      expect(await maleDotykoveCile(page, 44), 'dotykové cíle menší než pohodlných 44 px').toEqual([]);
    });
  }

  // Měření stránky, jak se načte, nevidí nic, k čemu vede klepnutí. Záložka Zdroje tak nesla filtr
  // vysoký 24 px a odkazy pod seznamem vysoké 20 px, zatímco test výše procházel.
  // alfa-dotace je fixtura, která má filtr zdrojů (víc skupin zdrojů), zeta-stret odkaz na mapu.
  for (const cesta of ['/kauzy/zeta-stret/', '/kauzy/gama-offshore/', '/kauzy/alfa-dotace/', '/pravidla/zakon-omega/', '/pravidla/usneseni-kappa/']) {
    test(`${cesta}: dotykové cíle i v záložkách a po rozbalení`, async ({ page }) => {
      await otevri(page, cesta);
      const zalozky = await page.locator('dialog#detail .zalozky [role="tab"]').evaluateAll(l => l.map(b => (b as HTMLElement).dataset.p!));
      expect(zalozky.length, 'detail má záložky').toBeGreaterThan(2);
      for (const z of zalozky) {
        await page.locator(`dialog#detail .zalozky [data-p="${z}"]`).click();
        expect(await maleDotykoveCile(page, 44), `záložka ${z}: cíle pod 44 px`).toEqual([]);
      }
      await page.locator(`dialog#detail .zalozky [data-p="${zalozky[0]}"]`).click();
      for (const sel of ['.perex-vice', '.castky-vice']) {
        const prvek = page.locator(`dialog#detail ${sel}`);
        if (!(await prvek.isVisible())) continue;
        await prvek.click();
        expect(await maleDotykoveCile(page, 44), `po klepnutí na ${sel}: cíle pod 44 px`).toEqual([]);
      }
    });
  }

  // Řád ovládání: rámovaný prvek volby (čip, přepínač, filtr) má jeden řez, ať je kdekoli.
  // Záložka detailu je nadpis oddílu a drží 600.
  test('čipy, přepínače a filtry mají jeden řez písma', async ({ page }) => {
    const rezy: Record<string, string> = {};
    const zmer = async (jmeno: string, sel: string) => {
      const prvek = page.locator(sel).first();
      await expect(prvek, jmeno).toBeVisible();
      rezy[jmeno] = await prvek.evaluate(e => { const c = getComputedStyle(e); return `${c.fontSize} ${c.fontWeight}`; });
    };
    await otevri(page, '/');
    await zmer('čip tématu', '.filtry .f-cipy button:not(.f-vice)');
    await otevri(page, '/pravidla/');
    await zmer('přepínač pohledu', '.pr-pohled button');
    await otevri(page, '/hlasovani/psp-10-5-12/');
    await zmer('čip klubu', '.hl-cipy a');
    await otevri(page, '/kauzy/alfa-dotace/'); // jediná kauza ve fixturách s filtrem zdrojů
    await page.getByRole('tab', { name: /^Zdroje/ }).click();
    await zmer('filtr zdrojů', '.zdroje-filtr button');
    expect([...new Set(Object.values(rezy))], `řezy se liší: ${JSON.stringify(rezy)}`).toEqual(['13px 500']);
    await expect(page.locator('dialog#detail .zalozky [role="tab"]').first(), 'záložka je nadpis oddílu').toHaveCSS('font-weight', '600');
  });

  // Obsah detailu začíná na stejné svislici jako obsah stránky a jako lišta listování pod ním.
  test('detail drží stejný okraj jako stránka', async ({ page }) => {
    await otevri(page, '/');
    const okrajStranky = await page.locator('.filtry').evaluate(e => Math.round(e.getBoundingClientRect().left));
    await otevri(page, '/kauzy/zeta-stret/');
    await page.getByRole('tab', { name: 'Kdy' }).tap();
    const leve = await page.evaluate(() => {
      const x = (sel: string) => Math.round(document.querySelector(sel)!.getBoundingClientRect().left);
      return {
        nadpis: x('dialog#detail h1'), shrnuti: x('dialog#detail .perex'), zalozka: x('dialog#detail .zalozky [role="tab"]'),
        udalost: x('.udalosti-seznam > li:not([hidden]) time'), listovani: x('.listovani [data-krok="-1"]'),
      };
    });
    for (const [co, kde] of Object.entries(leve)) expect(kde, `${co} začíná na okraji stránky`).toBe(okrajStranky);
  });

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
