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

const MER_PRAVIDLA = () => {
  const v = n => { const e = document.querySelector(n); return e && e.getClientRects().length ? Math.round(e.getBoundingClientRect().height) : 0; };
  const obsah = document.querySelector('.pravidla-obal');
  const vTextu = e => !!e.closest('p, li, sup, small, figcaption, .lead, .met-hlava, .legenda, .paticka-met, .s-vazba');
  let pod44 = 0;
  for (const e of document.querySelectorAll('a[href], button, [role="button"], input, select, summary')) {
    if (!e.getClientRects().length || e.closest('[hidden]') || e.disabled || vTextu(e)) continue;
    let r = e.getBoundingClientRect();
    if (e instanceof HTMLInputElement && (e.type === 'checkbox' || e.type === 'radio')) { const l = e.closest('label'); if (l) r = l.getBoundingClientRect(); }
    if (r.width < 2 || r.height < 2) continue;
    if (r.width < 44 || r.height < 44) pod44++;
  }
  return { 'obal nad obsahem': obsah ? Math.round(obsah.getBoundingClientRect().top + scrollY) : 0,
           'z toho hlavička': v('.top'), 'z toho úvod': v('.hero'), 'z toho filtry': v('.filtry'),
           'cílů pod 44 px': pod44 };
};

const NAVRHY = [
  { id: 1, nazev: 'Menu zpět na jeden řádek',
    proc: 'Hlavička má na pravidlech 105 px, na úvodu 79 — zalomila se na dva řádky. Aktivní položka „Zákony“ je tučná, a tím širší; s výplní dotykového cíle, kterou jsem přidal včera, se řádek přestal vejít. Užší výplň a menší odsazení to vrátí na jeden řádek, cíle zůstanou nad 44 px.',
    cesta: '/pravidla/', predPopisek: 'Dnes: značka a menu pod sebou', poPopisek: 'Po úpravě: na jednom řádku', pred: {},
    po: { css: '@media (max-width:760px){ body .top.top-4 nav a { padding-inline: 6px; margin-left: 0; } body .top.top-4 .brand { padding-inline: 0; font-size: clamp(12px,3.1vw,15px); } body .top.top-4 .brand::before { width: 7px; margin-right: 5px; } }' },
    mer: MER_PRAVIDLA },
  { id: 2, nazev: 'Přepínač pohledu vedle počítadla',
    proc: 'Seznam / Časová osa zabírá celý řádek (46 px), přestože jsou to dvě slova. Vedle počítadla „4 změny“ je místa dost.',
    cesta: '/pravidla/', predPopisek: 'Dnes: přepínač přes celou šířku', poPopisek: 'Po úpravě: na řádku s počtem', pred: {},
    po: { css: '@media (max-width:760px){ body .filtry.f4.pr-filtry .pr-pohled { order: 4; flex: none; } body .filtry.f4.pr-filtry .pr-pohled button { flex: none; } }' },
    mer: MER_PRAVIDLA },
  { id: 3, nazev: '„Upřesnit výběr“ vedle čipů',
    proc: 'Odkaz stojí na vlastním řádku, přestože je krátký. Na řádku s čipy a počítadlem bývá místo. POZOR: s návrhem 2 se to nesčítá — oba uklízejí tentýž řádek. Změřeno: 2 samotný dá 343 px, 2 i 3 dohromady taky 343 px. Má smysl jen tehdy, když si návrh 2 nevybereš.',
    cesta: '/pravidla/', predPopisek: 'Dnes: vlastní řádek', poPopisek: 'Po úpravě: vedle čipů', pred: {},
    po: { css: '@media (max-width:760px){ html.js body .filtry.f4.pr-filtry .f-upresnit { flex: none; order: 3; } }' },
    mer: MER_PRAVIDLA },
  { id: 4, nazev: 'Úvod bez nadřádku',
    proc: 'Nad otázkou „Komu prospívají nová pravidla?“ stojí ještě „Zákony a nařízení od prosince 2025“. U kauz jsi obdobný nadřádek nechal; tady ho nabízím znovu, protože pravidla jsou nejhustší stránka webu.',
    cesta: '/pravidla/', predPopisek: 'Dnes: nadřádek i otázka', poPopisek: 'Po úpravě: jen otázka', pred: {},
    po: { css: '@media (max-width:760px){ body .hero.u2 .u2-nad { display:none; } }' },
    mer: MER_PRAVIDLA },
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
    // První změřená hodnota je ta hlavní: kolik návrh ušetří, patří hned k názvu.
    const prvni = Object.keys(a.cisla)[0];
    const rozdil = prvni && typeof a.cisla[prvni] === 'number' ? a.cisla[prvni] - b.cisla[prvni] : 0;
    const znacka = rozdil > 0 ? `<span class="usetri">−${rozdil} px</span>`
      : rozdil < 0 ? `<span class="pridava">+${-rozdil} px</span>` : '<span class="nic">beze změny</span>';
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
