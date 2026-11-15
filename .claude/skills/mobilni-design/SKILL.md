---
name: mobilni-design
description: Specialista na mobilní zobrazení posudtesami.cz. Použij vždy, když se mění vzhled, rozvržení nebo hustota čehokoli, co čtenář uvidí na telefonu — nová obrazovka, úprava hlavičky, filtrů, záložek, seznamu, nebo když se řeší „je toho tam moc", „na mobilu je to nepoužitelné", velikost písma, dotykové cíle a posouvání. Mobil je hlavní cílová platforma tohoto webu, ne doplněk k desktopu.
---

# Mobilní zobrazení posudtesami.cz

Web je archiv kauz pro veřejnost. **Většina čtenářů ho otevře na telefonu.** Desktop je v pořádku
a nemá se měnit; práce i posuzování se vede na **390 × 844** (hlavní) a **320 × 568** (hraniční).

## Pravidla, která tady platí nade vším

**1. Nic se nemaže, jen se sbaluje nebo přesouvá.** Webu stojí důvěra na tom, že každé tvrzení má
zdroj a každé číslo popis. Hustota se řeší tím, že se věc schová za rozbalení nebo přesune tam, kam
patří — ne tím, že zmizí. Když návrh něco odstraňuje, je špatně.

**2. Měř, nehádej.** „Vypadá to líp" není argument. Každý návrh se obhajuje číslem: kolik pixelů
zabere obal, než začne obsah; kolik obrazovek je stránka vysoká; kolik se jich vejde bez posunutí.
Nástroje jsou níž, používej je.

**3. Varianty předkládej k výběru, nerozhoduj za uživatele.** Rozhodnutí rozlož na **díly** — každý díl
je jedna otázka („Kde stojí listování?“) — a u každého dej vedle sebe varianty A/B/C se snímkem,
změřenými čísly a seznamy „Proč ano“ / „Proč ne“. Jednu označ „doporučuji“ a řekni proč.
**Pak se zastav a počkej na výběr.** Teprve pak se staví. Formát je převzatý z Akcionu
(`docs/design/modely-vedle-marka-atomy.html`) a dělá ho `nastroje/dily.mjs`.
**Variantu ukazuj na víc obrazovkách pod sebou** (`pohledy` v nastavení dílu): na dvou různých
stránkách a na nejužším displeji. Na jedné obrazovce vyjde skoro cokoli — krátké popisky záložek
zákona vypadaly na papíře jako hotová věc, dokud je druhý pohled neukázal uříznuté i u pěti záložek.

**4. Nepředkládej variantu, jejíž snímek a číslo jsi neviděl.** Náhled je CSS nasazené na živou
stránku a rád udělá něco jiného, než si myslíš. Za jediný den to chytilo šest návrhů:
rozprostřené body osy měly terč 11 px (hůř než předtím), rozšířená osa nechala 22 bodů přes sebe,
strop na částky ušetřil 32 px místo slibovaných 95, sbalení popisů nespravilo nízké okno,
tlačítko „na řádku s částkami“ v náhledu jen zmizelo, a šipka s `nowrap` přetekla u jedné kauzy
o 7 px do strany. Měř na **všech** kauzách, ne na té jedné, na které to vyšlo.

**5. Zvolenou variantu po postavení změř znovu — náhled není stavba.** Hotová věc žije mezi
staršími pravidly, která v náhledu nevadila. Při zavádění vybraných dílů 15. 11. to byly dvě
tiché chyby: `.listovani button { max-width: 48% }` z `hlavni.css` zúžilo položky nového přehledu
tak, že se názvy lámaly do čtyř řádků, a seznam vložený jako položka pružné lišty
(`flex: 1 0 100%` + záporné okraje) vytlačil na 320 px listovací tlačítko 2 px mimo obraz. Obojí
se poznalo až změřením v hotovém buildu, ne z náhledu. Při zavádění řádu ovládání pak zkratka
`font: 600 14px/1.4` změnila výšku řádku a posunula na **počítači** dva odkazy o 1–3 px, a pravidlo
`body .f-upresnit` prohrálo s `.filtry button` z jiného souboru (stejná váha, rozhoduje pořadí
v balíku, které není zaručené). **U pravidel se stejnou vahou se na pořadí souborů nespoléhej —
přidej selektoru rodiče.**

## Řád ovládání — jak mají prvky vypadat, aby držely pohromadě

Vznikl 15. 11. z rozboru, který si vyžádal uživatel („nepřijde ti to přepálené, layout nemá jasná
pravidla?“). Měl pravdu: web měl **šest různých tvarů pro jednu a tutéž akci** „je toho víc, klepni
sem“ (kurzíva podtržená · 600 podtržená · 700 podtržená · 500 s rámečkem · mono s rámečkem ·
neviditelný popisek), 11 velikostí písma a 16 hodnot mezer. Každá změna byla změřená a obhájená —
ale vždycky jen sama proti sobě, ne proti celku. **Než přidáš ovládací prvek, najdi v řádu jeho tvar.
Když tam není, je to rozhodnutí pro uživatele, ne detail k doladění.**

1. **Rozbalení má dva tvary, podle toho, co otevírá.**
   - **Řádek** (částky, skupina hlasování): terčem je celý řádek, vpravo `▾` / `▴`, žádná slova
     navíc. Popisek je sám obsah řádku („Pro (86)“) nebo text jen pro čtečku.
   - **Blok textu** (shrnutí, celé znění, další filtry): odkaz pod ním, psaný slovy.
   - Výjimka: rozbalený řádek částek se zavírá odkazem „méně“ — jeho obsah nese odkazy na zdroje
     a metodiku, takže přes něj nesmí ležet překryv tlačítka.
2. **Jedna typografie ovládání:** popisek `600 14px`, číselný údaj `13px` mono. Popisek, na který
   se klepe, není kurzívou — ta patří doprovodnému textu (datum, „← předchozí“, poznámka).
   **Rámovaný prvek volby** (čip tématu, čip klubu, přepínač pohledu, filtr zdrojů) má `13px/500`.
   **Záložka** detailu má `13px/600` — není to volba, ale nadpis oddílu, do kterého vede.
3. **Rámeček má jen to, co něco udělá** (přepínač, krok, filtr, čip). Co jen rozbaluje, rámeček nemá.
4. **Počet schovaných věcí se píše „+N“** a stojí u toho, co rozbaluje („+12 dalších“, „+1 ▾“).
5. **Trvale přilepené ovládání:** nejvýš jeden pruh nahoře a jeden dole, dohromady do **15 %
   displeje** (dnes nejvýš 121 px = 14 % v chronologii kauzy). **Žádný údaj se neopakuje** mezi
   lištou a obsahem — pořadí události nese tlačítko přehledu, v události se proto neukazuje.
6. **Mezery z jedné stupnice:** 4 · 8 · 12 · 16 · 24 · 32 px. Platí pro vše nové a pro vše, na co
   se sahá. Starší pravidla v `upravy.css` mají i 5, 6, 10, 14 a 18 px a hromadně se nepřepisovala:
   posunulo by to desítky míst o 1–2 px bez viditelného přínosu a každé by se muselo přeměřit.
8. **Nic se neposouvá do strany, ani lišta záložek.** Záložky detailu mají na telefonu krátké
   popisky (kauza: Proč · Kdy · Vazby · Stav · Zdroje; zákon: Prospěch · Kontrola · Průběh · Hlasy ·
   Výhrady · Vazby · Zdroje) a co se nevejde, **zalomí se na druhý řádek**. Kauze se pět záložek
   vejde na jeden řádek od 360 px; zákon jich má pět až sedm a má řádky dva (88 px). Pod každým
   řádkem je linka, aby vybraná záložka držela tvar karty.
9. **Hlavička na telefonu má dva řádky:** značka v plné velikosti (18 px) a pod ní menu přes celou
   šířku písmem 15 px. Stojí 102 px místo 79 — vědomá cena za to, že menu nemá 12 px. Od 521 px
   se obojí vejde vedle sebe (58 px).
7. **Dvě svislice, víc ne.** Obsah stránky i detailu začíná **16 px** od okraje displeje (detail měl
   18 px a rozcházel se se stránkou i s vlastní lištou listování). Obsah uvnitř rámovaného bloku
   začíná o dalších **16 px** dál (karta metodiky, blok hlasování). Výjimka: řádky osy kauz mají
   vnitřních 14 px, protože ho sdílejí s mřížkou let — bez přeměření osy nesahat.

Vzhled rozbalovacího odkazu je v `upravy.css` na **jediném místě** (blok „Řád ovládání“); jednotlivé
prvky si jinde řeší jen rozvržení. Hlídá to test „rozbalovací odkazy mají na celém webu jeden vzhled“.

**Počítač se řádem nemění.** Tam, kde by se sdílené pravidlo dotklo i počítače, vrací původní řez
blok `@media (min-width: 761px)` hned pod ním. Ověřuje se to porovnáním snímků
(`nastroje/shoda-pocitace.mjs`), ne od oka.

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
node .claude/skills/mobilni-design/nastroje/dily.mjs         # díly k výběru: varianty A/B/C vedle sebe
node .claude/skills/mobilni-design/nastroje/vyber.mjs        # návrhy před/po se zaškrtávátky
node .claude/skills/mobilni-design/nastroje/audit.mjs        # celkový audit všech stránek, i naležato
node .claude/skills/mobilni-design/nastroje/shoda-pocitace.mjs <před> <po>   # počítač bod po bodu
npm run e2e:mobil                                            # testy + snímek každé stránky
```

Oba skripty si samy postaví web ze **skutečného obsahu** (`obsah/`), spustí server a zase ho zavřou.

`prehled.mjs` vypíše tabulku: u každé stránky kolik pixelů zabere obal nad obsahem, jak je stránka
vysoká v obrazovkách, jestli se něco posouvá do strany, kolik je cílů pod 44 px a jaké je nejmenší
viditelné písmo. **Tím každá práce začíná.**

`audit.mjs` měří **i stavy, do kterých se stránka dostane až ovládáním**: projde záložky detailu,
otevře přehled událostí a rozklikne rozbalovací prvky. Do 15. 11. měřil jen stránku, jak se načte,
a výpis „cíle pod 44 px: nic“ tak půl dne platil jen napůl — záložka Zdroje nesla filtr vysoký
24 px a tři odkazy vysoké 20 px (včetně „Historie změn“, které uživatel hlásil hned první den)
a výběry za „Upřesnit výběr“ měly pod 16 px. **Tvrzení „nikde“ smíš říct jen o tom, co jsi
opravdu prošel.** Stejně to hlídají testy „dotykové cíle i v záložkách a po rozbalení“.

`shoda-pocitace.mjs` porovná dva hotové buildy v okně počítače bod po bodu a řekne, který prvek
se pohnul. **Pouštěj ho po každé změně CSS psané mimo `@media (max-width: 760px)`** — testy takový
posun nechytí. Jak získat build „před“ z posledního commitu, je v hlavičce skriptu.

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
| text 12–13 px na pravidlech a hlasování | na hraně, jinde 14–15 px; uživatel odložil (nejdřív rozvržení a ovladatelnost) |
| věta dalších filtrů: podtržení výběrů stojí daleko pod textem | vzniklo zvětšením cíle na 44 px, vypadá neupraveně |
| seznam zdrojů je u velké kauzy 7 obrazovek | nikdo zatím nenavrhl, jak ho zkrátit a nic neschovat |
| kroky `.prubeh` na pravidlech mají 11 px | návrh byl, nevybral se |
| při řazení podle částky není částka v řádku kauzy na telefonu vidět (stav, zdroje i částka jsou tam schované) | řadí se podle čísla, které čtenář nevidí; nenavrženo |
| přehled událostí má u kauzy se 3 událostmi stejné ovládání jako u třiceti | zatím bez prahu, kdyby vadilo, zapne se podle počtu |

Hotovo (ať se k tomu nevrací): hlavička detailu 518 → 294 px, úvod 417 → 323 px,
hlasování 5,7 → 1,1 obrazovky, dotykové cíle na **44 px**, strop na dvě částky v hlavičce,
u hlasování přepíná nadpis, na nízkém okně počítače se modal posouvá dolů místo ořezávání,
vyhledávací pole má 16 px a mini-osa se na telefonu neukazuje (událostmi se listuje tlačítky).

Z dílů vybraných 15. 11. (volba C · B · A · C · A):
**lišta listování je přilepená dole** (77 px, panel si o ně zmenší spodní okraj, aby nepřekryla
konec události), **v ní je přehled všech událostí** (dvě klepnutí kamkoli místo patnácti; seznam
stojí nad lištou jako překryv, ne jako položka pružné lišty) a **sbalený řádek částek je sám
tlačítkem** — popisek se ořízne pro čtečku, šipka za částkami nese počet schovaných
(`data-sbalene` / `data-skryte` nastavuje skript, takže bez JavaScriptu ani na počítači nevznikne).
Seznam částek tím klesl ze **77 na 49 px** v průměru přes 21 kauz (na jeden řádek se vejde
u 14 z 21 místo 5), obal nad obsahem z **359 na 331 px** v průměru, nejhorší z 392 na 344.
Chronologie se začíná poslední událostí a shrnutí drží tři řádky — obojí zůstalo, jak bylo.

Řád ovládání (15. 11.): rozbalovací odkazy mají jeden řez (14 px, 600, podtržené, bez rámečku),
skupina hlasování je řádek-tlačítko s názvem skupiny jako popiskem, pořadí události se neopakuje
v obsahu i na liště. Obal nad obsahem detailu je v průměru 329 px (nejhorší 342), počítač je shodný
na pixel.

Druhý průchod řádem (15. 11.): čipy, přepínače a filtry mají jeden řez (13px/500), detail má okraj
16 px jako stránka, blok hlasování vnitřních 16 px. Dotykové cíle jsou na 44 px **i v záložkách
a po rozbalení** (filtr zdrojů, odkazy pod seznamem zdrojů, „Ukázat na mapě“, „méně“) a výběry ve
větě filtrů mají 16 px. Záložka Zdroje tím narostla o desetinu obrazovky; jinde se výška nezměnila.

Z dílů vybraných 15. 11. odpoledne (volba B · D): **menu má vlastní řádek pod značkou a písmo
15 px** — hlavička má na telefonu 102 px (dřív 79, na nejužším displeji 105), obsah stránek začíná
o 23 px níž. **Záložky zákona mají krátké popisky a dva řádky**, žádná není mimo obraz; obal nad
obsahem zákona je 349 px (dřív 305). Stejné pravidlo platí pro kauzy: na 360 px a výš jeden řádek
jako dřív (kvůli tomu mají záložky užší výplň), na 320 px dva.

Známá cena na nejužším displeji (320 × 568): detail kauzy má záložky ve dvou řádcích a v chronologii
k nim přibude lišta listování — dohromady 165 px, tedy 29 % displeje, přes rozpočet 15 % z pravidla 5.
Je to důsledek volby „zalomit, ne posouvat“; kdyby vadilo, dá se u kauz na 320 px vrátit posouvání.

Z dílu vybraného 15. 11. večer (volba C, s poznámkou „bez a dál“): **seznam kauz je na telefonu svislá
osa**. Pruh na ose 1980–letošek měl 6,8 px na rok (nejkratší 14 px), levá třetina osy byla vždy prázdná
a čitelný byl jen popisek. Rok začátku teď stojí ve sloupci vlevo jen u první kauzy toho roku na stránce
(`navaznostRoku` v `casova-osa.ts`, značky `data-stejny-rok` / `data-rok-pokracuje` nastavuje `filtry.ts`),
nad názvem je `konecText` („do 2021 · 16 let“, „dosud · 12 let“ — bez „a dál“). Lišta s roky, pruhy
a legenda pruhů na telefonu odpadly, seznam začíná o 41 px výš. Počítač je shodný na pixel.

Nejdelší stránka webu mimo seznam zdrojů je 1,3 obrazovky a nic se nikde neposouvá do strany.

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
| Vymyslet pro nový prvek vlastní vzhled, protože se sem zrovna hodí | Najdi jeho tvar v řádu ovládání; když tam není, je to otázka pro uživatele |
| Opakovat údaj z lišty i v obsahu („30 z 30“ a „událost 30 z 30“) | Jeden údaj, jedno místo |
| Psát sdílené pravidlo mimo `@media` a věřit, že se počítače netýká | `shoda-pocitace.mjs` před commitem |
| Říct „nikde na webu“ po změření stránek, jak se načtou | Projdi i záložky a rozbalené stavy — `audit.mjs` to dělá |
