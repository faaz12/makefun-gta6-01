// Shops: two street stalls where Deke spends cash — Bay Arms sells body
// armor, Sunset Snacks sells a full meal (health). Walk up on foot, press E,
// pay the price. Each shop is a small stall with a painted sign, and shows
// as a dot on the minimap.
import * as THREE from 'three';

export const SHOPS = [
  { id: 'bay-arms', name: 'Bay Arms', item: 'Body Armor', price: 150, x: -170.5, z: 60, color: 0x2a6fd8, label: 'BAY ARMS' },
  { id: 'sunset-snacks', name: 'Sunset Snacks', item: 'Full Meal', price: 100, x: 129.5, z: -120, color: 0xe07820, label: 'SUNSET SNACKS' },
];

function signTexture(text, bgHex) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = `#${bgHex.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#ffffff';
  g.font = 'bold 34px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Build both stalls; each returned shop carries its def fields + mesh. */
export function createShops(scene) {
  return SHOPS.map((def) => {
    const group = new THREE.Group();
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.1, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x8a7a5a }),
    );
    counter.position.y = 0.55;
    group.add(counter);
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.12, 2.4),
      new THREE.MeshLambertMaterial({ color: def.color }),
    );
    awning.position.set(0, 2.35, 0);
    awning.rotation.x = 0.22;
    group.add(awning);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.9, 0.1),
      new THREE.MeshBasicMaterial({ map: signTexture(def.label, def.color) }),
    );
    sign.position.set(0, 3.05, 0);
    group.add(sign);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
    for (const x of [-1.7, 1.7]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), poleMat);
      pole.position.set(x, 1.2, 0.9);
      group.add(pole);
    }
    // Stalls stand on the sidewalk facing downtown (east), where Deke walks.
    group.rotation.y = Math.PI / 2;
    group.position.set(def.x, 0, def.z);
    scene.add(group);
    return { ...def, mesh: group };
  });
}

/** Nearest shop within maxDist of (x, z), or null. */
export function nearestShop(shops, x, z, maxDist = 5) {
  let best = null;
  let bestD = maxDist;
  for (const s of shops) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}
