// ---------------------------------------------------------------------------
// Game: turn flow, physics, camera, input and rendering
// ---------------------------------------------------------------------------

class Game {
  // settings = { players: [{name, cpu, team}], turnTime, health, difficulty, theme, mapSize, mines }
  // hooks    = { onGameOver(result), onWeaponsChanged(), onPause(paused) }
  constructor(canvas, settings, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.settings = settings;
    this.hooks = hooks || {};
    applyWeaponConfig(settings.weapons, settings.unlimitedAmmo);

    const size = MAP_SIZES[settings.mapSize] || MAP_SIZES.medium;
    setWorldSize(size.w, size.h);

    const themeKey = settings.theme === 'random' || !THEMES[settings.theme]
      ? Object.keys(THEMES)[randInt(0, Object.keys(THEMES).length - 1)]
      : settings.theme;
    this.theme = THEMES[themeKey];
    this.terrain = new Terrain(WORLD_W, WORLD_H, this.theme);
    this.background = paintBackground(this.theme);
    this.clouds = Array.from({ length: Math.round(7 * WORLD_W / 1600) }, () => ({
      x: rand(0, WORLD_W), y: rand(WORLD_H - 870, WORLD_H - 640), s: rand(0.6, 1.4),
    }));

    this.chars = [];
    this.projectiles = [];
    this.mines = [];
    this.crates = [];
    this.fires = [];
    this.deathBlasts = [];
    this.smokes = [];
    this.gases = [];
    this.jet = null;
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
    this.spawnMines();
    this.spawnCrates();
    this.spawnBarrels();

    this.teamOrder = shuffle(Object.keys(this.teams).map(Number));
    this.teamPtr = -1;

    this.keys = {};
    this.mouse = { x: WORLD_W / 2, y: WORLD_H / 2, inside: false };
    this.pointers = new Map();
    this.pinch = null;
    this.isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    this.tick = 0;
    this.paused = false;
    this.over = false;
    this.wind = 0;
    this.active = null;
    this.rope = null;
    this.state = 'start';
    this.turnNumber = 0;
    this.friendlyFire = !!settings.friendlyFire;
    this.fastForward = false;
    this.skipAvailable = false;
    this.hadHumans = this.chars.some(c => !c.isCPU);

    this.cam = { x: WORLD_W / 2, y: WORLD_H / 2 };
    this.zoom = 0;
    this.camManual = false;
    this.focus = null;
    this.resize();

    this.bindInput();
    this.nextTurn();
    this.snapCamera = true;
    this.updateCamera();
  }

  // Run the rest of an all-CPU match as fast as the device allows
  skipToEnd() {
    if (!this.skipAvailable || this.over) return;
    this.fastForward = true;
    Sound.quiet = true;
  }

  // --- setup -------------------------------------------------------------

  spawnCharacters() {
    for (const c of this.chars) {
      let placed = false;
      for (let attempt = 0; attempt < 800 && !placed; attempt++) {
        const minGap = attempt < 500 ? 80 : 30;
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

  spawnMines() {
    const per = MINE_AMOUNTS[this.settings.mines];
    const n = Math.round(WORLD_W * (per == null ? MINE_AMOUNTS.few : per));
    for (let i = 0; i < n; i++) {
      for (let attempt = 0; attempt < 120; attempt++) {
        const x = rand(30, WORLD_W - 30);
        const spots = this.terrain.standSpots(x);
        if (!spots.length) continue;
        const y = spots[randInt(0, spots.length - 1)] + CHAR_R - 4;
        if (this.chars.some(c => dist(c.x, c.y, x, y) < 90)) continue;
        if (this.mines.some(m => dist(m.x, m.y, x, y) < 50)) continue;
        this.mines.push(this.makeMine(x, y, -1, 0));
        break;
      }
    }
  }

  makeMine(x, y, ownerTeam, arm, damage = WEAPON.mine.damage) {
    return { x, y, vx: 0, vy: 0, airborne: true, arm, fuse: null, ownerTeam, dead: false, damage, radius: WEAPON.mine.radius };
  }

  // Random spot on solid ground (centre of an object of half-height `half`), away from characters
  groundSpot(half, keepAway = 60) {
    for (let attempt = 0; attempt < 150; attempt++) {
      const x = rand(30, WORLD_W - 30);
      const spots = this.terrain.standSpots(x);
      if (!spots.length) continue;
      const y = spots[randInt(0, spots.length - 1)] + CHAR_R - half;
      if (this.chars.some(c => dist(c.x, c.y, x, y) < keepAway)) continue;
      if (this.mines.some(m => dist(m.x, m.y, x, y) < 40)) continue;
      if (this.crates.some(k => dist(k.x, k.y, x, y) < 50)) continue;
      return { x, y };
    }
    return null;
  }

  makeCrate(x, y, type, chute) {
    return { x, y, vx: 0, vy: 0, type, chute, airborne: true, dead: false };
  }

  spawnCrates() {
    const cfg = CRATE_AMOUNTS[this.settings.crates] || CRATE_AMOUNTS.normal;
    const wood = Math.round(WORLD_W * cfg.wood), steel = Math.round(WORLD_W * cfg.steel);
    for (let i = 0; i < wood + steel; i++) {
      const p = this.groundSpot(9);
      if (p) this.crates.push(this.makeCrate(p.x, p.y, i < wood ? 'wood' : 'steel', false));
    }
  }

  // Explosive barrels: fire (red) and toxic (green), scattered around the map
  spawnBarrels() {
    const n = Math.round(WORLD_W * BARRELS.perPixel);
    for (let i = 0; i < n; i++) {
      const p = this.groundSpot(11, 70);
      if (p) this.crates.push(this.makeCrate(p.x, p.y, Math.random() < 0.5 ? 'firebarrel' : 'toxicbarrel', false));
    }
  }

  // Flashbang: a huge burst of light; anyone inside it is dazed on their next turn
  flashbang(p) {
    this.effects.push({ type: 'flashbang', x: p.x, y: p.y, r: p.radius, life: 40, max: 40 });
    Sound.play('flashbang');
    for (const c of this.chars) {
      if (!c.alive || dist(c.x, c.y, p.x, p.y) > p.radius) continue;
      if (c.team === p.ownerTeam && c !== this.active && !this.friendlyFire) continue;
      c.dazed = 1;
      this.texts.push({ x: c.x, y: c.y - 40, text: '😵 Dazed!', color: '#fff', life: 80 });
      if (c === this.active && this.state === 'turn') this.dazedNow = true;
    }
  }

  addGas(x, y, r, dmg, ownerTeam) {
    const puffs = Array.from({ length: 20 }, () => {
      const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r * 0.75;
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: rand(r * 0.3, r * 0.5), ph: rand(0, 6) };
    });
    this.gases.push({ x, y, r, dmg, ownerTeam, age: 0, puffs });
    Sound.play('puff');
  }

  updateGas() {
    for (const g of this.gases) g.age++;
    if (this.tick % 20 !== 0 || !this.gases.length) return;
    for (const c of this.chars) {
      if (!c.alive || c.suit) continue;
      const g = this.gases.find(g => dist(c.x, c.y, g.x, g.y) < g.r * Math.min(1, g.age / SMOKE_GROW) && (c.team !== g.ownerTeam || this.friendlyFire));
      if (!g) continue;
      const got = this.hurt(c, Math.max(1, Math.round(g.dmg)));
      c.gasShown = (c.gasShown || 0) + got;
      if (c.gasShown >= 3) { this.texts.push({ x: c.x, y: c.y - 30, text: `☣ -${c.gasShown}`, color: '#8ce99a', life: 50 }); c.gasShown = 0; }
      if (c.hp <= 0) this.kill(c, false);
    }
  }

  addSmoke(x, y) {
    const r = WEAPON.smoke.smokeRadius;
    const puffs = Array.from({ length: 22 }, () => {
      const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r * 0.75;
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: rand(r * 0.3, r * 0.5), ph: rand(0, 6) };
    });
    this.smokes.push({ x, y, r, age: 0, puffs });
    Sound.play('puff');
  }

  inSmoke(x, y) {
    return this.smokes.some(s => dist(x, y, s.x, s.y) < s.r * Math.min(1, s.age / SMOKE_GROW));
  }

  // Characters inside smoke can't be seen by other teams (whoever's turn it is is the viewer)
  visibleChar(c) {
    if (!this.smokes.length || c === this.active) return true;
    if (this.active && c.team === this.active.team) return true;
    return !this.inSmoke(c.x, c.y);
  }

  isBarrel(k) { return k.type === 'firebarrel' || k.type === 'toxicbarrel'; }

  // Supply drop: crates float down on parachutes
  dropCrates() {
    const n = this.settings.crates === 'lots' ? randInt(2, 3) : randInt(1, 2);
    for (let i = 0; i < n; i++) {
      for (let attempt = 0; attempt < 60; attempt++) {
        const x = rand(60, WORLD_W - 60);
        const spots = this.terrain.standSpots(x);
        if (!spots.length) continue;
        const y = Math.max(-30, spots[0] - 420);
        const type = Math.random() < 0.6 ? 'wood' : 'steel';
        this.crates.push(this.makeCrate(x, y, type, true));
        this.texts.push({ x, y: y + 40, text: 'Supply drop!', color: '#fff', life: 100 });
        break;
      }
    }
    Sound.play('drop');
  }

  updateCrate(k) {
    if (k.inTornado) return;
    const t = this.terrain;
    if (!k.airborne && !t.isSolid(k.x, k.y + 10)) k.airborne = true;
    if (k.airborne) {
      if (k.chute) { k.vy = Math.min(k.vy + 0.08, 2.6); k.vx = this.wind * 0.6; } else k.vy = Math.min(k.vy + GRAVITY, 12);
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(k.vx), Math.abs(k.vy)) / 2));
      for (let i = 0; i < steps; i++) {
        const nx = k.x + k.vx / steps;
        if (t.isSolid(nx + Math.sign(k.vx) * 9, k.y)) k.vx = 0; else k.x = nx;
        const ny = k.y + k.vy / steps;
        if (t.isSolid(k.x, ny + 9) || t.isSolid(k.x - 7, ny + 9) || t.isSolid(k.x + 7, ny + 9)) {
          if (k.vy > 0) { k.vy = 0; k.vx = 0; k.airborne = false; k.chute = false; break; }
          k.vy = 0;
        } else k.y = ny;
      }
    }
    if (k.y > WATER_Y + 4 || k.x < -40 || k.x > WORLD_W + 40) {
      k.dead = true;
      if (k.y > WATER_Y) this.splash(k.x);
      return;
    }
    if (this.isBarrel(k)) return; // barrels can't be opened, only blown up
    for (const c of this.chars) {
      if (c.alive && Math.abs(c.x - k.x) < CHAR_R + 10 && Math.abs(c.y - k.y) < CHAR_R + 10) {
        k.dead = true;
        this.openCrate(k, c);
        return;
      }
    }
  }

  openCrate(k, c) {
    const team = this.teams[c.team];
    let text;
    if (k.type === 'steel') {
      const pool = WEAPONS.filter(w => w.crate);
      const w = pool[randInt(0, pool.length - 1)];
      team.ammo[w.id] = (team.ammo[w.id] || 0) + w.crate;
      text = `${w.icon} ${w.name}${w.crate > 1 ? ' ×' + w.crate : ''}`;
    } else {
      const r = Math.random();
      if (r < 0.35) {
        c.hp += 35;
        text = '+35 HP';
      } else if (r < 0.5) {
        c.powerUp = true;
        text = '⚡ Power-up: next attack +50%';
      } else if (r < 0.65) {
        c.armor += 40;
        text = '🛡 Armor: half damage';
      } else {
        // more ammo for something the team already has (with unlimited ammo there's nothing to refill: heal instead)
        const pool = WEAPONS.filter(w => !w.tool && w.kind !== 'skip' && isFinite(team.ammo[w.id]) && (!w.crate || team.ammo[w.id] > 0));
        if (!pool.length) {
          c.hp += 35;
          text = '+35 HP';
          return this.crateOpened(k, c, text);
        }
        const w = pool[randInt(0, pool.length - 1)];
        const amount = w.crate ? 1 : (w.id === 'mine' || w.id === 'cluster' ? 2 : 1);
        team.ammo[w.id] += amount;
        text = `${w.icon} +${amount} ${w.name}`;
      }
    }
    this.crateOpened(k, c, text);
  }

  crateOpened(k, c, text) {
    this.texts.push({ x: c.x, y: c.y - 50, text, color: '#fff', life: 130 });
    this.burst(k.x, k.y, k.type === 'steel' ? '#b9c2cc' : '#c08a4a', 18);
    Sound.play('pickup');
    this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
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
    this.rope = null;
    this.ropeShots = ROPE_SHOTS;
    this.digLeft = { drill: DIG_TICKS, pickaxe: DIG_TICKS };
    this.digging = false;
    this.digHit = new Set();
    this.shotsFired = 0;
    this.lockedWeapon = null;
    this.turnMult = null;
    this.gunBurst = null;
    this.jet = null;
    this.chuteSteer = 0;
    this.state = 'banner';
    this.bannerTimer = 80;
    this.camManual = false;
    this.ai = this.active.isCPU ? new AIController(this, this.active) : null;
    if (this.active.restArmor > 0) this.active.restArmor--; // Rest & Heal protection wears off over 3 rounds
    this.ropeKickCd = 0;
    this.dazedNow = this.active.dazed > 0;
    if (this.dazedNow) this.active.dazed--;
    if (!(team.ammo[this.active.weapon] > 0)) this.active.weapon = 'bazooka';
    Sound.play('turn');
    this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
  }

  endTurn() {
    if (this.state !== 'turn') return;
    this.releaseRope();
    this.digging = false;
    this.gunBurst = null;
    this.lockedWeapon = null;
    this.jet = null;
    const every = (CRATE_AMOUNTS[this.settings.crates] || CRATE_AMOUNTS.normal).every;
    this.dropPending = every > 0 && this.turnNumber % every === 0;
    this.state = 'settle';
    this.charging = false;
    this.settleTimer = 0;
    this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
  }

  finish(team) {
    this.over = true;
    this.fastForward = false;
    Sound.quiet = false;
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
    if (this.hasFired || this.charging || this.digging || this.lockedWeapon) return;
    const team = this.teams[this.active.team];
    if (!(team.ammo[id] > 0) && !(id === 'suit' && this.active.ownsSuit)) return;
    // picking anything else takes the jetpack off (controls go back to normal)
    if (this.jet && id !== 'jetpack') {
      this.jet = null;
      this.texts.push({ x: this.active.x, y: this.active.y - 40, text: 'Jetpack off', color: '#fff', life: 50 });
    }
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

  // Space / FIRE button pressed by a human
  trigger() {
    const c = this.active;
    const w = WEAPON[c.weapon];
    this.camManual = false;
    const dozer = this.projectiles.find(p => p.dozer && p.owner === c && !p.detonate);
    if (dozer) { dozer.detonate = true; return; }
    const ball = this.projectiles.find(p => p.plasma && p.owner === c);
    if (ball) { ball.detonate = true; return; }
    if (w.kind === 'rope') { this.fireRope(); return; }
    if (w.kind === 'jetpack') { this.toggleJetpack(); return; }
    if (w.kind === 'suit') { this.toggleSuit(c); return; }
    if (w.kind === 'chute') {
      if (c.airborne && !c.chute) this.openChute(c);
      else if (!c.chute) this.texts.push({ x: c.x, y: c.y - 50, text: 'Jump or fall to open it', color: '#fff', life: 70 });
      return;
    }
    if (this.hasFired || this.gunBurst) return;
    if (w.kind === 'dig') {
      if (this.digLeft[w.id] > 0) { this.releaseRope(); this.digging = true; }
      else this.texts.push({ x: c.x, y: c.y - 50, text: `${w.name} is worn out this turn`, color: '#fff', life: 80 });
      return;
    }
    if (w.charge) { this.charging = true; this.chargePower = 0; }
    else if (w.kind === 'target') {
      if (this.mouse.inside && !this.isTouch) this.fireAt(this.mouse.x, this.mouse.y);
      else this.texts.push({ x: c.x, y: c.y - 50, text: 'Tap the map to pick a target', color: '#fff', life: 90 });
    } else this.fire(1);
  }

  // Hazmat suit: put on once (uses the item), then it can be taken off and on for free
  toggleSuit(c) {
    if (this.state !== 'turn') return;
    if (c.suit) { c.suit = false; this.texts.push({ x: c.x, y: c.y - 40, text: 'Suit off', color: '#fff', life: 50 }); }
    else {
      const team = this.teams[c.team];
      if (!c.ownsSuit) {
        if (!(team.ammo.suit > 0)) return;
        team.ammo.suit--;
        c.ownsSuit = true;
      }
      c.suit = true;
      this.texts.push({ x: c.x, y: c.y - 40, text: '🦺 Suit on', color: '#ffd43b', life: 60 });
    }
    Sound.play('whoosh');
    this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
  }

  // --- jetpack and parachute --------------------------------------------------

  toggleJetpack() {
    if (this.state !== 'turn') return;
    const c = this.active, team = this.teams[c.team];
    if (this.jet) { this.jet = null; return; }
    if (!(team.ammo.jetpack > 0)) return;
    team.ammo.jetpack--;
    this.releaseRope();
    this.jet = { fuel: WEAPON.jetpack.fuel, max: WEAPON.jetpack.fuel, tx: 0, ty: 0 };
    c.chute = false;
    this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
  }

  openChute(c) {
    const team = this.teams[c.team];
    if (c.chute || !(team.ammo.parachute > 0)) return false;
    team.ammo.parachute--;
    c.chute = true;
    c.vy = Math.min(c.vy, 2);
    this.texts.push({ x: c.x, y: c.y - 50, text: '🪂', color: '#fff', life: 50 });
    Sound.play('whoosh');
    this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
    return true;
  }

  // Damage multiplier for this turn's attack (uses up a power-up)
  attackMultiplier(c) {
    if (this.turnMult == null) {
      this.turnMult = c.powerUp ? 1.5 : 1;
      if (c.powerUp) {
        c.powerUp = false;
        this.texts.push({ x: c.x, y: c.y - 50, text: '⚡ Power-up!', color: '#ffe066', life: 70 });
      }
    }
    return this.turnMult;
  }

  fire(power) {
    if (this.state !== 'turn' || this.hasFired || this.gunBurst) return;
    const c = this.active;
    const w = WEAPON[c.weapon];
    const team = this.teams[c.team];
    if (this.lockedWeapon && this.lockedWeapon !== w.id) return;
    if (!this.lockedWeapon && !(team.ammo[w.id] > 0)) return;
    if (w.kind === 'target' || w.kind === 'rope' || w.kind === 'dig' || w.kind === 'jetpack' || w.kind === 'chute') return;
    if (w.kind === 'sling') { // fling yourself; doesn't use up the attack
      const { dx, dy } = c.aimVector();
      const sp = Math.max(0.15, power) * w.power;
      this.releaseRope();
      this.jet = null;
      this.charging = false;
      team.ammo[w.id]--;
      c.y -= 2;
      c.vx = dx * sp;
      c.vy = dy * sp;
      c.airborne = true;
      this.camManual = false;
      this.effects.push({ type: 'tracer', x1: c.x, y1: c.y, x2: c.x - dx * 14, y2: c.y - dy * 14, life: 10, max: 10 });
      Sound.play('twang');
      if (!(team.ammo[w.id] > 0)) c.weapon = 'bazooka';
      this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
      return;
    }

    this.releaseRope();
    this.charging = false;
    this.camManual = false;
    const mult = w.kind === 'skip' ? 1 : this.attackMultiplier(c);
    if (w.kind === 'smg') this.gunBurst = { w, left: w.burst, t: 0, mult }; // each "shot" is a 3-round burst
    if (!this.lockedWeapon) team.ammo[w.id]--;
    this.shotsFired++;
    if (this.shotsFired < (w.shots || 1)) this.lockedWeapon = w.id;
    else { this.hasFired = true; this.lockedWeapon = null; }

    if (w.kind === 'projectile') {
      const p = launchProjectile(w, c, Math.max(0.05, power), w.fuseSelect ? c.fuse * TICK_RATE : null);
      p.damage *= mult;
      if (w.cluster) { p.bombletDamage = w.bombletDamage * mult; p.bombletRadius = w.bombletRadius; }
      if (w.frags) {
        Object.assign(p, { frags: w.frags, fragDamage: w.bombletDamage * mult, fragRadius: w.bombletRadius,
          fragClusters: w.fragClusters, clusterDamage: w.clusterDamage * mult, clusterRadius: w.clusterRadius,
          microClusters: w.microClusters, microDamage: w.microDamage * mult, microRadius: w.microRadius });
      }
      if (w.id === 'smoke') p.smoke = true;
      if (w.id === 'flashbang') p.flash = true;
      if (w.id === 'gas') p.gas = true;
      this.projectiles.push(p);
      Sound.play(w.bounce ? 'throw' : 'launch');
    } else if (w.kind === 'drop') {
      const p = launchProjectile(w, { ...c, aim: 0 }, 0);
      p.x = c.x; p.y = c.y; p.vx = 0; p.vy = 0;
      p.damage *= mult;
      this.projectiles.push(p);
      Sound.play('throw');
    } else if (w.kind === 'mine') {
      const m = this.makeMine(c.x + c.facing * 6, c.y, c.team, 90, w.damage * mult);
      m.vx = c.facing * 1.2;
      m.vy = -1.5;
      this.mines.push(m);
      Sound.play('throw');
    } else if (w.kind === 'hitscan') {
      Sound.play(w.id === 'sniper' ? 'sniper' : w.id === 'deagle' ? 'pistol' : 'shot');
      const n = w.pellets || 1;
      for (let i = 0; i < n; i++) {
        const a = (c.aim + (w.spread ? rand(-w.spread, w.spread) : 0)) * Math.PI / 180;
        this.fireBullet(c, Math.cos(a) * c.facing, -Math.sin(a), w, mult);
      }
      if (this.lockedWeapon) {
        this.texts.push({ x: c.x, y: c.y - 50, text: `Shot ${this.shotsFired} of ${w.shots}`, color: '#fff', life: 60 });
      }
    } else if (w.kind === 'burst') {
      this.gunBurst = { w, left: w.bullets, t: 0, mult };
    } else if (w.kind === 'plasma') {
      const { dx, dy } = c.aimVector();
      this.projectiles.push({
        weapon: 'plasma', plasma: true, x: c.x + dx * 18, y: c.y + dy * 18, vx: dx * w.speed, vy: dy * w.speed,
        r: w.radius, damage: w.damage * mult, bigDamage: w.bombletDamage * mult, bigR: w.bombletRadius, life: w.life, mult, phase: 'fly',
        owner: c, ownerId: c.id, ownerTeam: c.team, age: 0, spin: 0, bounce: false, wind: false, cluster: 0, fuse: null,
      });
      Sound.play('plasma');
    } else if (w.kind === 'tornado') {
      const sy = this.groundBelow(c.x + c.facing * 26, c.y - 30);
      this.projectiles.push({
        weapon: 'tornado', tornado: true, x: c.x + c.facing * 26, y: sy, dir: c.facing, r: 12, maxR: w.radius,
        speed: w.speed, life: w.life, damage: w.damage * mult, owner: c, ownerId: c.id, ownerTeam: c.team,
        caught: [], recent: new Map(), age: 0, spin: 0, bounce: false, wind: false, cluster: 0, fuse: null,
      });
      Sound.play('wind');
    } else if (w.kind === 'drone') {
      const { dx, dy } = c.aimVector();
      this.projectiles.push({
        weapon: 'drone', drone: true, x: c.x + dx * 16, y: c.y + dy * 16, vx: dx * w.speed, vy: dy * w.speed,
        heading: Math.atan2(dy, dx), ctrl: w.ctrlTicks, speed: w.speed, radius: w.radius, damage: w.damage * mult, blastKnock: w.blastKnock,
        cluster: w.cluster || 0, bombletDamage: (w.bombletDamage || 0) * mult, bombletRadius: w.bombletRadius,
        owner: c, ownerId: c.id, ownerTeam: c.team, age: 0, spin: 0, bounce: false, wind: false, fuse: null,
      });
      Sound.play('drone');
    } else if (w.kind === 'dozer') {
      this.projectiles.push({
        weapon: 'dozer', dozer: true, x: c.x + c.facing * 22, y: c.y - 4, vy: 0, heading: c.facing > 0 ? 0 : Math.PI,
        life: w.life, speed: w.speed, digR: w.digRadius, radius: w.radius, damage: w.damage * mult,
        dynDamage: w.bombletDamage * mult, dynRadius: w.bombletRadius,
        owner: c, ownerId: c.id, ownerTeam: c.team, age: 0, spin: 0, bounce: false, wind: false, cluster: 0, fuse: null,
      });
      Sound.play('engine');
    } else if (w.kind === 'claymore') {
      const m = this.makeMine(c.x + c.facing * 10, c.y, c.team, 60, w.damage * mult);
      Object.assign(m, { claymore: true, facing: c.facing, radius: w.radius, pellets: w.pellets });
      m.vy = -1;
      this.mines.push(m);
      Sound.play('throw');
    } else if (w.kind === 'blaster') {
      const { dx, dy } = c.aimVector();
      this.projectiles.push({
        weapon: 'blaster', blaster: true, x: c.x + dx * 14, y: c.y + dy * 14, vx: dx * w.speed, vy: dy * w.speed, life: w.life,
        damage: w.damage * mult, radius: w.radius, bigDamage: w.bombletDamage * mult, hit: new Set(),
        owner: c, ownerId: c.id, ownerTeam: c.team, age: 0, spin: 0, bounce: false, wind: false, cluster: 0, fuse: null,
      });
      Sound.play('blaster');
    } else if (w.kind === 'boulder') {
      const { dx, dy } = c.aimVector();
      const sp = Math.max(0.1, power) * MAX_POWER_SPEED * 0.85;
      this.projectiles.push({
        weapon: 'boulder', boulder: true, x: c.x + dx * 16, y: c.y + dy * 16, vx: dx * sp, vy: dy * sp,
        bouncesLeft: w.bounces, radius: w.radius, damage: w.damage * mult, blastKnock: w.blastKnock, cool: 0,
        owner: c, ownerId: c.id, ownerTeam: c.team, age: 0, spin: 0, bounce: false, wind: false, cluster: 0, fuse: null,
      });
      Sound.play('throw');
    } else if (w.kind === 'boomerang') {
      const { dx, dy } = c.aimVector();
      const sp = Math.max(0.15, power) * 11;
      this.projectiles.push({
        weapon: 'boomerang', boomer: true, x: c.x + dx * 14, y: c.y + dy * 14, vx: dx * sp, vy: dy * sp, bx: -dx, by: -dy,
        radius: w.radius, damage: w.damage * mult, knock: w.knock, hit: new Set(), owner: c, ownerId: c.id, ownerTeam: c.team,
        age: 0, spin: 0, bounce: false, wind: false, cluster: 0, fuse: null,
      });
      Sound.play('whoosh');
    } else if (w.kind === 'mouse') {
      this.projectiles.push({
        weapon: 'mouse', mouse: true, x: c.x + c.facing * 12, y: c.y, vx: 0, vy: -1.5, dir: c.facing, life: w.life, dropStart: w.dropStart, dropEvery: w.dropEvery,
        radius: w.radius, damage: w.damage * mult, pellets: w.pellets, owner: c, ownerId: c.id, ownerTeam: c.team,
        age: 0, spin: 0, bounce: false, wind: false, cluster: 0, fuse: null,
      });
      Sound.play('squeak');
    } else if (w.kind === 'melee') {
      this.swingBat(c, w, mult);
    } else if (w.kind === 'flame') {
      this.gunBurst = { w, left: w.bullets, t: 0, mult };
    } else if (w.kind === 'walker') {
      this.projectiles.push({
        weapon: 'frog', walker: true, x: c.x + c.facing * 14, y: c.y - 6, vx: c.facing * 1.6, vy: -3, dir: c.facing, foot: 8,
        fuse: w.fuse, radius: w.radius, damage: w.damage * mult, blastKnock: w.blastKnock, ownerId: c.id, ownerTeam: c.team,
        babies: w.babies, bombletDamage: w.bombletDamage * mult, bombletRadius: w.bombletRadius,
        age: 0, hop: 0, bounce: false, wind: false, cluster: 0, spin: 0,
      });
      Sound.play('croak');
    } else if (w.kind === 'skip') { // Rest & Heal
      const before = c.hp;
      c.hp = Math.min(c.maxHp, c.hp + w.heal);
      c.restArmor = 3;
      this.texts.push({ x: c.x, y: c.y - 40, text: `+${c.hp - before} HP · 🩹 20% armor for 3 rounds`, color: '#8ce99a', life: 110 });
      this.burst(c.x, c.y, '#8ce99a', 16);
      Sound.play('heal');
      this.endTurn();
    }
    this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
  }

  // Baseball bat: short reach, huge knockback in the aim direction
  swingBat(c, w, mult) {
    const { dx, dy } = c.aimVector();
    const px = c.x + dx * 14, py = c.y + dy * 14;
    this.effects.push({ type: 'swing', x: c.x, y: c.y, facing: c.facing, aim: c.aim, life: 14, max: 14 });
    let hit = false;
    for (const o of this.chars) {
      if (!o.alive || o === c || dist(o.x, o.y, px, py) > CHAR_R + w.radius) continue;
      if (o.team === c.team && !this.friendlyFire) continue;
      hit = true;
      o.x += dx * 2; o.y -= 2; // lift off the ground so the hit carries
      this.damageChar(o, Math.max(1, Math.round(w.damage * mult)), dx * w.knock, dy * w.knock - 2.5, c.team);
      this.burst(o.x, o.y, '#fff', 12);
    }
    for (const m of this.mines) {
      if (dist(m.x, m.y, px, py) < w.radius + 8) { m.vx += dx * 7; m.vy += dy * 7 - 3; m.airborne = true; hit = true; }
    }
    for (const k of this.crates) {
      if (dist(k.x, k.y, px, py) < w.radius + 10) { k.vx += dx * 6; k.vy += dy * 6 - 3; k.airborne = true; k.chute = false; hit = true; }
    }
    Sound.play(hit ? 'bat' : 'whoosh');
    if (!hit) this.texts.push({ x: c.x, y: c.y - 40, text: 'Whiff!', color: '#fff', life: 50 });
  }

  // One bullet or pellet along (dx, dy)
  fireBullet(c, dx, dy, w, mult) {
    this.shootRay(c.x, c.y, dx, dy, w, mult, c.team, c.id, 12);
  }

  shootRay(ox, oy, dx, dy, w, mult, ownerTeam, ignoreId, startGap) {
    let hit = traceRay(this.env, ox, oy, dx, dy, w.range, ignoreId);
    // a crate in the way stops the bullet (and bursts)
    const hitDist = dist(ox, oy, hit.x, hit.y);
    let crate = null, crateT = Infinity;
    for (const k of this.crates) {
      if (k.dead) continue;
      const t = (k.x - ox) * dx + (k.y - oy) * dy;
      if (t < startGap || t > hitDist || t >= crateT) continue;
      if (dist(k.x, k.y, ox + dx * t, oy + dy * t) < 11) { crate = k; crateT = t; }
    }
    if (crate) hit = { x: ox + dx * crateT, y: oy + dy * crateT, hit: null, solid: false };
    this.effects.push({ type: 'tracer', x1: ox + dx * startGap, y1: oy + dy * startGap, x2: hit.x, y2: hit.y, life: 10, max: 10 });
    this.hitAlongLine(ox + dx * startGap, oy + dy * startGap, hit.x, hit.y);
    const k = w.knock || 1.5;
    if (hit.hit) this.damageChar(hit.hit, Math.max(1, Math.round(w.damage * mult)), dx * k, dy * k - 0.8, ownerTeam);
    if (hit.solid || hit.hit) {
      if (w.radius > 0) this.terrain.carve(hit.x, hit.y, w.radius);
      for (let i = 0; i < 4; i++) {
        this.particles.push({ x: hit.x, y: hit.y, vx: rand(-1.5, 1.5) - dx, vy: rand(-2, 0), life: randInt(10, 22), max: 22, color: hit.hit ? '#fff' : this.theme.burn, size: 2.5, grav: 0.12 });
      }
    }
  }

  // Bullets set off mines and crates they pass through
  hitAlongLine(x1, y1, x2, y2) {
    const segDist = (px, py) => {
      const vx = x2 - x1, vy = y2 - y1, len2 = vx * vx + vy * vy || 1;
      const t = clamp(((px - x1) * vx + (py - y1) * vy) / len2, 0, 1);
      return dist(px, py, x1 + vx * t, y1 + vy * t);
    };
    for (const m of this.mines) if (!m.dead && segDist(m.x, m.y) < 8) this.triggerMine(m);
    for (const k of this.crates) if (!k.dead && segDist(k.x, k.y) < 11) this.destroyCrate(k);
  }

  triggerMine(m) {
    m.fuse = Math.min(m.fuse == null ? 99 : m.fuse, 6);
  }

  // A crate that gets hit bursts: small blast plus shrapnel flying in every direction
  destroyCrate(k) {
    if (k.dead) return;
    k.dead = true;
    const col = { steel: '#b9c2cc', wood: '#c08a4a', firebarrel: '#e5484d', toxicbarrel: '#3ddc3d' }[k.type];
    this.burst(k.x, k.y, col, 16);
    this.deathBlasts.push({ crate: true, type: k.type, x: k.x, y: k.y, t: 5 });
  }

  crateBlast(x, y, type) {
    if (type === 'firebarrel' || type === 'toxicbarrel') {
      // barrels: a bigger bang and a fountain of burning fuel or toxic sludge
      const toxic = type === 'toxicbarrel';
      this.explode(x, y, BARRELS.radius, BARRELS.damage, -1, 1.2);
      for (let i = 0; i < BARRELS.flames; i++) {
        const a = rand(Math.PI * 1.02, Math.PI * 1.98), sp = rand(1.5, 5);
        this.fires.push({ x: x + rand(-5, 5), y: y - 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: randInt(220, 330),
          airborne: true, ownerTeam: -1, dmg: BARRELS.fireDamage, toxic, seed: Math.random() * 10 });
      }
      return;
    }
    this.explode(x, y, CRATE_BLAST.radius, CRATE_BLAST.damage, -1);
    if (type === 'steel') { // steel crates also spray burning fuel all around
      for (let i = 0; i < CRATE_BLAST.fires; i++) {
        const a = rand(Math.PI * 1.05, Math.PI * 1.95), sp = rand(1.5, 4.5); // mostly upwards and sideways
        this.fires.push({ x: x + rand(-4, 4), y: y - 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: randInt(200, 300),
          airborne: true, ownerTeam: -1, dmg: CRATE_BLAST.fireDamage, seed: Math.random() * 10 });
      }
    }
    const n = randInt(CRATE_BLAST.pellets[0], CRATE_BLAST.pellets[1]);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      this.shootRay(x, y, Math.cos(a), Math.sin(a), CRATE_BLAST.pellet, 1, -1, -1, 4);
    }
    Sound.play('shot');
  }

  fireAt(x, y) {
    if (this.state !== 'turn' || this.hasFired || this.lockedWeapon || this.gunBurst) return;
    const c = this.active;
    const w = WEAPON[c.weapon];
    const team = this.teams[c.team];
    if (w.kind !== 'target' || !(team.ammo[w.id] > 0)) return;

    if (w.id === 'concrete') { // building tool: doesn't use up the attack
      if (!this.placeConcrete(x, y, c.buildAngle)) {
        this.texts.push({ x, y: y - 20, text: "Can't build there", color: '#fff', life: 60 });
        return;
      }
      team.ammo[w.id]--;
      if (!(team.ammo[w.id] > 0)) c.weapon = 'bazooka';
      this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
      return;
    }

    if (w.id === 'teleport') {
      if (y >= WATER_Y - CHAR_R * 2 || this.terrain.collides(x, y) || x < CHAR_R || x > WORLD_W - CHAR_R) {
        this.texts.push({ x, y: y - 20, text: "Can't teleport there", color: '#fff', life: 60 });
        return;
      }
      this.releaseRope();
      this.burst(c.x, c.y, '#b9f', 20);
      c.x = x; c.y = y; c.vx = 0; c.vy = 0; c.airborne = true;
      this.burst(x, y, '#b9f', 20);
      Sound.play('teleport');
    } else {
      const mult = this.attackMultiplier(c);
      const dir = x >= c.x ? 1 : -1;
      const top = Math.min(-40, y - 700);
      const base = { bounce: false, fuse: null, cluster: 0, ownerId: -1, ownerTeam: c.team, age: 0, spin: 0 };
      if (w.id === 'airstrike') {
        for (let i = 0; i < w.missiles; i++) {
          this.projectiles.push({ ...base, weapon: 'airstrike', x: x + (i - (w.missiles - 1) / 2) * 28 - dir * 140, y: top - i * 18,
            vx: dir * 2.2, vy: 5, wind: true, radius: w.radius, damage: w.damage * mult });
        }
        Sound.play('launch');
      } else if (w.id === 'napalm') {
        for (let i = 0; i < w.canisters; i++) {
          this.projectiles.push({ ...base, weapon: 'napalm', napalm: true, x: x + (i - (w.canisters - 1) / 2) * 26 - dir * 120, y: top - i * 16,
            vx: dir * 2, vy: 5, wind: true, radius: w.radius, damage: 10 * mult, burn: w.damage * mult });
        }
        Sound.play('launch');
      } else if (w.id === 'anvil') {
        this.projectiles.push({ ...base, weapon: 'anvil', lava: true, x, y: top, vx: 0, vy: 7, wind: false, radius: w.radius, damage: w.damage * mult, drilled: 0 });
        Sound.play('drop');
      }
    }
    team.ammo[w.id]--;
    this.hasFired = true;
    this.camManual = false;
    this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
  }

  // Concrete block: a 72x14 slab of new (destructible) ground
  placeConcrete(x, y, angleDeg) {
    const L = 72, T = 14, a = angleDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    if (y < 10 || y > WATER_Y - 4 || x < 10 || x > WORLD_W - 10) return false;
    const inside = (px, py, padU, padV) => {
      const dx = px - x, dy = py - y;
      const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
      return Math.abs(u) <= L / 2 + padU && Math.abs(v) <= T / 2 + padV;
    };
    if (this.chars.some(c => c.alive && inside(c.x, c.y, CHAR_R, CHAR_R))) return false;
    const t = this.terrain, R = Math.ceil(L / 2 + T);
    for (let py = Math.max(0, Math.floor(y - R)); py <= Math.min(t.h - 1, y + R); py++) {
      for (let px = Math.max(0, Math.floor(x - R)); px <= Math.min(t.w - 1, x + R); px++) {
        if (inside(px + 0.5, py + 0.5, 0, 0)) t.mask[py * t.w + px] = 1;
      }
    }
    const ctx = t.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = '#a7abb2';
    ctx.fillRect(-L / 2, -T / 2, L, T);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 14; i++) ctx.fillRect(-L / 2 + ((i * 37) % L), -T / 2 + ((i * 11) % T), 2, 2);
    ctx.strokeStyle = '#6d727a';
    ctx.lineWidth = 2;
    ctx.strokeRect(-L / 2 + 1, -T / 2 + 1, L - 2, T - 2);
    ctx.beginPath();
    ctx.moveTo(-L / 6, -T / 2); ctx.lineTo(-L / 6, T / 2);
    ctx.moveTo(L / 6, -T / 2); ctx.lineTo(L / 6, T / 2);
    ctx.stroke();
    ctx.restore();
    this.burst(x, y, '#c9ccd2', 14);
    Sound.play('build');
    for (const k of this.crates) k.airborne = true;
    return true;
  }

  // F key / option button: grenade timer or block rotation
  cycleOption() {
    if (!this.isHumanTurn() && !(this.state === 'banner' && !this.active.isCPU)) return;
    const c = this.active, w = WEAPON[c.weapon];
    if (w.fuseSelect) {
      c.fuse = c.fuse % 5 + 1;
      this.texts.push({ x: c.x, y: c.y - 50, text: `Timer: ${c.fuse} s`, color: '#fff', life: 50 });
    } else if (w.id === 'concrete') {
      c.buildAngle = (c.buildAngle + 45) % 180;
    } else return;
    this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
  }

  // --- ninja rope ---------------------------------------------------------------

  fireRope() {
    if (this.state !== 'turn' || this.hasFired) return;
    if (this.rope && this.rope.state === 'attached') { this.releaseRope(); return; }
    if (this.rope || this.ropeShots <= 0) return;
    const c = this.active;
    const { dx, dy } = c.aimVector();
    this.ropeShots--;
    this.rope = { state: 'flying', x: c.x, y: c.y, dx, dy, len: CHAR_R };
    Sound.play('rope');
  }

  releaseRope() {
    if (!this.rope) return;
    const attached = this.rope.state === 'attached';
    this.rope = null;
    if (attached && this.active) this.active.airborne = true;
  }

  updateRope() {
    const r = this.rope;
    if (!r) return;
    const c = this.active;
    if (!c.alive || this.state !== 'turn') { this.releaseRope(); return; }
    if (r.state === 'flying') {
      for (let i = 0; i < 12; i++) {
        r.len += 2;
        r.x = c.x + r.dx * r.len;
        r.y = c.y + r.dy * r.len;
        if (this.terrain.isSolid(r.x, r.y)) {
          r.state = 'attached';
          r.ax = r.x;
          r.ay = r.y;
          r.len = Math.max(16, dist(c.x, c.y, r.ax, r.ay));
          c.airborne = true;
          Sound.play('hook');
          return;
        }
        if (r.len >= ROPE_MAX || r.y > WATER_Y || r.x < 0 || r.x > WORLD_W) { this.rope = null; return; }
      }
      return;
    }
    // anchor blown away?
    const t = this.terrain;
    if (!t.isSolid(r.ax, r.ay) && !t.isSolid(r.ax + 2, r.ay) && !t.isSolid(r.ax - 2, r.ay) &&
        !t.isSolid(r.ax, r.ay + 2) && !t.isSolid(r.ax, r.ay - 2)) this.releaseRope();
  }

  // Pendulum physics while hanging on the rope
  updateRopeChar(c) {
    const r = this.rope, t = this.terrain;
    // standing against a wall on the rope: push off it with the arrow key pointing away
    if (this.ropeKickCd > 0) this.ropeKickCd--;
    const away = this.ropeSwing || 0;
    if (away && !this.ropeKickCd && t.collides(c.x - away * 3, c.y)) {
      c.vx += away * 3.5;
      c.vy -= 0.8;
      this.ropeKickCd = 18;
      Sound.play('jump');
    }
    c.airborne = true;
    c.vy += GRAVITY;
    c.vx += (this.ropeSwing || 0) * 0.09;
    c.vx *= 0.996;
    c.vy *= 0.996;
    if (this.ropeReel) r.len = clamp(r.len + this.ropeReel * 2.5, 16, ROPE_MAX);
    const steps = Math.max(1, Math.ceil(Math.hypot(c.vx, c.vy) / 2));
    for (let i = 0; i < steps; i++) {
      let nx = c.x + c.vx / steps, ny = c.y + c.vy / steps;
      const dx = nx - r.ax, dy = ny - r.ay, d = Math.hypot(dx, dy);
      if (d > r.len) {
        nx = r.ax + dx / d * r.len;
        ny = r.ay + dy / d * r.len;
        const ux = dx / d, uy = dy / d;
        const vr = c.vx * ux + c.vy * uy;
        if (vr > 0) { c.vx -= vr * ux; c.vy -= vr * uy; }
      }
      if (t.collides(nx, ny)) {
        // bounce off the wall; pushing away from it with the arrows kicks off harder
        c.vx = -c.vx * 0.75;
        c.vy = -c.vy * 0.5;
        const push = this.ropeSwing || 0;
        if (push && Math.sign(push) === Math.sign(c.vx || push)) c.vx += push * 3;
        break;
      }
      c.x = nx;
      c.y = ny;
    }
    if (c.vx > 0.3) c.facing = 1; else if (c.vx < -0.3) c.facing = -1;
  }

  // --- digging tools ---------------------------------------------------------

  // Called every tick while a human (or script) holds FIRE with the drill or pickaxe
  dig(c) {
    const w = WEAPON[c.weapon];
    if (!this.digging || w.kind !== 'dig' || this.hasFired) { this.digging = false; return; }
    if (this.digLeft[w.id] <= 0) {
      this.digging = false;
      this.hooks.onWeaponsChanged && this.hooks.onWeaponsChanged();
      return;
    }
    this.digLeft[w.id]--;
    this.camManual = false;
    let dx, dy;
    if (w.dig === 'down') { dx = 0; dy = 1; } else ({ dx, dy } = c.aimVector());

    // shake and push forward through the hole we just made
    c.shake = (c.shake || 0) + 1;
    if (w.dig === 'aim' && !c.airborne) {
      const nx = c.x + dx * 0.8, ny = c.y + dy * 0.8;
      if (!this.terrain.collides(nx, ny)) { c.x = nx; c.y = ny; }
    }
    if (this.digLeft[w.id] % 7 !== 0) return;

    const px = c.x + dx * (w.dig === 'down' ? 6 : 10);
    const py = c.y + dy * (w.dig === 'down' ? 8 : 10) - (w.dig === 'down' ? 0 : 2);
    this.terrain.carve(px, py, w.radius);
    Sound.play('dig');
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        x: px + rand(-6, 6), y: py + rand(-6, 6), vx: rand(-1.5, 1.5) - dx, vy: rand(-2.5, -0.5),
        life: randInt(15, 30), max: 30, color: this.theme.burn, size: rand(2, 3.5), grav: 0.15,
      });
    }
    // hit characters right in front of the tool (once per character per turn)
    for (const o of this.chars) {
      if (!o.alive || o === c || this.digHit.has(o.id)) continue;
      if (dist(o.x, o.y, px + dx * 6, py + dy * 6) < CHAR_R + w.radius * 0.7) {
        if (o.team === c.team && !this.friendlyFire) continue;
        this.digHit.add(o.id);
        this.damageChar(o, w.damage, dx * 3 + (dx === 0 ? c.facing * 2 : 0), -2.5, c.team);
      }
    }
    // mines in the way go off
    for (const m of this.mines) if (dist(m.x, m.y, px, py) < w.radius + 4) m.fuse = Math.min(m.fuse == null ? 99 : m.fuse, 30);
  }

  // Apply damage through armour; returns what actually got through
  hurt(c, amount) {
    if (c.restArmor > 0) amount = Math.max(1, Math.round(amount * 0.8)); // resting: 20% less damage
    if (c.armor > 0) {
      const absorbed = Math.min(c.armor, Math.ceil(amount / 2));
      c.armor -= absorbed;
      amount -= absorbed;
    }
    c.hp -= amount;
    return amount;
  }

  fallDamage(c, speed) {
    let amount = Math.round((speed - FALL_SAFE_SPEED) * FALL_DAMAGE_PER_SPEED);
    if (amount <= 0) return;
    Sound.play('thud');
    amount = this.hurt(c, amount);
    this.texts.push({ x: c.x, y: c.y - 30, text: `-${amount}`, color: TEAMS[c.team].color, life: 80 });
    if (c.hp <= 0) this.kill(c, false);
  }

  // --- damage ----------------------------------------------------------------

  explode(x, y, radius, damage, ownerTeam, knock = 1, kind) {
    this.terrain.carve(x, y, radius);
    const reach = radius + CHAR_R;
    if (damage > 0) {
      for (const c of this.chars) {
        if (!c.alive) continue;
        const d = dist(x, y, c.x, c.y);
        if (d >= reach) continue;
        if (c.team === ownerTeam && !this.friendlyFire) continue; // teammates (and yourself) are safe unless friendly fire is on
        const f = 1 - d / reach;
        const force = f * damage * 0.09 * knock;
        const ang = d < 1 ? -Math.PI / 2 : Math.atan2(c.y - y, c.x - x);
        if (c === this.active) this.releaseRope();
        this.damageChar(c, Math.max(1, Math.round(damage * f)), Math.cos(ang) * force, Math.sin(ang) * force - force * 0.6, ownerTeam, kind);
      }
    }
    // knock graves and mines around; blasts set off nearby mines
    for (const c of this.chars) {
      if (!c.alive && c.grave && dist(x, y, c.x, c.y) < reach) { c.airborne = true; c.vy -= 2; }
    }
    for (const m of this.mines) {
      if (m.dead) continue;
      const d = dist(x, y, m.x, m.y);
      if (d >= reach + 10) continue;
      const ang = d < 1 ? -Math.PI / 2 : Math.atan2(m.y - y, m.x - x);
      const force = (1 - d / (reach + 10)) * 5;
      m.vx += Math.cos(ang) * force;
      m.vy += Math.sin(ang) * force - 2;
      m.airborne = true;
      if (d < reach + 6) this.triggerMine(m);
    }
    for (const k of this.crates) {
      if (k.dead) continue;
      const d = dist(x, y, k.x, k.y);
      if (d < radius * 0.75) {
        this.destroyCrate(k);
      } else if (d < reach + 10) {
        const ang = Math.atan2(k.y - y, k.x - x);
        k.vx += Math.cos(ang) * 2.5; k.vy += Math.sin(ang) * 2.5 - 2; k.airborne = true; k.chute = false;
      }
    }
    this.focus = { x, y, t: 45 };
    if (radius >= 90) this.effects.push({ type: 'flash', life: 40, max: 40 });
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

  // kind: 'toxic' | 'plasma' | 'fire' | undefined (the Hazmat suit blocks the first three)
  damageChar(c, amount, kx, ky, ownerTeam, kind) {
    if (!c.alive || (c.team === ownerTeam && !this.friendlyFire)) return;
    if (kind && c.suit) {
      c.vx += kx; c.vy += ky; c.airborne = true;
      this.texts.push({ x: c.x, y: c.y - 30, text: '🦺 0', color: '#ffd43b', life: 40 });
      return;
    }
    amount = this.hurt(c, amount);
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
    this.texts.push({ x: c.x, y: c.y - 46, text: drowned ? (this.theme.lava ? `${c.name} fell into the lava!` : `${c.name} drowned!`) : `${c.name} is out!`, color: '#fff', life: 110 });
    if (!drowned) {
      this.burst(c.x, c.y, TEAMS[c.team].color, 25);
      this.deathBlasts.push({ c, t: DEATH_BLAST.delay });
    }
    c.chute = false;
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
    if (c.inTornado) { c.shownHp += (Math.max(0, c.hp) - c.shownHp) * 0.15; return; }
    const t = this.terrain;
    if (c === this.active && c.alive && this.rope && this.rope.state === 'attached') {
      this.updateRopeChar(c);
    } else {
      const jet = c === this.active && this.jet;
      if (jet && (jet.tx || jet.ty) && jet.fuel > 0) {
        c.vx = clamp(c.vx + jet.tx, -4.5, 4.5);
        c.vy = Math.max(c.vy + jet.ty, -3.6);
        if (jet.ty < 0) c.airborne = true;
        jet.fuel--;
        if (jet.fuel <= 0) { this.jet = null; this.texts.push({ x: c.x, y: c.y - 40, text: 'Out of fuel!', color: '#fff', life: 60 }); }
        if (this.tick % 2 === 0) {
          this.particles.push({ x: c.x - c.facing * 7, y: c.y + 8, vx: rand(-0.4, 0.4), vy: rand(1.5, 3), life: 16, max: 16, color: Math.random() < 0.5 ? '#ffb347' : '#ff6a00', size: 3, grav: 0 });
        }
      }
      // parachute: opens by itself when falling with it selected
      if (c.alive && !c.chute && c.airborne && c.vy > 3.5 && c.weapon === 'parachute' && !jet) this.openChute(c);
      if (!c.airborne && !t.collides(c.x, c.y + 1)) c.airborne = true;
      if (c.airborne) {
        if (c.chute) {
          c.vy = Math.min(c.vy + GRAVITY * 0.35, 1.5);
          const steer = c === this.active ? this.chuteSteer : 0;
          c.vx += (this.wind * 1.2 + steer * 1.6 - c.vx) * 0.05;
        } else if (jet) {
          c.vy = Math.min(c.vy + GRAVITY * 0.8, 12);
          if (!jet.tx) c.vx *= 0.98;
        } else c.vy = Math.min(c.vy + GRAVITY, 12);
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
              if (c.alive && c.tornadoFlung && !c.chute) this.fallDamage(c, Math.max(c.vy, FALL_SAFE_SPEED + 1.5));
              else if (c.alive && c.vy > FALL_SAFE_SPEED && !c.chute && !jet) this.fallDamage(c, c.vy);
              c.tornadoFlung = false;
              c.vy = 0; c.vx = 0; c.airborne = false; c.chute = false;
              break;
            }
            c.vy = 0;
          } else c.y = ny;
        }
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

  updateMine(m) {
    if (m.inTornado) return;
    const t = this.terrain;
    if (!m.airborne && !t.isSolid(m.x, m.y + 5)) m.airborne = true;
    if (m.airborne) {
      m.vy = Math.min(m.vy + GRAVITY, 12);
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(m.vx), Math.abs(m.vy)) / 2));
      for (let i = 0; i < steps; i++) {
        const nx = m.x + m.vx / steps;
        if (t.isSolid(nx, m.y + 2)) m.vx = -m.vx * 0.3; else m.x = nx;
        const ny = m.y + m.vy / steps;
        if (t.isSolid(m.x, ny + 4)) {
          if (m.vy > 0) {
            if (m.vy > 2.5) { m.vy = -m.vy * 0.3; m.vx *= 0.6; } else { m.vy = 0; m.vx = 0; m.airborne = false; }
            break;
          }
          m.vy = 0;
        } else m.y = ny;
      }
    }
    if (m.y > WATER_Y + 4 || m.x < -60 || m.x > WORLD_W + 60) {
      m.dead = true;
      if (m.y > WATER_Y) this.splash(m.x);
      return;
    }
    if (m.arm > 0) m.arm--;
    else if (m.fuse == null) {
      for (const c of this.chars) {
        if (!c.alive || c.team === m.ownerTeam) continue;
        if (m.claymore ? dist(c.x, c.y, m.x, m.y) < CHAR_R + 8 : dist(c.x, c.y, m.x, m.y) < MINE_TRIGGER) {
          m.fuse = m.claymore ? 1 : MINE_FUSE; // a claymore goes off the moment it's touched
          if (!m.claymore) Sound.play('beep');
          break;
        }
      }
    }
    if (m.fuse != null && --m.fuse <= 0) {
      m.dead = true;
      this.explode(m.x, m.y, m.radius, m.damage, m.ownerTeam);
      if (m.claymore) { // shrapnel thrown forward in a fan
        const pellet = { range: 260, damage: 5, radius: 4, knock: 1.6 };
        for (let i = 0; i < m.pellets; i++) {
          const a = (rand(-35, 35) - 10) * Math.PI / 180;
          this.shootRay(m.x, m.y - 4, Math.cos(a) * m.facing, Math.sin(a), pellet, 1, m.ownerTeam, -1, 4);
        }
      }
    }
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
      if (p.dozer) {
        const r = this.stepDozer(p);
        if (r) {
          this.projectiles.splice(i, 1);
          if (r === 'boom') this.dozerBoom(p);
          else if (r === 'water') this.splash(p.x);
        }
        continue;
      }
      if (p.blaster) {
        const r = this.stepBlaster(p);
        if (r) this.projectiles.splice(i, 1);
        continue;
      }
      if (p.boulder) {
        const r = this.stepBoulder(p);
        if (r) { this.projectiles.splice(i, 1); if (r === 'water') this.splash(p.x); }
        continue;
      }
      if (p.boomer) {
        const r = this.stepBoomerang(p);
        if (r) this.projectiles.splice(i, 1);
        continue;
      }
      if (p.mouse) {
        const r = this.stepMouse(p);
        if (r) {
          this.projectiles.splice(i, 1);
          if (r === 'burst') this.mouseBurst(p);
          else if (r === 'water') this.splash(p.x);
        }
        continue;
      }
      if (p.mini) {
        const r = this.stepMiniPlasma(p);
        if (r) {
          this.projectiles.splice(i, 1);
          if (r === 'impact') this.miniPlasmaBlast(p);
          else if (r === 'water') this.splash(p.x);
        }
        continue;
      }
      if (p.plasma) {
        const r = this.stepPlasma(p);
        if (r) {
          this.projectiles.splice(i, 1);
          if (r === 'detonate') this.plasmaDetonate(p);
          else if (r === 'water') this.splash(p.x);
        }
        continue;
      }
      if (p.tornado) {
        if (this.stepTornado(p)) { this.endTornado(p); this.projectiles.splice(i, 1); }
        continue;
      }
      let r = p.walker ? this.stepWalker(p) : p.drilling ? this.stepDriller(p) : p.drone ? this.stepDrone(p) : p.lava ? this.stepAnvil(p) : stepProjectile(p, env);
      // flying straight into a crate or a mine counts as a hit
      if (!r && !p.bounce && !p.walker && (this.crates.some(k => !k.dead && dist(k.x, k.y, p.x, p.y) < 11) ||
          this.mines.some(m => !m.dead && dist(m.x, m.y, p.x, p.y) < 7))) r = 'impact';
      if (r === 'impact' && p.driller && !p.drilling && !this.chars.some(c => c.alive && dist(c.x, c.y, p.x, p.y) < CHAR_R + 4)) {
        // hit rock: keep boring in the direction it was flying
        const sp = Math.hypot(p.vx, p.vy) || 1;
        p.drilling = true;
        p.drillLeft = p.drillTicks;
        p.vx = p.vx / sp * 1.4;
        p.vy = p.vy / sp * 1.4;
        p.wind = false;
        Sound.play('dig');
        r = null;
      }
      if (p.age % 2 === 0 && !p.bounce && !p.walker && p.weapon !== 'anvil' && !p.drone && p.weapon !== 'plasmafrag' && p.weapon !== 'greenlet' && p.weapon !== 'microlet') {
        this.particles.push({ x: p.x, y: p.y, vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), life: 30, max: 30, color: 'rgba(230,230,230,0.6)', size: 3, grav: -0.01 });
      }
      if (!r) continue;
      this.projectiles.splice(i, 1);
      if (r === 'water') { this.splash(p.x); continue; }
      if (r === 'lost') continue;
      if (p.smoke) { this.addSmoke(p.x, p.y); continue; } // smoke grenade: no blast at all
      if (p.gas) { this.addGas(p.x, p.y, p.radius, p.damage, p.ownerTeam); continue; }
      if (p.flash) { this.flashbang(p); continue; }       // flashbang: light only
      this.explode(p.x, p.y, p.radius, p.damage, p.ownerTeam, p.blastKnock || 1,
        PLASMA_WEAPONS.has(p.weapon) ? 'plasma' : p.napalm ? 'fire' : undefined);
      for (let k = 0; k < (p.frags || 0); k++) { // plasma frag grenade: big green frags that split again
        this.projectiles.push({
          weapon: 'plasmafrag', x: p.x, y: p.y - 6, vx: rand(-4.2, 4.2), vy: rand(-8.5, -4), wind: false, bounce: false, fuse: null,
          radius: p.fragRadius, damage: p.fragDamage, cluster: p.fragClusters, clusterWeapon: 'greenlet',
          bombletDamage: p.clusterDamage, bombletRadius: p.clusterRadius, ownerId: -1, ownerTeam: p.ownerTeam, age: 20, spin: 0,
          nest: { n: p.microClusters, weapon: 'microlet', damage: p.microDamage, radius: p.microRadius },
        });
      }
      if (p.napalm) this.spawnFire(p.x, p.y - 4, 7, p.ownerTeam, p.burn);
      for (let k = 0; k < (p.babies || 0); k++) {
        this.projectiles.push({
          weapon: 'frog', walker: true, baby: true, x: p.x + rand(-6, 6), y: p.y - 8, vx: rand(-2.6, 2.6), vy: rand(-5.5, -3),
          dir: Math.random() < 0.5 ? -1 : 1, fuse: randInt(60, 180), foot: 4, radius: p.bombletRadius, damage: p.bombletDamage,
          ownerId: -1, ownerTeam: p.ownerTeam, age: 0, hop: randInt(0, 10), bounce: false, wind: false, cluster: 0, spin: 0,
        });
      }
      for (let k = 0; k < p.cluster; k++) {
        this.projectiles.push({
          weapon: p.clusterWeapon || 'bomblet', x: p.x, y: p.y - 4, vx: rand(-3, 3), vy: rand(-6, -3), wind: false, bounce: false,
          fuse: null, radius: p.bombletRadius || 24, damage: p.bombletDamage || 25, ownerId: -1, ownerTeam: p.ownerTeam, age: 20, spin: 0,
          // one more round of splitting if this projectile carries it
          cluster: p.nest ? p.nest.n : 0, clusterWeapon: p.nest && p.nest.weapon,
          bombletDamage: p.nest && p.nest.damage, bombletRadius: p.nest && p.nest.radius,
        });
      }
    }
  }

  // Drilling rocket after impact: straight line through anything, then a blast
  stepDriller(p) {
    p.age++;
    p.x += p.vx;
    p.y += p.vy;
    p.spin += 0.6;
    if (--p.drillLeft % 5 === 0) {
      this.terrain.carve(p.x, p.y, WEAPON.drillrocket.drillHole || 10);
      if (p.drillLeft % 15 === 0) Sound.play('dig');
      for (let i = 0; i < 2; i++) {
        this.particles.push({ x: p.x, y: p.y, vx: rand(-1.5, 1.5) - p.vx, vy: rand(-2, 0), life: 18, max: 18, color: this.theme.burn, size: 2.5, grav: 0.15 });
      }
    }
    for (const c of this.chars) if (c.alive && dist(c.x, c.y, p.x, p.y) < CHAR_R + 5) return 'impact';
    // broke out of the rock into open air: blow up right away
    if (p.drillTicks - p.drillLeft > 8) {
      const ux = p.vx / 1.4, uy = p.vy / 1.4, t = this.terrain;
      if (!t.isSolid(p.x + ux * 14, p.y + uy * 14) && !t.isSolid(p.x + ux * 20, p.y + uy * 20) && !t.isSolid(p.x + ux * 26, p.y + uy * 26)) return 'impact';
    }
    if (p.y > WATER_Y) return 'water';
    if (p.x < -60 || p.x > WORLD_W + 60 || p.y < -400) return 'lost';
    if (p.drillLeft <= 0) return 'fuse';
    return null;
  }

  // Star Cannon: a slow plasma ball that ignores gravity and wind, eats through anything
  // and zaps whatever it touches five times a second
  stepPlasma(p) {
    p.age++;
    if (p.phase === 'grow') { // stopped dead, swelling until it fills the whole blast radius
      p.t++;
      const k = Math.min(1, p.t / 45);
      p.r = p.r0 + (p.bigR - p.r0) * k * k;
      if (p.t % 6 === 0) Sound.play('zap');
      if (p.t >= 45) {
        p.phase = 'flash';
        p.t = 0;
        this.effects.push({ type: 'flash', whiteout: true, life: 75, max: 75 });
        Sound.play('plasma');
      }
      return null;
    }
    if (p.phase === 'flash') { // blinding light; the blast goes off as it fades
      return ++p.t >= 75 ? 'detonate' : null;
    }
    if (p.detonate) {
      p.phase = 'grow';
      p.t = 0;
      p.r0 = p.r;
      p.vx = 0;
      p.vy = 0;
      return null;
    }
    p.x += p.vx;
    p.y += p.vy;
    if (p.age % 12 === 0) this.plasmaPulse(p);
    if (p.age % 2 === 0) {
      this.particles.push({ x: p.x + rand(-p.r, p.r) * 0.6, y: p.y + rand(-p.r, p.r) * 0.6, vx: -p.vx * 0.3 + rand(-0.5, 0.5), vy: -p.vy * 0.3 + rand(-0.5, 0.5),
        life: 26, max: 26, color: Math.random() < 0.5 ? '#7dff5a' : '#2fd12f', size: rand(2, 4), grav: 0 });
    }
    // CPU gunners set it off when it reaches an enemy
    if (p.owner && p.owner.isCPU && p.age > 30) {
      for (const e of this.chars) if (e.alive && e.team !== p.ownerTeam && dist(e.x, e.y, p.x, p.y) < p.r + 40) p.detonate = true;
    }
    if (p.y > WATER_Y + 10) return 'water';
    if (p.x < -120 || p.x > WORLD_W + 120 || p.y < -600 || p.y > WORLD_H + 60) return 'lost';
    if (p.age > p.life) p.detonate = true;
    return null;
  }

  plasmaPulse(p) {
    this.terrain.carve(p.x, p.y, p.r);
    for (const c of this.chars) {
      if (!c.alive || (c === p.owner && p.age < 45)) continue;
      const d = dist(c.x, c.y, p.x, p.y);
      if (d > p.r + CHAR_R) continue;
      if (c.team === p.ownerTeam && !this.friendlyFire) continue;
      const ux = d > 1 ? (c.x - p.x) / d : 0;
      this.damageChar(c, Math.max(1, Math.round(p.damage)), ux * 1.2, -0.9, p.ownerTeam, 'plasma');
    }
    for (const m of this.mines) if (!m.dead && dist(m.x, m.y, p.x, p.y) < p.r + 5) this.triggerMine(m);
    for (const k of this.crates) if (!k.dead && dist(k.x, k.y, p.x, p.y) < p.r + 9) this.destroyCrate(k);
    if (p.age % 24 === 0) Sound.play('zap');
  }

  plasmaDetonate(p) {
    const w = WEAPON.plasma;
    this.explode(p.x, p.y, p.bigR, p.bigDamage, p.ownerTeam, 1.5, 'plasma');
    // toxic plasma gushes out of the centre in every direction
    for (let i = 0; i < w.toxicSpray; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(0.8, 6.5);
      this.fires.push({ x: p.x + rand(-6, 6), y: p.y + rand(-6, 6), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
        life: randInt(240, 380), airborne: true, ownerTeam: p.ownerTeam, dmg: 2, toxic: true, seed: Math.random() * 10 });
    }
    // a shower of green cluster bomblets
    for (let i = 0; i < w.burstClusters; i++) {
      const a = rand(Math.PI * 1.05, Math.PI * 1.95), sp = rand(3, 7.5);
      this.projectiles.push({
        weapon: 'greenlet', x: p.x + rand(-10, 10), y: p.y + rand(-10, 10), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, wind: false, bounce: false,
        fuse: null, radius: w.clusterRadius, damage: w.clusterDamage * p.mult, cluster: 0, ownerId: -1, ownerTeam: p.ownerTeam, age: 20, spin: 0,
      });
    }
    // five small plasma balls shoot off in random directions
    for (let i = 0; i < w.miniBalls; i++) {
      const a = (i / w.miniBalls) * Math.PI * 2 + rand(-0.5, 0.5);
      this.projectiles.push({
        weapon: 'miniplasma', mini: true, x: p.x, y: p.y, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, r: 8,
        radius: w.miniRadius, damage: w.miniDamage * p.mult, clusters: w.miniClusters,
        clusterDamage: w.clusterDamage * p.mult, clusterRadius: w.clusterRadius,
        ownerId: -1, ownerTeam: p.ownerTeam, age: 0, spin: 0, bounce: false, wind: false, cluster: 0, fuse: null,
      });
    }
    // toxic plasma and fire everywhere the blast reached
    for (let i = 0; i < 46; i++) {
      const a = rand(0, Math.PI * 2), rr = Math.sqrt(Math.random()) * p.bigR;
      const toxic = i % 3 !== 0;
      this.fires.push({ x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr, vx: rand(-1.2, 1.2), vy: rand(-2.5, 0),
        life: randInt(220, 340), airborne: true, ownerTeam: p.ownerTeam, dmg: toxic ? 2 : 1, toxic, seed: Math.random() * 10 });
    }
    Sound.play('explosion', 2.5);
  }

  // Small plasma ball from a Star Cannon detonation: flies straight until it hits rock, a character, a crate or a mine
  stepMiniPlasma(p) {
    p.age++;
    for (let s = 0; s < 2; s++) {
      p.x += p.vx / 2;
      p.y += p.vy / 2;
      if (p.age > 6 && this.terrain.isSolid(p.x, p.y)) return 'impact';
      if (p.age > 8 && this.chars.some(c => c.alive && dist(c.x, c.y, p.x, p.y) < CHAR_R + p.r)) return 'impact';
      if (this.crates.some(k => !k.dead && dist(k.x, k.y, p.x, p.y) < 9 + p.r)) return 'impact';
      if (this.mines.some(m => !m.dead && dist(m.x, m.y, p.x, p.y) < 5 + p.r)) return 'impact';
    }
    if (p.age % 2 === 0) {
      this.particles.push({ x: p.x, y: p.y, vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4), life: 18, max: 18, color: '#7dff5a', size: 2.5, grav: 0 });
    }
    if (p.y > WATER_Y) return 'water';
    if (p.x < -100 || p.x > WORLD_W + 100 || p.y < -500 || p.age > 400) return 'lost';
    return null;
  }

  miniPlasmaBlast(p) {
    this.explode(p.x, p.y, p.radius, p.damage, p.ownerTeam, 1, 'plasma');
    this.burst(p.x, p.y, '#7dff5a', 14);
    // each one splits into green cluster bomblets
    for (let k = 0; k < p.clusters; k++) {
      this.projectiles.push({
        weapon: 'greenlet', x: p.x, y: p.y - 4, vx: rand(-2.8, 2.8), vy: rand(-5.5, -2.5), wind: false, bounce: false,
        fuse: null, radius: p.clusterRadius, damage: p.clusterDamage, cluster: 0, ownerId: -1, ownerTeam: p.ownerTeam, age: 20, spin: 0,
      });
    }
  }

  // Robo dozer: drives along the ground (it can't fly), steered like the drone, and digs a wide tunnel through rock
  stepDozer(p) {
    p.age++;
    p.spin += 0.3;
    const t = this.terrain, R = 13;
    // steering
    const own = p.owner;
    if (own && own.alive && !own.isCPU && own === this.active) {
      const k = this.keys;
      p.heading += (((k.ArrowRight || k.KeyD) ? 1 : 0) - ((k.ArrowLeft || k.KeyA) ? 1 : 0)) * 0.035;
    } else if (own && own.isCPU) { // CPU drivers head for the nearest enemy and stop next to it
      let best = null;
      for (const e of this.chars) if (e.alive && e.team !== own.team && (!best || dist(e.x, e.y, p.x, p.y) < dist(best.x, best.y, p.x, p.y))) best = e;
      if (best) {
        const want = best.x >= p.x ? 0 : Math.PI;
        let diff = want - p.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        p.heading += clamp(diff, -0.035, 0.035);
        if (dist(best.x, best.y, p.x, p.y) < 45) p.detonate = true;
      }
    }
    if (p.detonate || p.age >= p.life) return 'boom';
    const hx = Math.cos(p.heading), hy = Math.sin(p.heading);
    const ax = p.x + hx * (R + 4), ay = p.y + hy * (R + 4);
    const rockAhead = t.isSolid(ax, ay) || t.isSolid(ax, ay - 6) || t.isSolid(ax, ay + R - 4); // blade height, top and track level
    const supported = t.isSolid(p.x, p.y + R + 1) || t.isSolid(p.x - 8, p.y + R + 1) || t.isSolid(p.x + 8, p.y + R + 1);
    if (rockAhead) { // dig: a tunnel twice the size of the pickaxe's
      if (p.age % 4 === 0) {
        // keep the tunnel floor level with the tracks so it doesn't sink when driving sideways
        t.carve(p.x + hx * (R + 6), p.y + hy * (R + 6) - (p.digR - R - 1) * Math.abs(hx), p.digR);
        for (let i = 0; i < 3; i++) {
          this.particles.push({ x: p.x + hx * R, y: p.y + hy * R, vx: rand(-2, 2) - hx, vy: rand(-3, -0.5), life: 22, max: 22, color: this.theme.burn, size: rand(2, 4), grav: 0.15 });
        }
      }
      p.x += hx * p.speed * 0.8;
      p.y += hy * p.speed * 0.8;
      p.vy = 0;
    } else if (!supported) { // no flying: fall, still rolling forward a little
      p.vy = Math.min(p.vy + GRAVITY, 9);
      p.x += hx * p.speed * 0.5;
      const ny = p.y + p.vy;
      if (t.isSolid(p.x, ny + R)) p.vy = 0; else p.y = ny;
    } else { // drive along the surface, over small bumps
      p.vy = 0;
      const nx = p.x + (hx >= 0 ? 1 : -1) * Math.max(0.4, Math.abs(hx)) * p.speed;
      let moved = false;
      for (let dy = 0; dy >= -6; dy--) if (!t.isSolid(nx + (hx >= 0 ? R : -R), p.y + dy + R - 3)) { p.x = nx; p.y += dy; moved = true; break; }
      if (moved) for (let k = 0; k < 4; k++) { if (t.isSolid(p.x, p.y + R + 1)) break; p.y++; }
    }
    // shove characters out of the way; set off mines, smash crates
    for (const c of this.chars) {
      if (!c.alive || c === own || dist(c.x, c.y, p.x, p.y) > R + CHAR_R) continue;
      c.vx += (c.x >= p.x ? 1 : -1) * 2.2; c.vy -= 1.5; c.airborne = true;
    }
    for (const m of this.mines) if (!m.dead && dist(m.x, m.y, p.x, p.y) < R + 5) this.triggerMine(m);
    for (const k of this.crates) if (!k.dead && dist(k.x, k.y, p.x, p.y) < R + 9) this.destroyCrate(k);
    if (p.age % 20 === 0) Sound.play('engine');
    if (p.y > WATER_Y) return 'water';
    if (p.x < -60 || p.x > WORLD_W + 60) return 'gone';
    return null;
  }

  dozerBoom(p) {
    for (let k = 0; k < 3; k++) { // three mini dynamites hop out first
      this.projectiles.push({
        weapon: 'minidyn', x: p.x + rand(-6, 6), y: p.y - 10, vx: rand(-3, 3), vy: rand(-5.5, -3), wind: false, bounce: true,
        fuse: randInt(70, 140), radius: p.dynRadius, damage: p.dynDamage, cluster: 0, ownerId: -1, ownerTeam: p.ownerTeam, age: 0, spin: 0,
      });
    }
    this.explode(p.x, p.y, p.radius, p.damage, p.ownerTeam, 1.3);
  }

  // Alien blaster bolt: straight through rock and bodies, burning and zapping as it goes; big blast when it runs out
  stepBlaster(p) {
    p.age++;
    for (let s = 0; s < 3; s++) {
      p.x += p.vx / 3;
      p.y += p.vy / 3;
      if (this.terrain.isSolid(p.x, p.y)) this.terrain.carve(p.x, p.y, 6);
      for (const c of this.chars) {
        if (!c.alive || p.hit.has(c) || (c === p.owner && p.age < 6)) continue;
        if (dist(c.x, c.y, p.x, p.y) > CHAR_R + 5) continue;
        p.hit.add(c);
        this.damageChar(c, Math.max(1, Math.round(p.damage)), p.vx * 0.25, -1.5, p.ownerTeam, 'plasma');
        this.spawnFire(c.x, c.y, 4, p.ownerTeam, 2);
        this.burst(c.x, c.y, '#7dff5a', 14);
      }
      for (const k of this.crates) if (!k.dead && dist(k.x, k.y, p.x, p.y) < 12) this.destroyCrate(k);
      for (const m of this.mines) if (!m.dead && dist(m.x, m.y, p.x, p.y) < 8) this.triggerMine(m);
    }
    if (p.age % 4 === 0) { // a trail of toxic plasma and fire
      this.fires.push({ x: p.x, y: p.y, vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5), life: randInt(150, 240), airborne: true,
        ownerTeam: p.ownerTeam, dmg: 1, toxic: p.age % 8 === 0, seed: Math.random() * 10 });
    }
    this.particles.push({ x: p.x, y: p.y, vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4), life: 16, max: 16, color: '#7dff5a', size: 2.5, grav: 0 });
    if (p.x < -100 || p.x > WORLD_W + 100 || p.y < -500 || p.y > WATER_Y) return 'gone';
    if (p.age >= p.life) {
      this.explode(p.x, p.y, p.radius, p.bigDamage, p.ownerTeam, 1.3, 'plasma');
      for (let k = 0; k < 18; k++) {
        const a = rand(0, Math.PI * 2), sp = rand(1, 4.5);
        this.fires.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: randInt(200, 320), airborne: true,
          ownerTeam: p.ownerTeam, dmg: 2, toxic: k % 2 === 0, seed: Math.random() * 10 });
      }
      return 'blast';
    }
    return null;
  }

  // Lava boulder: every time it hits something it explodes, sets fire around and bounces on (6 times)
  stepBoulder(p) {
    p.age++;
    p.spin += p.vx * 0.06;
    p.vy = Math.min(p.vy + GRAVITY, 12);
    if (p.cool > 0) p.cool--;
    const steps = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vy) / 2));
    for (let i = 0; i < steps; i++) {
      p.x += p.vx / steps;
      p.y += p.vy / steps;
      if (p.cool > 0) continue;
      const hitRock = this.terrain.isSolid(p.x, p.y + 6) || this.terrain.isSolid(p.x + Math.sign(p.vx) * 6, p.y);
      const hitChar = this.chars.some(c => c.alive && (c !== p.owner || p.age > 15) && dist(c.x, c.y, p.x, p.y) < CHAR_R + 7);
      const hitThing = this.crates.some(k => !k.dead && dist(k.x, k.y, p.x, p.y) < 15) || this.mines.some(m => !m.dead && dist(m.x, m.y, p.x, p.y) < 10);
      if (hitRock || hitChar || hitThing) {
        this.explode(p.x, p.y, p.radius, p.damage, p.ownerTeam, p.blastKnock, 'fire');
        for (let k = 0; k < 16; k++) {
          const a = rand(Math.PI * 1.05, Math.PI * 1.95), sp = rand(1, 4.5);
          this.fires.push({ x: p.x + rand(-8, 8), y: p.y - 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: randInt(200, 320),
            airborne: true, ownerTeam: p.ownerTeam, dmg: 2, seed: Math.random() * 10 });
        }
        if (--p.bouncesLeft <= 0) return 'done';
        // spring back up out of the new crater and keep rolling the same way
        p.vy = -Math.max(4.5, Math.abs(p.vy) * 0.7);
        p.vx = (Math.abs(p.vx) < 1.2 ? Math.sign(p.vx || 1) * 1.8 : p.vx * 0.85);
        p.cool = 8;
        Sound.play('thud');
        break;
      }
    }
    if (p.age % 2 === 0) {
      this.particles.push({ x: p.x, y: p.y, vx: rand(-0.4, 0.4), vy: rand(-0.6, 0), life: 22, max: 22, color: Math.random() < 0.5 ? '#ff6a00' : '#ffb347', size: rand(2, 3.5), grav: -0.02 });
    }
    if (p.y > WATER_Y) return 'water';
    if (p.x < -100 || p.x > WORLD_W + 100 || p.age > 1500) return 'lost';
    return null;
  }

  // Boomerang: flies out, curves back to the thrower; hits each character once with a big knock
  stepBoomerang(p) {
    p.age++;
    p.spin += 0.55;
    p.vx += p.bx * 0.16;
    p.vy += p.by * 0.16;
    for (let s = 0; s < 2; s++) {
      p.x += p.vx / 2;
      p.y += p.vy / 2;
      if (this.terrain.isSolid(p.x, p.y)) { this.burst(p.x, p.y, this.theme.burn, 6); return 'drop'; }
      for (const c of this.chars) {
        if (!c.alive || p.hit.has(c)) continue;
        const d = dist(c.x, c.y, p.x, p.y);
        if (c === p.owner) { if (p.age > 40 && d < CHAR_R + 6) { this.texts.push({ x: c.x, y: c.y - 40, text: 'Caught!', color: '#fff', life: 50 }); return 'caught'; } continue; }
        if (d > CHAR_R + p.radius * 0.6) continue;
        if (c.team === p.ownerTeam && !this.friendlyFire) continue;
        p.hit.add(c);
        const sp = Math.hypot(p.vx, p.vy) || 1;
        c.y -= 2;
        this.damageChar(c, Math.max(1, Math.round(p.damage)), p.vx / sp * p.knock, p.vy / sp * p.knock - 3, p.ownerTeam);
        this.burst(c.x, c.y, '#fff', 10);
        Sound.play('bat');
      }
      for (const k of this.crates) if (!k.dead && dist(k.x, k.y, p.x, p.y) < 12) this.destroyCrate(k);
      for (const m of this.mines) if (!m.dead && dist(m.x, m.y, p.x, p.y) < 8) this.triggerMine(m);
    }
    if (p.y > WATER_Y) { this.splash(p.x); return 'water'; }
    if (p.x < -200 || p.x > WORLD_W + 200 || p.y < -600 || p.age > 400) return 'lost';
    return null;
  }

  // Lava anvil: falls, then melts its way down through rock leaving fire behind, and blows up at the end
  stepAnvil(p) {
    p.age++;
    const t = this.terrain;
    if (!p.melting) p.vy = Math.min(p.vy + GRAVITY, 10);
    const steps = Math.max(1, Math.ceil(p.vy / 2));
    for (let i = 0; i < steps; i++) {
      p.y += p.vy / steps;
      if (this.chars.some(c => c.alive && dist(c.x, c.y, p.x, p.y) < CHAR_R + 12)) return 'impact';
      const rock = t.isSolid(p.x, p.y + 9) || t.isSolid(p.x - 8, p.y + 9) || t.isSolid(p.x + 8, p.y + 9);
      if (rock && !p.melting) { p.melting = true; p.vy = 2.4; Sound.play('dig'); }
      if (p.melting && !rock && !t.isSolid(p.x, p.y + 20)) { p.melting = false; } // fell into a cave: drop again
    }
    if (p.melting) {
      p.drilled += p.vy;
      if (p.age % 3 === 0) t.carve(p.x, p.y + 6, 13);
      if (p.age % 8 === 0) {
        for (const side of [-1, 1]) {
          this.fires.push({ x: p.x + side * 10, y: p.y, vx: side * rand(0.3, 1.3), vy: rand(-1.5, -0.3), life: randInt(150, 240),
            airborne: true, ownerTeam: p.ownerTeam, dmg: 1, seed: Math.random() * 10 });
        }
      }
      if (p.drilled > 220) return 'impact';
    }
    if (p.y > WATER_Y) return 'water';
    if (p.y > WORLD_H + 40) return 'lost';
    return null;
  }

  // Mine mouse: scurries along the ground dropping mines, then bursts into pellets
  stepMouse(p) {
    p.age++;
    const t = this.terrain, foot = 5;
    if (t.isSolid(p.x, p.y + foot + 1) && p.vy >= 0) {
      p.vy = 0;
      const nx = p.x + p.dir * 1.3;
      let moved = false;
      for (let dy = 0; dy >= -7; dy--) {
        if (!t.isSolid(nx, p.y + dy) && !t.isSolid(nx + p.dir * 4, p.y + dy - 3)) { p.x = nx; p.y += dy; moved = true; break; }
      }
      if (!moved || nx < 10 || nx > WORLD_W - 10) p.dir = -p.dir;
      for (let k = 0; k < 6; k++) { if (t.isSolid(p.x, p.y + foot + 1)) break; p.y++; }
    } else {
      p.vy = Math.min(p.vy + GRAVITY, 9);
      const ny = p.y + p.vy;
      if (t.isSolid(p.x, ny + foot)) { p.vy = 0; } else p.y = ny;
    }
    p.spin += 0.4;
    if (p.age >= p.dropStart && (p.age - p.dropStart) % p.dropEvery === 0 && p.age < p.life) {
      this.mines.push(this.makeMine(p.x, p.y + 1, p.ownerTeam, 60));
      Sound.play('squeak');
    }
    if (p.y > WATER_Y) return 'water';
    if (p.age >= p.life) return 'burst';
    return null;
  }

  mouseBurst(p) {
    this.explode(p.x, p.y, p.radius, p.damage, p.ownerTeam);
    const pellet = { range: 320, damage: 8, radius: 4, knock: 1.2 };
    for (let i = 0; i < p.pellets; i++) {
      const a = (i / p.pellets) * Math.PI * 2 + rand(-0.08, 0.08);
      this.shootRay(p.x, p.y - 2, Math.cos(a), Math.sin(a), pellet, 1, p.ownerTeam, -1, 4);
    }
    Sound.play('shot');
  }

  // First solid ground at or below (x, y); the water line if there is none
  groundBelow(x, y) {
    for (let yy = Math.max(0, Math.floor(y)); yy < WATER_Y; yy += 2) if (this.terrain.isSolid(x, yy)) return yy;
    return WATER_Y;
  }

  // Tornado: travels along the ground, grows, sucks up characters and mines, spins them to the top and flings them
  stepTornado(p) {
    p.age++;
    p.r = 12 + (p.maxR - 12) * Math.min(1, p.age / 180);
    const H = p.r * 4;
    // move along the ground; turn back at walls it can't climb
    p.x += p.dir * p.speed + this.wind * 0.35;
    const gy = this.groundBelow(p.x, p.y - 50);
    if (gy < p.y - 45) { p.dir = -p.dir; p.x += p.dir * p.speed * 2; } else p.y = gy;
    if (p.age % 50 === 0) Sound.play('wind');
    if (p.age % 2 === 0) {
      this.particles.push({ x: p.x + rand(-p.r * 0.4, p.r * 0.4), y: p.y - 2, vx: rand(-2, 2), vy: rand(-3, -1), life: 30, max: 30, color: this.theme.burn, size: rand(2, 3.5), grav: 0.05 });
    }

    // pull in whatever is close to the funnel
    const inside = o => Math.abs(o.x - p.x) < p.r * 0.6 + CHAR_R && p.y - o.y > -15 && p.y - o.y < H;
    for (const c of this.chars) {
      if (!c.alive || c.inTornado || (p.recent.get(c) || 0) > p.age) continue;
      if (c === p.owner && p.age < 60) continue;
      if (c.team === p.ownerTeam && !this.friendlyFire) continue;
      if (!inside(c)) continue;
      if (c === this.active) { this.releaseRope(); this.jet = null; }
      c.inTornado = true; c.chute = false; c.tornadoFlung = false;
      p.caught.push({ o: c, ang: rand(0, Math.PI * 2), h: Math.max(0, p.y - c.y - CHAR_R) });
    }
    for (const m of this.mines) {
      if (m.dead || m.inTornado || (p.recent.get(m) || 0) > p.age || !inside(m)) continue;
      m.inTornado = true;
      p.caught.push({ o: m, kind: 'mine', ang: rand(0, Math.PI * 2), h: Math.max(0, p.y - m.y) });
    }
    for (const k of this.crates) {
      if (k.dead || k.inTornado || !inside(k)) continue;
      k.inTornado = true; k.chute = false;
      p.caught.push({ o: k, kind: 'crate', ang: rand(0, Math.PI * 2), h: Math.max(0, p.y - k.y - 9) });
    }

    // spin everything caught up the funnel and throw it out at the top
    for (const e of p.caught.slice()) {
      const o = e.o;
      if (o.dead || o.alive === false) { o.inTornado = false; p.caught.splice(p.caught.indexOf(e), 1); continue; }
      e.h += 2.4;
      e.ang += 0.28;
      const rr = p.r * (0.3 + 0.6 * Math.min(1, e.h / H));
      o.x = p.x + Math.cos(e.ang) * rr;
      o.y = p.y - e.h - (e.kind === 'crate' ? 9 : e.kind === 'mine' ? 4 : CHAR_R);
      o.vx = 0; o.vy = 0; o.airborne = true;
      if (e.h >= H) this.flingFromTornado(p, e, true);
    }
    if (p.x < -60 || p.x > WORLD_W + 60) return true;
    return p.age >= p.life;
  }

  flingFromTornado(p, e, hard) {
    const o = e.o;
    o.inTornado = false;
    p.caught.splice(p.caught.indexOf(e), 1);
    p.recent.set(o, p.age + 120); // can't be sucked straight back in
    o.airborne = true;
    if (e.kind !== 'crate' && e.kind !== 'mine') o.tornadoFlung = true; // takes fall damage when it lands
    if (!hard) { o.vx = rand(-1, 1); o.vy = 0; return; }
    // crates and mines come out of the top in pieces
    if (e.kind === 'crate') { this.destroyCrate(o); return; }
    if (e.kind === 'mine') { o.dead = true; this.explode(o.x, o.y, o.radius, o.damage, o.ownerTeam); return; }
    if (o.alive) this.damageChar(o, Math.max(1, Math.round(p.damage)), 0, 0, -1);
    const dir = Math.random() < 0.5 ? -1 : 1;
    o.vx = dir * rand(6, 10);
    o.vy = -rand(3, 7);
    Sound.play('whoosh');
  }

  endTornado(p) {
    for (const e of p.caught.slice()) this.flingFromTornado(p, e, false);
  }

  // Drone: flies forward under remote control for a few seconds, then drops; blows up on contact
  stepDrone(p) {
    p.age++;
    p.spin += 0.9;
    if (p.ctrl > 0) {
      p.ctrl--;
      let turn = 0;
      const own = p.owner;
      if (own && own.alive && !own.isCPU && own === this.active) {
        const k = this.keys;
        turn = ((k.ArrowRight || k.KeyD) ? 1 : 0) - ((k.ArrowLeft || k.KeyA) ? 1 : 0);
      } else if (own && own.isCPU) {
        // CPU pilots home in on the nearest enemy
        let best = null;
        for (const e of this.chars) if (e.alive && e.team !== own.team && (!best || dist(e.x, e.y, p.x, p.y) < dist(best.x, best.y, p.x, p.y))) best = e;
        if (best) {
          let diff = Math.atan2(best.y - p.y, best.x - p.x) - p.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          turn = clamp(diff / 0.06, -1, 1);
        }
      }
      p.heading += turn * 0.06;
      p.vx = Math.cos(p.heading) * p.speed;
      p.vy = Math.sin(p.heading) * p.speed;
      if (p.age % 18 === 0) Sound.play('drone');
    } else {
      p.vy = Math.min(p.vy + GRAVITY, 10);
      p.heading = Math.atan2(p.vy, p.vx);
    }
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) / 2));
    for (let i = 0; i < steps; i++) {
      p.x += p.vx / steps;
      p.y += p.vy / steps;
      if (this.terrain.isSolid(p.x, p.y)) return 'impact';
      for (const c of this.chars) {
        if (!c.alive || (c === p.owner && p.age < 25)) continue;
        if (dist(c.x, c.y, p.x, p.y) < CHAR_R + 5) return 'impact';
      }
    }
    if (p.y > WATER_Y) return 'water';
    if (p.x < -100 || p.x > WORLD_W + 100 || p.y < -600) return 'lost';
    return null;
  }

  // Robot frog: hops along the ground, turns at walls, explodes on its timer or next to an enemy
  stepWalker(p) {
    const t = this.terrain;
    const foot = p.foot || 6;
    p.age++;
    p.fuse--;
    const grounded = t.isSolid(p.x, p.y + foot);
    if (grounded && p.vy >= 0) {
      p.vx = 0; p.vy = 0;
      if (++p.hop >= (p.baby ? 14 : 26)) {
        p.hop = 0;
        if (p.baby) p.dir = Math.random() < 0.5 ? -1 : 1; // babies bounce around at random
        p.vy = p.baby ? -rand(2.8, 4.2) : -4.4;
        p.vx = p.dir * (p.baby ? rand(1, 2.2) : 1.9);
        p.y -= 1;
        if (!p.baby && p.age % 3 === 0) Sound.play('croak');
      }
    } else {
      p.vy = Math.min(p.vy + GRAVITY, 10);
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) / 2));
      for (let i = 0; i < steps; i++) {
        const nx = p.x + p.vx / steps;
        if (t.isSolid(nx + p.dir * (foot * 0.7), p.y)) { p.dir = -p.dir; p.vx = -p.vx * 0.4; } else p.x = nx;
        const ny = p.y + p.vy / steps;
        if (t.isSolid(p.x, ny + foot)) { p.vy = 0; break; }
        if (t.isSolid(p.x, ny - foot)) { p.vy = 0.5; continue; }
        p.y = ny;
      }
    }
    if (!p.baby) {
      for (const c of this.chars) {
        if (c.alive && c.team !== p.ownerTeam && dist(c.x, c.y, p.x, p.y) < CHAR_R + foot + 2) return 'impact';
      }
    }
    if (p.y > WATER_Y) return 'water';
    if (p.x < -60 || p.x > WORLD_W + 60) return 'lost';
    if (p.fuse <= 0) return 'fuse';
    return null;
  }

  // Napalm flames: fall, stick to the ground, burn whoever stands in them
  spawnFire(x, y, n, ownerTeam, dmg) {
    for (let i = 0; i < n; i++) {
      this.fires.push({ x: x + rand(-6, 6), y, vx: rand(-2.6, 2.6), vy: rand(-3.5, -0.8), life: randInt(210, 300), airborne: true, ownerTeam, dmg, seed: Math.random() * 10 });
    }
  }

  updateFires() {
    const t = this.terrain;
    for (const f of this.fires) {
      if (f.jet) {
        f.vy += 0.05;
        const nx = f.x + f.vx, ny = f.y + f.vy;
        if (t.isSolid(nx, ny)) {
          if (Math.random() < 0.2) t.carve(nx, ny, 4);
          // some of the flames stick and keep burning for a moment
          if (Math.random() < 0.25) { f.jet = false; f.airborne = true; f.vx = 0; f.vy = 0; f.life = randInt(60, 100); }
          else f.life = 0;
        } else { f.x = nx; f.y = ny; }
        for (const m of this.mines) if (!m.dead && dist(m.x, m.y, f.x, f.y) < 8) this.triggerMine(m);
        for (const k of this.crates) if (!k.dead && dist(k.x, k.y, f.x, f.y) < 11) this.destroyCrate(k);
        f.life--;
        if (f.y > WATER_Y) f.life = 0;
        continue;
      }
      if (!f.airborne && !t.isSolid(f.x, f.y + 3)) f.airborne = true;
      if (f.airborne) {
        f.vy = Math.min(f.vy + 0.15, 6);
        f.x += f.vx;
        if (t.isSolid(f.x, f.y + f.vy + 3)) { f.airborne = false; f.vx = 0; f.vy = 0; } else f.y += f.vy;
      }
      f.life--;
      if (f.y > WATER_Y || f.x < -20 || f.x > WORLD_W + 20) f.life = 0;
      if (f.life % 45 === 0) t.carve(f.x, f.y + 2, 3);
    }
    this.fires = this.fires.filter(f => f.life > 0);
    if (this.tick % 10 !== 0 || !this.fires.length) return;
    for (const c of this.chars) {
      if (!c.alive) continue;
      const f = this.fires.find(f => (f.jet ? dist(f.x, f.y, c.x, c.y) < CHAR_R + 5 : dist(f.x, f.y, c.x, c.y + CHAR_R - 4) < 13) &&
        (c.team !== f.ownerTeam || this.friendlyFire));
      if (!f || c.suit) continue;
      if (f.jet) { // the flamethrower stream pushes a little
        c.vx = clamp(c.vx + Math.sign(f.vx || 1) * 0.9, -4, 4);
        c.vy = Math.min(c.vy, 0) - 0.7;
        c.airborne = true;
      }
      const got = this.hurt(c, Math.max(1, Math.round(f.dmg)));
      c.burnShown = (c.burnShown || 0) + got;
      if (c.burnShown >= 6) {
        this.texts.push({ x: c.x, y: c.y - 30, text: `-${c.burnShown}`, color: '#ff8a3d', life: 50 });
        c.burnShown = 0;
      }
      if (c.hp <= 0) this.kill(c, false);
    }
  }

  worldIsCalm() {
    return this.projectiles.length === 0 && this.fires.length === 0 && this.deathBlasts.length === 0 &&
      this.crates.every(k => !k.airborne) &&
      this.chars.every(c => !(c.alive || c.grave) || !c.airborne) &&
      this.mines.every(m => m.fuse == null && !m.airborne);
  }

  update() {
    this.tick++;
    this.updateRope();
    for (const c of this.chars) this.updateChar(c);
    this.updateProjectiles();
    for (const m of this.mines) if (!m.dead) this.updateMine(m);
    if (this.mines.some(m => m.dead)) this.mines = this.mines.filter(m => !m.dead);
    for (const b of this.deathBlasts.slice()) {
      if (--b.t > 0) continue;
      if (b.crate) this.crateBlast(b.x, b.y, b.type);
      else this.explode(b.c.x, b.c.y, DEATH_BLAST.radius, DEATH_BLAST.damage, -1);
    }
    if (this.deathBlasts.length) this.deathBlasts = this.deathBlasts.filter(b => b.t > 0);
    for (const sm of this.smokes) sm.age++;
    this.updateGas();
    for (const k of this.crates) if (!k.dead) this.updateCrate(k);
    if (this.crates.some(k => k.dead)) this.crates = this.crates.filter(k => !k.dead);
    this.updateFires();

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
    if (this.focus && --this.focus.t <= 0) this.focus = null;

    switch (this.state) {
      case 'banner':
        if (--this.bannerTimer <= 0) this.state = 'turn';
        break;

      case 'turn': {
        const c = this.active;
        if (!c.alive) { this.endTurn(); break; }
        if (this.dazedNow) c.aim = clamp(c.aim + Math.cos(this.tick * 0.07) * 1.3, -85, 85); // can't hold the aim steady
        if (this.ai) this.ai.update();
        else this.handleHeldKeys();

        if (this.gunBurst && c.alive && this.gunBurst.w.kind === 'flame') {
          const b = this.gunBurst;
          for (let i = 0; i < 2; i++) {
            const a = (c.aim + rand(-b.w.spread, b.w.spread)) * Math.PI / 180;
            const dx = Math.cos(a) * c.facing, dy = -Math.sin(a), sp = rand(5, 7);
            this.fires.push({ jet: true, x: c.x + dx * 14, y: c.y + dy * 14, vx: dx * sp, vy: dy * sp, life: randInt(26, 34),
              airborne: true, ownerTeam: c.team, dmg: b.w.damage * b.mult, seed: Math.random() * 10 });
          }
          if (b.t++ % 6 === 0) Sound.play('flame');
          if (--b.left <= 0) this.gunBurst = null;
        } else if (this.gunBurst && c.alive) {
          const b = this.gunBurst;
          if (b.t++ % 3 === 0) {
            const a = (c.aim + rand(-b.w.spread, b.w.spread)) * Math.PI / 180;
            this.fireBullet(c, Math.cos(a) * c.facing, -Math.sin(a), b.w, b.mult);
            Sound.play('bullet');
            if (--b.left <= 0) this.gunBurst = null;
          }
        }

        const waiting = this.hasFired && (this.projectiles.length > 0 || !!this.gunBurst);
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
        if ((this.worldIsCalm() && this.settleTimer > 40) || this.settleTimer > 60 * 15) {
          if (this.dropPending && this.aliveTeams().length > 1 && this.crates.length < 25) {
            this.dropPending = false;
            this.dropCrates();
            this.settleTimer = 0;
            break;
          }
          this.projectiles.length = 0;
          this.fires.length = 0;
          this.nextTurn();
        }
        break;
    }
    this.updateCamera();

    const skip = !this.over && !this.chars.some(c => c.alive && !c.isCPU) && this.aliveTeams().length > 1;
    if (skip !== this.skipAvailable) {
      this.skipAvailable = skip;
      this.hooks.onSkipAvailable && this.hooks.onSkipAvailable(skip);
    }
  }

  // --- camera ------------------------------------------------------------------

  cameraTarget() {
    if (this.camManual) return null;
    if (this.projectiles.length) return this.projectiles[0];
    const m = this.mines.find(x => x.fuse != null);
    if (m) return m;
    const k = this.crates.find(x => x.chute && x.airborne);
    if (k) return k;
    if (this.focus) return this.focus;
    const c = this.active;
    if (c && c.alive && this.state === 'turn' && WEAPON[c.weapon].scope && !this.hasFired) {
      const p = this.scopePoint(c);
      return { x: c.x * 0.35 + p.x * 0.65, y: c.y * 0.35 + p.y * 0.65 };
    }
    if (this.active && this.active.alive) return this.active;
    return null;
  }

  scopePoint(c) {
    const { dx, dy } = c.aimVector();
    return traceRay(this.env, c.x, c.y, dx, dy, WEAPON[c.weapon].range, c.id);
  }

  updateCamera() {
    const t = this.cameraTarget();
    if (t) {
      const k = this.snapCamera ? 1 : 0.08;
      this.cam.x += (t.x - this.cam.x) * k;
      this.cam.y += (t.y - 40 / this.zoom - this.cam.y) * k;
      this.snapCamera = false;
    }
    this.clampCamera();
  }

  clampCamera() {
    const hw = this.viewW / (2 * this.zoom), hh = this.viewH / (2 * this.zoom);
    this.cam.x = hw * 2 >= WORLD_W ? WORLD_W / 2 : clamp(this.cam.x, hw, WORLD_W - hw);
    const minY = -400 + hh, maxY = WORLD_H - hh;
    this.cam.y = minY > maxY ? maxY : clamp(this.cam.y, minY, maxY);
  }

  screenToWorld(sx, sy) {
    return { x: this.cam.x + (sx - this.viewW / 2) / this.zoom, y: this.cam.y + (sy - this.viewH / 2) / this.zoom };
  }

  worldToScreen(x, y) {
    return { x: (x - this.cam.x) * this.zoom + this.viewW / 2, y: (y - this.cam.y) * this.zoom + this.viewH / 2 };
  }

  setZoom(z, sx = this.viewW / 2, sy = this.viewH / 2) {
    const before = this.screenToWorld(sx, sy);
    this.zoom = clamp(z, this.minZoom, this.maxZoom);
    const after = this.screenToWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCamera();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.viewW = Math.max(1, r.width);
    this.viewH = Math.max(1, r.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
    this.minZoom = Math.min(this.viewW / WORLD_W, this.viewH / WORLD_H);
    this.maxZoom = 2.5;
    // Show roughly the same amount of battlefield on every screen (phones zoom in more)
    const preferred = clamp(Math.sqrt(this.viewW * this.viewH / (1150 * 650)), Math.max(this.minZoom, 0.6), 1.3);
    this.zoom = this.zoom ? clamp(this.zoom, this.minZoom, this.maxZoom) : preferred;
    this.ui = clamp(Math.min(this.viewW / 1300, this.viewH / 760), 0.55, 1);
    this.skyGradient = null;
    this.clampCamera();
  }

  // --- input -------------------------------------------------------------------

  handleHeldKeys() {
    const c = this.active;
    const k = this.keys;
    const left = k.ArrowLeft || k.KeyA, right = k.ArrowRight || k.KeyD;
    const up = k.ArrowUp || k.KeyW, down = k.ArrowDown || k.KeyS;
    if (this.rope && this.rope.state === 'attached') {
      this.ropeSwing = (right ? 1 : 0) - (left ? 1 : 0);
      this.ropeReel = (down ? 1 : 0) - (up ? 1 : 0);
      if (left || right || up || down) this.camManual = false;
      return;
    }
    if (this.projectiles.some(p => (p.drone && p.ctrl > 0 || p.dozer) && p.owner === c)) return; // arrows steer the drone / dozer
    if (this.jet) {
      const j = this.jet;
      const grounded = !c.airborne;
      j.ty = up ? -0.4 : 0;
      j.tx = 0;
      if (left && !right) { c.facing = -1; if (!grounded || up) j.tx = -0.22; else this.walk(c, -1); }
      else if (right && !left) { c.facing = 1; if (!grounded || up) j.tx = 0.22; else this.walk(c, 1); }
      if (down) c.aim = Math.max(-85, c.aim - 1.2);
      if (left || right || up) this.camManual = false;
      if (this.charging) {
        this.chargePower += 1 / CHARGE_TICKS;
        if (this.chargePower >= 1) this.fire(1);
      }
      return;
    }
    if (c.chute && c.airborne) {
      this.chuteSteer = (right ? 1 : 0) - (left ? 1 : 0);
      if (right) c.facing = 1; else if (left) c.facing = -1;
    }
    if (this.digging) {
      if (left && !right) c.facing = -1; else if (right && !left) c.facing = 1;
      if (up) c.aim = Math.min(85, c.aim + 1.2);
      if (down) c.aim = Math.max(-85, c.aim - 1.2);
      this.dig(c);
      return;
    }
    if (!this.charging && !this.rope) {
      if (left && !right) { this.walk(c, -1); this.camManual = false; }
      else if (right && !left) { this.walk(c, 1); this.camManual = false; }
    }
    const aimSpeed = WEAPON[c.weapon].scope ? 0.3 : 1.2;
    if (up) c.aim = Math.min(85, c.aim + aimSpeed);
    if (down) c.aim = Math.max(-85, c.aim - aimSpeed);
    if (this.charging) {
      this.chargePower += 1 / CHARGE_TICKS;
      if (this.chargePower >= 1) this.fire(1);
    }
  }

  // Shared by keyboard and on-screen touch buttons
  press(code, shift = false) {
    Sound.init();
    if (code === 'Escape' || code === 'KeyP') {
      if (!this.over) this.setPaused(!this.paused);
      return;
    }
    if (code === 'KeyM') { Sound.muted = !Sound.muted; return; }
    if (code === 'Equal' || code === 'NumpadAdd') { this.setZoom(this.zoom * 1.15); return; }
    if (code === 'Minus' || code === 'NumpadSubtract') { this.setZoom(this.zoom / 1.15); return; }
    if (code === 'KeyC') { this.camManual = false; return; }
    if (code === 'KeyF' || code === 'KeyR') { this.cycleOption(); return; }
    this.keys[code] = true;
    if (this.paused) return;
    if (!this.isHumanTurn() && !(this.state === 'banner' && !this.active.isCPU)) return;

    const c = this.active;
    const digit = code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : null;
    if (digit && /^\d$/.test(digit)) {
      const w = WEAPONS.find(x => x.key === digit);
      if (w) this.selectWeapon(w.id);
      return;
    }
    const letterWeapon = code.startsWith('Key') && WEAPONS.find(x => x.key === code.slice(3));
    if (letterWeapon) { this.selectWeapon(letterWeapon.id); return; }
    if (code === 'Tab') {
      const team = this.teams[c.team];
      const avail = WEAPONS.filter(w => team.ammo[w.id] > 0);
      const idx = avail.findIndex(w => w.id === c.weapon);
      this.selectWeapon(avail[(idx + (shift ? -1 : 1) + avail.length) % avail.length].id);
      return;
    }
    if (this.state !== 'turn') return;
    if (code === 'Enter' || code === 'Backspace') {
      this.camManual = false;
      if (this.rope && this.rope.state === 'attached') this.releaseRope();
      else this.jump(c, code === 'Backspace');
    }
    if (code === 'Space') this.trigger();
  }

  release(code) {
    this.keys[code] = false;
    if (code === 'Space') this.digging = false;
    if (code === 'Space' && this.charging && this.isHumanTurn() && !this.paused) this.fire(this.chargePower);
  }

  bindInput() {
    this._onKeyDown = e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.press(e.code, e.shiftKey);
    };
    this._onKeyUp = e => this.release(e.code);
    this._onBlur = () => { for (const k of Object.keys(this.keys)) if (this.keys[k]) this.release(k); };

    this._onPointerDown = e => {
      Sound.init();
      if (e.pointerType === 'touch') this.isTouch = true;
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: this.zoom };
        a.moved = b.moved = true;
      }
    };
    this._onPointerMove = e => {
      const w = this.toWorld(e);
      this.mouse.x = w.x; this.mouse.y = w.y; this.mouse.inside = true;
      const ptr = this.pointers.get(e.pointerId);
      if (!ptr) return;
      const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
      ptr.x = e.clientX; ptr.y = e.clientY;
      if (this.pointers.size >= 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const r = this.canvas.getBoundingClientRect();
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.setZoom(this.pinch.zoom * d / this.pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        return;
      }
      if (!ptr.moved && Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) > 10) ptr.moved = true;
      if (ptr.moved) {
        this.cam.x -= dx / this.zoom;
        this.cam.y -= dy / this.zoom;
        this.camManual = true;
        this.clampCamera();
      }
    };
    this._onPointerUp = e => {
      const ptr = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (ptr && !ptr.moved && e.type === 'pointerup') this.tap(this.toWorld(e));
    };
    this._onPointerLeave = e => { if (e.pointerType === 'mouse') this.mouse.inside = false; };
    this._onWheel = e => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      this.setZoom(this.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top);
    };
    this._onResize = () => this.resize();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('resize', this._onResize);
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('pointercancel', this._onPointerUp);
    this.canvas.addEventListener('pointerleave', this._onPointerLeave);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  tap(p) {
    if (!this.isHumanTurn() || this.paused) return;
    if (WEAPON[this.active.weapon].kind === 'target') this.fireAt(p.x, p.y);
  }

  toWorld(e) {
    const r = this.canvas.getBoundingClientRect();
    return this.screenToWorld(e.clientX - r.left, e.clientY - r.top);
  }

  setPaused(p) {
    this.paused = p;
    this.charging = false;
    this.keys = {};
    this.hooks.onPause && this.hooks.onPause(p);
  }

  destroy() {
    this.destroyed = true;
    Sound.quiet = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    this.canvas.removeEventListener('pointercancel', this._onPointerUp);
    this.canvas.removeEventListener('pointerleave', this._onPointerLeave);
    this.canvas.removeEventListener('wheel', this._onWheel);
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
      if (this.fastForward && !this.paused) {
        const t0 = performance.now();
        while (!this.over && performance.now() - t0 < 24) this.update();
      }
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // --- rendering ---------------------------------------------------------------

  render() {
    const ctx = this.ctx, dpr = this.dpr, z = this.zoom;
    const { viewW, viewH } = this;

    // sky (screen space)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.skyGradient) {
      this.skyGradient = ctx.createLinearGradient(0, 0, 0, viewH);
      this.skyGradient.addColorStop(0, this.theme.skyTop);
      this.skyGradient.addColorStop(1, this.theme.skyBottom);
    }
    ctx.fillStyle = this.skyGradient;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.fillStyle = this.theme.sun || 'rgba(255,255,230,0.55)';
    ctx.beginPath();
    ctx.arc(viewW * 0.72, Math.min(110, viewH * 0.15), 40, 0, Math.PI * 2);
    ctx.fill();

    // world
    const left = this.cam.x - viewW / (2 * z), top = this.cam.y - viewH / (2 * z);
    this.viewLeft = left;
    this.viewRight = left + viewW / z;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, -left * z * dpr, -top * z * dpr);
    ctx.drawImage(this.background, 0, 0);
    this.drawClouds(ctx);
    ctx.drawImage(this.terrain.backdrop, 0, 0);
    ctx.drawImage(this.terrain.canvas, 0, 0);

    for (const c of this.chars) if (!c.alive && c.grave) this.drawGrave(ctx, c);
    for (const m of this.mines) this.drawMine(ctx, m);
    for (const k of this.crates) this.drawCrate(ctx, k);
    for (const p of this.projectiles) this.drawProjectile(ctx, p);
    this.drawRope(ctx);
    this.drawSmoke(ctx);
    this.drawGas(ctx);
    for (const c of this.chars) if (c.alive && this.visibleChar(c)) this.drawChar(ctx, c);
    if (this.state === 'turn' && this.active.alive && !this.hasFired) this.drawAim(ctx, this.active);

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const e of this.effects) this.drawEffect(ctx, e);
    this.drawWater(ctx);
    this.drawFires(ctx);
    this.drawTargetCursor(ctx);

    // labels (screen space so they stay readable at any zoom)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawLabels(ctx);
    for (const t of this.texts) {
      const s = this.worldToScreen(t.x, t.y);
      ctx.globalAlpha = Math.min(1, t.life / 30);
      this.outlinedText(ctx, t.text, s.x, s.y, 'bold 16px system-ui, sans-serif', t.color);
    }
    ctx.globalAlpha = 1;

    this.drawAmbient(ctx);
    const flash = this.effects.find(e => e.type === 'flash' && !e.whiteout);
    if (flash) {
      const a = flash.whiteout ? Math.min(1, (flash.life / flash.max) * 1.8) : (flash.life / flash.max) * 0.85;
      ctx.fillStyle = flash.whiteout ? `rgba(255,255,255,${a})` : `rgba(255,250,225,${a})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }

    // HUD (scaled for small screens)
    const u = this.ui;
    ctx.setTransform(dpr * u, 0, 0, dpr * u, 0, 0);
    this.drawHUD(ctx, viewW / u, viewH / u);
    if (this.state === 'banner') this.drawBanner(ctx, viewW / u);

    // Wearing the hazmat suit: you only see through the two lenses of the gas mask
    if (this.active && this.active.suit && !this.active.isCPU && (this.state === 'turn' || this.state === 'banner')) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const W = this.canvas.width, H = this.canvas.height;
      if (!this.maskCanvas || this.maskCanvas.width !== W || this.maskCanvas.height !== H) {
        this.maskCanvas = document.createElement('canvas');
        this.maskCanvas.width = W;
        this.maskCanvas.height = H;
      }
      const m = this.maskCanvas.getContext('2d');
      const R = Math.min(W, H) * 0.36, cy = H * 0.48, off = R * 0.82;
      m.globalCompositeOperation = 'source-over';
      m.clearRect(0, 0, W, H);
      m.fillStyle = 'rgba(12,14,10,0.94)';
      m.fillRect(0, 0, W, H);
      m.globalCompositeOperation = 'destination-out';
      for (const sx of [-off, off]) { m.beginPath(); m.arc(W / 2 + sx, cy, R, 0, Math.PI * 2); m.fill(); }
      m.globalCompositeOperation = 'source-over';
      m.fillStyle = 'rgba(255,225,120,0.07)'; // slightly yellow visor
      for (const sx of [-off, off]) { m.beginPath(); m.arc(W / 2 + sx, cy, R, 0, Math.PI * 2); m.fill(); }
      m.strokeStyle = '#3a3f47';
      m.lineWidth = 8 * dpr;
      for (const sx of [-off, off]) { m.beginPath(); m.arc(W / 2 + sx, cy, R, 0, Math.PI * 2); m.stroke(); }
      ctx.drawImage(this.maskCanvas, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Dazed by a flashbang: the screen keeps washing out white during your turn
    if (this.dazedNow && this.active && !this.active.isCPU && (this.state === 'turn' || this.state === 'banner')) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const pulse = 0.5 + 0.5 * Math.sin(this.tick * 0.12);
      const g = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.15, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.7);
      g.addColorStop(0, `rgba(255,255,255,${0.25 + 0.35 * pulse})`);
      g.addColorStop(1, `rgba(255,255,255,${0.55 + 0.35 * pulse})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, viewW, viewH);
    }

    // Star Cannon detonation: the whole screen goes white, HUD included
    const white = this.effects.find(e => e.type === 'flash' && e.whiteout);
    if (white) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (white.life / white.max) * 1.8)})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  drawClouds(ctx) {
    ctx.fillStyle = this.theme.cloud || 'rgba(255,255,255,0.7)';
    for (const c of this.clouds) {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 50 * c.s, 16 * c.s, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + 26 * c.s, c.y - 10 * c.s, 30 * c.s, 16 * c.s, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x - 24 * c.s, c.y - 6 * c.s, 24 * c.s, 12 * c.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  waveY(x) {
    const t = this.tick * 0.05;
    return WATER_Y + Math.sin(x * 0.03 + t) * 3 + Math.sin(x * 0.011 - t * 0.7) * 2;
  }

  drawWater(ctx) {
    const x0 = Math.floor((this.viewLeft - 20) / 10) * 10, x1 = this.viewRight + 20;
    const bottom = WORLD_H + 2000;
    ctx.fillStyle = this.theme.water;
    ctx.beginPath();
    ctx.moveTo(x0, bottom);
    for (let x = x0; x <= x1; x += 10) ctx.lineTo(x, this.waveY(x));
    ctx.lineTo(x1, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = this.theme.waterTop;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 10) x === x0 ? ctx.moveTo(x, this.waveY(x)) : ctx.lineTo(x, this.waveY(x));
    ctx.stroke();
  }

  drawMine(ctx, m) {
    if (m.claymore) {
      ctx.save();
      ctx.translate(m.x, m.y - 2);
      ctx.scale(m.facing || 1, 1);
      ctx.strokeStyle = '#2b2f36'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-3, 3); ctx.lineTo(-5, 7); ctx.moveTo(3, 3); ctx.lineTo(5, 7); ctx.stroke();
      ctx.fillStyle = '#556b2f';
      ctx.beginPath(); ctx.moveTo(-6, -5); ctx.quadraticCurveTo(0, -2, 6, -5); ctx.lineTo(6, 3); ctx.quadraticCurveTo(0, 5, -6, 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = m.arm > 0 ? '#999' : (this.tick % 30 < 15 ? '#ff2a2a' : '#7a0000');
      ctx.fillRect(-1, -7, 2, 2);
      if (m.ownerTeam >= 0) { ctx.strokeStyle = TEAMS[m.ownerTeam].color; ctx.lineWidth = 1.5; ctx.strokeRect(-7, -6, 14, 10); }
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.fillStyle = '#3a3f47';
    ctx.strokeStyle = '#16181c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 1, 7, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5b626d';
    ctx.fillRect(-2, -5, 4, 3);
    const fast = m.fuse != null;
    const on = fast ? this.tick % 8 < 4 : (this.tick + m.x) % 70 < 10;
    ctx.fillStyle = m.arm > 0 ? '#999' : on ? '#ff3030' : '#6a1010';
    ctx.beginPath();
    ctx.arc(0, -5, 2, 0, Math.PI * 2);
    ctx.fill();
    if (m.ownerTeam >= 0) { // laid by a team: show its colour
      ctx.strokeStyle = TEAMS[m.ownerTeam].color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 1, 9, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    if (m.fuse != null) this.outlinedText(ctx, String(Math.ceil(m.fuse / TICK_RATE * 2) / 2), m.x, m.y - 14, 'bold 11px system-ui, sans-serif', '#ff6060');
  }

  drawRope(ctx) {
    const r = this.rope;
    if (!r) return;
    const c = this.active;
    const ex = r.state === 'attached' ? r.ax : r.x, ey = r.state === 'attached' ? r.ay : r.y;
    ctx.strokeStyle = '#6b4a2b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = '#c9ccd2';
    ctx.beginPath();
    ctx.arc(ex, ey, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  drawLabels(ctx) {
    for (const c of this.chars) {
      if (!c.alive || !this.visibleChar(c)) continue;
      const s = this.worldToScreen(c.x, c.y - CHAR_R);
      if (s.x < -60 || s.x > this.viewW + 60 || s.y < -60 || s.y > this.viewH + 80) continue;
      const team = TEAMS[c.team];
      const y = s.y - 12;
      this.outlinedText(ctx, String(Math.max(0, Math.round(c.shownHp))), s.x, y, 'bold 13px system-ui, sans-serif', team.color);
      const buffs = (c.powerUp ? ' ⚡' : '') + (c.armor > 0 ? ' 🛡' : '') + (c.restArmor > 0 ? ' 🩹' : '') + (c.suit ? ' 🦺' : '') + (c.dazed > 0 || (c === this.active && this.dazedNow) ? ' 😵' : '');
      this.outlinedText(ctx, c.name + (c.isCPU ? ' 🤖' : '') + buffs, s.x, y - 15, '12px system-ui, sans-serif', team.color);
      if (c === this.active && (this.state === 'turn' || this.state === 'banner')) {
        const by = y - 30 + Math.sin(this.tick * 0.12) * 4;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x - 7, by - 8);
        ctx.lineTo(s.x + 7, by - 8);
        ctx.lineTo(s.x, by);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
      }
    }
  }

  drawTargetCursor(ctx) {
    if (!this.isHumanTurn() || this.hasFired || !this.mouse.inside || this.isTouch) return;
    const w = WEAPON[this.active.weapon];
    if (w.kind !== 'target') return;
    const { x, y } = this.mouse;
    if (w.id === 'concrete') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.active.buildAngle * Math.PI / 180);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#c9ccd2';
      ctx.fillRect(-36, -7, 72, 14);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / this.zoom;
      ctx.strokeRect(-36, -7, 72, 14);
      ctx.restore();
      return;
    }
    const ok = w.id !== 'teleport' || (!this.terrain.collides(x, y) && y < WATER_Y - CHAR_R * 2);
    ctx.strokeStyle = ok ? '#fff' : '#f55';
    ctx.lineWidth = 2 / this.zoom;
    ctx.beginPath();
    ctx.arc(x, y, 14 + Math.sin(this.tick * 0.2) * 2, 0, Math.PI * 2);
    ctx.moveTo(x - 20, y); ctx.lineTo(x + 20, y);
    ctx.moveTo(x, y - 20); ctx.lineTo(x, y + 20);
    ctx.stroke();
  }

  drawMinimap(ctx, x, y, w) {
    const h = w * WORLD_H / WORLD_W;
    ctx.fillStyle = 'rgba(15,18,28,0.72)';
    this.roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = this.theme.skyTop;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.terrain.canvas, x, y, w, h);
    const k = w / WORLD_W;
    ctx.fillStyle = this.theme.water;
    ctx.fillRect(x, y + WATER_Y * k, w, h);
    ctx.fillStyle = '#222';
    for (const m of this.mines) ctx.fillRect(x + m.x * k - 1, y + m.y * k - 1, 2, 2);
    ctx.fillStyle = 'rgba(220,222,228,0.75)';
    for (const sm of this.smokes) { ctx.beginPath(); ctx.arc(x + sm.x * k, y + sm.y * k, sm.r * k, 0, Math.PI * 2); ctx.fill(); }
    for (const c of this.chars) {
      if (!c.alive || !this.visibleChar(c)) continue;
      ctx.fillStyle = TEAMS[c.team].color;
      ctx.strokeStyle = c === this.active ? '#fff' : '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x + c.x * k, y + c.y * k, c === this.active ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    for (const p of this.projectiles) ctx.fillRect(x + p.x * k - 1, y + p.y * k - 1, 2, 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    const vw = this.viewW / this.zoom, vh = this.viewH / this.zoom;
    ctx.strokeRect(x + (this.cam.x - vw / 2) * k, y + (this.cam.y - vh / 2) * k, vw * k, vh * k);
    ctx.restore();
    return h;
  }

  drawHUD(ctx, W, H) {
    const c = this.active;
    const narrow = W < 1000;

    // Timer + active player (top centre)
    ctx.fillStyle = 'rgba(15,18,28,0.72)';
    this.roundRect(ctx, W / 2 - 150, 12, 300, 64, 14);
    ctx.fill();
    if (c) {
      const team = TEAMS[c.team];
      const secs = Math.max(0, Math.ceil(this.turnTimer));
      const urgent = secs <= 5 && this.state === 'turn' && !this.retreating;
      this.outlinedText(ctx, String(secs), W / 2 - 108, 44, 'bold 34px system-ui, sans-serif', urgent ? '#ff5a5a' : '#fff');
      this.outlinedText(ctx, c.name, W / 2 + 22, 34, 'bold 20px system-ui, sans-serif', team.color);
      let sub = this.retreating ? 'Retreat!' : this.hasFired ? 'Fired' : WEAPON[c.weapon].name;
      if (this.rope && this.rope.state === 'attached') sub = 'Swinging on rope';
      if (this.digging) sub = 'Digging…';
      if (this.jet) sub = `Jetpack · fuel ${(this.jet.fuel / TICK_RATE).toFixed(1)} s`;
      if (this.lockedWeapon) sub = `${WEAPON[this.lockedWeapon].name} · shot ${this.shotsFired + 1} of ${WEAPON[this.lockedWeapon].shots}`;
      if (this.gunBurst) sub = 'Firing…';
      if (this.state === 'settle') sub = 'Waiting…';
      if (c.isCPU && this.state === 'turn' && !this.hasFired) sub = 'CPU thinking…';
      this.outlinedText(ctx, sub, W / 2 + 22, 58, '14px system-ui, sans-serif', '#dfe6f3');
    }

    // Wind (top right, or under the timer on narrow screens)
    const wx = narrow ? W / 2 - 106 : W - 230, wy = narrow ? 84 : 18;
    ctx.fillStyle = 'rgba(15,18,28,0.72)';
    this.roundRect(ctx, wx, wy, 212, 40, 12);
    ctx.fill();
    this.outlinedText(ctx, 'WIND', wx + 30, wy + 20, 'bold 13px system-ui, sans-serif', '#dfe6f3');
    const bx = wx + 60, bw = 140, mid = bx + bw / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(bx, wy + 14, bw, 12);
    const len = this.wind * bw / 2;
    ctx.fillStyle = this.wind >= 0 ? '#4fc3f7' : '#ff8a65';
    ctx.fillRect(Math.min(mid, mid + len), wy + 14, Math.abs(len), 12);
    ctx.fillStyle = '#fff';
    ctx.fillRect(mid - 1, wy + 11, 2, 18);

    // Minimap + team health (top left, right of the pause button)
    const mx = 12 + 52 / this.ui, my = 14;
    let mw = clamp(W * 0.17, 140, 240);
    if (narrow) mw = Math.max(80, Math.min(mw, W / 2 - 150 - mx - 10)); // keep clear of the timer
    const mh = this.drawMinimap(ctx, mx, my, mw);

    const teams = Object.values(this.teams);
    const maxTotal = Math.max(...teams.map(t => t.members.length * this.settings.health));
    const th = 20 * teams.length + 12;
    const tx = 12, ty = my + mh + 14;
    ctx.fillStyle = 'rgba(15,18,28,0.72)';
    this.roundRect(ctx, tx, ty, mx + mw - tx + 4, th, 10);
    ctx.fill();
    const barX = tx + 108, barW = mx + mw - barX - 8;
    teams.forEach((t, i) => {
      const total = t.members.reduce((s, m) => s + Math.max(0, m.alive ? m.shownHp : 0), 0);
      const y = ty + 8 + i * 20;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = t.color;
      ctx.fillText(t.name, tx + 10, y + 7);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(barX, y + 2, barW, 10);
      ctx.fillStyle = t.color;
      ctx.fillRect(barX, y + 2, barW * Math.min(1, total / maxTotal), 10);
    });

    // Contextual hint for the active human player
    const myDrone = this.isHumanTurn() && this.projectiles.find(p => (p.drone && p.ctrl > 0 || p.dozer && !p.detonate || p.plasma && p.phase === 'fly' && !p.detonate) && p.owner === c);
    if (this.isHumanTurn() && (!this.hasFired || myDrone)) {
      const w = WEAPON[c.weapon];
      let hint = '';
      const press = this.isTouch ? 'FIRE' : 'Space';
      const lr = this.isTouch ? '◀ ▶' : '←/→';
      const myBall = this.projectiles.find(p => p.plasma && p.owner === c && p.phase === 'fly' && !p.detonate);
      const myDozer = this.projectiles.find(p => p.dozer && p.owner === c && !p.detonate);
      if (myDozer) hint = `${lr} steer the dozer · ${press} stops it and blows it up · ${((myDozer.life - myDozer.age) / TICK_RATE).toFixed(1)} s left`;
      else if (myBall) hint = `Press ${press} to detonate the plasma ball`;
      else if (myDrone) hint = `${lr} steer the drone · ${(myDrone.ctrl / TICK_RATE).toFixed(1)} s of control left`;
      else if (w.kind === 'plasma') hint = `${press} fires a slow plasma ball straight along your aim · press ${press} again while it flies to detonate it`;
      else if (w.kind === 'sling') hint = `Aim, hold ${press} to stretch the slingshot and let go to fling yourself · doesn't use your attack`;
      else if (w.kind === 'dozer') hint = `${press} sends the robo dozer the way you face · steer it with ${lr} · ${press} again blows it up`;
      else if (w.kind === 'boulder') hint = `Hold ${press} to charge the throw · it explodes and spreads fire on each of its ${w.bounces} bounces`;
      else if (w.kind === 'boomerang') hint = `Hold ${press} to charge the throw · it curves back to you and sends anyone it hits flying`;
      else if (w.kind === 'mouse') hint = `${press} lets the mine mouse go · it lays a mine every 0.5 s for 5 s, then bursts`;
      else if (w.id === 'gas') hint = `Timer ${c.fuse} s · ${this.isTouch ? 'the ⏱ button' : 'F'} changes it · leaves a toxic gas cloud that never clears`;
      else if (w.kind === 'smg') hint = `${press} fires a 3-round burst · ${w.shots} bursts per turn · the red dot shows a hit within ${w.laser}`;
      else if (w.kind === 'claymore') hint = `${press} plants a claymore facing ${c.facing > 0 ? 'right' : 'left'} · it goes off as soon as an enemy touches it`;
      else if (w.kind === 'blaster') hint = `${press} fires a bolt that goes through everything and bursts into fire and plasma`;
      else if (w.kind === 'suit') hint = c.suit ? `${press} takes the suit off (no more tunnel vision)` : `${press} puts on the suit: no toxic, plasma or fire damage, but you only see through the mask`;
      else if (w.kind === 'skip') hint = `${press} rests: +${w.heal} health and 20% less damage for 3 rounds (ends your turn)`;
      else if (w.id === 'flashbang') hint = `Timer ${c.fuse} s · ${this.isTouch ? 'the ⏱ button' : 'F'} changes it · blinds and dazes everyone near it for their next turn`;
      else if (w.id === 'smoke') hint = `Timer ${c.fuse} s · ${this.isTouch ? 'the ⏱ button' : 'F'} changes it · makes a smoke cloud that hides anyone inside from other teams`;
      else if (w.kind === 'tornado') hint = `${press} unleashes a tornado that moves the way you face, grows and lasts ${Math.round(w.life / TICK_RATE)} s`;
      else if (w.kind === 'drone') hint = `${press} launches the drone along your aim · then steer it with ${lr} for ${(w.ctrlTicks / TICK_RATE).toFixed(0)} s`;
      else if (this.lockedWeapon) hint = this.gunBurst ? '' : `Move if you like, then press ${press} for the next shot (${this.shotsFired + 1} of ${WEAPON[this.lockedWeapon].shots})`;
      else if (w.id === 'concrete') hint = `${this.isTouch ? 'Tap' : 'Click'} the map to place a block · ${this.isTouch ? '↻ button' : 'R'} rotates · doesn't use your attack`;
      else if (w.kind === 'target') hint = this.isTouch ? 'Tap the map to pick a target' : 'Click the map to pick a target';
      else if (w.fuseSelect && w.id !== 'smoke' && w.id !== 'flashbang' && w.id !== 'gas') hint = `Timer ${c.fuse} s · change it with ${this.isTouch ? 'the ⏱ button' : 'F'}`;
      else if (w.scope) hint = `Scope: ${this.isTouch ? '▲ ▼' : '↑/↓'} for fine aim, ${press} to fire`;
      else if (w.kind === 'burst') hint = `${press} fires ${w.bullets} rounds · keep aiming with ${this.isTouch ? '▲ ▼' : '↑/↓'} while it fires`;
      else if (w.kind === 'jetpack') hint = this.jet
        ? `${this.isTouch ? '▲' : '↑'} thrust · ${this.isTouch ? '◀ ▶' : '←/→'} steer · fuel ${(this.jet.fuel / TICK_RATE).toFixed(1)} s · ${press} or picking another weapon takes it off`
        : `${press} straps on the jetpack (${this.teams[c.team].ammo.jetpack === Infinity ? '∞' : this.teams[c.team].ammo.jetpack} left) · doesn't use your attack`;
      else if (w.kind === 'chute') hint = c.chute
        ? `${this.isTouch ? '◀ ▶' : '←/→'} steer the parachute · no fall damage while it's open`
        : `Keep it selected and it opens by itself when you fall · or jump and press ${press}`;
      else if (w.kind === 'melee') hint = `Get right next to an enemy, aim and press ${press} to swing`;
      else if (w.kind === 'flame') hint = `${press} sprays fire for ${(w.bullets / TICK_RATE).toFixed(1)} s · keep aiming while it burns`;
      else if (w.kind === 'walker') hint = `${press} releases the frog · it hops forward and explodes after ${Math.round(w.fuse / TICK_RATE)} s`;
      else if (w.kind === 'rope') hint = this.rope && this.rope.state === 'attached'
        ? (this.isTouch ? '◀ ▶ swing · ▲ ▼ climb · FIRE or JUMP to let go' : '←/→ swing · ↑/↓ climb · Space or Enter to let go')
        : `Aim and ${this.isTouch ? 'press FIRE' : 'press Space'} to shoot the rope (${this.ropeShots} left)`;
      else if (w.kind === 'dig') {
        const secs = (this.digLeft[w.id] / TICK_RATE).toFixed(1);
        const how = w.dig === 'down' ? 'dig straight down' : 'dig in the aim direction';
        hint = `Hold ${this.isTouch ? 'FIRE' : 'Space'} to ${how} (${secs}s left) · you can still attack after`;
      }
      if (hint) {
        ctx.font = 'bold 15px system-ui, sans-serif';
        const tw = ctx.measureText(hint).width + 28;
        ctx.fillStyle = 'rgba(15,18,28,0.72)';
        this.roundRect(ctx, W / 2 - tw / 2, narrow ? 132 : 86, tw, 30, 10);
        ctx.fill();
        this.outlinedText(ctx, hint, W / 2, (narrow ? 132 : 86) + 15, 'bold 15px system-ui, sans-serif', '#fff');
      }
    }

    // Keyboard controls (desktop only)
    if (this.isHumanTurn() && !this.isTouch) {
      const lines = ['←/→ walk   ↑/↓ aim   Enter jump   Backspace backflip',
        'Space: hold to charge, release to fire   1-9, 0, T, K / Tab: weapon',
        'Drag: look around   Wheel or +/−: zoom   C: re-centre',
        'Esc: pause   M: mute'];
      ctx.fillStyle = 'rgba(15,18,28,0.6)';
      this.roundRect(ctx, W - 470, H - 100, 454, 86, 10);
      ctx.fill();
      lines.forEach((l, i) => {
        ctx.font = '12.5px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#e8ecf5';
        ctx.fillText(l, W - 458, H - 82 + i * 19);
      });
    }
  }

  drawBanner(ctx, W) {
    const c = this.active;
    const t = Math.min(1, (80 - this.bannerTimer) / 12, this.bannerTimer / 12);
    const y = W < 1000 ? 180 : 140;
    ctx.globalAlpha = Math.max(0, t);
    ctx.fillStyle = 'rgba(10,12,20,0.75)';
    this.roundRect(ctx, W / 2 - 260, y, 520, 80, 16);
    ctx.fill();
    this.outlinedText(ctx, `${c.name}'s turn`, W / 2, y + 30, 'bold 32px system-ui, sans-serif', TEAMS[c.team].color);
    this.outlinedText(ctx, `${TEAMS[c.team].name}${c.isCPU ? ' · CPU' : ''}`, W / 2, y + 62, '16px system-ui, sans-serif', '#dfe6f3');
    ctx.globalAlpha = 1;
  }

  drawChar(ctx, c) {
    const team = TEAMS[c.team];
    const bob = !c.airborne && c === this.active && this.state === 'turn' ? Math.sin(this.tick * 0.15) * 0.6 : 0;
    ctx.save();
    const shake = c === this.active && this.digging ? rand(-1, 1) : 0;
    ctx.translate(c.x + shake, c.y + bob);
    if (c.chute) { // parachute canopy
      ctx.strokeStyle = 'rgba(30,30,30,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-7, -4); ctx.lineTo(-17, -30);
      ctx.moveTo(7, -4); ctx.lineTo(17, -30);
      ctx.stroke();
      ctx.fillStyle = team.color;
      ctx.beginPath();
      ctx.ellipse(0, -30, 22, 13, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, -30, 8, 13, 0, Math.PI, 0);
      ctx.fill();
    }
    if (c === this.active && this.jet) { // jetpack on the back
      ctx.fillStyle = '#9aa1ab';
      ctx.fillRect(-c.facing * 13 - 3, -7, 6, 13);
      ctx.fillStyle = '#d9534f';
      ctx.fillRect(-c.facing * 13 - 3, -7, 6, 3);
    }
    // feet
    ctx.fillStyle = team.dark;
    ctx.beginPath();
    ctx.ellipse(-5, CHAR_R - 1, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.ellipse(5, CHAR_R - 1, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // body (yellow hazmat suit with a team-coloured trim when worn)
    ctx.fillStyle = c.suit ? '#f2c94c' : team.color;
    ctx.strokeStyle = c.suit ? team.color : team.dark;
    ctx.lineWidth = c.suit ? 3 : 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, CHAR_R, CHAR_R * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // belly
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(c.facing * 2, 4, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (c.suit) { // gas mask instead of eyes
      ctx.fillStyle = '#2b2f36';
      ctx.beginPath(); ctx.ellipse(c.facing * 2.5, -2, 6.5, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(160,220,255,0.7)';
      for (const ex of [-2.6, 2.6]) { ctx.beginPath(); ctx.arc(ex + c.facing * 2.5, -3, 1.8, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#555';
      ctx.beginPath(); ctx.arc(c.facing * 4, 2.5, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
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

  drawScope(ctx, c) {
    const hit = this.scopePoint(c);
    ctx.strokeStyle = 'rgba(255,40,40,0.75)';
    ctx.lineWidth = 1.5 / this.zoom;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(hit.x, hit.y);
    ctx.stroke();
    const r = 28 / this.zoom;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 3 / this.zoom;
    ctx.beginPath();
    ctx.arc(hit.x, hit.y, r, 0, Math.PI * 2);
    ctx.moveTo(hit.x - r * 1.4, hit.y); ctx.lineTo(hit.x - r * 0.3, hit.y);
    ctx.moveTo(hit.x + r * 0.3, hit.y); ctx.lineTo(hit.x + r * 1.4, hit.y);
    ctx.moveTo(hit.x, hit.y - r * 1.4); ctx.lineTo(hit.x, hit.y - r * 0.3);
    ctx.moveTo(hit.x, hit.y + r * 0.3); ctx.lineTo(hit.x, hit.y + r * 1.4);
    ctx.stroke();
    ctx.fillStyle = '#ff2a2a';
    ctx.beginPath();
    ctx.arc(hit.x, hit.y, 2.5 / this.zoom, 0, Math.PI * 2);
    ctx.fill();
  }

  drawGas(ctx) {
    for (const g0 of this.gases) {
      const grow = Math.min(1, g0.age / SMOKE_GROW);
      for (const pf of g0.puffs) {
        const wob = Math.sin(this.tick * 0.025 + pf.ph) * 4;
        const cx = g0.x + pf.dx * grow + wob, cy = g0.y + pf.dy * grow, rr = (pf.r + wob) * grow + 1;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        g.addColorStop(0, 'rgba(120,230,90,0.35)');
        g.addColorStop(0.7, 'rgba(90,200,70,0.25)');
        g.addColorStop(1, 'rgba(90,200,70,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  drawSmoke(ctx) {
    for (const sm of this.smokes) {
      const grow = Math.min(1, sm.age / SMOKE_GROW);
      for (const pf of sm.puffs) {
        const wob = Math.sin(this.tick * 0.02 + pf.ph) * 4;
        const g = ctx.createRadialGradient(sm.x + pf.dx * grow, sm.y + pf.dy * grow, 0, sm.x + pf.dx * grow, sm.y + pf.dy * grow, (pf.r + wob) * grow + 1);
        g.addColorStop(0, 'rgba(214,216,222,0.95)');
        g.addColorStop(0.7, 'rgba(200,202,210,0.85)');
        g.addColorStop(1, 'rgba(190,192,200,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sm.x + pf.dx * grow + wob, sm.y + pf.dy * grow, (pf.r + wob) * grow + 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawCrate(ctx, k) {
    if (this.isBarrel(k)) {
      const toxic = k.type === 'toxicbarrel';
      ctx.save();
      ctx.translate(k.x, k.y - 2);
      ctx.fillStyle = toxic ? '#2f9e44' : '#c92a2a';
      ctx.fillRect(-8, -10, 16, 21);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-8, -5, 16, 2); ctx.fillRect(-8, 5, 16, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-6, -10, 3, 21);
      ctx.fillStyle = toxic ? '#d3f9d8' : '#ffd43b';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(toxic ? '☣' : '🔥', 0, 1);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(k.x, k.y);
    if (k.chute) {
      ctx.strokeStyle = 'rgba(40,40,40,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-8, -8); ctx.lineTo(-16, -30);
      ctx.moveTo(8, -8); ctx.lineTo(16, -30);
      ctx.stroke();
      ctx.fillStyle = k.type === 'steel' ? '#d9534f' : '#f2f2f2';
      ctx.beginPath();
      ctx.ellipse(0, -30, 22, 12, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.stroke();
    }
    if (k.type === 'steel') {
      ctx.fillStyle = '#8d96a0';
      ctx.fillRect(-9, -9, 18, 18);
      ctx.strokeStyle = '#4e555d';
      ctx.lineWidth = 2;
      ctx.strokeRect(-9, -9, 18, 18);
      ctx.fillStyle = '#4e555d';
      for (const [px, py] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) ctx.fillRect(px - 1, py - 1, 2, 2);
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', 0, 1);
    } else {
      ctx.fillStyle = '#b07a3e';
      ctx.fillRect(-9, -9, 18, 18);
      ctx.strokeStyle = '#6b4520';
      ctx.lineWidth = 2;
      ctx.strokeRect(-9, -9, 18, 18);
      ctx.beginPath();
      ctx.moveTo(-9, -9); ctx.lineTo(9, 9);
      ctx.moveTo(-9, -3); ctx.lineTo(9, -3);
      ctx.moveTo(-9, 3); ctx.lineTo(9, 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Falling snow (winter) or rising embers (volcanic), drawn over the view
  drawAmbient(ctx) {
    const kind = this.theme.ambient;
    if (!kind) return;
    if (!this.ambient) {
      this.ambient = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: rand(0.5, 1.4), p: rand(0, 6) }));
    }
    const { viewW, viewH } = this;
    for (const a of this.ambient) {
      if (kind === 'snow') {
        a.y += 0.0012 * a.s;
        a.x += (this.wind * 0.0009 + Math.sin((this.tick + a.p * 50) * 0.02) * 0.0003) * a.s;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
      } else {
        a.y -= 0.0009 * a.s;
        a.x += (this.wind * 0.0006 + Math.sin((this.tick + a.p * 40) * 0.03) * 0.0004) * a.s;
        ctx.fillStyle = `rgba(255,${Math.round(120 + 60 * Math.sin(this.tick * 0.1 + a.p))},40,0.75)`;
      }
      if (a.y > 1.02) a.y = -0.02; else if (a.y < -0.02) a.y = 1.02;
      if (a.x > 1.02) a.x = -0.02; else if (a.x < -0.02) a.x = 1.02;
      const r = (kind === 'snow' ? 1.8 : 1.3) * a.s;
      ctx.beginPath();
      ctx.arc(a.x * viewW, a.y * viewH, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawFires(ctx) {
    for (const f of this.fires) {
      if (f.jet) {
        const age = 1 - f.life / 34;
        ctx.globalAlpha = 0.75 * (1 - age * 0.6);
        ctx.fillStyle = age < 0.3 ? '#ffe27a' : age < 0.65 ? '#ff8a1f' : '#d9411e';
        ctx.beginPath();
        ctx.arc(f.x, f.y, 3 + age * 6, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const flick = Math.sin(this.tick * 0.4 + f.seed) * 1.5;
      const fade = Math.min(1, f.life / 40);
      ctx.globalAlpha = 0.85 * fade;
      ctx.fillStyle = f.toxic ? '#3ddc3d' : '#ff6a00';
      ctx.beginPath();
      ctx.ellipse(f.x, f.y - 3, 4 + flick * 0.3, 7 + flick, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = f.toxic ? '#c6ff8a' : '#ffd34d';
      ctx.beginPath();
      ctx.ellipse(f.x, f.y - 1, 2.2, 4 + flick * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawAim(ctx, c) {
    const w = WEAPON[c.weapon];
    if (w.kind === 'target' || w.kind === 'skip' || w.kind === 'drop' || w.kind === 'mine' || w.dig === 'down' || w.kind === 'chute' || w.kind === 'jetpack') return;
    if (this.rope && this.rope.state === 'attached') return;
    if (w.scope) { this.drawScope(ctx, c); return; }
    if (w.laser) { // red laser line; a dot on whatever it touches within range
      const { dx, dy } = c.aimVector();
      const hit = traceRay(this.env, c.x, c.y, dx, dy, w.laser, c.id);
      ctx.strokeStyle = 'rgba(255,30,30,0.55)';
      ctx.lineWidth = 1.2 / this.zoom;
      ctx.beginPath(); ctx.moveTo(c.x + dx * 12, c.y + dy * 12); ctx.lineTo(hit.x, hit.y); ctx.stroke();
      if (hit.hit || hit.solid) {
        ctx.fillStyle = '#ff1a1a';
        ctx.shadowColor = '#ff1a1a';
        ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(hit.x, hit.y, 3 / Math.max(this.zoom, 0.6), 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      return;
    }
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
      case 'plasmagrenade':
      case 'smoke':
      case 'flashbang':
      case 'gas':
        ctx.rotate(p.spin);
        ctx.fillStyle = { grenade: '#2f5d2f', cluster: '#7a2d6b', plasmagrenade: '#3ddc3d', smoke: '#9aa1ab', flashbang: '#e9ecef', gas: '#8fbf3f' }[p.weapon];
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#999'; ctx.fillRect(-1.5, -8, 3, 4);
        break;
      case 'dozer': {
        const flip = Math.cos(p.heading) < 0;
        ctx.rotate(flip ? p.heading - Math.PI : p.heading);
        if (flip) ctx.scale(-1, 1);
        ctx.fillStyle = '#2b2f36'; // tracks
        ctx.beginPath(); ctx.ellipse(0, 9, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6c737d';
        for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.arc(k * 6 + Math.sin(p.spin) * 0.8, 9, 2, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#f2b705'; // body + cab
        ctx.fillRect(-13, -4, 22, 11);
        ctx.fillRect(-11, -12, 11, 9);
        ctx.fillStyle = 'rgba(160,220,255,0.8)';
        ctx.fillRect(-9, -10, 7, 5);
        ctx.fillStyle = '#9aa1ab'; // blade
        ctx.beginPath(); ctx.moveTo(10, -8); ctx.lineTo(17, -6); ctx.lineTo(17, 12); ctx.lineTo(10, 10); ctx.closePath(); ctx.fill();
        ctx.fillStyle = this.tick % 12 < 6 ? '#ff6b00' : '#7a3300'; // beacon
        ctx.fillRect(-7, -15, 3, 3);
        break;
      }
      case 'minidyn':
        ctx.rotate(p.spin);
        ctx.fillStyle = '#c22';
        ctx.fillRect(-2.5, -5, 5, 10);
        if (this.tick % 6 < 3) { ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(0, -7, 1.8, 0, Math.PI * 2); ctx.fill(); }
        break;
      case 'dynamite':
        ctx.fillStyle = '#c22';
        ctx.fillRect(-4, -8, 8, 14);
        ctx.strokeStyle = '#444'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.quadraticCurveTo(4, -12, 2, -15); ctx.stroke();
        if (this.tick % 6 < 3) { ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(2, -15, 2.5, 0, Math.PI * 2); ctx.fill(); }
        break;
      case 'miniplasma': {
        const g2 = ctx.createRadialGradient(0, 0, 1, 0, 0, p.r * 1.8);
        g2.addColorStop(0, 'rgba(220,255,190,1)');
        g2.addColorStop(0.5, 'rgba(70,230,70,0.8)');
        g2.addColorStop(1, 'rgba(30,160,40,0)');
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(0, 0, p.r * 1.8, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'microlet':
        ctx.fillStyle = '#7dff5a';
        ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
        break;
      case 'blaster':
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.shadowColor = '#7dff5a';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#b6ff9c';
        ctx.beginPath(); ctx.ellipse(0, 0, 7, 2.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        break;
      case 'boulder': {
        ctx.rotate(p.spin);
        ctx.shadowColor = '#ff6a00';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#3b2a26';
        ctx.beginPath();
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, rr = 8 + (k % 3) * 1.2; k ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(rr, 0); }
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = this.tick % 10 < 5 ? '#ff8a1f' : '#ffd166';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-5, -2); ctx.lineTo(0, 1); ctx.lineTo(4, -3); ctx.moveTo(-2, 4); ctx.lineTo(2, 2); ctx.stroke();
        break;
      }
      case 'greenlet':
        ctx.fillStyle = '#4ae04a';
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(200,255,170,0.9)';
        ctx.beginPath(); ctx.arc(-1, -1, 1.6, 0, Math.PI * 2); ctx.fill();
        break;
      case 'plasma': {
        if (p.phase === 'flash') break; // hidden by the white-out
        if (p.phase === 'bubble') {
          const throb = 0.5 + 0.5 * Math.sin(p.t * 0.45);
          const R = p.bigR * (0.93 + 0.07 * Math.sin(p.t * 0.3)) * Math.min(1, 0.4 + p.t / 18);
          const gb = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
          gb.addColorStop(0, `rgba(255,255,255,${0.85 - 0.3 * throb})`);
          gb.addColorStop(0.55, `rgba(${Math.round(90 + 165 * (1 - throb))},255,${Math.round(90 + 165 * (1 - throb))},${0.55 + 0.2 * throb})`);
          gb.addColorStop(0.9, `rgba(40,210,60,${0.45 + 0.25 * throb})`);
          gb.addColorStop(1, 'rgba(40,210,60,0)');
          ctx.fillStyle = gb;
          ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = throb > 0.5 ? 'rgba(255,255,255,0.9)' : 'rgba(110,255,110,0.9)';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, R * 0.98, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        const pulse = 1 + Math.sin(this.tick * (p.phase === 'grow' ? 0.8 : 0.35)) * 0.1;
        const R = p.r * pulse;
        const glowK = p.phase === 'fly' ? 1.7 : 1.15;
        const glow = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * glowK);
        glow.addColorStop(0, 'rgba(180,255,120,0.95)');
        glow.addColorStop(0.45, 'rgba(60,220,60,0.75)');
        glow.addColorStop(0.75, 'rgba(30,160,40,0.3)');
        glow.addColorStop(1, 'rgba(30,160,40,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(0, 0, R * glowK, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(230,255,200,0.9)';
        ctx.beginPath(); ctx.arc(0, 0, R * 0.35, 0, Math.PI * 2); ctx.fill();
        // crackling arcs
        ctx.strokeStyle = 'rgba(200,255,150,0.8)';
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 3; k++) {
          const a = this.tick * 0.2 + k * 2.1;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3);
          ctx.lineTo(Math.cos(a + 0.4) * R * 0.75, Math.sin(a + 0.4) * R * 0.75);
          ctx.lineTo(Math.cos(a + 0.1) * R * 1.05, Math.sin(a + 0.1) * R * 1.05);
          ctx.stroke();
        }
        break;
      }
      case 'tornado': {
        const H = p.r * 4;
        const fade = Math.max(0, Math.min(1, (p.life - p.age) / 60, p.age / 20));
        for (let k = 0; k < 16; k++) {
          const f = k / 15;
          const rr = p.r * (0.22 + 0.78 * f);
          const off = Math.sin(this.tick * 0.15 + f * 6) * rr * 0.18 * f;
          ctx.globalAlpha = (0.25 + 0.35 * f) * fade;
          ctx.strokeStyle = k % 2 ? '#d5d8de' : '#8f949e';
          ctx.lineWidth = 2 + f * 3;
          ctx.beginPath();
          ctx.ellipse(off, -f * H, rr, rr * 0.22, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        // swirling streaks
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 5; k++) {
          const f = ((this.tick * 0.02 + k / 5) % 1);
          const rr = p.r * (0.22 + 0.78 * f);
          const a = this.tick * 0.3 + k * 1.3;
          ctx.globalAlpha = 0.6 * fade;
          ctx.beginPath();
          ctx.ellipse(0, -f * H, rr, rr * 0.22, 0, a, a + 1.4);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'drone': {
        ctx.rotate(p.heading);
        ctx.fillStyle = '#2f3640';
        ctx.fillRect(-7, -3, 14, 6);
        ctx.fillStyle = '#e5484d';
        ctx.fillRect(4, -2, 3, 4);
        ctx.strokeStyle = '#2f3640';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-6, -3); ctx.lineTo(-8, -7); ctx.moveTo(6, -3); ctx.lineTo(8, -7); ctx.stroke();
        ctx.strokeStyle = 'rgba(220,225,235,0.9)';
        ctx.lineWidth = 1.5;
        for (const rx of [-8, 8]) {
          const r = 6 * Math.abs(Math.cos(p.spin + rx));
          ctx.beginPath(); ctx.moveTo(rx - r, -8); ctx.lineTo(rx + r, -8); ctx.stroke();
        }
        ctx.fillStyle = p.ctrl > 0 && this.tick % 10 < 5 ? '#4ade80' : '#14532d';
        ctx.fillRect(-1.5, -1.5, 3, 3);
        break;
      }
      case 'drillrocket':
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(-9, -3.5, 13, 7);
        ctx.fillStyle = '#c9ccd2';
        ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(13, 0); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const o = ((p.spin * 3 + k * 3) % 9);
          ctx.beginPath(); ctx.moveTo(4 + o, -3.5 + o * 0.35); ctx.lineTo(4 + o, 3.5 - o * 0.35); ctx.stroke();
        }
        if (!p.drilling) { ctx.fillStyle = '#fa0'; ctx.fillRect(-12, -2, 3, 4); }
        break;
      case 'nuke':
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillStyle = '#e8c21a';
        ctx.beginPath(); ctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3a3000'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#222';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 4.5, i * 2.094, i * 2.094 + 1.05); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#556'; ctx.fillRect(-15, -4, 4, 8);
        break;
      case 'frog': {
        const sq = p.vy === 0 ? 1.15 : 0.9;
        const size = p.baby ? 0.75 : 1.6;
        ctx.scale(p.dir * size, size);
        ctx.fillStyle = '#3fae49';
        ctx.beginPath(); ctx.ellipse(0, 0, 7 * sq, 5 / sq, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#1d5e24'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = '#c0c4ca'; ctx.fillRect(-5, -9, 6, 4);
        ctx.fillStyle = this.tick % 10 < 5 ? '#ff2a2a' : '#7a0000'; ctx.fillRect(-3, -11, 2, 2);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(4, -4, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(4.6, -4, 1, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'napalm':
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillStyle = '#9a3412';
        ctx.fillRect(-7, -3.5, 14, 7);
        ctx.fillStyle = '#ffb000'; ctx.fillRect(-2, -3.5, 3, 7);
        break;
      case 'boomerang':
        ctx.rotate(p.spin);
        ctx.strokeStyle = '#a0612a';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-9, 4); ctx.lineTo(0, -4); ctx.lineTo(9, 4); ctx.stroke();
        ctx.lineCap = 'butt';
        break;
      case 'plasmafrag': {
        const gf = ctx.createRadialGradient(0, 0, 1, 0, 0, 10);
        gf.addColorStop(0, 'rgba(220,255,190,1)');
        gf.addColorStop(0.5, 'rgba(70,230,70,0.85)');
        gf.addColorStop(1, 'rgba(30,160,40,0)');
        ctx.fillStyle = gf;
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'mouse': {
        ctx.scale(p.dir, 1);
        const leg = Math.sin(p.spin * 3) * 2;
        ctx.strokeStyle = '#8d8d8d'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-7, 1); ctx.quadraticCurveTo(-13, -3, -15, 2); ctx.stroke(); // tail
        ctx.fillStyle = '#9ea4ab';
        ctx.beginPath(); ctx.ellipse(0, 0, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(3, -4, 2.5, 0, Math.PI * 2); ctx.fill(); // ear
        ctx.fillStyle = '#f4a6b4';
        ctx.beginPath(); ctx.arc(8, 0, 1.3, 0, Math.PI * 2); ctx.fill(); // nose
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(5, -1.5, 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#555'; ctx.fillRect(-4 + leg, 3.5, 1.5, 2); ctx.fillRect(3 - leg, 3.5, 1.5, 2);
        ctx.fillStyle = this.tick % 10 < 5 ? '#ff2a2a' : '#7a0000'; ctx.fillRect(-2, -6, 2, 2); // bomb light
        break;
      }
      case 'anvil':
        if (p.lava) {
          ctx.shadowColor = '#ff6a00';
          ctx.shadowBlur = 14;
        }
        ctx.fillStyle = p.lava ? (this.tick % 8 < 4 ? '#e8590c' : '#c92a2a') : '#3d4249';
        ctx.beginPath();
        ctx.moveTo(-13, -8); ctx.lineTo(13, -8); ctx.lineTo(9, -2); ctx.lineTo(5, -2); ctx.lineTo(7, 6);
        ctx.lineTo(10, 9); ctx.lineTo(-10, 9); ctx.lineTo(-7, 6); ctx.lineTo(-5, -2); ctx.lineTo(-11, -4);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-12, -8, 24, 2);
        break;
      default:
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (p.dozer) {
      this.outlinedText(ctx, ((p.life - p.age) / TICK_RATE).toFixed(1), p.x, p.y - 26, 'bold 12px system-ui, sans-serif', '#ffd43b');
    }
    if (p.drone && p.ctrl > 0) {
      this.outlinedText(ctx, (p.ctrl / TICK_RATE).toFixed(1), p.x, p.y - 18, 'bold 12px system-ui, sans-serif', '#4ade80');
    }
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
    } else if (e.type === 'flashbang') {
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * (0.6 + t * 0.6));
      g.addColorStop(0, `rgba(255,255,255,${1 - t})`);
      g.addColorStop(0.6, `rgba(255,255,240,${(1 - t) * 0.7})`);
      g.addColorStop(1, 'rgba(255,255,240,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.6 + t * 0.6), 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'swing') {
      const base = e.facing > 0 ? -e.aim * Math.PI / 180 : Math.PI + e.aim * Math.PI / 180;
      const sweep = (t - 0.5) * 2.4 * e.facing;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 20, base - 1.2 * e.facing, base + sweep, e.facing < 0);
      ctx.stroke();
      // the bat itself
      const a = base + sweep;
      ctx.strokeStyle = '#a0612a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(a) * 6, e.y + Math.sin(a) * 6);
      ctx.lineTo(e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24);
      ctx.stroke();
    } else if (e.type === 'tracer') {
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#fff6a0';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
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
}
