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
const WIND_ACC = 0.055;              // horizontal acceleration per unit of wind
const RETREAT_TIME = 3;              // seconds to run away after attacking
const CHARGE_TICKS = 75;             // ticks to charge from 0 to full power
const WALK_SPEED = 1.1;
const MAX_CLIMB = 9;              // how steep a step characters can walk up
const ROPE_MAX = 380;                // max ninja rope length
const ROPE_SHOTS = 6;                // rope shots per turn
const MINE_TRIGGER = 34;             // proximity distance
const MINE_FUSE = 70;                // ticks between trigger and blast

const DIG_TICKS = 300;               // how long each digging tool can run per turn
const FALL_SAFE_SPEED = 6.8;         // landing faster than this hurts
const FALL_DAMAGE_PER_SPEED = 7;
const BARRELS = { perPixel: 1 / 520, radius: 32, damage: 25, flames: 24, fireDamage: 2 };
const SMOKE_GROW = 40;
const SLING_PULL = 110;              // how far (world px) you drag the slingshot back for full power
const PLASMA_WEAPONS = new Set(['plasmafrag', 'greenlet', 'microlet', 'plasmagrenade', 'miniplasma']);
const CRATE_BLAST = { radius: 22, damage: 15, fires: 12, fireDamage: 2, pellets: [10, 20], pellet: { range: 320, damage: 8, radius: 4, knock: 1.2 } };
const DEATH_BLAST = { radius: 28, damage: 20, delay: 35 }; // knocked-out characters go off with a small bang

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
// group: where it sits in the weapon bar and the Weapon settings table
//   basic / rare / epic / legendary weapons, and tools & items
// crate: n  - steel crates hold n more (alien: true - only alien crates hold it)
const WEAPONS = [
  // --- Basic weapons: always around, simple and dependable ---------
  { id: 'bazooka',   name: 'Bazooka',      icon: '🚀', key: '1', group: 'basic', fam: 'launch', kind: 'projectile', charge: true, wind: true, radius: 50, damage: 60, blastKnock: 1.6, ammo: Infinity },
  { id: 'grenade',   name: 'Grenade',      icon: '💣', key: '2', group: 'basic', fam: 'launch', kind: 'projectile', charge: true, bounce: true, fuse: 180, fuseSelect: true, radius: 55, damage: 75, blastKnock: 1.6, ammo: Infinity },
  { id: 'shotgun',   name: 'Shotgun',      icon: '🔫', key: '4', group: 'basic', fam: 'gun', kind: 'hitscan', range: 650, damage: 10, radius: 8, pellets: 6, spread: 5, shots: 2, knock: 1.3, ammo: Infinity,
    note: 'per pellet · 6 pellets · 2 shots' },
  { id: 'mp5',       name: 'H&K MP5',      icon: '🔴', key: 'I', group: 'basic', fam: 'gun', kind: 'smg', laser: 300, burst: 3, shots: 4, range: 700, spread: 1.5, damage: 5, radius: 4, knock: 0.8, ammo: 2,
    note: 'per round · 4 bursts of 3 rounds per turn · red laser dot on targets within 300' },
  { id: 'bat',       name: 'Baseball Bat', icon: '🏏', key: 'B', group: 'basic', fam: 'melee', kind: 'melee', radius: 14, damage: 30, knock: 12, ammo: 2, note: 'radius = how far it reaches · huge knockback' },
  { id: 'boomerang', name: 'Boomerang',    icon: '🪃', key: 'E', group: 'basic', fam: 'melee', kind: 'boomerang', charge: true, radius: 14, damage: 20, knock: 11, ammo: 2,
    note: 'radius = how close it has to pass · huge knockback · comes back to you' },
  { id: 'dynamite',  name: 'Dynamite',     icon: '🧨', key: '5', group: 'basic', fam: 'placed', kind: 'drop', bounce: true, fuse: 300, radius: 70, damage: 50, ammo: 2 },
  { id: 'mine',      name: 'Mine',         icon: '💥', key: '6', group: 'basic', fam: 'placed', kind: 'mine', radius: 40, damage: 45, ammo: 3 },

  // --- Rare weapons: stronger or trickier, a few uses each ---------
  { id: 'cluster',   name: 'Cluster Bomb', icon: '🎆', key: '3', group: 'rare', fam: 'launch', kind: 'projectile', charge: true, bounce: true, fuse: 180, fuseSelect: true, radius: 40, damage: 50, blastKnock: 1.5, ammo: 3,
    cluster: 6, bombletDamage: 34, bombletRadius: 30, subLabel: 'Bomblets', subNote: '6 bomblets after the main blast' },
  { id: 'drillrocket', name: 'Drilling Rocket', icon: '🪛', key: 'V', group: 'rare', fam: 'launch', kind: 'projectile', charge: true, wind: true, driller: true, drillTicks: 180, drillHole: 24, radius: 64, damage: 50, blastKnock: 1.4, ammo: 2,
    note: 'bores a wide tunnel through rock for up to 3 s, then a big blast' },
  { id: 'boulder',   name: 'Lava Boulder', icon: '🪨', key: 'H', group: 'rare', fam: 'launch', kind: 'boulder', charge: true, bounces: 6, radius: 50, damage: 35, blastKnock: 1.2, ammo: 2,
    note: 'explodes on every one of its 6 bounces, spreading fire each time' },
  { id: 'flashbang', name: 'Flashbang',    icon: '🔆', key: 'O', group: 'rare', fam: 'tactical', kind: 'projectile', charge: true, bounce: true, fuse: 120, fuseSelect: true,
    radius: 160, ammo: 2, note: 'radius = how far the flash reaches · no damage · anyone caught is dazed on their next turn' },
  { id: 'smoke',     name: 'Smoke Grenade', icon: '🌫️', key: 'L', group: 'rare', fam: 'tactical', kind: 'projectile', charge: true, bounce: true, fuse: 120, fuseSelect: true,
    smokeRadius: 100, ammo: 2, note: 'no damage · a cloud of radius 100 that stays all game and hides other teams inside it' },
  { id: 'gas',       name: 'Gas Grenade',  icon: '☣️', group: 'rare', fam: 'tactical', kind: 'projectile', charge: true, bounce: true, fuse: 120, fuseSelect: true, radius: 90, damage: 1, ammo: 2,
    note: 'radius = size of the gas cloud · damage 3 times a second to anyone inside · the gas never clears' },
  { id: 'deagle',    name: 'Desert Eagle', icon: '🦅', group: 'rare', fam: 'gun', kind: 'hitscan', range: 1000, damage: 45, radius: 7, knock: 4.5, ammo: 1, crate: 2 },
  { id: 'sniper',    name: 'Sniper Rifle', icon: '🎯', group: 'rare', fam: 'gun', kind: 'hitscan', scope: true, range: 3200, damage: 60, radius: 6, knock: 3, ammo: 1, crate: 2 },
  { id: 'flamer',    name: 'Flamethrower', icon: '🌋', key: 'G', group: 'rare', fam: 'gun', kind: 'flame', bullets: 90, spread: 6, damage: 4, ammo: 3, note: 'burn damage, 6 times a second while in the flames' },
  { id: 'claymore',  name: 'Claymore',     icon: '⚠️', group: 'rare', fam: 'trap', kind: 'claymore', radius: 40, damage: 50, pellets: 14, ammo: 2,
    note: 'goes off the moment an enemy touches it, spraying shrapnel the way it faces' },
  { id: 'mouse',     name: 'Mine Mouse',   icon: '🐭', key: 'Y', group: 'rare', fam: 'trap', kind: 'mouse', life: 390, dropStart: 90, dropEvery: 30, radius: 25, damage: 20, pellets: 35, ammo: 1,
    note: 'walks for 6.5 s; from 1.5 s on it lays a mine every 0.5 s; then bursts into 35 pellets' },

  // --- Epic weapons: big area damage, strikes from the sky and remote-controlled gadgets 
  { id: 'plasmagrenade', name: 'Plasma Frag Grenade', icon: '🧪', key: 'Z', group: 'epic', fam: 'launch', kind: 'projectile', charge: true, bounce: true, fuse: 180, fuseSelect: true,
    radius: 40, damage: 40, blastKnock: 1.3, ammo: 2, frags: 10, fragClusters: 5, clusterDamage: 12, clusterRadius: 18,
    microClusters: 3, microDamage: 7, microRadius: 13,
    bombletDamage: 22, bombletRadius: 28, subLabel: 'Plasma frags', subNote: '10 frags → 5 green clusters each → 3 tiny ones each' },
  { id: 'magnet',    name: 'Magnet Grenade', icon: '🧲', group: 'epic', fam: 'launch', kind: 'projectile', charge: true, bounce: true, fuse: 240,
    radius: 40, damage: 40, blastKnock: 1.2, pullRadius: 100, stickRadius: 50, armTicks: 60, ammo: 1, crate: 1,
    note: 'heavy grenade · turns red after 1 s and pulls everything within 100 px (stronger the closer) · within 50 px things stick to it · implodes after 4 s · radius/damage = the implosion blast' },
  { id: 'gatling',   name: 'Gatling Gun',  icon: '⚙️', group: 'epic', fam: 'gun', kind: 'burst', bullets: 24, spread: 3, range: 900, damage: 4, radius: 5, ammo: 1, crate: 1, note: 'per bullet · 24 bullets' },
  { id: 'airstrike', name: 'Air Strike',   icon: '✈️', key: '7', group: 'epic', fam: 'sky', kind: 'target', radius: 30, damage: 30, ammo: 1, missiles: 5, note: 'per missile · 5 missiles' },
  { id: 'napalm',    name: 'Napalm Strike', icon: '🔥', group: 'epic', fam: 'sky', kind: 'target', radius: 16, damage: 1, canisters: 4, ammo: 1, crate: 1, note: 'burn damage, 6 times a second' },
  { id: 'anvil',     name: 'Lava Anvil',   icon: '🔨', group: 'epic', fam: 'sky', kind: 'target', radius: 24, damage: 55, ammo: 1, crate: 2 },
  { id: 'drone',     name: 'Drone',        icon: '🛸', key: 'N', group: 'epic', fam: 'robot', kind: 'drone', speed: 3.2, ctrlTicks: 180, radius: 45, damage: 55, blastKnock: 1.3, ammo: 2,
    note: 'steer it for 3 s, then it drops',
    cluster: 5, bombletDamage: 25, bombletRadius: 26, subLabel: 'Drone bomblets', subNote: '5 bomblets scatter when it explodes' },
  { id: 'dozer',     name: 'Robo Dozer',   icon: '🚜', group: 'epic', fam: 'robot', kind: 'dozer', life: 480, speed: 1.4, digRadius: 28, radius: 40, damage: 40, ammo: 1,
    bombletDamage: 30, bombletRadius: 35, subLabel: 'Mini dynamites', subNote: '3 dropped when it stops',
    note: 'drive it with ←/→ for 8 s · digs a big tunnel · FIRE stops it early' },
  { id: 'frog',      name: 'Frog Clone Bomb', icon: '🐸', group: 'epic', fam: 'robot', kind: 'walker', fuse: 300, radius: 75, damage: 80, blastKnock: 1.4, ammo: 1, crate: 2,
    babies: 5, bombletDamage: 25, bombletRadius: 32, subLabel: 'Frog clones', subNote: '5 clones hop around and go off after 1–3 s' },
  { id: 'tornado',   name: 'Tornado',      icon: '🌪️', key: 'Q', group: 'epic', fam: 'nature', kind: 'tornado', radius: 60, damage: 10, life: 480, speed: 1.1, ammo: 1,
    note: 'radius = full size it grows to · damage when it throws someone out' },

  // --- Legendary weapons: game changers, only from steel and alien crates 
  { id: 'nuke',      name: 'Nuka Bomb',    icon: '☢️', group: 'legendary', fam: 'bomb', kind: 'projectile', charge: true, wind: true, radius: 125, damage: 75, ammo: 1, crate: 1 },
  { id: 'tsar',      name: 'Tsar Bomb',    icon: '💀', group: 'legendary', fam: 'bomb', kind: 'projectile', charge: true, wind: true, radius: 250, damage: 75, blastKnock: 1.3, ammo: 1, crate: 1,
    note: 'like the Nuka Bomb with twice the blast radius' },
  { id: 'plasma',    name: 'Star Cannon', icon: '🌟', key: 'X', group: 'legendary', fam: 'alien', kind: 'plasma', speed: 3.2, life: 900, radius: 25, damage: 7, ammo: 1, crate: 1, alien: true,
    note: 'radius = size of the plasma ball · damage every 1/5 s while it passes through someone',
    bombletDamage: 85, bombletRadius: 180, subLabel: 'Detonation', subNote: 'press FIRE again while it flies',
    miniBalls: 25, miniDamage: 25, miniRadius: 30, miniClusters: 5, burstClusters: 20, toxicSpray: 110, clusterDamage: 15, clusterRadius: 20 },
  { id: 'blaster',   name: 'Alien Blaster', icon: '👽', group: 'legendary', fam: 'alien', kind: 'blaster', speed: 9, life: 80, damage: 25, radius: 45, ammo: 1, crate: 1, alien: true,
    note: 'damage to each character the bolt passes through · it goes through everything',
    bombletDamage: 40, subLabel: 'End blast', subNote: 'fire and plasma where the bolt runs out' },

  // --- Tools & items (they don't use up the attack, except Teleport and Rest & Heal) 
  { id: 'rope',      name: 'Ninja Rope',   icon: '🪝', key: '8', group: 'tool', fam: 'move', kind: 'rope', tool: true, ammo: Infinity },
  { id: 'jetpack',   name: 'Jetpack',      icon: '🎒', key: 'J', group: 'tool', fam: 'move', kind: 'jetpack', tool: true, fuel: 360, ammo: 2, note: '6 s of thrust per use' },
  { id: 'sling',     name: 'Slingshot',    icon: '🏹', group: 'tool', fam: 'move', kind: 'sling', charge: true, tool: true, power: 14, ammo: 2,
    note: 'fling yourself across the map (fall damage still counts)' },
  { id: 'parachute', name: 'Parachute',    icon: '🪂', key: 'U', group: 'tool', fam: 'move', kind: 'chute', tool: true, ammo: 3, note: 'opens by itself when you fall while it is selected' },
  { id: 'teleport',  name: 'Teleport',     icon: '🌀', key: 'T', group: 'tool', fam: 'move', kind: 'target', ammo: 2 },
  { id: 'drill',     name: 'Drill',        icon: '🔩', key: '9', group: 'tool', fam: 'dig', kind: 'dig', dig: 'down', tool: true, radius: 14, damage: 15, ammo: Infinity, note: 'when it digs into someone' },
  { id: 'pickaxe',   name: 'Pickaxe',      icon: '⛏️', key: '0', group: 'tool', fam: 'dig', kind: 'dig', dig: 'aim', tool: true, radius: 14, damage: 15, ammo: Infinity, note: 'when it digs into someone' },
  { id: 'concrete',  name: 'Concrete Block', icon: '🧱', group: 'tool', fam: 'protect', kind: 'target', tool: true, ammo: 1, crate: 3 },
  { id: 'suit',      name: 'Hazmat Suit',  icon: '🦺', group: 'tool', fam: 'protect', kind: 'suit', tool: true, ammo: 1,
    note: 'blocks toxic, plasma and fire damage while worn · you only see through the mask' },
  { id: 'supply',    name: 'Supply Call',  icon: '📻', group: 'tool', fam: 'support', kind: 'target', tool: true, ammo: 0, crate: 1,
    note: 'found in steel crates · click a spot and a parachute crate with a specific epic or legendary weapon lands there' },
  { id: 'skip',      name: 'Rest & Heal',  icon: '🩹', key: 'K', group: 'tool', fam: 'support', kind: 'skip', heal: 50, ammo: Infinity,
    note: 'ends your turn · +50 health and 20% less damage for 3 rounds' },
];

const WEAPON_GROUPS = [['basic', 'Basic'], ['rare', 'Rare'], ['epic', 'Epic'], ['legendary', 'Legendary'], ['tool', 'Tools & items']];

// Defaults kept aside so the Weapon settings screen can reset and compare
const WEAPON_DEFAULTS = Object.fromEntries(WEAPONS.map(w => [w.id, { ...w }]));
const WEAPON_FIELDS = ['damage', 'radius', 'ammo', 'bombletDamage'];

// overrides = { weaponId: { damage, radius, ammo (-1 = unlimited), bombletDamage } }
// Arsenal presets for the menu
//   standard  - the normal ammo, at least one of every weapon
//   minimal   - only basic weapons and movement items, all unlimited; nothing rare or huge
//   unlimited - every weapon, special ones included, unlimited
const ARSENALS = {
  standard:  { label: 'Standard (at least 1 of everything)' },
  minimal:   { label: 'Minimal (basic weapons + movement, unlimited)' },
  unlimited: { label: 'Everything unlimited' },
};
const MINIMAL_WEAPONS = new Set(['bazooka', 'grenade', 'shotgun', 'mp5', 'bat', 'mine',
  'rope', 'sling', 'jetpack', 'parachute', 'drill', 'pickaxe', 'teleport', 'skip']);

function applyWeaponConfig(overrides, arsenal) {
  const over = overrides || {};
  const unlimited = arsenal === 'unlimited' || arsenal === true;
  const minimal = arsenal === 'minimal';
  for (const w of WEAPONS) {
    const d = WEAPON_DEFAULTS[w.id];
    for (const f of WEAPON_FIELDS) if (f in d) w[f] = d[f];
    if (unlimited) w.ammo = Infinity;
    if (minimal) w.ammo = MINIMAL_WEAPONS.has(w.id) ? Infinity : 0;
    const o = over[w.id];
    if (!o) continue;
    for (const f of WEAPON_FIELDS) {
      if (!(f in d) || o[f] == null || !isFinite(o[f])) continue;
      if (f === 'ammo' && (unlimited || minimal)) continue; // presets decide the ammo
      w[f] = f === 'ammo' && o[f] < 0 ? Infinity : o[f];
    }
  }
}

const CRATE_AMOUNTS = {
  off:    { wood: 0, steel: 0, alien: 0, every: 0 },
  normal: { wood: 1 / 700, steel: 1 / 1400, alien: 1 / 2400, every: 3 },   // per horizontal pixel; airdrop every N turns
  lots:   { wood: 1 / 380, steel: 1 / 700, alien: 1 / 1200, every: 2 },
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
    ambient: 'leaves',
  },
  desert: {
    label: 'Sand',
    skyTop: '#f2a65a', skyBottom: '#fde6b8', hills: ['#e0b77e', '#c99a5e'],
    grass: [238, 206, 128], grassDark: [214, 174, 96], dirt: [196, 140, 76], rock: [140, 92, 50],
    burn: '#5a3412', water: 'rgba(30,140,160,0.82)', waterTop: '#8fe3e8', sun: 'rgba(255,250,215,0.7)',
    gen: { amp: 0.75, rough: 0.45, caves: 0.5, islands: 0.6, channel: 0.3 },   // smooth rolling dunes
    ambient: 'dust',
  },
  snow: {
    label: 'Winter',
    skyTop: '#7f9bb8', skyBottom: '#e6eef6', hills: ['#b7c7d8', '#94a8bd'],
    grass: [245, 250, 255], grassDark: [206, 220, 236], dirt: [110, 120, 140], rock: [70, 78, 96],
    burn: '#262b38', water: 'rgba(40,80,140,0.85)', waterTop: '#a8d0ff', sun: 'rgba(255,255,255,0.45)',
    gen: { amp: 1.15, rough: 0.8, caves: 0.7, islands: 1, channel: 0.5 },
    ambient: 'snow',
  },
  city: {
    label: 'City (mixed)',
    skyTop: '#6a8fc7', skyBottom: '#d9e4f2', hills: ['#9aa6b8', '#7d8a9e'],
    grass: [92, 170, 70], grassDark: [62, 124, 50], dirt: [128, 92, 60], rock: [86, 70, 58],
    burn: '#33261b', water: 'rgba(40,100,170,0.85)', waterTop: '#86c1f5', sun: 'rgba(255,250,225,0.55)',
    gen: { amp: 0.55, rough: 0.5, caves: 0.6, islands: 0, channel: 0.35 },
    city: true,     // indestructible buildings and blocks on top of normal ground
    ambient: 'leaves',
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
