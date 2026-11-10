// Herní data: aktivity, úspěchy, budovy, hrdinové, vybavení, nepřátelé.
'use strict';

const CATEGORIES = {
  fitness: { name: 'Pohyb', icon: '🏃' },
  mind:    { name: 'Hlava', icon: '🧠' },
  home:    { name: 'Domácnost', icon: '🏠' },
  family:  { name: 'Rodina', icon: '💝' },
  nature:  { name: 'Venku', icon: '🌳' },
};

// sec = délka v sekundách; age = minimální věk (6 nebo 10)
const ACTIVITIES = [
  // krátké (~30 s)
  { id: 'jacks20', cat: 'fitness', name: '20 skákacích panáků', sec: 30, age: 6 },
  { id: 'squat10', cat: 'fitness', name: '10 dřepů', sec: 30, age: 6 },
  { id: 'plank30', cat: 'fitness', name: 'Prkno 30 sekund', sec: 30, age: 6 },
  { id: 'flamingo', cat: 'fitness', name: 'Plameňák: stůj na 1 noze 30 s', sec: 30, age: 6 },
  { id: 'pushup10', cat: 'fitness', name: '10 kliků', sec: 30, age: 10 },
  { id: 'breath', cat: 'mind', name: '5 hlubokých nádechů', sec: 30, age: 6 },
  { id: 'water', cat: 'home', name: 'Vypij sklenici vody', sec: 30, age: 6 },
  { id: 'hug', cat: 'family', name: 'Obejmi někoho z rodiny', sec: 30, age: 6 },
  { id: 'thanks', cat: 'family', name: 'Řekni někomu, za co mu děkuješ', sec: 30, age: 6 },
  { id: 'shoes', cat: 'home', name: 'Srovnej boty v předsíni', sec: 30, age: 6 },
  // střední (~2 min)
  { id: 'bed', cat: 'home', name: 'Ustel si postel', sec: 120, age: 6 },
  { id: 'toys', cat: 'home', name: 'Ukliď hračky', sec: 120, age: 6 },
  { id: 'table', cat: 'home', name: 'Prostři stůl', sec: 120, age: 6 },
  { id: 'dishes', cat: 'home', name: 'Dej nádobí do myčky', sec: 120, age: 10 },
  { id: 'teeth', cat: 'home', name: 'Pořádně si vyčisti zuby (2 min)', sec: 120, age: 6 },
  { id: 'stretch', cat: 'fitness', name: 'Protahování celého těla', sec: 120, age: 6 },
  { id: 'dance', cat: 'fitness', name: 'Zatancuj si na 1 písničku', sec: 180, age: 6 },
  { id: 'rope', cat: 'fitness', name: 'Skákání přes švihadlo', sec: 120, age: 6 },
  { id: 'math', cat: 'mind', name: '10 příkladů z hlavy', sec: 120, age: 6 },
  { id: 'words', cat: 'mind', name: 'Nauč se 5 anglických slovíček', sec: 180, age: 10 },
  { id: 'poem', cat: 'mind', name: 'Nauč se kousek básničky', sec: 180, age: 6 },
  { id: 'draw', cat: 'family', name: 'Nakresli obrázek pro mámu nebo tátu', sec: 300, age: 6 },
  { id: 'note', cat: 'family', name: 'Napiš rodičům milý vzkaz', sec: 120, age: 6 },
  { id: 'plants', cat: 'nature', name: 'Zalij kytky', sec: 120, age: 6 },
  { id: 'pet', cat: 'home', name: 'Nakrm domácího mazlíčka', sec: 120, age: 6 },
  // dlouhé (10–30+ min)
  { id: 'read', cat: 'mind', name: 'Čti knížku 15 minut', sec: 900, age: 6 },
  { id: 'puzzle', cat: 'mind', name: 'Skládej puzzle nebo stavebnici', sec: 900, age: 6 },
  { id: 'room', cat: 'home', name: 'Ukliď celý pokoj', sec: 900, age: 6 },
  { id: 'cook', cat: 'family', name: 'Pomoz s vařením', sec: 1200, age: 6 },
  { id: 'surprise', cat: 'family', name: 'Překvap rodiče (snídaně, úklid…)', sec: 900, age: 10 },
  { id: 'walk', cat: 'nature', name: 'Procházka 30 minut', sec: 1800, age: 6 },
  { id: 'bike', cat: 'nature', name: 'Jízda na kole 30 minut', sec: 1800, age: 6 },
  { id: 'football', cat: 'fitness', name: 'Hraj míčovou hru venku', sec: 1800, age: 6 },
  { id: 'trip', cat: 'nature', name: 'Výlet s rodinou (1 h+)', sec: 3600, age: 6 },
];

function activityReward(a) {
  // krátké 10 XP/5 zl, střední ~25/12, dlouhé až 80/40
  const min = a.sec / 60;
  const xp = Math.round(Math.min(80, 8 + Math.sqrt(min) * 13));
  return { xp, gold: Math.round(xp / 2) };
}

function durationLabel(sec) {
  if (sec < 60) return sec + ' s';
  if (sec < 3600) return Math.round(sec / 60) + ' min';
  return Math.round(sec / 3600) + ' h+';
}

// cond(s) → bool nad stavem hráče
const ACHIEVEMENTS = [
  { id: 'first', name: 'První krok', desc: 'Splň první aktivitu', icon: '👣', gold: 20, cond: s => s.stats.done >= 1 },
  { id: 'ten', name: 'Pilná včelka', desc: 'Splň 10 aktivit', icon: '🐝', gold: 50, cond: s => s.stats.done >= 10 },
  { id: 'fifty', name: 'Nezastavitelný', desc: 'Splň 50 aktivit', icon: '🚀', gold: 150, cond: s => s.stats.done >= 50 },
  { id: 'hundred', name: 'Legenda', desc: 'Splň 100 aktivit', icon: '👑', gold: 300, cond: s => s.stats.done >= 100 },
  { id: 'streak3', name: 'Ohníček', desc: 'Série 3 dny', icon: '🔥', gold: 30, cond: s => s.streak >= 3 },
  { id: 'streak7', name: 'Týden v kuse', desc: 'Série 7 dní', icon: '🔥', gold: 80, cond: s => s.streak >= 7 },
  { id: 'streak30', name: 'Měsíc hrdiny', desc: 'Série 30 dní', icon: '🌋', gold: 400, cond: s => s.streak >= 30 },
  { id: 'fit10', name: 'Sportovec', desc: '10× pohyb', icon: '💪', gold: 50, cond: s => (s.stats.cat.fitness || 0) >= 10 },
  { id: 'mind10', name: 'Chytrá hlava', desc: '10× hlava', icon: '🧠', gold: 50, cond: s => (s.stats.cat.mind || 0) >= 10 },
  { id: 'home10', name: 'Pan/Paní domácí', desc: '10× domácnost', icon: '🧹', gold: 50, cond: s => (s.stats.cat.home || 0) >= 10 },
  { id: 'fam10', name: 'Srdcař', desc: '10× pro rodinu', icon: '💝', gold: 50, cond: s => (s.stats.cat.family || 0) >= 10 },
  { id: 'nat5', name: 'Průzkumník', desc: '5× venku', icon: '🧭', gold: 50, cond: s => (s.stats.cat.nature || 0) >= 5 },
  { id: 'day5', name: 'Super den', desc: '5 aktivit za jeden den', icon: '⭐', gold: 40, cond: s => s.today.count >= 5 },
  { id: 'lvl5', name: 'Úroveň 5', desc: 'Dosáhni úrovně 5', icon: '🎖️', gold: 60, cond: s => levelFromXp(s.xp) >= 5 },
  { id: 'wave5', name: 'Přemožitel bossů', desc: 'Poraz prvního bosse', icon: '🐲', gold: 80, cond: s => s.stats.bosses >= 1 },
  { id: 'wave20', name: 'Neprostupná pevnost', desc: 'Ubraň vlnu 20', icon: '🏰', gold: 250, cond: s => s.stats.bestWave >= 20 },
  { id: 'heroes3', name: 'Parta', desc: 'Najmi 3 hrdiny', icon: '🤝', gold: 60, cond: s => Object.keys(s.heroes).length >= 4 },
];

function levelFromXp(xp) { return Math.floor(Math.sqrt(xp / 50)) + 1; }
function xpForLevel(l) { return 50 * (l - 1) * (l - 1); }

// ---------- Království ----------
const KINGDOMS = {
  fantasy: {
    name: 'Ledové království', icon: '❄️',
    enemy: 'Skřeti', bossName: 'Skřetí náčelník',
    colors: { ground: '#dfefff', ground2: '#c7def5', road: '#b9c9dc', roadEdge: '#9fb3c9', deco: '#ffffff' },
  },
  apocalypse: {
    name: 'Pustina', icon: '☢️',
    enemy: 'Zombie', bossName: 'Obří mutant',
    colors: { ground: '#b59a74', ground2: '#a3875f', road: '#7d7366', roadEdge: '#5f574d', deco: '#8a7350' },
  },
};

// Obranné stavby — stavějí se na stavební místa u cesty.
// type: tower = střílí, barrier = blokuje a zpomaluje, eco = bonus
const BUILDINGS = {
  archer:  { f: ['Lukostřelecká věž', '🏹'], a: ['Kulometné hnízdo', '🔫'], type: 'tower', cost: 60, dmg: 8, range: 110, rate: 0.7, desc: 'Rychlé střely' },
  mage:    { f: ['Ledová věž mága', '🔮'], a: ['Tesla cívka', '⚡'], type: 'tower', cost: 120, dmg: 6, range: 100, rate: 1.0, slow: 0.5, desc: 'Zpomaluje nepřátele', lvl: 3 },
  cannon:  { f: ['Katapult', '🪨'], a: ['Minomet', '💣'], type: 'tower', cost: 160, dmg: 30, range: 130, rate: 2.2, splash: 40, desc: 'Plošné poškození', lvl: 5 },
  barrier: { f: ['Ledová hradba', '🧊'], a: ['Barikáda z vraků', '🚧'], type: 'barrier', cost: 40, hp: 150, desc: 'Zastaví nepřátele na cestě' },
};
const BASE_BUILDINGS = {
  hall:  { f: ['Palác', '🏰'], a: ['Bunkr', '🛖'], desc: 'Srdce pevnosti. Každá úroveň +50 životů.', baseCost: 100 },
  forge: { f: ['Kovárna', '⚒️'], a: ['Dílna', '🔧'], desc: 'Odemyká lepší vybavení v obchodě.', baseCost: 80 },
  tavern:{ f: ['Krčma', '🍺'], a: ['Bar', '🥫'], desc: 'Víc míst pro hrdiny (+1 za úroveň).', baseCost: 90 },
  mine:  { f: ['Krystalový důl', '💎'], a: ['Šrotiště', '⚙️'], desc: '+10 % zlata za ubráněné vlny.', baseCost: 120 },
};

// Hrdinové k najmutí (á la žoldnéři). Stejní hrdinové, jiný vzhled podle království.
const HEROES = [
  { id: 'player', f: ['Ty', '🧑'], a: ['Ty', '🧑'], cls: 'Hlavní hrdina', hp: 100, dmg: 8, range: 90, rate: 0.9, cost: 0, lvl: 1, bio: 'To jsi ty! Čím víc úkolů splníš, tím lepší výbavu si koupíš.', main: true },
  { id: 'knight', f: ['Sir Bořek', '🛡️'], a: ['Šerif Bob', '🤠'], cls: 'Tank', hp: 140, dmg: 8, range: 30, rate: 0.8, cost: 100, lvl: 1, bio: 'Spolehlivý obránce. Drží nepřátele na místě.' },
  { id: 'archer', f: ['Elfka Lia', '🧝‍♀️'], a: ['Ostrostřelkyně Max', '🎯'], cls: 'Střelec', hp: 70, dmg: 12, range: 130, rate: 0.9, cost: 150, lvl: 2, bio: 'Trefí cokoliv na velkou dálku.' },
  { id: 'mage', f: ['Mrazivá Ela', '❄️'], a: ['Doktor Volt', '🧪'], cls: 'Kouzelník', hp: 60, dmg: 10, range: 100, rate: 1.2, splash: 35, cost: 220, lvl: 4, bio: 'Plošné útoky a zpomalení.', slow: 0.6 },
  { id: 'brute', f: ['Trpaslík Grom', '🪓'], a: ['Mechanik Rusty', '🔩'], cls: 'Bojovník', hp: 180, dmg: 16, range: 30, rate: 1.1, cost: 280, lvl: 6, bio: 'Silné rány zblízka.' },
  { id: 'healer', f: ['Víla Rosa', '🧚'], a: ['Zdravotnice Kim', '💉'], cls: 'Léčitel', hp: 70, dmg: 4, range: 90, rate: 1.0, heal: 6, cost: 250, lvl: 5, bio: 'Léčí ostatní hrdiny a pevnost.' },
  { id: 'beast', f: ['Sněžný obr Hugo', '☃️'], a: ['Pes Rex', '🐕'], cls: 'Zvíře', hp: 120, dmg: 11, range: 30, rate: 0.5, cost: 200, lvl: 3, bio: 'Rychlé útoky, věrný parťák.' },
];

// Vybavení: slot weapon/armor/trinket
const ITEMS = [
  { id: 'w1', slot: 'weapon', kingdom: 'fantasy', f: ['Dřevěný meč', '🗡️'], a: ['Trubka', '🔧'], dmg: 3, cost: 40, forge: 0 },
  { id: 'w2', slot: 'weapon', kingdom: 'fantasy', f: ['Ocelový meč', '⚔️'], a: ['Brokovnice', '🔫'], dmg: 7, cost: 120, forge: 1 },
  { id: 'w3', slot: 'weapon', kingdom: 'fantasy', f: ['Ledové kopí', '🔱'], a: ['Laserová puška', '🔦'], dmg: 12, cost: 260, forge: 2 },
  { id: 'w4', slot: 'weapon', kingdom: 'fantasy', f: ['Dračí čepel', '🐉'], a: ['Plazmomet', '☄️'], dmg: 20, cost: 500, forge: 3 },
  { id: 'a1', slot: 'armor', f: ['Kožený kabátek', '🧥'], a: ['Kožená bunda', '🧥'], hp: 25, cost: 40, forge: 0 },
  { id: 'a2', slot: 'armor', f: ['Kroužková zbroj', '🦺'], a: ['Neprůstřelná vesta', '🦺'], hp: 60, cost: 140, forge: 1 },
  { id: 'a3', slot: 'armor', f: ['Plátová zbroj', '🛡️'], a: ['Pancéřový oblek', '🤖'], hp: 120, cost: 320, forge: 2 },
  { id: 't1', slot: 'trinket', f: ['Teplá šála', '🧣'], a: ['Plynová maska', '😷'], hp: 15, dmg: 1, cost: 60, forge: 0 },
  { id: 't2', slot: 'trinket', f: ['Kouzelný amulet', '📿'], a: ['Hodinky Pip', '⌚'], rate: 0.15, cost: 180, forge: 1 },
  { id: 't3', slot: 'trinket', f: ['Koruna mrazu', '👑'], a: ['Helma velitele', '⛑️'], dmg: 5, hp: 40, cost: 400, forge: 3 },
];
const SLOTS = { weapon: 'Zbraň', armor: 'Oblečení', trinket: 'Doplněk' };

// Nepřátelé. Mění se jen vzhled podle království.
const ENEMIES = {
  grunt:  { f: '👺', a: '🧟', hp: 30, speed: 32, dmg: 5, gold: 2 },
  runner: { f: '🐺', a: '🧟‍♀️', hp: 18, speed: 58, dmg: 3, gold: 2 },
  tank:   { f: '👹', a: '🧟‍♂️', hp: 90, speed: 22, dmg: 12, gold: 5 },
  boss:   { f: '🧌', a: '👾', hp: 600, speed: 18, dmg: 40, gold: 40, boss: true },
};

function skin(def, kingdom) { return kingdom === 'fantasy' ? def.f : def.a; }

// ---------- Zbrojnice (Pustina): skutečné zbraně ----------
// Reálné údaje: ráže, kadence (ran/min, prakticky), účinný dostřel (m), poškození (index dle ráže/energie střely).
// Herní hodnoty se z nich počítají: interval mezi výstřely = 40/kadence s (samonabíjecí, opakovací)
// nebo 0.12 + 100/kadence s (automatické – střílí dávky), dostřel = 60 + m/5 px (max 260).
const GUN_CLASSES = {
  pistol:  { name: 'Pistole', icon: '🔫' },
  smg:     { name: 'Samopaly', icon: '💨' },
  rifle:   { name: 'Útočné pušky', icon: '🎯' },
  shotgun: { name: 'Brokovnice', icon: '💥' },
  sniper:  { name: 'Odstřelovačky', icon: '🔭' },
  lmg:     { name: 'Kulomety', icon: '⛓️' },
};
//  id, název, třída, ráže, poškození, kadence, dostřel m, extra
const GUN_TABLE = [
  ['m1911', 'M1911', 'pistol', '.45 ACP', 9, 60, 50],
  ['glock17', 'Glock 17', 'pistol', '9×19 mm', 7, 70, 50],
  ['p226', 'SIG Sauer P226', 'pistol', '9×19 mm', 7.5, 70, 50],
  ['magnum44', 'S&W .44 Magnum', 'pistol', '.44 Magnum', 15, 35, 60],
  ['uzi', 'Uzi', 'smg', '9×19 mm', 5, 600, 100],
  ['mp5', 'MP5', 'smg', '9×19 mm', 5.5, 800, 100],
  ['p90', 'P90', 'smg', '5,7×28 mm', 5.5, 900, 150],
  ['vector', 'Vector .45', 'smg', '.45 ACP', 7, 1200, 60],
  ['tommy', 'Tommy Gun', 'smg', '.45 ACP', 7, 700, 50],
  ['mac10', 'MAC-10', 'smg', '.45 ACP', 6, 1100, 50],
  ['m4a1', 'M4A1', 'rifle', '5,56×45 mm', 8, 800, 500],
  ['m16a4', 'M16A4', 'rifle', '5,56×45 mm', 8.5, 800, 550],
  ['scarh', 'SCAR-H', 'rifle', '7,62×51 mm', 12, 600, 600],
  ['hk416', 'HK416', 'rifle', '5,56×45 mm', 8.5, 850, 500],
  ['f2000', 'FN F2000', 'rifle', '5,56×45 mm', 8, 850, 500],
  ['ak47', 'AK-47', 'rifle', '7,62×39 mm', 10, 600, 350],
  ['ak74', 'AK-74', 'rifle', '5,45×39 mm', 8, 650, 500],
  ['ak12', 'AK-12', 'rifle', '5,45×39 mm', 8.5, 700, 500],
  ['g36c', 'G36C', 'rifle', '5,56×45 mm', 7.5, 750, 200],
  ['qbz95', 'QBZ-95', 'rifle', '5,8×42 mm', 8, 650, 400],
  ['famas', 'FAMAS', 'rifle', '5,56×45 mm', 7.5, 1000, 450],
  ['aug', 'AUG A3', 'rifle', '5,56×45 mm', 8.5, 700, 500],
  ['l85a2', 'L85A2', 'rifle', '5,56×45 mm', 8.5, 650, 500],
  ['galil', 'Galil ACE', 'rifle', '7,62×39 mm', 9.5, 650, 400],
  ['cz805', 'CZ 805 BREN', 'rifle', '5,56×45 mm', 8.5, 750, 500],
  ['r870', 'Remington 870', 'shotgun', '12/70', 24, 40, 40, { splash: 22 }],
  ['m500', 'Mossberg 500', 'shotgun', '12/70', 24, 40, 40, { splash: 22 }],
  ['spas12', 'SPAS-12', 'shotgun', '12/70', 26, 60, 40, { splash: 24 }],
  ['benelli', 'Benelli M4', 'shotgun', '12/70', 24, 80, 50, { splash: 24 }],
  ['saiga12', 'Saiga-12', 'shotgun', '12/70', 22, 120, 40, { splash: 22 }],
  ['svd', 'SVD Dragunov', 'sniper', '7,62×54R', 32, 40, 800],
  ['m24', 'M24', 'sniper', '7,62×51 mm', 40, 25, 800],
  ['awm', 'AWM', 'sniper', '.338 Lapua', 60, 25, 1100],
  ['m82', 'Barrett M82', 'sniper', '12,7×99 mm', 90, 30, 1800],
  ['mosin', 'Mosin-Nagant', 'sniper', '7,62×54R', 34, 20, 500],
  ['m249', 'M249 SAW', 'lmg', '5,56×45 mm', 8, 850, 600, { slow: 0.3 }],
  ['pkm', 'PKM', 'lmg', '7,62×54R', 11, 650, 1000, { slow: 0.3 }],
  ['rpk', 'RPK', 'lmg', '7,62×39 mm', 10, 600, 400],
  ['mg3', 'MG3', 'lmg', '7,62×51 mm', 11, 1200, 1000, { slow: 0.3 }],
  ['m60', 'M60', 'lmg', '7,62×51 mm', 11.5, 550, 1100, { slow: 0.3 }],
];

const GUNS = GUN_TABLE.map(([id, name, cls, caliber, dmg, rpm, meters, extra = {}]) => {
  const auto = rpm >= 300;
  const rate = Math.round((auto ? 0.12 + 100 / rpm : 40 / rpm) * 100) / 100;
  const range = Math.min(260, Math.round(60 + meters / 5));
  const dps = dmg / rate;
  const splashMul = extra.splash ? 1.6 : 1;
  const value = dps * splashMul * Math.sqrt(range / 100) * (extra.slow ? 1.15 : 1);
  const cost = Math.round(value ** 1.35 * 2.2 / 10) * 10;
  // požadovaná úroveň dílny podle síly
  const forge = value < 16 ? 0 : value < 40 ? 1 : value < 55 ? 2 : 3;
  return { id: 'g_' + id, gun: id, auto, slot: 'weapon', cls, caliber, rpm, meters, kingdom: 'apocalypse',
    f: [name, '🔫'], a: [name, '🔫'], img: 'img/guns/' + id + '.webp',
    dmg, rate, range, cost, forge, ...extra };
});
ITEMS.push(...GUNS);
