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
          // a second shot is left (shotgun): look again, without walking
          if (g.lockedWeapon) { this.phase = 'think'; this.timer = 35; this.walked = true; }
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
    // Avoid our own team: with friendly fire on, count the damage we'd do to them (and to ourselves)
    for (const f of friends) {
      const d = dist(x, y, f.x, f.y);
      if (d >= reach) continue;
      if (this.g.friendlyFire) {
        const dmg = damage * (1 - d / reach);
        score -= Math.min(dmg, f.hp) * 14 + (dmg >= f.hp ? 400 : 0);
      } else score -= 40; // still blows the ground away under them
    }
    return score - minD * 0.05;
  }

  findTeleportSpot(enemy) {
    const g = this.g;
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = clamp(enemy.x + (Math.random() < 0.5 ? -1 : 1) * rand(160, 320), 20, WORLD_W - 20);
      const spots = g.terrain.standSpots(x);
      if (!spots.length) continue;
      const y = spots[0];
      if (g.mines.some(m => dist(m.x, m.y, x, y) < 50)) continue;
      return { x, y: y - 4 };
    }
    return null;
  }

  computePlan() {
    const g = this.g, c = this.c;
    const ammo = g.teams[c.team].ammo;
    const has = id => !g.lockedWeapon ? ammo[id] > 0 : g.lockedWeapon === id;
    const enemies = g.chars.filter(o => o.alive && o.team !== c.team);
    const friends = g.chars.filter(o => o.alive && o.team === c.team);
    const noise = DIFFICULTY[g.settings.difficulty] || DIFFICULTY.normal;
    let best = { score: -Infinity };
    const killBonus = (dmg, e) => Math.min(dmg, e.hp) * 10 + (dmg >= e.hp ? 300 : 0);

    // Ballistic weapons: simulate the real flight for many angles and powers
    for (const id of ['bazooka', 'grenade', 'nuke']) {
      if (!has(id)) continue;
      const w = WEAPON[id];
      for (const facing of [-1, 1]) {
        for (let angle = -60; angle <= 85; angle += 3) {
          for (let power = 0.2; power <= 1.0001; power += 0.05) {
            const pt = this.simulate(w, angle, facing, power);
            if (!pt) continue;
            const s = this.scoreBlast(pt.x, pt.y, w.radius, w.damage, enemies, friends) + (w.crate ? 10 : 0);
            if (s > best.score) best = { score: s, weapon: id, angle, facing, power };
          }
        }
      }
    }

    // Guns: need a clear line of sight to an enemy
    for (const id of ['shotgun', 'deagle', 'sniper', 'gatling']) {
      if (!has(id)) continue;
      const w = WEAPON[id];
      for (const e of enemies) {
        const dx = e.x - c.x, dy = e.y - c.y, d = Math.hypot(dx, dy);
        if (d > w.range - 20) continue;
        const facing = dx >= 0 ? 1 : -1;
        const angle = Math.atan2(-dy, Math.abs(dx)) * 180 / Math.PI;
        if (Math.abs(angle) > 85) continue;
        const a = angle * Math.PI / 180;
        const hit = traceRay(this.env(), c.x, c.y, Math.cos(a) * facing, -Math.sin(a), w.range, c.id);
        if (hit.hit !== e) continue;
        let expected = w.damage;
        if (id === 'shotgun') expected = w.pellets * w.damage * clamp(110 / d, 0.25, 1);
        if (id === 'gatling') expected = w.bullets * w.damage * clamp(160 / d, 0.15, 0.7);
        const s = killBonus(expected, e) + 15 + (w.crate ? 10 : 0);
        if (s > best.score) best = { score: s, weapon: id, angle, facing, power: 1 };
      }
    }

    // Things that fall from the sky need open sky above the target
    for (const id of ['airstrike', 'anvil', 'napalm']) {
      if (!has(id)) continue;
      const w = WEAPON[id];
      for (const e of enemies) {
        let open = true;
        for (let y = 0; y < e.y - CHAR_R - 2; y += 3) {
          if (g.terrain.isSolid(e.x, y)) { open = false; break; }
        }
        if (!open) continue;
        const expected = id === 'airstrike' ? w.damage * 1.5 : id === 'napalm' ? w.damage * 12 : w.damage * 0.9;
        const s = killBonus(expected, e) - (id === 'airstrike' ? 50 : 20);
        if (s > best.score) best = { score: s, weapon: id, angle: null, target: { x: e.x, y: e.y } };
      }
    }

    let nearest = enemies[0];
    for (const e of enemies) if (dist(e.x, e.y, c.x, c.y) < dist(nearest.x, nearest.y, c.x, c.y)) nearest = e;

    if (g.lockedWeapon) {
      // second shotgun shot with nothing in sight: fire towards the nearest enemy anyway
      if (best.weapon !== g.lockedWeapon && nearest) {
        const dx = nearest.x - c.x, dy = nearest.y - c.y;
        best = { score: 0, weapon: g.lockedWeapon, facing: dx >= 0 ? 1 : -1, angle: clamp(Math.atan2(-dy, Math.abs(dx)) * 180 / Math.PI, -85, 85), power: 1 };
      }
    } else if ((best.score < 50 || !best.weapon) && !this.walked && nearest) {
      // Nothing worth shooting at: walk to a nearby crate, or towards the nearest enemy
      const crate = g.crates.filter(k => !k.airborne && Math.abs(k.x - c.x) < 450 && Math.abs(k.y - c.y) < 120)
        .sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0];
      best.walkDir = (crate ? crate.x : nearest.x) >= c.x ? 1 : -1;
    } else if (best.score < 0 && this.walked && nearest && ammo.teleport > 0 &&
             Math.abs(nearest.x - c.x) > 700) {
      // Still nothing after walking and the enemy is far away: teleport closer (big maps)
      const spot = this.findTeleportSpot(nearest);
      if (spot) best = { score: 0, weapon: 'teleport', angle: null, target: spot };
    }
    if (!best.weapon) {
      best = { ...best, weapon: 'bazooka', angle: 45, facing: c.facing, power: 0.6 };
    }

    // Human-like aiming error (the sniper scope helps a lot)
    if (best.angle != null) {
      const k = WEAPON[best.weapon].scope ? 0.3 : 1;
      best.angle = clamp(best.angle + rand(-noise.angle, noise.angle) * k, -85, 85);
      best.power = clamp(best.power + rand(-noise.power, noise.power), 0.1, 1);
    }
    return best;
  }
}
