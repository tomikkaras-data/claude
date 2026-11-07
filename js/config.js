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
const MINE_RADIUS = 40;
const MINE_DAMAGE = 45;
const MINE_TRIGGER = 34;             // proximity distance
const MINE_FUSE = 70;                // ticks between trigger and blast

const DIG_TICKS = 300;               // how long each digging tool can run per turn
const DIG_RADIUS = 14;
const DIG_DAMAGE = 15;               // when a digging tool hits a character
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
//   skip       - pass the turn
const WEAPONS = [
  { id: 'bazooka',   name: 'Bazooka',      icon: '🚀', key: '1', kind: 'projectile', charge: true,  wind: true,  bounce: false, radius: 42, damage: 50, ammo: Infinity },
  { id: 'grenade',   name: 'Grenade',      icon: '💣', key: '2', kind: 'projectile', charge: true,  wind: false, bounce: true,  fuse: 180, radius: 42, damage: 50, ammo: Infinity },
  { id: 'cluster',   name: 'Cluster Bomb', icon: '🎆', key: '3', kind: 'projectile', charge: true,  wind: false, bounce: true,  fuse: 180, radius: 28, damage: 25, ammo: 3, cluster: 5 },
  { id: 'shotgun',   name: 'Shotgun',      icon: '🔫', key: '4', kind: 'hitscan',    charge: false, range: 700, damage: 25, radius: 12, ammo: Infinity },
  { id: 'dynamite',  name: 'Dynamite',     icon: '🧨', key: '5', kind: 'drop',       charge: false, bounce: true,  fuse: 300, radius: 70, damage: 75, ammo: 2 },
  { id: 'mine',      name: 'Mine',         icon: '💥', key: '6', kind: 'mine',       charge: false, ammo: 3 },
  { id: 'airstrike', name: 'Air Strike',   icon: '✈️', key: '7', kind: 'target',     charge: false, radius: 30, damage: 30, ammo: 1, missiles: 5 },
  { id: 'rope',      name: 'Ninja Rope',   icon: '🪝', key: '8', kind: 'rope',       charge: false, ammo: Infinity, tool: true },
  { id: 'drill',     name: 'Drill',        icon: '🔩', key: '9', kind: 'dig',        charge: false, ammo: Infinity, tool: true, dig: 'down' },
  { id: 'pickaxe',   name: 'Pickaxe',      icon: '⛏️', key: '0', kind: 'dig',        charge: false, ammo: Infinity, tool: true, dig: 'aim' },
  { id: 'teleport',  name: 'Teleport',     icon: '🌀', key: 'T', kind: 'target',     charge: false, ammo: 2 },
  { id: 'skip',      name: 'Skip Turn',    icon: '⏭️', key: 'K', kind: 'skip',       charge: false, ammo: Infinity },
];
const WEAPON = Object.fromEntries(WEAPONS.map(w => [w.id, w]));

// Aim error applied by CPU players
const DIFFICULTY = {
  easy:   { angle: 7,   power: 0.08,  label: 'Easy' },
  normal: { angle: 3,   power: 0.035, label: 'Normal' },
  hard:   { angle: 0.6, power: 0.008, label: 'Hard' },
};

const THEMES = {
  grassland: {
    label: 'Grassland',
    skyTop: '#5aa7e8', skyBottom: '#cfe9ff', hills: ['#8fbfa0', '#6f9f86'],
    grass: [86, 176, 64], grassDark: [58, 128, 44], dirt: [136, 92, 54], rock: [92, 66, 46],
    burn: '#3b2716', water: 'rgba(40,110,200,0.82)', waterTop: '#7cc2ff',
  },
  desert: {
    label: 'Desert',
    skyTop: '#f2a65a', skyBottom: '#fde6b8', hills: ['#e0b77e', '#c99a5e'],
    grass: [238, 206, 128], grassDark: [214, 174, 96], dirt: [196, 140, 76], rock: [140, 92, 50],
    burn: '#5a3412', water: 'rgba(30,140,160,0.82)', waterTop: '#8fe3e8',
  },
  snow: {
    label: 'Snow',
    skyTop: '#7f9bb8', skyBottom: '#e6eef6', hills: ['#b7c7d8', '#94a8bd'],
    grass: [245, 250, 255], grassDark: [206, 220, 236], dirt: [110, 120, 140], rock: [70, 78, 96],
    burn: '#262b38', water: 'rgba(40,80,140,0.85)', waterTop: '#a8d0ff',
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
