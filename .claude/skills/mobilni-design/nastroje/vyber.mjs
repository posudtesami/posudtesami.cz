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

const NAVRHY = [
  {
    id: 1,
    nazev: 'Vyhledávací pole na 16 px',
    proc: 'Safari na iPhonu při klepnutí do pole pod 16 px přiblíží celou stránku — a nevrátí ji zpět. Rozdíl ve velikosti písma je skoro neznatelný, rozdíl v chování zásadní.',
    cesta: '/',
    predPopisek: 'Dnes: po klepnutí do pole (simulace přiblížení Safari)',
    poPopisek: 'S 16 px: po klepnutí se nestane nic',
    pred: { css: `html { zoom: 1.45; }` },
    po: { css: `body .filtry.f4 .f-hledat input { font-size: 16px; }` },
    mer: () => ({ 'písmo pole': Math.round(parseFloat(getComputedStyle(document.querySelector('.f-hledat input')).fontSize)) + ' px' }),
  },
  {
    id: 2,
    nazev: 'Dotykové cíle na 44 px',
    proc: 'Dnes splňujeme povinných 24 px (WCAG 2.5.8). Pohodlné je 44 px — shodně Apple i Google. Červeně obtažené prvky jsou pod hranicí, zeleně nad ní. Cena: hlavička a řádek filtrů povyrostou.',
    cesta: '/',
    predPopisek: 'Dnes: červené jsou pod 44 px',
    poPopisek: 'Po úpravě: všechno zelené',
    pred: { uprav: OBTAHNI },
    po: { css: CILE_44, uprav: OBTAHNI },
    mer: () => {
      const vTextu = e => !!e.closest('p, li, sup, small, figcaption, .lead, .met-hlava, .legenda, .paticka-met, .s-vazba');
      let pod = 0;
      for (const e of document.querySelectorAll('a[href], button, [role="button"], input, select, summary')) {
        if (!e.getClientRects().length || e.closest('[hidden]') || e.disabled || vTextu(e)) continue;
        let r = e.getBoundingClientRect();
        if (e instanceof HTMLInputElement && (e.type === 'checkbox' || e.type === 'radio')) { const s = e.closest('label'); if (s) r = s.getBoundingClientRect(); }
        if (r.width < 2 || r.height < 2) continue;
        if (r.width < 44 || r.height < 44) pod++;
      }
      const f = document.querySelector('.filtry');
      return { 'cílů pod 44 px': pod, 'výška hlavičky': Math.round(document.querySelector('.top').getBoundingClientRect().height) + ' px',
               'výška filtrů': f ? Math.round(f.getBoundingClientRect().height) + ' px' : '—' };
    },
  },
  {
    id: 3,
    nazev: 'Strop na dvě částky v hlavičce',
    proc: 'Kauza se čtyřmi částkami má hlavičku 385 px, ostatní 252–294. Zůstanou dvě, zbytek otevře stejné tlačítko jako popisy. Pozor: ubere to jeden řádek, ne celý rozdíl — čtyři částky se dnes lámou do dvou řádků, ne do čtyř.',
    cesta: '/kauzy/vymahani-zemedelskych-dotaci/',
    predPopisek: 'Dnes: čtyři částky na tři řádky',
    poPopisek: 'Po úpravě: dvě a zbytek pod tlačítkem',
    pred: {},
    po: {
      css: `@media (max-width:760px){ html.js body .m2-hlava:not(.castky-rozbalene) .castky li:nth-of-type(n+3):not(.castky-metodika){ display:none; } }`,
      uprav: () => { const b = document.querySelector('.castky-vice'); if (b) b.textContent = 'další 2 částky a k čemu jsou'; },
    },
    mer: () => {
      const dlg = document.querySelector('dialog#detail');
      const panel = document.querySelector('.m2-panel[data-p]:not([hidden])');
      return { 'obal nad obsahem': Math.round(panel.getBoundingClientRect().top - dlg.getBoundingClientRect().top) + ' px',
               'hlavička': Math.round(document.querySelector('.m2-hlava').getBoundingClientRect().height) + ' px' };
    },
  },
  {
    id: 4,
    nazev: 'U hlasování přepíná rovnou nadpis',
    proc: '„Ukázat jména“ se opakuje pětkrát pod sebou. Když přepíná rovnou nadpis skupiny, ubude pět řádků a cíl bude větší, ne menší.',
    cesta: '/hlasovani/psp-10-34-311/',
    vyrez: '.hl-vsichni',
    predPopisek: 'Dnes: nadpis a pod ním odkaz',
    poPopisek: 'Po úpravě: přepíná nadpis',
    pred: {},
    po: {
      css: `@media (max-width:760px){
        body .hl-vice { display:none; }
        body .hl-skupina h3 { cursor:pointer; display:flex; justify-content:space-between; align-items:center; min-height:44px; margin:0; border-bottom:1px solid var(--linka); }
        body .hl-skupina h3::after { content:"rozbalit ▾"; font:italic 13px var(--f-text); color:var(--modra); }
      }`,
    },
    mer: () => ({ 'výška seznamu': Math.round(document.querySelector('.hl-vsichni').getBoundingClientRect().height) + ' px' }),
  },
  {
    id: 5,
    nazev: 'Nízké okno počítače: modal se posouvá dolů',
    proc: 'Na okně vysokém 528 px zbyde na obsah záložky 60 px a text se ořízne — přesah 105 px. Hlavička je prostě vyšší než okno. Řešení je stejné, jaké má telefon: na nízkém okně se celý modal posouvá dolů, místo aby se obsah ořezal. (Zkoušel jsem i sbalit popisy částek — přesah klesl jen ze 105 na 83 px, což nestačí.)',
    cesta: '/kauzy/capi-hnizdo/',
    viewport: { width: 1256, height: 528 },
    predPopisek: 'Dnes: text končí uprostřed věty',
    poPopisek: 'Po úpravě: dá se dorolovat',
    pred: {},
    po: {
      css: `@media (min-width:761px) and (max-height:620px){
        html.js body dialog.m2[open] { display:block; overflow-y:auto; }
        html.js body dialog.m2 .m2-panel[data-p]:not([hidden]) { overflow:visible; columns:auto; }
      }`,
    },
    mer: () => {
      // stejné počítání jako presahPanelu() v testech: obsah uvnitř boxu s vlastním posuvníkem
      // oříznutý není, jen se posouvá
      const panel = document.querySelector('#detail .m2-panel:not([hidden])');
      const spodek = panel.getBoundingClientRect().bottom;
      const vPosuvniku = el => {
        for (let q = el.parentElement; q && q !== panel; q = q.parentElement) {
          const oy = getComputedStyle(q).overflowY;
          if ((oy === 'auto' || oy === 'scroll') && q.getBoundingClientRect().bottom <= spodek + 1) return true;
        }
        return false;
      };
      let max = 0;
      for (const el of panel.querySelectorAll('*')) {
        if (!el.getClientRects().length || el.closest('[hidden]') || vPosuvniku(el)) continue;
        for (const r of el.getClientRects()) max = Math.max(max, r.bottom - spodek);
      }
      return { 'oříznutý text': Math.round(max) + ' px', 'místo na obsah': Math.round(panel.getBoundingClientRect().height) + ' px' };
    },
  },
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
    karty.push(`<section class="navrh">
  <label class="hlava"><input type="checkbox" data-navrh="${n.id}"><span class="cislo">${n.id}</span><span class="nazev">${esc(n.nazev)}</span></label>
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
obsahu, ne z kreseb. Dole se průběžně skládá soupis, který stačí zkopírovat a poslat mi.
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
