/* Shoda počítače — ověří, že mobilní úprava nezměnila zobrazení na počítači.
 *
 *   node .claude/skills/mobilni-design/nastroje/shoda-pocitace.mjs <build-před> <build-po>
 *
 * Vyfotí stejné stránky ze dvou hotových buildů v okně počítače (běžném i nízkém) a porovná je
 * bod po bodu. Kde se liší, řekne kde a který prvek tam je. Nic nestaví ani nemění.
 *
 * Jak získat build „před“ (z posledního commitu), když jsou změny rozpracované:
 *   NV_VYSTUP=dist-mobil-po   npx astro build
 *   git stash push -- src && NV_VYSTUP=dist-mobil-pred npx astro build ; git stash pop
 *
 * Proč to je: „počítač je v pořádku a nemá se měnit“ je stálé zadání, ale pravidlo psané mimo
 * @media se ho dotkne taky. 15. 11. tak zkratka `font: 600 14px/1.4` posunula odkaz „Celé znění“
 * o 3 px a „+N dalších“ o 1 px — testy prošly, rozdíl ukázalo až tohle porovnání. */
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
/** Na Windows server běží pod cmd (shell: true) a kill() zabije jen cmd — serve by zůstal viset na portu. */
const zastav = p => { if (!p) return; if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); else p.kill(); };

const [PRED, PO] = process.argv.slice(2);
if (!PRED || !PO || !existsSync(PRED) || !existsSync(PO)) {
  console.error('Použití: node shoda-pocitace.mjs <build-před> <build-po>  (obě složky musí existovat)');
  process.exit(2);
}
const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const PORTY = [4591, 4592];
const servery = [PRED, PO].map((s, i) => spawn(`npx serve ${s} -l ${PORTY[i]} --no-clipboard`, { shell: true, stdio: 'ignore' }));
const pockej = async port => { for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) return; } catch { /* ještě nenaběhl */ } await new Promise(r => setTimeout(r, 300)); } throw new Error('server nenaběhl: ' + port); };
const slozky = (kde, vynech = []) => existsSync(`${PO}/${kde}`) ? readdirSync(`${PO}/${kde}`, { withFileTypes: true }).filter(d => d.isDirectory() && !vynech.includes(d.name)).map(d => d.name) : [];

let ruznych = 0;
try {
  await Promise.all(PORTY.map(pockej));
  const kauzy = slozky('kauzy'), pravidla = slozky('pravidla', ['oblasti']), hlasovani = slozky('hlasovani');
  // Stránky a stavy: přehledy, statické stránky, detail kauzy i zákona (i v chronologii), hlasování.
  const STRANKY = [
    ['/', null], ['/pravidla/', null], ['/metodika/', null], ['/o-projektu/', null],
    ...kauzy.slice(0, 3).flatMap(k => [[`/kauzy/${k}/`, null], [`/kauzy/${k}/`, 'chrono'], [`/kauzy/${k}/`, 'zdroje']]),
    ...pravidla.slice(0, 2).flatMap(p => [[`/pravidla/${p}/`, null], [`/pravidla/${p}/`, 'chrono']]),
    ...hlasovani.slice(0, 1).map(h => [`/hlasovani/${h}/`, null]),
  ];
  const OKNA = [{ width: 1280, height: 800 }, { width: 1280, height: 560 }];
  const prohlizec = await chromium.launch();
  for (const okno of OKNA) {
    for (const [cesta, zalozka] of STRANKY) {
      const obr = []; let posledni;
      for (const port of PORTY) {
        const ctx = await prohlizec.newContext({ viewport: okno, reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        await page.goto(`http://localhost:${port}${cesta}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        if (zalozka) await page.evaluate(z => document.querySelector(`.zalozky [data-p="${z}"]`)?.click(), zalozka);
        await page.waitForTimeout(400);
        obr.push(PNG.sync.read(await page.screenshot({ animations: 'disabled' })));
        if (port === PORTY[1]) posledni = { page, ctx }; else await ctx.close();
      }
      const [a, b] = obr;
      let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      if (a.width !== b.width || a.height !== b.height) n = -1;
      else for (let i = 0; i < a.data.length; i += 4) {
        if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) {
          n++; const x = (i / 4) % a.width, y = Math.floor(i / 4 / a.width);
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      }
      const jmeno = `${okno.width}×${okno.height} ${cesta}${zalozka ? ' [' + zalozka + ']' : ''}`;
      if (!n) console.log(`  shodné   ${jmeno}`);
      else {
        ruznych++;
        const co = n < 0 ? 'jiný rozměr snímku' : await posledni.page.evaluate(([x, y]) => {
          const e = document.elementFromPoint(x, y); const c = []; let k = e;
          while (k && c.length < 3) { c.push(k.tagName.toLowerCase() + (k.className ? '.' + String(k.className).trim().replace(/\s+/g, '.') : '')); k = k.parentElement; }
          return c.join(' < ') + ' „' + (e?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) + '“';
        }, [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)]);
        console.log(`  LIŠÍ SE  ${jmeno} — ${n < 0 ? co : `${n} bodů v oblasti x ${x0}–${x1}, y ${y0}–${y1}: ${co}`}`);
      }
      await posledni.ctx.close();
    }
  }
  await prohlizec.close();
  console.log(ruznych ? `\n${ruznych} snímků se na počítači liší.` : '\nPočítač: všechny snímky shodné na pixel.');
} finally { servery.forEach(zastav); }
process.exit(ruznych ? 1 : 0);
