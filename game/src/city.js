// Solmar Bay itself: a sun-soaked coastal city built from one seeded layout —
// roads on a grid, procedural building facades, palms, beach and ocean, plus the
// landmarks the story uses (Rico's Marina, Harbor Bank, Solmar Hotel, PD HQ).
// Exports the scene, building colliders (AABBs), traffic loops and landmarks.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { pick, range } from './random.js';

const PITCH = CITY.block + CITY.road; // 60 m between road centres
const ROAD_AT = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((k) => k * PITCH);

function facadeTexture(color, floors, lit) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 0, 128, 10);
  for (let f = 0; f < floors; f += 1) {
    for (let w = 0; w < 4; w += 1) {
      const x = 12 + w * 28;
      const y = 22 + f * Math.floor(220 / floors);
      g.fillStyle = lit && (f * 4 + w) % 5 === 0 ? '#ffe9a0' : '#2a3a4a';
      g.fillRect(x, y, 18, 14);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x, y, 18, 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCarMesh(THREE, model, color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a2530 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55;
  group.add(body);
  const cabinH = model.style === 'van' ? 0.95 : 0.55;
  const cabinL = model.style === 'van' ? 3.4 : model.style === 'pickup' ? 1.6 : 2.2;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, cabinH, cabinL), model.style === 'pickup' ? paint : dark);
  cabin.position.set(0, 0.55 + 0.31 + cabinH / 2 - 0.08, model.style === 'pickup' ? -0.9 : model.style === 'van' ? 0 : -0.2);
  group.add(cabin);
  if (model.style === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    sign.position.set(0, 1.45, -0.2);
    group.add(sign);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.36, z);
    group.add(wheel);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.08), lightMat);
    lamp.position.set(x, 0.6, 2.22);
    group.add(lamp);
  }
  group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return group;
}

export function buildCity(random) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 180, 620);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.9);
  sun.position.set(120, 180, 60);
  scene.add(sun);

  const colliders = [];
  const palms = [];
  const animated = { ocean: null, beacon: null };

  // Ground: one big grass/sand slab, then road strips + sidewalks on top.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshLambertMaterial({ color: 0x9aa06a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 620),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(-CITY.half - 32, 0, 0);
  scene.add(beach);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 760),
    new THREE.MeshLambertMaterial({ color: PALETTE.ocean }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(-CITY.half - 195, -0.4, 0);
  scene.add(ocean);
  animated.ocean = ocean;

  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  for (const r of ROAD_AT) {
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(CITY.road, CITY.half * 2 + CITY.road), roadMat);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(r, 0.01, 0);
    scene.add(ns);
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(CITY.half * 2 + CITY.road, CITY.road), roadMat);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.01, r);
    scene.add(ew);
    // Centre dashes.
    for (let d = -CITY.half; d < CITY.half; d += 12) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), new THREE.MeshBasicMaterial({ color: 0xf2e8a0 }));
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(r, 0.03, d);
      scene.add(dash);
      const dash2 = dash.clone();
      dash2.rotation.z = Math.PI / 2;
      dash2.position.set(d, 0.03, r);
      scene.add(dash2);
    }
  }

  // Buildings: one or four per block, taller toward the middle (downtown).
  const facadeMats = PALETTE.building.map((hex) => {
    const css = `#${hex.toString(16).padStart(6, '0')}`;
    return new THREE.MeshLambertMaterial({ map: facadeTexture(css, 6, true) });
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6a6a72 });
  const landmarks = {};
  const blocks = [];
  for (let bx = -4; bx < 4; bx += 1) {
    for (let bz = -4; bz < 4; bz += 1) {
      const cx = bx * PITCH + PITCH / 2;
      const cz = bz * PITCH + PITCH / 2;
      blocks.push({ cx, cz, bx, bz });
    }
  }
  function addBuilding(x, z, w, d, h, matIndex, name) {
    const mat = facadeMats[matIndex % facadeMats.length];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2, z);
    scene.add(mesh);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), roofMat);
    roof.position.set(x, h + 0.25, z);
    scene.add(roof);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    if (name) landmarks[name] = { x, z, w, d, h };
    return mesh;
  }
  for (const b of blocks) {
    const dist = Math.hypot(b.cx, b.cz);
    const downtown = dist < 95;
    const tall = downtown ? range(random, 26, 52) : range(random, 9, 26);
    const matIndex = Math.floor(random() * facadeMats.length);
    if (random() < 0.45) {
      addBuilding(b.cx, b.cz, range(random, 26, 34), range(random, 26, 34), tall, matIndex);
    } else {
      const off = 9;
      for (const [dx, dz] of [[-off, -off], [off, -off], [-off, off], [off, off]]) {
        addBuilding(b.cx + dx, b.cz + dz, range(random, 13, 17), range(random, 13, 17), range(random, 8, tall * 0.7), matIndex);
      }
    }
  }
  // Landmark towers (replace nothing — they stand on their own blocks' corners).
  addBuilding(-225, -225, 34, 20, 46, 2, 'hotel').material = facadeMats[4];
  addBuilding(225, 225, 30, 30, 38, 0, 'bank');
  addBuilding(225, -225, 26, 26, 22, 1, 'policeHQ');
  addBuilding(-225, 225, 30, 16, 14, 5, 'marina');

  // Painted name signs on the landmark fronts, so the story places read
  // as places instead of anonymous towers.
  function labelTexture(text, bgHex) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = `#${bgHex.toString(16).padStart(6, '0')}`;
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#ffffff';
    g.font = 'bold 30px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function addSign(text, x, y, z, w, bgHex) {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(w, w / 4, 0.12),
      new THREE.MeshBasicMaterial({ map: labelTexture(text, bgHex) }),
    );
    sign.position.set(x, y, z);
    scene.add(sign);
    return sign;
  }
  addSign('SOLMAR HOTEL', -225, 10, -214.8, 16, 0x8a2ad8);
  addSign('HARBOR BANK', 225, 9, 240.2, 14, 0x2a6fd8);
  addSign('PD HQ', 225, 8, -211.8, 10, 0x1a2a44);
  addSign('MARINA', -225, 7, 233.2, 12, 0x2a8a4a);

  // The Sunset Diner (Job 6): a roadside stall with a neon-style sign at
  // the downtown corner, so Lena's meeting spot is a visible place.
  const diner = new THREE.Group();
  const dinerCounter = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 1.1, 2.0),
    new THREE.MeshLambertMaterial({ color: 0x8a7a5a }),
  );
  dinerCounter.position.y = 0.55;
  diner.add(dinerCounter);
  const dinerAwning = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 0.12, 2.8),
    new THREE.MeshLambertMaterial({ color: 0xe07820 }),
  );
  dinerAwning.position.set(0, 2.4, 0);
  dinerAwning.rotation.x = 0.22;
  diner.add(dinerAwning);
  const dinerSign = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 1.0, 0.1),
    new THREE.MeshBasicMaterial({ map: labelTexture('SUNSET DINER', 0xe07820) }),
  );
  dinerSign.position.set(0, 3.1, 0);
  diner.add(dinerSign);
  diner.rotation.y = Math.PI / 2;
  diner.position.set(128, 0, 52);
  scene.add(diner);

  // Palms: beach row + scattered sidewalk palms.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
  function addPalm(x, z, s = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 5.4 * s, 7), trunkMat);
    trunk.position.y = 2.7 * s;
    trunk.rotation.z = 0.08;
    g.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9 * s, 3.2 * s, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.1 * s, 5.6 * s, Math.sin(a) * 1.1 * s);
      leaf.rotation.set(Math.sin(a) * 1.1, 0, Math.cos(a) * 1.1 + Math.PI);
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    palms.push(g);
    return g;
  }
  for (let z = -260; z <= 260; z += 26) addPalm(-CITY.half - 8, z, range(random, 0.9, 1.3));
  for (let i = 0; i < 26; i += 1) {
    const r = pick(random, ROAD_AT);
    addPalm(r + pick(random, [-11, 11]), range(random, -240, 240), range(random, 0.8, 1.1));
  }

  // Marina docks + boats on the west edge.
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  for (let i = 0; i < 3; i += 1) {
    const dock = new THREE.Mesh(new THREE.BoxGeometry(26, 0.5, 4), dockMat);
    dock.position.set(-CITY.half - 42, 0.4, -120 + i * 110);
    scene.add(dock);
    const boat = new THREE.Mesh(new THREE.BoxGeometry(7, 1.6, 3), new THREE.MeshLambertMaterial({ color: pick(random, [0xe8e8e8, 0x2a6fd8, 0xd82a2a]) }));
    boat.position.set(-CITY.half - 46, 0.9, -112 + i * 110);
    scene.add(boat);
  }
  // Two more boats moored off the docks, so the marina reads as a harbour.
  for (const bz of [-60, 160]) {
    const boat = new THREE.Mesh(new THREE.BoxGeometry(7, 1.6, 3), new THREE.MeshLambertMaterial({ color: pick(random, [0xe8e8e8, 0x2a6fd8, 0xd82a2a]) }));
    boat.position.set(-CITY.half - 52, 0.9, bz);
    scene.add(boat);
  }

  // Street lamps along the main avenues.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  for (const r of [-120, 0, 120]) {
    for (let d = -240; d <= 240; d += 60) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6, 6), poleMat);
      pole.position.set(r + 8, 3, d);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
      lamp.position.set(r + 8, 6.1, d);
      scene.add(lamp);
    }
  }

  // Mission beacon: a tall golden light pillar the player can always see.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 90, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.position.set(0, 45, 0);
  scene.add(beacon);
  animated.beacon = beacon;

  // Traffic loops: rectangles around block rings, driven on the right-hand lane.
  const loops = [];
  for (const ring of [1, 2, 3]) {
    const ext = ring * PITCH;
    const lane = 3.6;
    loops.push([
      { x: -ext + lane, z: -ext + lane }, { x: ext - lane, z: -ext + lane },
      { x: ext - lane, z: ext - lane }, { x: -ext + lane, z: ext - lane },
    ]);
    loops.push([
      { x: ext - lane, z: -ext + lane }, { x: ext - lane, z: ext - lane },
      { x: -ext + lane, z: ext - lane }, { x: -ext + lane, z: -ext + lane },
    ]);
  }
  // Avenue loops straight down the main roads.
  loops.push([{ x: -3.6, z: -240 }, { x: -3.6, z: 240 }, { x: 3.6, z: 240 }, { x: 3.6, z: -240 }]);
  loops.push([{ x: -123.6, z: -240 }, { x: -123.6, z: 240 }, { x: -116.4, z: 240 }, { x: -116.4, z: -240 }]);

  // Sun cycle: the in-game clock runs 09:00 onward, half a minute per
  // second of play — the light warms toward noon and cools again, so the
  // city reads differently as the story advances.
  const sunLow = new THREE.Color(0xffc98a);
  const sunHigh = new THREE.Color(0xfff2cf);
  const fogLow = new THREE.Color(0xe8c9a0);
  const fogHigh = new THREE.Color(0x9fc8e0);
  const skyLow = new THREE.Color(0xe8b98a);
  const skyHigh = new THREE.Color(0x87c5e8);
  const sunCol = new THREE.Color();
  const fogCol = new THREE.Color();
  const skyCol = new THREE.Color();

  function update(dt, time) {
    ocean.position.y = -0.4 + Math.sin(time * 0.5) * 0.12;
    beacon.material.opacity = 0.28 + Math.sin(time * 3) * 0.1;
    for (let i = 0; i < palms.length; i += 1) {
      palms[i].rotation.z = Math.sin(time * 0.8 + i) * 0.03;
    }
    // Day fraction: 1 at noon, 0 at 06:00/18:00 (the story starts 09:00).
    const hour = ((9 * 60 + time * 0.5) / 60) % 24;
    const elev = Math.max(0, Math.min(1, Math.sin(((hour - 6) / 12) * Math.PI)));
    sun.intensity = 1.5 + 0.6 * elev;
    sun.color.copy(sunCol.lerpColors(sunLow, sunHigh, elev));
    hemi.intensity = 0.85 + 0.35 * elev;
    scene.fog.color.copy(fogCol.lerpColors(fogLow, fogHigh, elev));
    scene.background.copy(skyCol.lerpColors(skyLow, skyHigh, elev));
  }

  return {
    scene, colliders, loops, landmarks, update,
    makeCarMesh: (model, color) => makeCarMesh(THREE, model, color),
    /** Clamp a position inside the drivable/walkable city. */
    clamp(x, z) {
      return { x: Math.max(-268, Math.min(268, x)), z: Math.max(-268, Math.min(268, z)) };
    },
    /** True when (x,z) is inside any building footprint (with margin). */
    hitsBuilding(x, z, margin = 0) {
      for (const c of colliders) {
        if (x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin) return c;
      }
      return null;
    },
  };
}
