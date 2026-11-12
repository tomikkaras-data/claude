# Pevnost hrdinů 🏰

Mobilní hra v češtině pro děti (6–9 a 10+ let): plň dobré skutky jako v aplikaci typu Duolingo, sbírej XP a zlaťáky a za ně stav a bráň vlastní pevnost.

## Jak spustit
Otevři `index.html` v prohlížeči nebo spusť `python3 -m http.server` ve složce `pevnost/` a otevři ji v mobilu. Na telefonu jde přidat na plochu (PWA manifest).

## Části hry
- **Úkoly**: 34 aktivit v kategoriích Pohyb, Hlava, Domácnost, Rodina a Venku. Rychlovky (30 s), krátké (2–5 min) i velké výzvy (15 min až 1 h+). Krátké mají odpočet, velké potvrzuje rodič. Nabídka se řídí věkem.
- **Odměny**: XP a zlaťáky. Denní série (🔥) dává bonus +5 % za den (max +50 %), denní bonus a každých 7 dní truhlu. Je tu 17 úspěchů se zlatou odměnou. Když dítě dělá stejný úkol víc než 3× za den, dostane za něj méně.
- **Pevnost**: dvě království, Ledové království (sníh, smrky, ledový palác, útočí skřeti) a Pustina (písek, plechové boudy, bunkr s plotem, útočí zombie). Na 10 místech u cesty se dají stavět věže (střelecká, zpomalující, plošná) a zátarasy, které zastaví nepřátele na cestě. Hlavní budovy se vylepšují: Palác/Bunkr přidává životy, Kovárna/Dílna odemyká vybavení, Krčma/Bar přidává místa pro hrdiny, Důl/Šrotiště dává víc zlata.
- **Hrdinové**: 6 hrdinů (tank, střelec, kouzelník, bojovník, léčitel, zvíře) se najímá za zlaťáky. Odemykají se podle úrovně. Každý má 3 sloty (zbraň, oblečení, doplněk) a v obchodě je 10 předmětů.
- **Vlny**: nepřátelé jdou po cestě. Každá 5. vlna má bosse. Za výhru jsou XP a zlaťáky. Za prohru se ztratí 15 % zlata a trochu XP, ale nikdy pod začátek aktuální úrovně. Boj jde zrychlit na 2×.

## Izometrická základna (Pustina) 🏗️
Základna je **Slovanský ostrov v Praze po jaderné válce** (mapa 64×64 políček, ostrov je asi 3× větší než dřív, 1 políčko ≈ 7 m). Sever je nahoře.
- **Tvar ostrova** odpovídá skutečnosti: protáhlý od severu k jihu, uprostřed nejširší, na jihu úzký ocas. Vpravo je úzké rameno Vltavy a nábřeží s městem.
- **Malované památky** (obrázky v `img/buildings/`, pevné, nejdou přesunout):
  - `zofin.webp` – palác Žofín v horní polovině ostrova (půdorys 6×6),
  - `manes.webp` – Mánes se Šítkovskou věží v rameni řeky u jižního vstupu (4×6),
  - `divadlo.webp` – Národní divadlo na nábřeží u severního cípu ostrova (3×9).
- **Loděnice:** dřevěná mola s loďkami na západním břehu.
- **Dva vstupy:** můstek k Žofínu na severu a lávka těsně pod Mánesem na jihu. Zombie přicházejí z města oběma vstupy a jdou po parkových cestičkách k velitelství uprostřed ostrova.
- **Malované prvky** (`img/sprites/`, 71 obrázků vyříznutých z dodaného listu): stromy (zelené, podzimní, mrtvé, pařez, kmen), auta (funkční, rozbitá, vraky, autobus), loděnice a lodě, zničené hřiště, městský mobiliář (lavičky, lampy, koše, květináče, vývěska, plakátovací sloup, suť).
- **Ostrov:** spálený park s mrtvými stromy, pár stromů přežilo; lavičky, lampy a koše podél cestiček; zničené hřiště na jihu; loděnice s loďkami na západním břehu.
- **Nábřeží:** vraky aut a autobusů na ulici s kolejemi, stromořadí, lampy, patníky s řetězy, suť po domech. Ve městě se nestaví.
- **Podklad** se počítá pixel po pixelu: šum, plynulé přechody mezi povrchy, hloubka vody a pěna u břehu, mokrý okraj ostrova, dlažba ve městě a kolem Žofína.
- Kreslené stromy, trosky domů, vraky a tramvaje z dřívějška jsou pryč. Kreslené zůstávají jen hráčovy herní stavby (velitelství, věže, stany…) a ploty.

Stavění funguje jako ve vesnici v Cave Man RPG:
- **Záložky Stavby / Dekorace / Malování** pod mapou.
- **Pokládání:** vybraná věc se objeví na nejbližším volném místě. Přetáhni ji nebo klepni jinam, pak potvrď ✔. ⇋ Otočit ji zrcadlí, ✖ zruší.
- **Úpravy:** klepnutím na věc na mapě ji zvedneš. Pak ji můžeš posunout, otočit, ⬆️ vylepšit (hlavní budovy) nebo 🗑️ odstranit.
- **Malování:** Prašná cesta a Silnice (napojují se samy, silnice má středovou čáru), Písek, Vyprahlá zem, Suchá tráva, Popel, Štěrk, Asfalt, Beton; velikost 1×1 až 3×3. Vodu a cestu zombíků přemalovat nejde. Namalované cesty jsou jen pro krásu, zombie chodí pořád po své.
- **Pohyb:** táhnutí, dva prsty nebo kolečko = zoom, + / −, WASD a šipky. Klepnutím na minimapu skočíš na dané místo.

### Budovy
| id | budova | velikost | co umí |
|---|---|---|---|
| hall | Velitelství / bunkr (HQ) | 3×2 | srdce pevnosti |
| tavern | Kasárna (Bar) | 3×2 | +1 hrdina za úroveň |
| forge | Hangár (Dílna) | 3×2 | lepší zbraně |
| mine | Šrotiště | 2×2 | +10 % zlata za úroveň |
| archer / mage / cannon | Kulometné hnízdo / Tesla / Minomet | 1×1 | věže |
| barrier | Barikáda (jen na cestu nebo most) | 1×1 | zastaví zombie |
| guardtower | Dřevěná strážní věž | 1×1 | věž, dostřel 150 (od úr. 2) |
| windmill | Větrník z harampádí (max 2) | 1×1 | věže střílí o 10 % rychleji |
| tent | Malý stan (max 3) | 1×1 | +1 místo pro hrdinu |
| armytent | Vojenský stan (max 2) | 2×2 | +2 místa pro hrdiny |
| house | Opravený dům (max 3) | 2×2 | +1 hrdina, +40 životů základny |
| ruin | Zničený dům | 2×2 | ozdoba |
| lookout | Pískovcová vyhlídka (max 1, od úr. 3) | 1×1 | hrdinové +20 % dostřel |
| containers | Kontejnery z doků (max 3) | 2×1 | +10 % zlata za vlny |

Dekorace (id): deadtree, bush, cactus, tuft, rock, boulder, rubble, bones, ruinvilla (3×2), ruinhouse (2×2), ruinwall, crater, car (2×1), barrel, tires, crates, scrap, watertower, fence, sandbags, concrete, sign, lamp.

**Vlastní grafika:** ulož obrázek jako `img/buildings/<id>.png` (např. `img/buildings/forge.png` nebo `img/buildings/car.png`). Hra ho použije místo kreslené budovy nebo dekorace.
Obrázek má být izometrický (úhel 2:1), s průhledným pozadím. Jeho šířka se roztáhne na šířku půdorysu a spodní okraj sedí na přední roh půdorysu.
Rozměry jsou v `ISO_DEFS` a `ISO_DECOR` v `js/iso.js`.

## Zbrojnice 🎒
Nová záložka s obchodem a batohem. Koupené věci jdou do batohu a odtud se nasazují hlavnímu hrdinovi („Ty“) nebo komukoli z party.
V Pustině je 40 skutečných zbraní (obrázky v `img/guns/`). Každá má reálnou ráži, kadenci a účinný dostřel a z nich se počítají herní hodnoty:
- interval mezi výstřely = 40 / kadence s (samonabíjecí a opakovací) nebo 0,12 + 100 / kadence s (automatické zbraně střílí dávky),
- herní dostřel = 60 + dostřel v m / 5 px (max 260),
- poškození podle síly náboje (9 mm ≈ 7, 5,56 ≈ 8, 7,62×51 ≈ 11–12, .338 Lapua 60, 12,7 mm 90), brokovnice zasahují plošně, kulomety zpomalují,
- cena roste s účinností (poškození za sekundu × dostřel), nejsilnější zbraně potřebují vyšší úroveň Dílny.

Rozsah: pistole 50–60 💰, samopaly 90–210, útočné pušky 220–500, brokovnice 230–930, odstřelovačky 140–1240 (Barrett M82), kulomety 330–1130.
Zbraň určuje hrdinovi dostřel a kadenci, síla hrdiny přidá čtvrtinu jeho základního útoku. V Ledovém království zůstávají meče a kopí.

## Ukládání
- **Host**: postup se ukládá jen ručně, tlačítkem 💾 Uložit (do zařízení) nebo jako soubor se zálohou v Profilu.
- **Google účet**: přes Firebase. Vyplň `js/firebase-config.js`, zapni Google ve Firebase Authentication a vytvoř Firestore s pravidly:
```
rules_version = '2';
service cloud.firestore { match /databases/{db}/documents {
  match /players/{uid} { allow read, write: if request.auth != null && request.auth.uid == uid; }
}}
```
Doménu, ze které hru provozuješ, přidej do Authentication → Settings → Authorized domains.
