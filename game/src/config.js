// Every tuning number for Solmar Bay in one place. The city is a 9x9 block grid
// centred on (0,0); roads run on the grid lines, buildings fill the blocks, and the
// beach + ocean sit along the west edge (negative x). Units are metres, speeds m/s.

export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar-bay.save.v1';

// City layout: blocks of BLOCK metres, roads ROAD wide, N blocks each way.
export const CITY = { blocks: 4, block: 46, road: 14, half: 4 * 46 + 5 * 14 };
export const ROAD_Y = 0;

export const PLAYER = {
  walkSpeed: 6.5, sprintSpeed: 10.5, accel: 42, friction: 30,
  radius: 0.55, height: 1.8, health: 100,
};

export const CAR = {
  accel: 22, brake: 34, reverseAccel: 12, maxSpeed: 42, maxReverse: 10,
  steer: 1.9, grip: 6.5, length: 4.4, width: 2.0,
};

// Traffic cars drive these loop routes around the blocks (x/z waypoints).
export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 26;
export const POLICE_MAX = 6;

export const WANTED = {
  stealCar: 1, shootPed: 2, killCop: 2, max: 5,
  decayDelay: 14, decayStep: 8, copRamDamage: 6,
};

export const COMBAT = {
  pistolMag: 12, pistolDamage: 34, pistolRange: 90, fireInterval: 0.22,
  enemyDamage: 9, enemyRange: 42, enemyInterval: 0.9,
  ammoReserve: 48, ammoPack: 24, ammoPrice: 60,
};

// Safehouse upgrades, bought with mission cash (keys 1–4 at the safehouse).
export const UPGRADES = [
  { id: 'extMag', name: 'Extended Mag', desc: '+6 pistol mag size', price: 800 },
  { id: 'fastHands', name: 'Fast Hands', desc: 'reload 30% faster', price: 500 },
  { id: 'armorPlate', name: 'Armor Plating', desc: 'start with 25 armor', price: 600 },
  { id: 'engineTune', name: 'Engine Tune', desc: '+10% top speed, every car', price: 900 },
];

export const PALETTE = {
  sky: 0x87c5e8, sun: 0xfff2cf, fog: 0x9fc8e0,
  asphalt: 0x3a3f46, sidewalk: 0xb8b0a0, sand: 0xe8d29a, ocean: 0x1e7fa8,
  grass: 0x7fae5a, building: [0xe8d8b8, 0xd8c8a8, 0xc8b8d8, 0xf0e0c8, 0xb8d0e0, 0xe0b8a0],
  police: 0x1a2a44, taxi: 0xf2c230,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Original vehicle models: name, top speed factor, colour, body style, and
// handling — accel/steer/grip factors make every car drive differently: the
// Sunset Coupe is sharp and loose, the Harbor Van is slow but planted, the
// Dune Buggy steers fast and slides.
export const CAR_MODELS = [
  { name: 'Comet GT', top: 1.15, color: 0xd82a2a, style: 'sport', accel: 1.15, steer: 1.0, grip: 1.0 },
  { name: 'Marlin Sedan', top: 0.9, color: 0x3a6fd8, style: 'sedan', accel: 0.9, steer: 0.95, grip: 1.05 },
  { name: 'Palm Taxi', top: 0.85, color: 0xf2c230, style: 'taxi', accel: 0.85, steer: 0.9, grip: 1.05 },
  { name: 'Dune Buggy', top: 0.95, color: 0xe07820, style: 'buggy', accel: 1.0, steer: 1.25, grip: 0.85 },
  { name: 'Harbor Van', top: 0.75, color: 0xe8e8e8, style: 'van', accel: 0.7, steer: 0.8, grip: 1.1 },
  { name: 'Sunset Coupe', top: 1.05, color: 0x8a2ad8, style: 'sport', accel: 1.12, steer: 1.3, grip: 0.9 },
  { name: 'Bay Pickup', top: 0.9, color: 0x2a8a4a, style: 'pickup', accel: 0.95, steer: 0.9, grip: 1.05 },
];

export const PED_NAMES = ['Mara', 'Tomas', 'Lena', 'Kip', 'Sofia', 'Bruno', 'Ana', 'Felix', 'Nina', 'Omar', 'Pia', 'Rudi'];
export const COP_NAMES = ['Officer Hale', 'Officer Brooks', 'Officer Vega', 'Officer Dunn', 'Officer Marsh', 'Officer Cole'];
