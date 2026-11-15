/* Díly k výběru — návrhy mobilního zobrazení ve formátu, jaký se používá v Akcionu
 * (docs/design/modely-vedle-marka-atomy.html): rozhodnutí rozložené na díly, u každého varianty
 * A/B/C vedle sebe s „Proč ano / Proč ne“, jedna doporučená, poznámka a volba ke stažení.
 *
 *   node .claude/skills/mobilni-design/nastroje/dily.mjs
 *
 * Náhled každé varianty je skutečný snímek telefonu 390×844 nad skutečným obsahem, ne kresba:
 * skript variantu nasadí na stránku (CSS, případně úprava DOM), změří ji a vyfotí.
 * Výsledek: navrhy/dily.html. Web si postaví sám, spustí server a uklidí po sobě. Nic nemění.
 *
 * ŠABLONA — před použitím se přepíše blok STRANKA a DILY. Dál se nic nemění. */
import { chromium, devices } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const VYSTUP = 'dist-mobil-dily';
const PORT = 4462;
const ADRESA = `http://localhost:${PORT}`;
const SLOZKA = path.join(process.cwd(), 'navrhy');
const TELEFON = { width: 390, height: 844 };

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Pomocné funkce, které běží uvnitř stránky
// ───────────────────────────────────────────────────────────────────────────────────────────────

/** Menu: jak velké je písmo, kolik místa hlavička bere a kde končí ovládání nad obsahem. */
const MER_MENU = () => {
  const top = document.querySelector('.top'), nav = top.querySelector('nav');
  const odkazy = [...nav.querySelectorAll('a')].filter(a => a.getClientRects().length);
  const tlacitko = document.querySelector('.nahled-menu');
  const cile = [...odkazy, ...(tlacitko ? [tlacitko] : [])].map(e => e.getBoundingClientRect());
  const filtry = document.querySelector('.filtry');
  const dole = getComputedStyle(nav).position === 'fixed';
  return {
    'písmo menu': odkazy.length ? String(Math.round(parseFloat(getComputedStyle(odkazy[0]).fontSize) * 10) / 10).replace('.', ',') + ' px' : 'menu není vidět',
    'hlavička': Math.round(top.getBoundingClientRect().height) + ' px',
    'obsah začíná': filtry ? Math.round(filtry.getBoundingClientRect().bottom) + ' px' : '–',
    'nejmenší cíl': cile.length ? Math.round(Math.min(...cile.map(r => Math.min(r.width, r.height)))) + ' px' : '–',
    'trvale na displeji': dole ? Math.round(nav.getBoundingClientRect().height) + ' px dole' : 'nic',
    'do strany': document.documentElement.scrollWidth > innerWidth ? 'PŘETÉKÁ' : 'ne',
  };
};

/** Záložky detailu: kolik jich je, kolik je mimo obraz a kolik místa lišta bere. */
const MER_ZALOZKY = () => {
  const lista = document.querySelector('dialog#detail .zalozky');
  const zal = [...lista.querySelectorAll('[role="tab"]')].map(b => b.getBoundingClientRect());
  const hranice = innerWidth - 56; // vpravo nahoře stojí zavírací křížek
  return {
    'záložek': zal.length,
    'mimo obraz': zal.filter(r => r.left >= innerWidth - 1).length,
    'uříznutých': zal.filter(r => r.left < innerWidth - 1 && r.right > hranice + 1).length,
    'řádků': new Set(zal.map(r => Math.round(r.top))).size,
    'výška lišty': Math.round(lista.getBoundingClientRect().height) + ' px',
  };
};

/** Krátké popisky záložek zákona — jen pro náhled; v hotové věci by to byly dva <span>y jako u kauz. */
const KRATKE_ZALOZKY = () => {
  const KRATKE = { prospech: 'Prospěch', kontrola: 'Kontrola', chrono: 'Průběh', vyhrady: 'Výhrady', souv: 'Vazby' };
  for (const b of document.querySelectorAll('dialog#detail .zalozky [role="tab"]')) {
    const zavorka = (b.textContent.match(/\(\d+\)/) || [''])[0];
    if (b.dataset.p === 'hlasovani') b.textContent = `Hlasy ${zavorka}`.trim();
    else if (KRATKE[b.dataset.p]) b.textContent = KRATKE[b.dataset.p];
  }
  document.querySelector('dialog#detail .zalozky').dispatchEvent(new Event('scroll'));
  dispatchEvent(new Event('resize'));
};

// ───────────────────────────────────────────────────────────────────────────────────────────────
// STRANKA a DILY — tohle se přepisuje.
//
// Díl: { id, nazev, otazka, doporuceni, cesta | pohledy, priprav?, vyrez?, mer?, varianty: [...] }
//   pohledy … [{ cesta, popis, okno?: { width, height }, orez?: výška, priprav? }] — variantu ukáže
//             na víc obrazovkách pod sebou, aby bylo vidět, jestli drží celý web, ne jednu stránku
//   priprav … funkce ve stránce, která připraví výchozí stav (třeba přepne záložku)
//   vyrez   … selektor prvku, který se vyfotí místo celé obrazovky
// Varianta: { k, nazev, stitek, myslenka, ano: [], ne: [], css?, uprav?, znacky?, mer? }
//   znacky  … [{ sel, typ: 'spatne' | 'dobre' | 'presun', text, kde?: 'pod' }] — kreslí se do snímku;
//             popisek stojí nad prvkem, s kde: 'pod' pod ním (když by nahoře zakryl něco důležitého)
// Položka { skupina, popis } vloží velký nadpis mezi díly.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const STRANKA = {
  klic: 'menu-a-zalozky-zakona',
  nazev: 'Menu a záložky zákona na telefonu',
  podtitul: 'dvě místa, kde řád ovládání ještě neplatí · varianty k výběru · skutečný obsah',
  nadpis: 'Dvě věci, které nejdou jen srovnat. Každé řešení něco stojí.',
  odstavce: [
    'Po zavedení řádu ovládání zbyla dvě místa, kde web porušuje vlastní pravidla — a kde oprava není úklid, ale rozhodnutí. <b>Menu má písmo 12 px</b>, přestože pod 14 px nechodíme; je to nejdůležitější ovládání webu. A <b>záložky v detailu zákona ujíždějí do strany</b>: u kauz jsme to vyřešili krátkými popisky, u zákonů ne, takže stejná součást se chová dvojím způsobem.',
    'Ani jedno se nedá opravit zadarmo. Čtyři položky menu se ve 14 px vedle značky na jeden řádek nevejdou, takže menu buď dostane vlastní řádek, nebo se přestěhuje, nebo se schová. Zákon má až sedm záložek, takže ani krátké popisky se nemusí vejít.',
    '<b>Každá varianta je vyfocená na víc obrazovkách pod sebou</b> — na úvodu, na zákonech a na nejužším displeji, u záložek na zákoně se šesti i s pěti záložkami. Vybírej podle té nejhorší, ne podle té, na které to vyšlo.',
    '<b>Co to není:</b> nic z toho neubírá obsah ani odkazy. Liší se jen tím, kde ovládání stojí, jak je velké a kolik místa bere.',
  ],
};

const UVOD = { cesta: '/', popis: 'Úvod · 390 × 844' };
const ZAKONY = { cesta: '/pravidla/', popis: 'Zákony (aktivní položka je tučná, tedy nejširší) · 390', orez: 300 };
const UZKY = { cesta: '/', popis: 'Úvod na nejužším displeji · 320', okno: { width: 320, height: 568 }, orez: 300 };

const ZAKON_6 = { cesta: '/pravidla/novela-stretu-zajmu-2026/', popis: 'Zákon se šesti záložkami · 390', orez: 460 };
const ZAKON_5 = { cesta: '/pravidla/pgrlf-pojisteni-velke-podniky/', popis: 'Zákon s pěti záložkami · 390', orez: 460 };
const ZAKON_UZKY = { cesta: '/pravidla/novela-stretu-zajmu-2026/', popis: 'Šest záložek na nejužším displeji · 320', okno: { width: 320, height: 568 }, orez: 460 };

const DILY = [
  { skupina: 'Menu', popis: 'Kauzy · Zákony · Metodika · O projektu. Dnes stojí vedle značky na jednom řádku a aby se tam vešly, mají písmo 12 px.' },

  { id: 'menu', nazev: 'Kde a jak velké je menu', otazka: 'Čím zaplatit za čitelné menu?', doporuceni: 'B',
    pohledy: [UVOD, ZAKONY, UZKY], mer: MER_MENU, varianty: [
    { k: 'A', nazev: 'Jeden řádek se značkou', stitek: 'dnešní stav',
      myslenka: 'Značka vlevo, čtyři položky vpravo, všechno na jednom řádku.',
      ano: ['Nejúspornější na výšku', 'Všechny položky jsou vidět hned'],
      ne: ['Písmo menu má 12 px — pod hranicí 14 px, kterou jinde držíme', 'Na nejužším displeji se hlavička už dnes láme na dva řádky (105 px) a písmo má pořád 12 px', 'Není kam přidat pátou položku'],
      znacky: [{ sel: '.top nav', typ: 'spatne', text: 'Písmo 12 px, pod naší hranicí 14 px', kde: 'pod' }] },
    { k: 'B', nazev: 'Dva řádky: značka a pod ní menu', stitek: 'doporučuji',
      myslenka: 'Značka dostane vlastní řádek v plné velikosti, menu se pod ní roztáhne přes celou šířku.',
      ano: ['Písmo 15 px, pohodlně čitelné', 'Na nejužším displeji vyjde stejně vysoká jako dnešní stav (104 proti 105 px) — tam se hlavička láme už teď', 'Značka je zase v plné velikosti a nic se neschovává ani nepřilepuje', 'Stejná hlavička na všech šířkách telefonu'],
      ne: ['Na běžném telefonu je hlavička o 25 px vyšší (79 → 104 px) a o tolik níž začíná obsah', 'Menu odjede s obsahem jako dnes — z konce stránky se k němu musí nahoru'],
      css: `@media (max-width:760px){
        body .top, body .top.top-4 { row-gap: 0; padding-bottom: 0; }
        body .top .hlavicka-znacka { flex: 1 0 100%; }
        body .top .brand, body .top.top-4 .brand { font-size: 18px; padding-block: 6px 2px; }
        body .top .brand::before, body .top.top-4 .brand::before { width: 10px; margin-right: 10px; }
        body .top nav, body .top.top-4 nav { flex: 1 0 100%; display: flex; justify-content: space-between; margin: 0 -6px; }
        body .top nav a, body .top.top-4 nav a, body .top nav a:first-child { font-size: 15px; margin-left: 0; padding-inline: 6px; }
      }`,
      znacky: [{ sel: '.top nav', typ: 'dobre', text: 'Vlastní řádek, písmo 15 px', kde: 'pod' }] },
    { k: 'C', nazev: 'Menu jako lišta dole', stitek: 'u palce',
      myslenka: 'Nahoře zůstane jen značka, čtyři položky drží u spodního okraje displeje, ať je čtenář kdekoli.',
      ano: ['V dosahu palce a vždy po ruce, i na konci dlouhé stránky', 'Písmo 14 px a každá položka má čtvrtinu šířky', 'Obsah začíná jen o 6 px níž než dnes'],
      ne: ['Trvale ubere z displeje 59 px (7 %) — na každé stránce', 'Vypadá jako aplikace; web o kauzách tím mění charakter', 'Detail kauzy už dole lištu má (listování). Nepotkají se, detail lištu menu překryje, ale jsou to dvě různé spodní lišty na jednom webu'],
      css: `@media (max-width:760px){
        body .top nav, body .top.top-4 nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; display: flex; margin: 0;
          padding: 4px 8px calc(4px + env(safe-area-inset-bottom, 0px)); background: var(--plocha); border-top: 1px solid var(--inkoust); }
        body .top nav a, body .top.top-4 nav a, body .top nav a:first-child { flex: 1 1 0; text-align: center; font-size: 14px; margin: 0; padding: 14px 4px; }
        body .top .brand, body .top.top-4 .brand { font-size: 18px; }
        body .top .brand::before, body .top.top-4 .brand::before { width: 10px; margin-right: 10px; }
        body #obsah { padding-bottom: 60px; }
      }`,
      znacky: [{ sel: '.top nav', typ: 'presun', text: 'Menu přesunuté dolů, k palci' }] },
    { k: 'D', nazev: 'Menu pod tlačítkem', stitek: 'schované',
      myslenka: 'Nahoře značka a tlačítko „Menu“; položky se ukážou až po klepnutí.',
      ano: ['Hlavička je nízká a klidná', 'Položek může být kolik chce'],
      ne: ['Čtenář nevidí, co web nabízí, dokud neklepne — o Zákonech a Metodice se nedozví', 'Každý přechod mezi oddíly stojí klepnutí navíc', 'Schované menu se podle výzkumu NN/g používá míň a hůř se v něm hledá', 'Čtyři položky nejsou tolik, aby se musely schovávat'],
      css: `@media (max-width:760px){
        body .top nav, body .top.top-4 nav { display: none; }
        body .top .brand, body .top.top-4 .brand { font-size: 18px; }
        body .top .brand::before, body .top.top-4 .brand::before { width: 10px; margin-right: 10px; }
        .nahled-menu { min-height: 44px; padding: 0 14px; border: 1px solid var(--inkoust); background: var(--plocha); font: 600 14px var(--f-text); color: var(--inkoust); }
      }`,
      uprav: () => { const b = document.createElement('button'); b.className = 'nahled-menu'; b.textContent = 'Menu'; document.querySelector('.top').append(b); },
      znacky: [{ sel: '.nahled-menu', typ: 'spatne', text: 'Čtyři oddíly schované za klepnutím' }] },
  ] },

  { skupina: 'Záložky v detailu zákona', popis: 'Zákon má pět až sedm záložek s dlouhými názvy. U kauz se jich pět vejde díky krátkým popiskům (Proč · Kdy · Vazby · Stav · Zdroje); zákony je dosud nemají.' },

  { id: 'zalozky', nazev: 'Záložky zákona', otazka: 'Jak dostat všechny záložky do obrazu?', doporuceni: 'D',
    pohledy: [ZAKON_6, ZAKON_5, ZAKON_UZKY], mer: MER_ZALOZKY, varianty: [
    { k: 'A', nazev: 'Dlouhé názvy, lišta se posouvá', stitek: 'dnešní stav',
      myslenka: 'Plné názvy v jednom řádku; co se nevejde, je za okrajem a lišta se posouvá prstem.',
      ano: ['Názvy říkají přesně, co v záložce je'],
      ne: ['Ze šesti záložek jsou dvě úplně mimo obraz a třetí uříznutá — mezi nimi Zdroje, to nejdůležitější pro důvěru webu', 'Baymard naměřil, že obsah v posuvných záložkách přehlédne 27 % lidí', 'Kauzy se chovají jinak: tam se všech pět záložek vejde'],
      znacky: [{ sel: '.zalozky [role="tab"]:nth-child(4)', typ: 'spatne', text: 'Uříznuto; další záložky jsou mimo obraz' }] },
    { k: 'B', nazev: 'Krátké popisky, jeden řádek', stitek: 'jako u kauz',
      myslenka: 'Prospěch · Průběh · Hlasy · Výhrady · Vazby · Zdroje. Stejný postup, jaký už mají kauzy.',
      ano: ['Stejné řešení jako u kauz, žádný nový prvek', 'Lišta zůstává 44 px vysoká'],
      ne: ['Nevejde se ani zákon s pěti záložkami: poslední (Zdroje) je uříznutá. Popisky zákona jsou delší než u kauz — Prospěch, Průběh, Výhrady proti Proč, Kdy, Stav', 'U šesti záložek je jedna mimo obraz úplně, na nejužším displeji dvě', '„Prospěch“ a „Hlasy“ jsou chudší než „Komu prospívá“ a „Hlasování“'],
      uprav: KRATKE_ZALOZKY,
      znacky: [{ sel: '.zalozky [role="tab"]:last-child', typ: 'spatne', text: 'Zdroje pořád nejsou celé vidět' }] },
    { k: 'C', nazev: 'Plné názvy, lišta se zalomí', stitek: 'nic se nekrátí',
      myslenka: 'Lišta se neposouvá, záložky se zalomí na další řádky.',
      ano: ['Všechny záložky jsou vidět a s plným názvem', 'Žádné posouvání do strany'],
      ne: ['Vyjdou tři řádky: lišta má 132 px a je přilepená nahoře, takže je bere z displeje trvale', 'Na nejužším displeji čtyři řádky, 176 px — skoro třetina displeje', 'Zalomené záložky nedrží tvar „karet na lince“'],
      css: `@media (max-width:760px){ html body dialog.m2 .zalozky { flex-wrap: wrap; overflow: visible; mask-image: none; -webkit-mask-image: none; row-gap: 0; } }`,
      znacky: [{ sel: '.zalozky', typ: 'presun', text: 'Záložky zalomené na další řádek' }] },
    { k: 'D', nazev: 'Krátké popisky ve dvou řádcích', stitek: 'doporučuji',
      myslenka: 'Krátké popisky jako u kauz, a co se nevejde, zalomí se na druhý řádek, místo aby ujelo.',
      ano: ['Žádná záložka není mimo obraz ani uříznutá — na žádném ze tří displejů', 'Vždy právě dva řádky, 88 px: stejně u pěti i šesti záložek, stejně na nejužším displeji', 'Z variant, kde je vidět všechno, bere nejmíň místa (C má 132 až 176 px)'],
      ne: ['Lišta má 88 px místo 44 a je přilepená nahoře: trvale bere 10 % displeje', 'Dva řádky vyjdou i u zákona s pěti záložkami — do jednoho se vedle zavíracího křížku nevejdou', 'Zákon a kauza se dál liší (dva řádky proti jednomu)', 'Krátké popisky jsou chudší než plné názvy a zalomený řádek není tak čistý jako jedna řada karet'],
      css: `@media (max-width:760px){ html body dialog.m2 .zalozky { flex-wrap: wrap; overflow: visible; mask-image: none; -webkit-mask-image: none; row-gap: 0; } }`,
      uprav: KRATKE_ZALOZKY,
      znacky: [{ sel: '.zalozky', typ: 'dobre', text: 'Všechny záložky v obraze' }] },
  ] },
];

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Dál už se nic nepřepisuje.
// ───────────────────────────────────────────────────────────────────────────────────────────────

/** Značky do snímku: co nefunguje (červeně), co funguje (zeleně), co se přesouvá (fialově).
 *  Vrstva jde dovnitř otevřeného <dialog>: ten prohlížeč kreslí v horní vrstvě nad dokumentem
 *  a překrytí pověšené na <body> by zůstalo pod ním. */
const OZNAC = (znacky) => {
  const BARVY = { spatne: '#DB1F2D', dobre: '#0a7b3e', presun: '#7C3AED' };
  const hostitel = document.querySelector('dialog[open]') ?? document.body;
  const vrstva = document.createElement('div');
  vrstva.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
  hostitel.append(vrstva);
  const okno = document.documentElement.clientWidth, vyska = innerHeight;
  for (const z of znacky) {
    const prvky = [...document.querySelectorAll(z.sel)].filter(e => e.getClientRects().length);
    if (!prvky.length) continue;
    const barva = BARVY[z.typ] ?? BARVY.spatne;
    prvky.slice(0, 1).forEach(e => {
      const r = e.getBoundingClientRect();
      const top = Math.max(2, r.top - 2), bottom = Math.min(vyska - 2, r.bottom + 2);
      if (bottom <= top) return;
      const ram = document.createElement('div');
      ram.style.cssText = `position:fixed;left:${Math.max(2, r.left - 2)}px;top:${top}px;width:${Math.min(okno - 4, r.width + 4)}px;`
        + `height:${bottom - top}px;border:2px solid ${barva};border-radius:3px;`
        + (z.typ === 'presun' ? 'border-style:dashed;' : '') + `background:${barva}1f`;
      vrstva.append(ram);
      const popisek = document.createElement('div');
      popisek.textContent = `${z.typ === 'dobre' ? '✓' : z.typ === 'presun' ? '→' : '✕'} ${z.text}`;
      const nahore = z.kde !== 'pod' && top > 34;
      popisek.style.cssText = `position:fixed;left:${Math.max(4, Math.min(r.left, okno - 290))}px;`
        + `top:${nahore ? top - 29 : Math.min(vyska - 30, bottom + 5)}px;max-width:${okno - 12}px;`
        + `background:${barva};color:#fff;font:700 12.5px/1.25 system-ui,sans-serif;padding:5px 8px;`
        + 'border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 6px #0003';
      vrstva.append(popisek);
    });
  }
};

const esc = s => String(s).replace(/[&<>"]/g, z => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[z]));
const fn = f => (typeof f === 'string' ? `(${f})()` : f);

const spust = (prikaz, env) => new Promise((hotovo, chyba) => {
  const p = spawn(prikaz, { shell: true, stdio: 'ignore', env: { ...process.env, ...env } });
  p.on('exit', k => (k === 0 ? hotovo() : chyba(new Error(prikaz + ' skončil s kódem ' + k))));
});

async function pockejNaServer(pokusu = 40) {
  for (let i = 0; i < pokusu; i++) {
    try { if ((await fetch(ADRESA + '/')).ok) return; } catch { /* ještě nenaběhl */ }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('server nenaběhl');
}

/** Vyfotí variantu na všech pohledech dílu (jedna obrazovka, nebo víc pod sebou). */
async function vyfotVariantu(prohlizec, dil, v) {
  const pohledy = dil.pohledy ?? [{ cesta: dil.cesta, popis: '' }];
  const vysledky = [];
  for (const [i, pohled] of pohledy.entries()) {
    const okno = pohled.okno ?? TELEFON;
    const ctx = await prohlizec.newContext({ ...devices['Pixel 5'], viewport: okno, reducedMotion: 'reduce', deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(ADRESA + pohled.cesta, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const priprav = pohled.priprav ?? dil.priprav;
    if (priprav) await page.evaluate(priprav);
    if (v.css) await page.addStyleTag({ content: v.css });
    if (v.uprav) await page.evaluate(v.uprav);
    await page.waitForTimeout(400);
    const mer = v.mer ?? dil.mer;
    const cisla = mer ? await page.evaluate(fn(mer)) : {};
    if (v.znacky?.length) await page.evaluate(OZNAC, v.znacky);
    const soubor = `dil-${dil.id}-${v.k}${pohledy.length > 1 ? '-' + (i + 1) : ''}.png`;
    const moznosti = { path: path.join(SLOZKA, soubor), animations: 'disabled' };
    if (pohled.orez && !dil.vyrez) moznosti.clip = { x: 0, y: 0, width: okno.width, height: Math.min(okno.height, pohled.orez) };
    const cil = dil.vyrez ? page.locator(dil.vyrez).first() : page;
    await cil.screenshot(moznosti);
    await ctx.close();
    vysledky.push({ soubor, cisla, popis: pohled.popis ?? '', sirka: okno.width });
  }
  return vysledky;
}

let server;
try {
  console.log('stavím web ze skutečného obsahu…');
  rmSync(VYSTUP, { recursive: true, force: true });
  await spust('npx astro build', { NV_VYSTUP: VYSTUP });
  server = spawn(`npx serve ${VYSTUP} -l ${PORT} --no-clipboard`, { shell: true, stdio: 'ignore' });
  await pockejNaServer();

  const prohlizec = await chromium.launch();
  await mkdir(SLOZKA, { recursive: true });
  const atomy = DILY.filter(d => !d.skupina);
  const casti = [];

  for (const d of DILY) {
    if (d.skupina) { casti.push(`<div class="skupina"><h2>${esc(d.skupina)}</h2><p>${esc(d.popis)}</p></div>`); continue; }
    const sloupce = [];
    for (const v of d.varianty) {
      const pohledy = await vyfotVariantu(prohlizec, d, v);
      for (const ph of pohledy) console.log(`  ${d.id}/${v.k} ${v.nazev}${ph.popis ? ' [' + ph.popis + ']' : ''}: ${Object.entries(ph.cisla).map(([k, h]) => `${k} ${h}`).join(' · ')}`);
      const obrazky = pohledy.map(ph => {
        const mereni = Object.entries(ph.cisla).map(([k, h]) => `<tr><th>${esc(k)}</th><td>${esc(h)}</td></tr>`).join('');
        return `<figure class="pohled">
          ${ph.popis ? `<figcaption>${esc(ph.popis)}</figcaption>` : ''}
          <a class="nahled" href="${ph.soubor}" target="_blank" style="max-width:${Math.round(300 * ph.sirka / TELEFON.width)}px"><img src="${ph.soubor}" alt="Varianta ${v.k}: ${esc(v.nazev)}${ph.popis ? ' — ' + esc(ph.popis) : ''}" loading="lazy"></a>
          ${mereni ? `<table class="mereni"><caption>Změřeno</caption>${mereni}</table>` : ''}
        </figure>`;
      }).join('\n');
      sloupce.push(`<div class="sloupec" data-dil="${d.id}" data-v="${v.k}">
        <div class="sl-hlava"><span class="pismeno">${v.k}</span><span class="jmeno">${esc(v.nazev)}<span class="stitek${v.k === d.doporuceni ? ' dop' : ''}">${esc(v.stitek)}</span></span></div>
        <p class="myslenka">${esc(v.myslenka)}</p>
        ${obrazky}
        ${v.ano?.length ? `<div><span class="lab">Proč ano</span><ul>${v.ano.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
        ${v.ne?.length ? `<div><span class="lab">Proč ne</span><ul>${v.ne.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
        <label class="chci"><input type="checkbox" data-dil="${d.id}" data-v="${v.k}"> Tuhle chci</label>
      </div>`);
    }
    casti.push(`<section class="dil" id="d-${d.id}">
      <div class="dil-hlava"><h2>${esc(d.nazev)}</h2><span class="otazka">${esc(d.otazka)}</span><span class="vybrano" data-vybrano="${d.id}"></span></div>
      <div class="sloupce" style="--n:${d.varianty.length}">${sloupce.join('\n')}</div>
      <textarea class="poznamka" data-poznamka="${d.id}" placeholder="Poznámka (nepovinné) — třeba jak dvě varianty spojit"></textarea>
    </section>`);
  }
  await prohlizec.close();

  const data = atomy.map(d => ({ id: d.id, nazev: d.nazev, doporuceni: d.doporuceni, varianty: d.varianty.map(v => ({ k: v.k, nazev: v.nazev })) }));
  await writeFile(path.join(SLOZKA, 'dily.html'), `<!doctype html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Posuďte sami — ${esc(STRANKA.nazev)}, díly k výběru</title>
<style>
:root{--stranka:#f2f0e9;--list:#fffdf8;--list2:#f6f3ea;--linka:#dfd9c9;--linka2:#e8e3d6;--ink:#23261f;--ink2:#63665b;--ink3:#8a8d82;--zl:#d3a017;--nazl:#171a17;--ano:#0a7b3e;--ne:#DB1F2D;
  --stin:0 1px 2px rgb(0 0 0/.06),0 8px 24px -12px rgb(0 0 0/.18);color-scheme:light}
:root[data-vzhled="tmavy"]{--stranka:#0f1110;--list:#1a1e19;--list2:#20251f;--linka:#373d34;--linka2:#262b25;--ink:#e8e7df;--ink2:#8e9189;--ink3:#62655d;--stin:0 12px 32px -16px rgb(0 0 0/.7);color-scheme:dark}
*{box-sizing:border-box} html{background:var(--stranka)}
body{margin:0;font:400 15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}
.obal{max-width:1520px;margin:0 auto;padding:22px 28px 130px}
.vrch{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px}
.vrch h1{margin:0;font-size:30px;font-weight:750;letter-spacing:-.01em}
.vrch h1 span{font-size:16px;font-weight:400;color:var(--ink2);margin-left:10px;letter-spacing:0}
.prep{display:inline-flex;gap:2px;padding:3px;border-radius:999px;border:1px solid var(--linka);background:var(--list);margin-left:auto}
.prep button{border:0;background:none;color:var(--ink2);font:500 13px/1 inherit;padding:7px 13px;border-radius:999px;cursor:pointer}
.prep button[aria-pressed="true"]{background:var(--ink);color:var(--stranka)}
.navod{display:grid;grid-template-columns:1.15fr 1fr;gap:28px;background:var(--list);border:1px solid var(--linka2);border-radius:16px;padding:20px 24px;box-shadow:var(--stin)}
.navod h2{margin:0 0 8px;font-size:27px;line-height:1.08;letter-spacing:-.01em}
.navod p{margin:0 0 8px;font-size:14px} .navod ol{margin:0;padding-left:20px;font-size:14px} .navod li{margin-bottom:6px}
.obsah{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.obsah a{font-size:12.5px;text-decoration:none;color:var(--ink);border:1px solid var(--linka);border-radius:999px;padding:3px 10px;background:var(--list)}
.obsah a.hotovo{background:var(--zl);color:var(--nazl);border-color:transparent}
.znacky-leg{margin-top:10px;font-size:13px;color:var(--ink2)} .znacky-leg b{white-space:nowrap}
.skupina{margin:52px 2px 0;padding-top:20px;border-top:2px solid var(--ink)}
.skupina h2{margin:0;font-size:36px;font-weight:750;line-height:1;letter-spacing:-.015em}
.skupina p{margin:6px 0 0;font-size:14.5px;color:var(--ink2);max-width:70em}
.dil{margin:34px 0 0;scroll-margin-top:16px}
.dil-hlava{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:0 2px 10px}
.dil-hlava h2{margin:0;font-size:26px;font-weight:700;letter-spacing:-.01em}
.otazka{font-size:14px;color:var(--ink2)} .vybrano{margin-left:auto;font-size:13px;color:var(--ink2)} .vybrano b{color:var(--ink)}
.sloupce{display:grid;grid-template-columns:repeat(var(--n,3),minmax(0,1fr));gap:14px}
.sloupec{background:var(--list);border:1px solid var(--linka2);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px;min-width:0}
.sloupec.zvolen{border-color:var(--zl);box-shadow:0 0 0 2px var(--zl)}
.sl-hlava{display:flex;align-items:center;gap:9px}
.pismeno{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--list2);font-weight:750;font-size:15px;flex:none}
.sloupec.zvolen .pismeno{background:var(--zl);color:var(--nazl)}
.jmeno{font-size:14.5px;font-weight:650;line-height:1.2} .stitek{display:block;font-size:11.5px;color:var(--ink2);font-weight:400}
.stitek.dop{color:var(--ano);font-weight:600}
.nahled{display:block;border-radius:10px;overflow:hidden;border:1px solid var(--linka);background:#fff;align-self:center;max-width:300px;width:100%}
.nahled img{display:block;width:100%;height:auto}
.pohled{margin:0;display:flex;flex-direction:column;gap:6px}
.pohled figcaption{font-size:11.5px;font-weight:600;color:var(--ink2);border-top:1px solid var(--linka2);padding-top:8px}
.mereni{width:100%;border-collapse:collapse;font-size:12px}
.mereni caption{text-align:left;font-size:11.5px;color:var(--ink2);padding-bottom:2px}
.mereni th{text-align:left;font-weight:400;color:var(--ink2);padding:3px 6px 3px 0;border-top:1px solid var(--linka2)}
.mereni td{text-align:right;font:600 12px ui-monospace,monospace;padding:3px 0;border-top:1px solid var(--linka2);white-space:nowrap}
.myslenka{margin:0;font-size:13.5px;line-height:1.45}
.lab{font-size:11.5px;color:var(--ink2);display:block}
.sloupec ul{margin:0 0 4px;padding-left:16px;font-size:12.5px;line-height:1.45}
.chci{margin-top:auto;display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:12px;border:1.5px solid var(--linka);cursor:pointer;font-weight:600;font-size:14px;background:var(--list2)}
.chci input{width:18px;height:18px;accent-color:var(--zl);margin:0}
.sloupec.zvolen .chci{border-color:var(--zl);background:color-mix(in srgb,var(--zl) 16%,transparent)}
.poznamka{width:100%;min-height:50px;margin-top:10px;resize:vertical;border-radius:10px;border:1px solid var(--linka);background:var(--list);color:var(--ink);font:inherit;font-size:13px;line-height:1.4;padding:8px 10px}
.lista{position:fixed;left:0;right:0;bottom:0;z-index:20;background:color-mix(in srgb,var(--list) 96%,transparent);border-top:1px solid var(--linka);backdrop-filter:blur(6px)}
.lista-v{max-width:1520px;margin:0 auto;padding:10px 28px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.souhrn{font-size:13px;color:var(--ink2);flex:1;min-width:300px} .souhrn b{color:var(--ink)}
.hlaska{font-size:13px;color:var(--ink2)}
.tl{border-radius:999px;border:1px solid var(--linka);padding:9px 16px;font:600 13.5px/1 inherit;background:var(--list);color:var(--ink);cursor:pointer}
.tl.hl{background:var(--zl);color:var(--nazl);border-color:transparent}
@media (max-width:1000px){.sloupce{grid-template-columns:1fr}.navod{grid-template-columns:1fr}}
</style></head>
<body>
<div class="obal">
  <header class="vrch">
    <h1>${esc(STRANKA.nazev)}<span>${esc(STRANKA.podtitul)} · ${new Date().toLocaleDateString('cs-CZ')}</span></h1>
    <div class="prep" id="vzhled"><button data-v="svetly" aria-pressed="true">Světlé</button><button data-v="tmavy" aria-pressed="false">Tmavé</button></div>
  </header>
  <section class="navod">
    <div>
      <h2>${esc(STRANKA.nadpis)}</h2>
      ${STRANKA.odstavce.map(o => `<p>${o}</p>`).join('\n      ')}
      <p class="znacky-leg">Značky ve snímcích: <b style="color:var(--ne)">✕ co nefunguje</b> · <b style="color:var(--ano)">✓ co funguje</b> · <b style="color:#7C3AED">→ co se kam přesouvá</b>. Klepnutím na snímek se otevře v plné velikosti.</p>
      <nav class="obsah" id="obsah"></nav>
    </div>
    <ol>
      <li>U každého dílu zaškrtni <b>„Tuhle chci“</b>. Můžeš zaškrtnout víc variant a do poznámky napsat, jak je spojit.</li>
      <li>Díl, na kterém ti nezáleží, nech prázdný; vezmu variantu označenou <b>doporučuji</b>.</li>
      <li>Co která varianta stojí, je v <b>„Proč ne“</b>. Čísla pod každým snímkem jsou změřená na té obrazovce, kterou snímek ukazuje.</li>
      <li>Volba se ukládá v prohlížeči. Nakonec dole <b>Zkopírovat volbu</b> a vlož mi ji do chatu, nebo <b>Stáhnout volbu</b>.</li>
    </ol>
  </section>
  <main>
${casti.join('\n')}
  </main>
</div>
<div class="lista"><div class="lista-v">
  <div class="souhrn" id="souhrn"></div>
  <span class="hlaska" id="hlaska"></span>
  <button class="tl" id="kopie">Zkopírovat volbu</button>
  <button class="tl hl" id="stahnout">Stáhnout volbu</button>
</div></div>
<script>
const DILY = ${JSON.stringify(data)};
const KLIC = 'posudtesami.dily.${STRANKA.klic}';
let stav = { volba: {}, poznamka: {} };
try { stav = Object.assign(stav, JSON.parse(localStorage.getItem(KLIC) || '{}')); } catch { /* bez úložiště */ }
const uloz = () => { try { localStorage.setItem(KLIC, JSON.stringify(stav)); } catch { /* bez úložiště */ } };
const volby = id => stav.volba[id] || [];

function vykresli() {
  for (const d of DILY) {
    const v = volby(d.id);
    document.querySelectorAll('.sloupec[data-dil="' + d.id + '"]').forEach(s => {
      const zvolen = v.includes(s.dataset.v);
      s.classList.toggle('zvolen', zvolen);
      s.querySelector('.pismeno').textContent = zvolen ? '✓' : s.dataset.v;
      s.querySelector('input').checked = zvolen;
    });
    document.querySelector('[data-vybrano="' + d.id + '"]').innerHTML = v.length ? 'Vybráno: <b>' + v.join(' + ') + '</b>' : 'Zatím nevybráno · doporučuji ' + d.doporuceni;
  }
  document.getElementById('obsah').innerHTML = DILY.map(d => { const v = volby(d.id); return '<a href="#d-' + d.id + '" class="' + (v.length ? 'hotovo' : '') + '">' + d.nazev + (v.length ? ' · ' + v.join('+') : '') + '</a>'; }).join('');
  const hotove = DILY.filter(d => volby(d.id).length);
  document.getElementById('souhrn').innerHTML = 'Vybráno <b>' + hotove.length + ' z ' + DILY.length + '</b> dílů' + (hotove.length ? ' · ' + hotove.map(d => d.nazev + ' <b>' + volby(d.id).join('+') + '</b>').join(', ') : ' · u každého dílu zaškrtni „Tuhle chci“');
}
function soupis() {
  const radek = d => {
    const v = volby(d.id);
    const jmena = v.map(k => k + ': ' + d.varianty.find(x => x.k === k).nazev).join(' + ');
    return d.nazev + ': ' + (v.length ? jmena : 'nevybráno (vezmi doporučení, ' + d.doporuceni + ')') + (stav.poznamka[d.id] ? '\\n   poznámka: ' + stav.poznamka[d.id].trim() : '');
  };
  return 'Posuďte sami, ${STRANKA.nazev}, volba dílů (' + new Date().toLocaleString('cs-CZ') + ')\\n\\n' + DILY.map(radek).join('\\n') + '\\n';
}
document.querySelectorAll('[data-poznamka]').forEach(t => { t.value = stav.poznamka[t.dataset.poznamka] || ''; });
document.addEventListener('change', e => {
  const z = e.target.closest('input[data-dil]'); if (!z) return;
  const sada = new Set(volby(z.dataset.dil));
  if (z.checked) sada.add(z.dataset.v); else sada.delete(z.dataset.v);
  if (sada.size) stav.volba[z.dataset.dil] = [...sada].sort(); else delete stav.volba[z.dataset.dil];
  uloz(); vykresli();
});
document.addEventListener('input', e => { const t = e.target.closest('[data-poznamka]'); if (!t) return; stav.poznamka[t.dataset.poznamka] = t.value; uloz(); });
document.querySelectorAll('#vzhled button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#vzhled button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  document.documentElement.dataset.vzhled = b.dataset.v;
}));
const hlaska = t => { const h = document.getElementById('hlaska'); h.textContent = t; setTimeout(() => { h.textContent = ''; }, 2800); };
document.getElementById('kopie').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(soupis()); hlaska('Zkopírováno. Vlož mi to do chatu.'); } catch { hlaska('Kopírování nejde, použij Stáhnout.'); }
});
document.getElementById('stahnout').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([soupis()], { type: 'text/plain;charset=utf-8' }));
  a.download = 'posudtesami-${STRANKA.klic}-volba.txt'; a.click();
  hlaska('Uloženo do Stažených. Napiš mi, že je hotovo.');
});
vykresli();
</script>
</body></html>`, 'utf8');
  console.log('\nHotovo: ' + path.join(SLOZKA, 'dily.html'));
} finally {
  server?.kill();
  rmSync(VYSTUP, { recursive: true, force: true });
}
