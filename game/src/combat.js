// Combat: the player's pistol (hitscan raycast against people and cars),
// enemy return fire, tracers, muzzle flash and hit sparks. No hitscan math
// lives in the game loop — it all happens here against the scene's raycaster.
import * as THREE from 'three';
import { COMBAT } from './config.js';

export function createCombat(scene) {
  const raycaster = new THREE.Raycaster();
  const tracers = [];
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  const tracerGeo = new THREE.BoxGeometry(0.06, 0.06, 1);
  const sparks = [];
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc23e });
  const sparkGeo = new THREE.SphereGeometry(0.09, 6, 5);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0 }));
  scene.add(muzzle);

  function addTracer(from, to) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    mesh.position.copy(mid);
    mesh.lookAt(to);
    const len = from.distanceTo(to);
    mesh.scale.set(1, 1, Math.max(0.5, len));
    mesh.userData.life = 0.09;
    scene.add(mesh);
    tracers.push(mesh);
  }
  function addSparks(at, n = 6) {
    for (let i = 0; i < n; i += 1) {
      const s = new THREE.Mesh(sparkGeo, sparkMat);
      s.position.copy(at);
      s.userData = {
        life: 0.3 + Math.random() * 0.2,
        vx: (Math.random() - 0.5) * 8, vy: Math.random() * 6, vz: (Math.random() - 0.5) * 8,
      };
      scene.add(s);
      sparks.push(s);
    }
  }

  function update(dt) {
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      tracers[i].userData.life -= dt;
      if (tracers[i].userData.life <= 0) {
        scene.remove(tracers[i]);
        tracers.splice(i, 1);
      }
    }
    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const s = sparks[i];
      s.userData.life -= dt;
      if (s.userData.life <= 0) {
        scene.remove(s);
        sparks.splice(i, 1);
        continue;
      }
      s.position.x += s.userData.vx * dt;
      s.position.y += s.userData.vy * dt;
      s.position.z += s.userData.vz * dt;
      s.userData.vy -= 18 * dt;
      if (s.position.y < 0.05) s.position.y = 0.05;
    }
    muzzle.material.opacity = Math.max(0, muzzle.material.opacity - dt * 14);
  }

  /**
   * Fire from `origin` along `dir`. `targets` are people/cars with meshes.
   * Returns { hit, point, victim } — victim is the person/car hit, if any.
   */
  function shoot(origin, dir, targets, range = COMBAT.pistolRange) {
    raycaster.set(origin, dir);
    raycaster.far = range;
    // Shots can fire before the first render (staged screenshots step the
    // simulation synchronously), when meshes still hold identity matrices —
    // refresh world matrices so the ray tests where things really are.
    scene.updateMatrixWorld(true);
    const meshes = [];
    const owners = new Map();
    for (const t of targets) {
      if (!t.alive) continue;
      t.mesh.traverse((o) => { if (o.isMesh) { meshes.push(o); owners.set(o, t); } });
    }
    const hits = raycaster.intersectObjects(meshes, false);
    const end = origin.clone().add(dir.clone().multiplyScalar(range));
    muzzle.position.copy(origin).add(dir.clone().multiplyScalar(1.2));
    muzzle.material.opacity = 1;
    if (hits.length) {
      const point = hits[0].point;
      addTracer(origin, point);
      addSparks(point, 7);
      return { hit: true, point, victim: owners.get(hits[0].object) || null };
    }
    addTracer(origin, end);
    return { hit: false, point: end, victim: null };
  }

  return { update, shoot, addSparks, addTracer, muzzle };
}
