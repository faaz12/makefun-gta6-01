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
    name: model.name, color: opts.color ?? model.color, alive: true,
    brakeLight: 0,
  };
  if (car.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.5, -0.2);
    mesh.add(bar);
    car.lightbar = bar;
  }
  return car;
}

/** Arcade driving: W/S throttle, A/D steer (steering scales with speed), Space brake. */
export function driveCar(car, input, dt, city, others) {
  const fwd = input.held.up ? 1 : input.held.down ? -1 : 0;
  const steerIn = (input.held.left ? 1 : 0) - (input.held.right ? 1 : 0);
  const top = CAR.maxSpeed * car.model.top;
  if (fwd > 0) car.speed += CAR.accel * dt;
  else if (fwd < 0) car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.reverseAccel) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR.grip * 0.6 * dt);
  if (input.held.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR.brake * dt);
  car.speed = clamp(car.speed, -CAR.maxReverse, top);
  const steerTarget = steerIn * CAR.steer * clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  car.yaw += car.steer * dt * (car.speed >= 0 ? 1 : -1) * 0.55;
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
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.yaw;
  return hit;
}

/** Traffic: follow the loop waypoints, slow for a car ahead, yaw smoothly. */
export function updateTraffic(car, dt, city, allCars) {
  if (!car.loop) return;
  const target = car.loop[car.loopIndex % car.loop.length];
  const dx = target.x - car.x;
  const dz = target.z - car.z;
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
  moveCar(car, dt, city, allCars);
}

export function spawnTraffic(city, scene, random, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const loop = city.loops[i % city.loops.length];
    const wp = loop[Math.floor(random() * loop.length)];
    const model = pick(random, CAR_MODELS);
    const car = createCar(city, model, wp.x + range(random, -2, 2), wp.z + range(random, -2, 2), range(random, 0, Math.PI * 2),
      { traffic: true, loop, loopIndex: 0, loopSpeed: range(random, 7, 11) });
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
