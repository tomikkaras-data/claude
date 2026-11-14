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
| Weapon settings | Damage, blast radius and starting ammo for every weapon (see below) |
| Friendly fire | On (default: anyone can be hurt, including yourself) or Off (teammates and yourself are safe) |
| Theme | Random, Grassy land, Sand, Winter or Volcanic |

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
* **Steel crates** hold more special weapons. Every team starts with **one of each** special weapon:

| Weapon | Per crate | What it does |
|---|---|---|
| ⚙️ Gatling Gun | 1 | 24 rapid bullets over about a second; you can keep aiming while it fires |
| 🎯 Sniper Rifle | 2 | Scoped aim with a laser sight and fine aiming; long range, high damage |
| 🦅 Desert Eagle | 2 | Single high-damage pistol shot with strong knockback |
| ☢️ Nuka Bomb | 1 | Launched like the bazooka; enormous blast (75 damage, very wide radius) |
| 🐸 Frog Clone Bomb | 2 | Big frog that hops forward, turns at walls and explodes after 5 seconds or when it reaches an enemy. The blast releases 5 frog clones that hop around at random and go off after 1–3 seconds each |
| 🔥 Napalm Strike | 1 | Click a target; burning napalm sticks to the ground and hurts anyone standing in it |
| 🔨 Anvil Drop | 2 | Click a target; a heavy anvil drops straight down |
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

**Ninja Rope:** aim and press `Space` to shoot the rope. It sticks to any ground within reach. Swing with `←` `→`, climb up or down with `↑` `↓`, and let go with `Space` or `Enter`. You get 6 rope shots per turn, and using the rope doesn't use up your attack, so you can swing into position and then fire.

## Phones and tablets

* On-screen controls appear on touch screens. The left pad walks (◀ ▶) and aims (▲ ▼). On the right, hold **FIRE** to charge and let go to shoot, plus **JUMP** and **↶** (backflip).
* Pick weapons from the scrollable bar at the bottom.
* Drag one finger to look around and pinch to zoom.
* For Air Strike and Teleport, tap the spot on the map.
* The weapon button at the bottom of a phone screen opens a picker with every weapon, grouped into Weapons, Tools and Special. The ⏱ button sets the grenade timer and ↻ rotates the Concrete Block. Special weapons from crates appear in the weapon bar once found.
* The game switches to fullscreen when a match starts, where the browser allows it. Landscape works best; in portrait a small hint suggests rotating.
* **❚❚** (top left) pauses the game. The pause menu has a fullscreen toggle.

## Weapons and tools

| # | Weapon | Ammo | Notes |
|---|---|---|---|
| 1 | Bazooka | ∞ | Explodes on impact with a big knockback, affected by wind |
| 2 | Grenade | ∞ | Bounces, explodes with a big knockback when its timer runs out (1–5 s, set with `F`) |
| 3 | Cluster Bomb | 3 | Like the grenade, then bursts into 6 bomblets |
| V | Drilling Rocket | 2 | Fired like the bazooka (wind pushes it). When it hits rock it keeps boring through in the same direction for up to 3 seconds, then explodes. If it breaks out of the rock into open air first, it explodes right there |
| Q | Tornado | 1 | Sets off a tornado that travels along the ground the way you face (turning back at steep walls) and grows to a radius of 60. Characters, mines and crates that get close are sucked in and spun up to the top. Characters are thrown out in a random direction (10 damage) and always take fall damage when they land; crates burst and mines explode at the top. It dies out after 8 seconds |
| N | Drone | 2 | Launches along your aim and flies forward; steer it with ←/→ for 3 seconds, then its motor cuts out and it drops. Explodes on contact |
| 4 | Shotgun | ∞ | 6 spreading pellets per shot, **two shots per turn**; you can move between them |
| G | Flamethrower | 3 | Sprays fire for 1.5 s and pushes targets back a little; you can keep aiming while it burns. Some flames stick and keep burning |
| B | Baseball Bat | 2 | Hits someone right next to you for 30 damage and sends them flying |
| 5 | Dynamite | 2 | Dropped at your feet; big blast (50 damage, wide radius) after 5 seconds |
| 6 | Mine | 3 | Drops a proximity mine (only enemies set it off) |
| 7 | Air Strike | 1 | Click or tap a target, 5 missiles rain down |
| 8 | Ninja Rope | ∞ | Tool: swing around the map |
| J | Jetpack | 2 | Tool: press Space to put it on, ↑ to fly, ←/→ to steer; 6 s of fuel. Pressing Space again or picking another weapon takes it off, and the controls go back to normal |
| U | Parachute | 3 | Tool: keep it selected and it opens by itself when you fall; no fall damage while it's open; ←/→ steer |
| 9 | Drill | ∞ | Tool: hold FIRE/Space to dig straight down (5 s per turn) |
| 0 | Pickaxe | ∞ | Tool: hold FIRE/Space to tunnel in the aim direction (5 s per turn) |
| T | Teleport | 2 | Click or tap any open spot to move there |
| K | Skip Turn | ∞ | Pass the turn |

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
