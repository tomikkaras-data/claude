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
Pustina má izometrickou mapu 18×18 políček: olivová tráva, prašná cesta, stromy. Budovy se stavějí kamkoli mimo cestu, barikády jen na cestu.
Táhnutím se mapa posouvá, dvěma prsty (nebo kolečkem myši) se přibližuje. Klepnutím na budovu ji můžeš vylepšit, přesunout nebo zbourat.
Zombie jdou po cestě až k velitelství (HQ).

| id | budova | velikost |
|---|---|---|
| hall | Velitelství / bunkr (HQ) | 3×2 |
| tavern | Kasárna (Bar) | 3×2 |
| forge | Hangár (Dílna) | 3×2 |
| mine | Šrotiště | 2×2 |
| archer | Kulometné hnízdo | 1×1 |
| mage | Tesla cívka | 1×1 |
| cannon | Minomet | 1×1 |
| barrier | Barikáda (na cestě) | 1×1 |
| fence | Plot z pletiva (napojuje se na sousední) | 1×1 |
| sandbags | Pytle s pískem | 1×1 |

**Vlastní grafika budov:** ulož obrázek jako `img/buildings/<id>.png` (např. `img/buildings/forge.png`). Hra ho použije místo kreslené budovy.
Obrázek má být izometrický (úhel 2:1), s průhledným pozadím. Jeho šířka se roztáhne na šířku půdorysu budovy a spodní okraj sedí na přední roh půdorysu.
Rozměry a styl kreslení jsou v `ISO_DEFS` v `js/iso.js`.

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
