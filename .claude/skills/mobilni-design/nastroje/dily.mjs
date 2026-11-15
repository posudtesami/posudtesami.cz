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
import { rmSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
/** Na Windows server běží pod cmd (shell: true) a kill() zabije jen cmd — serve by zůstal viset na portu. */
const zastav = p => { if (!p) return; if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); else p.kill(); };
import path from 'node:path';

const VYSTUP = 'dist-mobil-dily';
const PORT = 4463;
const ADRESA = `http://localhost:${PORT}`;
const SLOZKA = path.join(process.cwd(), 'navrhy');
const TELEFON = { width: 390, height: 844 };

// ───────────────────────────────────────────────────────────────────────────────────────────────
// STRANKA a DILY — tohle se přepisuje.
//
// Díl: { id, nazev, otazka, doporuceni, cesta | pohledy, priprav?, vyrez?, mer?, varianty: [...] }
//   pohledy … [{ cesta, popis, okno?: { width, height }, orez?: výška, priprav?, po? }] — variantu ukáže
//             na víc obrazovkách pod sebou, aby bylo vidět, jestli drží celý web, ne jednu stránku
//   priprav … funkce ve stránce, která připraví výchozí stav (třeba přepne záložku)
//   po      … funkce ve stránce, která běží až po nasazení varianty (třeba posune na místo, které se fotí —
//             posunout předem nejde, varianta pak změní výšku toho, co je nad ním)
//   vyrez   … selektor prvku, který se vyfotí místo celé obrazovky
// Varianta: { k, nazev, stitek, myslenka, ano: [], ne: [], css?, uprav?, znacky?, mer? }
//   znacky  … [{ sel, typ: 'spatne' | 'dobre' | 'presun', text, kde?: 'pod' }] — kreslí se do snímku;
//             popisek stojí nad prvkem, s kde: 'pod' pod ním (když by nahoře zakryl něco důležitého)
// Položka { skupina, popis } vloží velký nadpis mezi díly.
// ───────────────────────────────────────────────────────────────────────────────────────────────

/** Hlasy klubů: kolik místa blok bere a jestli jde poznat, jak klub hlasoval, bez čtení čísel. */
const MER_HLASY = () => {
  const blok = document.querySelector('.hl-blok');
  const cipy = [...blok.querySelectorAll('.hl-kluby a')];
  const r = cipy.map(a => a.getBoundingClientRect());
  return {
    'klubů v bloku': cipy.length,
    'řádků čipů': new Set(r.map(x => Math.round(x.top))).size,
    'blok hlasování': Math.round(blok.getBoundingClientRect().height) + ' px',
    'nejmenší cíl': Math.round(Math.min(...r.map(x => x.height))) + ' px',
    'do strany': document.documentElement.scrollWidth > innerWidth ? 'PŘETÉKÁ' : 'ne',
  };
};

/** Záložky: kolik řádků a místa lišta bere a kde je vybraná. */
const MER_ZAL = () => {
  const lista = document.querySelector('dialog#detail .zalozky');
  const zal = [...lista.querySelectorAll('[role="tab"]')].map(b => b.getBoundingClientRect());
  const vybrana = lista.querySelector('[aria-selected="true"]');
  return {
    'záložek': zal.length,
    'řádků': new Set(zal.map(x => Math.round(x.top))).size,
    'výška lišty': Math.round(lista.getBoundingClientRect().height) + ' px',
    'vybraná': vybrana.innerText.trim(),
    'nejmenší cíl': Math.round(Math.min(...zal.map(x => x.height))) + ' px',
  };
};

const NA_HLASY = `(() => { document.querySelector('.zalozky [data-p="hlasovani"]').click(); })()`;
const K_HLASUM = `(() => { const d = document.querySelector('dialog#detail'), b = document.querySelector('.hl-blok');
  if (innerWidth <= 760) d.scrollTop += b.getBoundingClientRect().top - 150; })()`;
const NA_ZDROJE = `(() => { document.querySelector('.zalozky [data-p="zdroje"]').click(); })()`;

/** Pro a proti z čísel na čipu („ANO 0 : 62“). */
const ROZDEL = `const cisla = li => li.querySelector('.hl-cisla').textContent.split(':').map(x => Number(x.trim()));`;

/* B: zelená a červená podle toho, čeho bylo v klubu víc (návrh uživatele). */
const ZELENA_CERVENA = `(() => { ${ROZDEL}
  for (const li of document.querySelectorAll('.hl-kluby li')) { const [p, q] = cisla(li); li.querySelector('a').classList.add(p > q ? 'n-pro' : q > p ? 'n-proti' : 'n-nic'); } })()`;

/* C: kluby rozdělené do řádků podle většiny v klubu; rozlišuje text a pořadí, ne barva. */
const SKUPINY = `(() => { ${ROZDEL}
  for (const ul of document.querySelectorAll('.hl-kluby')) {
    const sk = { pro: [], proti: [], nic: [] };
    for (const li of [...ul.children]) { const [p, q] = cisla(li); sk[p > q ? 'pro' : q > p ? 'proti' : 'nic'].push(li); }
    ul.replaceChildren();
    for (const [k, nazev] of [['pro', 'Většina pro'], ['proti', 'Většina proti'], ['nic', 'Bez většiny']]) {
      if (!sk[k].length) continue;
      const g = document.createElement('li'); g.className = 'n-skup';
      const h = document.createElement('span'); h.className = 'n-skup-nazev'; h.textContent = nazev;
      const vnitrek = document.createElement('ul'); vnitrek.append(...sk[k]);
      g.append(h, vnitrek); ul.append(g);
    }
  } })()`;

/* D: poměr pro : proti jako tenký pruh pod čipem, neutrálně (tmavá = pro, světlá = proti). */
const PRUH = `(() => { ${ROZDEL}
  for (const li of document.querySelectorAll('.hl-kluby li')) { const [p, q] = cisla(li); const a = li.querySelector('a');
    if (p + q === 0) continue; a.classList.add('n-pomer'); a.style.setProperty('--pro', (100 * p / (p + q)).toFixed(1) + '%'); } })()`;

const STRANKA = {
  klic: 'hlasy-a-vybrana-zalozka',
  nazev: 'Hlasy klubů a vybraná záložka',
  podtitul: 'dvě věci z telefonu · varianty k výběru · skutečný obsah',
  nadpis: 'Kdo hlasoval jak, poznat na první pohled. A vybraná záložka, která nevypadá jako chyba.',
  odstavce: [
    '<b>Hlasy:</b> čip „ANO 0 : 62“ říká všechno, ale až po přečtení dvou čísel u každého z devíti klubů. Kdo byl pro a kdo proti, se z bloku na první pohled nepozná.',
    '<b>Pozor na jedno dřívější rozhodnutí.</b> Návrh hlasování ze 14. 11. výslovně říká: <i>„Bez stranických barev a bez zelené pro ‚pro‘ a červené pro ‚proti‘. Hlas pro návrh není hodnocení. Kategorie rozlišuje text, pořadí a neutrální odstíny ze stávající palety.“</i> Zelená a červená (varianta B) jsou tu proto, že jsi je navrhl — ale šly by proti tomu pravidlu. C a D rozlišují bez nich.',
    '<b>Záložky:</b> po zalomení do dvou řádků má každý řádek vlastní linku a vybraná záložka je „karta“, která linku přeruší. Ve dvou řádcích to vypadá jako výřez v plotě, ne jako vybraná záložka.',
    '<b>Nález při měření:</b> čipy klubů mají na telefonu jen <b>26 px</b> na výšku, pod naším minimem 44 px (audit je přehlížel, protože stojí v seznamu, a ten bral jako odkazy ve větě). Zvětšit je potřeba v každé variantě; přidá to bloku asi 18 px na každý řádek čipů. Čísla níž jsou ještě s dnešní výškou.',
    '<b>Co to není:</b> nic se nemaže ani nepřesouvá jinam. Čísla u klubů zůstávají, jen jde poznat, kam patří; záložky zůstávají tytéž, jen se jinak ukazuje, která je vybraná.',
  ],
};

const ZAKON = '/pravidla/novela-stretu-zajmu-2026/';
const H_390 = { cesta: ZAKON, popis: 'Záložka Hlasy u zákona · 390', priprav: NA_HLASY, po: K_HLASUM, orez: 700 };
const H_320 = { cesta: ZAKON, popis: 'Nejužší displej · 320', okno: { width: 320, height: 568 }, priprav: NA_HLASY, po: K_HLASUM };
const H_PC = { cesta: ZAKON, popis: 'Počítač · 1280 × 800 (čipy jsou tytéž)', okno: { width: 1280, height: 800 }, priprav: NA_HLASY };

const Z_ZAKON = { cesta: ZAKON, popis: 'Zákon, vybrané Zdroje ve druhém řádku · 390', priprav: NA_ZDROJE, orez: 460 };
const Z_ZAKON_1 = { cesta: ZAKON, popis: 'Zákon, vybraná záložka v prvním řádku · 390', priprav: NA_HLASY, orez: 460 };
const Z_KAUZA = { cesta: '/kauzy/capi-hnizdo/', popis: 'Kauza, jeden řádek záložek · 390', orez: 420 };
const Z_UZKY = { cesta: ZAKON, popis: 'Nejužší displej · 320', okno: { width: 320, height: 568 }, priprav: NA_ZDROJE, orez: 460 };

const ZALOZKY_CSS = `html body dialog.m2 .zalozky { background-image: none; border-bottom: 1px solid var(--inkoust); }
  html body dialog.m2 .zalozky button, html body dialog.m2 .zalozky button[aria-selected="true"] { border-color: transparent; background: none; margin-bottom: 0; }`;

const DILY = [
  { skupina: 'Hlasy klubů', popis: 'Záložka Hlasy v detailu zákona: u každého hlasování čip za každý klub s počtem hlasů pro : proti.' },

  { id: 'hlasy', nazev: 'Jak poznat, jak klub hlasoval', otazka: 'Čím odlišit pro a proti?', doporuceni: 'C',
    pohledy: [H_390, H_320, H_PC], mer: MER_HLASY, varianty: [
    { k: 'A', nazev: 'Jen čísla', stitek: 'dnešní stav',
      myslenka: 'Všechny čipy vypadají stejně, rozdíl je jen v číslech „pro : proti“.',
      ano: ['Nic nehodnotí, žádná barva', 'Nejúspornější'],
      ne: ['Kdo byl pro a kdo proti, zjistíš až přečtením 18 čísel', 'Rozdělení sněmovny (koalice proti opozici) z bloku na první pohled nevyčteš'] },
    { k: 'B', nazev: 'Zelená a červená podle většiny', stitek: 'tvůj návrh',
      myslenka: 'Čip klubu, který byl většinou pro, je zelený; většinou proti červený; bez většiny šedý.',
      ano: ['Rozlišení je okamžité, i z dálky', 'Barvy pro a proti zná každý z výsledků hlasování'],
      ne: ['Jde proti pravidlu z návrhu hlasování: zelená a červená hodnotí („pro je dobře“), web má jen ukazovat', 'Červeno-zelenou slepotu má asi 8 % mužů — bez čísel by rozdíl neviděli', 'Na stránce, kde nic jiného barevné není, bude hlasování křičet'],
      uprav: ZELENA_CERVENA,
      css: `.hl-kluby a.n-pro { background: #e4f3e9; border-color: #0a7b3e; } .hl-kluby a.n-proti { background: #fbe6e7; border-color: #DB1F2D; }`,
      znacky: [{ sel: '.hl-kluby a.n-proti', typ: 'spatne', text: 'Červená = „proti je špatně“?', kde: 'pod' }] },
    { k: 'C', nazev: 'Řádky „Většina pro / proti“', stitek: 'doporučuji',
      myslenka: 'Kluby se rozdělí do řádků podle toho, čeho měly víc: „Většina pro“, „Většina proti“, „Bez většiny“. Čísla zůstávají na čipech.',
      ano: ['Rozdělení sněmovny je vidět naráz a slovy — kdo s kým hlasoval', 'Přesně podle pravidla hlasování: rozlišuje text a pořadí, ne barva', 'Funguje pro barvoslepé i pro čtečku (skupina má nadpis)', '„Většina“ je přesná i u klubu, který se rozdělil (8 : 3 je pořád většina pro)'],
      ne: ['Blok hlasování je o 105 px vyšší (253 → 358 px), na nejužším displeji o 72 px — každá skupina má vlastní nadpis a začíná novým řádkem čipů. U zákona se čtyřmi hlasováními to je skoro půl obrazovky navíc', 'Pořadí klubů se mění podle hlasování (ANO jednou nahoře, jednou dole)'],
      uprav: SKUPINY,
      css: `.hl-kluby { display: block; }
        .hl-kluby .n-skup { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; margin: 0 0 6px; }
        .hl-kluby .n-skup-nazev { flex: 0 0 100%; font: 600 13px/1.4 var(--f-mono); color: var(--inkoust); }
        .hl-kluby .n-skup ul { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin: 0; padding: 0; }`,
      znacky: [{ sel: '.hl-kluby .n-skup-nazev', typ: 'dobre', text: 'Skupina se jmenuje slovy' }] },
    { k: 'D', nazev: 'Poměr pruhem pod čipem', stitek: 'bez barev',
      myslenka: 'Pod každým čipem tenký pruh: tmavá část je podíl hlasů pro, světlá podíl proti. Pořadí klubů zůstává.',
      ano: ['Poměr je vidět i u rozděleného klubu (8 : 3)', 'Neutrální barvy z palety webu', 'Pořadí klubů se nemění'],
      ne: ['Co je tmavá a co světlá, se musí vysvětlit (legenda „pro : proti“ už nad čipy je)', 'Pruh 4 px na telefonu snadno přehlédneš', 'Další drobná grafika vedle textu — přesně to, co jsme u osy kauz právě rušili'],
      uprav: PRUH,
      css: `.hl-kluby a.n-pomer { background-image: linear-gradient(90deg, var(--inkoust) var(--pro), var(--linka) var(--pro)); background-size: 100% 4px; background-position: left bottom; background-repeat: no-repeat; }`,
      znacky: [{ sel: '.hl-kluby a.n-pomer', typ: 'presun', text: 'Tmavá = pro, světlá = proti', kde: 'pod' }] },
  ] },

  { skupina: 'Vybraná záložka', popis: 'Na telefonu se záložky zákona (a u kauz na nejužším displeji) zalomí do dvou řádků. Vybraná je dnes „karta“ s rámečkem, která přeruší linku pod svým řádkem.' },

  { id: 'zalozka', nazev: 'Jak ukázat vybranou záložku', otazka: 'Jak má vypadat vybraná záložka, když jsou řádky dva?', doporuceni: 'B',
    pohledy: [Z_ZAKON, Z_ZAKON_1, Z_KAUZA, Z_UZKY], mer: MER_ZAL, varianty: [
    { k: 'A', nazev: 'Karta na lince', stitek: 'dnešní stav',
      myslenka: 'Každý řádek má linku, vybraná záložka je karta s rámečkem, která linku přeruší.',
      ano: ['Na počítači (jeden řádek) je to klasická podoba záložek', 'U kauzy v jednom řádku vypadá dobře'],
      ne: ['Ve dvou řádcích jsou dvě linky a karta v jedné z nich vypadá jako výřez', 'Vybraná ve druhém řádku visí pod první linkou, jako by k ní nepatřila'],
      znacky: [{ sel: '.zalozky [aria-selected="true"]', typ: 'spatne', text: 'Výřez v lince', kde: 'pod' }] },
    { k: 'B', nazev: 'Podtržení vybrané', stitek: 'doporučuji',
      myslenka: 'Bez karet a bez linek mezi řádky. Vybraná záložka je tmavá s tlustou čarou pod sebou, pod celou lištou jedna linka.',
      ano: ['Funguje stejně v jednom i ve dvou řádcích — nic se nepřerušuje', 'Obvyklá podoba záložek na telefonu (Material, iOS)', 'Méně čar: jedna linka pod lištou místo jedné pod každým řádkem'],
      ne: ['Na telefonu jiná podoba záložek než na počítači (tam zůstanou karty)', 'Nevybrané záložky ztratí tvar — jsou to jen slova'],
      css: `@media (max-width:760px){ ${ZALOZKY_CSS}
        html body dialog.m2 .zalozky button[aria-selected="true"] { box-shadow: inset 0 -3px 0 var(--inkoust); } }`,
      znacky: [{ sel: '.zalozky [aria-selected="true"]', typ: 'dobre', text: 'Vybraná podtržená', kde: 'pod' }] },
    { k: 'C', nazev: 'Plná vybraná', stitek: 'nejvýraznější',
      myslenka: 'Vybraná záložka je tmavý obdélník s bílým písmem, ostatní jen slova. Pod lištou jedna linka.',
      ano: ['Vybraná je vidět okamžitě, i ve druhém řádku', 'Žádné výřezy ani linky mezi řádky'],
      ne: ['Vypadá jako vybraný čip filtru — řád ovládání říká, že záložka není volba, ale nadpis oddílu', 'Tmavý blok přetáhne pozornost z obsahu na ovládání'],
      css: `@media (max-width:760px){ ${ZALOZKY_CSS}
        html body dialog.m2 .zalozky button[aria-selected="true"] { background: var(--inkoust); color: var(--plocha); } }`,
      znacky: [{ sel: '.zalozky [aria-selected="true"]', typ: 'presun', text: 'Vybraná jako plný blok', kde: 'pod' }] },
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
    const po = pohled.po ?? dil.po;
    if (po) await page.evaluate(po);
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
  zastav(server);
  rmSync(VYSTUP, { recursive: true, force: true });
}
