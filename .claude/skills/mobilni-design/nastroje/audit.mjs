/* Celkový mobilní audit: projde všechny stránky webu na telefonu nastojato i naležato
 * a vypíše všechno, co na mobilu kazí použitelnost — ne jen jedno číslo.
 *
 *   node .claude/skills/mobilni-design/nastroje/audit.mjs
 *
 * Co hlídá:
 *   obal       kolik px stojí nad obsahem, než začne to, kvůli čemu tam čtenář přišel
 *   do strany  posouvání celé stránky i jednotlivých prvků mimo šířku okna
 *   cíle       ovládání menší než pohodlných 44 px (povinné minimum je 24) — i v záložkách
 *              detailu a po rozbalení, ne jen na stránce, jak se načte
 *   pole       pole formuláře pod 16 px — Safari na iOS při klepnutí přiblíží a nevrátí zpět
 *   písmo      nejmenší viditelný souvislý text (pod 14 px nejdeme)
 *   řádek      délka řádku hlavního textu ve znacích (pohodlné je 40–60)
 *   naležato   totéž v orientaci na šířku, kde se layout láme jinak
 *   přístupnost  závažné a kritické nálezy axe (WCAG 2.0/2.1 A + AA)
 *
 * Web si postaví sám ze skutečného obsahu, spustí server a uklidí po sobě. Nic nemění. */
import { chromium, devices } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdirSync, rmSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const VYSTUP = 'dist-mobil-audit';
const PORT = 4461;
const ADRESA = `http://localhost:${PORT}`;
const NASTOJATO = { width: 390, height: 844 };
const NALEZATO = { width: 844, height: 390 };
const SLOZKA = path.join(process.cwd(), 'navrhy');

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

function najdiStranky(koren, cesta = '') {
  const out = [];
  for (const p of readdirSync(path.join(koren, cesta), { withFileTypes: true })) {
    if (p.isDirectory()) out.push(...najdiStranky(koren, path.join(cesta, p.name)));
    else if (p.name === 'index.html') out.push('/' + cesta.split(path.sep).filter(Boolean).map(c => c + '/').join(''));
  }
  return out.sort();
}

/** Běží uvnitř stránky. Vrací čísla i jmenné seznamy viníků, ať je co opravovat. */
const ZMER = () => {
  const okno = innerWidth;
  const skryteProOci = e => !!e.closest('.jen-ctecka, [aria-hidden="true"]');
  // .pr-oblasti: odkazy na oblasti v řádku textu nad názvem zákona — výjimka pro odkaz uvnitř věty
  const vTextu = e => !!e.closest('p, li, sup, small, figcaption, .lead, .met-hlava, .legenda, .paticka-met, .s-vazba, .pr-oblasti');
  const popis = e => {
    const t = e.tagName.toLowerCase();
    const tridy = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const jmeno = (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${t}${tridy}${jmeno ? ` „${jmeno}“` : ''}`;
  };

  // obal nad obsahem
  const panel = document.querySelector('.m2-panel[data-p]:not([hidden])');
  const dlg = document.querySelector('dialog#detail');
  let obal = 0;
  if (panel && dlg) obal = Math.round(panel.getBoundingClientRect().top - dlg.getBoundingClientRect().top);
  else for (const d of (document.querySelector('main') || document.body).children) {
    if (d.matches('.hero, .filtry, .jen-ctecka, script, style') || !d.getClientRects().length) continue;
    obal = Math.round(d.getBoundingClientRect().top + scrollY); break;
  }

  // prvky mimo šířku okna (mimo ty, které mají vlastní vodorovný posuvník)
  const vPosuvniku = e => {
    for (let q = e.parentElement; q; q = q.parentElement) {
      const ox = getComputedStyle(q).overflowX;
      if (ox !== 'visible' && q.getBoundingClientRect().right <= okno + 1) return true;
    }
    return false;
  };
  const siroke = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!e.getClientRects().length || e.closest('[hidden]') || e.closest('[aria-hidden="true"]')) continue;
    if (getComputedStyle(e).position === 'fixed' || vPosuvniku(e)) continue;
    const r = e.getBoundingClientRect();
    const presah = Math.round(Math.max(r.right - okno, -r.left));
    if (presah > 1) siroke.push(`${popis(e)} +${presah} px`);
  }

  // dotykové cíle a pole formuláře
  const PISE_SE = ['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'month', 'week', 'time'];
  const maleCile = [], malaPole = [];
  for (const e of document.querySelectorAll('a[href], button, [role="button"], input, select, textarea, summary')) {
    if (!e.getClientRects().length || e.closest('[hidden]') || e.disabled) continue;
    if (e.matches('input, select, textarea') && (e.tagName !== 'INPUT' || PISE_SE.includes(e.type))
      && parseFloat(getComputedStyle(e).fontSize) < 16) malaPole.push(popis(e));
    if (vTextu(e)) continue;
    let r = e.getBoundingClientRect();
    if (e instanceof HTMLInputElement && (e.type === 'checkbox' || e.type === 'radio')) {
      const l = e.closest('label'); if (l) r = l.getBoundingClientRect();
    }
    if (r.width < 2 || r.height < 2) continue;
    if (r.width < 44 || r.height < 44) maleCile.push(`${popis(e)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }

  // písmo a délka řádku u souvislého textu
  let pismo = 99; const maleTexty = [];
  let radekMin = 999, radekMax = 0;
  for (const e of document.querySelectorAll('p, li, dd, figcaption, td')) {
    if (!e.getClientRects().length || !e.textContent.trim() || skryteProOci(e)) continue;
    const cs = getComputedStyle(e);
    const px = Math.round(parseFloat(cs.fontSize));
    if (px < pismo) pismo = px;
    if (px < 14) maleTexty.push(`${popis(e)} ${px} px`);
    // délka řádku: šířka boxu dělená střední šířkou znaku (0,5 em je rozumný odhad pro patkové písmo)
    const text = e.textContent.trim();
    if (text.length > 80 && e.getBoundingClientRect().width > 100) {
      const znaku = Math.round(e.getBoundingClientRect().width / (px * 0.5));
      radekMin = Math.min(radekMin, znaku); radekMax = Math.max(radekMax, znaku);
    }
  }

  return {
    obal,
    doStrany: Math.max(0, document.scrollingElement.scrollWidth - okno),
    vyska: Math.round(document.scrollingElement.scrollHeight),
    obrazovek: +(document.scrollingElement.scrollHeight / innerHeight).toFixed(1),
    siroke: [...new Set(siroke)], maleCile: [...new Set(maleCile)], malaPole: [...new Set(malaPole)],
    maleTexty: [...new Set(maleTexty)], pismo: pismo === 99 ? 0 : pismo,
    radek: radekMax ? [radekMin, radekMax] : null,
  };
};

/** Stavy, do kterých se stránka dostane až ovládáním: záložky detailu a rozbalovací prvky.
 *  Bez nich audit měřil jen stránku, jak se načte — a záložka Zdroje tak půl dne nesla filtr
 *  vysoký 24 px a odkazy vysoké 20 px, zatímco výpis hlásil „cíle pod 44 px: nic“. */
const ROZBALOVACE = ['.perex-vice', '.castky-vice', '.pro-vas-vice', '.filtry .f-cipy .f-vice', '.filtry .f-upresnit', '.hl-vice'];
async function zmerStavy(page) {
  const nalezy = { maleCile: [], siroke: [], malaPole: [] };
  const pridej = async stav => {
    await page.waitForTimeout(120);
    const m = await page.evaluate(ZMER);
    for (const k of Object.keys(nalezy)) nalezy[k].push(...m[k].map(x => `${x} [${stav}]`));
  };
  const klepni = sel => page.evaluate(s => {
    const e = [...document.querySelectorAll(s)].find(x => x.getClientRects().length && !x.closest('[hidden]'));
    if (e) e.click();
    return !!e;
  }, sel);
  const zalozky = await page.evaluate(() => [...document.querySelectorAll('.zalozky [role="tab"]')].map(b => b.dataset.p));
  for (const z of zalozky.slice(1)) {
    await klepni(`.zalozky [data-p="${z}"]`);
    await pridej(`záložka ${z}`);
    if (z === 'chrono' && await klepni('.listovani-prehled')) { await pridej('přehled událostí'); await klepni('.listovani-prehled'); }
  }
  if (zalozky.length) await klepni(`.zalozky [data-p="${zalozky[0]}"]`);
  for (const sel of ROZBALOVACE) if (await klepni(sel)) await pridej(`po klepnutí na ${sel}`);
  return nalezy;
}

let server;
try {
  console.log('stavím web ze skutečného obsahu…');
  rmSync(VYSTUP, { recursive: true, force: true });
  await spust('npx astro build', { NV_VYSTUP: VYSTUP });
  server = spawn(`npx serve ${VYSTUP} -l ${PORT} --no-clipboard`, { shell: true, stdio: 'ignore' });
  await pockejNaServer();

  const stranky = najdiStranky(VYSTUP);
  const prohlizec = await chromium.launch();
  const vysledky = [];

  for (const cesta of stranky) {
    const ctx = await prohlizec.newContext({ ...devices['Pixel 5'], viewport: NASTOJATO, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(ADRESA + cesta, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    const stojato = await page.evaluate(ZMER);

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const zavazne = axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
      .map(v => `${v.id} (${v.nodes.length}×)`);

    // stavy až po axe: ten má vidět stránku, jak se načte
    const stavy = await zmerStavy(page);
    for (const k of Object.keys(stavy)) stojato[k] = [...new Set([...stojato[k], ...stavy[k]])];

    await page.goto(ADRESA + cesta, { waitUntil: 'load' });
    await page.setViewportSize(NALEZATO);
    await page.waitForTimeout(250);
    const lezato = await page.evaluate(ZMER);
    await ctx.close();

    vysledky.push({ cesta, stojato, lezato, zavazne });
    process.stdout.write('.');
  }
  await prohlizec.close();
  console.log('\n');

  // ---- výpis ----
  const s = (v, n) => String(v).padStart(n);
  console.log(`Mobilní audit — ${stranky.length} stránek, telefon ${NASTOJATO.width}×${NASTOJATO.height} i naležato.\n`);
  console.log('stránka'.padEnd(44) + s('obal', 6) + s('obrazovek', 11) + s('do strany', 11) + s('cíle', 6) + s('pole', 6) + s('písmo', 7) + s('a11y', 6) + s('naležato', 10));
  for (const v of [...vysledky].sort((a, b) => b.stojato.obal - a.stojato.obal)) {
    const lez = v.lezato.doStrany > 0 ? `+${v.lezato.doStrany} px` : v.lezato.siroke.length ? `${v.lezato.siroke.length} prvků` : 'ok';
    console.log(v.cesta.slice(0, 44).padEnd(44) + s(v.stojato.obal, 6) + s(v.stojato.obrazovek, 11)
      + s(v.stojato.doStrany || v.stojato.siroke.length, 11) + s(v.stojato.maleCile.length, 6)
      + s(v.stojato.malaPole.length, 6) + s(v.stojato.pismo, 7) + s(v.zavazne.length, 6) + s(lez, 10));
  }

  const sesbirej = (klic, kde = 'stojato') => {
    const m = new Map();
    for (const v of vysledky) for (const x of v[kde][klic]) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const vypis = (nadpis, polozky) => {
    if (!polozky.length) { console.log(`\n${nadpis}: nic`); return; }
    console.log(`\n${nadpis}:`);
    for (const [co, kolikrat] of polozky.slice(0, 12)) console.log(`  ${kolikrat}× ${co}`);
    if (polozky.length > 12) console.log(`  …a dalších ${polozky.length - 12}`);
  };

  vypis('Dotykové cíle pod 44 px', sesbirej('maleCile'));
  vypis('Pole formuláře pod 16 px (iOS přiblíží)', sesbirej('malaPole'));
  vypis('Souvislý text pod 14 px', sesbirej('maleTexty'));
  vypis('Prvky mimo šířku okna — nastojato', sesbirej('siroke'));
  vypis('Prvky mimo šířku okna — naležato', sesbirej('siroke', 'lezato'));

  const a11y = new Map();
  for (const v of vysledky) for (const x of v.zavazne) a11y.set(x.split(' ')[0], (a11y.get(x.split(' ')[0]) ?? 0) + 1);
  vypis('Závažné nálezy přístupnosti', [...a11y].sort((a, b) => b[1] - a[1]));

  const radky = vysledky.map(v => v.stojato.radek).filter(Boolean);
  if (radky.length) {
    const min = Math.min(...radky.map(r => r[0])), max = Math.max(...radky.map(r => r[1]));
    console.log(`\nDélka řádku hlavního textu: ${min}–${max} znaků (pohodlné je 40–60).`);
  }

  await mkdir(SLOZKA, { recursive: true });
  await writeFile(path.join(SLOZKA, 'audit.json'), JSON.stringify(vysledky, null, 1), 'utf8');
  console.log(`\nPodrobnosti: ${path.join(SLOZKA, 'audit.json')}`);
} finally {
  server?.kill();
  rmSync(VYSTUP, { recursive: true, force: true });
}
