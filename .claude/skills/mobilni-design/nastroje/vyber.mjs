/* Výběr návrhů: pro každý návrh vyfotí stav PŘED a PO vedle sebe a vyrobí stránku se zaškrtávátky,
 * na které si uživatel vybere, co se bude stavět.
 *
 *   node .claude/skills/mobilni-design/nastroje/vyber.mjs
 *
 * Výsledek: navrhy/vyber.html. Zaškrtnutí se pamatuje v prohlížeči a dole je soupis k zkopírování.
 * Web si skript postaví sám ze skutečného obsahu, spustí server a uklidí po sobě. Nic nemění. */
import { chromium, devices } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const VYSTUP = 'dist-mobil-vyber';
const PORT = 4458;
const ADRESA = `http://localhost:${PORT}`;
const SLOZKA = path.join(process.cwd(), 'navrhy');
const TELEFON = { width: 390, height: 844 };

// ───────────────────────────────────────────────────────────────────────────────────────────────
// NÁVRHY. U každého: kde se to ukáže, co se změní (css / uprav) a čím se to dá změřit (mer).
// `vyrez` = selektor prvku, který se vyfotí místo celé obrazovky (když je změna místní).
// ───────────────────────────────────────────────────────────────────────────────────────────────

/** Obtáhne ovládací prvky: červeně ty pod 44 px, zeleně ty, které už jsou dost velké. */
const OBTAHNI = () => {
  const vTextu = e => !!e.closest('p, li, sup, small, figcaption, .lead, .met-hlava, .legenda, .paticka-met, .s-vazba');
  for (const e of document.querySelectorAll('a[href], button, [role="button"], input, select, summary')) {
    if (!e.getClientRects().length || e.closest('[hidden]') || e.disabled || vTextu(e)) continue;
    let r = e.getBoundingClientRect();
    if (e instanceof HTMLInputElement && (e.type === 'checkbox' || e.type === 'radio')) {
      const s = e.closest('label'); if (s) r = s.getBoundingClientRect();
    }
    if (r.width < 2 || r.height < 2) continue;
    const male = r.width < 44 || r.height < 44;
    e.style.outline = `2px solid ${male ? '#DB1F2D' : '#0a7b3e'}`;
    e.style.outlineOffset = '-1px';
  }
};

const CILE_44 = `@media (max-width:760px){
  /* menu: na výšku výplň, na šířku taky — „Kauzy“ mělo 37 px. Odsazení mezi odkazy se o to zmenší,
     aby se řádek pořád vešel na 390 px. */
  body .top nav a, body .top .brand { padding-block: 15px; padding-inline: 5px; }
  body .top nav a, body .top nav a:first-child { margin-left: 2px; }
  body .filtry.f4 .f-hledat input { min-height: 44px; }
  body .pohled button, body .pr-pohled button { min-height:44px; padding-inline:14px; }
  body .filtry.f4 .f-prepinac { min-height:44px; }
  body .filtry .f-cipy button, body .filtry .f-cipy .f-vice { min-height:44px; }
  body .f-dalsi select { min-height:44px; }
  body .zalozky button { min-height:44px; }
  body .hl-cipy a { min-height:44px; display:inline-flex; align-items:center; }
  body .strankovani button { min-width:44px; height:44px; }
  body .perex-vice, body .castky-vice, body .f-upresnit, body .hl-vice,
  body .v4-karta button, body .v4-karta a { min-height:44px; display:inline-flex; align-items:center; }
}`;

/** Obal nad obsahem detailu a rozpad hlavičky. */
const MER_DETAIL = () => {
  const v = n => { const e = document.querySelector(n); return e && e.getClientRects().length ? Math.round(e.getBoundingClientRect().height) : 0; };
  const dlg = document.querySelector('dialog#detail');
  const panel = document.querySelector('.m2-panel[data-p]:not([hidden])');
  return {
    'obal nad obsahem': panel && dlg ? Math.round(panel.getBoundingClientRect().top - dlg.getBoundingClientRect().top) : 0,
    'z toho hlavička': v('.m2-hlava'), 'řádek částek': v('.castky'), 'odkaz pod částkami': v('.castky-vice'),
  };
};

/** Ovladatelnost mini-osy: kolik bodů leží na sobě a jak daleko od sebe jsou. */
const MER_OSA = () => {
  const body = [...document.querySelectorAll('.mini-osa .bod')];
  const r = body.map(b => b.getBoundingClientRect());
  let nejmensi = 999, prekryv = 0;
  for (let i = 1; i < r.length; i++) {
    nejmensi = Math.min(nejmensi, r[i].left - r[i - 1].left);
    if (r[i].left < r[i - 1].right - 1) prekryv++;
  }
  return {
    'bodů se překrývá': prekryv, 'událostí celkem': body.length,
    'nejmenší rozestup': (nejmensi === 999 ? 0 : Math.round(nejmensi)) + ' px',
    'cíl bodu': Math.round(r[0]?.width ?? 0) + ' px',
  };
};

const NA_CHRONOLOGII = () => { document.querySelector('.zalozky [data-p="chrono"]')?.click(); };

/** Nakreslí do stránky značky jako v designérském nástroji: co nefunguje, co je dobré a co se kam
 *  přesouvá. Běží ve stránce těsně před vyfocením. Značka = { sel, typ, text, kam }:
 *    typ 'spatne' červeně · 'dobre' zeleně · 'presun' fialově (kam = kam to má jít)
 *  Když selektor sedí na víc prvků, obtáhnou se všechny, popisek dostane jen první. */
const OZNAC = (znacky) => {
  const BARVY = { spatne: '#DB1F2D', dobre: '#0a7b3e', presun: '#7C3AED' };
  // Detail kauzy je modální <dialog>, který prohlížeč kreslí v horní vrstvě nad celým dokumentem —
  // překrytí pověšené na <body> by zůstalo pod ním. Proto jde vrstva dovnitř dialogu, když je otevřený.
  // Souřadnice se počítají position: fixed, tedy vůči oknu, což je přesně to, co snímek zachytí.
  const hostitel = document.querySelector('dialog[open]') ?? document.body;
  const vrstva = document.createElement('div');
  vrstva.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
  hostitel.append(vrstva);
  const okno = document.documentElement.clientWidth;

  for (const z of znacky) {
    const prvky = [...document.querySelectorAll(z.sel)].filter(e => e.getClientRects().length);
    if (!prvky.length) continue;
    const barva = BARVY[z.typ] ?? BARVY.spatne;
    prvky.forEach((e, i) => {
      const r = e.getBoundingClientRect();
      const ram = document.createElement('div');
      ram.style.cssText = `position:fixed;left:${r.left - 2}px;top:${r.top - 2}px;`
        + `width:${r.width + 4}px;height:${r.height + 4}px;border:2px solid ${barva};border-radius:3px;`
        + (z.typ === 'presun' ? 'border-style:dashed;' : '') + `background:${barva}1f`;
      vrstva.append(ram);
      if (i > 0) return;
      const popisek = document.createElement('div');
      const znak = z.typ === 'dobre' ? '✓' : z.typ === 'presun' ? '→' : '✕';
      popisek.textContent = `${znak} ${z.text}`;
      const nahore = r.top > 34;
      popisek.style.cssText = `position:fixed;left:${Math.max(4, Math.min(r.left, okno - 280))}px;`
        + `top:${nahore ? r.top - 30 : r.bottom + 6}px;max-width:${okno - 16}px;`
        + `background:${barva};color:#fff;font:700 13px/1.25 system-ui,sans-serif;padding:5px 9px;`
        + 'border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 6px #0003';
      vrstva.append(popisek);
    });
  }
};

const NAVRHY = [
  { id: 1, nazev: 'Osa se posouvá do strany, každá událost 44 px',
    proc: 'Tohle je největší nález z auditu. V chronologii Čapího hnízda leží 24 z 30 bodů na sobě — konkrétní událost se prstem trefit nedá. Rozprostřít je po displeji nestačí: 30 událostí na 390 px dá 12 px na každou, tedy hůř než dnes. Jediné řešení, které dá opravdový terč, je nechat osu posouvat do strany a dát každé události 44 px. Cena: na displeji není vidět celý rozsah naráz, osa se musí posunout.',
    cesta: '/kauzy/capi-hnizdo/', predPopisek: 'Dnes: body se slévají do šmouhy', poPopisek: 'Po úpravě: terč 44 px, osa se posouvá',
    pred: { uprav: NA_CHRONOLOGII, znacky: [
      { sel: '.mini-osa', typ: 'spatne', text: '24 z 30 bodů leží na sobě, rozestup 0 px' },
      { sel: '.listovani', typ: 'dobre', text: 'Listování funguje — dnes jediná cesta k události' },
    ] },
    po: { uprav: () => {
      document.querySelector('.zalozky [data-p="chrono"]')?.click();
      const osa = document.querySelector('.mini-osa');
      const body = [...osa.querySelectorAll('.bod')];
      const sirka = Math.max(body.length * 44, 340);
      const obal = document.createElement('div');
      obal.style.cssText = `position:relative;height:100%;width:${sirka}px`;
      while (osa.firstChild) obal.append(osa.firstChild);
      osa.append(obal);
      osa.style.overflowX = 'auto';
      // široká osa sama nestačí: události ze stejného data by na sobě ležely dál, proto i rozestup
      // podle pořadí. Teprve obojí dohromady dá terč 44 px, který se nepřekrývá se sousedem.
      body.forEach((b, i) => {
        b.style.left = (22 + i * 44) / sirka * 100 + '%';
        b.style.setProperty('--sirka', '44px');
      });
    }, znacky: [{ sel: '.mini-osa', typ: 'dobre', text: 'Každá událost má terč 44 px' }] },
    mer: MER_OSA },

  { id: 2, nazev: 'Osa jen jako ukazatel, listuje se šipkami',
    proc: 'Druhá možnost místo návrhu 1 — vyber si jednu, ne obě. Osa zůstane v měřítku času, ale přestane být terčem. Událostmi se listuje tlačítky „předchozí / další“, která jsou pod ní už dnes; vybraná událost je na ose zvýrazněná.',
    cesta: '/kauzy/capi-hnizdo/', predPopisek: 'Dnes: 30 terčů přes sebe', poPopisek: 'Po úpravě: ukazatel a větší listování',
    pred: { uprav: NA_CHRONOLOGII, znacky: [
      { sel: '.mini-osa', typ: 'spatne', text: '30 terčů přes sebe — klepnutí je loterie' },
    ] },
    po: { css: '@media (max-width:760px){ body .mini-osa .bod { pointer-events: none; } body .mini-osa .bod[aria-current="true"]::before { width: 16px; height: 16px; margin: -8px 0 0 -8px; } body .listovani button { min-height: 52px; } }',
          uprav: NA_CHRONOLOGII, znacky: [
      { sel: '.mini-osa', typ: 'dobre', text: 'Osa zůstává v měřítku času, už není terč' },
      { sel: '.listovani', typ: 'presun', text: 'Ovládání se přesouvá sem, tlačítka 52 px' },
    ] },
    mer: () => {
      const l = document.querySelector('.listovani');
      const b = document.querySelector('.mini-osa .bod');
      return { 'listovací tlačítka': l ? Math.round(l.getBoundingClientRect().height) + ' px' : 'nejsou',
               'body jsou terčem': b && getComputedStyle(b).pointerEvents !== 'none' ? 'ano' : 'ne',
               'událostí celkem': document.querySelectorAll('.mini-osa .bod').length };
    } },

  { id: 3, nazev: 'Odkaz k částkám na řádek s částkami',
    proc: 'Hlavička nejhoršího detailu má 344 px a z toho 88 zaberou dva rozbalovací odkazy, každý na vlastním řádku — důsledek dotykových cílů 44 px. „K čemu částky jsou“ se vejde na řádek s částkami samotnými.',
    cesta: '/kauzy/agrofert-1700-ha/', predPopisek: 'Dnes: odkaz na vlastním řádku', poPopisek: 'Po úpravě: na řádku s částkami',
    pred: { znacky: [
      { sel: '.m2-hlava > .castky-vice', typ: 'presun', text: 'Tenhle odkaz patří na řádek s částkami' },
      { sel: '.castky', typ: 'dobre', text: 'Tady je vpravo volné místo' },
      { sel: '.perex-vice', typ: 'spatne', text: 'Druhý odkaz, taky vlastní řádek — 44 px' },
    ] },
    po: { css: '@media (max-width:760px){ html.js body .m2-hlava > .castky-vice { display: none; } }',
          uprav: () => { const u = document.querySelector('.castky'), b = document.querySelector('.castky-vice');
            if (u && b) { const li = document.createElement('li'); li.append(b.cloneNode(true)); u.append(li); } },
          znacky: [{ sel: '.castky', typ: 'dobre', text: 'Odkaz na řádku s částkami, o 44 px výš' }] },
    mer: MER_DETAIL },

  { id: 4, nazev: 'Vyhledávací pole na 16 px',
    proc: 'Safari na iPhonu při klepnutí do pole menšího než 16 px přiblíží celou stránku a už ji nevrátí zpět — čtenář pak scrolluje po zvětšeném webu a rozvržení, které jsme ladili, nevidí. Týká se 39 ze 45 stránek. Vlevo je simulace toho, co se stane po klepnutí.',
    cesta: '/', predPopisek: 'Dnes: po klepnutí do pole', poPopisek: 'S 16 px: po klepnutí se nestane nic',
    pred: { css: 'html { zoom: 1.45; }', znacky: [
      { sel: '.f-hledat input', typ: 'spatne', text: '15 px → iPhone přiblíží a nevrátí zpět' },
    ] },
    po: { css: '@media (max-width:760px){ body .filtry.f4 .f-hledat input { font-size: 16px; } }',
          znacky: [{ sel: '.f-hledat input', typ: 'dobre', text: '16 px → stránka zůstane, jak je' }] },
    // Jen písmo pole: výšku řádku filtrů tu měřit nejde, levý snímek je schválně přiblížený.
    mer: () => ({ 'písmo pole': Math.round(parseFloat(getComputedStyle(document.querySelector('.f-hledat input')).fontSize)) + ' px' }) },

  { id: 5, nazev: 'Kroky průběhu u pravidel čitelněji',
    proc: 'Pět kroků (Podáno, Sněmovna, Senát, Podpis, Vyhlášeno) se mačká do pěti sloupců po 62 px a písmo kleslo na 11 px. Na dva řádky se vejdou v normální velikosti.',
    cesta: '/pravidla/', vyrez: '.pravidla-obal', predPopisek: 'Dnes: pět sloupců, 11 px', poPopisek: 'Po úpravě: zalomené, 13 px',
    pred: { znacky: [{ sel: '.prubeh', typ: 'spatne', text: '5 sloupců po 62 px, písmo 11 px' }] },
    po: { css: '@media (max-width:760px){ body .prubeh { display: flex; flex-wrap: wrap; gap: 4px 10px; } body .prubeh li { flex: 1 1 30%; font-size: 13px; } }',
          znacky: [{ sel: '.prubeh', typ: 'dobre', text: 'Zalomené do dvou řádků, písmo 13 px' }] },
    mer: () => {
      const pr = document.querySelector('.prubeh');
      const li = pr?.querySelector('li');
      return { 'výška průběhu': pr ? Math.round(pr.getBoundingClientRect().height) + ' px' : '—',
               'písmo kroku': li ? Math.round(parseFloat(getComputedStyle(li).fontSize)) + ' px' : '—',
               'šířka kroku': li ? Math.round(li.getBoundingClientRect().width) + ' px' : '—' };
    } },
];

// ───────────────────────────────────────────────────────────────────────────────────────────────

const esc = s => String(s).replace(/[&<>"]/g, z => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[z]));

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

async function vyfot(prohlizec, navrh, stav, soubor) {
  const viewport = navrh.viewport ?? TELEFON;
  const ctx = await prohlizec.newContext({ ...devices['Pixel 5'], viewport, reducedMotion: 'reduce',
    isMobile: viewport.width <= 760, hasTouch: viewport.width <= 760, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(ADRESA + navrh.cesta, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  if (stav.css) await page.addStyleTag({ content: stav.css });
  if (stav.uprav) await page.evaluate(stav.uprav);
  await page.waitForTimeout(350);
  const cisla = navrh.mer ? await page.evaluate(navrh.mer) : {};
  // značky se kreslí až po měření, ať do něj nezasahují
  if (stav.znacky?.length) await page.evaluate(OZNAC, stav.znacky);
  const cil = navrh.vyrez ? page.locator(navrh.vyrez).first() : page;
  await cil.screenshot({ path: path.join(SLOZKA, soubor), animations: 'disabled' });
  await ctx.close();
  return { cisla, sirka: viewport.width };
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
  const karty = [];

  for (const n of NAVRHY) {
    const a = await vyfot(prohlizec, n, n.pred, `navrh-${n.id}-pred.png`);
    const b = await vyfot(prohlizec, n, n.po, `navrh-${n.id}-po.png`);
    const cisla = Object.keys(a.cisla).map(k => `<tr><th>${esc(k)}</th><td class="pred">${esc(a.cisla[k])}</td><td class="po">${esc(b.cisla[k])}</td></tr>`).join('');
    // První změřená hodnota je ta hlavní: kolik návrh ušetří, patří hned k názvu.
    const cislo = v => typeof v === 'number' ? v : (typeof v === 'string' && /^-?\d+/.test(v) ? parseInt(v, 10) : null);
    const prvni = Object.keys(a.cisla)[0];
    const pa = cislo(a.cisla[prvni]), pb = cislo(b.cisla[prvni]);
    const rozdil = pa !== null && pb !== null ? pa - pb : 0;
    const jednotka = typeof a.cisla[prvni] === 'string' && a.cisla[prvni].includes('px') ? ' px' : '';
    const znacka = rozdil > 0 ? `<span class="usetri">−${rozdil}${jednotka}</span>`
      : rozdil < 0 ? `<span class="pridava">+${-rozdil}${jednotka}</span>` : '<span class="nic">beze změny</span>';
    karty.push(`<section class="navrh">
  <label class="hlava"><input type="checkbox" data-navrh="${n.id}"><span class="cislo">${n.id}</span><span class="nazev">${esc(n.nazev)}</span>${znacka}</label>
  <p class="proc">${esc(n.proc)}</p>
  <div class="dvojice">
    <figure><img src="navrh-${n.id}-pred.png" alt="před" style="max-width:${a.sirka}px"><figcaption><b class="pred">PŘED</b> ${esc(n.predPopisek)}</figcaption></figure>
    <figure><img src="navrh-${n.id}-po.png" alt="po" style="max-width:${b.sirka}px"><figcaption><b class="po">PO</b> ${esc(n.poPopisek)}</figcaption></figure>
  </div>
  ${cisla ? `<table class="cisla"><thead><tr><th></th><th class="pred">před</th><th class="po">po</th></tr></thead><tbody>${cisla}</tbody></table>` : ''}
</section>`);
    console.log(`návrh ${n.id} — ${n.nazev}: hotovo`);
  }

  await prohlizec.close();
  await writeFile(path.join(SLOZKA, 'vyber.html'), `<!doctype html><html lang="cs"><meta charset="utf-8">
<title>Návrhy k výběru — mobilní zobrazení</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 :root{color-scheme:light dark;--pred:#DB1F2D;--po:#0a7b3e}
 *{box-sizing:border-box}
 body{margin:0;padding:24px 24px 140px;font:16px/1.55 system-ui,sans-serif;background:#f5f5f8;color:#16153a}
 h1{font-size:24px;margin:0 0 6px} .uvod{color:#5b5a7a;max-width:62em;margin:0 0 28px}
 .navrh{background:#fff;border:1px solid #d3d3e2;border-radius:10px;padding:18px 20px;margin:0 0 20px}
 .navrh:has(input:checked){border-color:var(--po);box-shadow:0 0 0 2px rgba(10,123,62,.15)}
 .hlava{display:flex;align-items:center;gap:12px;cursor:pointer;user-select:none}
 .hlava input{width:24px;height:24px;accent-color:var(--po);flex:none;cursor:pointer}
 .cislo{font:700 13px ui-monospace,monospace;background:#16153a;color:#fff;border-radius:50%;width:26px;height:26px;display:grid;place-items:center;flex:none}
 .nazev{font-size:18px;font-weight:700}
 .usetri,.pridava,.nic{margin-left:auto;font:700 14px ui-monospace,monospace;padding:4px 10px;border-radius:999px;flex:none}
 .usetri{background:#e3f4ea;color:var(--po)} .pridava{background:#fdeaec;color:var(--pred)} .nic{background:#ececf3;color:#5b5a7a}
 .proc{color:#3a3960;margin:10px 0 16px;max-width:62em}
 .dvojice{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}
 figure{margin:0;flex:0 1 auto} img{display:block;width:100%;height:auto;border:1px solid #d3d3e2;border-radius:6px}
 figcaption{font-size:13px;color:#5b5a7a;padding:6px 2px 0;max-width:420px}
 b.pred{color:var(--pred)} b.po{color:var(--po)}
 th.pred,td.pred{color:var(--pred)} th.po,td.po{color:var(--po);font-weight:700}
 .cisla{border-collapse:collapse;margin:16px 0 0;font-size:14px}
 .cisla th,.cisla td{text-align:left;padding:4px 18px 4px 0;border-bottom:1px solid #ececf3;font-family:ui-monospace,monospace}
 .cisla thead th{font-size:12px;text-transform:uppercase;letter-spacing:.06em}
 .lista{position:fixed;left:0;right:0;bottom:0;background:#16153a;color:#fff;padding:14px 24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
 .lista output{font:700 16px ui-monospace,monospace;flex:1;min-width:200px}
 .lista button{font:600 15px system-ui;padding:10px 18px;min-height:44px;border:0;border-radius:6px;background:#fff;color:#16153a;cursor:pointer}
 .lista button:hover{background:#e7e7f2}
</style>
<h1>Návrhy k výběru</h1>
<p class="uvod">Zaškrtni, co ti dává smysl. Vlevo je stav dnes, vpravo po úpravě — snímky jsou ze skutečného
obsahu, ne z kreseb. Značky ve snímcích:
<b style="color:#DB1F2D">✕ co nefunguje</b> · <b style="color:#0a7b3e">✓ co funguje a zůstává</b> ·
<b style="color:#7C3AED">→ co se kam přesouvá</b>.
Dole se průběžně skládá soupis, který stačí zkopírovat a poslat mi.
Vytvořeno ${new Date().toLocaleString('cs-CZ')}.</p>
${karty.join('\n')}
<div class="lista">
  <output id="soupis">Zatím nic nevybráno</output>
  <button type="button" id="kopirovat">Zkopírovat výběr</button>
</div>
<script>
 const nazvy = ${JSON.stringify(Object.fromEntries(NAVRHY.map(n => [n.id, n.nazev])))};
 const boxy = [...document.querySelectorAll('input[data-navrh]')];
 const soupis = document.getElementById('soupis');
 const ulozene = JSON.parse(localStorage.getItem('nv-vyber') || '[]');
 const prepocti = () => {
   const vybrane = boxy.filter(b => b.checked).map(b => b.dataset.navrh);
   localStorage.setItem('nv-vyber', JSON.stringify(vybrane));
   soupis.textContent = vybrane.length
     ? 'Vybráno: ' + vybrane.map(i => i + ' (' + nazvy[i] + ')').join(' · ')
     : 'Zatím nic nevybráno';
 };
 boxy.forEach(b => { b.checked = ulozene.includes(b.dataset.navrh); b.addEventListener('change', prepocti); });
 document.getElementById('kopirovat').addEventListener('click', async e => {
   await navigator.clipboard.writeText(soupis.textContent);
   e.target.textContent = 'Zkopírováno ✓';
   setTimeout(() => { e.target.textContent = 'Zkopírovat výběr'; }, 1500);
 });
 prepocti();
</script>
</html>`, 'utf8');
  console.log('\nHotovo: ' + path.join(SLOZKA, 'vyber.html'));
} finally {
  server?.kill();
  rmSync(VYSTUP, { recursive: true, force: true });
}
