# Crater Clash

A turn-based 2D artillery game for **2–8 players** that runs in the browser. Pick your fighters, split them into teams and blow up the landscape until one team is left standing. It's an original game in the classic artillery genre made popular by games like *Worms 2*.

![genre: artillery](https://img.shields.io/badge/genre-artillery-orange) ![no build step](https://img.shields.io/badge/build-none-brightgreen)

## How to run

There's nothing to install. Open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari). It works on desktop, phones and tablets.

You can also serve it locally if you like:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Main menu

| Setting | Options |
|---|---|
| Characters | 2 to 8 |
| Each character | name, **Human** or **CPU**, one of 4 teams (Red, Blue, Purple, Orange) |
| Turn time | 15–120 seconds |
| Health | 25–300 HP per character |
| CPU skill | Easy / Normal / Hard (how accurately CPU players aim) |
| Map size | Small (1600×900), Medium (2400×1100) or Large (3200×1300) |
| Mines | None, A few or Lots (scattered around the map at the start) |
| Crates | None, Normal (supply drop every 3 turns) or Lots (every 2 turns) |
| Arsenal | **Standard** (the normal ammo, at least one of every weapon), **Minimal** (only basic weapons and movement items, all unlimited; no rare, huge-blast or high-damage weapons, and only wooden crates) or **Everything unlimited** |
| Weapon settings | Damage, blast radius and starting ammo for every weapon (see below) |
| Friendly fire | On (default: anyone can be hurt, including yourself) or Off (teammates and yourself are safe) |
| Theme | Random, Grassy land, Sand, Winter, Volcanic or City (mixed) |
| Crate labels | Hidden (surprise) or show what's inside each crate as small text above it |

You need at least two different teams to start. The menu remembers your setup.

## Rules

* Every match gets a randomly generated, fully destructible map with hills, caves, floating islands and sometimes a water channel. Characters spawn at random spots.
* The game is **turn-based**. Teams take turns in rotation, and inside a team the characters take turns too. Only one character acts at a time.
* Each turn has a time limit. You can move around, but you can **attack only once**. After the attack you get 3 seconds to retreat, then the next player's turn starts.
* With **friendly fire on** (the default), every blast hurts everyone in range, including yourself. Turn it off and characters on the same team can't hurt each other and you can't hurt yourself (explosions still destroy the ground under anyone).
* A character who is knocked out goes off with a small explosion a moment later, which can hurt anyone standing next to them.
* Falling into the water knocks a character out instantly.
* **Fall damage:** a drop of more than about 100 pixels hurts, and higher falls hurt more. This also counts when an explosion throws you or you let go of the rope too high.
* The **rope, jetpack, parachute, drill and pickaxe** are tools. Using them doesn't use up your attack, so you can dig or swing into position and then still shoot.
* When every human player is out and only CPU players are left, a **Skip to end** button appears. It fast-forwards the rest of the match silently and shows the winner.
* Wind changes every turn and pushes everything that flies without bouncing: the bazooka, drilling rocket, Nuka Bomb, and air strike and napalm canisters. Grenades aren't affected.
* Mines go off about a second after an enemy gets close, and straight away when anything hits them: an explosion, a bullet, a flame or a projectile. Mines that were on the map from the start hurt everyone. Mines laid by a team only react to (and hurt) the other teams. Explosions set off nearby mines.
* The **last team with living characters wins**.

## Map themes

Every map is generated randomly. The theme changes both the look and the shape of the land:

| Theme | Land | Extras |
|---|---|---|
| Grassy land | Rolling hills, caves and floating islands | |
| Sand | Smooth, low dunes with few caves | |
| Winter | Tall snowy ridges | Falling snow |
| Volcanic | Jagged basalt peaks with lots of caves and a glowing crust | Lava instead of water, rising embers |
| City (mixed) | Indestructible concrete and steel buildings, loose blocks and girders on top of normal grass and soil, which can still be blown up. Dig or blast away more than half of the ground under a building and it collapses into chunks of concrete (or steel) that fall (a few damage to anyone underneath) and stay on the map as ordinary, destructible rubble | A skyline in the background, wind-blown leaves |

Leaves (grassy land, city), sand (desert), snow (winter) and embers (volcanic) blow across the screen with the wind, so you can see how strong it is; the clouds move with it too.

## Barrels

Red **fire barrels** and green **toxic barrels** are scattered around every map. They can't be opened. Hit one with anything (a blast, a bullet, a flame, a projectile, a tornado) and it explodes and sprays burning fuel or toxic sludge around it.

## Weapon categories

Weapons are grouped into **Basic**, **Rare**, **Epic**, **Legendary** and **Tools & items**, with similar things next to each other. On desktop the weapon bar shows one category at a time with tabs to switch (it follows the weapon you pick by key); on phones the picker lists them all by category; the Weapon settings table uses the same groups.

## Weapon settings

The **Weapon settings** button in the menu opens a table of every weapon. You can change its damage, blast radius and how much ammo each team starts with (leave ammo empty for unlimited). Changed values are highlighted and remembered. **Reset all to defaults** undoes everything.

Tick **All weapons unlimited** at the top of that screen to give every team every weapon, the special crate weapons included, with unlimited ammo from the start. While it's on, wooden crates hand out health, power-ups and armor instead of ammo. Special weapons start at 1 each; change that here too.

## Crates

* Wooden and steel crates lie around the map at the start. Supply drops parachute in more crates every few turns.
* Walk into a crate to open it. A crate that gets hit by an explosion, a bullet, a flame or a projectile bursts with a small blast and sprays 10–20 pieces of shrapnel in every direction, like shotgun pellets. Bullets stop at crates. Steel crates also spray burning fuel all around when they burst.
* **Wooden crates** hold one of:
  * +35 health
  * ⚡ a power-up (your next attack does +50% damage)
  * 🛡 armor (halves incoming damage until it has absorbed 40)
  * more ammo for a weapon your team already has
* **Alien crates** (dark purple with a glowing green alien face, the rarest kind) hold a 🌟 Star Cannon or a 👽 Alien Blaster. When one is destroyed it goes off like a plasma frag grenade.
* **Steel crates** hold more special weapons (not the alien ones). Every team starts with **one of each** special weapon:

| Weapon | Per crate | What it does |
|---|---|---|
| ⚙️ Gatling Gun | 1 | 24 rapid bullets over about a second; you can keep aiming while it fires |
| 🎯 Sniper Rifle | 2 | Scoped aim with a laser sight and fine aiming; long range, high damage |
| 🦅 Desert Eagle | 2 | Single high-damage pistol shot with strong knockback |
| ☢️ Nuka Bomb | 1 | Launched like the bazooka; enormous blast (75 damage, very wide radius) |
| 💀 Tsar Bomb | 1 | Like the Nuka Bomb with twice the blast radius (250) |
| 🐸 Frog Clone Bomb | 2 | Big frog that hops forward (high hops) – press FIRE again to set it off early – turns at walls and explodes after 5 seconds or when it reaches an enemy. The blast releases 5 frog clones that hop around at random and go off after 1–3 seconds each |
| 🔥 Napalm Strike | 1 | Click a target; burning napalm sticks to the ground and hurts anyone standing in it |
| 🔨 Lava Anvil | 2 | Click a target; a red-hot anvil drops straight down, melts its way down through rock leaving fire along the shaft, and explodes at the bottom (or when it hits someone) |
| 🟢 Star Cannon | 1 | Fires a toxic green plasma ball (radius 25) straight along your aim: slow, no gravity, no wind. It eats through rock and zaps anyone it passes through 5 times a second. Press FIRE again while it flies to detonate it: the ball stops, swells until it fills the whole blast area and the whole screen goes white. When the light fades it goes off: a huge blast (radius 180), a gush of toxic plasma from the centre in every direction, fire across the area, a shower of 20 green cluster bomblets, and 25 small plasma balls shooting off in random directions. Each small ball bursts when it hits rock, a character, a crate or a mine and splits into 5 more green cluster bomblets. If you don't, it goes off by itself after 15 seconds |
| 👽 Alien Blaster | 1 | A small green bolt that flies straight through rock and characters, burning and zapping everyone it passes (25 each) and leaving a trail of fire and toxic plasma; it ends in a fire-and-plasma blast |
| 🧱 Concrete Block | 3 | Click to place a slab of new ground; `R` rotates it. It's a tool, so it doesn't use up your attack |

## Controls (human players)

| Key | Action |
|---|---|
| `←` `→` (or `A` `D`) | Walk / turn around |
| `↑` `↓` (or `W` `S`) | Aim |
| `Space` | Hold to charge power, release to fire (instant for Shotgun and Dynamite) |
| `Enter` | Jump forward |
| `Backspace` | Backflip (high jump) |
| `1`–`9`, `0`, `T`, `K`, `Tab`, or click the weapon bar | Pick a weapon |
| Mouse click | Pick the target for Air Strike or Teleport |
| Drag the map | Look around |
| Mouse wheel or `+` / `−` | Zoom |
| `C` | Re-centre the camera |
| `F` | Grenade / Cluster Bomb timer: 1–5 seconds |
| `R` | Rotate the Concrete Block |
| `Esc` / `P` | Pause |
| `M` | Mute sound |

Several human players share one keyboard (hot-seat).

**Ninja Rope:** aim and press `Space` to shoot the rope. Swinging into a wall bounces you off it, and pressing the arrow pointing away from a wall you're touching kicks you off it hard. It sticks to any ground within reach. Swing with `←` `→`, climb up or down with `↑` `↓`, and let go with `Space` or `Enter`. You get 6 rope shots per turn, and using the rope doesn't use up your attack, so you can swing into position and then fire.

## Phones and tablets

* On-screen controls appear on touch screens. The left pad walks (◀ ▶) and aims (▲ ▼). On the right, hold **FIRE** to charge and let go to shoot, plus **JUMP** and **↶** (backflip).
* Pick weapons from the scrollable bar at the bottom.
* Drag one finger to look around and pinch to zoom.
* For Air Strike and Teleport, tap the spot on the map.
* The weapon button at the right edge (above JUMP and FIRE) shows your current weapon and opens a picker with every weapon, grouped into Weapons, Tools and Special. The ⏱ button sets the grenade timer and ↻ rotates the Concrete Block. Special weapons from crates appear in the weapon bar once found.
* The game switches to fullscreen when a match starts, where the browser allows it. Landscape works best; in portrait a small hint suggests rotating.
* **❚❚** (top left) pauses the game. The pause menu has a fullscreen toggle.

## Weapons and tools

| # | Weapon | Ammo | Notes |
|---|---|---|---|
| 1 | Bazooka | ∞ | Explodes on impact with a big knockback, affected by wind |
| 2 | Grenade | ∞ | Bounces, explodes with a big knockback when its timer runs out (1–5 s, set with `F`) |
| 3 | Cluster Bomb | 3 | Like the grenade, then bursts into 6 bomblets |
| V | Drilling Rocket | 2 | Fired like the bazooka (wind pushes it). When it hits rock it bores a very wide tunnel in the same direction for up to 3 seconds, then explodes with a big blast (radius 64). If it breaks out of the rock into open air first, it explodes right there |
| — | Robo Dozer | 1 | A big bulldozer that sets off the way you face. Steer it with ←/→ like the drone, but it can't fly: it drives along the ground, or digs a tunnel twice the size of the pickaxe's through rock, pushing characters aside. After 8 seconds, or when you press FIRE again, it stops, drops 3 mini dynamites and blows up |
| Q | Tornado | 1 | Sets off a tornado that travels along the ground the way you face (turning back at steep walls) and grows to a radius of 60. Characters, mines and crates that get close are sucked in and spun up to the top. Characters are thrown out in a random direction (10 damage) and always take fall damage when they land; crates burst and mines explode at the top. It dies out after 8 seconds |
| N | Drone | 2 | Launches along your aim and flies forward; steer it with ←/→ for 3 seconds, then its motor cuts out and it drops. Explodes on contact and scatters 5 cluster bomblets |
| Z | Plasma Frag Grenade | 2 | Bouncy grenade (timer 1–5 s). When it goes off, 10 big green plasma frags fly out; each bursts on impact and splits into 5 green cluster bomblets, and each of those splits once more into 3 tiny ones |
| H | Lava Boulder | 2 | Hold to charge the throw. The glowing boulder explodes (radius 50) every time it hits the ground, a character or a crate, sets fire all around, and bounces on – 6 times in all |
| L | Smoke Grenade | 2 | No damage, no crater. Makes a smoke cloud of radius 100 that stays for the rest of the game. Characters inside it are invisible to the other teams (and the CPU can't target them) |
| E | Boomerang | 2 | Hold to charge the throw. It flies out, curves back to you and can be caught. Anyone it passes through takes 20 damage and is knocked a long way |
| Y | Mine Mouse | 1 | Scurries along the ground for 6.5 seconds. From 1.5 s on it lays one of your mines every 0.5 s, then it bursts with 35 pellets in every direction |
| O | Flashbang | 2 | Bouncy grenade (timer 1–5 s). A huge white flash, no damage and no crater. Everyone within its radius (160) is dazed on their next turn: their screen keeps washing out white and their aim drifts up and down by itself |
| I | H&K MP5 | 2 | Laser sight: a red line, and a red dot on whatever it points at within 300. Each press fires a 3-round burst (5 damage per round); 4 bursts per turn, and you can move between them |
| — | Claymore | 2 | Planted facing the way you look. Goes off the instant an enemy touches it, with a blast and a fan of shrapnel thrown forward |
| — | Gas Grenade | 2 | Bouncy grenade (timer 1–5 s). Leaves a green toxic gas cloud (radius 90) that never clears and hurts anyone inside it 3 times a second |
| 4 | Shotgun | ∞ | 6 spreading pellets per shot, **two shots per turn**; you can move between them |
| G | Flamethrower | 3 | Sprays fire for 1.5 s and pushes targets back a little; you can keep aiming while it burns. Some flames stick and keep burning |
| B | Baseball Bat | 2 | Hits someone right next to you for 30 damage and sends them flying |
| 5 | Dynamite | 2 | Dropped at your feet; big blast (50 damage, wide radius) after 5 seconds |
| 6 | Mine | 3 | Drops a proximity mine (only enemies set it off) |
| 7 | Air Strike | 1 | Click or tap a target, 5 missiles rain down |
| 8 | Ninja Rope | ∞ | Tool: swing around the map |
| — | Slingshot | 2 | Tool: a big red Y appears next to you. Drag your character back like a catapult (or aim and hold Space) and let go: you fly the opposite way, further the more you pulled. No fall damage, and it doesn't use your attack |
| — | Supply Call | 0 | Item from steel crates: click a spot and a gold parachute crate holding a specific epic or legendary weapon lands there (its label shows which) |
| J | Jetpack | 2 | Tool: press Space to put it on, ↑ to fly, ←/→ to steer; 6 s of fuel. Pressing Space again or picking another weapon takes it off, and the controls go back to normal |
| U | Parachute | 3 | Tool: keep it selected and it opens by itself when you fall; no fall damage while it's open; ←/→ steer |
| 9 | Drill | ∞ | Tool: hold FIRE/Space to dig straight down (5 s per turn) |
| 0 | Pickaxe | ∞ | Tool: hold FIRE/Space to tunnel in the aim direction (5 s per turn) |
| T | Teleport | 2 | Click or tap any open spot to move there (no fall damage when you drop in) |
| K | Rest & Heal | ∞ | Ends your turn: +50 health (up to your starting health) and 20% less damage taken for the next 3 rounds (🩹 by your name) |
| — | Hazmat Suit | 1 | Tool: press Space to put it on or take it off (free after the first time). While worn you take no toxic, plasma or fire damage, but on your turn you only see the battlefield through the two lenses of a gas mask |

Tools don't use up your attack. The drill and pickaxe also do 15 damage to a character they dig into, and they set off mines in their way.

Ammo is shared by the whole team.

## CPU players

CPU characters run the real game physics for thousands of possible shots, including terrain, wind, bounces and other characters. They pick the shot that does the most damage to enemies. If nothing is in range they walk toward the nearest enemy first. On big maps they teleport closer when the enemy is still too far away. They also use the Shotgun when they have a clear line of sight, and the Air Strike on enemies standing under open sky. The difficulty setting adds aiming error.

## Project structure

```
index.html        menu + game screen
css/style.css     styling
js/config.js      constants, teams, weapons, themes
js/terrain.js     destructible terrain generation and rendering
js/entities.js    characters and projectile physics (shared with the AI)
js/ai.js          CPU player
js/audio.js       procedural sound effects (Web Audio)
js/game.js        turn logic, physics, rope, mines, camera, input and rendering
js/touch.js       on-screen touch controls and fullscreen
js/menu.js        main menu, weapon bar and overlays
```

Everything is plain JavaScript with no dependencies. All graphics and sounds are generated in code, so there are no asset files.
