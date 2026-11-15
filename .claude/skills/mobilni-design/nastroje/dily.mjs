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

/** Seznam kauz: co řádek ukazuje a jak vysoký je. Délku roku na ose měří jen tam, kde pruh je. */
const MER_SEZNAM = () => {
  const radky = [...document.querySelectorAll('.radek')].filter(r => r.getClientRects().length);
  const vysky = radky.map(r => r.getBoundingClientRect().height);
  const lista = document.querySelector('.osa-roku');
  const stopa = radky[0]?.querySelector('.stopa');
  const naRok = stopa && stopa.getClientRects().length ? stopa.getBoundingClientRect().width / (new Date().getFullYear() + 1 - 1980) : 0;
  const pruhy = radky.map(r => r.querySelector('.pruh')).filter(p => p && p.getClientRects().length).map(p => p.getBoundingClientRect().width);
  return {
    'čas v řádku': naRok ? `pruh, ${String(Math.round(naRok * 10) / 10).replace('.', ',')} px na rok` : 'textem',
    'nejkratší pruh': pruhy.length ? Math.round(Math.min(...pruhy)) + ' px' : '–',
    'lišta s roky': lista && lista.getClientRects().length ? Math.round(lista.getBoundingClientRect().height) + ' px' : 'není',
    'první kauza začíná': Math.round(radky[0].getBoundingClientRect().top + scrollY) + ' px',
    'řádek průměrně': Math.round(vysky.reduce((a, b) => a + b, 0) / vysky.length) + ' px',
    'deset kauz': Math.round(radky.at(-1).getBoundingClientRect().bottom - radky[0].getBoundingClientRect().top) + ' px',
    'do strany': document.documentElement.scrollWidth > innerWidth ? 'PŘETÉKÁ' : 'ne',
  };
};

/* Věta „O co jde“ je ve větvi citelnost (uživatel ji má na telefonu); náhled ji přidá, aby řádek
 * vypadal jako po spojení obou větví. Text vět je převzatý z obsahu té větve do navrhy/o-co-jde.tsv
 * (slug, tabulátor, věta; řádek „oCoJde:“ z každého obsah/kauzy/*.md v NenechmeVyhnit-citelnost). */
const VETY = Object.fromEntries(readFileSync('navrhy/o-co-jde.tsv', 'utf8').trim().split('\n').map(r => r.split('\t')));
const VETA = `(() => { const V = ${JSON.stringify(VETY)};
  for (const r of document.querySelectorAll('.radek')) { const s = document.createElement('span'); s.className = 'o-co-jde'; s.textContent = V[r.dataset.slug] ?? ''; r.querySelector('.nazev strong').after(s); }
  const st = document.createElement('style'); st.textContent = '@media (max-width:760px){ body .radek .nazev .o-co-jde { display:block; margin-top:3px; font:13px/1.35 var(--f-text); color:var(--text2); } }'; document.head.append(st);
})()`;
const RAZENI = r => `(() => { ${VETA.slice(7, -3)}; const s = document.querySelector('select[data-razeni]'); s.value = '${r}'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`;
const SKROL = `(() => { const r = document.querySelector('.radek:not([hidden])'); scrollTo(0, r.getBoundingClientRect().top + scrollY - 44); })()`;

/* B: „2014 – dosud · 12 let a dál“ nad názvem (stejně jako roky nad názvem v hlavičce detailu). */
const ROKY_NAD = `(() => { for (const r of document.querySelectorAll('.radek')) {
  const p = r.querySelector('.pruh .popisek'); const em = p.querySelector('em')?.textContent ?? '';
  const s = document.createElement('span'); s.className = 'n-roky'; s.textContent = p.firstChild.textContent.trim() + ' · ' + em; r.querySelector('.nazev').prepend(s);
} })()`;

/* C: rok začátku v levém sloupci, jen u první kauzy toho roku; vpravo konec a délka. */
const ROK_VLEVO = `(() => { let pred = null;
  for (const r of document.querySelectorAll('.radek')) {
    if (!r.getClientRects().length) continue;
    const od = r.dataset.odRok, doo = r.dataset.doRok, em = r.querySelector('.pruh .popisek em')?.textContent ?? '';
    const s = document.createElement('span'); s.className = 'n-rok'; s.textContent = od === pred ? '' : od;
    if (od === pred) r.classList.add('n-stejny');
    pred = od;
    const d = document.createElement('span'); d.className = 'n-roky';
    d.textContent = (doo === 'dosud' ? 'dosud' : doo === od ? 'jen ' + od : 'do ' + doo) + ' · ' + em;
    r.querySelector('.nazev').prepend(d); r.querySelector('.radek-btn').prepend(s);
  } })()`;

const BEZ_OSY = `
  body .osa-roku, body .graf .pasmo, body .graf .pilulka, body .radek .stopa { display: none !important; }
  body .legenda > span:not(.legenda-odkazy) { display: none; }
  body .graf .radek { min-height: 0; }
  body .radek .nazev { padding: 10px 16px 12px; }
  body .radek .nazev .n-roky { display: block; margin-bottom: 2px; font: 600 13px/1.2 var(--f-mono); color: var(--inkoust); font-variant-numeric: tabular-nums; }`;

const STRANKA = {
  klic: 'seznam-kauz-bez-pruhu',
  nazev: 'Seznam kauz na telefonu',
  podtitul: 'co nahradí pruh na časové ose · varianty k výběru · skutečný obsah i s větami „O co jde“',
  nadpis: 'Na telefonu pruh na ose nic neřekne. Čas ale do seznamu patří.',
  odstavce: [
    'Osa na úvodu běží od roku 1980 do letoška. Na telefonu má na šířku asi 320 px, tedy <b>6,8 px na rok</b>. Nejstarší kauza začíná 1994, takže levá třetina osy je vždycky prázdná, a 28 z 33 kauz začíná od roku 2010 — všechny pruhy se tlačí do pravé třetiny. Čárky událostí v pruhu splývají. Jediné, co z řádku opravdu přečteš, je popisek nad pruhem: „2014 – dosud 12 let a dál“.',
    '<b>Na počítači má osa přes 900 px a dává smysl — tam zůstává beze změny.</b> Tady jde jen o telefon (do 760 px).',
    'Náhledy počítají s <b>větou „O co jde“</b> z větve čitelnost, kterou máš na snímku z telefonu. Po spojení obou větví bude řádek vypadat takhle.',
    '<b>Co to není:</b> nic se nemaže. Rozsah a délka kauzy zůstávají v řádku. Rozložení událostí, které ukazovaly čárky v pruhu, z řádku na telefonu odejde — v detailu kauzy je celé v záložce Kdy, i s přehledem všech událostí.',
  ],
};

const OTEVRENY = { cesta: '/', popis: 'Úvod, jak se otevře · 390 × 844', priprav: VETA };
const SEZNAM = { cesta: '/', popis: 'Seznam od první kauzy (řazeno od nejstarší) · 390', priprav: VETA, po: SKROL };
const CASTKA = { cesta: '/', popis: 'Řazeno podle částky · 390', priprav: RAZENI('castka'), po: SKROL, orez: 560 };
const UZKY = { cesta: '/', popis: 'Nejužší displej · 320', okno: { width: 320, height: 568 }, priprav: VETA, po: SKROL };

const DILY = [
  { id: 'cas', nazev: 'Co v řádku kauzy nese čas', otazka: 'Čím na telefonu nahradit pruh na ose?', doporuceni: 'C',
    pohledy: [OTEVRENY, SEZNAM, CASTKA, UZKY], mer: MER_SEZNAM, varianty: [
    { k: 'A', nazev: 'Pruh na ose 1980–2026', stitek: 'dnešní stav',
      myslenka: 'Každá kauza má pruh na společné ose let, nad seznamem je lišta s roky. Stejné jako na počítači, jen sedmkrát užší.',
      ano: ['Kauzy jdou porovnat polohou: kdo začal dřív, kdo trvá déle', 'Stejné zobrazení jako na počítači'],
      ne: ['6,8 px na rok: nejkratší pruh má 14 px a čárky událostí v něm splývají', 'Levá třetina osy (1980–1994) je vždycky prázdná, 28 z 33 kauz se tlačí do pravé třetiny', 'Lišta s roky nad seznamem bere 41 px', 'Čitelné je jen číslo v popisku nad pruhem — a to jde napsat i bez pruhu'],
      znacky: [{ sel: '.radek:not([hidden]) .pruh', typ: 'spatne', text: '6,8 px na rok, události splývají', kde: 'pod' }] },
    { k: 'B', nazev: 'Rozsah textem nad názvem', stitek: 'nejjednodušší',
      myslenka: '„2014 – dosud · 12 let a dál“ jako první řádek kauzy — stejně jako roky nad názvem v hlavičce detailu. Bez pruhu a bez lišty roků.',
      ano: ['Řádek nese totéž co popisek pruhu, jen čitelně a bez ozdob', 'Stejný tvar jako hlavička detailu: roky nad názvem', 'Seznam začíná o 41 px výš (lišta s roky odpadne)', 'Funguje stejně při každém řazení'],
      ne: ['Kdo začal dřív, se čte z čísel, ne z polohy na ose', 'Řádek je o 7 px vyšší (109 proti 102 px)', 'Přepínač „Osa / Mapa“ by na telefonu musel říkat „Seznam“ — osa tu už nebude'],
      uprav: ROKY_NAD, css: `@media (max-width:760px){ ${BEZ_OSY} }`,
      znacky: [{ sel: '.radek:not([hidden]) .n-roky', typ: 'dobre', text: 'Rozsah a délka textem' }] },
    { k: 'C', nazev: 'Rok začátku jako svislá osa', stitek: 'doporučuji',
      myslenka: 'Čas běží dolů. Rok začátku stojí v levém sloupci, jen u první kauzy toho roku; vpravo „do 2021 · 16 let“ nebo „dosud · 12 let a dál“.',
      ano: ['Čas zůstává kostrou seznamu, jen svisle — na telefonu přirozený směr', 'Je vidět, kdy se kauzy hromadily: kauzy téhož roku tvoří jeden blok (v roce 2017 jich začalo osm)', 'Každý údaj jen jednou: rok začátku vlevo, konec a délka vpravo', 'Přepínač „Osa“ dál říká pravdu', 'Seznam začíná o 41 px výš'],
      ne: ['Řádek je o 10 px vyšší (112 proti 102 px), na nejužším displeji o 29 px (136 proti 107) — text má o 52 px užší sloupec', 'Bloky let fungují jen při řazení podle začátku; při řazení podle částky nebo délky stojí rok u každé kauzy zvlášť', 'Nový prvek, který v řádu ovládání zatím není (sloupec s rokem)'],
      uprav: ROK_VLEVO, css: `@media (max-width:760px){ ${BEZ_OSY}
        body .radek-btn { grid-template-columns: 52px 1fr; }
        body .radek .n-rok { padding: 10px 0 0 16px; font: 600 13px/1.2 var(--f-mono); color: var(--inkoust); }
        body .radek .nazev { padding-left: 4px; }
        body .graf .radek { border-bottom: 0; border-top: 1px solid var(--linka); }
        body .graf .radek:first-child { border-top: 0; }
        body .graf .radek.n-stejny { border-top: 0; }
        body .graf .radek.n-stejny .nazev { border-top: 1px solid var(--linka); }
      }`,
      znacky: [{ sel: '.radek:not([hidden]) .n-rok', typ: 'dobre', text: 'Rok začátku jako svislá osa' }] },
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
