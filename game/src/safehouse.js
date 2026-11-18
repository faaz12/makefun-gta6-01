// Deke's safehouse: a little beach house on the sand west of town. Step into
// the green ring to patch up to full health, shake the heat (when no cop is
// close) and save the game. One job per file: this one owns the house, the
// ring and the "am I inside" check.
import * as THREE from 'three';

export const SAFEHOUSE = { x: -262, z: 60, radius: 6, label: "Deke's Beach House" };

export function createSafehouse(scene) {
  const group = new THREE.Group();
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3.2, 5),
    new THREE.MeshLambertMaterial({ color: 0xe8d8b8 }),
  );
  walls.position.y = 1.6;
  group.add(walls);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(4.6, 2.2, 4),
    new THREE.MeshLambertMaterial({ color: 0x2a8a4a }),
  );
  roof.position.y = 4.3;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.2, 0.15),
    new THREE.MeshLambertMaterial({ color: 0x3a6fd8 }),
  );
  door.position.set(0, 1.1, 2.55);
  group.add(door);
  // Glowing ring on the sand marks the trigger zone.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.4, 5.2, 32),
    new THREE.MeshBasicMaterial({ color: 0x7dff9b, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  group.add(ring);
  group.position.set(SAFEHOUSE.x, 0, SAFEHOUSE.z);
  scene.add(group);
  return { ...SAFEHOUSE, mesh: group, ring };
}

/** True when the player stands inside the safehouse ring. */
export function inSafehouse(safehouse, x, z) {
  return Math.hypot(safehouse.x - x, safehouse.z - z) < safehouse.radius;
}

/** The ring breathes so the player can spot the safehouse from the street. */
export function updateSafehouse(safehouse, time) {
  safehouse.ring.material.opacity = 0.5 + Math.sin(time * 2) * 0.2;
}
