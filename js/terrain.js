// ---------------------------------------------------------------------------
// Destructible terrain: a solid/empty bitmask plus a painted canvas
// ---------------------------------------------------------------------------

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

class Terrain {
  constructor(w, h, theme) {
    this.w = w;
    this.h = h;
    this.theme = theme;
    this.mask = new Uint8Array(w * h);
    this.cave = new Uint8Array(w * h);   // where caves were dug (drawn as a dark backdrop)
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.hard = new Uint8Array(w * h);   // indestructible pixels (city buildings and blocks)
    this.buildings = [];                 // city buildings, so they can collapse when undermined
    this.dirty = false;
    this.hardCanvas = null;
    this.generate();
    this.paint();
    if (theme.city) this.buildCity();
  }

  isSolid(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= this.w || y < 0) return false;
    if (y >= this.h) return true;
    return this.mask[y * this.w + x] === 1;
  }

  // Does a character-sized circle centred at (x, y) overlap solid ground?
  collides(x, y, r = CHAR_R) {
    const d = r * 0.7;
    return this.isSolid(x, y) ||
      this.isSolid(x, y + r) || this.isSolid(x, y - r) ||
      this.isSolid(x + r, y) || this.isSolid(x - r, y) ||
      this.isSolid(x + d, y + d) || this.isSolid(x - d, y + d) ||
      this.isSolid(x + d, y - d) || this.isSolid(x - d, y - d);
  }

  fillEllipse(cx, cy, rx, ry, value, flatTop = false) {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(this.h - 1, cy + ry); y++) {
      const dy = (y - cy) / ry;
      if (flatTop && dy < -0.35) continue;
      const span = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
      for (let x = Math.max(0, Math.floor(cx - span)); x <= Math.min(this.w - 1, cx + span); x++) {
        this.mask[y * this.w + x] = value;
        if (!value) this.cave[y * this.w + x] = 1;
      }
    }
  }

  generate() {
    const { w, h } = this;
    const gen = this.theme.gen || { amp: 1, rough: 1, caves: 1, islands: 1, channel: 0.5 };
    const waves = [
      { amp: rand(80, 130) * gen.amp, freq: rand(1.0, 2.2) },
      { amp: rand(35, 65) * gen.amp,  freq: rand(3, 5) },
      { amp: rand(15, 30) * gen.rough, freq: rand(7, 11) },
      { amp: rand(4, 9) * gen.rough,   freq: rand(20, 30) },
    ].map(wv => ({ ...wv, phase: rand(0, Math.PI * 2) }));
    const base = h - 400 + rand(-40, 30);
    const heights = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      let y = base;
      for (const wv of waves) y += wv.amp * Math.sin((x / 1600) * Math.PI * 2 * wv.freq + wv.phase);
      heights[x] = Math.max(140, y);
      this.heights = heights;
    }

    // Sometimes cut watery channels through the land
    const channels = (Math.random() < gen.channel ? 1 : 0) + (w > 2000 && Math.random() < gen.channel + 0.1 ? 1 : 0);
    for (let ch = 0; ch < channels; ch++) {
      const cx = rand(w * 0.2, w * 0.8);
      const half = rand(25, 45);
      for (let x = Math.floor(cx - half * 2); x < cx + half * 2; x++) {
        if (x < 0 || x >= w) continue;
        const t = Math.max(0, 1 - Math.abs(x - cx) / (half * 2));
        const s = t * t * (3 - 2 * t);
        heights[x] = heights[x] * (1 - s) + (WATER_Y + 30) * s;
      }
    }

    for (let x = 0; x < w; x++) {
      for (let y = Math.ceil(heights[x]); y < h; y++) this.mask[y * w + x] = 1;
    }

    // Caves
    const scale = w / 1600;
    const caves = Math.round(randInt(4, 8) * scale * gen.caves);
    for (let i = 0; i < caves; i++) {
      const cx = rand(60, w - 60);
      const cy = heights[Math.floor(cx)] + rand(70, 220);
      if (cy > WATER_Y - 40) continue;
      const rx = rand(30, 70), ry = rand(18, 34);
      for (let k = 0; k < 4; k++) {
        this.fillEllipse(cx + rand(-rx, rx) * 0.6, cy + rand(-ry, ry) * 0.4, rx * rand(0.5, 0.9), ry * rand(0.6, 1), 0);
      }
    }

    // Floating islands
    const islands = Math.round(randInt(1, 3) * scale * gen.islands);
    for (let i = 0; i < islands; i++) {
      const rx = rand(55, 110), ry = rand(16, 28);
      const cx = rand(rx + 20, w - rx - 20);
      let ground = Infinity;
      for (let x = Math.floor(cx - rx); x < cx + rx; x++) ground = Math.min(ground, heights[x]);
      const cy = Math.min(ground - 90, rand(h - 730, h - 570));
      if (cy < 120) continue;
      this.fillEllipse(cx, cy, rx, ry, 1, true);
      this.fillEllipse(cx + rand(-rx, rx) * 0.4, cy + ry * 0.3, rx * 0.55, ry * 1.1, 1, true);
    }
  }

  paint() {
    const { w, h, theme } = this;
    const img = this.ctx.createImageData(w, h);
    const d = img.data;
    for (let x = 0; x < w; x++) {
      let depth = 0;
      for (let y = 0; y < h; y++) {
        const i = y * w + x;
        if (!this.mask[i]) { depth = 0; continue; }
        depth++;
        const n = hash2(x, y);
        let c;
        if (depth <= 4) c = theme.grass;
        else if (depth <= 8) c = theme.grassDark;
        else {
          const t = Math.min(1, depth / 160);
          const stripe = 0.92 + 0.08 * Math.sin(y * 0.18 + Math.sin(x * 0.03) * 3);
          c = [0, 1, 2].map(k => (theme.dirt[k] * (1 - t) + theme.rock[k] * t) * stripe);
          if (n < 0.012) c = c.map(v => v * 1.35);
        }
        const shade = 0.9 + n * 0.12;
        d[i * 4] = Math.min(255, c[0] * shade);
        d[i * 4 + 1] = Math.min(255, c[1] * shade);
        d[i * 4 + 2] = Math.min(255, c[2] * shade);
        d[i * 4 + 3] = 255;
      }
    }
    this.ctx.putImageData(img, 0, 0);

    // Dark rock wall visible behind caves, so they read as tunnels
    this.backdrop = document.createElement('canvas');
    this.backdrop.width = w;
    this.backdrop.height = h;
    const bctx = this.backdrop.getContext('2d');
    const bimg = bctx.createImageData(w, h);
    const b = bimg.data;
    for (let i = 0; i < w * h; i++) {
      if (!this.cave[i]) continue;
      const shade = 0.4 + hash2(i % w, (i / w) | 0) * 0.06;
      b[i * 4] = theme.rock[0] * shade;
      b[i * 4 + 1] = theme.rock[1] * shade;
      b[i * 4 + 2] = theme.rock[2] * shade;
      b[i * 4 + 3] = 255;
    }
    bctx.putImageData(bimg, 0, 0);
  }

  isHard(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return false;
    return this.hard[y * this.w + x] === 1;
  }

  carve(cx, cy, r) {
    const r2 = r * r;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(this.h - 1, cy + r); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(this.w - 1, cx + r); x++) {
        const dx = x - cx, dy = y - cy, i = y * this.w + x;
        if (dx * dx + dy * dy <= r2 && !this.hard[i]) this.mask[i] = 0; // buildings can't be destroyed
      }
    }
    this.dirty = true;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000'; // fully opaque, or the hole is only partly erased
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.strokeStyle = this.theme.burn;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // City theme: indestructible concrete and steel buildings on top of normal (destructible) ground,
  // plus a few loose blocks and steel girders. They're drawn on their own layer so blasts can't erase them.
  buildCity() {
    const { w, h } = this, H = this.heights;
    this.hardCanvas = document.createElement('canvas');
    this.hardCanvas.width = w;
    this.hardCanvas.height = h;
    const ctx = this.hardCanvas.getContext('2d');
    const solidRect = (x0, y0, x1, y1) => {
      for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, y1); y++) {
        for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, x1); x++) { const i = y * w + x; this.mask[i] = 1; this.hard[i] = 1; }
      }
    };
    const concrete = (x0, y0, bw, bh) => {
      ctx.fillStyle = '#b9bdc4';
      ctx.fillRect(x0, y0, bw, bh);
      ctx.fillStyle = '#9ea3ab';
      ctx.fillRect(x0, y0, bw, 4);
      ctx.fillStyle = 'rgba(40,60,90,0.75)';                     // windows
      for (let y = y0 + 12; y < y0 + bh - 16; y += 18) for (let x = x0 + 8; x < x0 + bw - 10; x += 16) ctx.fillRect(x, y, 8, 10);
      ctx.strokeStyle = '#7d828a'; ctx.lineWidth = 2; ctx.strokeRect(x0 + 1, y0 + 1, bw - 2, bh - 2);
    };
    const steel = (x0, y0, bw, bh) => {
      ctx.fillStyle = '#5c6a79';
      ctx.fillRect(x0, y0, bw, bh);
      ctx.fillStyle = '#4a5664';
      for (let y = y0 + 14; y < y0 + bh; y += 22) ctx.fillRect(x0, y, bw, 4);   // girders
      ctx.fillStyle = '#8b97a5';
      for (let y = y0 + 6; y < y0 + bh; y += 22) for (let x = x0 + 5; x < x0 + bw - 3; x += 12) ctx.fillRect(x, y, 2, 2); // rivets
      ctx.fillStyle = 'rgba(255,220,120,0.55)';
      for (let y = y0 + 20; y < y0 + bh - 12; y += 22) for (let x = x0 + 10; x < x0 + bw - 12; x += 22) if ((x + y) % 3) ctx.fillRect(x, y - 4, 7, 6);
      ctx.strokeStyle = '#323b45'; ctx.lineWidth = 2; ctx.strokeRect(x0 + 1, y0 + 1, bw - 2, bh - 2);
    };
    // buildings along the surface
    for (let x = rand(40, 120); x < w - 80;) {
      const bw = rand(60, 150);
      const x0 = Math.floor(x), x1 = Math.floor(Math.min(w - 20, x + bw));
      let top = Infinity, low = -Infinity;
      for (let xi = x0; xi < x1; xi++) { top = Math.min(top, H[xi]); low = Math.max(low, H[xi]); }
      if (low < WATER_Y - 40 && x1 - x0 > 40) {
        const bh = rand(60, 210);
        const roof = Math.max(60, top - bh);
        solidRect(x0, roof, x1, low + 14);
        const kind = Math.random() < 0.5 ? 'concrete' : 'steel';
        (kind === 'concrete' ? concrete : steel)(x0, roof, x1 - x0, low + 14 - roof);
        this.buildings.push({ x0, x1, roof: Math.floor(roof), base: Math.ceil(low + 14), kind, support: 0 });
      }
      x += bw + rand(70, 220);
    }
    // loose concrete/steel blocks and floating girders
    const extras = Math.round(randInt(3, 6) * w / 1600);
    for (let i = 0; i < extras; i++) {
      const bx = rand(40, w - 100);
      if (Math.random() < 0.5) {                      // a girder in the air
        const gw = rand(70, 120), gy = H[Math.floor(bx)] - rand(110, 200);
        if (gy < 80) continue;
        solidRect(bx, gy, bx + gw, gy + 10);
        steel(bx, gy, gw, 10);
      } else {                                         // a block sitting on the ground
        const bw = rand(26, 44), bh = rand(18, 32), gy = H[Math.floor(bx + bw / 2)];
        if (gy > WATER_Y - 30) continue;
        solidRect(bx, gy - bh, bx + bw, gy + 6);
        (Math.random() < 0.5 ? concrete : steel)(bx, gy - bh, bw, bh + 6);
      }
    }
  }

  // How many columns under a building still have ground in the few rows below its foundation
  buildingSupport(b) {
    let n = 0;
    for (let x = b.x0; x < b.x1; x++) {
      for (let y = b.base; y < Math.min(this.h, b.base + 6); y++) if (this.mask[y * this.w + x]) { n++; break; }
    }
    return n;
  }

  // Buildings whose ground has been more than half dug away are removed and returned (to fall apart)
  checkCollapse() {
    this.dirty = false;
    const fallen = [];
    for (const b of this.buildings) {
      if (b.down) continue;
      if (!b.support) b.support = this.buildingSupport(b) || 1;
      if (this.buildingSupport(b) >= b.support * 0.5) continue;
      b.down = true;
      for (let y = Math.max(0, b.roof); y < Math.min(this.h, b.base); y++) {
        for (let x = b.x0; x < b.x1; x++) { const i = y * this.w + x; this.mask[i] = 0; this.hard[i] = 0; }
      }
      this.hardCanvas.getContext('2d').clearRect(b.x0, b.roof, b.x1 - b.x0, b.base - b.roof);
      this.ctx.clearRect(b.x0, b.roof, b.x1 - b.x0, b.base - b.roof);
      fallen.push(b);
    }
    return fallen;
  }

  // Leave a small (destructible) chunk of rubble on the map
  stampBlock(x0, y0, bw, bh, color) {
    x0 = Math.round(x0); y0 = Math.round(y0);
    for (let y = Math.max(0, y0); y < Math.min(this.h, y0 + bh); y++) {
      for (let x = Math.max(0, x0); x < Math.min(this.w, x0 + bw); x++) this.mask[y * this.w + x] = 1;
    }
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.fillRect(x0, y0, bw, bh);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x0, y0, bw, 1.5);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x0, y0 + bh - 1.5, bw, 1.5);
  }

  // All the spots in a column where a character can stand
  standSpots(x) {
    const spots = [];
    for (let y = CHAR_R + 2; y < WATER_Y - CHAR_R - 6; y++) {
      if (this.isSolid(x, y + CHAR_R + 1) && !this.collides(x, y)) spots.push(y);
    }
    return spots;
  }
}

// Sky, distant hills and sun painted once per match
function paintBackground(theme) {
  const c = document.createElement('canvas');
  c.width = WORLD_W;
  c.height = WORLD_H;
  const ctx = c.getContext('2d');
  // (the sky gradient and sun are painted in screen space by the game)

  if (theme.city) { // a far-off skyline instead of hills
    theme.hills.forEach((col, layer) => {
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.5 + layer * 0.2;
      for (let x = -20; x < WORLD_W; x += rand(30, 70)) {
        const bw = rand(28, 70), bh = rand(80, 260) - layer * 40;
        ctx.fillRect(x, WORLD_H - 420 + layer * 60 - bh, bw, bh + 400);
      }
    });
    ctx.globalAlpha = 1;
    return c;
  }
  theme.hills.forEach((col, layer) => {
    const base = WORLD_H - 495 + layer * 90;
    const ph1 = rand(0, 6), ph2 = rand(0, 6);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.55 + layer * 0.15;
    ctx.beginPath();
    ctx.moveTo(0, WORLD_H);
    for (let x = 0; x <= WORLD_W + 8; x += 8) {
      const y = base + Math.sin(x * 0.004 + ph1) * 60 + Math.sin(x * 0.011 + ph2) * 25;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(WORLD_W, WORLD_H);
    ctx.closePath();
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  return c;
}
