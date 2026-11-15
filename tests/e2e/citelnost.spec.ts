import { test, expect, type Page } from '@playwright/test';
import { overBezPosouvaniDoStrany } from './pomocne';

// Čitelnost pro širokou veřejnost: věta „O co jde“ obyčejnou řečí, pojmy a zkratky s výkladem na klepnutí
// a výklad stavu. Hlídá, že čtenář vysvětlení opravdu dostane (a že mu nic nepřekáží ani nemizí).
const TELEFON = { width: 390, height: 844 };
const UZKY = { width: 320, height: 568 };
const VETA_ALFA = 'Fiktivní firma Alfa dostala fiktivní dotaci pro malé podniky. Fiktivní soud řeší, jestli na ni měla nárok.';

const viditelnyPanel = (page: Page) => page.locator('#detail .m2-panel:not([hidden])');

test.describe('věta „O co jde“', () => {
  test('vysoké okno počítače: v detailu stojí tučně před shrnutím, obojí je vidět celé', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/kauzy/alfa-dotace/');
    const veta = page.locator('#detail .o-co-jde');
    await expect(veta).toHaveText(VETA_ALFA);
    await expect(page.locator('#detail .perex')).toBeVisible();
    await expect(page.locator('#detail .perex-vice')).toBeHidden();
    const m = await page.evaluate(() => {
      const v = document.querySelector<HTMLElement>('#detail .o-co-jde')!, p = document.querySelector<HTMLElement>('#detail .perex')!;
      return { tucne: Number(getComputedStyle(v).fontWeight), vetaNahore: v.getClientRects()[0].top, shrnutiNahore: p.getClientRects()[0].top, shrnutiDole: p.getBoundingClientRect().bottom, osa: document.querySelector('#detail .mini-osa')!.getBoundingClientRect().top };
    });
    expect(m.tucne).toBeGreaterThanOrEqual(700);
    expect(m.vetaNahore, 'věta je před shrnutím').toBeLessThanOrEqual(m.shrnutiNahore);
    expect(m.shrnutiDole, 'shrnutí končí nad osou událostí').toBeLessThanOrEqual(m.osa);
  });

  test('počítač: v řádku osy věta není, zůstává stav a počet zdrojů', async ({ page }) => {
    await page.goto('/');
    const radek = page.locator('.radek[data-slug="alfa-dotace"]');
    await expect(radek.locator('.o-co-jde')).toBeHidden();
    await expect(radek.locator('.nazev small')).toBeVisible();
  });

  for (const v of [TELEFON, UZKY]) {
    test(`telefon ${v.width}×${v.height}: věta je v řádku osy pod názvem a celá vidět`, async ({ page }) => {
      await page.setViewportSize(v);
      await page.goto('/');
      const radky = page.locator('.radek:not([hidden])');
      await expect(radky.first().locator('.o-co-jde')).toBeVisible();
      await expect(page.locator('.radek[data-slug="alfa-dotace"] .o-co-jde')).toHaveText(VETA_ALFA);
      const potize = await radky.evaluateAll(els => els.flatMap(r => {
        const nazev = r.querySelector('.nazev strong')!.getBoundingClientRect();
        const veta = r.querySelector<HTMLElement>('.o-co-jde')!;
        const v = veta.getBoundingClientRect(), stopa = r.querySelector('.pruh')!.getBoundingClientRect(), obal = r.getBoundingClientRect();
        const chyby: string[] = [];
        if (v.top < nazev.bottom - 1) chyby.push('věta překrývá název');
        if (v.bottom > obal.bottom + 1) chyby.push('věta přetéká řádek');
        if (veta.scrollHeight > veta.clientHeight + 1 || veta.scrollWidth > veta.clientWidth + 1) chyby.push('věta je oříznutá');
        if (stopa.top < v.bottom - 12) chyby.push('pruh let překrývá větu'); // popisek let stojí těsně nad pruhem
        return chyby.map(c => `${(r as HTMLElement).dataset.slug}: ${c}`);
      }));
      expect(potize).toEqual([]);
      await overBezPosouvaniDoStrany(page);
    });
  }

  for (const v of [TELEFON, { width: 1366, height: 660 }]) test(`${v.width}×${v.height}: v detailu je vidět věta, přesné shrnutí rozbalí tlačítko`, async ({ page }) => {
    await page.setViewportSize(v);
    await page.goto('/kauzy/zeta-stret/');
    const veta = page.locator('#detail .o-co-jde'), shrnuti = page.locator('#detail .perex'), vice = page.locator('#detail .perex-vice');
    await expect(veta).toBeVisible();
    expect(await veta.evaluate(e => e.scrollHeight <= e.clientHeight + 1), 'věta není oříznutá').toBe(true);
    await expect(shrnuti).toBeHidden();
    await expect(vice).toBeVisible();
    await vice.click();
    await expect(shrnuti).toBeVisible();
    await expect(shrnuti).toContainText('Fiktivní podezření ze střetu zájmů');
    await vice.click();
    await expect(shrnuti).toBeHidden();
  });

  test('hledání najde kauzu podle slova, které je jen ve větě „O co jde“', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Hledat v kauzách' }).fill('jestli narok');
    const viditelne = page.locator('.radek:not([hidden])');
    await expect(viditelne).toHaveCount(1);
    await expect(viditelne).toHaveAttribute('data-slug', 'alfa-dotace');
  });
});

test.describe('pojmy a zkratky s výkladem', () => {
  test('klepnutí na pojem ukáže výklad; Escape zavře výklad, detail zůstane', async ({ page }) => {
    await page.goto('/kauzy/zeta-stret/');
    const pojem = viditelnyPanel(page).locator('button.pojem', { hasText: 'státní zastupitelství' });
    const vyklad = page.locator('#pojem-statni-zastupce');
    await expect(vyklad).toBeHidden();
    await pojem.click();
    await expect(vyklad).toBeVisible();
    await expect(vyklad.locator('.pojem-heslo')).toHaveText('Státní zástupce');
    await expect(vyklad).toContainText('Veřejný žalobce.');
    await page.keyboard.press('Escape');
    await expect(vyklad).toBeHidden();
    await expect(page.locator('dialog#detail')).toBeVisible();
  });

  test('výklad zavře i tlačítko Zavřít a jde otevřít klávesnicí', async ({ page }) => {
    await page.goto('/kauzy/zeta-stret/');
    const pojem = viditelnyPanel(page).locator('button.pojem').first();
    await pojem.focus();
    await page.keyboard.press('Enter');
    const vyklad = page.locator('.pojem-vyklad:popover-open');
    await expect(vyklad).toHaveCount(1);
    await vyklad.getByRole('button', { name: 'Zavřít' }).click();
    await expect(page.locator('.pojem-vyklad:popover-open')).toHaveCount(0);
  });

  test('výklad funguje i v detailu otevřeném z titulní stránky', async ({ page }) => {
    await page.goto('/');
    await page.locator('.radek[data-slug="zeta-stret"] a.radek-btn').click();
    await expect(page.locator('dialog#detail')).toBeVisible();
    await viditelnyPanel(page).locator('button.pojem').first().click();
    await expect(page.locator('#detail .pojem-vyklad:popover-open')).toHaveCount(1);
  });

  for (const cesta of ['/kauzy/alfa-dotace/', '/kauzy/zeta-stret/', '/kauzy/gama-offshore/', '/pravidla/zakon-omega/']) {
    test(`${cesta}: každý pojem má výklad a v jedné části je označený jednou`, async ({ page }) => {
      await page.goto(cesta);
      const r = await page.evaluate(() => {
        const d = document.querySelector('#detail')!;
        const tlacitka = [...d.querySelectorAll<HTMLElement>('button.pojem')];
        const cile = tlacitka.map(b => b.getAttribute('popovertarget')!);
        const vyklady = [...d.querySelectorAll('.pojem-vyklad')].map(v => v.id);
        // část = hlavička, jedna událost chronologie, nebo celá záložka
        const cast = (b: HTMLElement) => b.closest('.udalosti-seznam > li') ?? b.closest('.stanovisko') ?? b.closest('.m2-panel, .m2-hlava')!;
        const dvakrat: string[] = [];
        const videne = new Map<Element, Set<string>>();
        for (const b of tlacitka) {
          const c = cast(b), id = b.getAttribute('popovertarget')!;
          if (!videne.has(c)) videne.set(c, new Set());
          if (videne.get(c)!.has(id)) dvakrat.push(id);
          videne.get(c)!.add(id);
        }
        return { pocet: tlacitka.length, bezVykladu: cile.filter(c => !vyklady.includes(c)), nepouzite: vyklady.filter(v => !cile.includes(v)), dvakrat, vOdkazu: tlacitka.filter(b => b.closest('a')).length };
      });
      expect(r.pocet, 'v detailu je aspoň jeden pojem s výkladem').toBeGreaterThan(0);
      expect(r.bezVykladu).toEqual([]);
      expect(r.nepouzite).toEqual([]);
      expect(r.dvakrat).toEqual([]);
      expect(r.vOdkazu).toBe(0);
    });
  }

  test('odkaz „Celý slovníček“ otevře heslo ve slovníčku Metodiky', async ({ page }) => {
    await page.goto('/kauzy/zeta-stret/');
    await viditelnyPanel(page).locator('button.pojem', { hasText: 'státní zastupitelství' }).click();
    await page.locator('#pojem-statni-zastupce').getByRole('link', { name: 'Celý slovníček' }).click();
    await expect(page).toHaveURL(/\/metodika\/#pojem-statni-zastupce$/);
    const panel = page.locator('.v4-dlg-panel[data-sekce="pojmy"]');
    await expect(panel).toBeVisible();
    await expect(panel.locator('#pojem-statni-zastupce')).toHaveText('státní zástupce');
    await expect(panel.locator('#pojem-statni-zastupce')).toBeInViewport();
  });

  for (const v of [TELEFON, UZKY]) {
    test(`telefon ${v.width}×${v.height}: výklad je lišta dole přes celou šířku a stránka se neposouvá do strany`, async ({ page }) => {
      await page.setViewportSize(v);
      await page.goto('/kauzy/zeta-stret/');
      const pojem = viditelnyPanel(page).locator('button.pojem').first();
      await pojem.scrollIntoViewIfNeeded();
      await pojem.click();
      const vyklad = page.locator('.pojem-vyklad:popover-open');
      await expect(vyklad).toBeVisible();
      await vyklad.evaluate(e => Promise.all(e.getAnimations().map(a => a.finished))); // lišta přijíždí zdola
      const b = (await vyklad.boundingBox())!;
      expect(Math.round(b.x)).toBe(0);
      expect(Math.round(b.width)).toBe(v.width);
      expect(Math.round(b.y + b.height), 'lišta sedí na spodku obrazovky').toBe(v.height);
      expect(b.height, 'výklad nezakryje víc než polovinu obrazovky').toBeLessThan(v.height / 2);
      const zavrit = (await vyklad.getByRole('button', { name: 'Zavřít' }).boundingBox())!;
      expect(Math.min(zavrit.width, zavrit.height), 'tlačítko Zavřít je dost velké pro prst').toBeGreaterThanOrEqual(44);
      await overBezPosouvaniDoStrany(page);
    });
  }

  test('pojem v textu vypadá jako text s tečkovaným podtržením, ne jako tlačítko', async ({ page }) => {
    await page.goto('/kauzy/zeta-stret/');
    const s = await viditelnyPanel(page).locator('button.pojem').first().evaluate(b => {
      const cs = getComputedStyle(b), rodic = getComputedStyle(b.parentElement!);
      return { pismo: cs.fontSize === rodic.fontSize && cs.fontFamily === rodic.fontFamily, barva: cs.color === rodic.color, podtrzeni: cs.textDecorationStyle, okraj: cs.borderTopWidth, pozadi: cs.backgroundColor };
    });
    expect(s).toEqual({ pismo: true, barva: true, podtrzeni: 'dotted', okraj: '0px', pozadi: 'rgba(0, 0, 0, 0)' });
  });
});

test.describe('stav kauzy', () => {
  test('pod stavem je jedna věta, co stav znamená', async ({ page }) => {
    await page.goto('/kauzy/zeta-stret/');
    await page.getByRole('tab', { name: 'Stav a stanovisko' }).click();
    await expect(page.locator('#detail .stav-box .stav')).toHaveText('Obžaloba');
    await expect(page.locator('#detail .stav-box .stav-vyklad')).toHaveText('Státní zástupce podal k soudu obžalobu.');
  });
});

test.describe('Metodika', () => {
  test('má slovníček pojmů a zkratek', async ({ page }) => {
    await page.goto('/metodika/#pojmy');
    const panel = page.locator('.v4-dlg-panel[data-sekce="pojmy"]');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Slovníček pojmů a zkratek');
    expect(await panel.locator('dl.slovnicek dt').count()).toBeGreaterThan(80);
    await expect(panel.locator('#pojem-z-uohs')).toHaveText('ÚOHS');
  });

  test('oddíl Jak píšeme říká, jak se píše srozumitelně', async ({ page }) => {
    await page.goto('/metodika/#srozumitelnost');
    const jazyk = page.locator('.v4-dlg-panel[data-sekce="jazyk"]');
    await expect(jazyk).toBeVisible();
    await expect(jazyk).toContainText('bez zkratek a právních pojmů');
  });
});
