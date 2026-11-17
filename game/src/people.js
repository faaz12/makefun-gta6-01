// People: pedestrians strolling the sidewalks (and fleeing gunfire), police
// officers on foot, and the armed crews of the later missions. Everyone is a
// simple low-poly figure; movement is waypoint walking with building avoidance.
import * as THREE from 'three';
import { PED_NAMES, COP_NAMES } from './config.js';
import { angleDiff, clamp, pick, range } from './random.js';

const SKINS = [0xe8b88a, 0xc98d5f, 0x8a5a3a, 0xf0c8a0, 0x6a4a30];
const SHIRTS = [0xd82a2a, 0x2a6fd8, 0x2a8a4a, 0xf2c230, 0x8a2ad8, 0xe8e8e8, 0x20b8a0, 0xe07820];

function makeFigure(shirt, skin, isCop) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const pantsMat = new THREE.MeshLambertMaterial({ color: isCop ? 0x1a2a44 : 0x2a3040 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.36), shirtMat);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat);
  head.position.y = 1.72;
  g.add(head);
  if (isCop) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), new THREE.MeshLambertMaterial({ color: 0x1a2a44 }));
    cap.position.y = 1.96;
    g.add(cap);
  } else {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.44), new THREE.MeshLambertMaterial({ color: 0x2a2018 }));
    hair.position.y = 1.95;
    g.add(hair);
  }
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.26), pantsMat);
  legL.position.set(-0.16, 0.31, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.2), shirtMat);
  armL.position.set(-0.4, 1.05, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.4;
  g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export function createPerson(scene, random, x, z, opts = {}) {
  const isCop = !!opts.cop;
  const isEnemy = !!opts.enemy;
  const mesh = makeFigure(isCop ? 0x1a2a44 : isEnemy ? 0x3a3a3a : pick(random, SHIRTS), pick(random, SKINS), isCop);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const person = {
    mesh, x, z, yaw: range(random, 0, Math.PI * 2),
    name: isCop ? pick(random, COP_NAMES) : isEnemy ? 'Harbor Crew' : pick(random, PED_NAMES),
    hp: isEnemy ? 80 : isCop ? 70 : 40,
    speed: isCop ? 5.2 : isEnemy ? 3.6 : range(random, 1.2, 2.2),
    alive: true, cop: isCop, enemy: isEnemy,
    walkPhase: random() * 6,
    target: null, flee: 0, shootTimer: range(random, 0.4, 1),
    waypoint: { x, z },
  };
  newWaypoint(person, random);
  return person;
}

function newWaypoint(person, random) {
  const r = [-180, -120, -60, 0, 60, 120, 180][Math.floor(random() * 7)];
  const along = range(random, -235, 235);
  if (random() < 0.5) person.waypoint = { x: r + 9, z: along };
  else person.waypoint = { x: along, z: r + 9 };
}

export function updatePedestrian(p, dt, random, city, playerPos, gunfire) {
  if (!p.alive) return;
  if (gunfire && Math.hypot(p.x - playerPos.x, p.z - playerPos.z) < 26) p.flee = 3;
  if (p.flee > 0) {
    p.flee -= dt;
    const dx = p.x - playerPos.x;
    const dz = p.z - playerPos.z;
    const d = Math.hypot(dx, dz) || 1;
    p.yaw = Math.atan2(dx / d, dz / d);
    stepPerson(p, dt, city, p.speed * 2.2);
    return;
  }
  const dx = p.waypoint.x - p.x;
  const dz = p.waypoint.z - p.z;
  if (Math.hypot(dx, dz) < 2) { newWaypoint(p, random); return; }
  const want = Math.atan2(dx, dz);
  p.yaw += clamp(angleDiff(p.yaw, want), -2.4 * dt, 2.4 * dt);
  stepPerson(p, dt, city, p.speed);
}

function stepPerson(p, dt, city, speed) {
  const nx = p.x + Math.sin(p.yaw) * speed * dt;
  const nz = p.z + Math.cos(p.yaw) * speed * dt;
  if (!city.hitsBuilding(nx, nz, 0.7)) { p.x = nx; p.z = nz; }
  const c = city.clamp(p.x, p.z);
  p.x = c.x;
  p.z = c.z;
  p.walkPhase += dt * speed * 3.4;
  const swing = Math.sin(p.walkPhase) * 0.45;
  p.mesh.userData.legL.rotation.x = swing;
  p.mesh.userData.legR.rotation.x = -swing;
  p.mesh.userData.armL.rotation.x = -swing * 0.7;
  p.mesh.userData.armR.rotation.x = swing * 0.7;
  p.mesh.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * 0.05, p.z);
  p.mesh.rotation.y = p.yaw;
}

export function killPerson(p, scene) {
  p.alive = false;
  p.mesh.rotation.x = -Math.PI / 2;
  p.mesh.position.y = 0.25;
}

export function spawnPedestrians(scene, random, city, count) {
  const people = [];
  for (let i = 0; i < count; i += 1) {
    const road = [-180, -120, -60, 0, 60, 120, 180][Math.floor(random() * 7)];
    const along = range(random, -235, 235);
    const x = random() < 0.5 ? road + 9 : along;
    const z = random() < 0.5 ? along : road + 9;
    people.push(createPerson(scene, random, x, z, {}));
  }
  return people;
}
