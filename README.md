# SOLMAR BAY — Open World

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/faaz12/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/faaz12/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game in the browser, built on three.js 0.187.0 — an entry for the
[make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01) ($1,666 in USDC).

**The game.** You are Danny "Deke" Marlowe, a wheelman new in the sun-soaked coastal city of
Solmar Bay. Five story jobs stand between you and a clean slate: meet Rico Vane at the marina,
lift a red Comet GT from the Solmar Hotel, lose a three-star police tail, run a package to
Harbor Bank, and fight the Harbor Crew for the vault — then get out alive. Or ignore the story
and free-roam: steal any parked car, collect street cash, and dodge the Solmar Bay PD.

- **Open world:** a 9×9-block coastal city — downtown towers, marina docks and boats, beach and
  ocean, palms, street lamps, traffic on the avenues and pedestrians on the sidewalks, all
  procedural and seeded.
- **On foot and by car:** third-person walking with mouse-look camera, sprint, and arcade
  driving (7 original car models — Comet GT, Marlin Sedan, Palm Taxi, Dune Buggy, Harbor Van,
  Sunset Coupe, Bay Pickup). Steal any parked car (E) — the cops notice.
- **Wanted level + police:** 1–5 stars for theft, shootings and cop kills; police cruisers
  chase and ram, foot officers chase and shoot, the heat decays when you break line of sight.
- **Missions + story:** 5 jobs with dialogue from Rico, a golden beacon marking the target,
  an objective line and a minimap blip; cash + REP rewards, story-complete finale.
- **Combat:** pistol with raycast hits, tracers, muzzle flash and sparks, reload, enemy crews
  that shoot back, health + damage vignette, Busted / Wasted endings.
- **HUD + minimap:** cash, REP, health bar, wanted stars, in-game clock, mission objective,
  speedometer + car name, ammo, live circular minimap (roads, player arrow, traffic, police,
  enemies, mission blip), toasts and dialogue.
- **Save + menus:** start screen (Story / Continue Save / Free Roam), pause menu, autosave to
  this browser every 20 s and on every completed job.
- **Sound:** fully synthesized WebAudio — a chiptune radio loop, engine hum, two-tone sirens,
  gunshots, crashes, horns and mission stings. No audio files, no network requests at runtime.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Desktop Chrome (or any browser with WebGL 2). Click **START STORY**, then follow the golden
beacon. Controls: WASD move/drive · mouse look · E steal/enter car · F exit car · Click shoot ·
R reload · Shift sprint · Space brake · H horn · C camera · M mission · P pause.

## Screenshots

The four screenshots in `screenshots/` are real renders of the game's own code in headless
Chromium (`?shot=chase|street|mission|start&seed=1` stages a live police chase, a downtown
street walk, the Harbor Bank shootout and the title screen). `shots.json` lists them.

## Layout

- `game/` — the game: `index.html` + ES modules in `src/` (one job each: config, random, audio,
  input, city, vehicles, people, missions, combat, hud, player, game, main, shots) and vendored
  three.js 0.187.0 under `game/vendor/three/`.
- `main.ts` — the entry program: copies `game/` + `screenshots/` to `/output` (or
  `$MAKEFUN_OUTPUT_DIR`) and writes `dossier.json` with the vendored make.fun library.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.
- `serve.ts` — a tiny local static server for development.

## License

MIT — see `LICENSE`.
