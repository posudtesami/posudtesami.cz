import { describe, it, expect } from 'vitest';
import { vytvorOznacovac, nevysvetleneZkratky, zkratkyVeVete, slovnicekHtml } from '../../src/lib/slovnicek';
import { POJMY, VYRAZY, ZKRATKY, OBECNE_ZNAME, NAZVY_VERZALKAMI } from '../../src/data/slovnicek';

const tl = (id: string, text: string) => `<button type="button" class="pojem" popovertarget="pojem-${id}">${text}</button>`;

describe('slovníček: data', () => {
  it('id jsou jedinečná a bezpečná pro HTML', () => {
    const ids = POJMY.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });
  it('každý vzor je platný výraz a neodpovídá prázdnému textu', () => {
    for (const p of POJMY) expect(new RegExp(`^(?:${p.vzor})$`, 'u').test(''), p.id).toBe(false);
  });
  it('výklad je krátký a končí tečkou', () => {
    for (const p of POJMY) {
      expect(p.vyklad.length, p.id).toBeLessThanOrEqual(240);
      expect(p.vyklad, p.id).toMatch(/\.$/);
    }
  });
  it('výklad výrazu nepoužívá zkratky, které by samy potřebovaly výklad', () => {
    for (const p of VYRAZY) expect(zkratkyVeVete(p.vyklad), p.id).toEqual([]);
  });
  it('zkratka není zároveň mezi známými ani mezi názvy', () => {
    const bez = new Set([...OBECNE_ZNAME, ...NAZVY_VERZALKAMI]);
    for (const z of ZKRATKY) for (const cast of z.heslo.split(' ')) expect(bez.has(cast), z.heslo).toBe(false);
  });
});

describe('označování pojmů v textu', () => {
  it('označí pojem tlačítkem, které otevírá jeho výklad', () => {
    expect(vytvorOznacovac().text('Soud ho pravomocně zprostil.', 'a'))
      .toBe(`Soud ho ${tl('pravomocne', 'pravomocně')} ${tl('zprosteni', 'zprostil')}.`);
  });
  it('ve skupině označí jen první výskyt, v další skupině znovu', () => {
    const o = vytvorOznacovac();
    expect(o.text('Rozsudek je pravomocný. Pravomocně skončila i druhá věc.', 'a'))
      .toBe(`Rozsudek je ${tl('pravomocne', 'pravomocný')}. Pravomocně skončila i druhá věc.`);
    expect(o.text('Další pravomocný rozsudek.', 'a')).toBe('Další pravomocný rozsudek.');
    expect(o.text('Další pravomocný rozsudek.', 'b')).toBe(`Další ${tl('pravomocne', 'pravomocný')} rozsudek.`);
  });
  it('pozná skloňování, víceslovné výrazy i velké písmeno na začátku věty', () => {
    const o = vytvorOznacovac();
    expect(o.text('Obžaloba viní firmu.', 'a')).toBe(`${tl('obzaloba', 'Obžaloba')} viní firmu.`);
    expect(o.text('Vložil ji do svěřenských fondů.', 'b')).toBe(`Vložil ji do ${tl('sverensky-fond', 'svěřenských fondů')}.`);
    expect(o.text('Státní zástupce se odvolal.', 'c')).toBe(`${tl('statni-zastupce', 'Státní zástupce')} se odvolal.`);
    expect(o.text('Rozhodnutí nabylo právní moci.', 'd')).toBe(`Rozhodnutí nabylo ${tl('pravomocne', 'právní moci')}.`);
  });
  it('z delšího spojení označí to delší', () => {
    expect(vytvorOznacovac().text('Dozorový státní zástupce stíhání zrušil.', 'a'))
      .toBe(`${tl('statni-zastupce', 'Dozorový státní zástupce')} ${tl('trestni-stihani', 'stíhání')} zrušil.`);
  });
  it('zkratku označí, ale ne uvnitř slova a ne malými písmeny', () => {
    const o = vytvorOznacovac();
    expect(o.text('Pokutu uložil ÚOHS.', 'a')).toBe(`Pokutu uložil ${tl('z-uohs', 'ÚOHS')}.`);
    expect(o.text('ÚSTAV a ropa a Europol.', 'b')).toBe('ÚSTAV a ropa a Europol.');
  });
  it('zkratku ve spisové značce nechá být', () => {
    const o = vytvorOznacovac();
    expect(o.text('Nález sp. zn. IV. ÚS 2980/22 a rozhodnutí 2023/NSS/3.', 'a')).toBe('Nález sp. zn. IV. ÚS 2980/22 a rozhodnutí 2023/NSS/3.');
    expect(o.text('Rozhodl ÚS.', 'a')).toBe(`Rozhodl ${tl('z-us', 'ÚS')}.`);
  });
  it('generální ředitelství Komise označí i s názvem', () => {
    expect(vytvorOznacovac().text('Audit (DG REGIO a DG EMPL) skončil.', 'a')).toBe(`Audit (${tl('z-dg', 'DG REGIO')} a DG EMPL) skončil.`);
  });
  it('běžná slova mimo právní spojení neoznačuje', () => {
    const o = vytvorOznacovac();
    expect(o.text('Sněmovna jednání odložila na zítřek.', 'a')).toBe('Sněmovna jednání odložila na zítřek.');
    expect(o.text('Výroba se zastavila. Babiš obvinil opozici ze lži.', 'a')).toBe('Výroba se zastavila. Babiš obvinil opozici ze lži.');
    expect(o.text('Vláda přijala usnesení.', 'a')).toBe('Vláda přijala usnesení.');
  });
  it('odložení a zastavení označí jen ve spojení s věcí nebo řízením', () => {
    const o = vytvorOznacovac();
    expect(o.text('Policie věc v srpnu 2018 odložila.', 'a')).toBe(`Policie věc v srpnu 2018 ${tl('odlozeni', 'odložila')}.`);
    expect(o.text('Úřad řízení v roce 2024 zastavil.', 'b')).toBe(`Úřad řízení v roce 2024 ${tl('zastaveni', 'zastavil')}.`);
    expect(o.text('Soud zastavil stíhání firmy.', 'c')).toBe(`Soud ${tl('zastaveni', 'zastavil stíhání')} firmy.`);
    // spojení se nepřenáší přes hranici věty
    expect(o.text('Policie prověřovala věc. Sněmovna schůzi odložila.', 'd')).toBe('Policie prověřovala věc. Sněmovna schůzi odložila.');
  });
  it('imunitu v cizině nevykládá jako poslaneckou', () => {
    const o = vytvorOznacovac();
    expect(o.text('Jako premiér má podle Seznam Zpráv ve Francii imunitu.', 'a')).toBe('Jako premiér má podle Seznam Zpráv ve Francii imunitu.');
    expect(o.text('Chrání ho ve Francii mezinárodní imunita.', 'b')).toBe('Chrání ho ve Francii mezinárodní imunita.');
    expect(o.text('Byl ve Francii. Po volbách získal imunitu.', 'c')).toBe(`Byl ve Francii. Po volbách získal ${tl('imunita', 'imunitu')}.`);
    expect(o.text('Brání mu poslanecká imunita.', 'd')).toBe(`Brání mu poslanecká ${tl('imunita', 'imunita')}.`);
  });
  it('holding v názvu firmy neoznačí, obecné slovo ano', () => {
    const o = vytvorOznacovac();
    for (const [i, t] of ['Vlastník AGROFERT HOLDING mlčí.', 'Firma Boyne Holding L.L.C. vznikla.', 'Patří skupině Hartenberg Holding.', 'Podnik Agrofert holdingu.'].entries())
      expect(o.text(t, `n${i}`), t).toBe(t);
    expect(o.text('Firmy z holdingu dotaci vrátily.', 'a')).toBe(`Firmy z ${tl('holding', 'holdingu')} dotaci vrátily.`);
    expect(o.text('Firmy holdingu braly podpory.', 'b')).toBe(`Firmy ${tl('holding', 'holdingu')} braly podpory.`);
    expect(o.text('Řekl to. Holding mlčí.', 'c')).toBe(`Řekl to. ${tl('holding', 'Holding')} mlčí.`);
    expect(o.text('Firma Hartenberg Holding a holding Agrofert.', 'd')).toBe(`Firma Hartenberg Holding a ${tl('holding', 'holding')} Agrofert.`);
  });
  it('text escapuje', () => {
    expect(vytvorOznacovac().text('<b> & „konkurz“ "x"', 'a')).toBe(`&lt;b&gt; &amp; „${tl('konkurz', 'konkurz')}“ &quot;x&quot;`);
  });
  it('v hotovém HTML mění jen text mezi značkami a nesahá do odkazů', () => {
    const o = vytvorOznacovac();
    const html = '<strong>Holding</strong> a <a href="/kauzy/holding/" title="holding">holding</a> a konkurz.<span class="chipy"><a class="pozn" href="#zdroj-1">1</a></span>';
    expect(o.html(html, 'a')).toBe(`<strong>${tl('holding', 'Holding')}</strong> a <a href="/kauzy/holding/" title="holding">holding</a> a ${tl('konkurz', 'konkurz')}.<span class="chipy"><a class="pozn" href="#zdroj-1">1</a></span>`);
  });
  it('pouzite() vrátí označené pojmy jednou a v pořadí slovníčku', () => {
    const o = vytvorOznacovac();
    o.text('Konkurz a holding.', 'a');
    o.text('Holding a ÚOHS.', 'b');
    expect(o.pouzite().map(p => p.id)).toEqual(['holding', 'konkurz', 'z-uohs']);
    expect(vytvorOznacovac().pouzite()).toEqual([]);
  });
});

describe('zkratky bez výkladu', () => {
  it('zkratku ze slovníčku, obecně známou ani vlastní jméno nehlásí', () => {
    expect(nevysvetleneZkratky('ÚOHS, EU, DPH a firma FAU z holdingu; audit DG AGRI.')).toEqual([]);
  });
  it('neznámou zkratku nahlásí jednou', () => {
    expect(nevysvetleneZkratky('Rozhodl XYÚ. Proti XYÚ nikdo neprotestoval, ani QWE.')).toEqual(['XYÚ', 'QWE']);
  });
  it('zkratku rozepsanou v textu závorkou nehlásí', () => {
    expect(nevysvetleneZkratky('Fiktivní úřad pro dotace (FÚD) rozhodl. FÚD pak mlčel.')).toEqual([]);
  });
  it('římské číslice, spisové značky a označení s číslem nehlásí', () => {
    expect(nevysvetleneZkratky('Senát III a IV, čj. 2023/NIK/POK/3/19, ABC-24554/2026, režim QQ.51501, bod DX 13, tisk XZ 698/26.')).toEqual([]);
  });
});

describe('zkratky ve větě obyčejnou řečí', () => {
  it('hlásí i zkratku, kterou slovníček zná: ve větě „O co jde“ se má rozepsat', () => {
    expect(zkratkyVeVete('Pokutu uložil ÚOHS a potvrdil ji NSS.')).toEqual(['ÚOHS', 'NSS']);
  });
  it('obecně známé zkratky a vlastní jména nechává', () => {
    expect(zkratkyVeVete('Firma FAU dlužila na DPH, peníze šly z EU a hnutí ANO mlčelo.')).toEqual([]);
  });
});

describe('slovníček pro Metodiku', () => {
  it('vypíše výrazy a zkratky ve dvou abecedních seznamech s kotvami', () => {
    const html = slovnicekHtml();
    expect(html.match(/<dl class="slovnicek/g)).toHaveLength(2);
    expect(html.match(/<dt /g)).toHaveLength(POJMY.length);
    expect(html).toContain('<dt id="pojem-pravomocne">pravomocné a nepravomocné rozhodnutí</dt>');
    expect(html).toContain('<dt id="pojem-z-uohs">ÚOHS</dt><dd>Úřad pro ochranu hospodářské soutěže.');
    // abecedně česky: „dovolání“ před „exekuce“, „ČTK“ za „CONT“
    expect(html.indexOf('pojem-dovolani"')).toBeLessThan(html.indexOf('pojem-exekuce"'));
    expect(html.indexOf('pojem-z-cont"')).toBeLessThan(html.indexOf('pojem-z-ctk"'));
  });
});
