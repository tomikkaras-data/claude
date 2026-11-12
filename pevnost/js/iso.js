// Izometrická základna pro Pustinu: Slovanský ostrov v Praze po jaderné válce. Zombie přicházejí dvěma vstupy z nábřeží. Stavění funguje jako vesnice v Cave Man RPG:
// záložky Stavby / Dekorace / Malování, nová věc se položí na nejbližší volné místo,
// pak ji můžeš posunout, otočit (⇋), potvrdit (✔) nebo zrušit (✖). Mapa se dá posouvat,
// přibližovat (+ / −, kolečko, dva prsty, WASD) a v rohu je minimapa.
// Vlastní grafiku stačí nahrát do img/buildings/<id>.png (viz README) – nahradí kreslené budovy.
'use strict';

const ISO = {
  T: 30,          // velikost políčka ve „světových“ jednotkách herní logiky
  G: 64,          // mapa G×G políček
  HW: 32, HH: 16, // polovina šířky/výšky dlaždice v pixelech (při zoomu 1)
};
const ISO_ZOOMS = [0.16, 0.22, 0.3, 0.4, 0.55, 0.75, 1, 1.3, 1.7];

// Mapa je Slovanský ostrov v Praze po jaderné válce. Počítá se v „mapových“ souřadnicích
// (u = západ→východ, v = sever→jih, 1 jednotka = 1 políčko ≈ 7 m); sever je na obrazovce nahoře.
const ISO_C = 32;
const MTf = (u, v) => [ISO_C + (v + u) * Math.SQRT1_2, ISO_C + (v - u) * Math.SQRT1_2];
const MT = (u, v) => MTf(u, v).map(Math.round);
const ISLAND_LEN = 56;                       // ostrov měří 56 políček od severu k jihu
const ISLAND_W = [[0, 0], [0.03, 3.5], [0.12, 5.5], [0.3, 6.2], [0.5, 6.5], [0.6, 5], [0.68, 3.2], [0.75, 3], [0.8, 3.6], [0.88, 2.6], [0.97, 1.5], [1, 0]];
const bankU = v => 7.5 + 3.5 * (v + 28) / 56 + 0.3 * Math.sin(v * 0.5); // nábřeží (východní břeh)

// Dva vstupy na ostrov jako ve skutečnosti: můstek k Žofínu na severu a Mánes na jihu.
const ROUTE_N = [[20, -17], [9, -17], [2, -17], [2.5, -14], [2.5, -5], [3, 2], [1, 5], [-1, 5]];
const ROUTE_S = [[26, 18.5], [11.5, 18.5], [4, 18.5], [2.2, 14], [1.5, 9], [-1, 5]]; // lávka těsně pod Mánesem
const ISO_PATHS = [ROUTE_N.map(p => MT(...p)), ROUTE_S.map(p => MT(...p))];
const ISO_HQ = { gx: MT(-1, 1.5)[0] - 1, gy: MT(-1, 1.5)[1] - 1 };
const ISO_HOMES = { tavern: MT(-4, 4), forge: MT(3.5, 7), mine: MT(-1, 10) };
// Parkové cestičky (jen na ozdobu)
const ISO_WALKS = [
  [[2, -17], [-1, -18], [-4, -21], [-4.5, -24], [-2, -26], [0, -23], [1, -19], [2, -17]],
  [[2.5, -5], [4.5, -2], [3, 2]], [[-1, 5], [-4, 3], [-5, -3], [-6, -6]],
  [[1.5, 9], [-2, 8], [-3.5, 5]], [[4, 18.5], [3.5, 24], [3, 27]],
];

// Budovy: rozměr (w×d políček), výška a styl kreslení.
const ISO_DEFS = {
  hall:     { w: 3, d: 2, h: 30, style: 'bunker' },
  tavern:   { w: 3, d: 2, h: 22, style: 'barracks' },
  forge:    { w: 3, d: 2, h: 30, style: 'hangar' },
  mine:     { w: 2, d: 2, h: 10, style: 'yard' },
  archer:   { w: 1, d: 1, h: 12, style: 'nest' },
  mage:     { w: 1, d: 1, h: 40, style: 'tesla' },
  cannon:   { w: 1, d: 1, h: 12, style: 'mortar' },
  barrier:  { w: 1, d: 1, h: 12, style: 'barricade', road: true },
};

// Stavby z harampádí (jen v Pustině). Každá něco umí – viz `fx`.
const ISO_EXTRA = {
  guardtower: { name: 'Dřevěná strážní věž', icon: '🗼', cost: 140, lvl: 2, w: 1, d: 1, h: 46, type: 'tower', dmg: 9, range: 150, rate: 0.8, desc: 'Střílí daleko přes zdi' },
  windmill:   { name: 'Větrník z harampádí', icon: '🌀', cost: 150, max: 2, w: 1, d: 1, h: 62, fx: { rate: 0.1 }, desc: 'Elektřina: věže střílí o 10 % rychleji' },
  tent:       { name: 'Malý stan', icon: '⛺', cost: 80, max: 3, w: 1, d: 1, h: 16, fx: { heroSlots: 1 }, desc: '+1 místo pro hrdinu' },
  armytent:   { name: 'Vojenský stan', icon: '🏕️', cost: 200, max: 2, w: 2, d: 2, h: 24, fx: { heroSlots: 2 }, desc: '+2 místa pro hrdiny' },
  house:      { name: 'Opravený dům', icon: '🏠', cost: 300, max: 3, w: 2, d: 2, h: 26, fx: { heroSlots: 1, baseHp: 40 }, desc: '+1 hrdina, +40 životů základny' },
  ruin:       { name: 'Zničený dům', icon: '🏚️', cost: 20, w: 2, d: 2, h: 18, desc: 'Jen ozdoba (trosky)' },
  lookout:    { name: 'Pískovcová vyhlídka', icon: '🏯', cost: 180, max: 1, lvl: 3, w: 1, d: 1, h: 44, fx: { heroRange: 0.2 }, desc: 'Hrdinové vidí dál: +20 % dostřel' },
  containers: { name: 'Kontejnery z doků', icon: '📦', cost: 120, max: 3, w: 2, d: 1, h: 22, fx: { gold: 0.1 }, desc: 'Sklad: +10 % zlata za vlny' },
};
for (const [id, e] of Object.entries(ISO_EXTRA)) ISO_DEFS[id] = { w: e.w, d: e.d, h: e.h, style: id };

// Dekorace = malované obrázky z img/sprites/<sp>.webp (s = zmenšení, water = patří na vodu).
// Pár plotů zůstává kreslených. Památky (landmark) hráč nestaví.
const SP = (name, group, cost, sp, extra) => ({ name, group, cost, sp, s: 0.42, h: 30, ...extra });
const ISO_DECOR = {
  dead1: SP('Mrtvý strom', 'trees', 6, 'dead1', { s: 0.46, h: 80 }), dead2: SP('Suchý strom', 'trees', 6, 'dead2', { s: 0.46, h: 80 }),
  dead3: SP('Spálený strom', 'trees', 6, 'dead3', { s: 0.46, h: 80 }), dead4: SP('Holý kmen', 'trees', 5, 'dead4', { s: 0.46, h: 60 }),
  stump: SP('Pařez', 'trees', 3, 'stump'), log: SP('Padlý kmen', 'trees', 3, 'log'),
  aut1: SP('Podzimní dub', 'trees', 12, 'aut1', { s: 0.46, h: 80 }), aut2: SP('Podzimní stromek', 'trees', 10, 'aut2', { s: 0.46, h: 70 }),
  aut3: SP('Bříza', 'trees', 10, 'aut3', { s: 0.46, h: 90 }), aut4: SP('Červený javor', 'trees', 12, 'aut4', { s: 0.46, h: 80 }),
  tree_s1: SP('Zelený dub', 'trees', 20, 'tree_s1', { s: 0.46, h: 80 }), tree_s2: SP('Zelený stromek', 'trees', 16, 'tree_s2', { s: 0.46, h: 70 }),
  tree_s3: SP('Lípa', 'trees', 20, 'tree_s3', { s: 0.46, h: 80 }), poplar: SP('Topol', 'trees', 20, 'poplar', { s: 0.46, h: 100 }), willow: SP('Vrba', 'trees', 24, 'willow', { s: 0.46, h: 80 }),
  wreck1: SP('Rezavý vrak', 'cars', 15, 'wreck1'), wreck2: SP('Vyhořelý vrak', 'cars', 15, 'wreck2'), wreck3: SP('Zarostlý vrak', 'cars', 15, 'wreck3'),
  wreck_van: SP('Vrak dodávky', 'cars', 18, 'wreck_van'), wreck_bus: SP('Vrak autobusu', 'cars', 30, 'wreck_bus', { w: 2, h: 50 }),
  dmg_white: SP('Rozbité auto', 'cars', 20, 'dmg_white'), dmg_red: SP('Rozbité červené auto', 'cars', 20, 'dmg_red'), dmg_blue: SP('Rozbité modré auto', 'cars', 20, 'dmg_blue'),
  dmg_yellow: SP('Rozbité žluté auto', 'cars', 20, 'dmg_yellow'), dmg_jeep: SP('Rozbitý džíp', 'cars', 24, 'dmg_jeep'), dmg_van: SP('Rozbitá dodávka', 'cars', 24, 'dmg_van'),
  car_white: SP('Bílé auto', 'cars', 40, 'car_white'), car_red: SP('Červené auto', 'cars', 40, 'car_red'), car_blue: SP('Modré auto', 'cars', 40, 'car_blue'),
  car_yellow: SP('Žluté auto', 'cars', 40, 'car_yellow'), jeep: SP('Džíp', 'cars', 50, 'jeep'), van: SP('Dodávka', 'cars', 50, 'van'),
  police: SP('Policejní auto', 'cars', 60, 'police'), ambulance: SP('Sanitka', 'cars', 60, 'ambulance'), truck: SP('Náklaďák', 'cars', 70, 'truck', { h: 45 }),
  plow: SP('Pluh', 'cars', 70, 'plow', { h: 45 }), bus: SP('Autobus', 'cars', 80, 'bus', { w: 2, h: 50 }),
  swing1: SP('Houpačky', 'play', 15, 'swing1', { h: 50 }), swing2: SP('Rozbité houpačky', 'play', 10, 'swing2', { h: 40 }), dome: SP('Prolézačka', 'play', 15, 'dome'),
  slide: SP('Skluzavka', 'play', 20, 'slide', { h: 60 }), seesaw: SP('Houpačka', 'play', 10, 'seesaw'), carousel: SP('Kolotoč', 'play', 15, 'carousel'),
  sandbox: SP('Pískoviště', 'play', 10, 'sandbox', { base: 12 }), horse: SP('Koník', 'play', 8, 'horse'), tunnel: SP('Tunel', 'play', 8, 'tunnel'),
  bench: SP('Lavička', 'props', 6, 'bench'), lamp2: SP('Lampa', 'props', 8, 'lamp2', { h: 44 }), pole: SP('Sloup', 'props', 5, 'pole', { h: 48 }),
  bollard1: SP('Patník', 'props', 3, 'bollard1'), chain: SP('Řetěz', 'props', 5, 'chain'), bin: SP('Koš', 'props', 4, 'bin'), barrel: SP('Sud', 'props', 4, 'barrel'),
  planter1: SP('Květináč', 'props', 6, 'planter1'), planter2: SP('Velký květináč', 'props', 8, 'planter2'), bikerack: SP('Stojan na kola', 'props', 5, 'bikerack'),
  board: SP('Vývěska', 'props', 10, 'board', { h: 50 }), column: SP('Plakátovací sloup', 'props', 12, 'column', { h: 54 }), ebox: SP('Rozvaděč', 'props', 6, 'ebox'),
  manhole: SP('Kanál', 'props', 2, 'manhole', { base: 14 }), grate: SP('Mříž', 'props', 2, 'grate', { base: 14 }),
  rubble1: SP('Suť', 'props', 4, 'rubble1'), rubble2: SP('Hromada cihel', 'props', 4, 'rubble2'), pallet: SP('Paleta cihel', 'props', 6, 'pallet'),
  boat1: SP('Loďka', 'boats', 15, 'boat1', { water: true, base: 10 }), boat2: SP('Pramice', 'boats', 15, 'boat2', { water: true, base: 10 }),
  boat_cover: SP('Loď pod plachtou', 'boats', 20, 'boat_cover', { water: true, base: 10 }), motorboat: SP('Motorový člun', 'boats', 50, 'motorboat', { water: true, base: 10, w: 2 }),
  boat_wreck: SP('Vrak lodi', 'boats', 15, 'boat_wreck', { water: true, base: 10, w: 2 }),
  fence:      { name: 'Plot z pletiva', group: 'walls', cost: 5, h: 16, icon: '🔗' },
  sandbags:   { name: 'Pytle s pískem', group: 'walls', cost: 8, h: 8, icon: '🟫' },
  concrete:   { name: 'Betonový zátaras', group: 'walls', cost: 10, h: 10, icon: '🧱' },
  sign:       { name: 'Výstražná cedule', group: 'walls', cost: 3, h: 20, icon: '⚠️' },
  zofin:      { name: 'Palác Žofín', group: 'ruins', h: 44, w: 6, d: 6, landmark: true },
  manes:      { name: 'Mánes a Šítkovská věž', group: 'ruins', h: 60, w: 4, d: 6, landmark: true },
  divadlo:    { name: 'Národní divadlo', group: 'ruins', h: 70, w: 3, d: 9, landmark: true },
  dockyard:   SP('Loděnice', 'boats', 0, 'dockyard', { s: 0.5, w: 5, d: 5, h: 90, base: 64, landmark: true }),
};
const ISO_DECOR_GROUPS = [['trees', '🌳 Stromy'], ['cars', '🚗 Auta'], ['play', '🛝 Hřiště'], ['props', '🪑 Město'], ['boats', '⛵ Lodě'], ['walls', '🔗 Ploty']];

// Malování země (záložka Malování). P a Q jsou cesty – napojují se na sousední políčka.
const ISO_BRUSHES = {
  P: { name: 'Prašná cesta', color: '#7c6443', road: true },
  Q: { name: 'Silnice', color: '#4c4a46', road: true },
  S: { name: 'Písek', color: '#c4a46c' },
  D: { name: 'Vyprahlá zem', color: '#a7865a' },
  G: { name: 'Suchá tráva', color: '#8f8848' },
  X: { name: 'Popel', color: '#6f6a61' },
  R: { name: 'Štěrk', color: '#8d8478' },
  A: { name: 'Asfalt', color: '#5a5853' },
  C: { name: 'Beton', color: '#9c9a92' },
  K: { name: 'Nábřeží', color: '#6a665f', hidden: true },
};
const ROAD_COLOR = '#7c6443';
const WATER = { deep: '#2f3e3c', mid: '#3d4f4a', shallow: '#56655a' }; // kalná řeka po válce

const IsoMap = {
  cam: null, placing: null, imgs: {}, tab: 'build', decorFilter: 'all', brush: 'P', brushSize: 1, paintMode: true,

  // ---------- rozvržení pro herní logiku ----------
  makePath(tiles) {
    const T = ISO.T, pts = tiles.map(([x, y]) => [(x + 0.5) * T, (y + 0.5) * T]);
    const segs = []; let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], l = Math.hypot(x2 - x1, y2 - y1);
      segs.push({ x1, y1, x2, y2, l, s: len }); len += l;
    }
    const at = d => {
      d = Math.max(0, Math.min(len, d));
      for (const g of segs) if (d <= g.s + g.l) { const t = (d - g.s) / g.l; return [g.x1 + (g.x2 - g.x1) * t, g.y1 + (g.y2 - g.y1) * t]; }
      return pts[pts.length - 1];
    };
    const nearest = (x, y) => {
      let best = 0, bd = 1e9;
      for (let d = 0; d <= len; d += 3) { const [px, py] = at(d), q = Math.hypot(px - x, py - y); if (q < bd) { bd = q; best = d; } }
      return best;
    };
    return { at, len, start: pts[0], nearest };
  },

  init() {
    const paths = ISO_PATHS.map(t => this.makePath(t)), A = paths[0], T = ISO.T;
    this.layout = {
      paths, at: A.at, len: A.len, start: A.start, nearest: A.nearest, heroOff: 10,
      base: [(ISO_HQ.gx + 1.5) * T, (ISO_HQ.gy + 1) * T],
      // hrdinové hlídají obě cesty kousek před velitelstvím
      rally: i => { const p = paths[i % 2]; return p.at(p.len * (0.93 - 0.09 * Math.floor(i / 2))); },
    };
    this.road = new Set();
    for (const pts of ISO_PATHS) for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 4);
      for (let k = 0; k <= n; k++) this.road.add(Math.floor(x1 + 0.5 + (x2 - x1) * k / n) + ',' + Math.floor(y1 + 0.5 + (y2 - y1) * k / n));
    }
    const end = ISO_PATHS[0][ISO_PATHS[0].length - 1];
    this.roadEnd = end.join(',');
    this.baseTiles = this.defaultTiles();
  },

  // 'I' = ostrov, 'K' = nábřeží s městem (tam se nestaví), 'W' = Vltava
  terrain(gx, gy) {
    const dx = gx - ISO_C, dy = gy - ISO_C, u = (dx - dy) * Math.SQRT1_2, v = (dx + dy) * Math.SQRT1_2;
    if (u > bankU(v)) return 'K';
    const t = (v + ISLAND_LEN / 2) / ISLAND_LEN;
    if (t < 0 || t > 1) return 'W';
    let i = 1; while (ISLAND_W[i][0] < t) i++;
    const [t0, w0] = ISLAND_W[i - 1], [t1, w1] = ISLAND_W[i];
    const hw = w0 + (w1 - w0) * (t - t0) / (t1 - t0) + 0.4 * Math.sin(v * 0.9);
    return Math.abs(u - (-3 + 6 * t)) < hw ? 'I' : 'W';
  },

  // Výchozí povrch: spálený park (popel, vyprahlá zem, suchá tráva), písčité břehy, dlažba kolem Žofína.
  defaultTiles() {
    const G = ISO.G, r = rng(99), tiles = [];
    const noise = (seed, scale) => {
      const g = [], n = Math.ceil(G / scale) + 2, rr = rng(seed);
      for (let i = 0; i < n * n; i++) g.push(rr());
      return (x, y) => {
        const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const v = (a, b) => g[(b % n) * n + (a % n)];
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        return (v(ix, iy) * (1 - sx) + v(ix + 1, iy) * sx) * (1 - sy) + (v(ix, iy + 1) * (1 - sx) + v(ix + 1, iy + 1) * sx) * sy;
      };
    };
    const n1 = noise(5, 4), n2 = noise(17, 3), n3 = noise(31, 2.5), n4 = noise(47, 3.5);
    const near = (x, y, [cx, cy], d) => Math.hypot(x - cx, y - cy) < d;
    const hq = [ISO_HQ.gx + 1.5, ISO_HQ.gy + 1], zof = MT(-2.5, -10), play = MT(1.5, 8);
    for (let y = 0; y < G; y++) {
      const row = [];
      for (let x = 0; x < G; x++) {
        const k = this.terrain(x, y);
        if (k !== 'I') { row.push(k); continue; }
        let t = 'D';
        if (n1(x, y) > 0.48) t = 'G';
        if (n4(x, y) > 0.6) t = 'X';
        if (n2(x, y) > 0.74) t = 'S';
        if (n3(x, y) > 0.84 && r() < 0.7) t = 'R';
        const shore = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.terrain(x + dx, y + dy) === 'W');
        if (near(x, y, zof, 6)) t = r() < 0.75 ? 'C' : 'R';   // dlažba kolem paláce
        if (near(x, y, play, 2.2)) t = 'S';                   // bývalé hřiště
        if (near(x, y, hq, 3.2)) t = 'A';
        if (shore) t = r() < 0.6 ? 'S' : 'R';
        row.push(t);
      }
      tiles.push(row);
    }
    return tiles;
  },

  buildable(gx, gy) { const t = (this.baseTiles[gy] || [])[gx]; return !!t && t !== 'W' && t !== 'K'; },

  tileAt(gx, gy) {
    const base = (this.baseTiles[gy] || [])[gx];
    if (!base || base === 'W' || base === 'K') return base || 'W';
    const kd = Game.kd(), p = kd.iso && kd.iso.paint && kd.iso.paint[gx + ',' + gy];
    return p || base;
  },

  // ---------- stav ----------
  ensure(kd) {
    if (!this.layout) this.init();
    if (kd.iso && kd.iso.v === 6) return kd.iso;
    const old = kd.iso, same = old && old.v >= 4;   // od verze 4 je mapa stejný ostrov
    if (old && !same) for (const p of old.placed || []) { const b = BUILDINGS[p.id] || ISO_EXTRA[p.id]; if (b) Store.state.gold += b.cost; }
    kd.slots.forEach((id, i) => { if (id) { Store.state.gold += BUILDINGS[id].cost; kd.slots[i] = null; } });
    kd.iso = {
      v: 6, paint: same ? old.paint || {} : {},
      placed: same ? old.placed : [{ id: 'hall', gx: ISO_HQ.gx, gy: ISO_HQ.gy }],
      // z dřívějška zůstane jen to, co postavil hráč a co ještě existuje (ploty, pytle...)
      decor: same ? old.decor.filter(o => !o.fixed && !o.auto && ISO_DECOR[o.id] && !ISO_DECOR[o.id].sp) : [],
    };
    this.ver = (this.ver || 0) + 1;
    const mine = kd.iso.decor; kd.iso.decor = [];
    this.landmarks(kd);
    // hráčovy věci, které by stály v nové památce, vrátíme
    const occ = this.occupied(kd), hit = (kind, o) => { const [w, d] = this.size(kind, o.id, o.flip); for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) if (occ.has((o.gx + x) + ',' + (o.gy + y)) && occ.get((o.gx + x) + ',' + (o.gy + y)).o !== o) return true; return false; };
    kd.iso.placed = kd.iso.placed.filter(o => { if (o.id === 'hall' || !hit('build', o)) return true; const b = BUILDINGS[o.id] || ISO_EXTRA[o.id]; if (b) Store.state.gold += b.cost; else kd.base[o.id] = 0; return false; });
    kd.iso.decor.push(...mine.filter(o => !hit('decor', o)));
    if (!same) for (const id of ['tavern', 'forge', 'mine']) {
      if (kd.base[id] > 0) { const spot = this.nearestFree(kd, 'build', id, ...ISO_HOMES[id], null, false); if (spot) kd.iso.placed.push({ id, gx: spot[0], gy: spot[1] }); }
    }
    this.scatterDecor(kd);
    return kd.iso;
  },

  // Položí dekoraci, pokud je místo volné (i na nábřeží nebo na vodu). Vrací true, když se povedlo.
  drop(kd, id, gx, gy, extra) {
    const df = ISO_DECOR[id], [w, d] = this.size('decor', id, extra && extra.flip), occ = this.occupied(kd);
    for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
      const cx = gx + x, cy = gy + y, k = cx + ',' + cy, t = (this.baseTiles[cy] || [])[cx];
      if (!t || occ.has(k) || this.road.has(k) || (t === 'W') !== !!(df.water || (extra && extra.onWater))) return false;
    }
    kd.iso.decor.push({ id, gx, gy, auto: true, ...extra });
    return true;
  },

  // Pevné památky (nejdou přesunout): malovaný Žofín, Mánes s věží, Národní divadlo a loděnice s loďkami.
  landmarks(kd) {
    const d = kd.iso.decor, fix = (id, [gx, gy], extra) => d.push({ id, gx, gy, fixed: true, ...extra });
    const z = MT(-2.5, -10); fix('zofin', [z[0] - 3, z[1] - 3]);
    const m = MT(7.4, 13.6); fix('manes', [m[0] - 2, m[1] - 3]);
    const nd = MT(bankU(-24.5) + 6.9, -24.5); fix('divadlo', [nd[0] - 1, nd[1] - 4]);
    const dk = MT(-9.7, -4); fix('dockyard', [dk[0] - 2, dk[1] - 2]);
    for (const [id, u, v, flip] of [['boat1', -8.8, -22, false], ['boat2', -9.4, -20, true], ['boat_cover', -8.6, -18, false], ['motorboat', -14.5, -3, false],
      ['boat1', -13, 0.5, true], ['boat2', -9.5, 1.5, false], ['boat_wreck', 6.2, 2, false], ['boat_wreck', -6.5, 14, true], ['boat1', 5.6, -9, true]]) fix(id, MT(u, v), { flip });
  },

  // Výchozí rozmístění: spálený park, zničené hřiště, lavičky a lampy u cestiček, vraky a suť na nábřeží.
  scatterDecor(kd) {
    const r = rng(2024), G = ISO.G, pick = a => a[Math.floor(r() * a.length)], flip = () => ({ flip: r() < 0.5 });
    const hq = [ISO_HQ.gx + 1.5, ISO_HQ.gy + 1], island = (x, y) => this.buildable(x, y);
    const DEAD = ['dead1', 'dead2', 'dead3', 'dead4', 'dead1', 'dead3'], AUT = ['aut1', 'aut2', 'aut3', 'aut4'];
    const WRECK = ['wreck1', 'wreck2', 'wreck3', 'wreck_van', 'dmg_white', 'dmg_red', 'dmg_blue', 'dmg_yellow', 'dmg_jeep', 'dmg_van'];
    // zničené hřiště na jihu parku
    [['swing1', 0, 7], ['slide', 2.6, 6.6], ['dome', 0.4, 9], ['seesaw', 3, 8.6], ['carousel', 1.6, 7.6], ['sandbox', 2.2, 10], ['horse', 0.4, 10.6], ['tunnel', 3.4, 10.4], ['swing2', -1.2, 8.6]]
      .forEach(([id, u, v]) => this.drop(kd, id, ...MT(u, v)));
    // u Žofína: plakátovací sloup, vývěska, květináče, stojan na kola
    [['column', 2, -8.5], ['board', 1.6, -12.5], ['planter2', 1.2, -6.4], ['planter1', 1.4, -14], ['bikerack', -1, -5.4], ['bench', 1.6, -10.4], ['lamp2', 1.4, -7.4], ['lamp2', 1.2, -13.2]]
      .forEach(([id, u, v]) => this.drop(kd, id, ...MT(u, v)));
    // lavičky, lampy a koše podél cestiček
    for (let k = 0, tries = 0; k < 26 && tries < 3000; tries++) {
      const gx = Math.floor(r() * G), gy = Math.floor(r() * G);
      if (!island(gx, gy) || this.road.has(gx + ',' + gy) || !this.nearRoad(gx, gy, 1) || Math.hypot(gx - hq[0], gy - hq[1]) < 5) continue;
      if (this.drop(kd, pick(['bench', 'lamp2', 'bench', 'bin', 'lamp2', 'bollard1']), gx, gy, flip())) k++;
    }
    // park: hlavně mrtvé stromy, pár jich přežilo
    const scatter = (ids, n, ok) => { for (let k = 0, tries = 0; k < n && tries < 6000; tries++) { const gx = Math.floor(r() * G), gy = Math.floor(r() * G); if (ok(gx, gy) && this.drop(kd, pick(ids), gx, gy, flip())) k++; } };
    const park = (x, y) => island(x, y) && !this.nearRoad(x, y, 1) && Math.hypot(x - hq[0], y - hq[1]) > 5;
    scatter(DEAD, 95, park); scatter(AUT, 16, park); scatter(['tree_s2', 'willow', 'tree_s3'], 5, park);
    scatter(['stump', 'log'], 16, park); scatter(['rubble1', 'rubble2'], 14, park); scatter(['barrel', 'pallet', 'wreck3'], 6, park);
    // nábřeží: vraky na ulici, stromořadí, lampy, patníky u vody, suť po domech
    const fixed = () => ({ fixed: true, flip: r() < 0.5 });
    for (let v = -42; v <= 44; v += 1.6) {
      const b = bankU(v);
      if (r() < 0.55) this.drop(kd, pick([...WRECK, 'wreck1', 'wreck2']), ...MT(b + 1 + r() * 1.4, v), fixed());
      if (Math.round(v * 10) % 3 === 0) this.drop(kd, pick([...DEAD, ...AUT, 'dead2']), ...MT(b + 3.4, v), fixed());
      if (Math.round(v / 1.6) % 4 === 0) this.drop(kd, 'lamp2', ...MT(b + 0.4, v + 0.5), fixed());
      else if (r() < 0.4) this.drop(kd, pick(['bollard1', 'chain']), ...MT(b + 0.4, v), fixed());
    }
    [['wreck_bus', -8], ['bus', 9], ['ambulance', -19], ['police', -15.5], ['truck', 20], ['plow', 30], ['wreck_bus', 26]].forEach(([id, v]) => this.drop(kd, id, ...MT(bankU(v) + 1.6, v), { fixed: true }));
    for (const [u, v] of [[13, -17.9], [16.5, -16.2], [14, 19.4], [18, 17.6], [22, 19.3]]) this.drop(kd, pick(WRECK), ...MT(u, v), fixed());
    const city = (x, y) => { const dx = x - ISO_C, dy = y - ISO_C, u = (dx - dy) * Math.SQRT1_2, v = (dx + dy) * Math.SQRT1_2; return (this.baseTiles[y] || [])[x] === 'K' && u > bankU(v) + 4.5 && !this.nearRoad(x, y, 1); };
    for (const [ids, n] of [[['rubble1', 'rubble2', 'rubble1', 'pallet'], 110], [WRECK, 30], [DEAD, 40], [['ebox', 'bin', 'barrel', 'manhole', 'grate', 'pole'], 30]])
      for (let k = 0, tries = 0; k < n && tries < 8000; tries++) { const gx = Math.floor(r() * G), gy = Math.floor(r() * G); if (city(gx, gy) && this.drop(kd, pick(ids), gx, gy, fixed())) k++; }
  },

  nearRoad(gx, gy, m) {
    for (let dy = -m; dy <= m; dy++) for (let dx = -m; dx <= m; dx++) if (this.road.has((gx + dx) + ',' + (gy + dy))) return true;
    return false;
  },

  def(kind, id) { return kind === 'decor' ? ISO_DECOR[id] : ISO_DEFS[id]; },
  size(kind, id, flip) {
    const d = this.def(kind, id), w = d.w || 1, dd = d.d || 1;
    return flip ? [dd, w] : [w, dd];
  },

  objects(kd) {
    const iso = kd.iso;
    return [...iso.placed.map((o, index) => ({ kind: 'build', index, o })), ...iso.decor.map((o, index) => ({ kind: 'decor', index, o }))];
  },

  occupied(kd, skipObj) {
    const iso = kd.iso, key = iso.placed.length + '|' + iso.decor.length + '|' + (this.ver || 0), oc = this._oc;
    if (oc && oc.iso === iso && oc.key === key && oc.skip === skipObj) return oc.map;
    const occ = new Map();
    for (const it of this.objects(kd)) {
      if (it.o === skipObj) continue;
      const [w, d] = this.size(it.kind, it.o.id, it.o.flip);
      for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) occ.set((it.o.gx + x) + ',' + (it.o.gy + y), it);
    }
    this._oc = { iso, key, skip: skipObj, map: occ };
    return occ;
  },

  canPlace(kd, kind, id, gx, gy, skipObj, flip) {
    const df = this.def(kind, id), [w, d] = this.size(kind, id, flip), occ = this.occupied(kd, skipObj);
    for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
      const cx = gx + x, cy = gy + y, k = cx + ',' + cy;
      if (cx < 0 || cy < 0 || cx >= ISO.G || cy >= ISO.G || occ.has(k)) return false;
      if (df.road) { if (!this.road.has(k) || k === this.roadEnd) return false; continue; }
      if (df.water) { if (this.baseTiles[cy][cx] !== 'W') return false; continue; }   // lodě patří na vodu
      if (this.road.has(k) || !this.buildable(cx, cy)) return false; // ne na cestu, do vody ani do města
    }
    return true;
  },

  // Nejbližší volné místo kolem (gx, gy) – po kruzích, jako v Cave Man RPG
  nearestFree(kd, kind, id, gx, gy, skipObj, flip) {
    for (let r = 0; r < ISO.G * 2; r++) {
      let best = null, bd = 1e9;
      for (let y = gy - r; y <= gy + r; y++) for (let x = gx - r; x <= gx + r; x++) {
        if (Math.max(Math.abs(x - gx), Math.abs(y - gy)) !== r) continue;
        const dd = Math.hypot(x - gx, y - gy);
        if (dd < bd && this.canPlace(kd, kind, id, x, y, skipObj, flip)) { best = [x, y]; bd = dd; }
      }
      if (best) return best;
    }
    return null;
  },

  // Co dávají stavby z harampádí (místa pro hrdiny, rychlost věží, dostřel, zlato, životy)
  bonus(kd) {
    const b = { heroSlots: 0, baseHp: 0, rate: 0, heroRange: 0, gold: 0 };
    if (!kd.iso || kd.iso.v !== 6) return b;
    for (const p of kd.iso.placed) { const fx = (ISO_EXTRA[p.id] || {}).fx; if (fx) for (const k in fx) b[k] += fx[k]; }
    return b;
  },

  count(kd, id) { return kd.iso.placed.filter(p => p.id === id).length; },

  defenders(kd, towers, barriers) {
    const T = ISO.T, L = this.layout;
    this.ensure(kd).placed.forEach((p, i) => {
      const b = BUILDINGS[p.id] || ISO_EXTRA[p.id]; if (!b) return;
      const [w, d] = this.size('build', p.id, p.flip), x = (p.gx + w / 2) * T, y = (p.gy + d / 2) * T;
      if (b.type === 'tower') towers.push({ slot: i, id: p.id, b, x, y, cd: 0 });
      if (b.type === 'barrier') {
        // zátaras blokuje každou cestu, která kolem něj vede (most je pro obě strany)
        const ds = new Map();
        for (const path of L.paths) { const dd = path.nearest(x, y), [px, py] = path.at(dd); if (Math.hypot(px - x, py - y) < 20) ds.set(path, dd); }
        barriers.push({ slot: i, x, y, ds, hp: b.hp, max: b.hp });
      }
    });
  },

  // ---------- stavění (jako v Cave Man RPG) ----------
  // Nová věc z menu se položí na volné místo nejblíž středu obrazovky; pak ji posuneš a potvrdíš.
  startNew(kind, id, cost) {
    const ex = ISO_EXTRA[id];
    if (ex && ex.max && this.count(Game.kd(), id) >= ex.max) return UI.toast(`${ex.name}: můžeš mít nejvýš ${ex.max}`);
    const kd = Game.kd(), [cx, cy] = this.screenToTile(this.cw / 2, this.ch / 2);
    const spot = this.nearestFree(kd, kind, id, cx, cy, null, false);
    if (!spot) return UI.toast('Na mapě už není místo 😮');
    this.placing = { kind, id, cost, gx: spot[0], gy: spot[1], flip: false, obj: null };
    this.keepInView();
    this.changed();
  },

  // Klepnutí na věc na mapě ji zvedne – můžeš ji posunout, otočit nebo odstranit.
  pickUp(it) {
    this.placing = { kind: it.kind, id: it.o.id, cost: 0, gx: it.o.gx, gy: it.o.gy, flip: !!it.o.flip, obj: it.o, index: it.index };
    this.changed();
  },

  placingOk() {
    const p = this.placing;
    return p && this.canPlace(Game.kd(), p.kind, p.id, p.gx, p.gy, p.obj, p.flip);
  },

  confirm() {
    const p = this.placing, kd = Game.kd();
    if (!this.placingOk()) return;
    this.ver = (this.ver || 0) + 1;
    if (p.obj) Object.assign(p.obj, { gx: p.gx, gy: p.gy, flip: p.flip });
    else {
      if (!Game.spend(p.cost)) return;
      const o = { id: p.id, gx: p.gx, gy: p.gy, flip: p.flip };
      if (p.kind === 'decor') kd.iso.decor.push(o);
      else { kd.iso.placed.push(o); if (p.id in BASE_BUILDINGS) kd.base[p.id] = Math.max(1, kd.base[p.id]); }
    }
    this.placing = null;
    Store.changed(); UI.refresh(); Battle.setupDefenders(); this.changed(true);
  },

  flip() {
    const p = this.placing; if (!p) return;
    p.flip = !p.flip; this.changed();
  },

  cancel() { this.placing = null; this.changed(true); },

  remove() {
    const p = this.placing, kd = Game.kd(); if (!p || !p.obj) return;
    if (p.kind === 'decor') kd.iso.decor.splice(kd.iso.decor.indexOf(p.obj), 1);
    else {
      if (p.id === 'hall') return;
      const isBase = p.id in BASE_BUILDINGS, lv = kd.base[p.id];
      const refund = isBase ? Math.round(BASE_BUILDINGS[p.id].baseCost * lv / 2) : Math.round((BUILDINGS[p.id] || ISO_EXTRA[p.id]).cost / 2);
      kd.iso.placed.splice(kd.iso.placed.indexOf(p.obj), 1);
      Store.state.gold += refund;
      if (isBase) kd.base[p.id] = 0;
      UI.toast(`Zbouráno, vráceno ${refund} 💰`);
    }
    this.placing = null;
    Store.changed(); UI.refresh(); Battle.setupDefenders(); this.changed(true);
  },

  // ---------- malování ----------
  paintAt(gx, gy) {
    const kd = Game.kd(), half = Math.floor((this.brushSize - 1) / 2);
    let any = false;
    for (let y = gy - half; y < gy - half + this.brushSize; y++) for (let x = gx - half; x < gx - half + this.brushSize; x++) {
      if (x < 0 || y < 0 || x >= ISO.G || y >= ISO.G || this.road.has(x + ',' + y) || !this.buildable(x, y)) continue; // cestu zombíků ani vodu nepřemaluješ
      const k = x + ',' + y, base = this.baseTiles[y][x];
      (this.pending = this.pending || []).push([x, y, ISO_BRUSHES[this.brush].color]);
      if (this.brush === base) { if (kd.iso.paint[k]) { delete kd.iso.paint[k]; any = true; } }
      else if (kd.iso.paint[k] !== this.brush) { kd.iso.paint[k] = this.brush; any = true; }
    }
    if (any) this.paintDirty = true;
  },

  clearPaint() {
    Game.kd().iso.paint = {}; this.groundCanvas = null; Store.changed(); Battle.draw();
  },

  // ---------- kamera a ovládání ----------
  attach(B) {
    this.B = B;
    this.ensure(Game.kd());
    if (this.bound) return;
    this.bound = true;
    const c = B.canvas, ptrs = new Map();
    let drag = null, pinch = null;
    const rel = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', e => {
      if (!B.iso) return;
      c.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      const [sx, sy] = rel(e);
      if (ptrs.size === 1) {
        if (this.onMiniMap(sx, sy)) { drag = { mini: true }; this.miniJump(sx, sy); return; }
        const [gx, gy] = this.screenToTile(sx, sy), p = this.placing;
        let mode = 'pan';
        if (p) { const [w, d] = this.size(p.kind, p.id, p.flip); if (gx >= p.gx && gx < p.gx + w && gy >= p.gy && gy < p.gy + d) mode = 'move'; }
        else if (this.tab === 'paint' && this.paintMode && B.mode === 'idle') { mode = 'paint'; this.paintAt(gx, gy); this.draw(B, 0); }
        drag = { x: e.clientX, y: e.clientY, ox: this.cam.ox, oy: this.cam.oy, moved: false, mode, gx, gy, pgx: p && p.gx, pgy: p && p.gy };
      }
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this.cam.z }; drag = null; }
    });
    c.addEventListener('pointermove', e => {
      if (!B.iso || !ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], r = c.getBoundingClientRect();
        this.zoomAt(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
        return;
      }
      if (!drag || drag.mini) { if (drag && drag.mini) this.miniJump(...rel(e)); return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 6) drag.moved = true;
      if (!drag.moved) return;
      const [gx, gy] = this.screenToTile(...rel(e));
      if (drag.mode === 'move') {
        const p = this.placing;
        p.gx = drag.pgx + gx - drag.gx; p.gy = drag.pgy + gy - drag.gy; this.updatePlaceBox();
      } else if (drag.mode === 'paint') { this.paintAt(gx, gy); }
      else { this.cam.ox = drag.ox + dx; this.cam.oy = drag.oy + dy; this.clampCam(); this.updatePlaceBox(); }
    });
    const up = e => {
      if (!B.iso || !ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (drag && !drag.mini && !drag.moved && ptrs.size === 0 && drag.mode !== 'paint') this.tap(B, ...rel(e));
      if (drag && drag.mode === 'paint' && this.paintDirty) { this.paintDirty = false; this.pending = []; this.groundCanvas = null; Store.changed(); }
      if (ptrs.size === 0) drag = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', e => {
      if (!B.iso) return;
      e.preventDefault();
      this.zoomAt(this.cam.z * (e.deltaY < 0 ? 1.12 : 0.89), ...rel(e));
    }, { passive: false });
    // WASD / šipky posouvají mapu
    const keys = {};
    document.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (!B.iso || UI.current !== 'base' || !['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'w', 'a', 's', 'd'].includes(k)) return;
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      keys[k] = true; e.preventDefault();
    });
    document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
    setInterval(() => {
      if (!B.iso || !this.cam) return;
      const dx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
      const dy = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
      if (dx || dy) { this.cam.ox -= dx * 12; this.cam.oy -= dy * 12; this.clampCam(); this.updatePlaceBox(); if (!B.running) B.draw(); }
    }, 30);
  },

  resize(B, r) {
    const dpr = window.devicePixelRatio || 1, w = Math.max(200, r.width), h = Math.max(200, r.height);
    const c = B.canvas;
    c.style.width = w + 'px'; c.style.height = h + 'px';
    c.width = w * dpr; c.height = h * dpr;
    if (this.cam && this.cw) { this.cam.ox += (w - this.cw) / 2; this.cam.oy += (h - this.ch) / 2; } // střed mapy zůstane na místě
    this.dpr = dpr; this.cw = w; this.ch = h;
    if (!this.cam) {
      const z = Math.min(1, Math.max(0.4, Math.min(w / 860, h / 860))), [mx, my] = this.P(ISO_HQ.gx + 1.5, ISO_HQ.gy + 1);
      this.cam = { z, ox: w / 2 - mx * z, oy: h / 2 - my * z };
    }
    this.clampCam();
    this.updateZoomLabel();
    B.draw();
  },

  zoomAt(z, sx, sy) {
    z = Math.max(ISO_ZOOMS[0], Math.min(ISO_ZOOMS[ISO_ZOOMS.length - 1], z));
    const c = this.cam, ix = (sx - c.ox) / c.z, iy = (sy - c.oy) / c.z;
    c.z = z; c.ox = sx - ix * z; c.oy = sy - iy * z; this.clampCam();
    this.updateZoomLabel(); this.updatePlaceBox();
  },

  zoomStep(dir) {
    const z = this.cam.z, next = dir > 0 ? ISO_ZOOMS.find(q => q > z + 0.01) : [...ISO_ZOOMS].reverse().find(q => q < z - 0.01);
    if (next) this.zoomAt(next, this.cw / 2, this.ch / 2);
    if (!this.B.running) this.B.draw();
  },

  updateZoomLabel() { const el = document.getElementById('zoomLevel'); if (el && this.cam) el.textContent = Math.round(this.cam.z * 100) + '%'; },

  clampCam() {
    const c = this.cam, G = ISO.G, hw = G * ISO.HW * c.z, hh = 2 * G * ISO.HH * c.z;
    c.ox = Math.max(80 - hw, Math.min(this.cw - 80 + hw, c.ox));
    c.oy = Math.max(80 - hh, Math.min(this.ch - 80, c.oy));
  },

  keepInView() {
    const p = this.placing, [x, y] = this.P(p.gx + 0.5, p.gy + 0.5), c = this.cam;
    const sx = x * c.z + c.ox, sy = y * c.z + c.oy;
    if (sx < 60 || sx > this.cw - 60 || sy < 90 || sy > this.ch - 40) { c.ox += this.cw / 2 - sx; c.oy += this.ch / 2 - sy; this.clampCam(); }
  },

  P(gx, gy) { return [(gx - gy) * ISO.HW, (gx + gy) * ISO.HH]; },

  screenToTile(sx, sy) {
    const c = this.cam, ix = (sx - c.ox) / c.z, iy = (sy - c.oy) / c.z;
    return [Math.floor((ix / ISO.HW + iy / ISO.HH) / 2), Math.floor((iy / ISO.HH - ix / ISO.HW) / 2)];
  },

  tap(B, sx, sy) {
    const [gx, gy] = this.screenToTile(sx, sy), kd = Game.kd();
    if (this.placing) {
      // klepnutí jinam přesune stavbu tam (klepnutí míří na její střed)
      const [w, d] = this.size(this.placing.kind, this.placing.id, this.placing.flip);
      this.placing.gx = gx - Math.floor((w - 1) / 2); this.placing.gy = gy - Math.floor((d - 1) / 2);
      this.changed();
      return;
    }
    if (B.mode !== 'idle') return;
    const it = this.occupied(kd).get(gx + ',' + gy);
    if (it && it.o.fixed) return UI.toast(ISO_DECOR[it.o.id].name + ' – památka, tou nepohneš 🏛️');
    if (it) this.pickUp(it);
  },

  changed(panel) {
    this.updatePlaceBox();
    if (panel || true) UI.renderBase();
    if (this.B && !this.B.running) this.B.draw();
  },

  // Okénko „✔ Postavit / ⇋ Otočit / ✖ Zrušit / Odstranit“ nad stavbou (jako v Cave Man RPG)
  updatePlaceBox() {
    const box = document.getElementById('placeBox'); if (!box) return;
    const p = this.placing;
    if (!p || !this.B || !this.B.iso || UI.current !== 'base') { box.style.display = 'none'; return; }
    const ok = this.placingOk(), [w, d] = this.size(p.kind, p.id, p.flip), df = this.def(p.kind, p.id);
    const [x, y] = this.P(p.gx + w / 2, p.gy + d / 2), c = this.cam;
    const sx = x * c.z + c.ox, sy = (y - (df.h || 10) - 24) * c.z + c.oy;
    box.style.display = 'flex';
    box.style.left = Math.max(4, Math.min(this.cw - box.offsetWidth - 4, sx - box.offsetWidth / 2)) + 'px';
    box.style.top = Math.max(4, Math.min(this.ch - box.offsetHeight - 4, sy - box.offsetHeight)) + 'px';
    const okBtn = document.getElementById('placeOk');
    okBtn.disabled = !ok;
    okBtn.textContent = p.obj ? '✔ Sem' : `✔ Postavit ${p.cost} 💰`;
    document.getElementById('placeRemove').style.display = p.obj && p.id !== 'hall' ? '' : 'none';
    document.getElementById('placeUpgrade').style.display = p.obj && p.id in BASE_BUILDINGS ? '' : 'none';
    document.getElementById('placeName').textContent = this.nameOf(p.kind, p.id);
    document.getElementById('placeHint').textContent = ok ? '' : df.road ? 'Jen na cestu!' : 'Sem ne!';
  },

  nameOf(kind, id) {
    if (kind === 'decor') return ISO_DECOR[id].name;
    if (ISO_EXTRA[id]) return ISO_EXTRA[id].name;
    return skin(id in BASE_BUILDINGS ? BASE_BUILDINGS[id] : BUILDINGS[id], 'apocalypse')[0];
  },

  // ---------- minimapa ----------
  miniRect() { const w = 96, gr = this.ground(); return { x: this.cw - w - 8, y: 8, w, h: w * gr.H / gr.W, s: w / gr.W }; },
  onMiniMap(sx, sy) { const m = this.miniRect(); return sx >= m.x && sx <= m.x + m.w && sy >= m.y && sy <= m.y + m.h; },
  miniJump(sx, sy) {
    const m = this.miniRect(), gr = this.ground(), c = this.cam;
    const ix = (sx - m.x) / m.s - gr.ox, iy = (sy - m.y) / m.s - gr.oy;
    c.ox = this.cw / 2 - ix * c.z; c.oy = this.ch / 2 - iy * c.z; this.clampCam(); this.updatePlaceBox();
    if (!this.B.running) this.B.draw();
  },

  drawMiniMap(c) {
    const m = this.miniRect(), gr = this.ground(), cam = this.cam;
    c.fillStyle = 'rgba(13,15,11,.75)'; c.fillRect(m.x - 3, m.y - 3, m.w + 6, m.h + 6);
    c.strokeStyle = '#4d5340'; c.strokeRect(m.x - 3, m.y - 3, m.w + 6, m.h + 6);
    c.drawImage(gr.cv, m.x, m.y, m.w, m.h);
    for (const it of this.objects(Game.kd())) {
      const [w, d] = this.size(it.kind, it.o.id, it.o.flip), [x, y] = this.P(it.o.gx + w / 2, it.o.gy + d / 2);
      c.fillStyle = it.kind === 'build' ? '#f1e7c4' : '#3a3324';
      const s = it.kind === 'build' ? 3 : 1.5;
      c.fillRect(m.x + (x + gr.ox) * m.s - s / 2, m.y + (y + gr.oy) * m.s - s / 2, s, s);
    }
    c.strokeStyle = '#ffd34d'; c.lineWidth = 1;
    c.strokeRect(m.x + (-cam.ox / cam.z + gr.ox) * m.s, m.y + (-cam.oy / cam.z + gr.oy) * m.s, this.cw / cam.z * m.s, this.ch / cam.z * m.s);
  },

  // ---------- kreslení ----------
  // Malovaný podklad: každý pixel se spočítá zvlášť (šum, plynulé přechody povrchů, hloubka vody, dlažba).
  terrainPass(c, W, H, ox, oy) {
    const G = ISO.G, F = 2, w = Math.ceil(W / F), h = Math.ceil(H / F);
    const img = c.createImageData(w, h), px = img.data;
    // šum
    const N = 256, tab = new Float32Array(N * N), rr = rng(4242); for (let i = 0; i < N * N; i++) tab[i] = rr();
    const vn = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = tab[((yi & 255) << 8) | (xi & 255)], b = tab[((yi & 255) << 8) | ((xi + 1) & 255)], cc = tab[(((yi + 1) & 255) << 8) | (xi & 255)], d = tab[(((yi + 1) & 255) << 8) | ((xi + 1) & 255)];
      return (a + (b - a) * sx) * (1 - sy) + (cc + (d - cc) * sx) * sy;
    };
    // typ povrchu a vzdálenost k vodě / k pevnině pro každé políčko
    const types = new Uint8Array(G * G), dist = new Float32Array(G * G).fill(9);
    const code = { W: 0, S: 1, D: 2, G: 3, X: 4, R: 5, A: 6, C: 7, K: 8, P: 2, Q: 6 };
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) types[y * G + x] = code[this.tileAt(x, y)] ?? 2;
    const isW = (x, y) => x < 0 || y < 0 || x >= G || y >= G || types[y * G + x] === 0;
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {       // vzdálenost k opačnému druhu (voda↔pevnina)
      const me = isW(x, y); let best = 9;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (isW(x + dx, y + dy) !== me) best = Math.min(best, Math.hypot(dx, dy));
      dist[y * G + x] = best;
    }
    const distAt = (fx, fy) => {   // bilineárně mezi středy políček
      const x = Math.max(0, Math.min(G - 1.001, fx - 0.5)), y = Math.max(0, Math.min(G - 1.001, fy - 0.5)), xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi;
      const at = (a, b) => dist[Math.min(G - 1, b) * G + Math.min(G - 1, a)];
      return (at(xi, yi) * (1 - tx) + at(xi + 1, yi) * tx) * (1 - ty) + (at(xi, yi + 1) * (1 - tx) + at(xi + 1, yi + 1) * tx) * ty;
    };
    //            voda       písek          hlína          tráva          popel          štěrk          asfalt        beton          dlažba města
    const COL = [[38, 52, 50], [190, 160, 108], [150, 118, 80], [128, 124, 68], [104, 98, 90], [136, 128, 116], [84, 82, 78], [150, 147, 138], [112, 106, 98]];
    let seed = 1234567;
    for (let py = 0; py < h; py++) for (let qx = 0; qx < w; qx++) {
      const ix = qx * F - ox, iy = py * F - oy, fx = (ix / ISO.HW + iy / ISO.HH) / 2, fy = (iy / ISO.HH - ix / ISO.HW) / 2;
      seed = (seed * 16807) % 2147483647; const grain = (seed / 2147483647 - 0.5);
      let R, Gc, B;
      const out = fx < -1 || fy < -1 || fx > G + 1 || fy > G + 1;
      // zvlněná hranice mezi povrchy
      const wx = out ? fx : fx + (vn(fx * 1.1, fy * 1.1) - 0.5) * 1.1 + (vn(fx * 4.3, fy * 4.3) - 0.5) * 0.3;
      const wy = out ? fy : fy + (vn(fx * 1.1 + 40, fy * 1.1 + 40) - 0.5) * 1.1 + (vn(fx * 4.3 + 40, fy * 4.3) - 0.5) * 0.3;
      const gx = Math.floor(wx), gy = Math.floor(wy), t = out || isW(gx, gy) ? 0 : types[gy * G + gx];
      if (t === 0) {
        const d = out ? 9 : distAt(wx, wy), k = Math.min(1, d / 3.2);       // hloubka podle vzdálenosti od břehu
        const wave = out ? 0 : (vn(fx * 1.6 + fy * 0.9, fy * 5.5) - 0.5) * 14 + (vn(fx * 7, fy * 13) - 0.5) * 6;
        R = 98 - 62 * k + wave * 0.6; Gc = 110 - 60 * k + wave; B = 94 - 46 * k + wave;
        if (d < 0.75) { const f = (0.75 - d) / 0.75 * (0.5 + vn(fx * 6, fy * 6) * 0.7); R += 70 * f; Gc += 66 * f; B += 52 * f; } // pěna u břehu
      } else {
        const base = COL[t], big = (vn(fx * 0.55, fy * 0.55) - 0.5) * 34, mid = (vn(fx * 2.6, fy * 2.6) - 0.5) * 26, fine = (vn(fx * 11, fy * 11) - 0.5) * 16;
        let sh = big + mid + fine + grain * 14;
        R = base[0] + sh; Gc = base[1] + sh; B = base[2] + sh * 0.8;
        if (t === 3) { const g = vn(fx * 1.7 + 9, fy * 1.7); R += (g - 0.5) * 40; Gc += (g - 0.4) * 22; }       // zelenější a žlutější místa v trávě
        if (t === 4) { const g = vn(fx * 3.1, fy * 3.1 + 7); if (g > 0.62) { R -= 26; Gc -= 26; B -= 24; } }      // spáleniště v popelu
        if (t === 8 || t === 7) {   // dlažba: spáry mezi kostkami / deskami
          const n = t === 8 ? 5 : 2, u = fx * n + (Math.floor(fy * n) % 2) * 0.5, jx = u - Math.floor(u), jy = fy * n - Math.floor(fy * n);
          if (jx < 0.09 || jy < 0.09) { R -= 20; Gc -= 20; B -= 18; }
          else { const tile = tab[((Math.floor(fy * n) & 255) << 8) | (Math.floor(u) & 255)]; R += (tile - 0.5) * 16; Gc += (tile - 0.5) * 15; B += (tile - 0.5) * 13; }
        }
        const d = distAt(wx, wy);
        if (d < 1.3) { const f = (1.3 - d) / 1.3; R -= 42 * f; Gc -= 40 * f; B -= 30 * f; }                     // mokrý tmavý břeh
      }
      const o = (py * w + qx) * 4; px[o] = R; px[o + 1] = Gc; px[o + 2] = B; px[o + 3] = 255;
    }
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; tmp.getContext('2d').putImageData(img, 0, 0);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(tmp, 0, 0, w * F, h * F);
  },

  ground() {
    if (this.groundCanvas) return this.groundCanvas;
    const G = ISO.G, pad = 40, s = 1;
    const W = G * 2 * ISO.HW + pad * 2, H = G * 2 * ISO.HH + pad * 2;
    const cv = document.createElement('canvas'); cv.width = W * s; cv.height = H * s;
    const c = cv.getContext('2d'); c.scale(s, s);
    const ox = G * ISO.HW + pad, oy = pad, r = rng(7);
    const base = (x, y) => (this.baseTiles[y] || [])[x] || 'W';
    const land = (x, y) => base(x, y) !== 'W';
    const diamond = (gx, gy, k = 1) => {
      const [x, y] = this.P(gx + 0.5, gy + 0.5), hw = ISO.HW * k, hh = ISO.HH * k;
      c.beginPath(); c.moveTo(ox + x, oy + y - hh); c.lineTo(ox + x + hw, oy + y); c.lineTo(ox + x, oy + y + hh); c.lineTo(ox + x - hw, oy + y); c.closePath();
    };
    const shade = (hex, v) => {
      const n = parseInt(hex.slice(1), 16), f = q => Math.max(0, Math.min(255, q + v));
      return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
    };
    const isoPath = fn => { c.save(); c.transform(ISO.HW, ISO.HH, -ISO.HW, ISO.HH, ox, oy); fn(); c.restore(); };
    const line = pts => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x + 0.5, y + 0.5) : c.moveTo(x + 0.5, y + 0.5)); };

    this.terrainPass(c, W, H, ox, oy);
    // 2) ulice ve městě: nábřeží s tramvajovými kolejemi a dvě ulice ke vstupům
    const quay = []; for (let v = -44; v <= 46; v += 2) quay.push(MTf(bankU(v) + 1.6, v));
    isoPath(() => {
      c.lineCap = 'round'; c.lineJoin = 'round';
      const street = pts => { for (const [w, col] of [[1.9, '#3f3d39'], [1.6, '#55524c']]) { line(pts); c.strokeStyle = col; c.lineWidth = w; c.stroke(); } };
      street(quay);
      street(ISO_PATHS[0].slice(0, 2)); street(ISO_PATHS[1].slice(0, 2));
      for (const off of [-0.18, 0.18]) {  // rezavé koleje
        c.beginPath(); quay.forEach(([x, y], i) => i ? c.lineTo(x + 0.5 + off, y + 0.5 - off) : c.moveTo(x + 0.5 + off, y + 0.5 - off));
        c.strokeStyle = 'rgba(140,70,40,.8)'; c.lineWidth = 0.06; c.stroke();
      }
    });
    // 3) parkové cestičky na ostrově (po dvou z nich chodí zombie)
    isoPath(() => {
      c.lineCap = 'round'; c.lineJoin = 'round';
      const walks = [...ISO_WALKS.map(w => w.map(p => MTf(...p))), ISO_PATHS[0].slice(2), ISO_PATHS[1].slice(2)];
      for (const [w, col] of [[1.15, 'rgba(60,56,50,.6)'], [0.9, '#8a857a'], [0.6, '#989387']]) for (const pts of walks) { line(pts); c.strokeStyle = col; c.lineWidth = w; c.stroke(); }
    });
    // 4) namalované cesty hráče (prašná cesta a silnice) – napojují se na sousedy
    const roadTile = (x, y) => this.buildable(x, y) && ISO_BRUSHES[this.tileAt(x, y)].road ? this.tileAt(x, y) : null;
    for (const L of ['P', 'Q']) {
      const col = ISO_BRUSHES[L].color;
      isoPath(() => {
        c.lineCap = 'round';
        for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
          if (roadTile(gx, gy) !== L) continue;
          for (const [w, cc] of [[0.95, shade(col, -18)], [0.75, col]]) {
            c.strokeStyle = cc; c.lineWidth = w;
            c.beginPath(); c.moveTo(gx + 0.5, gy + 0.5); c.lineTo(gx + 0.5001, gy + 0.5); c.stroke();
            for (const [dx, dy] of [[1, 0], [0, 1]]) if (roadTile(gx + dx, gy + dy)) { c.beginPath(); c.moveTo(gx + 0.5, gy + 0.5); c.lineTo(gx + dx + 0.5, gy + dy + 0.5); c.stroke(); }
          }
        }
        if (L === 'Q') {
          c.strokeStyle = 'rgba(225,200,90,.75)'; c.lineWidth = 0.05; c.setLineDash([0.25, 0.25]);
          for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
            if (roadTile(gx, gy) !== 'Q') continue;
            for (const [dx, dy] of [[1, 0], [0, 1]]) if (roadTile(gx + dx, gy + dy) === 'Q') { c.beginPath(); c.moveTo(gx + 0.5, gy + 0.5); c.lineTo(gx + dx + 0.5, gy + dy + 0.5); c.stroke(); }
          }
          c.setLineDash([]);
        }
      });
    }
    // 5) textura podle povrchu
    for (let i = 0; i < 60000; i++) {
      const fx = r() * G, fy = r() * G, gx = Math.floor(fx), gy = Math.floor(fy);
      if (!land(gx, gy)) continue;
      const [x, y] = this.P(fx, fy), t = this.tileAt(gx, gy), q = r();
      if (t === 'S') c.fillStyle = q < 0.5 ? 'rgba(235,210,160,.45)' : 'rgba(120,90,50,.35)';
      else if (t === 'D') c.fillStyle = q < 0.6 ? 'rgba(90,65,40,.45)' : 'rgba(210,180,130,.35)';
      else if (t === 'G') c.fillStyle = q < 0.5 ? 'rgba(70,72,30,.5)' : 'rgba(190,170,90,.45)';
      else if (t === 'X') c.fillStyle = q < 0.5 ? 'rgba(35,33,30,.5)' : 'rgba(160,155,145,.4)';
      else if (t === 'R') c.fillStyle = q < 0.5 ? 'rgba(60,58,55,.6)' : 'rgba(190,185,175,.6)';
      else if (t === 'K') c.fillStyle = q < 0.6 ? 'rgba(40,38,35,.5)' : q < 0.9 ? 'rgba(150,145,135,.45)' : 'rgba(150,80,50,.6)';
      else if (t === 'A' || t === 'Q') c.fillStyle = q < 0.5 ? 'rgba(40,40,38,.5)' : 'rgba(130,128,120,.4)';
      else if (t === 'C') c.fillStyle = q < 0.5 ? 'rgba(110,108,100,.4)' : 'rgba(200,198,190,.4)';
      else c.fillStyle = q < 0.5 ? 'rgba(60,45,28,.35)' : 'rgba(170,145,100,.3)';
      c.fillRect(ox + x, oy + y, t === 'R' ? 1.6 : 1 + r(), t === 'R' ? 1.4 : 1);
    }
    // 6) detaily: praskliny, chomáče trávy, spáleniště
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      if (!land(gx, gy) || this.road.has(gx + ',' + gy)) continue;
      const t = this.tileAt(gx, gy), [x0, y0] = this.P(gx + 0.5, gy + 0.5), X = ox + x0, Y = oy + y0;
      if (t === 'D' || ((t === 'A' || t === 'Q' || t === 'C' || t === 'K') && r() < 0.35)) {
        c.strokeStyle = t === 'D' ? 'rgba(80,58,34,.55)' : 'rgba(25,25,22,.55)'; c.lineWidth = 0.6;
        for (let k = 0; k < (t === 'D' ? 3 : 1); k++) {
          let px = X + (r() - 0.5) * 30, py = Y + (r() - 0.5) * 12;
          c.beginPath(); c.moveTo(px, py);
          for (let j = 0; j < 4; j++) { px += (r() - 0.5) * 12; py += (r() - 0.5) * 6; c.lineTo(px, py); }
          c.stroke();
        }
      }
      if (t === 'G' || (t === 'S' && r() < 0.25)) {
        c.strokeStyle = t === 'G' ? 'rgba(175,155,75,.8)' : 'rgba(150,135,70,.7)'; c.lineWidth = 0.7;
        for (let k = 0; k < (t === 'G' ? 4 : 1); k++) {
          const px = X + (r() - 0.5) * 34, py = Y + (r() - 0.5) * 14;
          for (let j = -2; j <= 2; j++) { c.beginPath(); c.moveTo(px, py); c.lineTo(px + j * 1.3, py - 4 + Math.abs(j)); c.stroke(); }
        }
      }
      if ((t === 'X' || t === 'K') && r() < 0.4) { c.fillStyle = 'rgba(20,18,16,.4)'; c.beginPath(); c.ellipse(X + (r() - 0.5) * 20, Y + (r() - 0.5) * 8, 8, 3.5, 0, 0, 7); c.fill(); }
    }
    // 7) dva vstupy přes rameno řeky: můstek k Žofínu a lávka u Mánesa
    const LIFT = 7;
    const deck = (a, b, width, col) => {
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.5);
      for (let k = 0; k <= steps; k++) {   // pilíře
        const gx = a[0] + (b[0] - a[0]) * k / steps + 0.5, gy = a[1] + (b[1] - a[1]) * k / steps + 0.5;
        if (land(Math.floor(gx), Math.floor(gy))) continue;
        const [x, y] = this.P(gx, gy);
        c.fillStyle = '#5f5c55'; c.fillRect(ox + x - 4, oy + y - LIFT, 8, LIFT + 5);
        c.fillStyle = 'rgba(200,210,200,.3)'; c.beginPath(); c.ellipse(ox + x, oy + y + 5, 7, 2.5, 0, 0, 7); c.fill();
      }
      isoPath(() => { c.lineCap = 'butt'; line([a, b]); c.strokeStyle = 'rgba(15,20,18,.4)'; c.lineWidth = width + 0.3; c.stroke(); });
      c.save(); c.translate(0, -LIFT);
      isoPath(() => {
        c.lineCap = 'butt';
        line([a, b]); c.strokeStyle = shade(col, 35); c.lineWidth = width + 0.25; c.stroke();
        line([a, b]); c.strokeStyle = col; c.lineWidth = width; c.stroke();
        const rr = rng(a[0] * 7 + a[1]);
        for (let i = 0; i < width * 8; i++) {
          const t = rr(), o = (rr() - 0.5) * width * 0.7;
          c.fillStyle = i % 3 ? 'rgba(30,30,28,.5)' : 'rgba(150,145,135,.6)';
          c.beginPath(); c.ellipse(a[0] + (b[0] - a[0]) * t + 0.5 + o, a[1] + (b[1] - a[1]) * t + 0.5 + o, 0.12 + rr() * 0.15, 0.08 + rr() * 0.1, rr() * 3, 0, 7); c.fill();
        }
      });
      c.restore();
      for (const side of [-1, 1]) {      // zábradlí s dírami
        c.strokeStyle = '#a9a59a'; c.lineWidth = 1;
        const n = steps * 6, off = side * (width / 2 + 0.1) * Math.SQRT1_2;
        for (let k = 0; k < n; k++) {
          if (k % 11 === 4) continue;
          const p = t => this.P(a[0] + (b[0] - a[0]) * t + 0.5 + off, a[1] + (b[1] - a[1]) * t + 0.5 + off);
          const [x0, y0] = p(k / n), [x1, y1] = p((k + 1) / n);
          c.beginPath(); c.moveTo(ox + x0, oy + y0 - LIFT - 5); c.lineTo(ox + x1, oy + y1 - LIFT - 5); c.stroke();
          if (k % 3 === 0) { c.beginPath(); c.moveTo(ox + x0, oy + y0 - LIFT); c.lineTo(ox + x0, oy + y0 - LIFT - 5); c.stroke(); }
        }
      }
    };
    deck(ISO_PATHS[0][1], ISO_PATHS[0][2], 0.9, '#6f6a60');
    deck(ISO_PATHS[1][1], ISO_PATHS[1][2], 0.9, '#6f6a60');

    this.groundCanvas = { cv, ox, oy, W, H };
    return this.groundCanvas;
  },

  sprite(name) {
    const k = 'sp:' + name;
    if (!(k in this.imgs)) { const im = new Image(); this.imgs[k] = null; im.onload = () => { this.imgs[k] = im; if (this.B && !this.B.running) this.B.draw(); }; im.src = 'img/sprites/' + name + '.webp'; }
    return this.imgs[k];
  },

  face(id) {
    const k = 'face:' + id;
    if (!(k in this.imgs)) { const im = new Image(); this.imgs[k] = null; im.onload = () => { this.imgs[k] = im; }; im.src = portraitSrc(id); }
    return this.imgs[k];
  },

  img(id) {
    if (!(id in this.imgs)) {
      const im = new Image(); this.imgs[id] = null;
      im.onload = () => { this.imgs[id] = im; if (this.B && !this.B.running) this.B.draw(); };
      im.onerror = () => { if (!im.src.endsWith('.webp')) im.src = 'img/buildings/' + id + '.webp'; };
      im.src = 'img/buildings/' + id + '.png';
    }
    return this.imgs[id];
  },

  draw(B, time) {
    const c = B.ctx, cam = this.cam, dpr = this.dpr, kd = Game.kd(), T = ISO.T;
    if (!cam) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = c.createRadialGradient(this.cw / 2, this.ch / 2, 50, this.cw / 2, this.ch / 2, Math.max(this.cw, this.ch));
    bg.addColorStop(0, '#4a3f2c'); bg.addColorStop(1, '#1d1a12');
    c.fillStyle = bg; c.fillRect(0, 0, this.cw, this.ch);
    c.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * cam.ox, dpr * cam.oy);

    const gr = this.ground();
    c.drawImage(gr.cv, -gr.ox, -gr.oy, gr.W, gr.H);

    for (const [x, y, col] of this.pending || []) this.footprint(c, x, y, 1, 1, col);
    // objekty seřazené podle hloubky
    const objs = [], pl = this.placing;
    for (const it of this.objects(kd)) {
      if (pl && pl.obj === it.o) continue;
      const [qx, qy] = this.P(it.o.gx, it.o.gy), sx = qx * cam.z + cam.ox, sy = qy * cam.z + cam.oy, mz = cam.z;
      if (sx < -340 * mz || sx > this.cw + 340 * mz || sy < -330 * mz || sy > this.ch + 280 * mz) continue; // mimo obrazovku
      const [w, d] = this.size(it.kind, it.o.id, it.o.flip);
      const destroyed = it.o.id === 'barrier' && B.mode === 'fight' && (B.barriers.find(b => b.slot === it.index) || {}).hp <= 0;
      if (!destroyed) objs.push({ z: it.o.gx + it.o.gy + w + d - 1, f: () => this.object(c, it.kind, it.o, kd) });
    }
    for (const en of B.enemies || []) objs.push({ z: en.x / T + en.y / T, f: () => this.enemy(c, en, time) });
    for (const h of B.heroes || []) if (!h.dead) objs.push({ z: h.x / T + h.y / T, f: () => this.hero(c, h) });
    objs.sort((a, b) => a.z - b.z).forEach(o => o.f());

    // stavba, kterou právě pokládáš: zeleně = sem jde, červeně = sem ne
    if (pl) {
      const [w, d] = this.size(pl.kind, pl.id, pl.flip), ok = this.placingOk();
      this.footprint(c, pl.gx, pl.gy, w, d, ok ? 'rgba(91,180,70,.45)' : 'rgba(210,70,50,.5)');
      const b = BUILDINGS[pl.id];
      if (b && b.range) {
        const [x, y] = this.P(pl.gx + w / 2, pl.gy + d / 2), rr = b.range / T;
        c.strokeStyle = 'rgba(230,210,120,.8)'; c.setLineDash([6, 4]); c.lineWidth = 1.5;
        c.beginPath(); c.ellipse(x, y, rr * ISO.HW, rr * ISO.HH, 0, 0, 7); c.stroke(); c.setLineDash([]);
      }
      c.globalAlpha = 0.8; this.object(c, pl.kind, pl, kd); c.globalAlpha = 1;
    }

    // střely
    for (const s of B.shots || []) {
      const [x, y] = this.P(s.x / T, s.y / T);
      c.fillStyle = s.kind === 'mage' ? '#9fe8ff' : s.kind === 'cannon' ? '#222' : '#ffd34d';
      c.beginPath(); c.arc(x, y - 10, s.kind === 'cannon' ? 3 : 1.8, 0, 7); c.fill();
    }
    for (const f of B.fx || []) {
      const [x, y] = this.P(f.x / T, f.y / T);
      c.globalAlpha = Math.min(1, f.t * 3);
      if (f.ring) { c.strokeStyle = '#ffae42'; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y, f.ring / T * ISO.HW, f.ring / T * ISO.HH, 0, 0, 7); c.stroke(); }
      else { c.font = 'bold 11px sans-serif'; c.fillStyle = f.c || '#fff'; c.textAlign = 'center'; c.fillText(f.txt, x, y - 18 - (0.8 - f.t) * 16); }
    }
    c.globalAlpha = 1;
    if (B.mode === 'fight') {
      const [x, y] = this.P(ISO_HQ.gx + 1.5, ISO_HQ.gy + 1);
      B.bar(c, x, y - 58, B.baseHp / B.baseMax, '#22c55e', 70);
    }
    // prach ve vzduchu
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = 'rgba(230,205,150,.22)';
    for (let i = 0; i < 34; i++) c.fillRect((i * 137 + time * 40 * (1 + i % 3)) % this.cw, (i * 89 + Math.sin(time + i) * 10 + this.ch) % this.ch, 2, 1);
    this.drawMiniMap(c);
  },

  footprint(c, gx, gy, w, d, fill) {
    const a = this.P(gx, gy), b = this.P(gx + w, gy), cc = this.P(gx + w, gy + d), dd = this.P(gx, gy + d);
    c.fillStyle = fill; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.lineTo(...cc); c.lineTo(...dd); c.closePath(); c.fill();
  },

  // Nakreslí budovu nebo dekoraci. Otočená věc (flip) = zrcadlo: políčko (x, y) se kreslí jako (y, x).
  object(c, kind, o, kd) {
    const df = this.def(kind, o.id), w = df.w || 1, d = df.d || 1;
    if (df.sp) {   // malovaný obrázek: stojí spodkem na středu svého půdorysu
      const im = this.sprite(df.sp), [W2, D2] = this.size(kind, o.id, o.flip), [x, y] = this.P(o.gx + W2 / 2, o.gy + D2 / 2);
      if (!im) return;
      const dw = im.width * df.s, dh = im.height * df.s, by = y + (df.base ?? 7);
      if (o.flip) { c.save(); c.translate(x, 0); c.scale(-1, 1); c.drawImage(im, -dw / 2, by - dh, dw, dh); c.restore(); }
      else c.drawImage(im, x - dw / 2, by - dh, dw, dh);
      return;
    }
    const dims = { ...df, w, d };
    c.save();
    let gx = o.gx, gy = o.gy;
    if (o.lift) c.translate(0, -o.lift);
    if (o.flip) { c.scale(-1, 1); gx = o.gy; gy = o.gx; }
    const im = this.img(o.id);
    if (im) {
      const C = this.P(gx + w, gy + d), B = this.P(gx + w, gy), D = this.P(gx, gy + d);
      const iw = B[0] - D[0], ih = im.height * iw / im.width;
      c.fillStyle = 'rgba(0,0,0,.32)'; c.beginPath(); c.moveTo(D[0] + 6, D[1] + 4); c.lineTo(C[0] + 10, C[1] + 6); c.lineTo(B[0] + 26, B[1] + 6); c.lineTo(B[0] + 40, B[1] - 14); c.lineTo(B[0], B[1]); c.lineTo(C[0], C[1]); c.closePath(); c.fill();
      c.drawImage(im, D[0], C[1] - ih, iw, ih);
    } else {
      const fn = this['draw_' + (kind === 'decor' ? o.id : df.style)];
      if (fn) fn.call(this, c, gx, gy, dims, o);
      else this.footprint(c, gx, gy, w, d, 'rgba(60,56,50,.6)'); // obrázek se ještě načítá
    }
    c.restore();
    // úroveň budovy
    const lv = kind === 'build' ? kd.base[o.id] : undefined;
    if (lv !== undefined) {
      const [W, D] = this.size(kind, o.id, o.flip), [x, y] = this.P(o.gx + W / 2, o.gy + D / 2);
      c.fillStyle = 'rgba(15,17,12,.85)'; c.strokeStyle = '#a3ad6c'; c.lineWidth = 1;
      c.beginPath(); c.roundRect(x - 13, y - df.h - 30, 26, 13, 3); c.fill(); c.stroke();
      c.fillStyle = '#e8e3c0'; c.font = 'bold 9px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('úr. ' + lv, x, y - df.h - 23.5);
    }
  },

  // kvádr: vrací body pro další detaily
  box(c, gx, gy, w, d, h, top, left, right, shadow = true) {
    const A = this.P(gx, gy), B = this.P(gx + w, gy), C = this.P(gx + w, gy + d), D = this.P(gx, gy + d);
    const up = p => [p[0], p[1] - h];
    if (shadow) {
      c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath();
      c.moveTo(...B); c.lineTo(B[0] + h * 0.9, B[1] + h * 0.1); c.lineTo(C[0] + h * 0.9, C[1] + h * 0.1); c.lineTo(...C); c.closePath(); c.fill();
    }
    const poly = (pts, f) => { c.fillStyle = f; c.beginPath(); c.moveTo(...pts[0]); pts.slice(1).forEach(p => c.lineTo(...p)); c.closePath(); c.fill(); };
    poly([D, C, up(C), up(D)], left);
    poly([B, C, up(C), up(B)], right);
    if (top) poly([up(A), up(B), up(C), up(D)], top);
    return { A, B, C, D, up };
  },

  // vlnitý plech
  ribs(c, p1, p2, h, n, color) {
    c.strokeStyle = color; c.lineWidth = 0.6;
    for (let i = 1; i < n; i++) {
      const t = i / n, x = p1[0] + (p2[0] - p1[0]) * t, y = p1[1] + (p2[1] - p1[1]) * t;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h); c.stroke();
    }
  },

  shadowBlob(c, x, y, rx, ry) { c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(x + rx * 0.4, y + 1, rx, ry, 0, 0, 7); c.fill(); },
  center(gx, gy, df) { return this.P(gx + (df.w || 1) / 2, gy + (df.d || 1) / 2); },

  // ---------- dekorace (zástupná grafika) ----------
  draw_deadtree(c, gx, gy, df) {
    // spálený strom: stínovaný kmen se světlou hranou, křivé větve, zbytky suchého listí
    const [x, y] = this.center(gx, gy, df), r = rng(gx * 53 + gy * 97 + 3), k = 0.85 + r() * 0.5;
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(x + 14 * k, y + 2, 20 * k, 6 * k, 0, 0, 7); c.fill();
    c.lineCap = 'round';
    const tips = [];
    const branch = (x1, y1, a, len, w, dep) => {
      const x2 = x1 + Math.sin(a) * len, y2 = y1 - Math.cos(a) * len;
      c.strokeStyle = '#2e2319'; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      c.strokeStyle = '#5d4a36'; c.lineWidth = w * 0.55; c.beginPath(); c.moveTo(x1 - w * 0.15, y1); c.lineTo(x2 - w * 0.15, y2); c.stroke();
      if (w > 2.2) { c.strokeStyle = 'rgba(190,165,120,.35)'; c.lineWidth = w * 0.18; c.beginPath(); c.moveTo(x1 - w * 0.3, y1); c.lineTo(x2 - w * 0.3, y2); c.stroke(); }
      if (dep > 0) { branch(x2, y2, a - 0.35 - r() * 0.4, len * (0.6 + r() * 0.15), w * 0.62, dep - 1); branch(x2, y2, a + 0.3 + r() * 0.4, len * (0.55 + r() * 0.15), w * 0.6, dep - 1); }
      else tips.push([x2, y2]);
    };
    branch(x, y, (r() - 0.5) * 0.2, 15 * k, 4.2 * k, 3);
    if (r() < 0.45) for (const [tx, ty] of tips) {   // pár stromů si drží suché listí
      c.fillStyle = r() < 0.5 ? 'rgba(120,105,50,.75)' : 'rgba(95,90,45,.7)';
      c.beginPath(); c.ellipse(tx, ty - 1, 4.5 * k, 3.2 * k, 0, 0, 7); c.fill();
    }
  },
  draw_bush(c, gx, gy, df) {
    const [x, y] = this.center(gx, gy, df);
    this.shadowBlob(c, x, y, 8, 3);
    c.strokeStyle = '#7a6a42'; c.lineWidth = 0.8;
    for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + i * 1.2, y - 6, x + i * 1.6, y - 8 + Math.abs(i) * 0.6); c.stroke(); }
    c.fillStyle = 'rgba(120,110,60,.6)'; c.beginPath(); c.ellipse(x, y - 4, 7, 4, 0, 0, 7); c.fill();
  },
  draw_tuft(c, gx, gy, df) {
    const [x, y] = this.center(gx, gy, df);
    c.strokeStyle = '#b8a060'; c.lineWidth = 0.8;
    for (const ox of [-6, 0, 6]) for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x + ox, y + (ox ? 2 : 0)); c.lineTo(x + ox + i * 1.5, y - 6 + Math.abs(i)); c.stroke(); }
  },
  draw_cactus(c, gx, gy, df) {
    const [x, y] = this.center(gx, gy, df);
    this.shadowBlob(c, x + 4, y, 7, 3);
    c.strokeStyle = '#4f6b3a'; c.lineCap = 'round';
    c.lineWidth = 5; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 20); c.stroke();
    c.lineWidth = 3.5; c.beginPath(); c.moveTo(x, y - 8); c.lineTo(x - 6, y - 9); c.lineTo(x - 6, y - 15); c.moveTo(x, y - 11); c.lineTo(x + 5, y - 12); c.lineTo(x + 5, y - 17); c.stroke();
    c.strokeStyle = 'rgba(160,190,120,.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 1, y - 1); c.lineTo(x - 1, y - 19); c.stroke();
  },
  draw_rock(c, gx, gy, df) {
    const [x, y] = this.center(gx, gy, df);
    this.shadowBlob(c, x, y, 8, 3);
    c.fillStyle = '#7d7466'; c.beginPath(); c.ellipse(x, y - 3, 8, 5, 0, 0, 7); c.fill();
    c.fillStyle = '#9a917f'; c.beginPath(); c.ellipse(x - 2, y - 5, 4, 2.5, 0, 0, 7); c.fill();
  },
  draw_boulder(c, gx, gy, df) {
    const [x, y] = this.center(gx, gy, df);
    this.shadowBlob(c, x + 4, y, 15, 5);
    c.fillStyle = '#6f6556'; c.beginPath(); c.moveTo(x - 14, y); c.lineTo(x - 10, y - 13); c.lineTo(x, y - 18); c.lineTo(x + 11, y - 12); c.lineTo(x + 14, y); c.closePath(); c.fill();
    c.fillStyle = '#8c8270'; c.beginPath(); c.moveTo(x - 10, y - 13); c.lineTo(x, y - 18); c.lineTo(x + 2, y - 8); c.lineTo(x - 8, y - 5); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(40,35,28,.5)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(x + 2, y - 8); c.lineTo(x + 5, y - 2); c.stroke();
  },
  draw_rubble(c, gx, gy, df) {
    const [x, y] = this.center(gx, gy, df), r = rng(gx * 7 + gy * 13 + 1);
    for (let i = 0; i < 9; i++) {
      c.fillStyle = ['#8b8070', '#6f6658', '#a39885', '#7a4c35'][i % 4];
      const px = x + (r() - 0.5) * 24, py = y + (r() - 0.5) * 10;
      c.fillRect(px, py - 3, 3 + r() * 4, 2 + r() * 3);
    }
  },
  draw_bones(c, gx, gy, df) {
    const [x, y] = this.center(gx, gy, df);
    c.fillStyle = '#e6dcc4'; c.strokeStyle = '#e6dcc4'; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(x - 4, y - 3, 4, 3.5, 0, 0, 7); c.fill();          // lebka
    c.fillStyle = '#3a3226'; c.fillRect(x - 6, y - 4, 1.5, 1.5); c.fillRect(x - 3, y - 4, 1.5, 1.5);
    c.beginPath(); c.moveTo(x + 1, y); c.lineTo(x + 10, y - 3); c.moveTo(x + 2, y + 2); c.lineTo(x + 9, y + 4); c.stroke();
  },
  draw_car(c, gx, gy, df) {
    // rezavý vrak auta bez kol
    const b = this.box(c, gx + 0.15, gy + 0.2, df.w - 0.3, df.d - 0.4, 7, '#7a4a2c', '#8a5634', '#6a3d22');
    c.save(); c.translate(0, -7);
    this.box(c, gx + 0.6, gy + 0.25, 0.75, df.d - 0.5, 6, '#6e4428', '#33414a', '#2b363d', false);
    c.restore();
    c.fillStyle = 'rgba(40,25,15,.5)';
    for (let i = 0; i < 5; i++) { const [x, y] = this.P(gx + 0.3 + i * 0.3, gy + 0.6); c.beginPath(); c.ellipse(x, y - 6, 2, 1, 0, 0, 7); c.fill(); }
  },
  draw_barrel(c, gx, gy, df) {
    const [x, y] = this.center(gx, gy, df);
    this.shadowBlob(c, x + 2, y, 6, 2.5);
    c.fillStyle = '#7d4220'; c.fillRect(x - 5, y - 13, 10, 13);
    c.fillStyle = '#5a2e15'; c.fillRect(x - 5, y - 9, 10, 1.5); c.fillRect(x - 5, y - 4, 10, 1.5);
    c.fillStyle = '#8f5a32'; c.beginPath(); c.ellipse(x, y - 13, 5, 2, 0, 0, 7); c.fill();
    c.fillStyle = '#e0b52c'; c.fillRect(x - 2, y - 8, 4, 3);
  },
  draw_tires(c, gx, gy, df) {
    const [x, y] = this.center(gx, gy, df);
    for (let i = 0; i < 3; i++) {
      c.fillStyle = '#1f1f1f'; c.beginPath(); c.ellipse(x, y - i * 3.5, 8, 4, 0, 0, 7); c.fill();
      c.fillStyle = '#444'; c.beginPath(); c.ellipse(x, y - i * 3.5 - 0.5, 3, 1.4, 0, 0, 7); c.fill();
    }
  },
  draw_crates(c, gx, gy) {
    this.box(c, gx + 0.15, gy + 0.2, 0.4, 0.4, 9, '#9a7a4a', '#86663a', '#6e522c');
    this.box(c, gx + 0.5, gy + 0.45, 0.35, 0.35, 8, '#9a7a4a', '#86663a', '#6e522c');
    c.save(); c.translate(0, -9); this.box(c, gx + 0.2, gy + 0.25, 0.3, 0.3, 7, '#a8885a', '#937348', '#7a5c34', false); c.restore();
  },
  draw_scrap(c, gx, gy, df) {
    const [x, y] = this.center(gx, gy, df);
    this.shadowBlob(c, x + 3, y, 13, 4);
    c.fillStyle = '#5c5650'; c.beginPath(); c.moveTo(x - 13, y); c.lineTo(x - 5, y - 12); c.lineTo(x + 4, y - 9); c.lineTo(x + 13, y); c.closePath(); c.fill();
    c.strokeStyle = '#8a4b22'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x - 9, y - 4); c.lineTo(x + 2, y - 14); c.moveTo(x - 2, y - 2); c.lineTo(x + 9, y - 8); c.stroke();
    c.fillStyle = '#9da0a0'; c.fillRect(x - 3, y - 8, 6, 3);
  },
  draw_watertower(c, gx, gy, df) {
    const [x, y] = this.center(gx, gy, df);
    this.shadowBlob(c, x + 14, y, 18, 5);
    c.strokeStyle = '#5a4a3a'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x - 10, y); c.lineTo(x - 7, y - 36); c.moveTo(x + 10, y); c.lineTo(x + 7, y - 36); c.moveTo(x, y + 4); c.lineTo(x, y - 36); c.stroke();
    c.lineWidth = 0.8; c.beginPath(); c.moveTo(x - 9, y - 10); c.lineTo(x + 9, y - 24); c.moveTo(x + 9, y - 10); c.lineTo(x - 9, y - 24); c.stroke();
    c.fillStyle = '#7d8a8c'; c.fillRect(x - 11, y - 54, 22, 18);
    c.fillStyle = '#9aa7a9'; c.beginPath(); c.ellipse(x, y - 54, 11, 4, 0, 0, 7); c.fill();
    c.fillStyle = '#6b4a30'; c.fillRect(x - 11, y - 44, 22, 2);
  },
  draw_sign(c, gx, gy, df) {
    const [x, y] = this.center(gx, gy, df);
    c.strokeStyle = '#5a4a3a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 14); c.stroke();
    c.fillStyle = '#e0b52c'; c.beginPath(); c.moveTo(x, y - 24); c.lineTo(x + 7, y - 13); c.lineTo(x - 7, y - 13); c.closePath(); c.fill();
    c.fillStyle = '#222'; c.fillRect(x - 0.7, y - 21, 1.4, 4.5); c.fillRect(x - 0.7, y - 15.5, 1.4, 1.4);
  },
  draw_lamp(c, gx, gy, df) {
    const [x, y] = this.center(gx, gy, df);
    c.strokeStyle = '#3c3c3a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 34); c.lineTo(x + 6, y - 34); c.stroke();
    c.fillStyle = '#fff2b0'; c.beginPath(); c.arc(x + 6, y - 32, 2, 0, 7); c.fill();
    const g = c.createRadialGradient(x + 6, y - 30, 1, x + 6, y - 30, 14);
    g.addColorStop(0, 'rgba(255,240,170,.35)'); g.addColorStop(1, 'rgba(255,240,170,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x + 6, y - 30, 14, 0, 7); c.fill();
  },
  draw_concrete(c, gx, gy) {
    const b = this.box(c, gx + 0.1, gy + 0.3, 0.8, 0.4, 9, '#b4b0a6', '#9c988e', '#83807a');
    c.fillStyle = 'rgba(200,60,40,.7)'; c.beginPath(); c.moveTo(...b.D); c.lineTo(b.D[0] + 8, b.D[1] + 4); c.lineTo(b.D[0] + 8, b.D[1] - 1); c.lineTo(b.D[0], b.D[1] - 5); c.fill();
  },

  // ---------- památky Slovanského ostrova v ruinách (zástupná grafika) ----------
  // Vyhořelý blok: zdi s vypálenými okny, propadlá střecha, zubatá koruna zdí.
  ruinBlock(c, gx, gy, w, d, h, wall, wallDark, roof, floors) {
    const b = this.box(c, gx + 0.08, gy + 0.08, w - 0.16, d - 0.16, h, null, wall, wallDark);
    const Au = b.up(b.A), Bu = b.up(b.B), Cu = b.up(b.C), Du = b.up(b.D), r = rng(gx * 131 + gy * 17 + w);
    const poly = (pts, f) => { c.fillStyle = f; c.beginPath(); c.moveTo(...pts[0]); pts.slice(1).forEach(p => c.lineTo(...p)); c.closePath(); c.fill(); };
    poly([Au, Bu, Cu, Du], '#26221e');
    // zbytky střechy
    const mix = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    for (let i = 0; i < 3; i++) {
      const t = r() * 0.7, p1 = mix(Du, Cu, t), p2 = mix(Du, Cu, t + 0.25), q = mix(Au, Bu, t + 0.1);
      poly([p1, p2, [(p2[0] + q[0]) / 2, (p2[1] + q[1]) / 2 - 7], [(p1[0] + q[0]) / 2, (p1[1] + q[1]) / 2 - 8]], i % 2 ? roof : this.dark(roof));
    }
    // zubatá koruna zdí (kusy chybí)
    c.fillStyle = '#2a2622';
    for (const [p, q] of [[Du, Cu], [Bu, Cu]]) for (let i = 0; i < w + d; i++) {
      const t = r(), m = mix(p, q, t), s = 4 + r() * 7;
      c.beginPath(); c.moveTo(m[0] - s, m[1]); c.lineTo(m[0], m[1] + 3 + r() * (h * 0.3)); c.lineTo(m[0] + s, m[1]); c.closePath(); c.fill();
    }
    // okna
    for (const [p, q, n] of [[b.D, b.C, Math.round(w * 2.2)], [b.B, b.C, Math.round(d * 2.2)]]) for (let i = 0; i < n; i++) for (let f = 0; f < floors; f++) {
      const m = mix(p, q, (i + 0.5) / n), y = m[1] - (f + 0.45) * h / floors;
      c.fillStyle = 'rgba(22,19,16,.9)'; c.fillRect(m[0] - 2, y - 4, 4, 6);
      if (r() < 0.4) { c.fillStyle = 'rgba(22,19,16,.3)'; c.beginPath(); c.ellipse(m[0], y - 6, 3.5, 4.5, 0, 0, 7); c.fill(); }
    }
    return b;
  },
  dark(hex) { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) * 0.75 | 0},${((n >> 8) & 255) * 0.75 | 0},${(n & 255) * 0.75 | 0})`; },

  draw_ruinblock(c, gx, gy, df) {
    const cols = [['#b9a98a', '#9a8b6f'], ['#a8a49a', '#8b877d'], ['#c2a487', '#a3876c']][(gx + gy) % 3];
    this.ruinBlock(c, gx, gy, df.w, df.d, df.h, cols[0], cols[1], '#9c3f2a', 3);
  },

  draw_zofin(c, gx, gy, df) {
    // palác Žofín: žlutá novorenesanční budova, vyhořelá, se zbytky měděné střechy a propadlým křídlem
    const w = df.w, d = df.d;
    this.footprint(c, gx - 0.3, gy - 0.3, w + 0.6, d + 0.6, 'rgba(60,56,50,.5)');
    this.ruinBlock(c, gx, gy, w, d, 30, '#d6c084', '#b39e68', '#5f9484', 2);
    // vyšší střední část se sálem
    c.save(); c.translate(0, -30);
    this.ruinBlock(c, gx + 1.6, gy + 1.2, w - 3.2, d - 2.4, 14, '#cdb77c', '#a89260', '#5f9484', 1);
    c.restore();
    // sloupový vchod
    const p = this.P(gx + w, gy + d / 2);
    c.fillStyle = '#e4d6a8';
    for (let i = -2; i <= 2; i++) c.fillRect(p[0] + 2 + Math.abs(i) * 0, p[1] + i * 5 - 14 - Math.abs(i), 2.5, 14);
    c.fillStyle = '#bfae7c'; c.beginPath(); c.moveTo(p[0], p[1] - 26); c.lineTo(p[0] + 8, p[1] - 15 + 10); c.lineTo(p[0] + 8, p[1] - 17); c.lineTo(p[0] + 1, p[1] - 30); c.fill();
    // suť z propadlého rohu
    this.draw_rubble(c, gx - 0.6, gy + d - 0.6, {}); this.draw_rubble(c, gx + w - 0.2, gy + d - 0.2, {});
    c.fillStyle = 'rgba(20,18,15,.3)'; const q = this.P(gx + w / 2, gy + d / 2); c.beginPath(); c.ellipse(q[0], q[1] - 46, 26, 12, 0, 0, 7); c.fill();
  },

  draw_manes: function (c, gx, gy, df) {
    // Mánes: bílá funkcionalistická budova nad vodou – zbyly popraskané bílé bloky
    this.ruinBlock(c, gx, gy, df.w, df.d, df.h, '#dedad0', '#bdb9ae', '#8d8a82', 1);
  },

  draw_sitkov(c, gx, gy, df) {
    // Šítkovská vodárenská věž: kamenná věž s cibulovou bání (báň je nakřivo, plech visí)
    const [x, y] = this.center(gx, gy, df), h = df.h;
    this.shadowBlob(c, x + 20, y, 22, 6);
    c.fillStyle = '#6f675a'; c.beginPath(); c.moveTo(x - 9, y + 2); c.lineTo(x - 7, y - h + 22); c.lineTo(x, y - h + 26); c.lineTo(x, y + 6); c.fill();
    c.fillStyle = '#585146'; c.beginPath(); c.moveTo(x + 9, y + 2); c.lineTo(x + 7, y - h + 22); c.lineTo(x, y - h + 26); c.lineTo(x, y + 6); c.fill();
    c.fillStyle = 'rgba(20,18,15,.85)'; for (let k = 0; k < 3; k++) { c.fillRect(x - 5, y - 14 - k * 14, 2.5, 5); c.fillRect(x + 3, y - 20 - k * 14, 2.5, 5); }
    c.strokeStyle = 'rgba(30,26,22,.6)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x - 3, y - 4); c.lineTo(x - 1, y - 18); c.lineTo(x - 4, y - 30); c.stroke();
    c.save(); c.translate(x, y - h + 22); c.rotate(0.12);
    c.fillStyle = '#3c5a52'; c.beginPath(); c.moveTo(-9, 0); c.quadraticCurveTo(-12, -12, 0, -22); c.quadraticCurveTo(12, -12, 9, 0); c.closePath(); c.fill();
    c.fillStyle = '#2b4039'; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(12, -12, 0, -22); c.lineTo(0, 0); c.fill();
    c.strokeStyle = '#3c5a52'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -22); c.lineTo(1, -30); c.stroke();
    c.restore();
  },

  draw_dock(c, gx, gy, df) {
    // malá loděnice: dřevěné molo na kůlech, loďky a šlapadla (některé potopené)
    const a = this.P(gx + 0.1, gy + 0.5), b = this.P(gx + df.w - 0.1, gy + 0.5);
    c.strokeStyle = '#4a3a2a'; c.lineWidth = 2;
    for (let t = 0; t <= 1; t += 0.25) { const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; c.beginPath(); c.moveTo(x, y - 3); c.lineTo(x, y + 5); c.stroke(); }
    c.strokeStyle = '#8a6a42'; c.lineWidth = 9; c.beginPath(); c.moveTo(a[0], a[1] - 4); c.lineTo(b[0], b[1] - 4); c.stroke();
    c.strokeStyle = 'rgba(60,45,28,.7)'; c.lineWidth = 0.7;
    for (let t = 0.05; t < 1; t += 0.08) { const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t - 4; c.beginPath(); c.moveTo(x - 3, y - 4); c.lineTo(x + 3, y + 4); c.stroke(); }
    const boat = (t, off, col, sunk) => {
      const x = a[0] + (b[0] - a[0]) * t - off, y = a[1] + (b[1] - a[1]) * t + off * 0.6;
      c.save(); c.translate(x, y); c.rotate(-0.45 + (sunk ? 0.5 : 0)); c.globalAlpha *= sunk ? 0.55 : 1;
      c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, 9, 3.6, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(30,26,22,.6)'; c.beginPath(); c.ellipse(0, 0, 6, 2, 0, 0, 7); c.fill();
      c.restore();
    };
    boat(0.2, 12, '#9c4a2a', false); boat(0.55, 13, '#d8d2c0', true); boat(0.85, 11, '#3d6a7a', false); boat(0.5, -12, '#c2a24a', false);
  },

  draw_tram(c, gx, gy, df) {
    // vrak tramvaje: červeno-krémový vůz, rezavý, vybitá okna
    const b = this.box(c, gx + 0.1, gy + 0.25, df.w - 0.2, df.d - 0.5, 13, '#8f867a', '#a63a2c', '#7c2a20');
    c.fillStyle = '#d9cfb4'; c.beginPath(); c.moveTo(b.D[0], b.D[1] - 7); c.lineTo(b.C[0], b.C[1] - 7); c.lineTo(b.C[0], b.C[1] - 13); c.lineTo(b.D[0], b.D[1] - 13); c.fill();
    c.fillStyle = 'rgba(22,19,16,.9)';
    for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6, x = b.D[0] + (b.C[0] - b.D[0]) * t, y = b.D[1] + (b.C[1] - b.D[1]) * t; c.fillRect(x - 3.5, y - 12, 7, 4); }
    c.fillStyle = 'rgba(120,60,25,.55)'; for (let i = 0; i < 5; i++) { const t = (i + 0.3) / 5, x = b.D[0] + (b.C[0] - b.D[0]) * t, y = b.D[1] + (b.C[1] - b.D[1]) * t; c.fillRect(x, y - 5, 5, 3); }
  },

  // ---------- stavby z harampádí (zástupná grafika) ----------
  draw_guardtower(c, gx, gy, df) {
    const [x, y] = this.center(gx, gy, df), h = df.h;
    this.shadowBlob(c, x + 14, y, 16, 5);
    c.strokeStyle = '#6b4a2b'; c.lineWidth = 2.5;
    for (const [dx, dy] of [[-11, 0], [11, 0], [-5, 5], [5, -5]]) { c.beginPath(); c.moveTo(x + dx, y + dy); c.lineTo(x + dx * 0.7, y + dy * 0.7 - h + 12); c.stroke(); }
    c.lineWidth = 1; c.strokeStyle = '#7d5a35';
    c.beginPath(); c.moveTo(x - 10, y - 4); c.lineTo(x + 8, y - 22); c.moveTo(x + 10, y - 4); c.lineTo(x - 8, y - 22); c.stroke();
    // plošina s prkny
    const py = y - h + 12;
    c.fillStyle = '#8a6a42'; c.beginPath(); c.moveTo(x - 14, py); c.lineTo(x, py - 7); c.lineTo(x + 14, py); c.lineTo(x, py + 7); c.closePath(); c.fill();
    c.fillStyle = '#6b5032'; c.fillRect(x - 14, py, 28, 5);
    c.strokeStyle = '#5a4128'; c.lineWidth = 1; for (let i = -12; i < 14; i += 4) { c.beginPath(); c.moveTo(x + i, py - 6); c.lineTo(x + i, py - 1); c.stroke(); }
    // stříška z plechu
    c.fillStyle = '#7d7a72'; c.beginPath(); c.moveTo(x - 15, py - 12); c.lineTo(x, py - 22); c.lineTo(x + 15, py - 12); c.lineTo(x, py - 6); c.closePath(); c.fill();
    c.fillStyle = '#5f5c55'; c.beginPath(); c.moveTo(x, py - 6); c.lineTo(x + 15, py - 12); c.lineTo(x + 15, py - 10); c.lineTo(x, py - 4); c.fill();
    c.strokeStyle = '#2b2b29'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - 2, py - 4); c.lineTo(x - 12, py - 8); c.stroke(); // hlaveň
  },

  draw_windmill(c, gx, gy, df) {
    const [x, y] = this.center(gx, gy, df), h = df.h;
    this.shadowBlob(c, x + 16, y, 16, 4);
    // příhradová věž ze šrotu
    c.strokeStyle = '#6f6a62'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(x - 9, y); c.lineTo(x - 2, y - h + 12); c.moveTo(x + 9, y); c.lineTo(x + 2, y - h + 12); c.stroke();
    c.lineWidth = 0.8;
    for (let k = 0; k < 5; k++) {
      const y1 = y - k * (h - 12) / 5, y2 = y - (k + 1) * (h - 12) / 5, w1 = 9 - k * 1.4, w2 = 9 - (k + 1) * 1.4;
      c.beginPath(); c.moveTo(x - w1, y1); c.lineTo(x + w2, y2); c.moveTo(x + w1, y1); c.lineTo(x - w2, y2); c.stroke();
    }
    // lopatky z plechu a cedulí (pomalu se točí)
    const hx = x, hy = y - h + 10, a0 = (performance.now() / 900) % (Math.PI * 2);
    const cols = ['#9c4a2a', '#8f8c84', '#3d6a7a', '#c2a24a', '#7a7a70', '#a85c32'];
    for (let i = 0; i < 6; i++) {
      const a = a0 + i * Math.PI / 3, ex = hx + Math.cos(a) * 16, ey = hy + Math.sin(a) * 16 * 0.9;
      c.fillStyle = cols[i]; c.beginPath(); c.moveTo(hx, hy);
      c.lineTo(hx + Math.cos(a - 0.22) * 17, hy + Math.sin(a - 0.22) * 15); c.lineTo(ex, ey); c.closePath(); c.fill();
    }
    c.fillStyle = '#333'; c.beginPath(); c.arc(hx, hy, 2.5, 0, 7); c.fill();
    // ocas
    c.fillStyle = '#8f8c84'; c.beginPath(); c.moveTo(hx + 2, hy); c.lineTo(hx + 14, hy - 5); c.lineTo(hx + 14, hy + 3); c.closePath(); c.fill();
  },

  draw_tent(c, gx, gy, df) {
    const A = this.P(gx + 0.15, gy + 0.5), B = this.P(gx + 0.85, gy + 0.5), h = df.h;
    const F1 = this.P(gx + 0.15, gy + 0.9), F2 = this.P(gx + 0.85, gy + 0.9), K1 = this.P(gx + 0.15, gy + 0.1), K2 = this.P(gx + 0.85, gy + 0.1);
    this.shadowBlob(c, (F1[0] + F2[0]) / 2 + 4, (F1[1] + F2[1]) / 2, 14, 4);
    const poly = (pts, f) => { c.fillStyle = f; c.beginPath(); c.moveTo(...pts[0]); pts.slice(1).forEach(p => c.lineTo(...p)); c.closePath(); c.fill(); };
    poly([K1, K2, [B[0], B[1] - h], [A[0], A[1] - h]], '#8a7a54');
    poly([F1, F2, [B[0], B[1] - h], [A[0], A[1] - h]], '#a8956a');   // přední plachta
    poly([K2, F2, [B[0], B[1] - h]], '#7a6b48');                      // štít
    c.fillStyle = '#3a3226'; c.beginPath(); c.moveTo(B[0] - 2, B[1] - h + 3); c.lineTo(F2[0] - 1, F2[1]); c.lineTo(K2[0] + 1, K2[1]); c.closePath(); c.fill();
    c.strokeStyle = '#5a4a32'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(A[0], A[1] - h); c.lineTo(B[0], B[1] - h); c.stroke();
    c.fillStyle = '#5d6b7a'; c.fillRect((F1[0] + F2[0]) / 2 - 5, (F1[1] + F2[1]) / 2 - h * 0.5, 7, 4); // záplata
  },

  draw_armytent(c, gx, gy, df) {
    const w = df.w, d = df.d, h = df.h;
    const b = this.box(c, gx + 0.1, gy + 0.1, w - 0.2, d - 0.2, h * 0.45, null, '#5f6a3c', '#4c5530');
    const R1 = this.P(gx + 0.1, gy + d / 2), R2 = this.P(gx + w - 0.1, gy + d / 2);
    const r1 = [R1[0], R1[1] - h], r2 = [R2[0], R2[1] - h];
    const Au = b.up(b.A), Bu = b.up(b.B), Cu = b.up(b.C), Du = b.up(b.D);
    const poly = (pts, f) => { c.fillStyle = f; c.beginPath(); c.moveTo(...pts[0]); pts.slice(1).forEach(p => c.lineTo(...p)); c.closePath(); c.fill(); };
    poly([Au, Bu, r2, r1], '#56613a');
    poly([Bu, Cu, r2], '#4c5530');
    poly([Du, Cu, r2, r1], '#6b7745');
    c.strokeStyle = 'rgba(40,45,25,.6)'; c.lineWidth = 0.8;
    for (let i = 1; i < 5; i++) { const t = i / 5; c.beginPath(); c.moveTo(Du[0] + (Cu[0] - Du[0]) * t, Du[1] + (Cu[1] - Du[1]) * t); c.lineTo(r1[0] + (r2[0] - r1[0]) * t, r1[1] + (r2[1] - r1[1]) * t); c.stroke(); }
    // vchod a červený kříž / číslo
    const mx = (b.B[0] + b.C[0]) / 2, my = (b.B[1] + b.C[1]) / 2;
    c.fillStyle = '#2d3220'; c.beginPath(); c.moveTo(mx - 5, my + 2); c.lineTo(mx + 5, my - 3); c.lineTo(mx + 5, my - 12); c.lineTo(mx - 5, my - 7); c.fill();
    c.fillStyle = '#e8e3d0'; c.font = 'bold 6px sans-serif'; c.textAlign = 'center'; c.fillText('U.S.', (Du[0] + Cu[0]) / 2, (Du[1] + Cu[1]) / 2 - 2);
  },

  draw_house(c, gx, gy, df) {
    // opravený dům: cihly + plechové záplaty, střecha z vlnitého plechu
    const w = df.w, d = df.d, h = df.h;
    const b = this.box(c, gx + 0.1, gy + 0.1, w - 0.2, d - 0.2, h, null, '#9a6a4a', '#7d5238');
    // záplaty
    c.fillStyle = '#8d9090'; const z = (p, q, t, s) => { const x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t; c.fillRect(x, y - s - 6, 9, s); };
    z(b.D, b.C, 0.15, 8); z(b.B, b.C, 0.55, 10);
    c.fillStyle = '#3d5e7a'; z(b.D, b.C, 0.6, 6);
    c.fillStyle = '#e8d8a0'; const win = (p, q, t) => { const x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t; c.fillRect(x, y - 15, 5, 5); };
    win(b.B, b.C, 0.25);
    // střecha
    const R1 = this.P(gx + 0.1, gy + d / 2), R2 = this.P(gx + w - 0.1, gy + d / 2), rh = h + 12;
    const r1 = [R1[0], R1[1] - rh], r2 = [R2[0], R2[1] - rh], Au = b.up(b.A), Bu = b.up(b.B), Cu = b.up(b.C), Du = b.up(b.D);
    const poly = (pts, f) => { c.fillStyle = f; c.beginPath(); c.moveTo(...pts[0]); pts.slice(1).forEach(p => c.lineTo(...p)); c.closePath(); c.fill(); };
    poly([Au, Bu, r2, r1], '#6e6b63'); poly([Bu, Cu, r2], '#8d6046'); poly([Du, Cu, r2, r1], '#8a8780');
    c.strokeStyle = 'rgba(40,40,38,.45)'; c.lineWidth = 0.6;
    for (let i = 1; i < 14; i++) { const t = i / 14; c.beginPath(); c.moveTo(Du[0] + (Cu[0] - Du[0]) * t, Du[1] + (Cu[1] - Du[1]) * t); c.lineTo(r1[0] + (r2[0] - r1[0]) * t, r1[1] + (r2[1] - r1[1]) * t); c.stroke(); }
    c.fillStyle = 'rgba(150,70,30,.6)'; c.fillRect((Du[0] + r1[0]) / 2, (Du[1] + r1[1]) / 2 - 2, 10, 5); // rezavá záplata
    // komín z trubky
    c.fillStyle = '#4a4a48'; c.fillRect(r2[0] - 10, r2[1] - 2, 3, 9);
  },

  draw_ruin(c, gx, gy, df) { this.draw_ruinhouse(c, gx, gy, df); },

  draw_ruinhouse(c, gx, gy, df) {
    // vyhořelé zdi bez střechy, okna jako černé díry
    const w = df.w || 2, d = df.d || 2;
    this.footprint(c, gx + 0.05, gy + 0.05, w - 0.1, d - 0.1, 'rgba(40,36,30,.6)');
    const wall = (x1, y1, x2, y2, h, col) => {
      const p1 = this.P(x1, y1), p2 = this.P(x2, y2);
      c.fillStyle = col; c.beginPath(); c.moveTo(...p1); c.lineTo(...p2);
      const n = 6;
      for (let i = n; i >= 0; i--) { const t = i / n, hh = h * (0.45 + 0.55 * Math.abs(Math.sin(t * 5 + x1 + y1))); c.lineTo(p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t - hh); }
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(20,18,15,.85)';
      for (const t of [0.3, 0.7]) c.fillRect(p1[0] + (p2[0] - p1[0]) * t - 2.5, p1[1] + (p2[1] - p1[1]) * t - h * 0.55, 5, 6);
    };
    wall(gx + 0.1, gy + 0.1, gx + w - 0.1, gy + 0.1, 20, '#8e8a80');        // zadní zeď
    wall(gx + 0.1, gy + 0.1, gx + 0.1, gy + d - 0.1, 16, '#7c776c');
    this.draw_rubble(c, gx + w / 2 - 0.5, gy + d / 2 - 0.5, {});
    wall(gx + w - 0.1, gy + 0.1, gx + w - 0.1, gy + d - 0.1, 13, '#6f6a60'); // boční (nižší)
    wall(gx + 0.1, gy + d - 0.1, gx + w * 0.55, gy + d - 0.1, 10, '#9a958a');
    // černé šmouhy od ohně
    const [x, y] = this.P(gx + w / 2, gy + 0.1);
    c.fillStyle = 'rgba(20,18,15,.35)'; c.beginPath(); c.ellipse(x, y - 14, 10, 6, 0, 0, 7); c.fill();
  },

  draw_ruinvilla(c, gx, gy, df) {
    // vyhořelá bílá vila s červenou střechou (jako na fotce ostrova, ale po válce)
    const w = df.w, d = df.d, h = df.h;
    const b = this.box(c, gx + 0.1, gy + 0.1, w - 0.2, d - 0.2, h, null, '#cfc9bd', '#b3ad9f');
    // propadlá střecha: jen zbytky tašek a trámy
    const Au = b.up(b.A), Bu = b.up(b.B), Cu = b.up(b.C), Du = b.up(b.D);
    c.fillStyle = '#2a2622'; c.beginPath(); c.moveTo(...Au); c.lineTo(...Bu); c.lineTo(...Cu); c.lineTo(...Du); c.closePath(); c.fill();
    c.fillStyle = '#9c3f2a'; c.beginPath(); c.moveTo(...Du); c.lineTo(Du[0] + (Cu[0] - Du[0]) * 0.4, Du[1] + (Cu[1] - Du[1]) * 0.4); c.lineTo(Du[0] + (Cu[0] - Du[0]) * 0.3, Du[1] - 10); c.lineTo(Du[0] + 4, Du[1] - 12); c.closePath(); c.fill();
    c.fillStyle = '#8a3624'; c.beginPath(); c.moveTo(...Bu); c.lineTo(Bu[0] + (Cu[0] - Bu[0]) * 0.5, Bu[1] + (Cu[1] - Bu[1]) * 0.5); c.lineTo(Bu[0] - 6, Bu[1] - 8); c.closePath(); c.fill();
    c.strokeStyle = '#2b1e14'; c.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) { const t = i / 4; c.beginPath(); c.moveTo(Du[0] + (Cu[0] - Du[0]) * t, Du[1] + (Cu[1] - Du[1]) * t); c.lineTo(Au[0] + (Bu[0] - Au[0]) * t, Au[1] + (Bu[1] - Au[1]) * t - 8); c.stroke(); }
    // okna – vypálená
    c.fillStyle = 'rgba(25,22,18,.9)';
    for (let i = 0; i < 5; i++) { const t = 0.12 + i * 0.18, x = b.D[0] + (b.C[0] - b.D[0]) * t, y = b.D[1] + (b.C[1] - b.D[1]) * t; c.fillRect(x - 2, y - h + 7, 4, 7); c.fillRect(x - 2, y - h * 0.45, 4, 7); }
    for (let i = 0; i < 3; i++) { const t = 0.2 + i * 0.3, x = b.B[0] + (b.C[0] - b.B[0]) * t, y = b.B[1] + (b.C[1] - b.B[1]) * t; c.fillRect(x - 2, y - h + 7, 4, 7); }
    // saze nad okny
    c.fillStyle = 'rgba(25,22,18,.3)';
    for (let i = 0; i < 5; i++) { const t = 0.12 + i * 0.18, x = b.D[0] + (b.C[0] - b.D[0]) * t, y = b.D[1] + (b.C[1] - b.D[1]) * t; c.beginPath(); c.ellipse(x, y - h + 4, 4, 5, 0, 0, 7); c.fill(); }
    // praskliny ve zdi
    c.strokeStyle = 'rgba(60,55,48,.7)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(b.D[0] + 20, b.D[1] - 4); c.lineTo(b.D[0] + 24, b.D[1] - 14); c.lineTo(b.D[0] + 21, b.D[1] - 22); c.stroke();
  },

  draw_ruinwall(c, gx, gy) {
    const p1 = this.P(gx + 0.1, gy + 0.5), p2 = this.P(gx + 0.9, gy + 0.5);
    c.fillStyle = '#8b867b'; c.beginPath(); c.moveTo(...p1); c.lineTo(...p2); c.lineTo(p2[0], p2[1] - 7); c.lineTo(p2[0] - 8, p2[1] - 14);
    c.lineTo(p1[0] + 12, p1[1] - 16); c.lineTo(p1[0] + 4, p1[1] - 11); c.lineTo(p1[0], p1[1] - 12); c.closePath(); c.fill();
    c.fillStyle = 'rgba(20,18,15,.8)'; c.fillRect((p1[0] + p2[0]) / 2 - 2, (p1[1] + p2[1]) / 2 - 10, 4, 5);
    this.draw_rubble(c, gx, gy + 0.2, {});
  },

  draw_crater(c, gx, gy, df) {
    const [x, y] = this.center(gx, gy, df);
    c.fillStyle = 'rgba(30,26,22,.55)'; c.beginPath(); c.ellipse(x, y, 24, 11, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(15,13,11,.7)'; c.beginPath(); c.ellipse(x, y + 1, 15, 6.5, 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(140,125,100,.6)'; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y, 22, 10, 0, 3.4, 6.1); c.stroke();
  },

  draw_lookout(c, gx, gy, df) {
    // pískovcová vyhlídka: kamenná věž s plošinou a žebříkem
    const b = this.box(c, gx + 0.2, gy + 0.2, 0.6, 0.6, df.h - 8, null, '#c7a774', '#a98a5a');
    for (let k = 1; k < 6; k++) {
      const y = k * (df.h - 8) / 6;
      c.strokeStyle = 'rgba(110,85,50,.5)'; c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(b.D[0], b.D[1] - y); c.lineTo(b.C[0], b.C[1] - y); c.lineTo(b.B[0], b.B[1] - y); c.stroke();
    }
    c.save(); c.translate(0, -(df.h - 8));
    this.box(c, gx + 0.05, gy + 0.05, 0.9, 0.9, 5, '#d8bb88', '#b8996a', '#9c7f52', false);
    c.restore();
    const [x, y] = this.P(gx + 0.5, gy + 0.5);
    c.fillStyle = '#e0b52c'; c.beginPath(); c.moveTo(x, y - df.h - 18); c.lineTo(x + 10, y - df.h - 14); c.lineTo(x, y - df.h - 10); c.fill();
    c.strokeStyle = '#5a4128'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y - df.h - 4); c.lineTo(x, y - df.h - 19); c.stroke();
    // žebřík
    const lx = b.C[0] + 3, ly = b.C[1];
    c.strokeStyle = '#6b4a2b'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx, ly - df.h + 6); c.moveTo(lx + 4, ly - 2); c.lineTo(lx + 4, ly - df.h + 4); c.stroke();
    for (let k = 4; k < df.h - 6; k += 5) { c.beginPath(); c.moveTo(lx, ly - k); c.lineTo(lx + 4, ly - k - 2); c.stroke(); }
  },

  draw_containers(c, gx, gy, df) {
    // dva přepravní kontejnery z doků, jeden na druhém
    const w = df.w, d = df.d;
    const one = (x, y, ww, dd, h, cols) => {
      const b = this.box(c, x, y, ww, dd, h, ...cols);
      this.ribs(c, b.D, b.C, h, 16, 'rgba(0,0,0,.25)'); this.ribs(c, b.B, b.C, h, 6, 'rgba(0,0,0,.25)');
      return b;
    };
    one(gx + 0.05, gy + 0.1, w - 0.1, d - 0.2, 12, ['#a9472c', '#8f3a22', '#74301c']);
    c.save(); c.translate(0, -12);
    const b = one(gx + 0.15, gy + 0.15, w - 0.35, d - 0.3, 10, ['#3d6a7a', '#33596a', '#2a4a58']);
    c.fillStyle = 'rgba(230,225,210,.8)'; c.font = 'bold 5px sans-serif'; c.textAlign = 'center';
    c.fillText('DOCK', (b.D[0] + b.C[0]) / 2, (b.D[1] + b.C[1]) / 2 - 4);
    c.restore();
    c.fillStyle = 'rgba(150,70,30,.5)'; c.fillRect(this.P(gx + 0.6, gy + d)[0], this.P(gx + 0.6, gy + d)[1] - 9, 6, 4);
  },

  // ---------- budovy (zástupná grafika) ----------
  draw_bunker(c, gx, gy, df) {
    const b = this.box(c, gx, gy, df.w, df.d, df.h, '#3b3a36', '#b5b0a5', '#8f8a80');
    // atika na střeše
    const A = b.up(this.P(gx + 0.12, gy + 0.12)), B = b.up(this.P(gx + df.w - 0.12, gy + 0.12)), C = b.up(this.P(gx + df.w - 0.12, gy + df.d - 0.12)), D = b.up(this.P(gx + 0.12, gy + df.d - 0.12));
    c.fillStyle = '#2c2b28'; c.beginPath(); c.moveTo(...A); c.lineTo(...B); c.lineTo(...C); c.lineTo(...D); c.closePath(); c.fill();
    // okna a dveře na přední stěně
    const Dp = b.D, Cp = b.C;
    for (let i = 0; i < 3; i++) {
      const t = 0.15 + i * 0.3, x = Dp[0] + (Cp[0] - Dp[0]) * t, y = Dp[1] + (Cp[1] - Dp[1]) * t;
      c.fillStyle = i === 1 ? '#2a2a28' : '#3d5e7a';
      if (i === 1) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 10, y + 5); c.lineTo(x + 10, y - 9); c.lineTo(x, y - 14); c.fill(); }
      else { c.beginPath(); c.moveTo(x, y - 12); c.lineTo(x + 8, y - 8); c.lineTo(x + 8, y - 14); c.lineTo(x, y - 18); c.fill(); }
    }
    // cedule HQ
    const sx = Dp[0] + (Cp[0] - Dp[0]) * 0.72, sy = Dp[1] + (Cp[1] - Dp[1]) * 0.72;
    c.fillStyle = '#d8d2c0'; c.beginPath(); c.moveTo(sx, sy - 16); c.lineTo(sx + 14, sy - 9); c.lineTo(sx + 14, sy - 3); c.lineTo(sx, sy - 10); c.fill();
    c.fillStyle = '#7a1f1f'; c.font = 'bold 5px sans-serif'; c.save(); c.translate(sx + 2, sy - 9); c.transform(1, 0.5, 0, 1, 0, 0); c.fillText('HQ', 0, 0); c.restore();
    // anténa
    const top = b.up(this.P(gx + df.w - 0.4, gy + 0.4));
    c.strokeStyle = '#555'; c.lineWidth = 1; c.beginPath(); c.moveTo(...top); c.lineTo(top[0], top[1] - 18); c.stroke();
    c.fillStyle = '#e04040'; c.beginPath(); c.arc(top[0], top[1] - 18, 1.5, 0, 7); c.fill();
  },

  draw_barracks(c, gx, gy, df) {
    const h = df.h, w = df.w, d = df.d, rh = 12;
    const b = this.box(c, gx, gy, w, d, h, null, '#7a7f80', '#5f6566');
    this.ribs(c, b.D, b.C, h, 30, 'rgba(0,0,0,.25)'); this.ribs(c, b.B, b.C, h, 12, 'rgba(0,0,0,.25)');
    const R1 = this.P(gx, gy + d / 2), R2 = this.P(gx + w, gy + d / 2);
    const r1 = [R1[0], R1[1] - h - rh], r2 = [R2[0], R2[1] - h - rh];
    const A = b.up(b.A), Bu = b.up(b.B), Cu = b.up(b.C), Du = b.up(b.D);
    const poly = (pts, f) => { c.fillStyle = f; c.beginPath(); c.moveTo(...pts[0]); pts.slice(1).forEach(p => c.lineTo(...p)); c.closePath(); c.fill(); };
    poly([A, Bu, r2, r1], '#4f5d55');
    poly([Bu, Cu, r2], '#6d7272'); // štít
    poly([Du, Cu, r2, r1], '#68786a');
    // pruhy na střeše (zelená/rezavá jako staré plechy)
    c.lineWidth = 1.2;
    for (let i = 1; i < 28; i++) {
      const t = i / 28;
      const p1 = [Du[0] + (Cu[0] - Du[0]) * t, Du[1] + (Cu[1] - Du[1]) * t], p2 = [r1[0] + (r2[0] - r1[0]) * t, r1[1] + (r2[1] - r1[1]) * t];
      c.strokeStyle = i % 3 === 0 ? 'rgba(150,120,70,.55)' : 'rgba(30,40,30,.35)';
      c.beginPath(); c.moveTo(...p1); c.lineTo(...p2); c.stroke();
    }
    // dveře + cedulka
    const x = b.B[0] + (b.C[0] - b.B[0]) * 0.5, y = b.B[1] + (b.C[1] - b.B[1]) * 0.5;
    c.fillStyle = '#2b2b2a'; c.beginPath(); c.moveTo(x - 4, y + 2); c.lineTo(x + 4, y - 2); c.lineTo(x + 4, y - 14); c.lineTo(x - 4, y - 10); c.fill();
    c.fillStyle = '#d33'; c.fillRect(x + 7, y - 14, 5, 3);
  },

  draw_hangar(c, gx, gy, df) {
    const h = df.h, w = df.w, d = df.d, N = 14;
    const sh1 = this.P(gx + w, gy), sh2 = this.P(gx + w, gy + d);
    c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.moveTo(...sh1); c.lineTo(sh1[0] + h, sh1[1]); c.lineTo(sh2[0] + h, sh2[1]); c.lineTo(...sh2); c.fill();
    const H = t => h * Math.sin(Math.PI * t);
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const a = this.P(gx, gy + t0 * d), b = this.P(gx + w, gy + t0 * d), cc = this.P(gx + w, gy + t1 * d), dd = this.P(gx, gy + t1 * d);
      const light = 150 + Math.round(70 * Math.cos(Math.PI * (t0 - 0.35)));
      c.fillStyle = `rgb(${light},${light + 3},${light})`;
      c.beginPath(); c.moveTo(a[0], a[1] - H(t0)); c.lineTo(b[0], b[1] - H(t0)); c.lineTo(cc[0], cc[1] - H(t1)); c.lineTo(dd[0], dd[1] - H(t1)); c.closePath(); c.fill();
      // vlnitý plech
      c.strokeStyle = 'rgba(60,60,60,.35)'; c.lineWidth = 0.6;
      for (let k = 1; k < 24; k++) {
        const u = k / 24, p1 = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - H(t0)], p2 = [dd[0] + (cc[0] - dd[0]) * u, dd[1] + (cc[1] - dd[1]) * u - H(t1)];
        c.beginPath(); c.moveTo(...p1); c.lineTo(...p2); c.stroke();
      }
    }
    // čelo s vraty
    c.fillStyle = '#9ea19c'; c.beginPath();
    for (let i = 0; i <= N; i++) { const t = i / N, p = this.P(gx + w, gy + t * d); i ? c.lineTo(p[0], p[1] - H(t)) : c.moveTo(p[0], p[1] - H(t)); }
    c.closePath(); c.fill();
    const g1 = this.P(gx + w, gy + d * 0.25), g2 = this.P(gx + w, gy + d * 0.75);
    c.fillStyle = '#3a3b38'; c.beginPath(); c.moveTo(...g1); c.lineTo(...g2); c.lineTo(g2[0], g2[1] - h * 0.6); c.lineTo(g1[0], g1[1] - h * 0.6); c.fill();
  },

  draw_yard(c, gx, gy, df) {
    this.footprint(c, gx, gy, df.w, df.d, '#5d4c33');
    const r = rng(gx * 31 + gy);
    // hromady šrotu a bedny
    for (let i = 0; i < 7; i++) {
      const x = gx + 0.3 + r() * (df.w - 0.6), y = gy + 0.3 + r() * (df.d - 0.6), s = 0.22 + r() * 0.2;
      const cols = [['#4b5a3a', '#3d4a2f', '#33402a'], ['#6e4a2b', '#5a3c22', '#4a311c'], ['#5a5a58', '#474745', '#3a3a38']][i % 3];
      this.box(c, x, y, s, s, 5 + r() * 8, ...cols, false);
    }
    // plechový plot okolo
    const h = df.h;
    const b = this.box(c, gx, gy, df.w, 0.06, h, '#c9cbc6', '#b5b8b2', '#9a9d98', false);
    this.box(c, gx, gy, 0.06, df.d, h, '#c9cbc6', '#b5b8b2', '#9a9d98', false);
    const f = this.box(c, gx, gy + df.d - 0.06, df.w, 0.06, h, '#d8dad5', '#c3c6c0', '#9a9d98', false);
    this.box(c, gx + df.w - 0.06, gy, 0.06, df.d, h, '#d8dad5', '#c3c6c0', '#a6a9a4', false);
    this.ribs(c, f.D, f.C, h, 26, 'rgba(0,0,0,.2)');
  },

  sandbagRing(c, x, y, rx, ry) {
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, px = x + Math.cos(a) * rx, py = y + Math.sin(a) * ry;
      c.fillStyle = i % 2 ? '#a08d62' : '#8c7a52'; c.beginPath(); c.ellipse(px, py, 4.5, 3, 0, 0, 7); c.fill();
      c.fillStyle = '#b8a575'; c.beginPath(); c.ellipse(px, py - 3, 4.5, 2.6, 0, 0, 7); c.fill();
    }
  },

  draw_nest(c, gx, gy) {
    const [x, y] = this.P(gx + 0.5, gy + 0.5);
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(x + 3, y + 2, 20, 10, 0, 0, 7); c.fill();
    this.sandbagRing(c, x, y, 15, 7.5);
    c.strokeStyle = '#1d1d1b'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - 3, y - 6); c.lineTo(x - 16, y - 10); c.stroke();
    c.fillStyle = '#2d2f29'; c.fillRect(x - 5, y - 9, 8, 5);
  },

  draw_mortar(c, gx, gy) {
    const [x, y] = this.P(gx + 0.5, gy + 0.5);
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(x + 3, y + 2, 20, 10, 0, 0, 7); c.fill();
    this.sandbagRing(c, x, y, 15, 7.5);
    c.strokeStyle = '#2f3a26'; c.lineWidth = 5; c.beginPath(); c.moveTo(x, y - 3); c.lineTo(x - 6, y - 20); c.stroke();
    c.strokeStyle = '#1b2016'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 1, y - 3); c.lineTo(x + 6, y + 2); c.moveTo(x - 1, y - 3); c.lineTo(x - 8, y + 1); c.stroke();
  },

  draw_tesla(c, gx, gy, df) {
    const b = this.box(c, gx + 0.3, gy + 0.3, 0.4, 0.4, df.h - 10, '#6c6f72', '#55585b', '#3f4245');
    const [x, y] = this.P(gx + 0.5, gy + 0.5);
    c.strokeStyle = '#b87333'; c.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(x, y - 8 - i * 4.5, 6, 2.5, 0, 0, 7); c.stroke(); }
    const g = c.createRadialGradient(x, y - df.h, 1, x, y - df.h, 9);
    g.addColorStop(0, '#e9fbff'); g.addColorStop(0.5, '#6fd3ff'); g.addColorStop(1, 'rgba(80,180,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y - df.h, 9, 0, 7); c.fill();
  },

  draw_barricade(c, gx, gy, df) {
    const b = this.box(c, gx + 0.1, gy + 0.3, 0.8, 0.4, df.h, '#5b5650', '#6a645c', '#4c4842');
    // výstražné pruhy
    c.save(); c.beginPath(); c.moveTo(...b.D); c.lineTo(...b.C); c.lineTo(...b.up(b.C)); c.lineTo(...b.up(b.D)); c.closePath(); c.clip();
    c.strokeStyle = '#e0b52c'; c.lineWidth = 3;
    for (let i = -4; i < 8; i++) { c.beginPath(); c.moveTo(b.D[0] + i * 7, b.D[1] + 4); c.lineTo(b.D[0] + i * 7 + 10, b.D[1] - 18); c.stroke(); }
    c.restore();
    // pneumatika
    const [x, y] = this.P(gx + 0.8, gy + 0.85);
    c.fillStyle = '#1e1e1e'; c.beginPath(); c.ellipse(x, y - 3, 6, 3.5, 0, 0, 7); c.fill();
    c.fillStyle = '#444'; c.beginPath(); c.ellipse(x, y - 3, 2.5, 1.4, 0, 0, 7); c.fill();
  },

  draw_fence(c, gx, gy, df, p) {
    // pletivo se napojí na sousední ploty
    const kd = Game.kd(), set = new Set(this.ensure(kd).decor.filter(q => q.id === 'fence').map(q => q.gx + ',' + q.gy));
    const [x, y] = this.P(gx + 0.5, gy + 0.5), h = df.h;
    const link = (nx, ny) => {
      if (!set.has(nx + ',' + ny)) return;
      const [x2, y2] = this.P(nx + 0.5, ny + 0.5);
      c.fillStyle = 'rgba(160,165,160,.28)'; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.lineTo(x2, y2 - h); c.lineTo(x, y - h); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(200,205,200,.5)'; c.lineWidth = 0.5;
      for (let k = 0; k <= 8; k++) { const t = k / 8; c.beginPath(); c.moveTo(x + (x2 - x) * t, y + (y2 - y) * t); c.lineTo(x + (x2 - x) * Math.min(1, t + 0.12), y + (y2 - y) * Math.min(1, t + 0.12) - h); c.stroke(); }
      c.strokeStyle = '#8f938e'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, y - h); c.lineTo(x2, y2 - h); c.stroke();
    };
    link(gx - 1, gy); link(gx, gy - 1); link(gx + 1, gy); link(gx, gy + 1);
    c.strokeStyle = '#6d716c'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h - 2); c.stroke();
    if (![[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => set.has((gx + dx) + ',' + (gy + dy)))) {
      // samostatný kus plotu
      const [a1, b1] = this.P(gx + 0.1, gy + 0.5), [a2, b2] = this.P(gx + 0.9, gy + 0.5);
      c.fillStyle = 'rgba(160,165,160,.35)'; c.beginPath(); c.moveTo(a1, b1); c.lineTo(a2, b2); c.lineTo(a2, b2 - h); c.lineTo(a1, b1 - h); c.fill();
    }
    c.fillStyle = '#e8c33a'; c.fillRect(x - 2, y - h / 2 - 2, 4, 3);
  },

  draw_sandbags(c, gx, gy) {
    for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
      const [x, y] = this.P(gx + 0.15 + i * 0.23, gy + 0.5);
      c.fillStyle = (i + row) % 2 ? '#a08d62' : '#8c7a52'; c.beginPath(); c.ellipse(x, y - row * 4, 5, 3, 0, 0, 7); c.fill();
      c.fillStyle = '#b8a575'; c.beginPath(); c.ellipse(x, y - row * 4 - 2, 5, 2, 0, 0, 7); c.fill();
    }
  },

  enemy(c, en, time) {
    const [x, y0] = this.P(en.x / ISO.T, en.y / ISO.T), tx = Math.floor(en.x / ISO.T), ty = Math.floor(en.y / ISO.T);
    const y = y0 - ((this.baseTiles[ty] || [])[tx] === 'W' || tx < 0 || ty < 0 || tx >= ISO.G || ty >= ISO.G ? 7 : 0), size = en.e.boss ? 30 : 16, bob = Math.sin(time * 8 + en.wob) * 1.5;
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(x, y, size / 2.4, size / 6, 0, 0, 7); c.fill();
    if (en.slow > 0) { c.fillStyle = 'rgba(120,200,255,.35)'; c.beginPath(); c.ellipse(x, y - size / 2, size / 2, size / 2, 0, 0, 7); c.fill(); }
    c.font = size + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(en.e.a, x, y - size / 2 + bob);
    Battle.bar(c, x, y - size - 4, en.hp / en.max, en.e.boss ? '#f43f5e' : '#ef4444', en.e.boss ? 30 : 16);
  },

  hero(c, h) {
    const [x, y] = this.P(h.x / ISO.T, h.y / ISO.T);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(x, y, 8, 3, 0, 0, 7); c.fill();
    c.fillStyle = '#6b5a35'; c.strokeStyle = '#ffd34d'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(x, y - 10, 9, 0, 7); c.fill(); c.stroke();
    const pic = heroPic(h.def, 'apocalypse'), im = pic && this.face(pic);
    if (im) {  // obličej z portrétu v kolečku
      c.save(); c.beginPath(); c.arc(x, y - 10, 8.3, 0, 7); c.clip();
      c.drawImage(im, im.width * 0.14, im.height * 0.08, im.width * 0.72, im.width * 0.72, x - 8.3, y - 18.3, 16.6, 16.6);
      c.restore();
    } else {
      c.font = '12px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(skin(h.def, 'apocalypse')[1], x, y - 9.5);
    }
    Battle.bar(c, x, y - 24, h.hp / h.max, '#4ade80', 16);
  },
};
