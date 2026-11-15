/* Přehled mobilního zobrazení: projde všechny stránky na telefonu 390×844 nad SKUTEČNÝM obsahem
 * a u každé řekne, kolik místa zabere obal, než začne to, kvůli čemu tam čtenář přišel.
 *
 *   node .claude/skills/mobilni-design/nastroje/prehled.mjs
 *
 * Web si postaví sám (do dist-mobil-prehled/), spustí server a zase ho zavře. Nic nemění. */
import { chromium, devices } from '@playwright/test';
import { readdirSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const VYSTUP = 'dist-mobil-prehled';
const PORT = 4456;
const ADRESA = `http://localhost:${PORT}`;
const TELEFON = { width: 390, height: 844 };

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

/** Každý index.html v buildu je jedna adresa. */
function najdiStranky(koren, cesta = '') {
  const out = [];
  for (const p of readdirSync(path.join(koren, cesta), { withFileTypes: true })) {
    if (p.isDirectory()) out.push(...najdiStranky(koren, path.join(cesta, p.name)));
    else if (p.name === 'index.html') out.push('/' + cesta.split(path.sep).filter(Boolean).map(c => c + '/').join(''));
  }
  return out.sort();
}

/** Běží uvnitř stránky. Pozor: .jen-ctecka a spol. jsou vidět pro měření, ale ne pro čtenáře. */
const mer = () => {
  const skryteProOci = e => !!e.closest('.jen-ctecka, [aria-hidden="true"]');
  const vyska = n => { const e = document.querySelector(n); return e ? Math.round(e.getBoundingClientRect().height) : 0; };

  // Kde začíná obsah: v detailu otevřený panel, jinak první blok v <main>, který není úvod ani filtry.
  const panel = document.querySelector('.m2-panel[data-p]:not([hidden])');
  const dlg = document.querySelector('dialog#detail');
  let obal = 0, kde = '';
  if (panel && dlg) {
    obal = Math.round(panel.getBoundingClientRect().top - dlg.getBoundingClientRect().top);
    kde = 'panel detailu';
  } else {
    for (const d of (document.querySelector('main') || document.body).children) {
      if (d.matches('.hero, .filtry, .jen-ctecka, script, style') || !d.getClientRects().length) continue;
      obal = Math.round(d.getBoundingClientRect().top + scrollY);
      kde = (d.className || d.tagName).toString().split(' ')[0];
      break;
    }
  }

  // Ovládání pod pohodlnými 44 px (povinných 24 hlídá testovací sada). Odkaz uvnitř věty má výjimku.
  const vTextu = e => !!e.closest('p, li, sup, small, figcaption, .lead, .met-hlava, .legenda, .paticka-met, .s-vazba');
  let pod44 = 0;
  for (const e of document.querySelectorAll('a[href], button, [role="button"], input, select, summary')) {
    if (!e.getClientRects().length || e.closest('[hidden]') || e.disabled || vTextu(e)) continue;
    let r = e.getBoundingClientRect();
    if (e instanceof HTMLInputElement && (e.type === 'checkbox' || e.type === 'radio')) {
      const stitek = e.closest('label'); if (stitek) r = stitek.getBoundingClientRect();
    }
    if (r.width < 2 || r.height < 2) continue;
    if (r.width < 44 || r.height < 44) pod44++;
  }

  // Pole pod 16 px: Safari na iOS při klepnutí přiblíží stránku a nevrátí ji zpět. Týká se jen polí,
  // do kterých se píše nebo vybírá — zaškrtávátko, přepínač ani tlačítko přiblížení nespouští.
  const PISE_SE = ['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'month', 'week', 'time'];
  const malaPole = [...document.querySelectorAll('input, select, textarea')]
    .filter(e => e.getClientRects().length
      && (e.tagName !== 'INPUT' || PISE_SE.includes(e.type))
      && parseFloat(getComputedStyle(e).fontSize) < 16).length;

  // Nejmenší písmo souvislého textu, který je opravdu vidět.
  let pismo = 99;
  for (const e of document.querySelectorAll('p, li, td, dd, figcaption, .roky, .meta')) {
    if (!e.getClientRects().length || !e.textContent.trim() || skryteProOci(e)) continue;
    pismo = Math.min(pismo, Math.round(parseFloat(getComputedStyle(e).fontSize)));
  }

  return {
    obal, kde,
    vyska: Math.round(document.scrollingElement.scrollHeight),
    obrazovek: +(document.scrollingElement.scrollHeight / innerHeight).toFixed(1),
    doStrany: Math.max(0, document.scrollingElement.scrollWidth - innerWidth),
    pod44, malaPole, pismo: pismo === 99 ? 0 : pismo,
  };
};

let server;
try {
  console.log('stavím web ze skutečného obsahu…');
  rmSync(VYSTUP, { recursive: true, force: true });
  await spust('npx astro build', { NV_VYSTUP: VYSTUP });

  server = spawn(`npx serve ${VYSTUP} -l ${PORT} --no-clipboard`, { shell: true, stdio: 'ignore' });
  await pockejNaServer();

  const prohlizec = await chromium.launch();
  const ctx = await prohlizec.newContext({ ...devices['Pixel 5'], viewport: TELEFON, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const radky = [];
  for (const cesta of najdiStranky(VYSTUP)) {
    await page.goto(ADRESA + cesta, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    radky.push({ cesta, ...await page.evaluate(mer) });
  }
  await prohlizec.close();

  radky.sort((a, b) => b.obal - a.obal);
  const s = (v, n) => String(v).padStart(n);
  console.log(`\nTelefon ${TELEFON.width}×${TELEFON.height}, skutečný obsah, ${radky.length} stránek.`);
  console.log('Obal = kolik pixelů stojí nad obsahem, než začne to, kvůli čemu tam čtenář přišel.\n');
  console.log('stránka'.padEnd(44) + s('obal', 6) + s('z 844', 7) + s('obrazovek', 11) + s('do strany', 11) + s('<44px', 7) + s('pole<16', 9) + s('písmo', 7));
  for (const r of radky) {
    console.log(r.cesta.slice(0, 44).padEnd(44) + s(r.obal, 6) + s(Math.round(r.obal / TELEFON.height * 100) + ' %', 7)
      + s(r.obrazovek, 11) + s(r.doStrany, 11) + s(r.pod44, 7) + s(r.malaPole, 9) + s(r.pismo, 7));
  }
  const nejhorsi = radky[0], nejdelsi = [...radky].sort((a, b) => b.obrazovek - a.obrazovek)[0];
  console.log(`\nNejvíc obalu: ${nejhorsi.cesta} (${nejhorsi.obal} px, ${Math.round(nejhorsi.obal / TELEFON.height * 100)} %).`);
  console.log(`Nejdelší stránka: ${nejdelsi.cesta} (${nejdelsi.obrazovek} obrazovek).`);
  if (radky.some(r => r.doStrany > 0)) console.log('POZOR: některá stránka se posouvá do strany.');
} finally {
  server?.kill();
  rmSync(VYSTUP, { recursive: true, force: true });
}
