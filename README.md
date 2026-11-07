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
| Friendly fire | Off (teammates and yourself are safe) or On (anyone can be hurt) |
| Theme | Random, Grassland, Desert or Snow |

You need at least two different teams to start. The menu remembers your setup.

## Rules

* Every match gets a randomly generated, fully destructible map with hills, caves, floating islands and sometimes a water channel. Characters spawn at random spots.
* The game is **turn-based**. Teams take turns in rotation, and inside a team the characters take turns too. Only one character acts at a time.
* Each turn has a time limit. You can move around, but you can **attack only once**. After the attack you get 3 seconds to retreat, then the next player's turn starts.
* With **friendly fire off** (the default), characters on the same team can't hurt each other and you can't hurt yourself. Explosions still destroy the ground under anyone, though. With friendly fire **on**, every blast hurts everyone in range, including yourself.
* Falling into the water knocks a character out instantly.
* **Fall damage:** a drop of more than about 100 pixels hurts, and higher falls hurt more. This also counts when an explosion throws you or you let go of the rope too high.
* The **rope, drill and pickaxe** are tools. Using them doesn't use up your attack, so you can dig or swing into position and then still shoot.
* When every human player is out and only CPU players are left, a **Skip to end** button appears. It fast-forwards the rest of the match silently and shows the winner.
* Wind changes every turn. It pushes the bazooka and air strike missiles.
* Mines go off about a second after an enemy gets close. Mines that were on the map from the start hurt everyone. Mines laid by a team only react to (and hurt) the other teams. Explosions set off nearby mines.
* The **last team with living characters wins**.

## Weapon settings

The **Weapon settings** button in the menu opens a table of every weapon. You can change its damage, blast radius and how much ammo each team starts with (leave ammo empty for unlimited). Changed values are highlighted and remembered. **Reset all to defaults** undoes everything. Special weapons normally start at 0 because they come from steel crates, but you can give teams some from the start here.

## Crates

* Wooden and steel crates lie around the map at the start. Supply drops parachute in more crates every few turns.
* Walk into a crate to open it. Explosions destroy crates.
* **Wooden crates** hold one of:
  * +35 health
  * ⚡ a power-up (your next attack does +50% damage)
  * 🛡 armor (halves incoming damage until it has absorbed 40)
  * more ammo for a weapon your team already has
* **Steel crates** hold a special weapon:

| Weapon | Per crate | What it does |
|---|---|---|
| ⚙️ Gatling Gun | 1 | 24 rapid bullets over about a second; you can keep aiming while it fires |
| 🎯 Sniper Rifle | 2 | Scoped aim with a laser sight and fine aiming; long range, high damage |
| 🦅 Desert Eagle | 2 | Single high-damage pistol shot with strong knockback |
| ☢️ Nuka Bomb | 1 | Launched like the bazooka; enormous blast |
| 🐸 Robot Frog | 2 | Hops forward, turns at walls, explodes after 5 seconds or when it reaches an enemy |
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
* The ⏱ button sets the grenade timer and ↻ rotates the Concrete Block. Special weapons from crates appear in the weapon bar once found.
* The game switches to fullscreen when a match starts, where the browser allows it. Landscape works best; in portrait a small hint suggests rotating.
* **❚❚** (top left) pauses the game. The pause menu has a fullscreen toggle.

## Weapons and tools

| # | Weapon | Ammo | Notes |
|---|---|---|---|
| 1 | Bazooka | ∞ | Explodes on impact, affected by wind |
| 2 | Grenade | ∞ | Bounces, explodes when its timer runs out (1–5 s, set with `F`) |
| 3 | Cluster Bomb | 3 | Like the grenade, then bursts into 6 bomblets |
| 4 | Shotgun | ∞ | 6 spreading pellets per shot, **two shots per turn**; you can move between them |
| 5 | Dynamite | 2 | Dropped at your feet, huge blast after 5 seconds |
| 6 | Mine | 3 | Drops a proximity mine (only enemies set it off) |
| 7 | Air Strike | 1 | Click or tap a target, 5 missiles rain down |
| 8 | Ninja Rope | ∞ | Tool: swing around the map |
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
