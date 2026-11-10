// Mapa pevnosti a obrana proti vlnám (canvas). Stejná mapa slouží pro stavění i boj.
'use strict';

const W = 360, H = 600;
const PATH = [[-30, 80], [280, 80], [280, 220], [80, 220], [80, 360], [280, 360], [280, 480], [180, 480], [180, 548]];
const SLOTS_POS = [[180, 140], [334, 150], [26, 150], [180, 290], [334, 290], [26, 300], [180, 420], [334, 420], [60, 470], [290, 556]];
const RALLY = [0.42, 0.56, 0.7, 0.8, 0.88, 0.94];
const BASE_POS = [180, 560];

const segs = []; let PATH_LEN = 0;
for (let i = 0; i < PATH.length - 1; i++) {
  const [x1, y1] = PATH[i], [x2, y2] = PATH[i + 1], l = Math.hypot(x2 - x1, y2 - y1);
  segs.push({ x1, y1, x2, y2, l, s: PATH_LEN }); PATH_LEN += l;
}
function pathAt(d) {
  d = Math.max(0, Math.min(PATH_LEN, d));
  for (const g of segs) if (d <= g.s + g.l) { const t = (d - g.s) / g.l; return [g.x1 + (g.x2 - g.x1) * t, g.y1 + (g.y2 - g.y1) * t]; }
  return PATH[PATH.length - 1];
}
function nearestPathDist(x, y) {
  let best = 0, bd = 1e9;
  for (let d = 0; d <= PATH_LEN; d += 4) { const [px, py] = pathAt(d), q = Math.hypot(px - x, py - y); if (q < bd) { bd = q; best = d; } }
  return best;
}

// Rozvržení mapy, se kterým pracuje herní logika (shora, ve „světových“ souřadnicích).
// Ledové království používá pevnou mapu níže, Pustina izometrickou mapu z iso.js.
const FLAT_LAYOUT = { at: pathAt, len: PATH_LEN, start: PATH[0], base: BASE_POS, nearest: nearestPathDist, heroOff: 16 };

// pseudo-náhoda se semínkem, aby dekorace byly vždy stejné
function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

const Battle = {
  canvas: null, ctx: null, mode: 'idle', running: false,
  onSlot: null, onEnd: null,

  init(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    canvas.addEventListener('pointerdown', e => this.tap(e));
    window.addEventListener('resize', () => this.resize());
    this.resize();
  },

  resize() {
    const c = this.canvas, r = c.parentElement.getBoundingClientRect();
    if (this.iso) { IsoMap.resize(this, r); return; }
    const scale = Math.min(r.width / W, r.height / H) || 1, dpr = window.devicePixelRatio || 1;
    c.style.width = W * scale + 'px'; c.style.height = H * scale + 'px';
    c.width = W * scale * dpr; c.height = H * scale * dpr;
    this.scale = scale * dpr; this.cssScale = scale;
    this.decor = null; this.draw();
  },

  get L() { return this.iso ? IsoMap.layout : FLAT_LAYOUT; },

  tap(e) {
    if (this.iso) return; // izometrická mapa má vlastní ovládání (posun, zoom)
    const r = this.canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / this.cssScale, y = (e.clientY - r.top) / this.cssScale;
    if (this.mode !== 'idle') return;
    SLOTS_POS.forEach(([sx, sy], i) => { if (Math.hypot(sx - x, sy - y) < 24 && this.onSlot) this.onSlot(i); });
  },

  show(kingdom) {
    this.kingdom = kingdom; this.mode = 'idle'; this.decor = null;
    this.iso = kingdom === 'apocalypse';
    if (this.iso) IsoMap.attach(this);
    this.resize();
    this.setupDefenders();
    this.enemies = []; this.shots = []; this.fx = [];
    if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(t => this.loop(t)); }
  },

  stop() { this.running = false; },

  setupDefenders() {
    const kd = Game.kd(), L = this.L;
    this.towers = []; this.barriers = [];
    if (this.iso) IsoMap.defenders(kd, this.towers, this.barriers);
    else kd.slots.forEach((id, i) => {
      if (!id) return;
      const b = BUILDINGS[id], [x, y] = SLOTS_POS[i];
      if (b.type === 'barrier') {
        const d = nearestPathDist(x, y), [px, py] = pathAt(d);
        this.barriers.push({ slot: i, x: px, y: py, d, hp: b.hp, max: b.hp });
      }
      this.towers.push({ slot: i, id, b, x, y, cd: 0 });
    });
    this.baseMax = 100 + kd.base.hall * 50; this.baseHp = this.baseMax;
    this.heroes = kd.deployed.filter(id => Store.state.heroes[id]).map((id, i) => {
      const st = Game.heroStats(id), def = HEROES.find(h => h.id === id);
      const [x, y] = L.at(L.len * RALLY[i % RALLY.length]);
      const off = i % 2 ? L.heroOff : -L.heroOff;
      return { id, def, st, hx: x + off, hy: y + off, x: x + off, y: y + off, hp: st.hp, max: st.hp, cd: 0, dead: false };
    });
  },

  // ---- vlny ----
  startWave(wave) {
    this.setupDefenders();
    this.mode = 'fight'; this.wave = wave; this.earned = 0;
    this.enemies = []; this.shots = []; this.fx = [];
    const queue = [], n = 6 + wave * 2, scale = 1 + (wave - 1) * 0.15;
    for (let i = 0; i < n; i++) {
      let t = 'grunt';
      if (wave >= 2 && i % 3 === 1) t = 'runner';
      if (wave >= 3 && i % 5 === 4) t = 'tank';
      queue.push({ t, delay: i * Math.max(0.45, 1.1 - wave * 0.03) });
    }
    if (wave % 5 === 0) queue.push({ t: 'boss', delay: n * 0.9 + 2 });
    this.queue = queue; this.clock = 0; this.hpScale = scale;
  },

  spawn(t) {
    const e = ENEMIES[t];
    const bossScale = e.boss ? 1 + (this.wave / 5 - 1) * 0.6 : 1;
    const hp = e.hp * this.hpScale * bossScale;
    this.enemies.push({ t, e, d: 0, hp, max: hp, slow: 0, cd: 0, x: this.L.start[0], y: this.L.start[1], wob: Math.random() * 6 });
  },

  update(dt) {
    if (this.mode !== 'fight') return;
    this.clock += dt;
    while (this.queue.length && this.queue[0].delay <= this.clock) this.spawn(this.queue.shift().t);

    // nepřátelé
    const L = this.L;
    for (const en of this.enemies) {
      en.cd -= dt; en.slow = Math.max(0, en.slow - dt);
      let blocked = null;
      for (const b of this.barriers) if (b.hp > 0 && b.d > en.d && b.d - en.d < 14) blocked = b;
      if (!blocked) for (const h of this.heroes)
        if (!h.dead && h.st.range <= 40 && Math.hypot(h.x - en.x, h.y - en.y) < 20) blocked = h;
      if (blocked) {
        if (en.cd <= 0) { blocked.hp -= en.e.dmg; en.cd = 1; this.fx.push({ x: blocked.x, y: blocked.y, txt: '💥', t: 0.4 }); }
        if (blocked.hp <= 0 && blocked.def) blocked.dead = true;
      } else {
        en.d += en.e.speed * (en.slow > 0 ? 0.5 : 1) * dt;
      }
      [en.x, en.y] = L.at(en.d);
      if (en.d >= L.len) { this.baseHp -= en.e.dmg; en.hp = 0; en.reached = true; this.fx.push({ x: L.base[0], y: L.base[1] - 20, txt: '-' + en.e.dmg, t: 0.8, c: '#ff4040' }); }
    }

    const target = (x, y, r) => {
      let best = null;
      for (const en of this.enemies) if (en.hp > 0 && Math.hypot(en.x - x, en.y - y) <= r && (!best || en.d > best.d)) best = en;
      return best;
    };

    // věže
    for (const t of this.towers) {
      if (t.b.type !== 'tower') continue;
      t.cd -= dt;
      const en = target(t.x, t.y, t.b.range);
      if (en && t.cd <= 0) { t.cd = t.b.rate; this.shoot(t.x, t.y - 14, en, t.b.dmg, t.b.splash, t.b.slow, t.id); }
    }

    // hrdinové
    for (const h of this.heroes) {
      if (h.dead) continue;
      h.cd -= dt;
      if (h.st.heal && h.cd <= 0) {
        const hurt = this.heroes.find(o => !o.dead && o.hp < o.max * 0.8);
        if (hurt) { hurt.hp = Math.min(hurt.max, hurt.hp + h.st.heal); this.fx.push({ x: hurt.x, y: hurt.y - 14, txt: '💚', t: 0.5 }); }
        else if (this.baseHp < this.baseMax) this.baseHp = Math.min(this.baseMax, this.baseHp + h.st.heal / 2);
      }
      const en = target(h.hx, h.hy, Math.max(h.st.range, 40) + 20);
      if (h.st.range <= 40) {
        // zblízka: dojdi k nepříteli, pak se vrať na stanoviště
        const tx = en ? en.x : h.hx, ty = en ? en.y : h.hy, dx = tx - h.x, dy = ty - h.y, l = Math.hypot(dx, dy);
        if (l > 14) { h.x += dx / l * 60 * dt; h.y += dy / l * 60 * dt; }
        if (en && l <= 22 && h.cd <= 0) { h.cd = h.st.rate; en.hp -= h.st.dmg; this.fx.push({ x: en.x, y: en.y - 10, txt: '⚔️', t: 0.25 }); }
      } else if (en && h.cd <= 0 && Math.hypot(en.x - h.x, en.y - h.y) <= h.st.range) {
        h.cd = h.st.rate; this.shoot(h.x, h.y - 10, en, h.st.dmg, h.st.splash, h.st.slow, 'hero');
      }
    }

    // střely
    for (const s of this.shots) {
      const dx = s.tg.x - s.x, dy = s.tg.y - s.y, l = Math.hypot(dx, dy), sp = 320 * dt;
      if (l < sp || s.tg.hp <= 0) {
        s.done = true;
        const hit = s.splash ? this.enemies.filter(e => Math.hypot(e.x - s.tg.x, e.y - s.tg.y) < s.splash) : [s.tg];
        for (const e of hit) { e.hp -= s.dmg; if (s.slow) e.slow = 1.5; }
        if (s.splash) this.fx.push({ x: s.tg.x, y: s.tg.y, ring: s.splash, t: 0.3 });
      } else { s.x += dx / l * sp; s.y += dy / l * sp; }
    }
    this.shots = this.shots.filter(s => !s.done);

    for (const en of this.enemies) if (en.hp <= 0 && !en.counted) {
      en.counted = true;
      if (!en.reached) { this.earned += en.e.gold; this.fx.push({ x: en.x, y: en.y, txt: '+' + en.e.gold + '💰', t: 0.7, c: '#ffd34d' }); }
    }
    this.enemies = this.enemies.filter(e => e.hp > 0);
    for (const f of this.fx) f.t -= dt;
    this.fx = this.fx.filter(f => f.t > 0);

    if (this.baseHp <= 0) this.finish(false);
    else if (!this.queue.length && !this.enemies.length) this.finish(true);
  },

  shoot(x, y, tg, dmg, splash, slow, kind) { this.shots.push({ x, y, tg, dmg, splash, slow, kind }); },

  finish(win) {
    this.mode = 'idle';
    const w = this.wave, earned = this.earned;
    this.enemies = []; this.shots = [];
    setTimeout(() => { this.setupDefenders(); this.onEnd && this.onEnd(win, w, earned); }, 400);
  },

  loop(t) {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - this.last) / 1000) * (this.speed || 1); this.last = t;
    this.update(dt); this.draw(t / 1000);
    requestAnimationFrame(tt => this.loop(tt));
  },

  // ---- kreslení ----
  buildDecor() {
    const K = this.kingdom, r = rng(K === 'fantasy' ? 7 : 13), items = [];
    const free = (x, y, m) => {
      for (let d = 0; d <= PATH_LEN; d += 10) { const [px, py] = pathAt(d); if (Math.hypot(px - x, py - y) < m) return false; }
      for (const [sx, sy] of SLOTS_POS) if (Math.hypot(sx - x, sy - y) < 30) return false;
      return Math.hypot(BASE_POS[0] - x, BASE_POS[1] - y) > 60;
    };
    for (let i = 0; i < 140; i++) {
      const x = r() * W, y = r() * H;
      if (!free(x, y, 30)) continue;
      const k = r();
      items.push({ x, y, k, s: 0.7 + r() * 0.6 });
    }
    items.sort((a, b) => a.y - b.y);
    this.decor = items;
  },

  draw(time = 0) {
    const c = this.ctx, K = this.kingdom; if (!K) return;
    if (this.iso) { IsoMap.draw(this, time); return; }
    const col = KINGDOMS[K].colors;
    if (!this.decor) this.buildDecor();
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    // podklad
    c.fillStyle = col.ground; c.fillRect(0, 0, W, H);
    const r = rng(3);
    for (let i = 0; i < 260; i++) {
      c.fillStyle = i % 2 ? col.ground2 : (K === 'fantasy' ? '#f4faff' : '#c4aa82');
      c.globalAlpha = 0.5; c.beginPath(); c.ellipse(r() * W, r() * H, 6 + r() * 18, 3 + r() * 6, 0, 0, 7); c.fill();
    }
    c.globalAlpha = 1;

    // cesta
    c.lineCap = 'round'; c.lineJoin = 'round';
    const strokePath = (w, s) => { c.strokeStyle = s; c.lineWidth = w; c.beginPath(); PATH.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); };
    strokePath(42, col.roadEdge); strokePath(34, col.road);
    if (K === 'apocalypse') { c.setLineDash([10, 12]); strokePath(2, '#d9c86a'); c.setLineDash([]); }
    else { c.setLineDash([2, 9]); strokePath(3, '#ffffff'); c.setLineDash([]); }

    // dekorace
    for (const d of this.decor) this.drawDecor(c, d, K);

    // hradby kolem základny
    this.drawBase(c, K);

    // stavební místa a stavby
    const kd = Game.kd();
    SLOTS_POS.forEach(([x, y], i) => {
      const id = kd.slots[i];
      if (!id) {
        if (this.mode !== 'idle') return;
        c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(x, y + 6, 20, 10, 0, 0, 7); c.fill();
        c.strokeStyle = K === 'fantasy' ? '#5b8cc4' : '#5f4a2d'; c.setLineDash([4, 3]); c.lineWidth = 2; c.stroke(); c.setLineDash([]);
        c.font = '16px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#fff'; c.fillText('＋', x, y + 5);
        return;
      }
      this.drawBuilding(c, id, x, y, K, time);
    });

    // bariéry na cestě
    for (const b of this.barriers || []) {
      if (b.hp <= 0) continue;
      c.font = '26px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(skin(BUILDINGS.barrier, K)[1], b.x, b.y);
      this.bar(c, b.x, b.y - 18, b.hp / b.max, '#7fd1ff');
    }

    // hrdinové
    for (const h of this.heroes || []) {
      if (h.dead) continue;
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(h.x, h.y + 10, 10, 4, 0, 0, 7); c.fill();
      c.fillStyle = K === 'fantasy' ? '#3b6fd8' : '#b06a2a'; c.beginPath(); c.arc(h.x, h.y, 13, 0, 7); c.fill();
      c.strokeStyle = '#ffd34d'; c.lineWidth = 2; c.stroke();
      c.font = '18px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(skin(h.def, K)[1], h.x, h.y + 1);
      this.bar(c, h.x, h.y - 19, h.hp / h.max, '#4ade80');
    }

    // nepřátelé
    for (const en of this.enemies || []) {
      const size = en.e.boss ? 42 : 22, bob = Math.sin(time * 8 + en.wob) * 2;
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(en.x, en.y + size / 2.4, size / 2.6, size / 7, 0, 0, 7); c.fill();
      if (en.slow > 0) { c.fillStyle = 'rgba(120,200,255,0.4)'; c.beginPath(); c.arc(en.x, en.y, size / 2, 0, 7); c.fill(); }
      c.font = size + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(K === 'fantasy' ? en.e.f : en.e.a, en.x, en.y + bob);
      this.bar(c, en.x, en.y - size / 2 - 6, en.hp / en.max, en.e.boss ? '#f43f5e' : '#ef4444', en.e.boss ? 40 : 20);
    }

    // střely
    for (const s of this.shots || []) {
      if (s.kind === 'mage') { c.fillStyle = K === 'fantasy' ? '#9be7ff' : '#c4f1ff'; c.beginPath(); c.arc(s.x, s.y, 4, 0, 7); c.fill(); }
      else if (s.kind === 'cannon') { c.fillStyle = '#333'; c.beginPath(); c.arc(s.x, s.y, 5, 0, 7); c.fill(); }
      else { c.fillStyle = K === 'fantasy' ? '#7a4a1f' : '#ffd34d'; c.fillRect(s.x - 2, s.y - 2, 4, 4); }
    }

    // efekty
    for (const f of this.fx) {
      c.globalAlpha = Math.min(1, f.t * 3);
      if (f.ring) { c.strokeStyle = '#ffae42'; c.lineWidth = 3; c.beginPath(); c.arc(f.x, f.y, f.ring * (1 - f.t / 0.3 * 0.5), 0, 7); c.stroke(); }
      else { c.font = 'bold 13px sans-serif'; c.fillStyle = f.c || '#fff'; c.textAlign = 'center'; c.fillText(f.txt, f.x, f.y - (0.8 - f.t) * 20); }
    }
    c.globalAlpha = 1;

    // sníh / prach
    if (K === 'fantasy') {
      c.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 40; i++) { const x = (i * 97 + time * 12 * (1 + i % 3)) % W, y = (i * 53 + time * 30 * (1 + i % 2)) % H; c.beginPath(); c.arc(x, y, 1.2 + (i % 3) * 0.6, 0, 7); c.fill(); }
    } else {
      c.fillStyle = 'rgba(230,200,150,0.35)';
      for (let i = 0; i < 25; i++) { const x = (i * 131 + time * 50 * (1 + i % 3)) % W, y = (i * 71 + Math.sin(time + i) * 8) % H; c.fillRect(x, y, 3, 1); }
    }
  },

  bar(c, x, y, p, color, w = 22) {
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
    c.fillStyle = color; c.fillRect(x - w / 2, y, w * Math.max(0, p), 3);
  },

  drawDecor(c, d, K) {
    const { x, y, k, s } = d;
    c.save(); c.translate(x, y); c.scale(s, s);
    if (K === 'fantasy') {
      if (k < 0.6) { // zasněžený smrk
        c.fillStyle = '#5b3a1e'; c.fillRect(-2, 4, 4, 8);
        for (let i = 0; i < 3; i++) {
          c.fillStyle = '#1f5a46'; c.beginPath(); c.moveTo(0, -18 + i * 7); c.lineTo(-11 + i * -2 + 2, 4 + i * 2 - 4); c.lineTo(11 + i * 2 - 2, 4 + i * 2 - 4); c.fill();
          c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(0, -18 + i * 7); c.lineTo(-5, -10 + i * 7); c.lineTo(5, -10 + i * 7); c.fill();
        }
      } else if (k < 0.85) { // domek s modrou střechou
        c.fillStyle = '#f2e4cf'; c.fillRect(-10, -6, 20, 14);
        c.fillStyle = '#3d6fb6'; c.beginPath(); c.moveTo(-13, -6); c.lineTo(0, -18); c.lineTo(13, -6); c.fill();
        c.fillStyle = '#fff'; c.fillRect(-13, -7, 26, 2);
        c.fillStyle = '#ffd36b'; c.fillRect(-6, -2, 4, 4); c.fillRect(3, -2, 4, 4);
      } else { // ledový krystal
        c.fillStyle = 'rgba(150,220,255,0.85)'; c.beginPath(); c.moveTo(0, -14); c.lineTo(5, 0); c.lineTo(0, 5); c.lineTo(-5, 0); c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke();
      }
    } else {
      if (k < 0.35) { // kameny
        c.fillStyle = '#6e6152'; c.beginPath(); c.ellipse(0, 0, 8, 5, 0, 0, 7); c.fill();
        c.fillStyle = '#857463'; c.beginPath(); c.ellipse(-2, -2, 4, 2, 0, 0, 7); c.fill();
      } else if (k < 0.55) { // suchá tráva
        c.strokeStyle = '#c9b06b'; c.lineWidth = 1;
        for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(0, 4); c.lineTo(i * 2, -6 + Math.abs(i)); c.stroke(); }
      } else if (k < 0.8) { // plechová bouda
        c.fillStyle = '#5f5a52'; c.fillRect(-12, -8, 24, 16);
        c.fillStyle = '#7a3e22'; c.beginPath(); c.moveTo(-14, -8); c.lineTo(0, -16); c.lineTo(14, -8); c.fill();
        c.strokeStyle = '#4a453f'; for (let i = -10; i < 12; i += 4) { c.beginPath(); c.moveTo(i, -8); c.lineTo(i, 8); c.stroke(); }
        c.fillStyle = '#2a2622'; c.fillRect(-3, 0, 6, 8);
      } else if (k < 0.9) { // rezavý barel
        c.fillStyle = '#8a4b22'; c.fillRect(-5, -8, 10, 14);
        c.fillStyle = '#5c2f14'; c.fillRect(-5, -4, 10, 2); c.fillRect(-5, 2, 10, 2);
      } else { // mrtvý strom
        c.strokeStyle = '#4b3a2a'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, 6); c.lineTo(0, -12); c.moveTo(0, -4); c.lineTo(-7, -10); c.moveTo(0, -8); c.lineTo(6, -14); c.stroke();
      }
    }
    c.restore();
  },

  drawBase(c, K) {
    const [x, y] = BASE_POS;
    if (K === 'fantasy') {
      // ledový palác
      c.fillStyle = '#bfe3ff'; c.fillRect(x - 40, y - 26, 80, 34);
      c.fillStyle = '#e8f6ff';
      [[-34, 22], [-12, 40], [12, 40], [34, 22]].forEach(([dx, h]) => {
        c.fillRect(x + dx - 7, y - 26 - h + 10, 14, h);
        c.fillStyle = '#4f88d6'; c.beginPath(); c.moveTo(x + dx - 9, y - 26 - h + 10); c.lineTo(x + dx, y - 26 - h - 8); c.lineTo(x + dx + 9, y - 26 - h + 10); c.fill();
        c.fillStyle = '#e8f6ff';
      });
      c.fillStyle = '#6fb2ff'; c.beginPath(); c.arc(x, y + 2, 9, Math.PI, 0); c.fill(); c.fillRect(x - 9, y + 2, 18, 6);
    } else {
      // bunkr s plotem a strážními věžemi
      c.strokeStyle = '#2f3a2f'; c.lineWidth = 2;
      c.strokeRect(x - 70, y - 40, 140, 52);
      c.setLineDash([2, 2]); c.strokeRect(x - 68, y - 38, 136, 48); c.setLineDash([]);
      c.fillStyle = '#c9c0b8'; c.fillRect(x - 36, y - 30, 72, 30);
      c.fillStyle = '#a99f96'; c.fillRect(x - 36, y - 34, 72, 6);
      c.fillStyle = '#2d5d8a'; [-24, -8, 8, 24].forEach(dx => { c.beginPath(); c.arc(x + dx, y - 18, 3.5, 0, 7); c.fill(); });
      c.fillStyle = '#4b3a2a'; c.fillRect(x - 6, y - 10, 12, 10);
      [[-70, -40], [70, -40], [-70, 12], [70, 12]].forEach(([dx, dy]) => {
        c.fillStyle = '#8f8a84'; c.fillRect(x + dx - 4, y + dy - 12, 8, 14);
        c.fillStyle = '#55524e'; c.fillRect(x + dx - 6, y + dy - 16, 12, 5);
      });
    }
    if (this.mode === 'fight') this.bar(c, x, y - 66, this.baseHp / this.baseMax, '#22c55e', 80);
  },

  drawBuilding(c, id, x, y, K, time) {
    const b = BUILDINGS[id], [, icon] = skin(b, K);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(x, y + 10, 20, 8, 0, 0, 7); c.fill();
    if (b.type === 'tower') {
      if (K === 'fantasy') {
        c.fillStyle = '#d9ecff'; c.fillRect(x - 13, y - 22, 26, 32);
        c.fillStyle = '#a9c9ec'; for (let i = -13; i < 13; i += 7) c.fillRect(x + i, y - 26, 4, 5);
        c.fillStyle = '#3d6fb6'; c.beginPath(); c.moveTo(x - 16, y - 26); c.lineTo(x, y - 46); c.lineTo(x + 16, y - 26); c.fill();
      } else {
        c.fillStyle = '#6f6a62'; c.fillRect(x - 12, y - 20, 24, 30);
        c.fillStyle = '#8a8178'; c.fillRect(x - 16, y - 26, 32, 7);
        c.strokeStyle = '#4b463f'; c.lineWidth = 1; c.strokeRect(x - 12, y - 20, 24, 30);
        c.fillStyle = '#b5a07a'; for (let i = -14; i < 14; i += 8) c.fillRect(x + i, y + 4, 7, 5); // pytle s pískem
      }
      c.font = '18px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(icon, x, y - (K === 'fantasy' ? 6 : 8));
      if (this.mode === 'idle') { c.strokeStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.arc(x, y, b.range, 0, 7); c.stroke(); }
    } else {
      c.font = '22px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.globalAlpha = 0.5; c.fillText(icon, x, y); c.globalAlpha = 1;
      if (this.mode === 'idle') { // ukaž, kam na cestu bariéra patří
        const bar = (this.barriers || []).find(q => q.slot === SLOTS_POS.findIndex(p => p[0] === x && p[1] === y));
        if (bar) { c.strokeStyle = 'rgba(255,255,255,0.5)'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x, y); c.lineTo(bar.x, bar.y); c.stroke(); c.setLineDash([]); }
      }
    }
  },
};
