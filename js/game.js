// ---------------------------------------------------------------------------
// Game: turn flow, physics, input, rendering
// ---------------------------------------------------------------------------

class Game {
  // settings = { players: [{name, cpu, team}], turnTime, health, difficulty, theme }
  // hooks    = { onGameOver(result), onWeaponsChanged(), onQuit() }
  constructor(canvas, settings, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.settings = settings;
    this.hooks = hooks || {};

    const themeKey = settings.theme === 'random' || !THEMES[settings.theme]
      ? Object.keys(THEMES)[randInt(0, Object.keys(THEMES).length - 1)]
      : settings.theme;
    this.theme = THEMES[themeKey];
    this.terrain = new Terrain(WORLD_W, WORLD_H, this.theme);
    this.background = paintBackground(this.theme);
    this.clouds = Array.from({ length: 7 }, () => ({ x: rand(0, WORLD_W), y: rand(30, 260), s: rand(0.6, 1.4) }));

    this.chars = [];
    this.projectiles = [];
    this.particles = [];
    this.effects = [];
    this.texts = [];
    this.teams = {};

    settings.players.forEach((p, i) => {
      const ch = new Character(i, p.name, p.team, p.cpu, settings.health);
      this.chars.push(ch);
      if (!this.teams[p.team]) {
        const ammo = {};
        WEAPONS.forEach(w => { ammo[w.id] = w.ammo; });
        this.teams[p.team] = { ...TEAMS[p.team], members: [], ammo, ptr: -1 };
      }
      this.teams[p.team].members.push(ch);
    });
    this.spawnCharacters();

    this.teamOrder = shuffle(Object.keys(this.teams).map(Number));
    this.teamPtr = -1;

    this.keys = {};
    this.mouse = { x: WORLD_W / 2, y: WORLD_H / 2, inside: false };
    this.tick = 0;
    this.paused = false;
    this.over = false;
    this.wind = 0;
    this.active = null;
    this.state = 'start';
    this.turnNumber = 0;

    this.bindInput();
    this.nextTurn();
  }

  // --- setup -------------------------------------------------------------

  spawnCharacters() {
    for (const c of this.chars) {
      let placed = false;
      for (let attempt = 0; attempt < 600 && !placed; attempt++) {
        const minGap = attempt < 400 ? 80 : 30;
        const x = rand(30, WORLD_W - 30);
        const spots = this.terrain.standSpots(x);
        if (!spots.length) continue;
        const y = spots[randInt(0, spots.length - 1)];
        if (this.chars.some(o => o !== c && o.placed && dist(o.x, o.y, x, y) < minGap)) continue;
        c.x = x; c.y = y; c.placed = true; placed = true;
      }
      if (!placed) { // extremely unlikely: drop from the sky
        c.x = rand(100, WORLD_W - 100); c.y = 20; c.placed = true; c.airborne = true;
      }
      c.facing = c.x < WORLD_W / 2 ? 1 : -1;
    }
  }

  get env() {
    return { terrain: this.terrain, wind: this.wind, chars: this.chars };
  }

  // --- turn flow ---------------------------------------------------------

  aliveTeams() {
    return Object.values(this.teams).filter(t => t.members.some(m => m.alive));
  }

  nextTurn() {
    const alive = this.aliveTeams();
    if (alive.length <= 1) return this.finish(alive[0] || null);

    // next team (round-robin) that still has someone alive, then its next living member
    let team;
    for (let i = 0; i < this.teamOrder.length; i++) {
      this.teamPtr = (this.teamPtr + 1) % this.teamOrder.length;
      team = this.teams[this.teamOrder[this.teamPtr]];
      if (team.members.some(m => m.alive)) break;
    }
    for (let i = 0; i < team.members.length; i++) {
      team.ptr = (team.ptr + 1) % team.members.length;
      if (team.members[team.ptr].alive) break;
    }

    this.active = team.members[team.ptr];
    this.turnNumber++;
    this.wind = clamp((Math.random() * 2 - 1) * (0.4 + Math.random() * 0.6), -1, 1);
    this.turnTimer = this.settings.turnTime;
    this.hasFired = false;
    this.retreating = false;
    this.charging = false;
    this.chargePower = 0;
    this.state = 'banner';
    this.bannerTimer = 80;
    this.ai = this.active.isCPU ? new AIController(this, this.active) : null;
    if (!(team.ammo[this.active.weapon] > 0)) this.active.weapon = 'bazooka';
    Sound.play('turn');
    this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
  }

  endTurn() {
    if (this.state !== 'turn') return;
    this.state = 'settle';
    this.charging = false;
    this.settleTimer = 0;
    this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
  }

  finish(team) {
    this.over = true;
    this.state = 'over';
    Sound.play('win');
    this.hooks.onGameOver && this.hooks.onGameOver({
      team,
      survivors: team ? team.members.filter(m => m.alive) : [],
      turns: this.turnNumber,
    });
  }

  isHumanTurn() {
    return this.state === 'turn' && this.active && !this.active.isCPU;
  }

  // --- actions -------------------------------------------------------------

  selectWeapon(id) {
    if (this.state !== 'turn' && this.state !== 'banner') return;
    if (this.hasFired || this.charging) return;
    const team = this.teams[this.active.team];
    if (!(team.ammo[id] > 0)) return;
    this.active.weapon = id;
    this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
  }

  walk(c, dir) {
    c.facing = dir;
    if (c.airborne || !this.terrain.collides(c.x, c.y + 1)) return;
    const nx = c.x + dir * WALK_SPEED;
    if (nx < 2 || nx > WORLD_W - 2) return;
    for (let dy = 0; dy >= -MAX_CLIMB; dy--) {
      if (!this.terrain.collides(nx, c.y + dy)) {
        c.x = nx;
        c.y += dy;
        for (let k = 0; k < MAX_CLIMB; k++) { // follow the slope down
          if (this.terrain.collides(c.x, c.y + 1)) break;
          c.y += 1;
        }
        return;
      }
    }
  }

  jump(c, back) {
    if (c.airborne || !this.terrain.collides(c.x, c.y + 1)) return;
    if (back) { c.vy = -6.2; c.vx = -c.facing * 0.9; } else { c.vy = -4.2; c.vx = c.facing * 2.4; }
    c.airborne = true;
    Sound.play('jump');
  }

  fire(power) {
    if (this.state !== 'turn' || this.hasFired) return;
    const c = this.active;
    const w = WEAPON[c.weapon];
    const team = this.teams[c.team];
    if (!(team.ammo[w.id] > 0)) return;
    if (w.kind === 'target') return; // needs fireAt

    this.charging = false;
    this.hasFired = true;
    team.ammo[w.id]--;

    if (w.kind === 'projectile') {
      this.projectiles.push(launchProjectile(w, c, Math.max(0.05, power)));
      Sound.play(w.bounce ? 'throw' : 'launch');
    } else if (w.kind === 'drop') {
      const p = launchProjectile(w, { ...c, aim: 0 }, 0);
      p.x = c.x; p.y = c.y; p.vx = 0; p.vy = 0;
      this.projectiles.push(p);
      Sound.play('throw');
    } else if (w.kind === 'hitscan') {
      const { dx, dy } = c.aimVector();
      const hit = traceRay(this.env, c.x, c.y, dx, dy, w.range, c.id);
      this.effects.push({ type: 'tracer', x1: c.x + dx * 12, y1: c.y + dy * 12, x2: hit.x, y2: hit.y, life: 12, max: 12 });
      Sound.play('shot');
      if (hit.hit) this.damageChar(hit.hit, w.damage, dx * 3, dy * 3 - 1.5, c.team);
      if (hit.solid || hit.hit) this.explode(hit.x, hit.y, w.radius, 0, c.team);
    } else if (w.kind === 'skip') {
      this.texts.push({ x: c.x, y: c.y - 40, text: 'Skipped', color: '#fff', life: 70 });
      this.endTurn();
    }
    this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
  }

  fireAt(x, y) {
    if (this.state !== 'turn' || this.hasFired) return;
    const c = this.active;
    const w = WEAPON[c.weapon];
    const team = this.teams[c.team];
    if (w.kind !== 'target' || !(team.ammo[w.id] > 0)) return;

    if (w.id === 'teleport') {
      if (y >= WATER_Y - CHAR_R * 2 || this.terrain.collides(x, y) || x < CHAR_R || x > WORLD_W - CHAR_R) {
        this.texts.push({ x, y: y - 20, text: "Can't teleport there", color: '#fff', life: 60 });
        return;
      }
      this.burst(c.x, c.y, '#b9f', 20);
      c.x = x; c.y = y; c.vx = 0; c.vy = 0; c.airborne = true;
      this.burst(x, y, '#b9f', 20);
      Sound.play('teleport');
    } else if (w.id === 'airstrike') {
      const dir = x >= c.x ? 1 : -1;
      for (let i = 0; i < w.missiles; i++) {
        this.projectiles.push({
          weapon: 'airstrike', x: x + (i - (w.missiles - 1) / 2) * 28 - dir * 140, y: -40 - i * 18,
          vx: dir * 2.2, vy: 5, wind: true, bounce: false, fuse: null,
          radius: w.radius, damage: w.damage, cluster: 0, ownerId: -1, ownerTeam: c.team, age: 0, spin: 0,
        });
      }
      Sound.play('launch');
    }
    team.ammo[w.id]--;
    this.hasFired = true;
    this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
  }

  // --- damage ----------------------------------------------------------------

  explode(x, y, radius, damage, ownerTeam) {
    this.terrain.carve(x, y, radius);
    const reach = radius + CHAR_R;
    if (damage > 0) {
      for (const c of this.chars) {
        if (!c.alive) continue;
        const d = dist(x, y, c.x, c.y);
        if (d >= reach) continue;
        if (c.team === ownerTeam) continue; // teammates (and yourself) are never hurt
        const f = 1 - d / reach;
        const force = f * damage * 0.09;
        const ang = d < 1 ? -Math.PI / 2 : Math.atan2(c.y - y, c.x - x);
        this.damageChar(c, Math.max(1, Math.round(damage * f)), Math.cos(ang) * force, Math.sin(ang) * force - force * 0.6, ownerTeam);
      }
    }
    // knock graves around for fun
    for (const c of this.chars) {
      if (!c.alive && c.grave && dist(x, y, c.x, c.y) < reach) { c.airborne = true; c.vy -= 2; }
    }
    this.effects.push({ type: 'blast', x, y, r: radius, life: 22, max: 22 });
    const n = Math.min(60, 10 + radius);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(1, 5) * (radius / 40);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: randInt(25, 60), max: 60,
        color: Math.random() < 0.5 ? this.theme.burn : (Math.random() < 0.5 ? '#ffb347' : '#ffe08a'),
        size: rand(2, 4), grav: 0.12,
      });
    }
    Sound.play('explosion', radius / 60);
  }

  damageChar(c, amount, kx, ky, ownerTeam) {
    if (!c.alive || c.team === ownerTeam) return;
    c.hp -= amount;
    c.vx += kx;
    c.vy += ky;
    c.airborne = true;
    this.texts.push({ x: c.x, y: c.y - 30, text: `-${amount}`, color: TEAMS[c.team].color, life: 80 });
    if (c.hp <= 0) this.kill(c, false);
  }

  kill(c, drowned) {
    if (!c.alive) return;
    c.alive = false;
    c.hp = 0;
    c.grave = !drowned;
    this.texts.push({ x: c.x, y: c.y - 46, text: drowned ? `${c.name} drowned!` : `${c.name} is out!`, color: '#fff', life: 110 });
    if (!drowned) this.burst(c.x, c.y, TEAMS[c.team].color, 25);
    if (c === this.active && this.state === 'turn') this.endTurn();
  }

  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(0.5, 3);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: randInt(20, 45), max: 45, color, size: rand(2, 3.5), grav: 0.03 });
    }
  }

  // --- simulation ------------------------------------------------------------

  updateChar(c) {
    if (!c.alive && !c.grave) return;
    const t = this.terrain;
    if (!c.airborne && !t.collides(c.x, c.y + 1)) c.airborne = true;
    if (c.airborne) {
      c.vy = Math.min(c.vy + GRAVITY, 12);
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(c.vx), Math.abs(c.vy)) / 2));
      for (let i = 0; i < steps; i++) {
        const nx = c.x + c.vx / steps;
        if (t.collides(nx, c.y)) {
          // try to slide up small bumps, otherwise bounce off the wall
          if (!t.collides(nx, c.y - 3)) { c.x = nx; c.y -= 3; } else c.vx = -c.vx * 0.3;
        } else c.x = nx;
        const ny = c.y + c.vy / steps;
        if (t.collides(c.x, ny)) {
          if (c.vy > 0) {
            c.vy = 0; c.vx = 0; c.airborne = false;
            break;
          }
          c.vy = 0;
        } else c.y = ny;
      }
    }
    if (c.y > WATER_Y + 6) {
      if (c.alive) {
        this.splash(c.x);
        this.kill(c, true);
      } else c.grave = false;
    }
    c.shownHp += (Math.max(0, c.hp) - c.shownHp) * 0.15;
  }

  splash(x) {
    Sound.play('splash');
    for (let i = 0; i < 25; i++) {
      this.particles.push({ x: x + rand(-8, 8), y: WATER_Y, vx: rand(-2, 2), vy: rand(-5, -1.5), life: randInt(20, 40), max: 40, color: this.theme.waterTop, size: rand(2, 4), grav: 0.2 });
    }
  }

  updateProjectiles() {
    const env = this.env;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const r = stepProjectile(p, env);
      if (p.age % 2 === 0 && !p.bounce) {
        this.particles.push({ x: p.x, y: p.y, vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), life: 30, max: 30, color: 'rgba(230,230,230,0.6)', size: 3, grav: -0.01 });
      }
      if (!r) continue;
      this.projectiles.splice(i, 1);
      if (r === 'water') { this.splash(p.x); continue; }
      if (r === 'lost') continue;
      this.explode(p.x, p.y, p.radius, p.damage, p.ownerTeam);
      for (let k = 0; k < p.cluster; k++) {
        this.projectiles.push({
          weapon: 'bomblet', x: p.x, y: p.y - 4, vx: rand(-3, 3), vy: rand(-6, -3), wind: false, bounce: false,
          fuse: null, radius: 22, damage: 20, cluster: 0, ownerId: -1, ownerTeam: p.ownerTeam, age: 20, spin: 0,
        });
      }
    }
  }

  worldIsCalm() {
    return this.projectiles.length === 0 && this.chars.every(c => !(c.alive || c.grave) || !c.airborne);
  }

  update() {
    this.tick++;
    for (const c of this.chars) this.updateChar(c);
    this.updateProjectiles();

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.grav;
      if (--p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.effects.length - 1; i >= 0; i--) if (--this.effects[i].life <= 0) this.effects.splice(i, 1);
    for (let i = this.texts.length - 1; i >= 0; i--) {
      this.texts[i].y -= 0.4;
      if (--this.texts[i].life <= 0) this.texts.splice(i, 1);
    }
    for (const cl of this.clouds) {
      cl.x += this.wind * 0.4 * cl.s + 0.05;
      if (cl.x > WORLD_W + 120) cl.x = -120;
      if (cl.x < -120) cl.x = WORLD_W + 120;
    }

    switch (this.state) {
      case 'banner':
        if (--this.bannerTimer <= 0) this.state = 'turn';
        break;

      case 'turn': {
        const c = this.active;
        if (!c.alive) { this.endTurn(); break; }
        if (this.ai) this.ai.update();
        else this.handleHeldKeys();

        const waiting = this.hasFired && this.projectiles.length > 0;
        if (this.hasFired && !waiting && !this.retreating) {
          this.retreating = true;
          this.turnTimer = Math.min(this.turnTimer, RETREAT_TIME);
          if (WEAPON[c.weapon].id === 'teleport') this.turnTimer = Math.min(this.turnTimer, 1);
        }
        if (!waiting) {
          const before = Math.ceil(this.turnTimer);
          this.turnTimer -= 1 / TICK_RATE;
          const after = Math.ceil(this.turnTimer);
          if (after !== before && after <= 5 && after > 0 && !this.retreating) Sound.play('tick');
        }
        if (this.turnTimer <= 0) this.endTurn();
        break;
      }

      case 'settle':
        this.settleTimer++;
        if ((this.worldIsCalm() && this.settleTimer > 40) || this.settleTimer > 60 * 12) {
          this.projectiles.length = 0;
          this.nextTurn();
        }
        break;
    }
  }

  // --- input -------------------------------------------------------------------

  handleHeldKeys() {
    const c = this.active;
    const k = this.keys;
    const left = k.ArrowLeft || k.KeyA, right = k.ArrowRight || k.KeyD;
    if (!this.charging) {
      if (left && !right) this.walk(c, -1);
      else if (right && !left) this.walk(c, 1);
    }
    if (k.ArrowUp || k.KeyW) c.aim = Math.min(85, c.aim + 1.2);
    if (k.ArrowDown || k.KeyS) c.aim = Math.max(-85, c.aim - 1.2);
    if (this.charging) {
      this.chargePower += 1 / CHARGE_TICKS;
      if (this.chargePower >= 1) this.fire(1);
    }
  }

  bindInput() {
    this._onKeyDown = e => this.onKeyDown(e);
    this._onKeyUp = e => this.onKeyUp(e);
    this._onMouseMove = e => {
      const p = this.toWorld(e);
      this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.inside = true;
    };
    this._onMouseLeave = () => { this.mouse.inside = false; };
    this._onClick = e => {
      Sound.init();
      if (!this.isHumanTurn() || this.paused) return;
      const p = this.toWorld(e);
      if (WEAPON[this.active.weapon].kind === 'target') this.fireAt(p.x, p.y);
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mouseleave', this._onMouseLeave);
    this.canvas.addEventListener('click', this._onClick);
  }

  toWorld(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * WORLD_W, y: (e.clientY - r.top) / r.height * WORLD_H };
  }

  onKeyDown(e) {
    Sound.init();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (!this.over) this.setPaused(!this.paused);
      return;
    }
    if (e.code === 'KeyM') { Sound.muted = !Sound.muted; return; }
    if (this.paused || e.repeat) { this.keys[e.code] = true; return; }
    this.keys[e.code] = true;
    if (!this.isHumanTurn() && !(this.state === 'banner' && !this.active.isCPU)) return;

    const c = this.active;
    const digit = e.code.startsWith('Digit') ? e.code.slice(5) : null;
    if (digit) {
      const w = WEAPONS.find(x => x.key === digit);
      if (w) this.selectWeapon(w.id);
      return;
    }
    if (e.code === 'Tab') {
      const team = this.teams[c.team];
      const avail = WEAPONS.filter(w => team.ammo[w.id] > 0);
      const idx = avail.findIndex(w => w.id === c.weapon);
      this.selectWeapon(avail[(idx + (e.shiftKey ? -1 : 1) + avail.length) % avail.length].id);
      return;
    }
    if (this.state !== 'turn') return;
    if (e.code === 'Enter') this.jump(c, false);
    if (e.code === 'Backspace') this.jump(c, true);
    if (e.code === 'Space' && !this.hasFired) {
      const w = WEAPON[c.weapon];
      if (w.charge) { this.charging = true; this.chargePower = 0; }
      else if (w.kind === 'target') {
        if (this.mouse.inside) this.fireAt(this.mouse.x, this.mouse.y);
      } else this.fire(1);
    }
  }

  onKeyUp(e) {
    this.keys[e.code] = false;
    if (e.code === 'Space' && this.charging && this.isHumanTurn() && !this.paused) this.fire(this.chargePower);
  }

  setPaused(p) {
    this.paused = p;
    this.charging = false;
    this.keys = {};
    this.hooks.onPause && this.hooks.onPause(p);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    this.canvas.removeEventListener('click', this._onClick);
  }

  // --- main loop -------------------------------------------------------------

  start() {
    const stepMs = 1000 / TICK_RATE;
    let last = performance.now();
    let acc = 0;
    const loop = now => {
      if (this.destroyed) return;
      acc += Math.min(250, now - last);
      last = now;
      while (acc >= stepMs) {
        if (!this.paused && !this.over) this.update();
        acc -= stepMs;
      }
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // --- rendering ---------------------------------------------------------------

  render() {
    const ctx = this.ctx;
    ctx.drawImage(this.background, 0, 0);
    this.drawClouds(ctx);
    ctx.drawImage(this.terrain.backdrop, 0, 0);
    ctx.drawImage(this.terrain.canvas, 0, 0);

    for (const c of this.chars) if (!c.alive && c.grave) this.drawGrave(ctx, c);
    for (const p of this.projectiles) this.drawProjectile(ctx, p);
    for (const c of this.chars) if (c.alive) this.drawChar(ctx, c);
    if (this.state === 'turn' && this.active.alive && !this.hasFired) this.drawAim(ctx, this.active);

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const e of this.effects) this.drawEffect(ctx, e);

    this.drawWater(ctx);
    this.drawLabels(ctx);
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life / 30);
      this.outlinedText(ctx, t.text, t.x, t.y, 'bold 16px system-ui, sans-serif', t.color);
    }
    ctx.globalAlpha = 1;
    this.drawTargetCursor(ctx);
    this.drawHUD(ctx);
    if (this.state === 'banner') this.drawBanner(ctx);
  }

  drawClouds(ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (const c of this.clouds) {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 50 * c.s, 16 * c.s, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + 26 * c.s, c.y - 10 * c.s, 30 * c.s, 16 * c.s, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x - 24 * c.s, c.y - 6 * c.s, 24 * c.s, 12 * c.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawWater(ctx) {
    const t = this.tick * 0.05;
    ctx.fillStyle = this.theme.water;
    ctx.beginPath();
    ctx.moveTo(0, WORLD_H);
    for (let x = 0; x <= WORLD_W; x += 10) ctx.lineTo(x, WATER_Y + Math.sin(x * 0.03 + t) * 3 + Math.sin(x * 0.011 - t * 0.7) * 2);
    ctx.lineTo(WORLD_W, WORLD_H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = this.theme.waterTop;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= WORLD_W; x += 10) {
      const y = WATER_Y + Math.sin(x * 0.03 + t) * 3 + Math.sin(x * 0.011 - t * 0.7) * 2;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawChar(ctx, c) {
    const team = TEAMS[c.team];
    const bob = !c.airborne && c === this.active && this.state === 'turn' ? Math.sin(this.tick * 0.15) * 0.6 : 0;
    ctx.save();
    ctx.translate(c.x, c.y + bob);
    // feet
    ctx.fillStyle = team.dark;
    ctx.beginPath();
    ctx.ellipse(-5, CHAR_R - 1, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.ellipse(5, CHAR_R - 1, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.fillStyle = team.color;
    ctx.strokeStyle = team.dark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, CHAR_R, CHAR_R * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // belly
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(c.facing * 2, 4, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // eyes
    const blinking = (this.tick + c.blink) % 220 < 6;
    const { dx, dy } = c.aimVector();
    for (const ex of [-3.5, 3.5]) {
      const x = ex + c.facing * 2.5;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(x, -3, 3, blinking ? 0.6 : 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!blinking) {
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(x + dx * 1.4, -3 + dy * 1.6, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawGrave(ctx, c) {
    ctx.save();
    ctx.translate(c.x, c.y + 2);
    ctx.fillStyle = '#8a8f98';
    ctx.strokeStyle = '#4b4f57';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-7, CHAR_R - 2);
    ctx.lineTo(-7, -4);
    ctx.arc(0, -4, 7, Math.PI, 0);
    ctx.lineTo(7, CHAR_R - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = TEAMS[c.team].color;
    ctx.fillRect(-1, -7, 2, 9);
    ctx.fillRect(-4, -4, 8, 2);
    ctx.restore();
  }

  drawLabels(ctx) {
    for (const c of this.chars) {
      if (!c.alive) continue;
      const team = TEAMS[c.team];
      const y = c.y - CHAR_R - 10;
      this.outlinedText(ctx, String(Math.max(0, Math.round(c.shownHp))), c.x, y, 'bold 13px system-ui, sans-serif', team.color);
      this.outlinedText(ctx, c.name + (c.isCPU ? ' 🤖' : ''), c.x, y - 15, '12px system-ui, sans-serif', team.color);
      if (c === this.active && (this.state === 'turn' || this.state === 'banner')) {
        const by = y - 36 + Math.sin(this.tick * 0.12) * 4;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c.x - 7, by - 8);
        ctx.lineTo(c.x + 7, by - 8);
        ctx.lineTo(c.x, by);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
      }
    }
  }

  drawAim(ctx, c) {
    const w = WEAPON[c.weapon];
    if (w.kind === 'target' || w.kind === 'skip' || w.kind === 'drop') return;
    const { dx, dy } = c.aimVector();
    const cx = c.x + dx * 48, cy = c.y + dy * 48;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.moveTo(cx - 10, cy); ctx.lineTo(cx - 3, cy);
    ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy - 3);
    ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 10);
    ctx.stroke();
    ctx.fillStyle = TEAMS[c.team].color;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    if (this.charging) {
      const len = 16 + this.chargePower * 70;
      const steps = 14;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        if (t * 86 > len) break;
        const hue = 60 - t * 60;
        ctx.fillStyle = `hsl(${hue},100%,55%)`;
        ctx.beginPath();
        ctx.arc(c.x + dx * (16 + t * 70), c.y + dy * (16 + t * 70), 2 + t * 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawProjectile(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    switch (p.weapon) {
      case 'bazooka':
      case 'airstrike':
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillStyle = '#556';
        ctx.fillRect(-8, -3, 14, 6);
        ctx.fillStyle = '#e33';
        ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(11, 0); ctx.lineTo(6, 3); ctx.fill();
        ctx.fillStyle = '#fa0';
        ctx.fillRect(-11, -2, 3, 4);
        break;
      case 'grenade':
      case 'cluster':
        ctx.rotate(p.spin);
        ctx.fillStyle = p.weapon === 'grenade' ? '#2f5d2f' : '#7a2d6b';
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#999'; ctx.fillRect(-1.5, -8, 3, 4);
        break;
      case 'dynamite':
        ctx.fillStyle = '#c22';
        ctx.fillRect(-4, -8, 8, 14);
        ctx.strokeStyle = '#444'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.quadraticCurveTo(4, -12, 2, -15); ctx.stroke();
        if (this.tick % 6 < 3) { ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(2, -15, 2.5, 0, Math.PI * 2); ctx.fill(); }
        break;
      default:
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (p.fuse != null) {
      this.outlinedText(ctx, String(Math.ceil(p.fuse / TICK_RATE)), p.x, p.y - 16, 'bold 12px system-ui, sans-serif', '#fff');
    }
  }

  drawEffect(ctx, e) {
    const t = 1 - e.life / e.max;
    if (e.type === 'blast') {
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.4 + t * 0.9), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff9d2e';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.6 + t * 0.8), 0, Math.PI * 2); ctx.stroke();
    } else if (e.type === 'tracer') {
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#fff6a0';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawTargetCursor(ctx) {
    if (!this.isHumanTurn() || this.hasFired || !this.mouse.inside) return;
    const w = WEAPON[this.active.weapon];
    if (w.kind !== 'target') return;
    const { x, y } = this.mouse;
    const ok = w.id !== 'teleport' || (!this.terrain.collides(x, y) && y < WATER_Y - CHAR_R * 2);
    ctx.strokeStyle = ok ? '#fff' : '#f55';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 14 + Math.sin(this.tick * 0.2) * 2, 0, Math.PI * 2);
    ctx.moveTo(x - 20, y); ctx.lineTo(x + 20, y);
    ctx.moveTo(x, y - 20); ctx.lineTo(x, y + 20);
    ctx.stroke();
  }

  outlinedText(ctx, text, x, y, font, color) {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  drawHUD(ctx) {
    const c = this.active;
    // Timer + active player (top centre)
    ctx.fillStyle = 'rgba(15,18,28,0.72)';
    this.roundRect(ctx, WORLD_W / 2 - 150, 12, 300, 64, 14);
    ctx.fill();
    if (c) {
      const team = TEAMS[c.team];
      const secs = Math.max(0, Math.ceil(this.turnTimer));
      const urgent = secs <= 5 && this.state === 'turn' && !this.retreating;
      this.outlinedText(ctx, String(secs), WORLD_W / 2 - 108, 44, 'bold 34px system-ui, sans-serif', urgent ? '#ff5a5a' : '#fff');
      this.outlinedText(ctx, c.name, WORLD_W / 2 + 22, 34, 'bold 20px system-ui, sans-serif', team.color);
      let sub = this.retreating ? 'Retreat!' : this.hasFired ? 'Fired' : WEAPON[c.weapon].name;
      if (this.state === 'settle') sub = 'Waiting…';
      if (c.isCPU && this.state === 'turn' && !this.hasFired) sub = 'CPU thinking…';
      this.outlinedText(ctx, sub, WORLD_W / 2 + 22, 58, '14px system-ui, sans-serif', '#dfe6f3');
    }

    // Wind (top right)
    const wx = WORLD_W - 230, wy = 18;
    ctx.fillStyle = 'rgba(15,18,28,0.72)';
    this.roundRect(ctx, wx, wy, 212, 46, 12);
    ctx.fill();
    this.outlinedText(ctx, 'WIND', wx + 30, wy + 23, 'bold 13px system-ui, sans-serif', '#dfe6f3');
    const bx = wx + 60, bw = 140, mid = bx + bw / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(bx, wy + 17, bw, 12);
    const len = this.wind * bw / 2;
    ctx.fillStyle = this.wind >= 0 ? '#4fc3f7' : '#ff8a65';
    ctx.fillRect(Math.min(mid, mid + len), wy + 17, Math.abs(len), 12);
    ctx.fillStyle = '#fff';
    ctx.fillRect(mid - 1, wy + 14, 2, 18);

    // Team health (bottom left)
    const teams = Object.values(this.teams);
    const maxTotal = Math.max(...teams.map(t => t.members.length * this.settings.health));
    const th = 22 * teams.length + 14;
    const tx = 16, ty = WORLD_H - th - 14;
    ctx.fillStyle = 'rgba(15,18,28,0.72)';
    this.roundRect(ctx, tx, ty, 300, th, 12);
    ctx.fill();
    teams.forEach((t, i) => {
      const total = t.members.reduce((s, m) => s + Math.max(0, m.alive ? m.shownHp : 0), 0);
      const y = ty + 10 + i * 22;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = t.color;
      ctx.fillText(t.name, tx + 12, y + 8);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(tx + 120, y + 2, 166, 12);
      ctx.fillStyle = t.color;
      ctx.fillRect(tx + 120, y + 2, 166 * total / maxTotal, 12);
    });

    // Controls hint (bottom right) for human players
    if (this.isHumanTurn()) {
      const lines = ['←/→ walk   ↑/↓ aim   Enter jump   Backspace backflip',
        'Space: hold to charge & release to fire   1-8 / Tab: weapon',
        'Air Strike / Teleport: click the map   Esc: pause   M: mute'];
      ctx.fillStyle = 'rgba(15,18,28,0.6)';
      this.roundRect(ctx, WORLD_W - 470, WORLD_H - 82, 454, 68, 10);
      ctx.fill();
      lines.forEach((l, i) => {
        ctx.font = '12.5px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#e8ecf5';
        ctx.fillText(l, WORLD_W - 458, WORLD_H - 64 + i * 20);
      });
    }
  }

  drawBanner(ctx) {
    const c = this.active;
    const t = Math.min(1, (80 - this.bannerTimer) / 12, this.bannerTimer / 12);
    ctx.globalAlpha = Math.max(0, t);
    ctx.fillStyle = 'rgba(10,12,20,0.75)';
    this.roundRect(ctx, WORLD_W / 2 - 260, WORLD_H / 2 - 210, 520, 80, 16);
    ctx.fill();
    this.outlinedText(ctx, `${c.name}'s turn`, WORLD_W / 2, WORLD_H / 2 - 180, 'bold 32px system-ui, sans-serif', TEAMS[c.team].color);
    this.outlinedText(ctx, `${TEAMS[c.team].name}${c.isCPU ? ' · CPU' : ''}`, WORLD_W / 2, WORLD_H / 2 - 148, '16px system-ui, sans-serif', '#dfe6f3');
    ctx.globalAlpha = 1;
  }
}
