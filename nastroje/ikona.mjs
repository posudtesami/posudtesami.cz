// Ikony webu z jediného zdroje public/favicon.svg:
//   public/favicon.ico          16, 32 a 48 px (Seznam, Bing a starší prohlížeče se ptají právě na /favicon.ico)
//   public/apple-touch-icon.png 180 px (iPhone a iPad na plochu SVG nevezmou)
// Rastruje Chromium z Playwrightu, který už je v devDependencies, takže žádná nová závislost.
// Spuštění: npm run ikona. Výstup se commituje, nasazení nic negeneruje.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const ZDROJ = 'public/favicon.svg';
const VELIKOSTI_ICO = [16, 32, 48];
const VELIKOST_APPLE = 180;

const svg = readFileSync(ZDROJ, 'utf8');
const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const prohlizec = await chromium.launch();
const list = await prohlizec.newPage({ deviceScaleFactor: 1 });

/** Vykreslí SVG přímo v cílové velikosti (ne zmenšením velkého obrázku), aby malé ikony byly ostré. */
async function png(velikost) {
  await list.setViewportSize({ width: velikost, height: velikost });
  await list.setContent(`<!doctype html><style>*{margin:0}img{display:block}</style><img src="${dataUri}" width="${velikost}" height="${velikost}">`);
  await list.locator('img').evaluate((img) => img.decode());
  return list.screenshot({ clip: { x: 0, y: 0, width: velikost, height: velikost } });
}

/** Soubor ICO s vloženými PNG (formát podporují všechny prohlížeče od Windows Vista). */
function ico(obrazky) {
  const hlavicka = Buffer.alloc(6);
  hlavicka.writeUInt16LE(0, 0);              // rezervováno
  hlavicka.writeUInt16LE(1, 2);              // typ 1 = ikona
  hlavicka.writeUInt16LE(obrazky.length, 4);
  let posun = 6 + 16 * obrazky.length;
  const zaznamy = obrazky.map(({ velikost, data }) => {
    const z = Buffer.alloc(16);
    z.writeUInt8(velikost >= 256 ? 0 : velikost, 0);
    z.writeUInt8(velikost >= 256 ? 0 : velikost, 1);
    z.writeUInt8(0, 2);                      // bez palety
    z.writeUInt8(0, 3);
    z.writeUInt16LE(1, 4);                   // barevné roviny
    z.writeUInt16LE(32, 6);                  // bitů na pixel
    z.writeUInt32LE(data.length, 8);
    z.writeUInt32LE(posun, 12);
    posun += data.length;
    return z;
  });
  return Buffer.concat([hlavicka, ...zaznamy, ...obrazky.map((o) => o.data)]);
}

const obrazky = [];
for (const velikost of VELIKOSTI_ICO) obrazky.push({ velikost, data: await png(velikost) });
writeFileSync('public/favicon.ico', ico(obrazky));
writeFileSync('public/apple-touch-icon.png', await png(VELIKOST_APPLE));
await prohlizec.close();
console.log(`Hotovo: favicon.ico (${VELIKOSTI_ICO.join(', ')} px), apple-touch-icon.png (${VELIKOST_APPLE} px)`);
