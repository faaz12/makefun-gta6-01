// Rico's Garage: drive any car into the marked bay by the marina and press E
// to store it. Stored cars park in the bays along the west avenue, stay in the
// save file, and can be taken out again by stealing them back. Four bays max.
import * as THREE from 'three';

export const GARAGE = { x: -236, z: 200, radius: 10, label: "Rico's Garage" };
export const GARAGE_BAYS = [
  { x: -246, z: 178 }, { x: -246, z: 188 }, { x: -246, z: 198 }, { x: -246, z: 208 },
];

function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#1a2a44';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#ffd23e';
  g.font = 'bold 28px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createGarage(scene) {
  // Painted bay on the road edge, where the car must stop.
  const bay = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 13),
    new THREE.MeshLambertMaterial({ color: 0x2a6fd8, transparent: true, opacity: 0.5 }),
  );
  bay.rotation.x = -Math.PI / 2;
  bay.position.set(GARAGE.x, 0.05, GARAGE.z);
  scene.add(bay);
  // Sign board facing the avenue so drivers see it coming.
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 1.0, 0.12),
    new THREE.MeshBasicMaterial({ map: signTexture("RICO'S GARAGE") }),
  );
  sign.position.set(-228, 3.0, 200);
  sign.rotation.y = -Math.PI / 2;
  scene.add(sign);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 3.0, 6),
    new THREE.MeshLambertMaterial({ color: 0x2a2a30 }),
  );
  pole.position.set(-228, 1.5, 200);
  scene.add(pole);
  return { ...GARAGE, bays: GARAGE_BAYS.map((b) => ({ ...b, car: null })) };
}

/** True when (x, z) is inside the garage bay. */
export function inGarageZone(garage, x, z) {
  return Math.hypot(garage.x - x, garage.z - z) < garage.radius;
}

/** First free bay, or null when the garage is full. */
export function freeBay(garage) {
  return garage.bays.find((b) => !b.car) || null;
}

/** Cars currently stored, in bay order. */
export function storedCars(garage) {
  return garage.bays.filter((b) => b.car).map((b) => b.car);
}
