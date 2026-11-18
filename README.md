# SOLMAR BAY — Open World

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/faaz12/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/faaz12/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game in the browser, built on three.js 0.187.0 — an entry for the
[make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01) ($1,666 in USDC).

**The game.** You are Danny "Deke" Marlowe, a wheelman new in the sun-soaked coastal city of
Solmar Bay. Ten story jobs stand between you and a clean slate: meet Rico Vane at the marina,
lift a red Comet GT from the Solmar Hotel, lose a three-star police tail, run a package to
Harbor Bank, and fight the Harbor Crew for the vault — then meet Lena at the Sunset Diner, run
a crate from the South Docks, survive four-star downtown heat under the police helicopter,
lift a purple Sunset Coupe, and settle the score at the marina. Or ignore the story
and free-roam: steal any parked car, collect street cash, and dodge the Solmar Bay PD.

- **Open world:** a 9×9-block coastal city — downtown towers, marina docks and boats, beach and
  ocean, palms, street lamps, traffic on the avenues and pedestrians on the sidewalks, all
  procedural and seeded.
- **On foot and by car:** third-person walking with mouse-look camera, sprint, and arcade
  driving (7 original car models — Comet GT, Marlin Sedan, Palm Taxi, Dune Buggy, Harbor Van,
  Sunset Coupe, Bay Pickup). Steal any parked car (E) — the cops notice.
- **Wanted level + police:** 1–5 stars for theft, shootings and cop kills; police cruisers
  chase and ram (and cut you off with an intercept course when you run), foot officers chase
  and shoot, and at four stars the PD helicopter (Air One) comes overhead with a spotlight —
  the heat never cools while it watches, but break line of sight and it falls back to
  searching the last place it saw you, so the heat can cool again. The heat decays when you
  stay out of sight.
- **Missions + story:** 10 jobs with dialogue from Rico and Lena — each job has its own
  mechanics, mid-job dialogue and checkpoints (the Sunset Coupe lift pulls a two-car tail the
  moment you take it; the Marina Showdown spreads the crew along the docks with two
  lieutenants) — a golden beacon marking the target, an objective line and a minimap blip;
  cash + REP rewards, story-complete finale.
- **Shops, safehouse, garage:** Bay Arms sells body armor ($150) and pistol ammo ($60 for
  +24 reserve), Sunset Snacks sells a full meal ($100); Deke's beach-house safehouse heals,
  clears the heat, saves — and sells four upgrades (Extended Mag $800, Fast Hands $500, Armor
  Plating $600, Engine Tune $900, keys 1–4); Rico's Garage stores up to 4 cars you drive in —
  all shown on the minimap.
- **Combat:** pistol with raycast hits, tracers, muzzle flash, hit marker and sparks, reload
  from a real reserve (12 + 48), enemy crews that shoot back — and move between cover, flinch
  when hit, and fight as lieutenants in the finale — health + damage vignette, Busted /
  Wasted endings with a clean retry (no ghost crew, no stuck stage).
- **Driving:** every car handles differently — the Sunset Coupe is sharp and loose, the
  Harbor Van is slow but planted, the Dune Buggy steers fast and slides; crashes dent the
  car (visible smoke past 50% damage, slower top speed) and brake lights show when slowing.
- **Living city:** pedestrians flee gunfire and sirens, traffic holds its own lane at its own
  pace, the sun warms toward noon and cools again as the in-game clock runs, and the
  landmarks read as places (Sunset Diner, Solmar Hotel, Harbor Bank, PD HQ, Marina).
- **HUD + minimap:** cash, REP, health bar, wanted stars, in-game clock, mission objective,
  speedometer + car name, ammo, live circular minimap (roads, player arrow, traffic, police,
  enemies, mission blip, shops, safehouse, garage, helicopter), toasts and dialogue.
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
beacon. Controls: WASD move/drive · mouse look · E steal car / shop / store car · F exit car ·
Click shoot · R reload · Shift sprint · Space brake · H horn · C camera · M mission · P pause ·
1–4 buy safehouse upgrades.

## Screenshots

The four screenshots in `screenshots/` are real renders of the game's own code in headless
Chromium (`?shot=chase|street|mission|start&seed=1` stages a live police chase, a downtown
street walk, the Marina Showdown and the title screen). `shots.json` lists them.

## Layout

- `game/` — the game: `index.html` + ES modules in `src/` (one job each: config, random, audio,
  input, city, vehicles, people, missions, combat, hud, player, game, main, shots, shops,
  safehouse, garage, helicopter) and vendored three.js 0.187.0 under `game/vendor/three/`.
- `main.ts` — the entry program: copies `game/` + `screenshots/` to `/output` (or
  `$MAKEFUN_OUTPUT_DIR`) and writes `dossier.json` with the vendored make.fun library.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.
- `serve.ts` — a tiny local static server for development.

## License

MIT — see `LICENSE`.
