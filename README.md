# Crater Clash

A turn-based 2D artillery game for **2–8 players** that runs in the browser. Pick your fighters, split them into teams and blow up the landscape until one team is left standing. It's an original game in the classic artillery genre made popular by games like *Worms 2*.

![genre: artillery](https://img.shields.io/badge/genre-artillery-orange) ![no build step](https://img.shields.io/badge/build-none-brightgreen)

## How to run

There's nothing to install. Open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari).

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
| Map | Random, Grassland, Desert or Snow |

You need at least two different teams to start. The menu remembers your setup.

## Rules

* Every match gets a randomly generated, fully destructible map with hills, caves, floating islands and sometimes a water channel. Characters spawn at random spots.
* The game is **turn-based**. Teams take turns in rotation, and inside a team the characters take turns too. Only one character acts at a time.
* Each turn has a time limit. You can move around, but you can **attack only once**. After the attack you get 3 seconds to retreat, then the next player's turn starts.
* **Characters on the same team can't hurt each other**, and you can't hurt yourself. Explosions still destroy the ground under anyone, though.
* Falling into the water knocks a character out instantly.
* Wind changes every turn. It pushes the bazooka and air strike missiles.
* The **last team with living characters wins**.

## Controls (human players)

| Key | Action |
|---|---|
| `←` `→` (or `A` `D`) | Walk / turn around |
| `↑` `↓` (or `W` `S`) | Aim |
| `Space` | Hold to charge power, release to fire (instant for Shotgun and Dynamite) |
| `Enter` | Jump forward |
| `Backspace` | Backflip (high jump) |
| `1`–`8`, `Tab`, or click the weapon bar | Pick a weapon |
| Mouse click | Pick the target for Air Strike or Teleport |
| `Esc` / `P` | Pause |
| `M` | Mute sound |

Several human players share one keyboard (hot-seat).

## Weapons and tools

| # | Weapon | Ammo | Notes |
|---|---|---|---|
| 1 | Bazooka | ∞ | Explodes on impact, affected by wind |
| 2 | Grenade | ∞ | Bounces, explodes after 3 seconds |
| 3 | Cluster Bomb | 3 | Bounces, then bursts into 5 bomblets |
| 4 | Shotgun | ∞ | Instant shot along the aim line |
| 5 | Dynamite | 2 | Dropped at your feet, huge blast after 5 seconds |
| 6 | Air Strike | 1 | Click a target, 5 missiles rain down |
| 7 | Teleport | 2 | Click any open spot to move there |
| 8 | Skip Turn | ∞ | Pass the turn |

Ammo is shared by the whole team.

## CPU players

CPU characters run the real game physics for thousands of possible shots, including terrain, wind, bounces and other characters. They pick the shot that does the most damage to enemies. If nothing is in range they walk toward the nearest enemy first. They also use the Shotgun when they have a clear line of sight, and the Air Strike on enemies standing under open sky. The difficulty setting adds aiming error.

## Project structure

```
index.html        menu + game screen
css/style.css     styling
js/config.js      constants, teams, weapons, themes
js/terrain.js     destructible terrain generation and rendering
js/entities.js    characters and projectile physics (shared with the AI)
js/ai.js          CPU player
js/audio.js       procedural sound effects (Web Audio)
js/game.js        turn logic, physics, input and rendering
js/menu.js        main menu, weapon bar and overlays
```

Everything is plain JavaScript with no dependencies. All graphics and sounds are generated in code, so there are no asset files.
