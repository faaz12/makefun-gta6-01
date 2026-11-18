// Danny "Deke" Marlowe: third-person on-foot movement with mouse-look camera,
// and the driver seat — entering, stealing and exiting cars. The camera is a
// chase camera that swings behind the player (or the car) and can be toggled
// between near and far with C.
import * as THREE from 'three';
import { CAR, PLAYER } from './config.js';
import { clamp } from './random.js';
import { driveCar, moveCar } from './vehicles.js';

export function createPlayer(scene) {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x1e8a8a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3a5a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.36), jacket);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.72;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), new THREE.MeshLambertMaterial({ color: 0xd82a2a }));
  cap.position.y = 1.96;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.26), jeans);
  legL.position.set(-0.16, 0.31, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.2), jacket);
  armL.position.set(-0.4, 1.05, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.4;
  g.add(armR);
  scene.add(g);

  const player = {
    mesh: g, parts: { legL, legR, armL, armR },
    x: 0, z: 30, yaw: 0, pitch: -0.18, camYaw: 0, camPitch: -0.22,
    vx: 0, vz: 0, health: PLAYER.health, armor: 0,
    inCar: null, walkPhase: 0, camDist: 8.5, shake: 0,
    speed: 0, // current planar speed, for HUD/telemetry
    topMul: 1, // Engine Tune upgrade: 1.1 when owned (set by the game loop)
  };
  return player;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
  return camera;
}

/** Mouse look: pointer-lock deltas swing the camera yaw/pitch. */
export function applyMouse(player, dx, dy) {
  player.camYaw -= dx * 0.0026;
  player.camPitch = clamp(player.camPitch - dy * 0.0022, -0.9, 0.55);
  if (!player.inCar) player.yaw = player.camYaw;
}

export function updatePlayer(player, input, dt, city, camera) {
  const mouse = input.takeMouse();
  applyMouse(player, mouse.dx, mouse.dy);
  if (player.inCar) {
    const car = player.inCar;
    const hit = driveCar(car, input, dt, city, null, player.topMul ?? 1);
    player.x = car.x;
    player.z = car.z;
    player.yaw = car.yaw;
    player.speed = Math.abs(car.speed);
    // Chase camera eases behind the car while driving (camera sits opposite
    // the car's heading, so camYaw tracks the car's yaw itself).
    const behind = car.yaw;
    let diff = ((behind - player.camYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    player.camYaw += diff * Math.min(1, dt * 2.2);
    player.camPitch += (-0.24 - player.camPitch) * Math.min(1, dt * 2);
    player.mesh.visible = false;
    positionCamera(player, camera, dt, 13, 5.0);
    return hit ? 'crash' : null;
  }
  player.mesh.visible = true;
  const sprint = input.held.sprint;
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  // WASD moves relative to the camera yaw (forward = away from camera).
  const fwdX = Math.sin(player.camYaw);
  const fwdZ = Math.cos(player.camYaw);
  const rightX = Math.sin(player.camYaw + Math.PI / 2) * -1;
  const rightZ = Math.cos(player.camYaw + Math.PI / 2) * -1;
  let mx = 0;
  let mz = 0;
  if (input.held.up) { mx += fwdX; mz += fwdZ; }
  if (input.held.down) { mx -= fwdX; mz -= fwdZ; }
  if (input.held.left) { mx += rightX; mz += rightZ; }
  if (input.held.right) { mx -= rightX; mz -= rightZ; }
  const len = Math.hypot(mx, mz);
  let moving = false;
  if (len > 0.01) {
    mx /= len; mz /= len;
    const tx = player.x + mx * speed * dt;
    const tz = player.z + mz * speed * dt;
    if (!city.hitsBuilding(tx, player.z, PLAYER.radius)) player.x = tx;
    if (!city.hitsBuilding(player.x, tz, PLAYER.radius)) player.z = tz;
    const c = city.clamp(player.x, player.z);
    player.x = c.x; player.z = c.z;
    player.yaw = Math.atan2(mx, mz);
    player.speed = speed;
    moving = true;
  } else {
    player.speed = 0;
  }
  player.walkPhase += dt * (moving ? speed * 1.9 : 0);
  const swing = moving ? Math.sin(player.walkPhase) * 0.5 : 0;
  player.parts.legL.rotation.x = swing;
  player.parts.legR.rotation.x = -swing;
  player.parts.armL.rotation.x = -swing * 0.7;
  player.parts.armR.rotation.x = swing * 0.7;
  player.mesh.position.set(player.x, Math.abs(Math.sin(player.walkPhase)) * (moving ? 0.05 : 0), player.z);
  player.mesh.rotation.y = player.yaw;
  positionCamera(player, camera, dt, player.camDist, 3.4);
  return null;
}

function positionCamera(player, camera, dt, dist, height) {
  const cy = player.camYaw;
  const cp = player.camPitch;
  const tx = player.x - Math.sin(cy) * Math.cos(cp) * dist;
  const tz = player.z - Math.cos(cy) * Math.cos(cp) * dist;
  const ty = height + Math.sin(-cp) * dist * 0.55;
  camera.position.set(tx, ty, tz);
  const shakeX = player.shake > 0 ? (Math.random() - 0.5) * player.shake : 0;
  const shakeY = player.shake > 0 ? (Math.random() - 0.5) * player.shake : 0;
  // Look at a point ahead of the player, so the screen centre (and the
  // crosshair) sits where the player is aiming, not on the player's back.
  camera.lookAt(
    player.x + Math.sin(player.camYaw) * 4.5 + shakeX,
    1.8 + shakeY,
    player.z + Math.cos(player.camYaw) * 4.5,
  );
  if (player.shake > 0) player.shake = Math.max(0, player.shake - dt * 2.4);
}

/** Where a pistol shot starts (the player's chest) and where it points
 * (where the camera faces, levelled: the camera sits above the player and
 * looks down, so its pitch would drive every shot into the ground). */
export function shootRay(player, camera) {
  const origin = new THREE.Vector3(player.x, 1.35, player.z);
  const dir = new THREE.Vector3(Math.sin(player.camYaw), 0, Math.cos(player.camYaw)).normalize();
  return { origin, dir };
}

export function enterCar(player, car) {
  player.inCar = car;
  car.parked = false;
  car.traffic = false;
  player.mesh.visible = false;
}

export function exitCar(player, city) {
  const car = player.inCar;
  if (!car) return;
  player.inCar = null;
  const side = Math.cos(car.yaw) > 0 ? 1 : -1;
  player.x = car.x + Math.cos(car.yaw) * 2.4 * side;
  player.z = car.z - Math.sin(car.yaw) * 2.4 * side;
  if (city.hitsBuilding(player.x, player.z, 0.7)) {
    player.x = car.x - Math.cos(car.yaw) * 2.4 * side;
    player.z = car.z + Math.sin(car.yaw) * 2.4 * side;
  }
  const c = city.clamp(player.x, player.z);
  player.x = c.x;
  player.z = c.z;
  player.camYaw = car.yaw;
  player.mesh.visible = true;
}
