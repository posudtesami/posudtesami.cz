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

const NA_CHRONOLOGII = () => { document.querySelector('.zalozky [data-p="chrono"]')?.click(); };

/** Kde na displeji stojí listovací tlačítka a jestli na ně dosáhne palec. */
const MER_LISTOVANI = () => {
  const l = document.querySelector('.listovani');
  if (!l || !l.getClientRects().length) return { 'tlačítka': 'nejsou vidět' };
  const r = l.getBoundingClientRect();
  const stred = Math.round(r.top + r.height / 2);
  return {
    'tlačítka od horního okraje': stred + ' px',
    'výška ovládání': Math.round(r.height) + ' px',
    'vidět bez posunutí': r.bottom <= innerHeight && r.top >= 0 ? 'ano' : 'ne',
    'v dosahu palce': stred > innerHeight * 0.55 ? 'ano' : 'ne, vysoko',
  };
};

/** Jak daleko je to k události uprostřed kauzy a jak je chronologie dlouhá. */
const merSkok = (klepnuti) => `() => {
  const dlg = document.querySelector('dialog#detail');
  const n = document.querySelectorAll('.udalosti-seznam > li').length;
  return { 'událostí': n, 'klepnutí na prostřední': ${JSON.stringify(klepnuti)}.replace('N', Math.round(n / 2)),
           'délka chronologie': (dlg.scrollHeight / innerHeight).toFixed(1).replace('.', ',') + ' obrazovky' };
}`;

const MER_HLAVICKA = () => {
  const v = n => { const e = document.querySelector(n); return e && e.getClientRects().length ? Math.round(e.getBoundingClientRect().height) : 0; };
  const dlg = document.querySelector('dialog#detail');
  const panel = document.querySelector('.m2-panel[data-p]:not([hidden])');
  return {
    'obal nad obsahem': Math.round(panel.getBoundingClientRect().top - dlg.getBoundingClientRect().top) + ' px',
    'z toho částky': v('.castky') + ' px', 'z toho shrnutí': (v('.perex') + v('.perex-vice')) + ' px',
  };
};

// ───────────────────────────────────────────────────────────────────────────────────────────────
// STRANKA a DILY — tohle se přepisuje.
//
// Díl: { id, nazev, otazka, doporuceni, cesta, priprav?, vyrez?, varianty: [...] }
//   priprav … funkce ve stránce, která připraví výchozí stav (třeba přepne záložku)
//   vyrez   … selektor prvku, který se vyfotí místo celé obrazovky
// Varianta: { k, nazev, stitek, myslenka, ano: [], ne: [], css?, uprav?, znacky?, mer? }
//   znacky  … [{ sel, typ: 'spatne' | 'dobre' | 'presun', text }] — kreslí se do snímku
// Položka { skupina, popis } vloží velký nadpis mezi díly.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const STRANKA = {
  klic: 'chronologie-a-hlavicka',
  nazev: 'Detail kauzy na telefonu',
  podtitul: 'chronologie bez osy a hlavička · varianty k výběru · skutečný obsah',
  nadpis: 'Osa je z telefonu pryč. Teď doladit, čím se chronologií prochází.',
  odstavce: [
    'Rozhodl jsi, že <b>časová osa na telefonu nedává smysl</b> a událostmi se bude jen listovat tlačítky. To je hotové a v kódu. Tím se ale listování stalo <b>jediným ovládáním</b> chronologie — a to, co dřív stačilo jako doplněk pod osou, teď nese celou práci.',
    'První tři díly jsou o něm: kde tlačítka stojí, jak se dostat k události uprostřed dlouhé kauzy a kterou událostí se začíná. Další dva se týkají hlavičky, kde po dnešku zbyly dvě nedořešené věci.',
    '<b>Co to není:</b> nic z toho neubírá obsah. Každá událost, každá částka i celé shrnutí zůstávají dostupné ve všech variantách — liší se jen tím, kolik klepnutí k nim vede a kolik místa zabere ovládání.',
    'Náhledy jsou skutečné snímky telefonu 390 × 844 nad kauzou Čapí hnízdo (30 událostí, dvě částky). Čísla pod nimi jsou změřená, ne odhadnutá.',
  ],
};

const DILY = [
  { skupina: 'Chronologie', popis: 'Bez osy se událostmi prochází jen tlačítky „předchozí“ a „další“. Dlouhá kauza má třicet událostí.' },

  { id: 'kde', nazev: 'Kde stojí listování', otazka: 'Kam na displeji patří tlačítka předchozí / další?', doporuceni: 'C',
    cesta: '/kauzy/capi-hnizdo/', priprav: NA_CHRONOLOGII, mer: MER_LISTOVANI, varianty: [
    { k: 'A', nazev: 'Pod událostí', stitek: 'dnešní stav',
      myslenka: 'Tlačítka jsou za textem události: přečteš ji a pokračuješ dál.',
      ano: ['Přirozené pořadí čtení', 'Nic nepřekrývá obsah'],
      ne: ['U delší události sjedou pod okraj displeje a musí se k nim dorolovat', 'Poloha se mění podle délky textu, palec je pokaždé jinde'],
      znacky: [{ sel: '.listovani', typ: 'spatne', text: 'Poloha závisí na délce textu události' }] },
    { k: 'B', nazev: 'Nad událostí', stitek: 'hned pod záložkami',
      myslenka: 'Tlačítka jsou první věc v záložce, vždy na stejném místě.',
      ano: ['Vždy vidět bez posunutí', 'Stálá poloha'],
      ne: ['Nahoře je to palci nejdál — telefon držený jednou rukou tam nedosáhne', 'Ovládání stojí před obsahem, o který jde'],
      css: `@media (max-width:760px){ html.js body .m2-panel[data-p="chrono"]:not([hidden]) { display:flex; flex-direction:column; }
        html.js body .m2-panel[data-p="chrono"] .listovani { order:-1; margin:0 0 16px; padding:0 0 14px; border-top:0; border-bottom:1px dashed var(--linka); } }`,
      znacky: [{ sel: '.listovani', typ: 'presun', text: 'Přesunuto nahoru, nad událost' }] },
    { k: 'C', nazev: 'Přilepené dole', stitek: 'doporučuji',
      myslenka: 'Tlačítka drží u spodního okraje displeje, ať je událost jakkoli dlouhá.',
      ano: ['Přesně v dosahu palce', 'Vždy vidět a vždy na stejném místě', 'Dá se listovat rychle za sebou bez hledání'],
      ne: ['Natrvalo ubere z displeje 77 px', 'Název sousední události se v liště musí zkrátit na jeden řádek, jinak by lišta měla přes 110 px', 'Pod událostí musí zůstat volné místo, aby lišta nepřekryla konec textu'],
      css: `@media (max-width:760px){ html.js body .m2-panel[data-p="chrono"] .listovani { position:fixed; left:0; right:0; bottom:0; z-index:6; margin:0; padding:10px 18px; background:var(--plocha); border-top:1px solid var(--inkoust); }
        html.js body .m2-panel[data-p="chrono"] .listovani button { min-width:0; }
        html.js body .m2-panel[data-p="chrono"] .listovani button span { display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        html.js body .m2-panel[data-p="chrono"]:not([hidden]) { padding-bottom:96px; } }`,
      znacky: [{ sel: '.listovani', typ: 'dobre', text: 'U palce, vždy na stejném místě' }] },
  ] },

  { id: 'skok', nazev: 'Cesta k události uprostřed', otazka: 'Jak se dostat na patnáctou událost z třiceti?', doporuceni: 'B',
    cesta: '/kauzy/capi-hnizdo/', priprav: NA_CHRONOLOGII, varianty: [
    { k: 'A', nazev: 'Jen krok po kroku', stitek: 'dnešní stav',
      myslenka: 'Listuje se po jedné. Jiná cesta není.',
      ano: ['Nejjednodušší, nic nového'],
      ne: ['K události uprostřed je to patnáct klepnutí', 'Čtenář nevidí, co v kauze vůbec je, dokud to neprolistuje'],
      mer: merSkok('N'),
      znacky: [{ sel: '.listovani', typ: 'spatne', text: 'Jediná cesta: 15 klepnutí doprostřed' }] },
    { k: 'B', nazev: 'Přehled všech událostí', stitek: 'doporučuji',
      myslenka: 'Pod listováním je odkaz „všechny události“. Rozbalí seznam dat a názvů, klepnutím se skočí.',
      ano: ['Dvě klepnutí kamkoli', 'Čtenář vidí celý průběh kauzy naráz, což osa dřív naznačovala', 'Listování zůstává pro ty, kdo čtou postupně'],
      ne: ['Seznam třiceti položek je sám dlouhý', 'Jedno ovládání navíc'],
      mer: merSkok('2'),
      uprav: () => {
        document.querySelector('.zalozky [data-p="chrono"]')?.click();
        const l = document.querySelector('.listovani');
        const obal = document.createElement('div');
        obal.className = 'nahled-prehled';
        obal.style.cssText = 'margin-top:14px;border-top:1px dashed var(--linka);padding-top:10px';
        const polozky = [...document.querySelectorAll('.udalosti-seznam > li')].map(li => {
          const d = li.querySelector('time')?.firstChild?.textContent?.trim() ?? '';
          const n = li.querySelector('h3')?.textContent?.trim() ?? '';
          return `<li style="display:flex;gap:10px;min-height:44px;align-items:center;border-bottom:1px solid var(--linka);font-size:14px"><span style="flex:none;width:84px;font:600 12px var(--f-mono);color:var(--meta)">${d}</span><span>${n}</span></li>`;
        });
        obal.innerHTML = `<div style="font:italic 14px var(--f-text);color:var(--modra);text-decoration:underline;min-height:44px;display:flex;align-items:center">skrýt přehled událostí (${polozky.length})</div><ol style="list-style:none;margin:0;padding:0">${polozky.join('')}</ol>`;
        l.after(obal);
        obal.scrollIntoView({ block: 'start' });
        document.querySelector('dialog#detail').scrollTop -= 250;
      },
      znacky: [{ sel: '.nahled-prehled', typ: 'dobre', text: 'Celý průběh naráz, klepnutím se skočí' }] },
    { k: 'C', nazev: 'Všechny události pod sebou', stitek: 'bez listování',
      myslenka: 'Žádné tlačítko: události jsou pod sebou jako článek a roluje se.',
      ano: ['Žádné ovládání, nejpřirozenější pohyb na telefonu', 'Dá se hledat očima'],
      ne: ['Chronologie Čapího hnízda má skoro 11 obrazovek', 'Jednotlivá událost ztratí váhu, splyne v dlouhém textu', 'Odkaz na konkrétní událost musí umět odrolovat'],
      mer: merSkok('0, roluje se'),
      css: `@media (max-width:760px){ html.js body .udalosti-seznam > li[hidden] { display:block; } html.js body .udalosti-seznam > li { padding-bottom:18px; margin-bottom:18px; border-bottom:1px solid var(--linka); }
        html.js body .m2-panel[data-p="chrono"] .listovani { display:none; } }`,
      znacky: [{ sel: '.udalosti-seznam > li:nth-child(2)', typ: 'presun', text: 'Další událost hned pod první' }] },
  ] },

  { id: 'start', nazev: 'Kterou událostí se začíná', otazka: 'Co čtenář uvidí, když záložku otevře?', doporuceni: 'A',
    cesta: '/kauzy/capi-hnizdo/', priprav: NA_CHRONOLOGII, varianty: [
    { k: 'A', nazev: 'Poslední událostí', stitek: 'dnešní stav · doporučuji',
      myslenka: 'Otevře se to nejčerstvější: kam kauza dospěla.',
      ano: ['Odpovídá na první otázku čtenáře — jak to dopadlo', 'Kdo se vrací, vidí hned, co je nového'],
      ne: ['Kdo kauzu nezná, začíná od konce a listuje pozpátku'],
      mer: `() => ({ 'první vidět': document.querySelector('.udalosti-seznam > li:not([hidden]) time small')?.textContent ?? '' })`,
      znacky: [{ sel: '.udalosti-seznam > li:not([hidden]) time', typ: 'dobre', text: 'Nejnovější: kam kauza dospěla' }] },
    { k: 'B', nazev: 'První událostí', stitek: 'od začátku',
      myslenka: 'Otevře se začátek a čte se popořadě.',
      ano: ['Přirozené pro toho, kdo kauzu čte poprvé'],
      ne: ['K dnešnímu stavu je to u Čapího hnízda 29 klepnutí', 'Nejdůležitější zpráva je nejdál'],
      mer: `() => ({ 'první vidět': document.querySelector('.udalosti-seznam > li:not([hidden]) time small')?.textContent ?? '' })`,
      uprav: () => {
        document.querySelector('.zalozky [data-p="chrono"]')?.click();
        const zpet = document.querySelector('.listovani [data-krok="-1"]');
        for (let i = 0; i < 60 && zpet && !zpet.disabled; i++) zpet.click();
      },
      znacky: [{ sel: '.udalosti-seznam > li:not([hidden]) time', typ: 'presun', text: 'Začíná se rokem 2007' }] },
    { k: 'C', nazev: 'Poslední, s odkazem na začátek', stitek: 'obojí',
      myslenka: 'Otevře se nejnovější, ale u pořadí je odkaz „od začátku“.',
      ano: ['Čerstvé hned, začátek na jedno klepnutí'],
      ne: ['Další drobné ovládání u každé události'],
      mer: `() => ({ 'první vidět': document.querySelector('.udalosti-seznam > li:not([hidden]) time small')?.firstChild?.textContent ?? '' })`,
      uprav: () => {
        document.querySelector('.zalozky [data-p="chrono"]')?.click();
        const s = document.querySelector('.udalosti-seznam > li:not([hidden]) time small');
        if (s) s.insertAdjacentHTML('beforeend', ' · <span class="nahled-zacatek" style="color:var(--modra);text-decoration:underline;font-style:italic">od začátku</span>');
      },
      znacky: [{ sel: '.nahled-zacatek', typ: 'dobre', text: 'Začátek na jedno klepnutí' }] },
  ] },

  { skupina: 'Hlavička detailu', popis: 'Nad textem kauzy stojí název, shrnutí a částky. Po zvětšení dotykových cílů na 44 px tu dva rozbalovací odkazy berou každý vlastní řádek.' },

  { id: 'castky', nazev: 'Rozbalení částek', otazka: 'Čím se otevírají popisy částek?', doporuceni: 'C',
    cesta: '/kauzy/capi-hnizdo/', mer: MER_HLAVICKA, varianty: [
    // Čísla „na 21 kauzách“ v textech jsou změřená zvlášť přes všechny kauzy s částkami,
    // tabulka pod snímkem je jen z Čapího hnízda.
    { k: 'A', nazev: 'Textový odkaz', stitek: 'dnešní stav',
      myslenka: '„K čemu částky jsou“ je slovy psaný odkaz v seznamu částek.',
      ano: ['Říká slovy, co se stane'],
      ne: ['Na řádek s částkami se vejde jen u 5 kauz z 21, jinde bere vlastních 44 px', 'Seznam částek má na 21 kauzách průměrně 77 px'],
      znacky: [{ sel: '.castky-vice', typ: 'spatne', text: 'Nevešel se na řádek, stojí 44 px' }] },
    { k: 'B', nazev: 'Šipka jako tlačítko', stitek: 'jen znak',
      myslenka: 'Místo slov čtvercové tlačítko se šipkou za poslední částkou; částky o stupeň menší.',
      ano: ['Na jeden řádek se vejde u 12 kauz z 21', 'Tlačítko vypadá jako tlačítko, je jasné, kam klepnout'],
      ne: ['Průměr 56 px — u dlouhých částek se tlačítko stejně zalomí pod ně', 'Šipka sama neříká, co otevírá', 'Částky se zmenší z 18 na 16 px', 'Bez zalamování by u jedné kauzy přeteklo o 7 px do strany — zkoušeno'],
      css: `@media (max-width:760px){ html.js body .m2-hlava .castky { gap:4px 10px; align-items:center; }
        html.js body .m2-hlava .castky strong { font-size:16px; }
        html.js body .m2-hlava .castky .castky-ovladani { margin-left:auto; }
        html.js body .m2-hlava .castky .castky-vice { font-size:0; width:44px; min-height:44px; justify-content:center; text-decoration:none; border:1px solid var(--linka); }
        html.js body .m2-hlava .castky .castky-vice::after { content:"▾"; font:400 20px/1 var(--f-text); color:var(--modra); } }`,
      znacky: [{ sel: '.castky-vice', typ: 'presun', text: 'Tlačítko se šipkou místo slov' }] },
    { k: 'C', nazev: 'Řádek částek je tlačítko', stitek: 'doporučuji',
      myslenka: 'Klepne se rovnou na částky. Že jdou rozbalit, naznačí malá šipka za nimi.',
      ano: ['Nejúspornější: průměr 49 px, na jeden řádek se vejde u 13 kauz z 21', 'Terč je celý řádek, ne úzké slovo', 'Částky zůstanou ve stejné velikosti'],
      ne: ['Když jsou dvě částky dlouhé, šipka se zalomí pod ně (tady: 50 px místo 44)', 'Že je řádek klepací, říká jen šipka — objevitelnost je slabší než u slov', 'Čísla zdrojů u částek jsou klepací až po rozbalení'],
      css: `@media (max-width:760px){ html.js body .m2-hlava .castky .castky-ovladani { display:none; }
        html.js body .m2-hlava .castky { min-height:44px; align-items:center; cursor:pointer; }
        html.js body .m2-hlava .castky::after { content:"▾"; margin-left:auto; font:400 18px/1 var(--f-text); color:var(--modra); } }`,
      znacky: [{ sel: '.castky', typ: 'dobre', text: 'Celý řádek je terč' }] },
  ] },

  { id: 'shrnuti', nazev: 'Shrnutí v hlavičce', otazka: 'Kolik ze shrnutí kauzy je vidět hned?', doporuceni: 'A',
    cesta: '/kauzy/capi-hnizdo/', mer: MER_HLAVICKA, varianty: [
    { k: 'A', nazev: 'Tři řádky a odkaz', stitek: 'dnešní stav · doporučuji',
      myslenka: 'Tři řádky shrnutí, třetí se vytrácí, pod ním „celé shrnutí“.',
      ano: ['Čtenář pozná, o co jde, a vejde se toho dost', 'Vyzkoušený kompromis'],
      ne: ['Odkaz „celé shrnutí“ bere vlastních 44 px'],
      znacky: [{ sel: '.perex-vice', typ: 'spatne', text: 'Odkaz na vlastním řádku, 44 px' }] },
    { k: 'B', nazev: 'Dva řádky a odkaz', stitek: 'úspornější',
      myslenka: 'O řádek míň, jinak stejné.',
      ano: ['Obsah začíná o 21 px výš'],
      ne: ['Druhý řádek se už vytrácí, takže čitelný zbyde prakticky jeden', 'Ani tři řádky u Čapího hnízda nedojdou na konec první věty; dva tím spíš'],
      css: `@media (max-width:760px){ body .m2-hlava .perex { max-height:3em; } }`,
      znacky: [{ sel: '.perex', typ: 'spatne', text: 'Čitelný zbyde jeden řádek' }] },
    { k: 'C', nazev: 'Celé shrnutí rovnou', stitek: 'bez rozbalování',
      myslenka: 'Shrnutí je vidět celé, odkaz odpadá.',
      ano: ['Nic se neschovává, jedno ovládání míň', 'Shrnutí je to nejdůležitější, co hlavička nese'],
      ne: ['U delšího shrnutí naroste obal nad obsahem o desítky pixelů', 'Hlavičky kauz budou různě vysoké'],
      css: `@media (max-width:760px){ body .m2-hlava .perex { max-height:none !important; overflow:visible; mask-image:none !important; -webkit-mask-image:none !important; } body .m2-hlava .perex-vice { display:none !important; } }`,
      znacky: [{ sel: '.perex', typ: 'dobre', text: 'Celé shrnutí, žádný odkaz' }] },
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
      const nahore = top > 34;
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

async function vyfotVariantu(prohlizec, dil, v) {
  const ctx = await prohlizec.newContext({ ...devices['Pixel 5'], viewport: TELEFON, reducedMotion: 'reduce', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(ADRESA + dil.cesta, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  if (dil.priprav) await page.evaluate(dil.priprav);
  if (v.css) await page.addStyleTag({ content: v.css });
  if (v.uprav) await page.evaluate(v.uprav);
  await page.waitForTimeout(400);
  const mer = v.mer ?? dil.mer;
  const cisla = mer ? await page.evaluate(fn(mer)) : {};
  if (v.znacky?.length) await page.evaluate(OZNAC, v.znacky);
  const soubor = `dil-${dil.id}-${v.k}.png`;
  const cil = dil.vyrez ? page.locator(dil.vyrez).first() : page;
  await cil.screenshot({ path: path.join(SLOZKA, soubor), animations: 'disabled' });
  await ctx.close();
  return { soubor, cisla };
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
      const { soubor, cisla } = await vyfotVariantu(prohlizec, d, v);
      console.log(`  ${d.id}/${v.k} ${v.nazev}: ${Object.entries(cisla).map(([k, h]) => `${k} ${h}`).join(' · ')}`);
      const mereni = Object.entries(cisla).map(([k, h]) => `<tr><th>${esc(k)}</th><td>${esc(h)}</td></tr>`).join('');
      sloupce.push(`<div class="sloupec" data-dil="${d.id}" data-v="${v.k}">
        <div class="sl-hlava"><span class="pismeno">${v.k}</span><span class="jmeno">${esc(v.nazev)}<span class="stitek${v.k === d.doporuceni ? ' dop' : ''}">${esc(v.stitek)}</span></span></div>
        <a class="nahled" href="${soubor}" target="_blank"><img src="${soubor}" alt="Varianta ${v.k}: ${esc(v.nazev)}" loading="lazy"></a>
        ${mereni ? `<table class="mereni"><caption>Změřeno</caption>${mereni}</table>` : ''}
        <p class="myslenka">${esc(v.myslenka)}</p>
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
      <li>Co která varianta stojí, je v <b>„Proč ne“</b>. Čísla pod snímkem jsou změřená na téhle kauze.</li>
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
