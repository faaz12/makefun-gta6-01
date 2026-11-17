// Solmar Bay's game loop: phases, the wanted system, police response, mission
// progression, combat resolution, cash pickups, the clock and saving. The
// renderer owns the scene; this module owns what happens in it.
import * as THREE from 'three';
import { CAR_MODELS, CITY, COMBAT, PLAYER, SAVE_KEY, STEP, WANTED } from './config.js';
import { clamp, pick, range } from './random.js';
import { createPlayer, createCamera, updatePlayer, shootRay, enterCar, exitCar } from './player.js';
import { createCar, moveCar, updateTraffic, spawnTraffic, spawnParked } from './vehicles.js';
import { createPerson, updatePedestrian, killPerson, spawnPedestrians } from './people.js';
import { createMissionManager } from './missions.js';
import { createCombat } from './combat.js';
import { ACT_ENTER, ACT_EXIT, ACT_SHOOT, ACT_RELOAD, ACT_PAUSE, ACT_MISSION, ACT_HORN, ACT_CAMERA } from './input.js';

const PICKUP_COUNT = 8;

export function createGame({ scene, city, hud, audio, input, random }) {
  const camera = createCamera();
  const player = createPlayer(scene);
  const combat = createCombat(scene);
  const missions = createMissionManager();
  const traffic = spawnTraffic(city, scene, random, 14);
  const parked = spawnParked(city, scene, random, 10);
  const peds = spawnPedestrians(scene, random, city, 26);
  const policeCars = [];
  const footCops = [];
  const enemies = [];
  const pickups = [];
  const allCars = [...traffic, ...parked];

  // The red Comet GT for Job 2, parked outside the Solmar Hotel.
  const comet = createCar(city, CAR_MODELS[0], -232, -206, 0, { parked: true });
  comet.isComet = true;
  scene.add(comet.mesh);
  parked.push(comet);
  allCars.push(comet);

  // Cash bundles scattered around town (free-roam activity, $100 each).
  const pickupGeo = new THREE.BoxGeometry(0.7, 0.5, 0.3);
  for (let i = 0; i < PICKUP_COUNT; i += 1) {
    const road = [-180, -120, -60, 0, 60, 120, 180][Math.floor(random() * 7)];
    const along = range(random, -230, 230);
    const mesh = new THREE.Mesh(pickupGeo, new THREE.MeshBasicMaterial({ color: 0x7dff9b }));
    mesh.position.set(random() < 0.5 ? road + 9 : along, 0.8, random() < 0.5 ? along : road + 9);
    scene.add(mesh);
    pickups.push({ mesh, x: mesh.position.x, z: mesh.position.z, taken: false });
  }

  const state = {
    phase: 'title', // title | play | paused | busted | wasted
    cash: 40, rep: 0, wanted: 0, heatTimer: 0, quietTimer: 0,
    clockMin: 9 * 60, time: 0, fireTimer: 0, reloadTimer: 0, mag: COMBAT.pistolMag,
    bustedTimer: 0, saveTimer: 0, sirenTimer: 0, gunfire: 0,
    carsStolen: 0, kills: 0, missionsDone: 0, shotsFired: 0,
    freeRoam: false, storyDone: false,
  };

  function save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: state.cash, rep: state.rep, missionIndex: missions.index,
        x: player.x, z: player.z, yaw: player.yaw, health: player.health,
      }));
    } catch { /* private mode: the save lasts this visit only */ }
  }
  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }
  function hasSave() { return load() !== null; }

  function addWanted(n, reason) {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + n, 0, WANTED.max);
    state.quietTimer = 0;
    if (state.wanted > before) {
      hud.toast(`${reason} — Wanted level ${'★'.repeat(state.wanted)}`);
      audio.siren(true);
    }
  }
  function setWanted(n) {
    state.wanted = clamp(n, 0, WANTED.max);
    state.quietTimer = 0;
    if (n > 0) audio.siren(true);
  }

  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of allCars) {
      if (!car.alive || car.traffic) continue;
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function spawnPoliceCar() {
    const angle = range(random, 0, Math.PI * 2);
    const dist = range(random, 55, 80);
    const x = clamp(player.x + Math.cos(angle) * dist, -250, 250);
    const z = clamp(player.z + Math.sin(angle) * dist, -250, 250);
    const car = createCar(city, CAR_MODELS[1], x, z, Math.atan2(player.x - x, player.z - z),
      { police: true, color: 0x1a2a44 });
    scene.add(car.mesh);
    policeCars.push(car);
    allCars.push(car);
    return car;
  }
  function spawnFootCop() {
    const angle = range(random, 0, Math.PI * 2);
    const x = clamp(player.x + Math.cos(angle) * 22, -250, 250);
    const z = clamp(player.z + Math.sin(angle) * 22, -250, 250);
    const cop = createPerson(scene, random, x, z, { cop: true });
    footCops.push(cop);
    return cop;
  }
  function removePolice() {
    for (const car of policeCars) { scene.remove(car.mesh); const i = allCars.indexOf(car); if (i >= 0) allCars.splice(i, 1); }
    policeCars.length = 0;
    for (const cop of footCops) scene.remove(cop.mesh);
    footCops.length = 0;
  }

  function spawnEnemies() {
    // The Harbor Crew holds the plaza on the bank's west side — in the open,
    // never inside the building footprint.
    const bank = city.landmarks.bank || { x: 225, z: 225 };
    for (let i = 0; i < 4; i += 1) {
      const e = createPerson(scene, random,
        bank.x - 26 + range(random, -8, 8), bank.z + range(random, -14, 14), { enemy: true });
      enemies.push(e);
    }
    missions.enemiesLeft = enemies.length;
  }

  function completeMission() {
    const m = missions.advance();
    state.cash += m.reward;
    state.rep += 10;
    state.missionsDone += 1;
    audio.missionDone();
    audio.cash();
    hud.toast(`✓ ${m.title} complete — +$${m.reward}`);
    hud.dialog(missions.intro());
    hud.setObjective(missions.objectiveText());
    if (missions.isFinished()) {
      state.storyDone = true;
      hud.toast('🏆 STORY COMPLETE — Solmar Bay is yours!', 5000);
    }
    save();
  }

  function checkMission(dt) {
    if (missions.isFinished() || state.freeRoam) return;
    const m = missions.current();
    const t = missions.target();
    if (m.kind === 'escape') {
      const nearestCop = nearestThreat();
      if (nearestCop < 45) { missions.escapeTimer = 0; }
      else missions.escapeTimer += dt;
      if (missions.escapeTimer >= 12) {
        setWanted(0);
        audio.siren(false);
        removePolice();
        completeMission();
      }
      return;
    }
    if (m.kind === 'shootout' && missions.stage === 'fight') {
      if (missions.enemiesLeft <= 0) completeMission();
      return;
    }
    if (!t) return;
    const d = Math.hypot(t.x - player.x, t.z - player.z);
    // Landmarks are buildings: the player reaches them at the plaza/wall,
    // so the trigger radius must clear the footprint (shootout starts on
    // the bank plaza, ~30 m out).
    const reach = player.inCar ? 16 : (m.kind === 'shootout' ? 34 : 14);
    if (d > reach) return;
    if (m.kind === 'steal') {
      if (missions.stage === 'go') {
        if (player.inCar === comet) {
          missions.stage = 'deliver';
          hud.toast('Comet GT lifted! Get it to Rico\'s Garage.');
          hud.dialog('<b>RICO:</b> "Beautiful. Now bring her home — garage on the west side."');
          hud.setObjective(missions.objectiveText());
        } else {
          hud.toast('That is not the Comet GT — find the red one by the hotel.');
        }
        return;
      }
      completeMission();
      return;
    }
    if (m.kind === 'deliver') {
      if (!missions.pickedUp) {
        missions.pickedUp = true;
        audio.pickup();
        hud.toast('Package picked up — deliver to Harbor Bank!');
        hud.setObjective(missions.objectiveText());
        return;
      }
      completeMission();
      return;
    }
    if (m.kind === 'shootout') {
      if (missions.stage === 'go') {
        missions.stage = 'fight';
        spawnEnemies();
        hud.dialog('<b>RICO:</b> "There they are — the Harbor Crew. Take them all down!"');
        hud.setObjective(missions.objectiveText());
      }
      return;
    }
    completeMission();
  }

  function nearestThreat() {
    let best = Infinity;
    for (const c of policeCars) best = Math.min(best, Math.hypot(c.x - player.x, c.z - player.z));
    for (const c of footCops) if (c.alive) best = Math.min(best, Math.hypot(c.x - player.x, c.z - player.z));
    return best;
  }

  function updatePolice(dt) {
    const want = state.wanted;
    const targetCount = want === 0 ? 0 : Math.min(want + 1, 6);
    while (policeCars.length < targetCount) spawnPoliceCar();
    while (policeCars.length > targetCount) {
      const car = policeCars.pop();
      scene.remove(car.mesh);
      const i = allCars.indexOf(car);
      if (i >= 0) allCars.splice(i, 1);
    }
    if (want >= 2) {
      while (footCops.filter((c) => c.alive).length < 2) spawnFootCop();
    } else if (footCops.length) {
      for (const c of footCops) scene.remove(c.mesh);
      footCops.length = 0;
    }
    // Police cars chase and ram.
    for (const car of policeCars) {
      const dx = player.x - car.x;
      const dz = player.z - car.z;
      const dist = Math.hypot(dx, dz);
      const wantYaw = Math.atan2(dx, dz);
      const diff = ((wantYaw - car.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      car.yaw += clamp(diff, -2.2 * dt, 2.2 * dt);
      car.speed = clamp(car.speed + (dist > 12 ? 16 : 8) * dt, 0, dist > 30 ? 34 : 24);
      const hit = moveCar(car, dt, city, allCars);
      if (hit && Math.abs(car.speed) > 8) audio.crash();
      car.lightbar.material.color.setHex(Math.floor(state.time * 4) % 2 === 0 ? 0xff2222 : 0x2244ff);
      if (dist < 4.2) {
        if (player.inCar) {
          player.inCar.speed *= 0.86;
          player.shake = 0.5;
          if (Math.random() < dt * 2) audio.crash();
        } else {
          state.bustedTimer += dt;
          hud.toast('The PD is on you — RUN!', 1200);
          if (state.bustedTimer > 1.4) endRun('busted');
        }
      }
    }
    // Foot cops chase and shoot.
    for (const cop of footCops) {
      if (!cop.alive) continue;
      const dx = player.x - cop.x;
      const dz = player.z - cop.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.6) {
        state.bustedTimer += dt;
        if (state.bustedTimer > 1.6) endRun('busted');
        continue;
      }
      cop.yaw = Math.atan2(dx, dz);
      const nx = cop.x + Math.sin(cop.yaw) * cop.speed * dt;
      const nz = cop.z + Math.cos(cop.yaw) * cop.speed * dt;
      if (!city.hitsBuilding(nx, nz, 0.7)) { cop.x = nx; cop.z = nz; }
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.yaw;
      cop.shootTimer -= dt;
      if (dist < COMBAT.enemyRange && cop.shootTimer <= 0) {
        cop.shootTimer = COMBAT.enemyInterval * range(random, 0.9, 1.4);
        const from = new THREE.Vector3(cop.x, 1.4, cop.z);
        const to = new THREE.Vector3(player.x, 1.2, player.z);
        const dir = to.clone().sub(from).normalize();
        combat.shoot(from, dir, [], 60);
        audio.enemyShot();
        if (Math.random() < 0.55) damagePlayer(COMBAT.enemyDamage, 'shot');
      }
    }
    if (state.bustedTimer > 0 && nearestThreat() > 5) state.bustedTimer = Math.max(0, state.bustedTimer - dt);
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = player.x - e.x;
      const dz = player.z - e.z;
      const dist = Math.hypot(dx, dz);
      e.yaw = Math.atan2(dx, dz);
      e.mesh.rotation.y = e.yaw;
      e.shootTimer -= dt;
      if (dist < COMBAT.enemyRange && e.shootTimer <= 0) {
        e.shootTimer = COMBAT.enemyInterval * range(random, 0.9, 1.5);
        const from = new THREE.Vector3(e.x, 1.4, e.z);
        const to = new THREE.Vector3(player.x, 1.2, player.z);
        combat.shoot(from, to.clone().sub(from).normalize(), [], 60);
        audio.enemyShot();
        if (Math.random() < 0.5) damagePlayer(COMBAT.enemyDamage, 'shot');
      }
    }
  }

  function damagePlayer(amount, kind) {
    if (state.phase !== 'play') return;
    let left = amount;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, left);
      player.armor -= absorbed;
      left -= absorbed;
    }
    player.health -= left;
    player.shake = 0.6;
    hud.setDamage(0.85);
    if (player.health <= 0) {
      player.health = 0;
      endRun('wasted');
    }
  }

  function endRun(kind) {
    if (state.phase !== 'play') return;
    state.phase = kind;
    audio.fail();
    audio.siren(false);
    audio.engine(0);
    document.exitPointerLock?.();
    if (kind === 'busted') {
      const fine = Math.min(200, state.cash);
      state.cash -= fine;
      setWanted(0);
      removePolice();
      hud.showEnd('BUSTED', `The Solmar Bay PD caught ${player.inCar ? 'your car' : 'you on foot'} — $${fine} bail, and the heat is off. Try the job again.`);
    } else {
      hud.showEnd('WASTED', 'Deke went down in the streets of Solmar Bay. The story restarts at the current job — health restored, cash kept.');
    }
    save();
  }

  function retry() {
    player.health = PLAYER.health;
    player.armor = 0;
    if (player.inCar) exitCar(player, city);
    player.x = 0;
    player.z = 30;
    player.yaw = 0;
    player.camYaw = 0;
    state.phase = 'play';
    state.bustedTimer = 0;
    hud.hideEnd();
    hud.setObjective(missions.objectiveText());
    save();
  }

  function start(mode, fromSave) {
    const data = fromSave ? load() : null;
    state.phase = 'play';
    state.freeRoam = mode === 'free';
    if (data) {
      state.cash = data.cash ?? 40;
      state.rep = data.rep ?? 0;
      missions.startAt(data.missionIndex ?? 0);
      player.x = data.x ?? 0;
      player.z = data.z ?? 30;
      player.yaw = data.yaw ?? 0;
      player.camYaw = player.yaw;
      player.health = data.health ?? PLAYER.health;
    } else {
      state.cash = 40;
      state.rep = 0;
      missions.startAt(0);
      player.x = 0;
      player.z = 30;
      player.yaw = 0;
      player.camYaw = 0;
      player.health = PLAYER.health;
    }
    state.wanted = 0;
    state.mag = COMBAT.pistolMag;
    hud.hideStart();
    hud.hideEnd();
    hud.setObjective(state.freeRoam ? 'Free roam — explore Solmar Bay, steal cars, dodge the PD.' : missions.objectiveText());
    if (!state.freeRoam) hud.dialog(missions.intro(), 7000);
    audio.unlock();
    audio.startMusic();
    save();
  }

  function pause() {
    if (state.phase !== 'play') return;
    state.phase = 'paused';
    document.exitPointerLock?.();
    audio.engine(0);
    hud.showPause(`Cash $${state.cash} · REP ${state.rep} · Jobs done ${state.missionsDone}/5 · Cars stolen ${state.carsStolen} · Wanted ${'★'.repeat(state.wanted) || 'none'}`);
  }
  function resume() {
    if (state.phase !== 'paused') return;
    state.phase = 'play';
    hud.hidePause();
  }
  function quitToTitle() {
    save();
    state.phase = 'title';
    removePolice();
    hud.hidePause();
    hud.showStart(hasSave());
    audio.engine(0);
    audio.stopMusic();
  }

  function tryShoot() {
    if (state.reloadTimer > 0 || state.fireTimer > 0 || player.inCar) return;
    if (state.mag <= 0) {
      audio.reload();
      state.reloadTimer = 0.7;
      state.mag = COMBAT.pistolMag;
      return;
    }
    state.fireTimer = COMBAT.fireInterval;
    state.mag -= 1;
    state.shotsFired += 1;
    state.gunfire = 0.5;
    const { origin, dir } = shootRay(player, camera);
    const targets = [...peds, ...footCops, ...enemies];
    const result = combat.shoot(origin, dir, targets);
    audio.gunshot();
    if (result.victim && result.victim.hp !== undefined) {
      const v = result.victim;
      v.hp -= COMBAT.pistolDamage;
      if (v.hp <= 0 && v.alive) {
        killPerson(v, scene);
        state.kills += 1;
        if (v.enemy) {
          missions.enemiesLeft = Math.max(0, missions.enemiesLeft - 1);
          hud.toast(`Harbor Crew down — ${missions.enemiesLeft} left`);
          state.cash += 50;
        } else if (v.cop) {
          addWanted(2, 'Officer down!');
        } else {
          addWanted(2, 'Civilian shot!');
        }
      }
    }
  }

  function step(dt) {
    state.time += dt;
    state.clockMin += dt * 0.5;
    city.update(dt, state.time);
    combat.update(dt);
    // Traffic and pedestrians always amble, even on the title screen.
    for (const car of traffic) updateTraffic(car, dt, city, allCars);
    for (const p of peds) updatePedestrian(p, dt, random, city, player, state.gunfire > 0);
    if (state.gunfire > 0) state.gunfire -= dt;
    // Cash pickups spin and bob.
    for (const pk of pickups) {
      if (pk.taken) continue;
      pk.mesh.rotation.y += dt * 2;
      pk.mesh.position.y = 0.8 + Math.sin(state.time * 3 + pk.x) * 0.15;
      if (Math.hypot(pk.x - player.x, pk.z - player.z) < 2.2) {
        pk.taken = true;
        pk.mesh.visible = false;
        state.cash += 100;
        audio.cash();
        hud.toast('+$100 street cash');
      }
    }
    if (state.phase === 'title') {
      // Slow cinematic orbit over the bay for the title backdrop.
      const a = state.time * 0.05;
      camera.position.set(Math.sin(a) * 150, 55, Math.cos(a) * 150 - 40);
      camera.lookAt(-60, 4, 0);
      hud.drawMinimap(snapshotForMap());
      return;
    }
    if (state.phase !== 'play') return;

    const actions = input.takeActions();
    if (actions & ACT_PAUSE) { pause(); return; }
    if (actions & ACT_MISSION) {
      hud.dialog(`<b>${missions.isFinished() ? 'STORY COMPLETE' : missions.current().title}</b><br>${missions.isFinished() ? 'Free roam — Solmar Bay is yours.' : missions.current().brief}`, 6000);
    }
    if (actions & ACT_CAMERA) {
      player.camDist = player.camDist > 9 ? 6.5 : player.camDist < 7.5 ? 8.5 : 12;
    }
    if (actions & ACT_HORN && player.inCar) audio.horn();
    if (actions & ACT_ENTER && !player.inCar) {
      const car = nearestCar(4);
      if (car) {
        enterCar(player, car);
        state.carsStolen += 1;
        audio.steal();
        hud.toast(car.isComet ? 'Comet GT — nice. Now run!' : `Stole the ${car.model.name}!`);
        if (!car.isComet || missions.current().id !== 'lift-comet') addWanted(1, 'Grand theft auto');
        else addWanted(1, 'The hotel called the cops!');
        if (missions.current().id === 'lift-comet' && car.isComet && missions.stage === 'go') {
          missions.stage = 'deliver';
          hud.toast('Comet GT lifted! Get it to Rico\'s Garage.');
          hud.setObjective(missions.objectiveText());
        }
      }
    }
    if ((actions & ACT_EXIT) && player.inCar) exitCar(player, city);
    if (actions & ACT_RELOAD && !player.inCar && state.mag < COMBAT.pistolMag) {
      state.reloadTimer = 0.7;
      state.mag = COMBAT.pistolMag;
      audio.reload();
    }
    if (input.mouseDown || (actions & ACT_SHOOT)) tryShoot();

    state.fireTimer = Math.max(0, state.fireTimer - dt);
    if (state.reloadTimer > 0) state.reloadTimer -= dt;

    const crash = updatePlayer(player, input, dt, city, camera);
    if (crash === 'crash') {
      audio.crash();
      player.shake = 0.4;
      if (Math.abs(player.inCar.speed) > 10) addWanted(0, '');
    }

    // Mission 3 starts hot: the tail arrives the moment the job begins.
    if (!state.freeRoam && missions.current().id === 'lose-tail' && state.wanted === 0 && missions.stage === 'go') {
      setWanted(3);
      missions.stage = 'hot';
      hud.dialog('<b>DISPATCH:</b> "All units — red Comet GT, marina district. Three stars, bring him in."');
    }

    updatePolice(dt);
    updateEnemies(dt);
    checkMission(dt);

    // Wanted decays when the player stays out of sight.
    if (state.wanted > 0) {
      if (nearestThreat() > 55) {
        state.heatTimer += dt;
        if (state.heatTimer > WANTED.decayDelay) {
          state.wanted -= 1;
          state.heatTimer = 0;
          hud.toast(state.wanted === 0 ? 'Heat is off — you are clean.' : `Wanted down to ${'★'.repeat(state.wanted)}`);
          if (state.wanted === 0) audio.siren(false);
        }
      } else state.heatTimer = 0;
    }
    // Siren wail refresh.
    state.sirenTimer -= dt;
    if (state.wanted > 0 && state.sirenTimer <= 0) {
      state.sirenTimer = 2.6;
      audio.siren(true);
    }
    audio.engine(player.inCar ? Math.abs(player.inCar.speed) / 42 : 0);

    // HUD.
    hud.setCash(state.cash);
    hud.setRep(state.rep);
    hud.setHealth(player.health, PLAYER.health);
    hud.setArmor(player.armor);
    hud.setWanted(state.wanted);
    const hour = Math.floor(state.clockMin / 60) % 24;
    const minute = Math.floor(state.clockMin % 60);
    hud.setClock(hour, minute);
    hud.setObjective(missions.isFinished() || state.freeRoam
      ? (state.freeRoam ? 'Free roam — explore Solmar Bay, steal cars, dodge the PD.' : '🏆 Story complete — Solmar Bay is yours, Deke. Free roam!')
      : missions.objectiveText());
    hud.setDriving(!!player.inCar, player.inCar ? Math.abs(player.inCar.speed) * 3.6 : 0, player.inCar ? player.inCar.model.name : '');
    hud.setAmmo(!player.inCar, state.mag, Infinity);
    hud.setCrosshair(!player.inCar);
    hud.setHint(player.inCar
      ? 'WASD drive · Space brake · F exit · H horn · C camera · P pause'
      : 'WASD move · E steal car · Click shoot · R reload · M mission · P pause');
    hud.drawMinimap(snapshotForMap());
    // Fade the red damage flash (damagePlayer() sets it to 0.85 on a hit).
    const dmg = document.getElementById('damage');
    if (dmg) dmg.style.opacity = String(Math.max(0, Number(dmg.style.opacity || 0) - dt * 1.2));

    state.saveTimer += dt;
    if (state.saveTimer > 20) { state.saveTimer = 0; save(); }
  }

  function snapshotForMap() {
    return {
      player: { x: player.x, z: player.z, yaw: player.yaw },
      cars: allCars.filter((c) => !c.police),
      police: policeCars,
      enemies,
      missionTarget: missions.isFinished() || state.freeRoam ? null : missions.target(),
      time: state.time,
    };
  }

  function stateSnapshot() {
    return {
      phase: state.phase,
      cash: state.cash, rep: state.rep, wanted: state.wanted,
      missionIndex: missions.index, mission: missions.isFinished() ? 'done' : missions.current().id,
      objective: missions.objectiveText(),
      player: {
        x: +player.x.toFixed(1), z: +player.z.toFixed(1), yaw: +player.yaw.toFixed(2),
        health: Math.ceil(player.health), inCar: !!player.inCar,
        car: player.inCar ? player.inCar.model.name : null,
        speed: +player.speed.toFixed(1),
      },
      cars: allCars.length, traffic: traffic.length, parked: parked.length,
      pedsAlive: peds.filter((p) => p.alive).length,
      police: policeCars.length, footCops: footCops.filter((c) => c.alive).length,
      enemiesAlive: enemies.filter((e) => e.alive).length,
      kills: state.kills, carsStolen: state.carsStolen, missionsDone: state.missionsDone,
    };
  }

  // Debug / staging hooks used by shots.js and play-tests only.
  const debug = {
    teleport(x, z, yaw = 0) {
      if (player.inCar) exitCar(player, city);
      player.x = x; player.z = z; player.yaw = yaw; player.camYaw = yaw;
    },
    putInCar(car) { enterCar(player, car); },
    setWanted, setHealth(v) { player.health = v; },
    setCash(v) { state.cash = v; },
    setMission(i, stage) {
      missions.startAt(i);
      if (stage) missions.stage = stage;
      hud.setObjective(missions.objectiveText());
    },
    spawnPolice(n) { for (let i = 0; i < n; i += 1) spawnPoliceCar(); },
    spawnEnemies,
    comet() { return comet; },
    parkedCars() { return parked; },
    startFreeRoam() { start('free', false); },
    startStory() { start('story', false); },
  };

  return {
    state, player, camera, missions, traffic, parked, peds, policeCars, enemies, allCars, comet,
    step, start, pause, resume, quitToTitle, retry, save, load, hasSave, endRun,
    stateSnapshot, debug, addWanted, setWanted, damagePlayer,
  };
}
