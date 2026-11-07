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
| Theme | Random, Grassland, Desert or Snow |

You need at least two different teams to start. The menu remembers your setup.

## Rules

* Every match gets a randomly generated, fully destructible map with hills, caves, floating islands and sometimes a water channel. Characters spawn at random spots.
* The game is **turn-based**. Teams take turns in rotation, and inside a team the characters take turns too. Only one character acts at a time.
* Each turn has a time limit. You can move around, but you can **attack only once**. After the attack you get 3 seconds to retreat, then the next player's turn starts.
* **Characters on the same team can't hurt each other**, and you can't hurt yourself. Explosions still destroy the ground under anyone, though.
* Falling into the water knocks a character out instantly.
* Wind changes every turn. It pushes the bazooka and air strike missiles.
* Mines go off about a second after an enemy gets close. Mines that were on the map from the start hurt everyone. Mines laid by a team only react to (and hurt) the other teams. Explosions set off nearby mines.
* The **last team with living characters wins**.

## Controls (human players)

| Key | Action |
|---|---|
| `←` `→` (or `A` `D`) | Walk / turn around |
| `↑` `↓` (or `W` `S`) | Aim |
| `Space` | Hold to charge power, release to fire (instant for Shotgun and Dynamite) |
| `Enter` | Jump forward |
| `Backspace` | Backflip (high jump) |
| `1`–`9`, `0`, `Tab`, or click the weapon bar | Pick a weapon |
| Mouse click | Pick the target for Air Strike or Teleport |
| Drag the map | Look around |
| Mouse wheel or `+` / `−` | Zoom |
| `C` | Re-centre the camera |
| `Esc` / `P` | Pause |
| `M` | Mute sound |

Several human players share one keyboard (hot-seat).

**Ninja Rope:** aim and press `Space` to shoot the rope. It sticks to any ground within reach. Swing with `←` `→`, climb up or down with `↑` `↓`, and let go with `Space` or `Enter`. You get 6 rope shots per turn, and using the rope doesn't use up your attack, so you can swing into position and then fire.

## Phones and tablets

* On-screen controls appear on touch screens. The left pad walks (◀ ▶) and aims (▲ ▼). On the right, hold **FIRE** to charge and let go to shoot, plus **JUMP** and **↶** (backflip).
* Pick weapons from the scrollable bar at the bottom.
* Drag one finger to look around and pinch to zoom.
* For Air Strike and Teleport, tap the spot on the map.
* The game switches to fullscreen when a match starts, where the browser allows it. Landscape works best; in portrait a small hint suggests rotating.
* **❚❚** (top left) pauses the game. The pause menu has a fullscreen toggle.

## Weapons and tools

| # | Weapon | Ammo | Notes |
|---|---|---|---|
| 1 | Bazooka | ∞ | Explodes on impact, affected by wind |
| 2 | Grenade | ∞ | Bounces, explodes after 3 seconds |
| 3 | Cluster Bomb | 3 | Bounces, then bursts into 5 bomblets |
| 4 | Shotgun | ∞ | Instant shot along the aim line |
| 5 | Dynamite | 2 | Dropped at your feet, huge blast after 5 seconds |
| 6 | Mine | 3 | Drops a proximity mine (only enemies set it off) |
| 7 | Air Strike | 1 | Click or tap a target, 5 missiles rain down |
| 8 | Ninja Rope | ∞ | Movement tool, swing around the map (doesn't use up your attack) |
| 9 | Teleport | 2 | Click or tap any open spot to move there |
| 0 | Skip Turn | ∞ | Pass the turn |

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
