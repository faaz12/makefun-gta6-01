// The PD helicopter: at four stars and above, Air One comes over the city and
// keeps its spotlight on Deke — while it watches, the wanted level never cools
// down on its own. A simple mesh (body, tail, spinning rotors, light cone)
// that follows the player from above and shows on the minimap.
import * as THREE from 'three';

export const HELI_MIN_WANTED = 4;

export function createHelicopter(scene) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a2a44 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 4.6), bodyMat);
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.0, 2.0),
    new THREE.MeshLambertMaterial({ color: 0x9fd8ff }),
  );
  cabin.position.set(0, 0.2, 1.4);
  group.add(cabin);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.2), bodyMat);
  tail.position.set(0, 0.3, -4.0);
  group.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 1.0), bodyMat);
  fin.position.set(0, 0.9, -5.8);
  group.add(fin);
  // Main rotor (spins) + skids.
  const rotor = new THREE.Group();
  const bladeGeo = new THREE.BoxGeometry(9.5, 0.08, 0.5);
  const bladeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const b1 = new THREE.Mesh(bladeGeo, bladeMat);
  rotor.add(b1);
  const b2 = new THREE.Mesh(bladeGeo, bladeMat);
  b2.rotation.y = Math.PI / 2;
  rotor.add(b2);
  rotor.position.y = 1.1;
  group.add(rotor);
  const skidMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  for (const x of [-1.1, 1.1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 4.0), skidMat);
    skid.position.set(x, -0.95, 0);
    group.add(skid);
  }
  // Spotlight cone: tip at the helicopter, wide end on the street below.
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(7, 42, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
  );
  cone.position.y = -21;
  group.add(cone);
  group.visible = false;
  scene.add(group);
  return { mesh: group, rotor, cone, active: false, x: 0, z: 0, y: 44, mode: 'watch', lastSeen: { x: 0, z: 0 }, searchAngle: 0 };
}

/** Park the helicopter out of sight (busted, wasted, quit to title). */
export function hideHelicopter(heli) {
  heli.active = false;
  heli.mode = 'watch';
  heli.mesh.visible = false;
}

/**
 * Spawn at 4+ stars, despawn below, and chase the player from above while
 * active. Two modes: WATCH — the spotlight is locked on Deke (within 90 m),
 * so the heat never cools; SEARCH — Deke broke line of sight, so Air One
 * flies back to the last seen position and circles it, sweeping its
 * spotlight, while the heat CAN cool. Returns 'arrived' on spawn, 'lost'
 * when visual is lost, 'found' when visual is regained, false otherwise.
 */
export function updateHelicopter(heli, dt, time, px, pz, wanted) {
  if (wanted >= HELI_MIN_WANTED && !heli.active) {
    heli.active = true;
    heli.mode = 'watch';
    heli.mesh.visible = true;
    heli.x = px + 30;
    heli.z = pz - 30;
    heli.y = 46;
    heli.lastSeen = { x: px, z: pz };
    heli.cone.material.opacity = 0.13;
    heli.cone.position.x = 0;
    return 'arrived';
  }
  if (wanted < HELI_MIN_WANTED && heli.active) {
    hideHelicopter(heli);
    return false;
  }
  if (!heli.active) return false;
  const dx = px - heli.x;
  const dz = pz - heli.z;
  const d = Math.hypot(dx, dz) || 1;
  // Face where it flies: the player while watching, its search path while searching.
  let faceX = dx;
  let faceZ = dz;
  if (d < 90) {
    // WATCH: locked on, spotlight on the player, heat frozen.
    if (heli.mode === 'search') {
      heli.mode = 'watch';
      heli.cone.material.opacity = 0.13;
      heli.cone.position.x = 0;
      heli.lastSeen = { x: px, z: pz };
      return 'found';
    }
    heli.lastSeen = { x: px, z: pz };
    const step = Math.min(d, 20 * dt);
    heli.x += (dx / d) * step;
    heli.z += (dz / d) * step;
  } else {
    // SEARCH: lost visual — return to the last seen spot and circle it.
    if (heli.mode === 'watch') {
      heli.mode = 'search';
      heli.searchAngle = 0;
      heli.cone.material.opacity = 0.07;
      return 'lost';
    }
    const ldx = heli.lastSeen.x - heli.x;
    const ldz = heli.lastSeen.z - heli.z;
    const ld = Math.hypot(ldx, ldz);
    if (ld > 26) {
      const step = Math.min(ld, 20 * dt);
      heli.x += (ldx / ld) * step;
      heli.z += (ldz / ld) * step;
      faceX = ldx;
      faceZ = ldz;
    } else {
      heli.searchAngle += dt * 0.55;
      heli.x = heli.lastSeen.x + Math.cos(heli.searchAngle) * 25;
      heli.z = heli.lastSeen.z + Math.sin(heli.searchAngle) * 25;
      faceX = -Math.sin(heli.searchAngle);
      faceZ = Math.cos(heli.searchAngle);
    }
    // Spotlight sweeps the ground while searching.
    heli.cone.position.x = Math.sin(time * 1.4) * 5;
  }
  heli.y = 44 + Math.sin(time * 0.9) * 2;
  heli.mesh.position.set(heli.x, heli.y, heli.z);
  heli.mesh.rotation.y = Math.atan2(faceX, faceZ);
  heli.rotor.rotation.y += dt * 22;
  return false;
}
