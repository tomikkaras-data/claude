# Garbage Man Job (Roblox)

## 1. Build the map (Workspace)

| Name (exact) | Type | What it is |
|---|---|---|
| `JobBoard` | Part (or Model) | Table or NPC where you take the job. If it's an NPC model, set its PrimaryPart (e.g. HumanoidRootPart). |
| `TrashBins` | Folder | Put all your trash bins inside (Parts or Models). |
| `DropOff` | Part | Where bags are returned (e.g. a big green, anchored part). |
| `Truck` *(optional)* | Model | Your car. It must contain a Part named `TruckBed`. |

Anchor the board, bins and drop-off. You **don't** add ProximityPrompts yourself: the script creates them (key **E**).

## 2. Scripts

| File | Type | Where |
|---|---|---|
| `Leaderstats.server.lua` | Script | ServerScriptService (replaces your old leaderboard script; keep only ONE) |
| `GarbageJobServer.server.lua` | Script | ServerScriptService |
| `GarbageJobClient.client.lua` | LocalScript | StarterPlayer > StarterPlayerScripts |

Paste each file's contents into a new object of that type.

For saving to work in Studio: Game Settings > Security > **Enable Studio Access to API Services**.

## 3. How it plays
1. Press E at the JobBoard → popup → Accept → 60s timer starts.
2. Yellow arrows mark bins. Press E at a bin → you get a trash bag in your hand.
3. Backspace drops a bag; walk over it to pick it up again.
4. Press E at the TruckBed to load all carried bags into the truck.
5. Press E at DropOff (green arrow) → 10 Cash per bag. Truck bags count if the truck is within 40 studs.
6. When time runs out, leftover bags disappear.

Settings (time, reward, range, text) are at the top of `GarbageJobServer`.
