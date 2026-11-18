// Solmar Bay's game loop: phases, the wanted system, police response, mission
// progression, combat resolution, cash pickups, the clock and saving. The
// renderer owns the scene; this module owns what happens in it.
import * as THREE from 'three';
import { CAR_MODELS, CITY, COMBAT, PLAYER, SAVE_KEY, STEP, UPGRADES, WANTED } from './config.js';
import { clamp, pick, range } from './random.js';
import { createPlayer, createCamera, updatePlayer, shootRay, enterCar, exitCar } from './player.js';
import { createCar, moveCar, updateTraffic, spawnTraffic, spawnParked } from './vehicles.js';
import { createPerson, updatePedestrian, killPerson, spawnPedestrians, movePersonToward, pickCoverPoint } from './people.js';
import { createMissionManager, MISSIONS } from './missions.js';
import { createShops, nearestShop, SHOPS } from './shops.js';
import { createSafehouse, inSafehouse, updateSafehouse, SAFEHOUSE } from './safehouse.js';
import { createGarage, inGarageZone, freeBay, storedCars, GARAGE } from './garage.js';
import { createHelicopter, updateHelicopter, hideHelicopter } from './helicopter.js';
import { createCombat } from './combat.js';
import { ACT_ENTER, ACT_EXIT, ACT_SHOOT, ACT_RELOAD, ACT_PAUSE, ACT_MISSION, ACT_HORN, ACT_CAMERA, ACT_BUY1, ACT_BUY2, ACT_BUY3, ACT_BUY4 } from './input.js';

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
  const shops = createShops(scene);
  const safehouse = createSafehouse(scene);
  const garage = createGarage(scene);
  const heli = createHelicopter(scene);

  // The red Comet GT for Job 2, parked outside the Solmar Hotel.
  const comet = createCar(city, CAR_MODELS[0], -232, -206, 0, { parked: true });
  comet.isComet = true;
  scene.add(comet.mesh);
  parked.push(comet);
  allCars.push(comet);

  // The purple Sunset Coupe for Job 9, parked downtown.
  const coupe = createCar(city, CAR_MODELS[5], 120, -180, 0, { parked: true });
  coupe.isCoupe = true;
  scene.add(coupe.mesh);
  parked.push(coupe);
  allCars.push(coupe);

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
    reserve: COMBAT.ammoReserve, magSize: COMBAT.pistolMag,
    upgrades: { extMag: false, fastHands: false, armorPlate: false, engineTune: false },
    bustedTimer: 0, saveTimer: 0, sirenTimer: 0, gunfire: 0, safehouseTimer: 0,
    carsStolen: 0, kills: 0, missionsDone: 0, shotsFired: 0, prevPoliceTarget: 0,
    freeRoam: false, storyDone: false,
  };

  function save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: state.cash, rep: state.rep, missionIndex: missions.index,
        x: player.x, z: player.z, yaw: player.yaw, health: player.health,
        garage: storedCars(garage).map((c) => c.model.name),
        reserve: state.reserve, upgrades: { ...state.upgrades },
      }));
    } catch { /* private mode: the save lasts this visit only */ }
  }
  /**
   * A save file is player data from disk: validate every field before it
   * touches the game, so a corrupt or stale save can never soft-lock a run
   * (bad mission index, out-of-bounds position, unknown garage car, weird
   * upgrade flags all fall back to safe defaults).
   */
  function sanitizeSave(data) {
    if (!data || typeof data !== 'object') return null;
    const num = (v, dflt, min, max) => (typeof v === 'number' && Number.isFinite(v)
      ? Math.max(min, Math.min(max, v)) : dflt);
    const missionIndex = Number.isInteger(data.missionIndex)
      ? Math.max(0, Math.min(MISSIONS.length, data.missionIndex)) : 0;
    const garage = Array.isArray(data.garage)
      ? data.garage.filter((n) => CAR_MODELS.some((m) => m.name === n)).slice(0, 4) : [];
    const upgrades = { extMag: false, fastHands: false, armorPlate: false, engineTune: false };
    if (data.upgrades && typeof data.upgrades === 'object') {
      for (const k of Object.keys(upgrades)) upgrades[k] = data.upgrades[k] === true;
    }
    return {
      cash: num(data.cash, 40, 0, 999999),
      rep: num(data.rep, 0, 0, 9999),
      missionIndex,
      x: num(data.x, 0, -268, 268),
      z: num(data.z, 30, -268, 268),
      yaw: num(data.yaw, 0, -Math.PI * 2, Math.PI * 2),
      health: num(data.health, PLAYER.health, 1, PLAYER.health),
      garage,
      reserve: num(data.reserve, COMBAT.ammoReserve, 0, 999),
      upgrades,
    };
  }
  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return sanitizeSave(JSON.parse(raw));
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

  /** A crew holds open ground beside its target — never inside the building
   *  footprint. The 'marina' layout (Job 10) spreads the six foes along the
   *  docks and the marina front at different ranges, with two lieutenants
   *  (120 hp, dark-red shirts) holding the flanks — so the finale is a
   *  moving fight, not a firing line. */
  const MARINA_SPOTS = [
    { dx: -12, dz: -18, lt: false }, { dx: 8, dz: -24, lt: false },
    { dx: -20, dz: 6, lt: true }, { dx: 14, dz: 14, lt: false },
    { dx: -6, dz: 30, lt: false }, { dx: 22, dz: -4, lt: true },
  ];
  function spawnEnemies(at, count, layout) {
    const base = at || city.landmarks.bank || { x: 225, z: 225 };
    const n = count || 4;
    if (layout === 'marina') {
      for (let i = 0; i < n; i += 1) {
        const spot = MARINA_SPOTS[i % MARINA_SPOTS.length];
        const e = createPerson(scene, random, base.x + spot.dx, base.z + spot.dz,
          spot.lt
            ? { enemy: true, hp: 120, shirt: 0x6a1a1a, name: 'Harbor Crew Lt.' }
            : { enemy: true });
        enemies.push(e);
      }
    } else {
      // Default: a crew holds the open ground beside its target — the
      // offset points back toward the city centre.
      const dx = base.x < 0 ? 26 : -26;
      for (let i = 0; i < n; i += 1) {
        const e = createPerson(scene, random,
          base.x + dx + range(random, -8, 8), base.z + range(random, -14, 14), { enemy: true });
        enemies.push(e);
      }
    }
    // enemiesLeft counts LIVE foes for this shootout — not enemies.length:
    // the array keeps dead crews from earlier missions (Job 5's 4), so
    // counting the array would strand Job 10 at "4 left" after all 6 die.
    missions.enemiesLeft = enemies.filter((e) => e.alive).length;
  }

  /** Clear every live combatant and reset the mission stage — the recovery
   *  path after Busted/Wasted and after loading, so a failed shootout can
   *  never leave a ghost crew or a stuck 'fight' stage behind. */
  function clearCombatState() {
    for (const e of enemies) scene.remove(e.mesh);
    enemies.length = 0;
    missions.enemiesLeft = 0;
    missions.stage = 'go';
    missions.pickedUp = false;
    missions.escapeTimer = 0;
    removePolice();
    hideHelicopter(heli);
    state.wanted = 0;
    state.bustedTimer = 0;
    state.heatTimer = 0;
    state.quietTimer = 0;
    state.reloadTimer = 0;
    state.fireTimer = 0;
  }

  /** The car a 'steal' job wants: the Comet GT, or the Sunset Coupe. */
  function stealTargetCar(m) {
    return m.steal === 'coupe' ? coupe : comet;
  }

  /** Buy the shop's item, or say why it can't be bought. Bay Arms sells
   *  body armor first; once Deke is armored it sells pistol ammo ($60 for
   *  +24 reserve) — the economy loop: mission cash feeds the next fight. */
  function buyFromShop(shop) {
    if (shop.id === 'bay-arms') {
      if (player.armor < 50) {
        if (state.cash < shop.price) { hud.toast(`Body armor is $${shop.price} — you have $${state.cash}.`); return; }
        state.cash -= shop.price;
        player.armor = 50;
        audio.cash();
        hud.toast(`Body armor fitted — $${shop.price}.`);
      } else if (state.reserve < 96) {
        if (state.cash < COMBAT.ammoPrice) { hud.toast(`Pistol ammo is $${COMBAT.ammoPrice} — you have $${state.cash}.`); return; }
        state.cash -= COMBAT.ammoPrice;
        state.reserve = Math.min(96, state.reserve + COMBAT.ammoPack);
        audio.cash();
        hud.toast(`+${COMBAT.ammoPack} pistol ammo — $${COMBAT.ammoPrice}.`);
      } else {
        hud.toast('Fully stocked — armor on, ammo full.');
        return;
      }
    } else {
      if (player.health >= PLAYER.health) { hud.toast('Already full health — come back hungry.'); return; }
      if (state.cash < shop.price) { hud.toast(`A full meal is $${shop.price} — you have $${state.cash}.`); return; }
      state.cash -= shop.price;
      player.health = PLAYER.health;
      audio.cash();
      hud.toast(`Full meal — health restored, $${shop.price}.`);
    }
    save();
  }

  /** Buy a safehouse upgrade with mission cash (keys 1–4 in the ring). */
  function buyUpgrade(index) {
    const up = UPGRADES[index];
    if (!up || state.upgrades[up.id]) return;
    if (state.cash < up.price) {
      hud.toast(`${up.name} is $${up.price} — you have $${state.cash}. Earn more on the next job.`);
      return;
    }
    state.cash -= up.price;
    state.upgrades[up.id] = true;
    if (up.id === 'extMag') {
      state.magSize = COMBAT.pistolMag + 6;
      state.mag = Math.min(state.magSize, state.mag + 6);
    }
    if (up.id === 'armorPlate') player.armor = Math.max(player.armor, 25);
    if (up.id === 'engineTune') player.topMul = 1.1;
    audio.cash();
    hud.toast(`✓ ${up.name} — ${up.desc}.`);
    save();
  }

  /** Park the player's car in the first free garage bay. */
  function storeCar(car) {
    const bay = freeBay(garage);
    if (!bay) { hud.toast("Rico's Garage is full — 4 cars max."); return; }
    bay.car = car;
    car.stored = true;
    car.parked = true;
    car.x = bay.x;
    car.z = bay.z;
    car.yaw = 0;
    car.speed = 0;
    car.mesh.position.set(bay.x, 0, bay.z);
    car.mesh.rotation.y = 0;
    exitCar(player, city);
    audio.cash();
    hud.toast(`${car.model.name} stored in Rico's Garage (${storedCars(garage).length}/4).`);
    save();
  }

  /** Re-park the saved garage cars after loading a save. */
  function restoreGarage(names) {
    if (!names || garage.bays.some((b) => b.car)) return;
    for (const name of names) {
      const model = CAR_MODELS.find((m) => m.name === name);
      const bay = freeBay(garage);
      if (!model || !bay) continue;
      const car = createCar(city, model, bay.x, bay.z, 0, { parked: true });
      car.stored = true;
      scene.add(car.mesh);
      bay.car = car;
      parked.push(car);
      allCars.push(car);
    }
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
      const targetCar = stealTargetCar(m);
      if (missions.stage === 'go') {
        if (player.inCar === targetCar) {
          missions.stage = 'deliver';
          hud.toast(`${targetCar.model.name} lifted! Get it to ${m.deliver.label}.`);
          if (m.mid) hud.dialog(m.mid);
          hud.setObjective(missions.objectiveText());
        } else {
          hud.toast(`That is not the ${targetCar.model.name} — find it at ${m.target.label}.`);
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
        hud.toast(`Package picked up — deliver to ${m.deliver.label}!`);
        if (m.mid) hud.dialog(m.mid);
        hud.setObjective(missions.objectiveText());
        return;
      }
      completeMission();
      return;
    }
    if (m.kind === 'shootout') {
      if (missions.stage === 'go') {
        missions.stage = 'fight';
        spawnEnemies(m.fightAt, m.foes, m.layout);
        if (m.mid) hud.dialog(m.mid);
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
    // Escalation reads on the radio: more stars, more units, one toast.
    if (targetCount > state.prevPoliceTarget && want >= 2) {
      hud.toast(`📻 PD dispatch: ${want} stars — more units responding.`);
    }
    state.prevPoliceTarget = targetCount;
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
    // Police cars chase and ram. A fast player gets an intercept course —
    // the cruiser aims where Deke is going, not where he is (a PIT setup).
    for (const car of policeCars) {
      const dx = player.x - car.x;
      const dz = player.z - car.z;
      const dist = Math.hypot(dx, dz);
      let aimX = player.x;
      let aimZ = player.z;
      if (player.inCar && Math.abs(player.inCar.speed) > 15 && dist < 40) {
        aimX += Math.sin(player.inCar.yaw) * player.inCar.speed * 0.7;
        aimZ += Math.cos(player.inCar.yaw) * player.inCar.speed * 0.7;
      }
      const wantYaw = Math.atan2(aimX - car.x, aimZ - car.z);
      const diff = ((wantYaw - car.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      car.yaw += clamp(diff, -2.2 * dt, 2.2 * dt);
      car.speed = clamp(car.speed + (dist > 12 ? 16 : 8) * dt, 0, dist > 30 ? 34 : 24);
      const hit = moveCar(car, dt, city, allCars);
      if (hit && Math.abs(car.speed) > 8) audio.crash();
      car.lightbar.material.color.setHex(Math.floor(state.time * 4) % 2 === 0 ? 0xff2222 : 0x2244ff);
      car.ramCd = Math.max(0, (car.ramCd || 0) - dt);
      if (dist < 4.2) {
        if (player.inCar) {
          player.inCar.speed *= 0.86;
          player.shake = 0.5;
          // A ram dents the player's car (visible damage + slower top speed).
          if (car.ramCd <= 0) {
            player.inCar.damage = Math.min(100, (player.inCar.damage || 0) + 4);
            car.ramCd = 0.6;
          }
          if (Math.random() < dt * 2) audio.crash();
        } else {
          state.bustedTimer += dt;
          hud.toast('The PD is on you — RUN!', 1200);
          if (state.bustedTimer > 1.4) endRun('busted');
        }
      }
    }
    // Foot cops chase and shoot — but a hit staggers them (no shooting
    // while flinching), so return fire is not a hitscan wall.
    for (const cop of footCops) {
      if (!cop.alive) continue;
      if (cop.hitReact > 0) {
        cop.hitReact -= dt;
        cop.mesh.rotation.x = 0.18;
        continue;
      }
      cop.mesh.rotation.x = 0;
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
      // A hit staggers the crew member: a visible flinch, no shooting.
      if (e.hitReact > 0) {
        e.hitReact -= dt;
        e.mesh.rotation.x = 0.18;
        continue;
      }
      e.mesh.rotation.x = 0;
      // Cover: hold a spot and shoot, then move to a fresh one — the crew
      // does not stand in a firing line waiting to be picked off.
      e.coverTimer -= dt;
      if (e.coverTimer <= 0) {
        if (!e.coverTarget) {
          e.coverTarget = pickCoverPoint(e, random, city);
        } else if (movePersonToward(e, e.coverTarget.x, e.coverTarget.z, dt, city)) {
          e.coverTarget = null;
          e.coverTimer = range(random, 2.5, 4.5);
        }
        e.yaw = Math.atan2(player.x - e.x, player.z - e.z);
        e.mesh.rotation.y = e.yaw;
        continue;
      }
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
    hideHelicopter(heli);
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
    // Full recovery: no ghost crew, no stuck stage, no lingering heat —
    // the run restarts clean at the current job, every time.
    clearCombatState();
    player.health = PLAYER.health;
    player.armor = state.upgrades.armorPlate ? 25 : 0;
    player.topMul = state.upgrades.engineTune ? 1.1 : 1;
    state.mag = state.magSize;
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
    clearCombatState();
    state.phase = 'play';
    state.freeRoam = mode === 'free';
    // Upgrades + reserve come from the save (or a fresh start resets them).
    state.upgrades = data ? { ...data.upgrades } : { extMag: false, fastHands: false, armorPlate: false, engineTune: false };
    state.reserve = data ? data.reserve : COMBAT.ammoReserve;
    state.magSize = state.upgrades.extMag ? COMBAT.pistolMag + 6 : COMBAT.pistolMag;
    state.mag = state.magSize;
    player.topMul = state.upgrades.engineTune ? 1.1 : 1;
    player.armor = state.upgrades.armorPlate ? 25 : 0;
    if (data) {
      state.cash = data.cash ?? 40;
      state.rep = data.rep ?? 0;
      if (data.missionIndex >= MISSIONS.length) {
        // The story is done: continuing drops Deke into free roam with
        // the finale state, not back at Job 10.
        missions.startAt(MISSIONS.length - 1);
        missions.advance();
        state.storyDone = true;
        state.freeRoam = true;
      } else {
        missions.startAt(data.missionIndex ?? 0);
      }
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
    if (data && data.garage) restoreGarage(data.garage);
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
    hud.showPause(`Cash $${state.cash} · REP ${state.rep} · Jobs done ${state.missionsDone}/${MISSIONS.length} · Cars stolen ${state.carsStolen} · Garage ${storedCars(garage).length}/4 · Upgrades ${Object.values(state.upgrades).filter(Boolean).length}/4 · Wanted ${'★'.repeat(state.wanted) || 'none'}`);
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
    hideHelicopter(heli);
    hud.hidePause();
    hud.showStart(hasSave());
    audio.engine(0);
    audio.stopMusic();
  }

  function tryShoot() {
    if (state.reloadTimer > 0 || state.fireTimer > 0 || player.inCar) return;
    if (state.mag <= 0) {
      if (state.reserve > 0) {
        // Auto-reload from the reserve (Fast Hands reloads quicker).
        state.reloadTimer = state.upgrades.fastHands ? 0.45 : 0.7;
        const take = Math.min(state.magSize, state.reserve);
        state.reserve -= take;
        state.mag = take;
        audio.reload();
      } else {
        audio.reload();
        hud.toast('Out of ammo — buy more at Bay Arms.');
        state.fireTimer = 0.3;
      }
      return;
    }
    state.fireTimer = COMBAT.fireInterval;
    state.mag -= 1;
    state.shotsFired += 1;
    state.gunfire = 0.5;
    player.shake = Math.max(player.shake, 0.12);
    const { origin, dir } = shootRay(player, camera);
    const targets = [...peds, ...footCops, ...enemies];
    const result = combat.shoot(origin, dir, targets);
    audio.gunshot();
    if (result.hit) hud.hitmarker();
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
      } else if (v.alive) {
        // A hit that does not kill staggers the target — visible feedback
        // and a beat where it cannot shoot back.
        v.hitReact = 0.3;
      }
    }
  }

  function step(dt) {
    state.time += dt;
    state.clockMin += dt * 0.5;
    city.update(dt, state.time);
    updateSafehouse(safehouse, state.time);
    combat.update(dt);
    // Traffic and pedestrians always amble, even on the title screen.
    for (const car of traffic) updateTraffic(car, dt, city, allCars);
    for (const p of peds) updatePedestrian(p, dt, random, city, player, state.gunfire > 0, policeCars);
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
      const shop = nearestShop(shops, player.x, player.z, 5);
      if (shop) {
        buyFromShop(shop);
      } else {
        const car = nearestCar(4);
        if (car) {
          enterCar(player, car);
          state.carsStolen += 1;
          audio.steal();
          hud.toast(car.isComet ? 'Comet GT — nice. Now run!' : car.isCoupe ? 'Sunset Coupe — nice. Now run!' : `Stole the ${car.model.name}!`);
          const cm = missions.current();
          const isTarget = !state.freeRoam && cm.kind === 'steal' && car === stealTargetCar(cm);
          addWanted(1, isTarget ? 'The owner called the cops!' : 'Grand theft auto');
          if (isTarget && missions.stage === 'go') {
            missions.stage = 'deliver';
            hud.toast(`${car.model.name} lifted! Get it to ${cm.deliver.label}.`);
            if (cm.mid) hud.dialog(cm.mid);
            hud.setObjective(missions.objectiveText());
            // The Sunset Coupe is a hot car: lifting it pulls a two-car
            // tail at once — the escape sequence starts on the lift.
            if (cm.steal === 'coupe') {
              spawnPoliceCar();
              spawnPoliceCar();
              addWanted(1, "The buyer's crew called the cops!");
            }
          }
        }
      }
    }
    if ((actions & ACT_ENTER) && player.inCar && inGarageZone(garage, player.x, player.z)) {
      storeCar(player.inCar);
    }
    // Safehouse upgrades: keys 1–4 while standing in the ring on foot.
    if (!player.inCar && inSafehouse(safehouse, player.x, player.z)) {
      if (actions & ACT_BUY1) buyUpgrade(0);
      else if (actions & ACT_BUY2) buyUpgrade(1);
      else if (actions & ACT_BUY3) buyUpgrade(2);
      else if (actions & ACT_BUY4) buyUpgrade(3);
    }
    if ((actions & ACT_EXIT) && player.inCar) exitCar(player, city);
    if (actions & ACT_RELOAD && !player.inCar && state.mag < state.magSize && state.reserve > 0) {
      state.reloadTimer = state.upgrades.fastHands ? 0.45 : 0.7;
      const take = Math.min(state.magSize - state.mag, state.reserve);
      state.reserve -= take;
      state.mag += take;
      audio.reload();
    }
    if (input.mouseDown || (actions & ACT_SHOOT)) tryShoot();

    state.fireTimer = Math.max(0, state.fireTimer - dt);
    if (state.reloadTimer > 0) state.reloadTimer -= dt;

    player.topMul = state.upgrades.engineTune ? 1.1 : 1;
    const crash = updatePlayer(player, input, dt, city, camera);
    if (crash === 'crash') {
      audio.crash();
      player.shake = 0.4;
      if (Math.abs(player.inCar.speed) > 10) addWanted(0, '');
    }

    // An escape job starts hot: the tail arrives the moment the job begins.
    if (!state.freeRoam && missions.current().kind === 'escape' && state.wanted === 0 && missions.stage === 'go') {
      const stars = missions.current().stars || 3;
      setWanted(stars);
      missions.stage = 'hot';
      hud.dialog(`<b>DISPATCH:</b> "All units — Deke Marlowe. ${stars} stars, bring him in."`);
    }

    updatePolice(dt);
    updateEnemies(dt);
    checkMission(dt);

    // Safehouse: step into the ring to heal, shake the heat and save — but
    // not with a cop breathing down your neck.
    if (inSafehouse(safehouse, player.x, player.z) && state.safehouseTimer <= 0) {
      if (nearestThreat() < 40) {
        hud.toast('Cops too close — lose them before hiding at the safehouse.');
        state.safehouseTimer = 6;
      } else {
        player.health = PLAYER.health;
        setWanted(0);
        audio.siren(false);
        removePolice();
        state.safehouseTimer = 10;
        hud.toast("Safehouse — patched up, heat off, game saved.");
        audio.cash();
        save();
      }
    }
    state.safehouseTimer = Math.max(0, state.safehouseTimer - dt);

    // Air One: at four stars the helicopter arrives. While its spotlight
    // is locked on Deke the heat never cools; when Deke breaks line of
    // sight it falls back to searching the last seen spot, and the heat
    // can cool again.
    const heliEvent = updateHelicopter(heli, dt, state.time, player.x, player.z, state.wanted);
    if (heliEvent === 'arrived' || heliEvent === 'found') {
      hud.toast('🚁 Air One overhead — the heat won\'t cool while it watches!');
      audio.siren(true);
    } else if (heliEvent === 'lost') {
      hud.toast('🚁 Air One lost visual — searching the area. Stay hidden!');
    }

    // Wanted decays when the player stays out of sight — unless the
    // helicopter is overhead watching.
    if (state.wanted > 0) {
      if (nearestThreat() > 55 && !(heli.active && heli.mode === 'watch')) {
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
    hud.setDriving(!!player.inCar, player.inCar ? Math.abs(player.inCar.speed) * 3.6 : 0,
      player.inCar ? `${player.inCar.model.name}${player.inCar.damage > 0 ? ` · DMG ${Math.round(player.inCar.damage)}%` : ''}` : '');
    hud.setAmmo(!player.inCar, state.mag, state.reserve);
    hud.setCrosshair(!player.inCar);
    const nearShop = !player.inCar ? nearestShop(shops, player.x, player.z, 5) : null;
    const nearSafe = !player.inCar && inSafehouse(safehouse, player.x, player.z);
    const inGarage = !!player.inCar && inGarageZone(garage, player.x, player.z);
    // Safehouse hint doubles as the upgrade menu (keys 1–4, unowned only).
    const upgradeHint = nearSafe
      ? UPGRADES.map((u, i) => (state.upgrades[u.id] ? null : `${i + 1}: ${u.name} $${u.price}`)).filter(Boolean).join(' · ')
      : '';
    hud.setHint(nearShop
      ? `E — ${nearShop.name}: ${nearShop.id === 'bay-arms' ? 'Body Armor $150 · Ammo $60' : `${nearShop.item} $${nearShop.price}`}`
      : nearSafe
        ? (upgradeHint ? `Safehouse — heal & save · Upgrades: ${upgradeHint}` : 'Safehouse — heal & save · All upgrades owned')
        : inGarage
          ? "E — Store this car in Rico's Garage"
          : player.inCar
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
      shops: shops.map((s) => ({ x: s.x, z: s.z })),
      safehouse: { x: SAFEHOUSE.x, z: SAFEHOUSE.z },
      garage: { x: GARAGE.x, z: GARAGE.z },
      heli: heli.active ? { x: heli.x, z: heli.z } : null,
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
      heli: heli.active, heliMode: heli.mode, garageCars: storedCars(garage).length,
      missionsTotal: MISSIONS.length, shops: shops.length,
      kills: state.kills, carsStolen: state.carsStolen, missionsDone: state.missionsDone,
      reserve: state.reserve, mag: state.mag, magSize: state.magSize,
      upgrades: Object.keys(state.upgrades).filter((k) => state.upgrades[k]),
      carDamage: player.inCar ? Math.round(player.inCar.damage || 0) : 0,
      topMul: player.topMul ?? 1,
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
    coupe() { return coupe; },
    heli() { return heli; },
    heliMode() { return heli.mode; },
    garageCars() { return storedCars(garage).length; },
    shops() { return shops; },
    parkedCars() { return parked; },
    upgrades() { return { ...state.upgrades }; },
    reserve() { return state.reserve; },
    setReserve(v) { state.reserve = v; },
    buyUpgrade(i) { buyUpgrade(i); },
    startFreeRoam() { start('free', false); },
    startStory() { start('story', false); },
  };

  return {
    state, player, camera, missions, traffic, parked, peds, policeCars, enemies, allCars, comet, city,
    step, start, pause, resume, quitToTitle, retry, save, load, hasSave, endRun,
    stateSnapshot, debug, addWanted, setWanted, damagePlayer,
  };
}
