import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/** Rozměry PNG z hlavičky IHDR. */
const rozmeryPng = (data: Buffer) => {
  expect(data.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { sirka: data.readUInt32BE(16), vyska: data.readUInt32BE(20) };
};

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

  it('apple-touch-icon.png má 180 × 180 px', () => {
    expect(rozmeryPng(readFileSync('public/apple-touch-icon.png'))).toEqual({ sirka: 180, vyska: 180 });
  });

  it('hlavička stránky nabízí SVG, ICO i ikonu pro iPhone', () => {
    const layout = readFileSync('src/layouts/Zaklad.astro', 'utf8');
    expect(layout).toContain('href="/favicon.svg"');
    expect(layout).toContain('href="/favicon.ico"');
    expect(layout).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
  });
});
