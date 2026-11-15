---
name: mobilni-design
description: Specialista na mobilní zobrazení posudtesami.cz. Použij vždy, když se mění vzhled, rozvržení nebo hustota čehokoli, co čtenář uvidí na telefonu — nová obrazovka, úprava hlavičky, filtrů, záložek, seznamu, nebo když se řeší „je toho tam moc", „na mobilu je to nepoužitelné", velikost písma, dotykové cíle a posouvání. Mobil je hlavní cílová platforma tohoto webu, ne doplněk k desktopu.
---

# Mobilní zobrazení posudtesami.cz

Web je archiv kauz pro veřejnost. **Většina čtenářů ho otevře na telefonu.** Desktop je v pořádku
a nemá se měnit; práce i posuzování se vede na **390 × 844** (hlavní) a **320 × 568** (hraniční).

## Tři pravidla, která tady platí nade vším

**1. Nic se nemaže, jen se sbaluje nebo přesouvá.** Webu stojí důvěra na tom, že každé tvrzení má
zdroj a každé číslo popis. Hustota se řeší tím, že se věc schová za rozbalení nebo přesune tam, kam
patří — ne tím, že zmizí. Když návrh něco odstraňuje, je špatně.

**2. Měř, nehádej.** „Vypadá to líp" není argument. Každý návrh se obhajuje číslem: kolik pixelů
zabere obal, než začne obsah; kolik obrazovek je stránka vysoká; kolik se jich vejde bez posunutí.
Nástroje jsou níž, používej je.

**3. Varianty předkládej k výběru, nerozhoduj za uživatele.** Dej 3–5 očíslovaných variant, které se
sčítají (B obsahuje A, C obsahuje B), u každé číslo úspory a cenu, kterou to stojí. Doporuč jednu
a řekni proč. **Pak se zastav a počkej na výběr.** Teprve pak se staví.

## Čísla, která platí

| věc | hodnota | odkud |
|---|---|---|
| dotykový cíl — povinné minimum | **24 × 24 px** (WCAG 2.5.8, AA) | [W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) |
| dotykový cíl — pohodlné | **44 × 44 px** (WCAG 2.5.5, AAA; shodně Apple HIG 44 pt, Material 48 dp) | tamtéž |
| rozestup, když cíl nejde zvětšit | kružnice **24 px** kolem středu nesmí zasáhnout sousední cíl | tamtéž |
| výjimka: odkaz uvnitř věty | pravidlo neplatí (nelze předvídat zalomení) | tamtéž |
| **pole formuláře** | **nejméně 16 px**, jinak Safari na iOS při klepnutí přiblíží a nevrátí zpět | [CSS-Tricks](https://css-tricks.com/?p=339455), [dev.to](https://dev.to/danburzo/css-micro-tip-make-mobile-safari-not-have-to-zoom-into-inputs-1fc1) |
| běžný text | 16 px doporučeno, **pod 14 px nejdeme** | [w3-lab](https://w3-lab.com/website-font-size-guidelines/) |
| výška řádku běžného textu | 1,5 (i WCAG 1.4.12) | tamtéž |
| délka řádku | 40–60 znaků na telefonu | [digitalthriveai](https://www.digitalthriveai.com/en-ca/resources/web-design/balancing-line-length-font-size-responsive-web-design/) |
| výška na celý displej | **`dvh` / `svh`, nikdy `vh`** — `vh` počítá i lištu prohlížeče a obsah se ořízne | [web.dev](https://web.dev/blog/viewport-units) |
| rychlost (75. percentil) | LCP ≤ 2,5 s · INP ≤ 200 ms · CLS ≤ 0,1 | [Web Almanac 2025](https://almanac.httparchive.org/en/2025/performance) |

**Nikdy nevypínej přibližování** (`maximum-scale=1`, `user-scalable=no`). Je to nejčastější „oprava"
iOS zoomu a zároveň vážná chyba přístupnosti — správné řešení je písmo 16 px na samotném poli.

## Co výzkum říká o skrývání obsahu

- **Vodorovně posuvné záložky jsou riziko, ne zločin.** Baymard naměřil, že **27 % lidí skrytý obsah
  přehlédne**, a na úzkém displeji bývá část záložek mimo obraz. Když se dá vejít bez posouvání
  (kratší popisky), je to vždycky lepší. Když ne, musí být vidět, že lišta pokračuje — tenhle web na
  to má třídy `mizi-vlevo` / `mizi-vpravo`. ([Baymard](https://baymard.com/research-articles/avoid-horizontal-tabs), [NN/g](https://www.nngroup.com/articles/tabs-used-right/))
- **Sbalený obsah dostane míň pozornosti než viditelný**, i když ho lidé umí rozbalit. Proto se
  sbaluje **doplněk**, ne to podstatné. Shrnutí kauzy, stav a zdroje jsou podstatné; popisy částek
  a jmenné seznamy jsou doplněk. ([NN/g](https://www.nngroup.com/articles/accordions-complex-content/))
- **Dlouhé rolování není samo o sobě vada** — lidé rolují, když je obsah členěný a dá se přelétnout
  očima. Vada je, když na malém displeji nedojdou na konec kvůli délce bez struktury. ([NN/g](https://www.nngroup.com/videos/accordions-on-mobile/))
- **Palcová zóna** (Hoober, 1 333 lidí): 49 % drží telefon jednou rukou, 75 % ovládá palcem, z toho
  67 % pravým. Spodní část displeje se ovládá nejsnáz, horní rohy nejhůř. Ber to jako vodítko pro
  pořadí, ne jako zákon — studie je z roku 2013. ([A List Apart](http://alistapart.com/article/how-we-hold-our-gadgets))

## Nástroje v tomhle repozitáři

```
node .claude/skills/mobilni-design/nastroje/prehled.mjs      # změří všechny stránky na telefonu
node .claude/skills/mobilni-design/nastroje/varianty.mjs     # stupňované varianty jedné obrazovky
node .claude/skills/mobilni-design/nastroje/vyber.mjs        # návrhy před/po se zaškrtávátky
npm run e2e:mobil                                            # testy + snímek každé stránky
```

Oba skripty si samy postaví web ze **skutečného obsahu** (`obsah/`), spustí server a zase ho zavřou.

`prehled.mjs` vypíše tabulku: u každé stránky kolik pixelů zabere obal nad obsahem, jak je stránka
vysoká v obrazovkách, jestli se něco posouvá do strany, kolik je cílů pod 44 px a jaké je nejmenší
viditelné písmo. **Tím každá práce začíná.**

`varianty.mjs` je šablona pro **jednu obrazovku a stupňované varianty** (A, B = A + něco, C = B + něco).
Nasadí je na skutečnou stránku, vyfotí, co je vidět bez posunutí, a vyrobí `navrhy/index.html`.

`vyber.mjs` je šablona pro **několik nezávislých návrhů naráz**. U každého vyfotí stav před a po
vedle sebe, změří, co se změnilo, a vyrobí `navrhy/vyber.html` se zaškrtávátky a soupisem
k zkopírování. Tohle použij, když se vybírá z backlogu.

**Čísla v obou skriptech ber vážně i proti sobě.** Při psaní návrhů na listopadový backlog vyšlo,
že dva z pěti nedělaly, co slibovaly: „strop na dvě částky" ušetřil 32 px místo slibovaných ~95
(čtyři částky se lámou do dvou řádků, ne čtyř) a „sbalit popisy částek" snížil oříznutí na nízkém
okně jen ze 105 na 83 px. Oboje se poznalo až z naměřeného sloupce „po". Nikdy nepředkládej návrh,
jehož „po" jsi neviděl.

**Testy:** projekt `mobil` v `playwright.config.ts` je emulovaný telefon s dotykem (Pixel 5), ne jen
úzké okno počítače. Sada je v `tests/e2e/mobil.spec.ts`, snímky v `snimky/mobil/index.html`.

## Pravidla tohoto webu (dodržuj, nevymýšlej vlastní)

- **Zlom je `760 px`**, jednotně. Mobil `@media (max-width: 760px)`, počítač `@media (min-width: 761px)`.
- **Mobilní úpravy patří do `src/styles/upravy.css`**, což je vrstva přepisů nad `hlavni.css`
  a `stranky.css`. Do základních souborů nesahej, pokud to nejde jinak.
- **Bez JavaScriptu se nic neschovává.** Sbalování se zapíná třídou `html.js` (nastavuje ji
  `Zaklad.astro`). Kdo nemá skripty, uvidí všechno rozepsané — rozbalovat by neměl čím.
- **Tlačítko rozbalení se ukazuje podle stylů, ne podle šířky okna.** Vzor: `zmerPerex()`,
  `zmerCastky()` v `src/scripts/detail.ts` se ptají `getComputedStyle`, jestli se obsah opravdu
  sbalil. Rozhodnutí „kdy se sbaluje" tak zůstává v CSS na jednom místě.
- **Dlouhý a krátký tvar popisku** se dělá dvěma `<span>`y a přepíná se v CSS (`menu-dlouhy`
  / `menu-kratky` v hlavičce, `zal-dlouhy` / `zal-kratky` u záložek).
  **Krátký tvar musí být skutečný text prvku, ne `aria-label` navíc** — jinak se rozejde, co čtenář
  vidí, s tím, co řekne čtečka a co přijme hlasové ovládání. Testy proto vybírají podle jména prvku
  (`popiskyZalozek()` v `tests/e2e/pomocne.ts`), ne podle `textContent`, který nese oba tvary.
- **Dotykový cíl se zvětšuje schránkou, ne písmem**: u řádkových prvků `padding-block`, který roste
  do volného místa, jinde `min-height`. Rozvržení se tím nemění.
- **Na mobilu se stránka posouvá dolů, nikdy do strany.** Hlídá to `overBezPosouvaniDoStrany()`
  a `prvkyPresahujiciSirku()`.

## Postup

1. **Změř stav** — `prehled.mjs`. Bez čísel se nezačíná.
2. **Podívej se na nejhorší případ**, ne na průměrný. Fixtury jsou lehčí než skutečnost (viz níž).
3. **Napiš varianty** do `varianty.mjs`, vyrendruj, předlož tabulku s čísly a doporučením.
4. **Zastav se a počkej na výběr.**
5. **Postav to pořádně** — ne tím CSS z náhledu. Náhled jen schovává; hotová věc musí jít rozbalit,
   fungovat bez JavaScriptu a mít dotykové cíle.
6. **Hlídací test** do `tests/e2e/mobil.spec.ts`, aby se to za půl roku nevrátilo.
7. **Celá sada** — `npx playwright test` i `npm test`. Testy, které čekaly staré chování, se
   upravují, ne obcházejí.
8. **Přeměř** a výsledek nahlas porovnej s tím, co varianta slibovala. Když se liší, řekni proč.

## Co je známo a čeká

| věc | stav |
|---|---|
| vyhledávací pole má 15 px → Safari na iOS při klepnutí přiblíží a nevrátí zpět | **ověřeno, neopraveno** — nabídnuto, uživatel zatím nevybral |
| text 12–13 px na pravidlech a hlasování | na hraně, jinde 14–15 px |

Hotovo (ať se k tomu nevrací): hlavička detailu 518 → 294 px, úvod 417 → 323 px,
hlasování 5,7 → 1,1 obrazovky, dotykové cíle na **44 px**, strop na dvě částky v hlavičce,
u hlasování přepíná nadpis, a na nízkém okně počítače se modal posouvá dolů místo ořezávání.
Nejdelší stránka webu je 1,3 obrazovky a nic se nikde neposouvá do strany.

## Časté chyby

| ❌ | ✅ |
|---|---|
| Posoudit mobil na úzkém okně počítače | Emulovaný telefon s dotykem (projekt `mobil`) — jinak drží `:hover` stavy |
| Testovat jen na fixturách | Fixtury mají max. 3 události a částky jen `gama-offshore`; skutečné kauzy mají desítky událostí. Posuzuj na `obsah/` |
| Schovat čipy témat, aby se ušetřilo místo | Je to nejpoužívanější filtr. Měřeno: ušetří 20 px a stojí dohledatelnost |
| Dát krátký popisek a dlouhý `aria-label` | Rozejde se vidět/slyšet; hlasové ovládání přestane fungovat |
| Zmenšit písmo, aby se to vešlo | Pod 14 px nejdeme, u polí pod 16 px vůbec |
| `100vh` pro výšku displeje | `100dvh` nebo `100svh` |
| Spoléhat, že `vypadá to dobře` | Změř a ukaž číslo |
