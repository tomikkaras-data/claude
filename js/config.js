// ---------------------------------------------------------------------------
// Crater Clash - global configuration and constants
// ---------------------------------------------------------------------------

// World size depends on the chosen map size (see setWorldSize)
let WORLD_W = 1600;
let WORLD_H = 900;
let WATER_Y = WORLD_H - 46;          // anything below this line drowns
const TICK_RATE = 60;                // fixed simulation steps per second
const GRAVITY = 0.22;                // px / tick^2
const CHAR_R = 10;                   // character body radius
const MAX_POWER_SPEED = 15;          // launch speed at full power (px / tick)
const WIND_ACC = 0.035;              // horizontal acceleration per unit of wind
const RETREAT_TIME = 3;              // seconds to run away after attacking
const CHARGE_TICKS = 75;             // ticks to charge from 0 to full power
const WALK_SPEED = 1.1;
const MAX_CLIMB = 5;
const ROPE_MAX = 380;                // max ninja rope length
const ROPE_SHOTS = 6;                // rope shots per turn
const MINE_TRIGGER = 34;             // proximity distance
const MINE_FUSE = 70;                // ticks between trigger and blast

const DIG_TICKS = 300;               // how long each digging tool can run per turn
const FALL_SAFE_SPEED = 6.8;         // landing faster than this hurts
const FALL_DAMAGE_PER_SPEED = 7;

const MAP_SIZES = {
  small:  { w: 1600, h: 900,  label: 'Small' },
  medium: { w: 2400, h: 1100, label: 'Medium' },
  large:  { w: 3200, h: 1300, label: 'Large' },
};
const MINE_AMOUNTS = { off: 0, few: 1 / 420, many: 1 / 180 }; // mines per horizontal pixel

function setWorldSize(w, h) {
  WORLD_W = w;
  WORLD_H = h;
  WATER_Y = h - 46;
}

const TEAMS = [
  { id: 0, name: 'Red Team',    color: '#e5484d', dark: '#8c1d22' },
  { id: 1, name: 'Blue Team',   color: '#3b8fd9', dark: '#174a7a' },
  { id: 2, name: 'Purple Team', color: '#a463f2', dark: '#55278f' },
  { id: 3, name: 'Orange Team', color: '#f08c2e', dark: '#8a4a0c' },
];

// kind:
//   projectile - flies, explodes on impact (or on fuse when bounce = true)
//   hitscan    - instant shot along the aim line
//   drop       - placed at the character's feet, explodes after fuse
//   target     - click a spot on the map
//   mine       - lay a proximity mine
//   rope       - ninja rope (movement tool, does not use up the attack)
//   dig        - drill / pickaxe: hold to dig (tool, does not use up the attack)
//   burst      - automatic fire over about a second
//   walker     - hops along the ground and explodes
// tool: true   - does not use up the turn's attack
// crate: n     - comes in steel crates, n uses per crate
//   skip       - pass the turn
const WEAPONS = [
  // --- standard arsenal ---------------------------------------------------
  { id: 'bazooka',   name: 'Bazooka',      icon: '🚀', key: '1', kind: 'projectile', charge: true, wind: true, radius: 50, damage: 60, blastKnock: 1.6, ammo: Infinity },
  { id: 'grenade',   name: 'Grenade',      icon: '💣', key: '2', kind: 'projectile', charge: true, bounce: true, fuse: 180, fuseSelect: true, radius: 55, damage: 75, blastKnock: 1.6, ammo: Infinity },
  { id: 'cluster',   name: 'Cluster Bomb', icon: '🎆', key: '3', kind: 'projectile', charge: true, bounce: true, fuse: 180, fuseSelect: true, radius: 40, damage: 50, blastKnock: 1.5, ammo: 3,
    cluster: 6, bombletDamage: 34, bombletRadius: 30, subLabel: 'Bomblets', subNote: '6 bomblets after the main blast' },
  { id: 'shotgun',   name: 'Shotgun',      icon: '🔫', key: '4', kind: 'hitscan', range: 650, damage: 10, radius: 8, pellets: 6, spread: 5, shots: 2, knock: 1.3, ammo: Infinity,
    note: 'per pellet · 6 pellets · 2 shots' },
  { id: 'flamer',    name: 'Flamethrower', icon: '🌋', key: 'G', kind: 'flame', bullets: 90, spread: 6, damage: 4, ammo: 3, note: 'burn damage, 6 times a second while in the flames' },
  { id: 'bat',       name: 'Baseball Bat', icon: '🏏', key: 'B', kind: 'melee', radius: 14, damage: 30, knock: 12, ammo: 2, note: 'radius = how far it reaches · huge knockback' },
  { id: 'dynamite',  name: 'Dynamite',     icon: '🧨', key: '5', kind: 'drop', bounce: true, fuse: 300, radius: 70, damage: 75, ammo: 2 },
  { id: 'mine',      name: 'Mine',         icon: '💥', key: '6', kind: 'mine', radius: 40, damage: 45, ammo: 3 },
  { id: 'airstrike', name: 'Air Strike',   icon: '✈️', key: '7', kind: 'target', radius: 30, damage: 30, ammo: 1, missiles: 5, note: 'per missile · 5 missiles' },
  { id: 'rope',      name: 'Ninja Rope',   icon: '🪝', key: '8', kind: 'rope', tool: true, ammo: Infinity },
  { id: 'drill',     name: 'Drill',        icon: '🔩', key: '9', kind: 'dig', dig: 'down', tool: true, radius: 14, damage: 15, ammo: Infinity, note: 'when it digs into someone' },
  { id: 'pickaxe',   name: 'Pickaxe',      icon: '⛏️', key: '0', kind: 'dig', dig: 'aim', tool: true, radius: 14, damage: 15, ammo: Infinity, note: 'when it digs into someone' },
  { id: 'teleport',  name: 'Teleport',     icon: '🌀', key: 'T', kind: 'target', ammo: 2 },
  { id: 'skip',      name: 'Skip Turn',    icon: '⏭️', key: 'K', kind: 'skip', ammo: Infinity },

  // --- found in steel crates (start with 0 unless changed in Weapon settings)
  { id: 'gatling',   name: 'Gatling Gun',  icon: '⚙️', kind: 'burst', bullets: 24, spread: 3, range: 900, damage: 4, radius: 5, ammo: 0, crate: 1, note: 'per bullet · 24 bullets' },
  { id: 'sniper',    name: 'Sniper Rifle', icon: '🎯', kind: 'hitscan', scope: true, range: 3200, damage: 60, radius: 6, knock: 3, ammo: 0, crate: 2 },
  { id: 'deagle',    name: 'Desert Eagle', icon: '🦅', kind: 'hitscan', range: 1000, damage: 45, radius: 7, knock: 4.5, ammo: 0, crate: 2 },
  { id: 'nuke',      name: 'Nuka Bomb',    icon: '☢️', kind: 'projectile', charge: true, wind: true, radius: 125, damage: 100, ammo: 0, crate: 1 },
  { id: 'frog',      name: 'Robot Frog',   icon: '🐸', kind: 'walker', fuse: 300, radius: 75, damage: 80, blastKnock: 1.4, ammo: 0, crate: 2,
    babies: 5, bombletDamage: 25, bombletRadius: 32, subLabel: 'Baby frogs', subNote: '5 small frogs hop around and go off after 1–3 s' },
  { id: 'napalm',    name: 'Napalm Strike', icon: '🔥', kind: 'target', radius: 16, damage: 1, canisters: 4, ammo: 0, crate: 1, note: 'burn damage, 6 times a second' },
  { id: 'anvil',     name: 'Anvil Drop',   icon: '🔨', kind: 'target', radius: 24, damage: 55, ammo: 0, crate: 2 },
  { id: 'concrete',  name: 'Concrete Block', icon: '🧱', kind: 'target', tool: true, ammo: 0, crate: 3 },
];

// Defaults kept aside so the Weapon settings screen can reset and compare
const WEAPON_DEFAULTS = Object.fromEntries(WEAPONS.map(w => [w.id, { ...w }]));
const WEAPON_FIELDS = ['damage', 'radius', 'ammo', 'bombletDamage'];

// overrides = { weaponId: { damage, radius, ammo (-1 = unlimited), bombletDamage } }
function applyWeaponConfig(overrides) {
  const over = overrides || {};
  for (const w of WEAPONS) {
    const d = WEAPON_DEFAULTS[w.id];
    for (const f of WEAPON_FIELDS) if (f in d) w[f] = d[f];
    const o = over[w.id];
    if (!o) continue;
    for (const f of WEAPON_FIELDS) {
      if (!(f in d) || o[f] == null || !isFinite(o[f])) continue;
      w[f] = f === 'ammo' && o[f] < 0 ? Infinity : o[f];
    }
  }
}

const CRATE_AMOUNTS = {
  off:    { wood: 0, steel: 0, every: 0 },
  normal: { wood: 1 / 700, steel: 1 / 1400, every: 3 },   // per horizontal pixel; airdrop every N turns
  lots:   { wood: 1 / 380, steel: 1 / 700, every: 2 },
};
const WEAPON = Object.fromEntries(WEAPONS.map(w => [w.id, w]));

// Aim error applied by CPU players
const DIFFICULTY = {
  easy:   { angle: 7,   power: 0.08,  label: 'Easy' },
  normal: { angle: 3,   power: 0.035, label: 'Normal' },
  hard:   { angle: 0.6, power: 0.008, label: 'Hard' },
};

// gen: terrain shape for the theme (hill height, roughness, caves, floating islands, chance of a channel)
const THEMES = {
  grassland: {
    label: 'Grassy land',
    skyTop: '#5aa7e8', skyBottom: '#cfe9ff', hills: ['#8fbfa0', '#6f9f86'],
    grass: [86, 176, 64], grassDark: [58, 128, 44], dirt: [136, 92, 54], rock: [92, 66, 46],
    burn: '#3b2716', water: 'rgba(40,110,200,0.82)', waterTop: '#7cc2ff', sun: 'rgba(255,255,230,0.55)',
    gen: { amp: 1, rough: 1, caves: 1, islands: 1, channel: 0.5 },
  },
  desert: {
    label: 'Sand',
    skyTop: '#f2a65a', skyBottom: '#fde6b8', hills: ['#e0b77e', '#c99a5e'],
    grass: [238, 206, 128], grassDark: [214, 174, 96], dirt: [196, 140, 76], rock: [140, 92, 50],
    burn: '#5a3412', water: 'rgba(30,140,160,0.82)', waterTop: '#8fe3e8', sun: 'rgba(255,250,215,0.7)',
    gen: { amp: 0.75, rough: 0.45, caves: 0.5, islands: 0.6, channel: 0.3 },   // smooth rolling dunes
  },
  snow: {
    label: 'Winter',
    skyTop: '#7f9bb8', skyBottom: '#e6eef6', hills: ['#b7c7d8', '#94a8bd'],
    grass: [245, 250, 255], grassDark: [206, 220, 236], dirt: [110, 120, 140], rock: [70, 78, 96],
    burn: '#262b38', water: 'rgba(40,80,140,0.85)', waterTop: '#a8d0ff', sun: 'rgba(255,255,255,0.45)',
    gen: { amp: 1.15, rough: 0.8, caves: 0.7, islands: 1, channel: 0.5 },
    ambient: 'snow',
  },
  volcanic: {
    label: 'Volcanic',
    skyTop: '#1f0d18', skyBottom: '#b8462a', hills: ['#4a2626', '#331a1c'],
    grass: [214, 82, 34], grassDark: [128, 44, 26], dirt: [66, 56, 60], rock: [34, 30, 36],
    burn: '#120806', water: 'rgba(240,96,20,0.92)', waterTop: '#ffd166', sun: 'rgba(255,120,60,0.35)',
    gen: { amp: 1.3, rough: 1.7, caves: 1.5, islands: 0.6, channel: 0.7 },    // jagged peaks, lots of caves
    ambient: 'embers',
    cloud: 'rgba(70,45,50,0.55)',
    lava: true,
  },
};

const DEFAULT_NAMES = ['Spud', 'Nugget', 'Pickle', 'Biscuit', 'Waffle', 'Noodle', 'Turnip', 'Muffin'];

// Small helpers ------------------------------------------------------------
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
