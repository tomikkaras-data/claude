// ---------------------------------------------------------------------------
// Characters and projectile physics (shared by the game and the CPU planner)
// ---------------------------------------------------------------------------

class Character {
  constructor(id, name, team, isCPU, hp) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.isCPU = isCPU;
    this.hp = hp;
    this.maxHp = hp;
    this.shownHp = hp;      // animated value for the label
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.airborne = false;
    this.facing = 1;
    this.aim = 25;          // degrees, positive = up, relative to facing
    this.alive = true;
    this.grave = false;     // show a gravestone after death
    this.weapon = 'bazooka';
    this.fuse = 3;          // grenade timer in seconds (1-5)
    this.buildAngle = 0;    // concrete block rotation
    this.armor = 0;         // absorbs half of incoming damage until used up
    this.powerUp = false;   // next attack does +50% damage
    this.blink = Math.random() * 200;
  }

  aimVector() {
    const a = this.aim * Math.PI / 180;
    return { dx: Math.cos(a) * this.facing, dy: -Math.sin(a) };
  }
}

// Build a projectile for a weapon fired by `shooter` (needs x, y, aim, facing, id, team)
function launchProjectile(weapon, shooter, power, fuseTicks) {
  const a = shooter.aim * Math.PI / 180;
  const dx = Math.cos(a) * shooter.facing;
  const dy = -Math.sin(a);
  const speed = power * MAX_POWER_SPEED;
  return {
    weapon: weapon.id,
    x: shooter.x + dx * 16,
    y: shooter.y + dy * 16,
    vx: dx * speed,
    vy: dy * speed,
    wind: !!weapon.wind,
    bounce: !!weapon.bounce,
    fuse: fuseTicks != null ? fuseTicks : weapon.fuse != null ? weapon.fuse : null,
    radius: weapon.radius,
    damage: weapon.damage,
    cluster: weapon.cluster || 0,
    blastKnock: weapon.blastKnock || 1,
    ownerId: shooter.id,
    ownerTeam: shooter.team,
    age: 0,
    spin: 0,
  };
}

// Advance a projectile one tick.
// env = { terrain, wind, chars }
// Returns null while flying, otherwise 'impact' | 'fuse' | 'water' | 'lost'.
function stepProjectile(p, env) {
  p.age++;
  if (p.wind) p.vx += env.wind * WIND_ACC;
  p.vy += GRAVITY;
  if (p.fuse != null) p.fuse--;
  p.spin += p.vx * 0.05;

  const speed = Math.hypot(p.vx, p.vy);
  const steps = Math.max(1, Math.ceil(speed / 3));
  const t = env.terrain;
  for (let i = 0; i < steps; i++) {
    const nx = p.x + p.vx / steps;
    const ny = p.y + p.vy / steps;
    if (p.bounce) {
      let hit = false;
      if (t.isSolid(nx, p.y)) { p.vx = -p.vx * 0.45; p.vy *= 0.85; hit = true; } else p.x = nx;
      if (t.isSolid(p.x, ny)) { p.vy = -p.vy * 0.4; p.vx *= 0.7; hit = true; } else p.y = ny;
      if (hit) break;
    } else {
      p.x = nx;
      p.y = ny;
      if (t.isSolid(nx, ny)) return 'impact';
      for (const c of env.chars) {
        if (!c.alive) continue;
        if (c.id === p.ownerId && p.age < 12) continue;
        const ddx = c.x - p.x, ddy = c.y - p.y;
        if (ddx * ddx + ddy * ddy < (CHAR_R + 3) * (CHAR_R + 3)) return 'impact';
      }
    }
  }
  if (p.y > WATER_Y) return 'water';
  if (p.x < -400 || p.x > WORLD_W + 400) return 'lost';
  if (p.fuse != null && p.fuse <= 0) return 'fuse';
  return null;
}

// Instant shot along a line. Returns the point where it stopped and the character hit (if any).
function traceRay(env, x, y, dx, dy, range, ignoreId) {
  for (let d = 0; d < range; d += 2) {
    const px = x + dx * d, py = y + dy * d;
    if (env.terrain.isSolid(px, py)) return { x: px, y: py, hit: null, solid: true };
    for (const c of env.chars) {
      if (!c.alive || c.id === ignoreId) continue;
      if ((c.x - px) ** 2 + (c.y - py) ** 2 < CHAR_R * CHAR_R) return { x: px, y: py, hit: c };
    }
    if (py > WATER_Y || px < 0 || px > WORLD_W) return { x: px, y: py, hit: null };
  }
  return { x: x + dx * range, y: y + dy * range, hit: null };
}
