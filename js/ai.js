// ---------------------------------------------------------------------------
// CPU player: simulates many shots with the real physics and picks the best
// ---------------------------------------------------------------------------

class AIController {
  constructor(game, char) {
    this.g = game;
    this.c = char;
    this.phase = 'think';
    this.timer = 45;
    this.walked = false;
    this.plan = null;
    this.power = 0;
    this.stuck = 0;
    this.lastX = char.x;
  }

  update() {
    const g = this.g, c = this.c;
    if (g.hasFired) return; // nothing to do while retreating
    switch (this.phase) {
      case 'think':
        if (--this.timer > 0) return;
        this.plan = this.computePlan();
        if (this.plan.walkDir && !this.walked) {
          this.phase = 'walk';
          this.timer = randInt(60, 130);
        } else {
          this.phase = 'aim';
          g.selectWeapon(this.plan.weapon);
          if (this.plan.facing) c.facing = this.plan.facing;
        }
        return;

      case 'walk':
        g.walk(c, this.plan.walkDir);
        if (Math.abs(c.x - this.lastX) < 0.2) {
          if (++this.stuck > 12) { g.jump(c, false); this.stuck = 0; }
        } else this.stuck = 0;
        this.lastX = c.x;
        if (--this.timer <= 0) {
          this.walked = true;
          this.phase = 'settle';
        }
        return;

      case 'settle':
        if (!c.airborne) { this.phase = 'think'; this.timer = 15; }
        return;

      case 'aim': {
        const p = this.plan;
        if (p.angle != null) {
          const diff = p.angle - c.aim;
          if (Math.abs(diff) > 1.5) { c.aim += Math.sign(diff) * 1.5; return; }
          c.aim = p.angle;
        }
        this.phase = 'fire';
        this.timer = 20;
        this.power = 0;
        return;
      }

      case 'fire': {
        const p = this.plan;
        const w = WEAPON[p.weapon];
        if (w.charge) {
          this.power += 1 / CHARGE_TICKS;
          g.chargePower = this.power;
          g.charging = true;
          if (this.power >= p.power) {
            g.charging = false;
            g.fire(p.power);
          }
        } else if (--this.timer <= 0) {
          if (w.kind === 'target') g.fireAt(p.target.x, p.target.y);
          else g.fire(1);
        }
        return;
      }
    }
  }

  env() {
    return { terrain: this.g.terrain, wind: this.g.wind, chars: this.g.chars };
  }

  simulate(weapon, angle, facing, power) {
    const c = this.c;
    const shooter = { x: c.x, y: c.y, aim: angle, facing, id: c.id, team: c.team };
    const p = launchProjectile(weapon, shooter, power);
    const env = this.env();
    for (let i = 0; i < 700; i++) {
      const r = stepProjectile(p, env);
      if (r === 'impact' || r === 'fuse') return { x: p.x, y: p.y };
      if (r) return null;
    }
    return null;
  }

  scoreBlast(x, y, radius, damage, enemies, friends) {
    let score = 0;
    let minD = Infinity;
    const reach = radius + CHAR_R;
    for (const e of enemies) {
      const d = dist(x, y, e.x, e.y);
      minD = Math.min(minD, d);
      if (d < reach) {
        const dmg = damage * (1 - d / reach);
        score += Math.min(dmg, e.hp) * 10;
        if (dmg >= e.hp) score += 300;
      }
    }
    // Avoid blowing the ground away under our own team
    for (const f of friends) if (dist(x, y, f.x, f.y) < reach) score -= 40;
    return score - minD * 0.05;
  }

  computePlan() {
    const g = this.g, c = this.c;
    const ammo = g.teams[c.team].ammo;
    const enemies = g.chars.filter(o => o.alive && o.team !== c.team);
    const friends = g.chars.filter(o => o.alive && o.team === c.team);
    const noise = DIFFICULTY[g.settings.difficulty] || DIFFICULTY.normal;
    let best = { score: -Infinity };

    // Ballistic weapons
    for (const id of ['bazooka', 'grenade']) {
      if (!(ammo[id] > 0)) continue;
      const w = WEAPON[id];
      for (const facing of [-1, 1]) {
        for (let angle = -60; angle <= 85; angle += 3) {
          for (let power = 0.2; power <= 1.0001; power += 0.05) {
            const pt = this.simulate(w, angle, facing, power);
            if (!pt) continue;
            const s = this.scoreBlast(pt.x, pt.y, w.radius, w.damage, enemies, friends);
            if (s > best.score) best = { score: s, weapon: id, angle, facing, power };
          }
        }
      }
    }

    // Shotgun: direct line of sight
    if (ammo.shotgun > 0) {
      for (const e of enemies) {
        const dx = e.x - c.x, dy = e.y - c.y;
        if (Math.hypot(dx, dy) > WEAPON.shotgun.range - 20) continue;
        const facing = dx >= 0 ? 1 : -1;
        const angle = Math.atan2(-dy, Math.abs(dx)) * 180 / Math.PI;
        if (Math.abs(angle) > 85) continue;
        const a = angle * Math.PI / 180;
        const hit = traceRay(this.env(), c.x, c.y, Math.cos(a) * facing, -Math.sin(a), WEAPON.shotgun.range, c.id);
        if (hit.hit === e) {
          const dmg = WEAPON.shotgun.damage;
          const s = Math.min(dmg, e.hp) * 10 + (dmg >= e.hp ? 300 : 0) + 15;
          if (s > best.score) best = { score: s, weapon: 'shotgun', angle, facing, power: 1 };
        }
      }
    }

    // Air strike on an enemy with open sky above
    if (ammo.airstrike > 0) {
      for (const e of enemies) {
        let open = true;
        for (let y = 0; y < e.y - CHAR_R - 2; y += 3) {
          if (g.terrain.isSolid(e.x, y)) { open = false; break; }
        }
        if (!open) continue;
        const s = Math.min(45, e.hp) * 10 + (45 >= e.hp ? 300 : 0) - 50;
        if (s > best.score) best = { score: s, weapon: 'airstrike', angle: null, target: { x: e.x, y: e.y } };
      }
    }

    // Nothing worth shooting at: walk towards the nearest enemy first
    if ((best.score < 50 || !best.weapon) && !this.walked && enemies.length) {
      let nearest = enemies[0];
      for (const e of enemies) if (Math.abs(e.x - c.x) < Math.abs(nearest.x - c.x)) nearest = e;
      best.walkDir = nearest.x >= c.x ? 1 : -1;
    }
    if (!best.weapon) {
      best = { ...best, weapon: 'bazooka', angle: 45, facing: c.facing, power: 0.6 };
    }

    // Human-like aiming error
    if (best.angle != null && best.weapon !== 'airstrike') {
      best.angle = clamp(best.angle + rand(-noise.angle, noise.angle), -85, 85);
      best.power = clamp(best.power + rand(-noise.power, noise.power), 0.1, 1);
    }
    return best;
  }
}
