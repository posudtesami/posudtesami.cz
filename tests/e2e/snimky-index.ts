/** globalTeardown: z uložených snímků vyrobí snimky/mobil/index.html — jedna stránka,
 *  na které se dá celé mobilní zobrazení projít očima. Běží i když testy spadnou. */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { KOREN_SNIMKU } from './snimky';

const escape = (s: string) => s.replace(/[&<>"]/g, z => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[z]!));

export default async function vyrobIndex() {
  let slozky: string[];
  try {
    slozky = (await readdir(KOREN_SNIMKU, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
  } catch {
    return; // snímky se v tomhle běhu nepořizovaly
  }

  const sekce: string[] = [];
  let celkem = 0;
  for (const slozka of slozky) {
    const cesta = path.join(KOREN_SNIMKU, slozka);
    const obrazky = (await readdir(cesta)).filter(f => f.endsWith('.png')).sort();
    if (!obrazky.length) continue;
    celkem += obrazky.length;
    const sirka = Number(slozka.split('x')[0]) || 390;
    const karty = await Promise.all(obrazky.map(async f => {
      const nazev = f.replace(/\.png$/, '');
      const popis = await readFile(path.join(cesta, `${nazev}.txt`), 'utf8').catch(() => nazev);
      const kdy = await stat(path.join(cesta, f)).then(s => s.mtime.toLocaleString('cs-CZ')).catch(() => '');
      return `<figure><a href="${slozka}/${f}" target="_blank"><img src="${slozka}/${f}" alt="${escape(popis)}" loading="lazy" style="width:${sirka}px"></a>
      <figcaption><strong>${escape(popis)}</strong><span>${escape(nazev)} · ${escape(kdy)}</span></figcaption></figure>`;
    }));
    sekce.push(`<h2>${escape(slozka)} px <small>${obrazky.length} snímků</small></h2><div class="mrizka">${karty.join('\n')}</div>`);
  }

  const html = `<!doctype html><html lang="cs"><meta charset="utf-8">
<title>Mobilní zobrazení — snímky k vizuální kontrole</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 24px; font: 15px/1.5 system-ui, sans-serif; background: #f5f5f8; color: #16153a; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .kdy { color: #5b5a7a; margin: 0 0 28px; }
  h2 { margin: 32px 0 12px; font-size: 17px; }
  h2 small { font-weight: 400; color: #5b5a7a; }
  .mrizka { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
  figure { margin: 0; background: #fff; border: 1px solid #d3d3e2; border-radius: 8px; overflow: hidden; }
  img { display: block; height: auto; border-bottom: 1px solid #d3d3e2; }
  figcaption { padding: 8px 10px; display: grid; gap: 2px; font-size: 13px; }
  figcaption span { color: #5b5a7a; font-size: 12px; }
</style>
<h1>Mobilní zobrazení — ${celkem} snímků</h1>
<p class="kdy">Vytvořeno ${new Date().toLocaleString('cs-CZ')} příkazem <code>npm run e2e:mobil</code>. Klepnutím na snímek se otevře v plné velikosti.</p>
${sekce.join('\n')}
</html>`;

  await writeFile(path.join(KOREN_SNIMKU, 'index.html'), html, 'utf8');
  console.log(`\nSnímky mobilního zobrazení: ${celkem} ks, přehled v ${path.join(KOREN_SNIMKU, 'index.html')}`);
}
