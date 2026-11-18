// The screenshot scenes behind ?shot=chase|street|mission|start. Each one plays
// the real game forward from a fresh world for a fixed number of steps — a
// real police chase, a real street walk, a real shootout — so the frame is
// what a short session really looks like, and the same seed always gives the
// same frame. The cover (chase) shows driving + wanted stars + police +
// minimap + a mission objective at once.
import { STEP } from './config.js';

function driveForward(game, input, seconds) {
  input.setHeld('up', true);
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) game.step(STEP);
  input.setHeld('up', false);
}

function walkForward(game, input, seconds) {
  input.setHeld('up', true);
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) game.step(STEP);
  input.setHeld('up', false);
}

export function stageShot(name, game, city, hud, input) {
  const dbg = game.debug;
  if (name === 'start') {
    // Title screen over the city: leave the game on its title orbit; the
    // start overlay in the DOM is the shot's menu.
    game.state.phase = 'title';
    for (let i = 0; i < 90; i += 1) game.step(STEP);
    return;
  }
  if (name === 'chase') {
    // Cover: four-star chase in the stolen Comet GT down the main avenue,
    // police cruisers on the tail and the PD helicopter overhead, mission
    // objective on the HUD.
    dbg.startStory();
    dbg.setMission(2, 'hot'); // Job 3 — Lose the Tail
    dbg.setWanted(4);
    dbg.setCash(1840);
    dbg.teleport(-3.6, -120, 0);
    dbg.putInCar(dbg.comet());
    dbg.comet().x = -3.6;
    dbg.comet().z = -120;
    dbg.comet().yaw = 0;
    dbg.spawnPolice(3);
    driveForward(game, input, 5);
    // Put Air One in frame for the cover: the helicopter chases from
    // behind in the real game, so hover it ahead of the car, low enough to
    // read against the sky with its spotlight on the avenue.
    const h = dbg.heli();
    h.x = game.player.x + Math.sin(game.player.yaw) * 55;
    h.z = game.player.z + Math.cos(game.player.yaw) * 55;
    h.y = 22;
    h.mesh.position.set(h.x, h.y, h.z);
    h.mesh.rotation.y = game.player.yaw + Math.PI;
    hud.hideDialog();
    return;
  }
  if (name === 'mission') {
    // Job 10 at the Marina Showdown: Deke on foot east of the marina, the
    // Harbor Crew spread along the docks (cover layout, two lieutenants),
    // two stars, one crew member already down from a real pistol shot.
    dbg.startStory();
    dbg.setMission(9, 'go');
    dbg.setWanted(2);
    dbg.setCash(5200);
    // Deke on the road east of the marina front, close to the crew, facing them.
    dbg.teleport(-180, 210, -Math.PI / 2);
    dbg.spawnEnemies({ x: -225, z: 225 }, 6, 'marina');
    game.missions.stage = 'fight';
    game.player.camYaw = Math.atan2(-225 - game.player.x, 225 - game.player.z);
    game.player.yaw = game.player.camYaw;
    // Real shots at the nearest crew member (through the game's combat),
    // re-aimed until one lands — a pedestrian can cross the line of fire.
    const foe = game.enemies.find((e) => e.alive);
    if (foe) {
      foe.hp = 1;
      for (let attempt = 0; attempt < 3 && foe.alive; attempt += 1) {
        game.player.camYaw = Math.atan2(foe.x - game.player.x, foe.z - game.player.z);
        game.player.yaw = game.player.camYaw;
        input.queue(4); // ACT_SHOOT
        for (let i = 0; i < 30; i += 1) game.step(STEP);
      }
    }
    walkForward(game, input, 0.3);
    hud.hideDialog();
    return;
  }
  // street (default): on foot at the Bay Arms gun shop on the west avenue,
  // the shop sign and buy prompt in frame, traffic rolling past, Job 1 on
  // the HUD.
  dbg.startStory();
  dbg.setMission(0, 'go');
  dbg.setCash(40);
  // East of the stall, facing it: the sign, the counter and the E prompt.
  dbg.teleport(-160, 60, -Math.PI / 2);
  walkForward(game, input, 1.2);
  hud.hideDialog();
}
