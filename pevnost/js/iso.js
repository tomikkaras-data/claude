// Izometrická základna pro Pustinu. Stavění funguje jako vesnice v Cave Man RPG:
// záložky Stavby / Dekorace / Malování, nová věc se položí na nejbližší volné místo,
// pak ji můžeš posunout, otočit (⇋), potvrdit (✔) nebo zrušit (✖). Mapa se dá posouvat,
// přibližovat (+ / −, kolečko, dva prsty, WASD) a v rohu je minimapa.
// Vlastní grafiku stačí nahrát do img/buildings/<id>.png (viz README) – nahradí kreslené budovy.
'use strict';

const ISO = {
  T: 30,          // velikost políčka ve „světových“ jednotkách herní logiky
  G: 18,          // mapa G×G políček
  HW: 32, HH: 16, // polovina šířky/výšky dlaždice v pixelech (při zoomu 1)
};
const ISO_ZOOMS = [0.4, 0.55, 0.75, 1, 1.3, 1.7];

// Cesta pro nepřátele (políčka). Začíná za západním okrajem mapy a končí před velitelstvím.
const ISO_ROAD = [[-3, 14], [5, 14], [5, 9], [10, 9], [10, 13], [14, 13], [14, 6], [9, 6], [9, 3]];
const ISO_HQ = { gx: 8, gy: 1 };

// Budovy: rozměr (w×d políček), výška a styl kreslení.
const ISO_DEFS = {
  hall:     { w: 3, d: 2, h: 30, style: 'bunker' },
  tavern:   { w: 3, d: 2, h: 22, style: 'barracks', home: [1, 5] },
  forge:    { w: 3, d: 2, h: 30, style: 'hangar', home: [12, 1] },
  mine:     { w: 2, d: 2, h: 10, style: 'yard', home: [15, 9] },
  archer:   { w: 1, d: 1, h: 12, style: 'nest' },
  mage:     { w: 1, d: 1, h: 40, style: 'tesla' },
  cannon:   { w: 1, d: 1, h: 12, style: 'mortar' },
  barrier:  { w: 1, d: 1, h: 12, style: 'barricade', road: true },
};

// Dekorace (záložka Dekorace). Jen pro krásu, nebojují.
const ISO_DECOR = {
  deadtree:   { name: 'Suchý strom', group: 'plants', cost: 6, h: 34, icon: '🌳' },
  bush:       { name: 'Suchý keř', group: 'plants', cost: 3, h: 10, icon: '🌿' },
  cactus:     { name: 'Kaktus', group: 'plants', cost: 5, h: 22, icon: '🌵' },
  tuft:       { name: 'Suchá tráva', group: 'plants', cost: 2, h: 6, icon: '🌾' },
  rock:       { name: 'Kámen', group: 'rocks', cost: 3, h: 8, icon: '🪨' },
  boulder:    { name: 'Balvan', group: 'rocks', cost: 6, h: 18, icon: '⛰️' },
  rubble:     { name: 'Suť', group: 'rocks', cost: 4, h: 6, icon: '🧱' },
  bones:      { name: 'Kosti', group: 'rocks', cost: 4, h: 6, icon: '🦴' },
  car:        { name: 'Vrak auta', group: 'junk', cost: 25, h: 14, icon: '🚗', w: 2, d: 1 },
  barrel:     { name: 'Rezavý sud', group: 'junk', cost: 4, h: 14, icon: '🛢️' },
  tires:      { name: 'Pneumatiky', group: 'junk', cost: 4, h: 10, icon: '⚫' },
  crates:     { name: 'Bedny', group: 'junk', cost: 6, h: 14, icon: '📦' },
  scrap:      { name: 'Hromada šrotu', group: 'junk', cost: 8, h: 14, icon: '⚙️' },
  watertower: { name: 'Vodojem', group: 'junk', cost: 40, h: 56, icon: '🗼' },
  fence:      { name: 'Plot z pletiva', group: 'walls', cost: 5, h: 16, icon: '🔗' },
  sandbags:   { name: 'Pytle s pískem', group: 'walls', cost: 8, h: 8, icon: '🟫' },
  concrete:   { name: 'Betonový zátaras', group: 'walls', cost: 10, h: 10, icon: '🧱' },
  sign:       { name: 'Výstražná cedule', group: 'walls', cost: 3, h: 20, icon: '⚠️' },
  lamp:       { name: 'Lampa', group: 'walls', cost: 6, h: 36, icon: '💡' },
};
const ISO_DECOR_GROUPS = [['plants', '🌵 Rostliny'], ['rocks', '🪨 Kameny'], ['junk', '🚗 Šrot'], ['walls', '🔗 Ploty']];

// Malování země (záložka Malování)
const ISO_BRUSHES = {
  S: { name: 'Písek', color: '#c4a46c' },
  D: { name: 'Vyprahlá zem', color: '#a7865a' },
  G: { name: 'Suchá tráva', color: '#8f8848' },
  R: { name: 'Štěrk', color: '#8d8478' },
  A: { name: 'Asfalt', color: '#5a5853' },
  C: { name: 'Beton', color: '#9c9a92' },
};
const ROAD_COLOR = '#7c6443';

const IsoMap = {
  cam: null, placing: null, imgs: {}, tab: 'build', decorFilter: 'all', brush: 'D', brushSize: 1, paintMode: true,

  // ---------- rozvržení pro herní logiku ----------
  init() {
    const T = ISO.T, pts = ISO_ROAD.map(([x, y]) => [(x + 0.5) * T, (y + 0.5) * T]);
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
    this.layout = { at, len, start: pts[0], base: [(ISO_HQ.gx + 1.5) * T, (ISO_HQ.gy + 1) * T], nearest, heroOff: 10 };

    this.road = new Set();
    for (let i = 0; i < ISO_ROAD.length - 1; i++) {
      let [x, y] = ISO_ROAD[i]; const [x2, y2] = ISO_ROAD[i + 1];
      while (true) {
        this.road.add(x + ',' + y);
        if (x === x2 && y === y2) break;
        x += Math.sign(x2 - x); y += Math.sign(y2 - y);
      }
    }
    this.roadEnd = ISO_ROAD[ISO_ROAD.length - 1].join(',');
    this.baseTiles = this.defaultTiles();
  },

  // Výchozí vyprahlá pustina: písek, skvrny popraskané země, chomáče suché trávy, štěrk a asfalt u velitelství.
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
    const n1 = noise(5, 4), n2 = noise(17, 3), n3 = noise(31, 2.5);
    for (let y = 0; y < G; y++) {
      const row = [];
      for (let x = 0; x < G; x++) {
        let t = 'S';
        if (n1(x, y) > 0.55) t = 'D';
        if (n2(x, y) > 0.68) t = 'G';
        if (n3(x, y) > 0.8 && r() < 0.7) t = 'R';
        if (x >= 7 && x <= 11 && y <= 3) t = 'A';           // asfaltová plocha u velitelství
        if (x >= 7 && x <= 11 && y === 0 && r() < 0.5) t = 'C';
        row.push(t);
      }
      tiles.push(row);
    }
    return tiles;
  },

  tileAt(gx, gy) {
    const kd = Game.kd(), p = kd.iso && kd.iso.paint && kd.iso.paint[gx + ',' + gy];
    return p || (this.baseTiles[gy] || [])[gx];
  },

  // ---------- stav ----------
  ensure(kd) {
    if (!this.layout) this.init();
    if (kd.iso && kd.iso.v === 2) return kd.iso;
    const old = kd.iso;
    const iso = { v: 2, placed: [{ id: 'hall', gx: ISO_HQ.gx, gy: ISO_HQ.gy }], decor: [], paint: {} };
    if (old) {
      // předchozí verze: ploty a pytle byly mezi budovami
      iso.placed = old.placed.filter(p => ISO_DEFS[p.id]);
      iso.decor = old.placed.filter(p => ISO_DECOR[p.id]).map(p => ({ id: p.id, gx: p.gx, gy: p.gy }));
    } else {
      // staré stavby z plochých míst vrátíme jako zlato
      kd.slots.forEach((id, i) => { if (id) { Store.state.gold += BUILDINGS[id].cost; kd.slots[i] = null; } });
      for (const id of ['tavern', 'forge', 'mine']) {
        if (kd.base[id] > 0) { const [gx, gy] = ISO_DEFS[id].home; iso.placed.push({ id, gx, gy }); }
      }
    }
    kd.iso = iso;
    this.scatterDecor(kd);
    return iso;
  },

  // Výchozí dekorace pustiny: suché stromy, keře, kameny, kosti, vraky, sudy...
  scatterDecor(kd) {
    const r = rng(2024), G = ISO.G;
    const want = [['deadtree', 16], ['bush', 18], ['tuft', 14], ['rock', 12], ['boulder', 5], ['cactus', 6], ['bones', 3], ['rubble', 5],
      ['barrel', 5], ['tires', 3], ['car', 3], ['scrap', 2], ['crates', 2]];
    for (const [id, n] of want) {
      for (let k = 0, tries = 0; k < n && tries < 400; tries++) {
        const gx = Math.floor(r() * G), gy = Math.floor(r() * G);
        const junk = ISO_DECOR[id].group === 'junk';
        if (this.nearRoad(gx, gy, junk ? 0 : 1) || (gx >= 6 && gx <= 12 && gy <= 4)) continue;
        if (!this.canPlace(kd, 'decor', id, gx, gy, null, false)) continue;
        kd.iso.decor.push({ id, gx, gy, flip: r() < 0.5 });
        k++;
      }
    }
    // výstražná cedule u vjezdu
    if (this.canPlace(kd, 'decor', 'sign', 1, 12, null, false)) kd.iso.decor.push({ id: 'sign', gx: 1, gy: 12 });
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
    const iso = this.ensure(kd);
    return [...iso.placed.map((o, index) => ({ kind: 'build', index, o })), ...iso.decor.map((o, index) => ({ kind: 'decor', index, o }))];
  },

  occupied(kd, skipObj) {
    const occ = new Map();
    for (const it of this.objects(kd)) {
      if (it.o === skipObj) continue;
      const [w, d] = this.size(it.kind, it.o.id, it.o.flip);
      for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) occ.set((it.o.gx + x) + ',' + (it.o.gy + y), it);
    }
    return occ;
  },

  canPlace(kd, kind, id, gx, gy, skipObj, flip) {
    const df = this.def(kind, id), [w, d] = this.size(kind, id, flip), occ = this.occupied(kd, skipObj);
    for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
      const cx = gx + x, cy = gy + y, k = cx + ',' + cy;
      if (cx < 0 || cy < 0 || cx >= ISO.G || cy >= ISO.G || occ.has(k)) return false;
      if (df.road ? (!this.road.has(k) || k === this.roadEnd) : this.road.has(k)) return false;
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

  defenders(kd, towers, barriers) {
    const T = ISO.T, L = this.layout;
    this.ensure(kd).placed.forEach((p, i) => {
      const b = BUILDINGS[p.id]; if (!b) return;
      const [w, d] = this.size('build', p.id, p.flip), x = (p.gx + w / 2) * T, y = (p.gy + d / 2) * T;
      if (b.type === 'tower') towers.push({ slot: i, id: p.id, b, x, y, cd: 0 });
      if (b.type === 'barrier') { const dd = L.nearest(x, y), [px, py] = L.at(dd); barriers.push({ slot: i, x: px, y: py, d: dd, hp: b.hp, max: b.hp }); }
    });
  },

  // ---------- stavění (jako v Cave Man RPG) ----------
  // Nová věc z menu se položí na volné místo nejblíž středu obrazovky; pak ji posuneš a potvrdíš.
  startNew(kind, id, cost) {
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
      const refund = isBase ? Math.round(BASE_BUILDINGS[p.id].baseCost * lv / 2) : Math.round(BUILDINGS[p.id].cost / 2);
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
      if (x < 0 || y < 0 || x >= ISO.G || y >= ISO.G || this.road.has(x + ',' + y)) continue; // cestu zombíků nepřemaluješ
      const k = x + ',' + y, base = this.baseTiles[y][x];
      if (this.brush === base) { if (kd.iso.paint[k]) { delete kd.iso.paint[k]; any = true; } }
      else if (kd.iso.paint[k] !== this.brush) { kd.iso.paint[k] = this.brush; any = true; }
    }
    if (any) { this.groundCanvas = null; this.paintDirty = true; }
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
      if (drag && drag.mode === 'paint' && this.paintDirty) { this.paintDirty = false; Store.changed(); }
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
    this.dpr = dpr; this.cw = w; this.ch = h;
    if (!this.cam) {
      const z = Math.min(1.2, w / (ISO.G * 2 * ISO.HW) * 1.9), [mx, my] = this.P(9.5, 8.5);
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
  ground() {
    if (this.groundCanvas) return this.groundCanvas;
    const G = ISO.G, pad = 40, s = 2;
    const W = G * 2 * ISO.HW + pad * 2, H = G * 2 * ISO.HH + pad * 2;
    const cv = document.createElement('canvas'); cv.width = W * s; cv.height = H * s;
    const c = cv.getContext('2d'); c.scale(s, s);
    const ox = G * ISO.HW + pad, oy = pad, r = rng(7);
    const diamond = (gx, gy, k = 1) => {
      const [x, y] = this.P(gx + 0.5, gy + 0.5), hw = ISO.HW * k, hh = ISO.HH * k;
      c.beginPath(); c.moveTo(ox + x, oy + y - hh); c.lineTo(ox + x + hw, oy + y); c.lineTo(ox + x, oy + y + hh); c.lineTo(ox + x - hw, oy + y); c.closePath();
    };
    const shade = (hex, v) => {
      const n = parseInt(hex.slice(1), 16), f = q => Math.max(0, Math.min(255, q + v));
      return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
    };
    // 1) základní dlaždice
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      c.fillStyle = shade(ISO_BRUSHES[this.tileAt(gx, gy)].color, Math.round(r() * 12 - 6)); diamond(gx, gy, 1.02); c.fill();
    }
    // 2) měkké okraje: každý povrch trochu přeteče do sousedů jako skvrny
    for (const letter of ['G', 'D', 'R', 'C', 'A']) {
      for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
        if (this.tileAt(gx, gy) !== letter) continue;
        for (let k = 0; k < 3; k++) {
          const [x, y] = this.P(gx + 0.5 + (r() - 0.5) * 0.6, gy + 0.5 + (r() - 0.5) * 0.6);
          c.fillStyle = shade(ISO_BRUSHES[letter].color, Math.round(r() * 10 - 5));
          c.beginPath(); c.ellipse(ox + x, oy + y, ISO.HW * (0.45 + r() * 0.25), ISO.HH * (0.45 + r() * 0.25), 0, 0, 7); c.fill();
        }
      }
    }
    // 3) prašná cesta (kudy chodí zombie)
    c.save();
    c.transform(ISO.HW, ISO.HH, -ISO.HW, ISO.HH, ox, oy);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const road = off => { c.beginPath(); ISO_ROAD.forEach(([x, y], i) => i ? c.lineTo(x + 0.5 + off, y + 0.5 + off) : c.moveTo(x + 0.5 + off, y + 0.5 + off)); };
    for (const [w, col] of [[1.9, 'rgba(80,62,38,.45)'], [1.55, '#715a3c'], [1.25, ROAD_COLOR], [0.7, '#8a7050']]) { road(0); c.strokeStyle = col; c.lineWidth = w; c.stroke(); }
    for (const off of [-0.25, 0.25]) { road(off); c.strokeStyle = 'rgba(55,40,24,.35)'; c.lineWidth = 0.12; c.stroke(); }
    c.restore();
    // 4) textura podle povrchu
    for (let i = 0; i < 12000; i++) {
      const fx = r() * G, fy = r() * G, gx = Math.floor(fx), gy = Math.floor(fy), [x, y] = this.P(fx, fy);
      const t = this.road.has(gx + ',' + gy) ? 'P' : this.tileAt(gx, gy), q = r();
      if (t === 'S') c.fillStyle = q < 0.5 ? 'rgba(235,210,160,.45)' : 'rgba(120,90,50,.35)';
      else if (t === 'D') c.fillStyle = q < 0.6 ? 'rgba(90,65,40,.45)' : 'rgba(210,180,130,.35)';
      else if (t === 'G') c.fillStyle = q < 0.5 ? 'rgba(70,72,30,.5)' : 'rgba(190,170,90,.45)';
      else if (t === 'R') c.fillStyle = q < 0.5 ? 'rgba(60,58,55,.6)' : 'rgba(190,185,175,.6)';
      else if (t === 'A') c.fillStyle = q < 0.5 ? 'rgba(40,40,38,.5)' : 'rgba(130,128,120,.4)';
      else if (t === 'C') c.fillStyle = q < 0.5 ? 'rgba(110,108,100,.4)' : 'rgba(200,198,190,.4)';
      else c.fillStyle = q < 0.5 ? 'rgba(60,45,28,.35)' : 'rgba(170,145,100,.3)';
      c.fillRect(ox + x, oy + y, t === 'R' ? 1.6 : 1 + r(), t === 'R' ? 1.4 : 1);
    }
    // 5) detaily: praskliny v suché zemi a asfaltu, chomáče trávy, kamínky
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      const t = this.road.has(gx + ',' + gy) ? 'P' : this.tileAt(gx, gy);
      const [x0, y0] = this.P(gx + 0.5, gy + 0.5), X = ox + x0, Y = oy + y0;
      if (t === 'D' || (t === 'A' && r() < 0.4)) {
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
      if (t === 'A' && r() < 0.15) { c.fillStyle = 'rgba(220,200,90,.5)'; c.fillRect(X - 8, Y - 1, 16, 1.5); }
      if ((t === 'S' || t === 'D') && r() < 0.3) { c.fillStyle = 'rgba(100,90,75,.8)'; c.beginPath(); c.ellipse(X + (r() - 0.5) * 30, Y + (r() - 0.5) * 12, 1.5, 1, 0, 0, 7); c.fill(); }
    }
    this.groundCanvas = { cv, ox, oy, W, H };
    return this.groundCanvas;
  },

  img(id) {
    if (!(id in this.imgs)) {
      const im = new Image(); this.imgs[id] = null;
      im.onload = () => { this.imgs[id] = im; if (this.B && !this.B.running) this.B.draw(); };
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

    // objekty seřazené podle hloubky
    const objs = [], pl = this.placing;
    for (const it of this.objects(kd)) {
      if (pl && pl.obj === it.o) continue;
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
    const dims = { ...df, w, d };
    c.save();
    let gx = o.gx, gy = o.gy;
    if (o.flip) { c.scale(-1, 1); gx = o.gy; gy = o.gx; }
    const im = this.img(o.id);
    if (im) {
      const C = this.P(gx + w, gy + d), B = this.P(gx + w, gy), D = this.P(gx, gy + d);
      const iw = B[0] - D[0], ih = im.height * iw / im.width;
      c.drawImage(im, D[0], C[1] - ih, iw, ih);
    } else this['draw_' + (kind === 'decor' ? o.id : df.style)](c, gx, gy, dims, o);
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
    const [x, y] = this.center(gx, gy, df);
    this.shadowBlob(c, x + 6, y, 12, 4);
    c.strokeStyle = '#4a3a2a'; c.lineCap = 'round';
    const branch = (x1, y1, a, len, w) => {
      if (len < 3) return;
      const x2 = x1 + Math.sin(a) * len, y2 = y1 - Math.cos(a) * len;
      c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      branch(x2, y2, a - 0.5, len * 0.62, w * 0.65); branch(x2, y2, a + 0.45, len * 0.58, w * 0.65);
    };
    branch(x, y, 0.05, 14, 3);
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
    const [x, y] = this.P(en.x / ISO.T, en.y / ISO.T), size = en.e.boss ? 30 : 16, bob = Math.sin(time * 8 + en.wob) * 1.5;
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
    c.font = '12px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(skin(h.def, 'apocalypse')[1], x, y - 9.5);
    Battle.bar(c, x, y - 24, h.hp / h.max, '#4ade80', 16);
  },
};
