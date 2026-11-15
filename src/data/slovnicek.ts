/** Slovníček pojmů a zkratek. Jeden zdroj pro vysvětlivky v textu kauz a zákonů (klepnutí na podtržený výraz)
 *  i pro oddíl „Slovníček pojmů a zkratek“ v Metodice.
 *
 *  Výklad je jedna až dvě věty obyčejnou řečí. Popisuje pojem obecně, ne konkrétní kauzu, a nikoho nehodnotí.
 *  Do slovníčku patří jen výrazy, které mají v textech archivu jediný význam. Slova, která se běžně používají
 *  i mimo právo („obvinil“, „odložil jednání“, „usnesení“), buď chybí, nebo mají vzor zúžený na právní spojení:
 *  vysvětlivka u běžného slova by čtenáři podsunula řízení, které neproběhlo. */
export type Pojem = {
  /** součást id prvku v HTML (pojem-<id>), jen malá písmena bez diakritiky, číslice a pomlčky */
  id: string;
  heslo: string;
  vyklad: string;
  /** Regulární výraz bez okrajů slova (doplní je src/lib/slovnicek.ts). U výrazů se nerozlišuje velikost písmen. */
  vzor: string;
  /** Zkratka: rozlišuje velikost písmen a neoznačuje se ve spisových značkách („IV. ÚS 2980/22“). */
  zkratka?: true;
};

/** libovolná koncovka (skloňování a časování) */
const K = String.raw`\p{L}*`;
/** výraz stojí ve stejné větě nejvýš `n` znaků za jedním z uvedených slov (označí se jen výraz sám) */
const vetaS = (slova: string, n: number) => String.raw`(?<=(?:${slova})[^.;!?]{0,${n}}\s)`;

const vyraz = (id: string, heslo: string, vzor: string, vyklad: string): Pojem => ({ id, heslo, vzor, vyklad });
const zkratka = (z: string, nazev: string, vyklad = '', vzor = z.replace(/ /g, String.raw`\s`)): Pojem => ({
  id: 'z-' + z.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  heslo: z,
  vyklad: vyklad ? `${nazev}. ${vyklad}` : `${nazev}.`,
  vzor,
  zkratka: true,
});

export const VYRAZY: Pojem[] = [
  // trestní řízení
  vyraz('trestni-oznameni', 'trestní oznámení', String.raw`trestní${K} oznámení`,
    'Podnět policii nebo státnímu zástupci, že se možná stal trestný čin. Podat ho může kdokoli a samo nic nedokazuje.'),
  vyraz('trestni-stihani', 'trestní stíhání', String.raw`(?:trestní${K} )?stíhán${K}`,
    'Začíná obviněním konkrétní osoby nebo firmy. Vede ho policie pod dozorem státního zástupce a končí obžalobou, nebo zastavením. O vině rozhoduje až soud.'),
  vyraz('statni-zastupce', 'státní zástupce', String.raw`(?:dozorov${K} )?státní${K} zástup${K}|státní${K} zastupitelstv${K}`,
    'Veřejný žalobce. Dohlíží na policejní vyšetřování, rozhoduje o obžalobě a zastupuje ji u soudu. Dozorový státní zástupce je ten, kdo má případ na starosti.'),
  vyraz('obzaloba', 'obžaloba', String.raw`(?:spolu)?obžalo[bv]${K}`,
    'Návrh státního zástupce, aby soud projednal trestný čin konkrétní osoby nebo firmy. O vině rozhoduje až soud.'),
  vyraz('zprosteni', 'zproštění obžaloby', String.raw`zpro[sš][tť]${K}`,
    'Soud rozhodl, že obžalovaný není vinen: čin se nestal, není trestný, nebo se nepodařilo prokázat, že ho spáchal.'),
  vyraz('pravomocne', 'pravomocné a nepravomocné rozhodnutí', String.raw`(?:ne)?pravomocn${K}|právní moc${K}`,
    'Pravomocné rozhodnutí je konečné: běžným odvoláním ho už změnit nejde. Nepravomocné rozhodnutí může ještě změnit vyšší soud nebo úřad.'),
  vyraz('presumpce-neviny', 'presumpce neviny', String.raw`presumpc${K} neviny`,
    'Na každého se hledí jako na nevinného, dokud soud pravomocně nerozhodne, že je vinen.'),
  vyraz('imunita', 'poslanecká imunita', String.raw`imunit${K}`,
    'Poslance nebo senátora lze trestně stíhat jen se souhlasem jeho komory. Když ho komora nevydá, nelze stíhání po dobu mandátu vést.'),
  vyraz('odlozeni', 'odložení věci', String.raw`${vetaS('věc|případ|oznámení|podněty?|prověřování', 90)}odloži${K}|odložení věci|věc${K} (?:\p{L}+ )?odložen${K}`,
    'Policie nebo úřad se věcí dál nezabývá a nikoho neobviní, například proto, že nezjistí porušení zákona nebo uplynula lhůta.'),
  vyraz('zastaveni', 'zastavení řízení', String.raw`${vetaS('řízení|stíhání', 60)}zastavi${K}|zastavi${K} (?:\p{L}+ ){0,2}(?:řízení|stíhání)|zastavení (?:\p{L}+ )?(?:řízení|stíhání)`,
    'Řízení skončilo bez rozhodnutí o vině nebo o věci samé, například pro nedostatek důkazů nebo uplynutí lhůty.'),
  vyraz('promlceni', 'promlčení', String.raw`promlč${K}`,
    'Po uplynutí zákonné lhůty už čin nejde stíhat ani trestat a dluh nejde vymáhat.'),
  vyraz('samostatne-rizeni', 'vyloučení k samostatnému řízení', String.raw`k samostatnému řízení`,
    'Soud nebo policie část případu oddělí a řeší ji zvlášť, aby nezdržovala zbytek.'),
  vyraz('dotacni-podvod', 'dotační podvod', String.raw`dotační${K} podvod${K}`,
    'Trestný čin: nepravdivé nebo zamlčené údaje v žádosti o dotaci, případně použití dotace na jiný účel.'),
  vyraz('financni-zajmy-eu', 'poškození finančních zájmů EU', String.raw`poškození finančních zájmů (?:EU|Evropské unie)`,
    'Trestný čin: nepravdivé doklady nebo údaje, které umožní neoprávněně použít peníze z rozpočtu Evropské unie.'),
  // opravné prostředky a další řízení
  vyraz('dovolani', 'dovolání', String.raw`dovolán[íi]${K}`,
    'Mimořádný opravný prostředek k Nejvyššímu soudu proti pravomocnému rozhodnutí. Soud při něm řeší jen právní otázky.'),
  vyraz('ustavni-stiznost', 'ústavní stížnost', String.raw`ústavní${K} stížnost${K}`,
    'Stížnost k Ústavnímu soudu, že pravomocné rozhodnutí porušilo základní práva. Jde podat až po vyčerpání ostatních opravných prostředků.'),
  vyraz('kasacni-stiznost', 'kasační stížnost', String.raw`kasační${K} stížnost${K}`,
    'Opravný prostředek k Nejvyššímu správnímu soudu proti rozsudku krajského soudu ve sporu s úřadem.'),
  vyraz('predbezna-otazka', 'předběžná otázka', String.raw`předběžn${K} otázk${K}`,
    'Dotaz národního soudu Soudnímu dvoru Evropské unie, jak vyložit evropské právo. Odpovědí se soud musí řídit.'),
  vyraz('rozklad', 'rozklad', String.raw`rozklad${K}`,
    'Obdoba odvolání proti rozhodnutí ministerstva nebo jiného ústředního úřadu. Rozhoduje o něm ministr nebo předseda úřadu.'),
  vyraz('spravni-zaloba', 'správní žaloba', String.raw`správní${K} žalob${K}`,
    'Žaloba k soudu proti rozhodnutí úřadu.'),
  vyraz('spravni-rizeni', 'správní řízení', String.raw`správní${K} řízení`,
    'Řízení, ve kterém o právech a povinnostech rozhoduje úřad, ne soud.'),
  vyraz('prestupek', 'přestupek', String.raw`přestup(?:ek|k${K})`,
    'Méně závažné porušení zákona. Neřeší ho trestní soud, ale úřad, a trestem bývá pokuta.'),
  vyraz('obcanskopravni-spor', 'občanskoprávní spor', String.raw`občanskoprávní${K} (?:spor${K}|řízení)`,
    'Spor mezi lidmi nebo firmami, který rozhoduje soud. Není to trestní řízení a soud v něm nerozhoduje o vině.'),
  vyraz('ochrana-osobnosti', 'ochrana osobnosti', String.raw`ochran${K} osobnosti`,
    'Právo bránit se u soudu proti zásahu do cti, soukromí nebo dobré pověsti. Soud může nařídit omluvu, odstranění výroku nebo odškodnění.'),
  vyraz('exekuce', 'exekuce', String.raw`exekuc${K}`,
    'Nucené vymáhání dluhu nebo povinnosti, kterou někdo dobrovolně nesplnil.'),
  vyraz('narovnani', 'narovnání', String.raw`(?<=(?:za|o)\s)narovnání`,
    'Dohoda, kterou spor nebo řízení skončí bez dalšího dokazování. U antimonopolního úřadu firma přizná porušení zákona a dostane nižší pokutu.'),
  // firmy a majetek
  vyraz('holding', 'holding', String.raw`holding${K}`,
    'Skupina firem, kterou ovládá jedna mateřská společnost.'),
  vyraz('sverensky-fond', 'svěřenský fond', String.raw`svěřensk${K} fond${K}`,
    'Majetek, který zakladatel vyčlení ze svého vlastnictví a svěří správci. Správce se o něj stará podle pravidel zakladatele a výnosy dostává ten, koho zakladatel určil.'),
  vyraz('obmysleny', 'obmyšlený', String.raw`obmyšlen${K}`,
    'Ten, komu má podle zakladatele plynout prospěch ze svěřenského fondu.'),
  vyraz('skutecny-majitel', 'skutečný majitel', String.raw`skutečn${K} majitel${K}`,
    'Člověk, který má z firmy konečný prospěch nebo ji fakticky ovládá, i když ji formálně vlastní někdo jiný, třeba jiná firma nebo fond.'),
  vyraz('ovladajici-osoba', 'ovládající osoba', String.raw`ovládající${K} osob${K}`,
    'Ten, kdo může ve firmě prosadit svou vůli, i když ji třeba formálně nevlastní.'),
  vyraz('stret-zajmu', 'střet zájmů', String.raw`střet${K} zájmů`,
    'Situace, kdy má veřejný činitel osobní zájem, který může ovlivnit jeho rozhodování ve funkci, třeba prospěch vlastní firmy.'),
  vyraz('offshore', 'offshorová firma', String.raw`offshor${K}`,
    'Firma založená v zemi s nízkými daněmi a malou povinností zveřejňovat, komu patří.'),
  vyraz('insolvence', 'insolvence', String.raw`insolven${K}`,
    'Úpadek: firma nebo člověk není schopen platit své dluhy. Jak se úpadek vyřeší, rozhoduje soud.'),
  vyraz('konkurz', 'konkurz', String.raw`konkurz${K}`,
    'Způsob řešení úpadku: majetek dlužníka se prodá a výtěžek se rozdělí mezi věřitele.'),
  // daně
  vyraz('zajistovaci-prikaz', 'zajišťovací příkaz', String.raw`zajišťovací${K} příkaz${K}`,
    'Příkaz, kterým si finanční nebo celní úřad zajistí peníze na daň dřív, než je daň pravomocně vyměřena. Firma musí zaplatit během několika dnů, někdy okamžitě.'),
  vyraz('domereni-dane', 'doměření daně', String.raw`doměř${K}`,
    'Úřad po kontrole dospěl k závěru, že firma měla zaplatit vyšší daň, a rozdíl jí předepsal k úhradě.'),
  vyraz('penale', 'penále', String.raw`penále`,
    'Sankce za to, že úřad musel daň doměřit. Počítá se procentem z doměřené částky.'),
  vyraz('ruceni', 'ručení', String.raw`ručitel${K}|ručení`,
    'Kdo ručí, musí zaplatit cizí dluh, když ho dlužník nezaplatí. U DPH může finanční úřad žádat daň po odběrateli, pokud ji neodvedl dodavatel.'),
  // dotace, zakázky a soutěž
  vyraz('narokova-dotace', 'nároková a nenároková dotace', String.raw`(?:ne)?nárokov${K} dotac${K}`,
    'Na nárokovou dotaci má žadatel právo, když splní podmínky, například platby na hektar půdy. O nenárokové dotaci rozhoduje úřad výběrem mezi žadateli.'),
  vyraz('financni-korekce', 'finanční korekce', String.raw`finanční${K} (?:korekc|oprav)${K}|korekc${K}`,
    'Výdaje, které Evropská unie po auditu odmítne proplatit nebo chce vrátit, protože se vyplácely v rozporu s pravidly. Zaplatí je pak stát ze svého rozpočtu.'),
  vyraz('verejna-podpora', 'veřejná podpora', String.raw`veřejn${K} podpor${K}`,
    'Výhoda z veřejných peněz pro konkrétní firmu nebo odvětví. Pravidla Evropské unie ji dovolují jen za určitých podmínek.'),
  vyraz('verejny-zadavatel', 'veřejný zadavatel', String.raw`veřejn${K} zadavatel${K}`,
    'Stát, kraj, obec nebo organizace, kterou ovládají. Dodavatele musí vybírat podle zákona o veřejných zakázkách.'),
  vyraz('zadavaci-rizeni', 'zadávací řízení', String.raw`zadávací${K} řízení`,
    'Zákonem daný postup, kterým veřejná instituce vybírá dodavatele zakázky.'),
  vyraz('trzni-sila', 'významná tržní síla', String.raw`významn${K} tržní${K} síl${K}`,
    'Postavení velkého odběratele potravin, který si může vůči dodavatelům vynutit výhodnější podmínky. Zákon mu zakazuje toho zneužívat.'),
  // zákony
  vyraz('snemovni-tisk', 'sněmovní tisk', String.raw`sněmovní${K} tisk${K}`,
    'Návrh zákona nebo jiný dokument, který Sněmovna projednává. Každý má své číslo.'),
  vyraz('duvodova-zprava', 'důvodová zpráva', String.raw`důvodov${K} zpráv${K}`,
    'Zdůvodnění přiložené k návrhu zákona: proč ho předkladatel navrhuje a co má změnit.'),
  vyraz('pripominkove-rizeni', 'připomínkové řízení', String.raw`připomínkov${K} řízení`,
    'Fáze přípravy zákona, kdy se k návrhu vyjadřují ministerstva a další instituce.'),
  vyraz('pozmenovaci-navrh', 'pozměňovací návrh', String.raw`pozměňovací${K} návrh${K}`,
    'Návrh poslance nebo senátora na změnu zákona, který se právě projednává.'),
  vyraz('legislativni-nouze', 'legislativní nouze', String.raw`legislativní${K} nouz${K}`,
    'Zrychlené projednání zákona ve Sněmovně při mimořádných okolnostech. Zkracuje lhůty i rozpravu.'),
  vyraz('ucinnost', 'účinnost', String.raw`účinnost${K}`,
    'Den, od kterého pravidlo skutečně platí a postupuje se podle něj. U zákona bývá později než den vyhlášení.'),
  vyraz('interpelace', 'interpelace', String.raw`interpelac${K}`,
    'Dotaz poslance na člena vlády. Ministr na něj musí odpovědět.'),
];

export const ZKRATKY: Pojem[] = [
  // české úřady a soudy
  zkratka('ÚOHS', 'Úřad pro ochranu hospodářské soutěže', 'Hlídá férovou soutěž mezi firmami, veřejné zakázky a chování velkých odběratelů potravin.'),
  zkratka('SZIF', 'Státní zemědělský intervenční fond', 'Vyplácí zemědělcům evropské i české dotace.'),
  zkratka('PGRLF', 'Podpůrný a garanční rolnický a lesnický fond', 'Státní fond, který zemědělcům přispívá na úvěry a pojištění.'),
  zkratka('SPÚ', 'Státní pozemkový úřad', 'Spravuje zemědělskou půdu, která patří státu.'),
  zkratka('ÚZSVM', 'Úřad pro zastupování státu ve věcech majetkových', 'Spravuje státní majetek a zastupuje stát ve sporech o něj.'),
  zkratka('SSHR', 'Správa státních hmotných rezerv', 'Úřad, který pro případ krize skladuje státní zásoby potravin, paliv a dalších surovin.'),
  zkratka('NKÚ', 'Nejvyšší kontrolní úřad', 'Nezávisle kontroluje, jak stát hospodaří s penězi a majetkem.'),
  zkratka('SZPI', 'Státní zemědělská a potravinářská inspekce', 'Kontroluje jakost a bezpečnost potravin.'),
  zkratka('ČIŽP', 'Česká inspekce životního prostředí', 'Kontroluje dodržování zákonů na ochranu přírody a ukládá pokuty.'),
  zkratka('ÚKZÚZ', 'Ústřední kontrolní a zkušební ústav zemědělský', 'Státní úřad, který kontroluje osiva, hnojiva, krmiva a přípravky na ochranu rostlin.'),
  zkratka('ČHMÚ', 'Český hydrometeorologický ústav', 'Měří mimo jiné znečištění ovzduší.'),
  zkratka('LČR', 'Lesy České republiky', 'Státní podnik, který spravuje státní lesy.'),
  zkratka('MPO', 'Ministerstvo průmyslu a obchodu'),
  zkratka('MŽP', 'Ministerstvo životního prostředí'),
  zkratka('LRV', 'Legislativní rada vlády', 'Poradní orgán vlády, který posuzuje návrhy zákonů.'),
  zkratka('NCOZ', 'Národní centrála proti organizovanému zločinu', 'Policejní útvar, který vyšetřuje korupci a závažnou hospodářskou kriminalitu.'),
  zkratka('NSZ', 'Nejvyšší státní zastupitelství', 'Nejvyšší stupeň soustavy státních zástupců.'),
  zkratka('VSZ', 'Vrchní státní zastupitelství', 'Dohlíží na krajská státní zastupitelství a samo řeší nejzávažnější hospodářské případy.'),
  zkratka('MSZ', 'Městské státní zastupitelství', 'Státní zastupitelství pro Prahu na úrovni kraje.'),
  zkratka('NSS', 'Nejvyšší správní soud', 'Nejvyšší soud pro spory lidí a firem s úřady.'),
  zkratka('ÚS', 'Ústavní soud', 'Chrání ústavnost a základní práva. Může zrušit zákon i rozhodnutí jiného soudu.'),
  // Evropská unie a zahraničí
  zkratka('EK', 'Evropská komise', 'Výkonný orgán Evropské unie. Spravuje její rozpočet a kontroluje, jak státy utrácejí evropské peníze.'),
  zkratka('DG', 'Generální ředitelství Evropské komise', 'Obdoba ministerstva: DG AGRI má na starosti zemědělství, DG REGIO regionální politiku a DG EMPL zaměstnanost a sociální věci.', String.raw`DG\s(?:AGRI|REGIO|EMPL)`),
  zkratka('EP', 'Evropský parlament'),
  zkratka('CONT', 'Výbor Evropského parlamentu pro rozpočtovou kontrolu', 'Dohlíží na to, jak se utrácejí peníze Evropské unie.'),
  zkratka('OLAF', 'Evropský úřad pro boj proti podvodům', 'Prověřuje podvody s penězi Evropské unie. Sám nikoho nestíhá, výsledky předává státům a Evropské komisi.'),
  zkratka('EPPO', 'Úřad evropského veřejného žalobce', 'Vyšetřuje a žaluje trestné činy proti rozpočtu Evropské unie, například dotační podvody.'),
  zkratka('SFEU', 'Smlouva o fungování Evropské unie', 'Jedna ze dvou základních smluv Evropské unie.'),
  zkratka('EFRR', 'Evropský fond pro regionální rozvoj', 'Z něj Evropská unie platí investice v regionech, například do podnikání a dopravy.'),
  zkratka('ERDF', 'Evropský fond pro regionální rozvoj', 'Anglická zkratka téhož fondu, který se česky označuje EFRR.'),
  zkratka('ESF', 'Evropský sociální fond', 'Z něj Evropská unie platí podporu zaměstnanosti a vzdělávání.'),
  zkratka('EZFRV', 'Evropský zemědělský fond pro rozvoj venkova', 'Z něj Evropská unie platí investice na venkově a v zemědělství.'),
  zkratka('EZZF', 'Evropský zemědělský záruční fond', 'Z něj Evropská unie platí přímé platby zemědělcům.'),
  zkratka('ROP', 'Regionální operační program', 'Program, přes který se v jednom regionu rozdělovaly evropské dotace.'),
  zkratka('OP PIK', 'Operační program Podnikání a inovace pro konkurenceschopnost', 'Přes něj ministerstvo průmyslu rozdělovalo firmám evropské dotace.'),
  zkratka('PMÚ', 'Protimonopolný úrad Slovenskej republiky', 'Slovenský úřad na ochranu hospodářské soutěže.'),
  zkratka('PNF', 'Národní finanční prokuratura', 'Francouzský úřad, který stíhá závažnou finanční kriminalitu.'),
  zkratka('OBSE', 'Organizace pro bezpečnost a spolupráci v Evropě'),
  zkratka('ICIJ', 'Mezinárodní konsorcium investigativních novinářů', 'Síť redakcí z celého světa, která zpracovala mimo jiné Pandora Papers.'),
  // ostatní
  zkratka('MSP', 'Malé a střední podniky', 'Firmy do 250 zaměstnanců. Počítají se k nim i propojené firmy, takže podnik z velkého holdingu mezi ně nepatří.'),
  zkratka('LPIS', 'Registr půdy', 'Evidence toho, kdo kterou zemědělskou půdu užívá. Podle ní se vyplácejí dotace.'),
  zkratka('IRR', 'Vnitřní výnosové procento', 'Ukazatel, kolik investice vydělá.'),
  zkratka('WACC', 'Průměrné náklady kapitálu', 'Kolik firmu stojí peníze, které do investice vkládá.'),
  zkratka('ČTK', 'Česká tisková kancelář', 'Veřejnoprávní zpravodajská agentura.'),
  zkratka('HN', 'Hospodářské noviny'),
];

export const POJMY: Pojem[] = [...VYRAZY, ...ZKRATKY];

/** Zkratky, které výklad nepotřebují, protože je zná každý. Kontrola obsahu je nehlásí. */
export const OBECNE_ZNAME = ['EU', 'ČR', 'SR', 'DPH', 'ČT', 'TV', 'IT', 'USD', 'EUR', 'IČ', 'UK'];

/** Vlastní jména psaná verzálkami (firmy, strany, značky, tituly). Nejsou to zkratky k rozepsání,
 *  čtenáři je představuje text kauzy. Kontrola obsahu je nehlásí. */
export const NAZVY_VERZALKAMI = [
  // strany a hnutí
  'ANO', 'ODS', 'SPD', 'STAN', 'ČSSD', 'KDU', 'ČSL', 'TOP', 'PS',
  // média
  'MAFRA', 'MF', 'DNES', 'DR', 'FM', 'SITA',
  // firmy, fondy a jejich části názvu
  'AB', 'AG', 'AGRO', 'AGS', 'CO', 'CR', 'CS', 'CZ', 'DEZA', 'DZS', 'EY', 'FAU', 'HOLDING', 'KMOTR', 'LE', 'LIN', 'MP',
  'OFI', 'OLMA', 'PBP', 'PENAM', 'PEZA', 'PKF', 'RABBIT', 'RSVP', 'SCP', 'SP', 'SPV', 'TIS', 'ZAS', 'ZEM', 'ZEMOS',
  'ZEOS', 'ZOD', 'ZS', 'ZVOS', 'ZZN',
  // doslovné citace
  'JSEM', 'ZDĚŠENA',
];
