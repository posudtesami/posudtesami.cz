/* Varianty mobilního zobrazení k výběru. ŠABLONA — před každým použitím se přepíše blok OBRAZOVKY.
 *
 *   node .claude/skills/mobilni-design/nastroje/varianty.mjs
 *
 * Otevře stránku na telefonu 390×844 nad skutečným obsahem, nasadí na ni jednu variantu úprav,
 * vyfotí, co je vidět BEZ POSUNUTÍ, a změří, kolik místa zabere obal nad obsahem.
 * Výsledek: navrhy/index.html — jedna stránka se snímky a čísly, ze které si uživatel vybere.
 *
 * Varianta je jen náhled: schovává, nerozbaluje. Hotová věc se staví pořádně, až je vybráno. */
import { chromium, devices } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const VYSTUP = 'dist-mobil-varianty';
const PORT = 4457;
const ADRESA = `http://localhost:${PORT}`;
const SLOZKA = path.join(process.cwd(), 'navrhy');
const TELEFON = { width: 390, height: 844 };

// ───────────────────────────────────────────────────────────────────────────────────────────────
// SEM se píšou varianty. Mají se sčítat (B obsahuje A, C obsahuje B), aby si uživatel mohl vybrat,
// jak daleko zajít. První varianta je vždycky „Dnešek" bez úprav — proti ní se počítá úspora.
//
// css      … kousek CSS nasazený na stránku (mobilní pravidla piš do @media (max-width:760px))
// uprav    … funkce, která běží ve stránce; na úpravu textu nebo doplnění ovládání do náhledu
// mer      … funkce, která vrátí { hlavni: <číslo>, …další čísla do popisku }
// jednotka … co je hlavní číslo zač: 'obal' (px nad obsahem) nebo 'vyska' (px celé stránky)
//
// Níž je ukázka na hlasování — nejdelší stránce webu. Přepiš ji svou.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const SKUPINY_SBALENE = `@media (max-width:760px){ .hl-vsichni .hl-skupina ul { display:none; } }`;
const LEGENDA_SBALENA = `@media (max-width:760px){ .hl-legenda-text { display:none; } }`;

const OBRAZOVKY = [
  {
    nadpis: 'Hlasování — jmenný seznam poslanců',
    cesta: '/hlasovani/psp-10-34-311/',
    jednotka: 'vyska',
    mer: () => {
      const v = n => { const e = document.querySelector(n); return e ? Math.round(e.getBoundingClientRect().height) : 0; };
      return {
        hlavni: Math.round(document.scrollingElement.scrollHeight),
        obrazovek: +(document.scrollingElement.scrollHeight / innerHeight).toFixed(1),
        'hlavička': v('.hl-hlava'), 'tělo': v('.hl-telo'), 'jmenný seznam': v('.hl-vsichni'),
      };
    },
    varianty: [
      { id: 'h0', nazev: 'Dnešek', popis: 'Celá sněmovna jménem po jménu pod sebou.' },
      { id: 'h1', nazev: 'A — skupiny sbalené na nadpis', popis: 'Zůstane „Pro (86)“, „Proti (69)“ a tak dál; jména se rozbalí klepnutím. Souhrn i tabulka klubů zůstávají nahoře.', css: SKUPINY_SBALENE },
      { id: 'h2', nazev: 'B — A + legenda pod rozbalení', popis: 'Vysvětlení „zdržel se nebo nehlasoval“ je důležité, ale ne při prvním pohledu.', css: SKUPINY_SBALENE + LEGENDA_SBALENA },
    ],
  },
];

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Dál už se nic nepřepisuje.
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

let server;
try {
  console.log('stavím web ze skutečného obsahu…');
  rmSync(VYSTUP, { recursive: true, force: true });
  await spust('npx astro build', { NV_VYSTUP: VYSTUP });
  server = spawn(`npx serve ${VYSTUP} -l ${PORT} --no-clipboard`, { shell: true, stdio: 'ignore' });
  await pockejNaServer();

  const prohlizec = await chromium.launch();
  await mkdir(SLOZKA, { recursive: true });
  const sekce = [];

  for (const o of OBRAZOVKY) {
    const karty = [];
    let zaklad = null;
    for (const v of o.varianty) {
      const ctx = await prohlizec.newContext({ ...devices['Pixel 5'], viewport: TELEFON, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(ADRESA + o.cesta, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      if (v.css) await page.addStyleTag({ content: v.css });
      if (v.uprav) await page.evaluate(v.uprav);
      await page.waitForTimeout(300);
      const m = await page.evaluate(o.mer);
      await page.screenshot({ path: path.join(SLOZKA, `${v.id}.png`), animations: 'disabled' });
      await ctx.close();

      if (zaklad === null) zaklad = m.hlavni;
      const usetreno = zaklad - m.hlavni;
      const jeObal = (o.jednotka ?? 'obal') === 'obal';
      const popisek = jeObal
        ? `obal nad obsahem <b>${m.hlavni} px</b> z ${TELEFON.height} (${Math.round(m.hlavni / TELEFON.height * 100)} %)`
        : `výška stránky <b>${m.hlavni} px</b> (${(m.hlavni / TELEFON.height).toFixed(1)} obrazovky)`;
      const podrobnosti = Object.entries(m).filter(([k]) => k !== 'hlavni').map(([k, h]) => `${k} ${h}`).join(' · ');
      karty.push(`<figure><img src="${v.id}.png" alt="${esc(v.nazev)}" loading="lazy">
        <figcaption><strong>${esc(v.nazev)}</strong>
        <span class="cislo">${popisek}${usetreno > 0 ? ` <ins>o ${usetreno} px méně</ins>` : ''}</span>
        <span class="det">${esc(podrobnosti)}</span>
        <span class="pop">${esc(v.popis)}</span></figcaption></figure>`);
      console.log(`${v.id} ${v.nazev}: ${jeObal ? 'nad obsahem' : 'výška'} ${m.hlavni} px`);
    }
    sekce.push(`<h2>${esc(o.nadpis)} <small>${esc(o.cesta)}</small></h2><div class="mrizka">${karty.join('\n')}</div>`);
  }

  await prohlizec.close();
  await writeFile(path.join(SLOZKA, 'index.html'), `<!doctype html><html lang="cs"><meta charset="utf-8">
<title>Návrhy mobilního zobrazení — k výběru</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 :root{color-scheme:light dark}
 body{margin:0;padding:24px;font:15px/1.5 system-ui,sans-serif;background:#f5f5f8;color:#16153a}
 h1{font-size:22px;margin:0 0 4px} .kdy{color:#5b5a7a;margin:0 0 28px;max-width:60em}
 h2{margin:36px 0 12px;font-size:17px} h2 small{font-weight:400;color:#5b5a7a;font-family:ui-monospace,monospace}
 .mrizka{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}
 figure{margin:0;width:${TELEFON.width}px;background:#fff;border:1px solid #d3d3e2;border-radius:8px;overflow:hidden}
 img{display:block;width:${TELEFON.width}px;height:auto;border-bottom:1px solid #d3d3e2}
 figcaption{padding:10px 12px;display:grid;gap:4px;font-size:13px} figcaption strong{font-size:14px}
 .cislo b{font-family:ui-monospace,monospace} ins{text-decoration:none;color:#0a7b3e;font-weight:700}
 .det{color:#5b5a7a;font:11px ui-monospace,monospace} .pop{color:#3a3960}
</style>
<h1>Návrhy mobilního zobrazení — k výběru</h1>
<p class="kdy">Telefon ${TELEFON.width}×${TELEFON.height}, skutečný obsah webu. Na snímku je přesně to, co čtenář uvidí,
než cokoli odroluje. Varianty se sčítají: B obsahuje A, C obsahuje B. Vytvořeno ${new Date().toLocaleString('cs-CZ')}.</p>
${sekce.join('\n')}
</html>`, 'utf8');
  console.log('\nHotovo: ' + path.join(SLOZKA, 'index.html'));
} finally {
  server?.kill();
  rmSync(VYSTUP, { recursive: true, force: true });
}
