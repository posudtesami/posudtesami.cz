import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** Rozměry PNG z hlavičky IHDR. */
const rozmeryPng = (data: Buffer) => {
  expect(data.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { sirka: data.readUInt32BE(16), vyska: data.readUInt32BE(20) };
};

/** Průhlednost levého horního pixelu PNG (0 = průhledný, 255 = plný).
 *  První pixel prvního řádku je po kterémkoli filtru PNG uložený beze změny, stačí ho přečíst. */
const pruhlednostRohu = (data: Buffer) => {
  const typBarev = data.readUInt8(25);
  if (typBarev !== 6) return 255; // bez alfa kanálu je všechno plné
  const idat: Buffer[] = [];
  for (let z = 8; z < data.length; ) {
    const delka = data.readUInt32BE(z);
    if (data.subarray(z + 4, z + 8).toString('latin1') === 'IDAT') idat.push(data.subarray(z + 8, z + 8 + delka));
    z += 12 + delka;
  }
  return inflateSync(Buffer.concat(idat))[4];
};

/** Obrázky uvnitř favicon.ico. */
const obrazkyIco = (ico: Buffer) =>
  Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
    const z = 6 + 16 * i;
    return ico.subarray(ico.readUInt32LE(z + 12), ico.readUInt32LE(z + 12) + ico.readUInt32LE(z + 8));
  });

describe('ikony webu', () => {
  it('favicon.ico obsahuje PNG 16, 32 a 48 px', () => {
    const ico = readFileSync('public/favicon.ico');
    expect(ico.readUInt16LE(2)).toBe(1);
    const pocet = ico.readUInt16LE(4);
    const velikosti: number[] = [];
    for (let i = 0; i < pocet; i++) {
      const z = 6 + 16 * i;
      const delka = ico.readUInt32LE(z + 8);
      const posun = ico.readUInt32LE(z + 12);
      const { sirka, vyska } = rozmeryPng(ico.subarray(posun, posun + delka));
      expect(vyska).toBe(sirka);
      expect(ico.readUInt8(z)).toBe(sirka);
      velikosti.push(sirka);
    }
    expect(velikosti).toEqual([16, 32, 48]);
  });

  it('favicon.ico je kulatá: rohy jsou průhledné', () => {
    for (const png of obrazkyIco(readFileSync('public/favicon.ico'))) expect(pruhlednostRohu(png)).toBe(0);
  });

  it('apple-touch-icon.png má plný čtverec (iOS by průhledné rohy vyplnil černou)', () => {
    expect(pruhlednostRohu(readFileSync('public/apple-touch-icon.png'))).toBe(255);
  });

  it('apple-touch-icon.png má 180 × 180 px', () => {
    expect(rozmeryPng(readFileSync('public/apple-touch-icon.png'))).toEqual({ sirka: 180, vyska: 180 });
  });

  it('hlavička stránky nabízí SVG, ICO i ikonu pro iPhone', () => {
    const layout = readFileSync('src/layouts/Zaklad.astro', 'utf8');
    expect(layout).toContain('href={`/favicon.svg?v=${verzeIkony}`}');
    expect(layout).toContain('href={`/favicon.ico?v=${verzeIkony}`}');
    expect(layout).toContain('rel="apple-touch-icon" href={`/apple-touch-icon.png?v=${verzeIkony}`}');
  });
});
