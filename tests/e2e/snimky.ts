import { expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Kam se ukládají snímky k vizuální kontrole. Mimo test-results, aby je úklid Playwrightu nesmazal. */
export const KOREN_SNIMKU = path.join(process.cwd(), 'snimky', 'mobil');

/** Mobilní rozměry pro snímky. Hlavní je 390×844 (iPhone 12–16, Pixel), úzký 320×568 je hraniční případ. */
export const HLAVNI = { width: 390, height: 844 };
export const UZKY = { width: 320, height: 568 };

/** Otevře stránku a počká, až je obraz ustálený: doběhlá písma a dokončené úvodní animace.
 *  Projekt „mobil“ běží s reducedMotion: 'reduce', takže se třída nacteno nastaví hned;
 *  stránka 404 ji nemá vůbec, proto se na ni čeká jen krátce a nepovinně. */
export async function otevri(page: Page, cesta: string) {
  await page.goto(cesta);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('body')).toHaveClass(/nacteno/, { timeout: 2000 }).catch(() => {});
}

/** Uloží snímek celé stránky do snimky/mobil/<šířka>x<výška>/<nazev>.png a popis do stejnojmenného .txt.
 *  Volat PŘED kontrolami, aby snímek vznikl i u testu, který spadne — právě ten chceme vidět. */
export async function vyfot(page: Page, nazev: string, popis: string) {
  const v = page.viewportSize()!;
  const slozka = path.join(KOREN_SNIMKU, `${v.width}x${v.height}`);
  await mkdir(slozka, { recursive: true });
  await page.screenshot({ path: path.join(slozka, `${nazev}.png`), fullPage: true, animations: 'disabled' });
  await writeFile(path.join(slozka, `${nazev}.txt`), popis, 'utf8');
}

/** Prvky, které přesahují šířku okna. Vrací popis viníka, ne jen „něco je špatně“.
 *  Nehlásí přesah uvnitř boxu, který si s ním poradí sám: vlastní vodorovný posuvník (lišta záložek,
 *  sloupce v modalu) nebo oříznutí s trojtečkou (dlouhý název v drobečkové navigaci). Že se do strany
 *  neposouvá celá stránka, hlídá overBezPosouvaniDoStrany. */
export async function prvkyPresahujiciSirku(page: Page) {
  return page.evaluate(() => {
    const okno = window.innerWidth;
    const popis = (el: Element) => {
      const t = el.tagName.toLowerCase();
      const tridy = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '';
      return `${t}${tridy}`.slice(0, 80);
    };
    const vPosuvniku = (el: HTMLElement) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox !== 'visible' && p.getBoundingClientRect().right <= okno + 1) return true;
      }
      return false;
    };
    const nalezene: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (!el.getClientRects().length || el.closest('[hidden]') || el.closest('[aria-hidden="true"]')) continue;
      if (getComputedStyle(el).position === 'fixed' || vPosuvniku(el)) continue;
      const r = el.getBoundingClientRect();
      const presah = Math.round(Math.max(r.right - okno, -r.left));
      if (presah > 1) nalezene.push(`${popis(el)} přesahuje o ${presah} px`);
    }
    return [...new Set(nalezene)];
  });
}

/** Dotykové cíle menší než `min` × `min` px. Hranice 24 px je povinné minimum (WCAG 2.5.8),
 *  44 px je doporučení Apple HIG i Material Design.
 *  Z pravidla jsou vyjmuté: odkazy uvnitř věty (výjimka „inline“ ve WCAG 2.5.8), odkazy v patičce
 *  a legendě (vedlejší text, ne ovládání) a prvky skryté do fokusu (odkaz „Přeskočit mapu“).
 *  U zaškrtávátka se měří celý jeho štítek, protože klepnout jde i na text. */
export async function maleDotykoveCile(page: Page, min = 44) {
  return page.evaluate((MIN) => {
    // .pr-oblasti: odkazy na oblasti stojí v řádku textu nad názvem zákona („… · Oblasti: A, B“).
    // Platí pro ně výjimka pro odkaz uvnitř věty (WCAG 2.5.8); zvětšit je na 44 px by hlavičce
    // přidalo přes 50 px kvůli jednomu řádku doprovodného textu.
    const vTextu = (el: Element) => !!el.closest('p, li, sup, small, figcaption, .lead, .met-hlava, .legenda, .paticka-met, .s-vazba, .pr-oblasti');
    const nalezene: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('a[href], button, [role="button"], input, select, summary')) {
      if (!el.getClientRects().length || el.closest('[hidden]') || (el as HTMLInputElement).disabled || vTextu(el)) continue;
      let r = el.getBoundingClientRect();
      let stitek: Element | null = null;
      // zaškrtávátko a přepínač: tappable je celý štítek
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        stitek = el.closest('label') ?? document.querySelector(`label[for="${el.id}"]`);
        if (stitek) r = stitek.getBoundingClientRect();
      }
      if (r.width < 2 || r.height < 2) continue; // skryté do fokusu
      if (r.width >= MIN && r.height >= MIN) continue;
      // innerText, ne textContent: v menu je i tvar schovaný přes display: none (dlouhý a krátký název)
      const jmeno = (el.getAttribute('aria-label') || el.innerText || (stitek as HTMLElement | null)?.innerText
        || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
      nalezene.push(`${el.tagName.toLowerCase()} „${jmeno}“ má ${Math.round(r.width)}×${Math.round(r.height)} px`);
    }
    return [...new Set(nalezene)];
  }, min);
}
