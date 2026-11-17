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
    // Cover: three-star chase in the stolen Comet GT down the main avenue,
    // police cruisers on the tail, mission objective on the HUD.
    dbg.startStory();
    dbg.setMission(2, 'hot'); // Job 3 — Lose the Tail
    dbg.setWanted(3);
    dbg.setCash(1840);
    dbg.teleport(-3.6, -120, 0);
    dbg.putInCar(dbg.comet());
    dbg.comet().x = -3.6;
    dbg.comet().z = -120;
    dbg.comet().yaw = 0;
    dbg.spawnPolice(3);
    driveForward(game, input, 5);
    hud.hideDialog();
    return;
  }
  if (name === 'mission') {
    // Job 5 at Harbor Bank: Deke on foot, Harbor Crew ahead, two stars,
    // one crew member already down from a real pistol shot.
    dbg.startStory();
    dbg.setMission(4, 'go');
    dbg.setWanted(2);
    dbg.setCash(2450);
    // Deke on the plaza southwest of Harbor Bank, close to the crew, facing them.
    dbg.teleport(184, 232, Math.PI / 2);
    dbg.spawnEnemies();
    game.missions.stage = 'fight';
    game.player.camYaw = Math.PI / 2;
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
  // street (default): on foot downtown at the main intersection, traffic
  // rolling past, pedestrians on the sidewalks, Job 1 on the HUD.
  dbg.startStory();
  dbg.setMission(0, 'go');
  dbg.setCash(40);
  // On the main avenue, facing down the road: buildings, traffic and
  // pedestrians in frame, no wall in the way.
  dbg.teleport(0, -40, 0);
  walkForward(game, input, 2.5);
  hud.hideDialog();
}
