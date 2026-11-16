import { describe, it, expect } from 'vitest';
import { metodika } from '../../src/data/metodika';
import { POJMY } from '../../src/data/slovnicek';

const sekce = (sPravidly: boolean, sOblastmi: boolean, id: string) => metodika(sPravidly, sOblastmi).sekce.find(s => s.id === id);
const ids = (sPravidly: boolean, sOblastmi: boolean) => metodika(sPravidly, sOblastmi).sekce.map(s => s.id);

describe('Metodika: co slibuje, to na webu je', () => {
  it('oddíl Oblasti je vidět, jen když web pohled Oblasti má', () => {
    expect(ids(true, true)).toContain('oblasti');
    expect(ids(true, false)).not.toContain('oblasti');
    expect(ids(true, false)).toContain('pravidla');
  });
  it('bez pravidel není oddíl Zákony a nařízení ani Oblasti', () => {
    expect(ids(false, false)).toEqual(['kriteria', 'zdroje', 'jazyk', 'strana', 'postup', 'opravy', 'stavy', 'pojmy']);
  });
  it('věta „Co by to znamenalo pro vás“ se neslibuje, dokud ji změny nemají', () => {
    const text = metodika(true, false).sekce.map(s => s.html + s.shrnuti).join(' ');
    expect(text).not.toMatch(/Co by to znamenalo pro vás/);
    expect(metodika(true, true).sekce.map(s => s.html).join(' ')).toMatch(/Co by to znamenalo pro vás/);
  });
});

describe('Metodika: srozumitelnost', () => {
  it('oddíl Jak píšeme popisuje větu „O co jde“ a vysvětlivky v textu', () => {
    const html = sekce(true, true, 'jazyk')!.html;
    expect(html).toContain('id="srozumitelnost"');
    expect(html).toMatch(/O co jde/);
    expect(html).toMatch(/bez zkratek a právních pojmů/);
    expect(html).toContain('href="#pojmy"');
  });
  it('slovníček stavů má jedenáct hesel', () => {
    expect(sekce(true, true, 'stavy')!.html.match(/<dt>/g)).toHaveLength(11);
  });
  it('slovníček pojmů a zkratek obsahuje všechna hesla s kotvou', () => {
    const html = sekce(false, false, 'pojmy')!.html;
    expect(html.match(/<dt id="pojem-/g)).toHaveLength(POJMY.length);
    expect(html).toContain('id="pojem-sverensky-fond"');
  });
});
