// Izometrická základna pro Pustinu: stavění kamkoli na mřížku, posun a zoom mapy,
// nepřátelé jdou po prašné cestě až k velitelství.
// Vlastní grafiku budov stačí nahrát do img/buildings/<id>.png (viz README) – nahradí kreslené budovy.
'use strict';

const ISO = {
  T: 30,          // velikost políčka ve „světových“ jednotkách herní logiky
  G: 18,          // mapa G×G políček
  HW: 32, HH: 16, // polovina šířky/výšky dlaždice v pixelech (při zoomu 1)
};

// Cesta pro nepřátele (políčka). Začíná za západním okrajem mapy a končí před velitelstvím.
const ISO_ROAD = [[-3, 14], [5, 14], [5, 9], [10, 9], [10, 13], [14, 13], [14, 6], [9, 6], [9, 3]];
const ISO_HQ = { gx: 8, gy: 1 };

// Tvar budov na mapě: rozměr (w×d políček), výška a styl kreslení.
const ISO_DEFS = {
  hall:     { w: 3, d: 2, h: 30, style: 'bunker' },
  tavern:   { w: 3, d: 2, h: 22, style: 'barracks', home: [1, 5] },
  forge:    { w: 3, d: 2, h: 30, style: 'hangar', home: [12, 1] },
  mine:     { w: 2, d: 2, h: 10, style: 'yard', home: [15, 9] },
  archer:   { w: 1, d: 1, h: 12, style: 'nest' },
  mage:     { w: 1, d: 1, h: 40, style: 'tesla' },
  cannon:   { w: 1, d: 1, h: 12, style: 'mortar' },
  barrier:  { w: 1, d: 1, h: 12, style: 'barricade', road: true },
  fence:    { w: 1, d: 1, h: 16, style: 'fence' },
  sandbags: { w: 1, d: 1, h: 8, style: 'sandbags' },
};

const IsoMap = {
  cam: null, placing: null, selected: null, imgs: {},

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

    // políčka cesty
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

    // stromy (pevné rozmístění podle semínka)
    const r = rng(42); this.trees = [];
    for (let gy = 0; gy < ISO.G; gy++) for (let gx = 0; gx < ISO.G; gx++) {
      if (this.nearRoad(gx, gy, 1)) continue;
      const edge = Math.min(gx, gy, ISO.G - 1 - gx, ISO.G - 1 - gy);
      if (r() < (edge < 2 ? 0.55 : 0.12)) this.trees.push({ gx, gy, ox: (r() - 0.5) * 0.5, oy: (r() - 0.5) * 0.5, s: 0.8 + r() * 0.5, v: r() });
    }
  },

  nearRoad(gx, gy, m) {
    for (let dy = -m; dy <= m; dy++) for (let dx = -m; dx <= m; dx++) if (this.road.has((gx + dx) + ',' + (gy + dy))) return true;
    return false;
  },

  // ---------- stav (rozmístění budov) ----------
  ensure(kd) {
    if (kd.iso) return kd.iso;
    kd.iso = { placed: [{ id: 'hall', gx: ISO_HQ.gx, gy: ISO_HQ.gy }] };
    // staré stavby z plochých míst vrátíme jako zlato
    kd.slots.forEach((id, i) => { if (id) { Store.state.gold += BUILDINGS[id].cost; kd.slots[i] = null; } });
    for (const id of ['tavern', 'forge', 'mine']) {
      if (kd.base[id] > 0) { const [gx, gy] = ISO_DEFS[id].home; kd.iso.placed.push({ id, gx, gy }); }
    }
    return kd.iso;
  },

  occupied(kd, skip) {
    const occ = new Map();
    this.ensure(kd).placed.forEach((p, i) => {
      if (p === skip) return;
      const df = ISO_DEFS[p.id];
      for (let y = 0; y < df.d; y++) for (let x = 0; x < df.w; x++) occ.set((p.gx + x) + ',' + (p.gy + y), i);
    });
    return occ;
  },

  canPlace(kd, id, gx, gy, skip) {
    const df = ISO_DEFS[id], occ = this.occupied(kd, skip);
    for (let y = 0; y < df.d; y++) for (let x = 0; x < df.w; x++) {
      const cx = gx + x, cy = gy + y, k = cx + ',' + cy;
      if (cx < 0 || cy < 0 || cx >= ISO.G || cy >= ISO.G || occ.has(k)) return false;
      if (df.road ? (!this.road.has(k) || k === this.roadEnd) : this.road.has(k)) return false;
    }
    return true;
  },

  defenders(kd, towers, barriers) {
    const T = ISO.T, L = this.layout;
    this.ensure(kd).placed.forEach((p, i) => {
      const b = BUILDINGS[p.id]; if (!b) return;
      const df = ISO_DEFS[p.id], x = (p.gx + df.w / 2) * T, y = (p.gy + df.d / 2) * T;
      if (b.type === 'tower') towers.push({ slot: i, id: p.id, b, x, y, cd: 0 });
      if (b.type === 'barrier') { const d = L.nearest(x, y), [px, py] = L.at(d); barriers.push({ slot: i, x: px, y: py, d, hp: b.hp, max: b.hp }); }
    });
  },

  // ---------- kamera a ovládání ----------
  attach(B) {
    if (!this.layout) this.init();
    this.ensure(Game.kd());
    if (this.bound) return;
    this.bound = true;
    const c = B.canvas, ptrs = new Map();
    let drag = null, pinch = null;
    c.addEventListener('pointerdown', e => {
      if (!B.iso) return;
      c.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, ox: this.cam.ox, oy: this.cam.oy, moved: false };
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this.cam.z }; drag = null; }
    });
    c.addEventListener('pointermove', e => {
      if (!B.iso || !ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], r = c.getBoundingClientRect();
        this.zoomAt(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
      } else if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.hypot(dx, dy) > 6) drag.moved = true;
        if (drag.moved) { this.cam.ox = drag.ox + dx; this.cam.oy = drag.oy + dy; this.clampCam(); }
      }
    });
    const up = e => {
      if (!B.iso || !ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (drag && !drag.moved && ptrs.size === 0) {
        const r = c.getBoundingClientRect();
        this.tap(B, e.clientX - r.left, e.clientY - r.top);
      }
      if (ptrs.size === 0) drag = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', e => {
      if (!B.iso) return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.zoomAt(this.cam.z * (e.deltaY < 0 ? 1.12 : 0.89), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
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
    B.draw();
  },

  zoomAt(z, sx, sy) {
    z = Math.max(0.35, Math.min(1.8, z));
    const c = this.cam, ix = (sx - c.ox) / c.z, iy = (sy - c.oy) / c.z;
    c.z = z; c.ox = sx - ix * z; c.oy = sy - iy * z; this.clampCam();
  },

  clampCam() {
    // aspoň kus mapy musí zůstat vidět
    const c = this.cam, G = ISO.G, hw = G * ISO.HW * c.z, hh = 2 * G * ISO.HH * c.z;
    c.ox = Math.max(80 - hw, Math.min(this.cw - 80 + hw, c.ox));
    c.oy = Math.max(80 - hh, Math.min(this.ch - 80, c.oy));
  },

  P(gx, gy) { return [(gx - gy) * ISO.HW, (gx + gy) * ISO.HH]; },

  screenToTile(sx, sy) {
    const c = this.cam, ix = (sx - c.ox) / c.z, iy = (sy - c.oy) / c.z;
    return [Math.floor((ix / ISO.HW + iy / ISO.HH) / 2), Math.floor((iy / ISO.HH - ix / ISO.HW) / 2)];
  },

  tap(B, sx, sy) {
    const [gx, gy] = this.screenToTile(sx, sy), kd = Game.kd();
    if (this.placing) {
      const df = ISO_DEFS[this.placing.id];
      // klepnutí míří na střed budovy
      const px = gx - Math.floor((df.w - 1) / 2), py = gy - Math.floor((df.d - 1) / 2);
      this.placing.gx = px; this.placing.gy = py;
      this.placing.ok = this.canPlace(kd, this.placing.id, px, py, this.placing.move);
      UI.isoPlacingChanged();
      return;
    }
    if (B.mode !== 'idle') return;
    const i = this.occupied(kd).get(gx + ',' + gy);
    this.selected = i;
    if (i !== undefined) UI.isoBuildingMenu(i);
  },

  // ---------- kreslení ----------
  ground() {
    if (this.groundCanvas) return this.groundCanvas;
    const G = ISO.G, pad = 40, s = 2;
    const W = G * 2 * ISO.HW + pad * 2, H = G * 2 * ISO.HH + pad * 2;
    const cv = document.createElement('canvas'); cv.width = W * s; cv.height = H * s;
    const c = cv.getContext('2d'); c.scale(s, s);
    const ox = G * ISO.HW + pad, oy = pad, r = rng(7);
    const tile = (gx, gy, fill) => {
      const [x, y] = this.P(gx, gy);
      c.fillStyle = fill; c.beginPath();
      c.moveTo(ox + x, oy + y); c.lineTo(ox + x + ISO.HW, oy + y + ISO.HH); c.lineTo(ox + x, oy + y + 2 * ISO.HH); c.lineTo(ox + x - ISO.HW, oy + y + ISO.HH);
      c.closePath(); c.fill();
    };
    // tráva (olivová, jako na starých izometrických mapách)
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      const v = r() * 14 - 7;
      tile(gx, gy, `rgb(${98 + v},${100 + v},${52 + v / 2})`);
    }
    // prašná cesta: lomená čára kreslená přímo v izometrické rovině, se zaoblenými rohy
    c.save();
    c.transform(ISO.HW, ISO.HH, -ISO.HW, ISO.HH, ox, oy);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const road = () => { c.beginPath(); ISO_ROAD.forEach(([x, y], i) => i ? c.lineTo(x + 0.5, y + 0.5) : c.moveTo(x + 0.5, y + 0.5)); };
    for (const [w, col] of [[1.9, 'rgba(70,58,35,.55)'], [1.6, '#6a5639'], [1.3, '#7a6444'], [0.7, '#836c4a']]) {
      road(); c.strokeStyle = col; c.lineWidth = w; c.stroke();
    }
    // vyjeté koleje
    for (const off of [-0.25, 0.25]) {
      c.beginPath();
      ISO_ROAD.forEach(([x, y], i) => i ? c.lineTo(x + 0.5 + off, y + 0.5 + off) : c.moveTo(x + 0.5 + off, y + 0.5 + off));
      c.strokeStyle = 'rgba(60,46,28,.35)'; c.lineWidth = 0.12; c.stroke();
    }
    c.restore();
    // zrnitost trávy a cesty
    for (let i = 0; i < 9000; i++) {
      const gx = r() * G, gy = r() * G, [x, y] = this.P(gx, gy);
      const onRoad = this.road.has(Math.floor(gx) + ',' + Math.floor(gy));
      c.fillStyle = onRoad ? (r() < 0.5 ? 'rgba(60,45,28,.35)' : 'rgba(170,145,100,.3)')
        : (r() < 0.5 ? 'rgba(55,62,25,.45)' : r() < 0.7 ? 'rgba(150,140,70,.35)' : 'rgba(130,110,60,.4)');
      c.fillRect(ox + x, oy + y, 1 + r() * 1.5, 1);
    }
    // suchá tráva
    c.strokeStyle = 'rgba(170,150,80,.6)'; c.lineWidth = 0.7;
    for (let i = 0; i < 260; i++) {
      const gx = r() * G, gy = r() * G;
      if (this.road.has(Math.floor(gx) + ',' + Math.floor(gy))) continue;
      const [x, y] = this.P(gx, gy);
      for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(ox + x, oy + y); c.lineTo(ox + x + k * 1.2, oy + y - 4 + Math.abs(k)); c.stroke(); }
    }
    this.groundCanvas = { cv, ox, oy, W, H };
    return this.groundCanvas;
  },

  img(id) {
    if (!(id in this.imgs)) {
      const im = new Image(); this.imgs[id] = null;
      im.onload = () => { this.imgs[id] = im; };
      im.src = 'img/buildings/' + id + '.png';
    }
    return this.imgs[id];
  },

  draw(B, time) {
    const c = B.ctx, cam = this.cam, dpr = this.dpr, kd = Game.kd(), T = ISO.T;
    if (!cam) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = c.createRadialGradient(this.cw / 2, this.ch / 2, 50, this.cw / 2, this.ch / 2, Math.max(this.cw, this.ch));
    bg.addColorStop(0, '#3a3d2a'); bg.addColorStop(1, '#1a1c14');
    c.fillStyle = bg; c.fillRect(0, 0, this.cw, this.ch);
    c.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * cam.ox, dpr * cam.oy);

    const gr = this.ground();
    c.drawImage(gr.cv, -gr.ox, -gr.oy, gr.W, gr.H);

    // objekty seřazené podle hloubky
    const objs = [], placed = this.ensure(kd).placed, occ = this.occupied(kd);
    for (const t of this.trees) if (!occ.has(t.gx + ',' + t.gy)) objs.push({ z: t.gx + t.gy + 1, f: () => this.tree(c, t) });
    placed.forEach((p, i) => {
      if (this.placing && this.placing.move === p) return;
      const df = ISO_DEFS[p.id];
      const destroyed = p.id === 'barrier' && B.mode === 'fight' && (B.barriers.find(b => b.slot === i) || {}).hp <= 0;
      if (!destroyed) objs.push({ z: p.gx + p.gy + df.w + df.d - 1, f: () => this.building(c, p, df, kd, i === this.selected) });
    });
    for (const en of B.enemies || []) objs.push({ z: en.x / T + en.y / T, f: () => this.enemy(c, en, time) });
    for (const h of B.heroes || []) if (!h.dead) objs.push({ z: h.x / T + h.y / T, f: () => this.hero(c, h) });
    objs.sort((a, b) => a.z - b.z).forEach(o => o.f());

    // dosah vybrané věže
    const sel = placed[this.selected];
    if (sel && BUILDINGS[sel.id] && BUILDINGS[sel.id].range && B.mode === 'idle') {
      const df = ISO_DEFS[sel.id], [x, y] = this.P(sel.gx + df.w / 2, sel.gy + df.d / 2), rr = BUILDINGS[sel.id].range / T * Math.SQRT2;
      c.strokeStyle = 'rgba(230,210,120,.8)'; c.setLineDash([6, 4]); c.lineWidth = 1.5;
      c.beginPath(); c.ellipse(x, y, rr * ISO.HW / Math.SQRT2 * Math.SQRT2, rr * ISO.HH, 0, 0, 7); c.stroke(); c.setLineDash([]);
    }

    // stavění: náhled
    if (this.placing && this.placing.gx !== undefined) {
      const p = this.placing, df = ISO_DEFS[p.id];
      this.footprint(c, p.gx, p.gy, df.w, df.d, p.ok ? 'rgba(80,220,90,.45)' : 'rgba(230,60,50,.45)');
      c.globalAlpha = 0.7; this.building(c, p, df, kd, false); c.globalAlpha = 1;
    }

    // střely
    for (const s of B.shots || []) {
      const [x, y] = this.P(s.x / T, s.y / T);
      c.fillStyle = s.kind === 'mage' ? '#9fe8ff' : s.kind === 'cannon' ? '#222' : '#ffd34d';
      c.beginPath(); c.arc(x, y - 10, s.kind === 'cannon' ? 3 : 1.8, 0, 7); c.fill();
    }
    // efekty
    for (const f of B.fx || []) {
      const [x, y] = this.P(f.x / T, f.y / T);
      c.globalAlpha = Math.min(1, f.t * 3);
      if (f.ring) { c.strokeStyle = '#ffae42'; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y, f.ring / T * ISO.HW, f.ring / T * ISO.HH, 0, 0, 7); c.stroke(); }
      else { c.font = 'bold 11px sans-serif'; c.fillStyle = f.c || '#fff'; c.textAlign = 'center'; c.fillText(f.txt, x, y - 18 - (0.8 - f.t) * 16); }
    }
    c.globalAlpha = 1;
    // životy velitelství
    if (B.mode === 'fight') {
      const [x, y] = this.P(ISO_HQ.gx + 1.5, ISO_HQ.gy + 1);
      B.bar(c, x, y - 58, B.baseHp / B.baseMax, '#22c55e', 70);
    }
    // prach ve vzduchu
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = 'rgba(220,200,150,.18)';
    for (let i = 0; i < 30; i++) c.fillRect((i * 137 + time * 40 * (1 + i % 3)) % this.cw, (i * 89 + Math.sin(time + i) * 10 + this.ch) % this.ch, 2, 1);
  },

  footprint(c, gx, gy, w, d, fill) {
    const a = this.P(gx, gy), b = this.P(gx + w, gy), cc = this.P(gx + w, gy + d), dd = this.P(gx, gy + d);
    c.fillStyle = fill; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.lineTo(...cc); c.lineTo(...dd); c.closePath(); c.fill();
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

  building(c, p, df, kd, sel) {
    const { gx, gy } = p, im = this.img(p.id);
    if (im) {
      const C = this.P(gx + df.w, gy + df.d), B = this.P(gx + df.w, gy), D = this.P(gx, gy + df.d);
      const w = B[0] - D[0], h = im.height * w / im.width;
      c.drawImage(im, D[0], C[1] - h, w, h);
    } else this['draw_' + df.style](c, gx, gy, df, p);
    // úroveň budovy
    const lv = kd.base[p.id];
    if (lv !== undefined || sel) {
      const [x, y] = this.P(gx + df.w / 2, gy + df.d / 2);
      if (lv !== undefined) {
        c.fillStyle = 'rgba(15,17,12,.85)'; c.strokeStyle = '#a3ad6c'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(x - 13, y - df.h - 30, 26, 13, 3); c.fill(); c.stroke();
        c.fillStyle = '#e8e3c0'; c.font = 'bold 9px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('úr. ' + lv, x, y - df.h - 23.5);
      }
      if (sel) { c.strokeStyle = '#ffd34d'; c.lineWidth = 1.5; this.footprint(c, gx, gy, df.w, df.d, 'rgba(255,211,77,.15)');
        const a = this.P(gx, gy), b = this.P(gx + df.w, gy), cc = this.P(gx + df.w, gy + df.d), dd = this.P(gx, gy + df.d);
        c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.lineTo(...cc); c.lineTo(...dd); c.closePath(); c.stroke(); }
    }
  },

  // ---------- jednotlivé budovy (zástupná grafika) ----------
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
    const kd = Game.kd(), set = new Set(this.ensure(kd).placed.filter(q => q.id === 'fence').map(q => q.gx + ',' + q.gy));
    const [x, y] = this.P(gx + 0.5, gy + 0.5), h = df.h;
    const link = (nx, ny) => {
      if (!set.has(nx + ',' + ny) && !(this.placing && p === this.placing)) return;
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

  tree(c, t) {
    const [x, y] = this.P(t.gx + 0.5 + t.ox, t.gy + 0.5 + t.oy), s = t.s;
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(x + 8 * s, y + 1, 12 * s, 5 * s, 0, 0, 7); c.fill();
    c.strokeStyle = '#3d2e1e'; c.lineWidth = 2.2 * s; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 12 * s); c.stroke();
    const greens = t.v < 0.5 ? ['#2f4421', '#3e5a2a', '#557538'] : ['#34481f', '#4a6327', '#667f3a'];
    const blobs = [[0, -20, 10], [-7, -16, 7], [7, -16, 7], [-3, -26, 7], [4, -24, 6]];
    greens.forEach((g, k) => {
      c.fillStyle = g;
      for (const [bx, by, br] of blobs) { c.beginPath(); c.arc(x + (bx - k * 1.2) * s, y + (by - k * 1.5) * s, (br - k * 2.2) * s, 0, 7); c.fill(); }
    });
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
