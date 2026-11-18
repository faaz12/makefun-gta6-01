// Cars: traffic that loops the avenues, parked cars to steal, and the arcade
// driving model the player uses. A car is a mesh + a small physics state;
// collisions are circle-vs-building-AABB, cheap and stable at 60 Hz.
import * as THREE from 'three';
import { CAR, CAR_MODELS } from './config.js';
import { angleDiff, clamp, pick, range } from './random.js';

export function createCar(city, model, x, z, yaw, opts = {}) {
  const mesh = city.makeCarMesh(model, opts.color ?? model.color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = yaw;
  const car = {
    model, mesh, x, z, yaw, speed: 0, steer: 0,
    parked: !!opts.parked, traffic: !!opts.traffic, police: !!opts.police,
    loop: opts.loop || null, loopIndex: opts.loopIndex || 0, loopSpeed: opts.loopSpeed || 9,
    lane: opts.lane || 0,
    name: model.name, color: opts.color ?? model.color, alive: true,
    brakeLight: 0, damage: 0, damageCd: 0, ramCd: 0,
  };
  if (car.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.5, -0.2);
    mesh.add(bar);
    car.lightbar = bar;
  }
  // Brake light (bright red when braking or crawling) + damage smoke
  // (visible once a crash has beaten the car up past 50%).
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x550000 });
  const brake = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.1), brakeMat);
  brake.position.set(0, 0.62, -2.22);
  mesh.add(brake);
  car.brakeMesh = brake;
  car.brakeMat = brakeMat;
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.55 }));
  smoke.position.set(0, 1.25, 1.2);
  smoke.visible = false;
  mesh.add(smoke);
  car.smoke = smoke;
  return car;
}

/** Flip a car's brake light bright / dim. */
export function setBrake(car, on) {
  if (!car.brakeMat) return;
  car.brakeMat.color.setHex(on ? 0xff2222 : 0x550000);
}

/**
 * Arcade driving: W/S throttle, A/D steer (steering scales with speed),
 * Space brake. Each model drives differently (see CAR_MODELS): the Sunset
 * Coupe is sharp and loose, the Harbor Van is slow but planted, the Dune
 * Buggy steers fast and slides. Damage from crashes caps the top speed.
 * `topMul` is the safehouse Engine Tune bonus (1.1 when owned).
 */
export function driveCar(car, input, dt, city, others, topMul = 1) {
  const fwd = input.held.up ? 1 : input.held.down ? -1 : 0;
  const steerIn = (input.held.left ? 1 : 0) - (input.held.right ? 1 : 0);
  const model = car.model;
  const accel = CAR.accel * (model.accel ?? 1);
  const steerRate = CAR.steer * (model.steer ?? 1);
  const grip = CAR.grip * (model.grip ?? 1);
  const top = CAR.maxSpeed * model.top * topMul * (1 - Math.min(30, car.damage * 0.3) / 100);
  if (fwd > 0) car.speed += accel * dt;
  else if (fwd < 0) car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.reverseAccel) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), grip * 0.6 * dt);
  if (input.held.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR.brake * dt);
  car.speed = clamp(car.speed, -CAR.maxReverse, top);
  const steerTarget = steerIn * steerRate * clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  car.yaw += car.steer * dt * (car.speed >= 0 ? 1 : -1) * 0.55;
  setBrake(car, !!input.held.brake || fwd < 0);
  return moveCar(car, dt, city, others);
}

export function moveCar(car, dt, city, others) {
  const nx = car.x + Math.sin(car.yaw) * car.speed * dt;
  const nz = car.z + Math.cos(car.yaw) * car.speed * dt;
  let hit = false;
  const r = 1.6;
  if (!city.hitsBuilding(nx, car.z, r) && !city.hitsBuilding(car.x, nz, r)) {
    car.x = nx;
    car.z = nz;
  } else {
    // Slide along the wall: keep the axis that is clear.
    if (!city.hitsBuilding(nx, car.z, r)) car.x = nx;
    else if (!city.hitsBuilding(car.x, nz, r)) car.z = nz;
    else hit = true;
    if (Math.abs(car.speed) > 6) hit = true;
    car.speed *= 0.55;
  }
  const clamped = city.clamp(car.x, car.z);
  if (clamped.x !== car.x || clamped.z !== car.z) { car.x = clamped.x; car.z = clamped.z; car.speed *= 0.5; hit = true; }
  if (others) {
    for (const o of others) {
      if (o === car || !o.alive) continue;
      const dx = o.x - car.x;
      const dz = o.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.4 && d > 0.01) {
        const push = (3.4 - d) / 2;
        car.x -= (dx / d) * push;
        car.z -= (dz / d) * push;
        car.speed *= 0.85;
        hit = true;
      }
    }
  }
  // A hard hit dents the car: damage caps top speed, and past 50% the
  // engine smokes so the damage reads at a glance. Cooled down so leaning
  // on a wall for a second does not total the car.
  car.damageCd = Math.max(0, (car.damageCd ?? 0) - dt);
  if (hit && Math.abs(car.speed) > 8 && car.damageCd <= 0) {
    car.damage = Math.min(100, car.damage + Math.min(12, Math.abs(car.speed) * 0.4));
    car.damageCd = 0.5;
  }
  if (car.smoke) {
    car.smoke.visible = car.damage > 50;
    if (car.smoke.visible) {
      const s = 0.7 + (car.damage - 50) / 50 * 0.9;
      car.smoke.scale.set(s, s, s);
    }
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.yaw;
  return hit;
}

/** Traffic: follow the loop waypoints (each car holds its own lane offset),
 *  slow for a car ahead, yaw smoothly. Brake lights show when slowing. */
export function updateTraffic(car, dt, city, allCars) {
  if (!car.loop) return;
  const target = car.loop[car.loopIndex % car.loop.length];
  // Lane offset: drive parallel to the loop, not on top of every other car.
  const dx0 = target.x - car.x;
  const dz0 = target.z - car.z;
  const d0 = Math.hypot(dx0, dz0) || 1;
  const px = -dz0 / d0;
  const pz = dx0 / d0;
  const tx = target.x + px * car.lane;
  const tz = target.z + pz * car.lane;
  const dx = tx - car.x;
  const dz = tz - car.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 4) {
    car.loopIndex += 1;
    return;
  }
  const wantYaw = Math.atan2(dx, dz);
  const diff = angleDiff(car.yaw, wantYaw);
  car.yaw += clamp(diff, -1.4 * dt, 1.4 * dt);
  let speed = car.loopSpeed;
  for (const o of allCars) {
    if (o === car || !o.alive) continue;
    const ox = o.x - car.x;
    const oz = o.z - car.z;
    const od = Math.hypot(ox, oz);
    if (od < 9 && Math.abs(angleDiff(car.yaw, Math.atan2(ox, oz))) < 0.6) speed = Math.min(speed, 2.5);
  }
  car.speed = speed;
  setBrake(car, speed < car.loopSpeed * 0.6);
  moveCar(car, dt, city, allCars);
}

export function spawnTraffic(city, scene, random, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const loop = city.loops[i % city.loops.length];
    const wp = loop[Math.floor(random() * loop.length)];
    const model = pick(random, CAR_MODELS);
    // Vans lumber, taxis and sports cars hurry — traffic reads as mixed.
    const pace = model.style === 'van' ? range(random, 5, 7) : range(random, 7, 11);
    const car = createCar(city, model, wp.x + range(random, -2, 2), wp.z + range(random, -2, 2), range(random, 0, Math.PI * 2),
      { traffic: true, loop, loopIndex: 0, loopSpeed: pace, lane: range(random, -2.5, 2.5) });
    scene.add(car.mesh);
    cars.push(car);
  }
  return cars;
}

export function spawnParked(city, scene, random, count) {
  const cars = [];
  const used = new Set();
  for (let i = 0; i < count; i += 1) {
    let x = 0;
    let z = 0;
    let key = '';
    let tries = 0;
    do {
      const road = [-180, -120, -60, 0, 60, 120, 180][Math.floor(random() * 7)];
      const along = range(random, -230, 230);
      if (random() < 0.5) { x = road + 5.2; z = along; } else { x = along; z = road + 5.2; }
      key = `${Math.round(x / 10)},${Math.round(z / 10)}`;
      tries += 1;
    } while (used.has(key) && tries < 20);
    used.add(key);
    const model = pick(random, CAR_MODELS);
    const yaw = Math.abs(x) > Math.abs(z) ? (x > 0 ? Math.PI / 2 : -Math.PI / 2) : 0;
    const car = createCar(city, model, x, z, yaw, { parked: true });
    scene.add(car.mesh);
    cars.push(car);
  }
  return cars;
}
