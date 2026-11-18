// The story: ten jobs for Danny "Deke" Marlowe, each with an objective, a
// target point, dialogue, a cash reward and a completion rule. The mission
// manager tracks the active job, moves the beacon, and reports progress.

export const MISSIONS = [
  {
    id: 'meet-rico', title: 'Job 1 — Meet Rico',
    brief: 'Rico Vane is waiting at the marina. Walk over and say hello — no guns, no heat.',
    dialog: '<b>RICO:</b> "Deke! You made it. Solmar Bay eats slow drivers, kid. First job\'s easy — go look at a car for me."',
    target: { x: -225, z: 225, label: "Rico's Marina" },
    reward: 150, needCar: false, kind: 'goto',
  },
  {
    id: 'lift-comet', title: 'Job 2 — Lift the Comet GT',
    brief: 'A red Comet GT is parked outside the Solmar Hotel. Steal it and bring it to Rico\'s garage. The cops will notice.',
    dialog: '<b>RICO:</b> "That Comet GT by the hotel? It\'s mine now. Take it — and if the PD shows up, drive like you mean it."',
    target: { x: -225, z: -225, label: 'Solmar Hotel' },
    reward: 600, needCar: true, kind: 'steal',
    deliver: { x: -200, z: 200, label: "Rico's Garage" },
    mid: '<b>RICO:</b> "Beautiful. Now bring her home — garage on the west side."',
  },
  {
    id: 'lose-tail', title: 'Job 3 — Lose the Tail',
    brief: 'The PD is on you — three stars. Break line of sight and stay hidden until the heat dies down.',
    dialog: '<b>RICO:</b> "Three stars already? Lose them, Deke. Duck down a side street and sit quiet till the radios go cold."',
    target: null, reward: 500, needCar: false, kind: 'escape',
  },
  {
    id: 'run-package', title: 'Job 4 — Run the Package',
    brief: 'Pick up the package at the boardwalk and deliver it to the Harbor Bank steps — fast, before the buyer walks.',
    dialog: '<b>RICO:</b> "Package on the boardwalk, buyer at Harbor Bank. No stops, no cops, no excuses. Go."',
    target: { x: -255, z: 40, label: 'Boardwalk pickup' },
    reward: 800, needCar: false, kind: 'deliver',
    deliver: { x: 225, z: 225, label: 'Harbor Bank' },
    mid: '<b>RICO:</b> "Package in hand. Harbor Bank steps, Deke — the buyer\'s waiting, don\'t keep him."',
  },
  {
    id: 'bank-job', title: 'Job 5 — The Harbor Bank Job',
    brief: 'The vault crew is inside Harbor Bank. Fight through the Harbor Crew, grab the vault cash and get out.',
    dialog: '<b>RICO:</b> "Last one, Deke. The Harbor Crew guards the vault — take them down, grab the cash, and you\'re a free man."',
    target: { x: 225, z: 225, label: 'Harbor Bank vault' },
    reward: 2500, needCar: false, kind: 'shootout',
    fightAt: { x: 225, z: 225 }, foes: 4,
    mid: '<b>RICO:</b> "There they are — the Harbor Crew. Take them all down!"',
  },
  {
    id: 'diner-meet', title: 'Job 6 — The Diner Meet',
    brief: 'Lena is waiting at the Sunset Diner downtown. She has work that pays better than Rico\'s.',
    dialog: '<b>LENA:</b> "Deke. Rico\'s jobs pay peanuts — I\'ve got real work. First, prove you can show up on time."',
    target: { x: 120, z: 60, label: 'Sunset Diner' },
    reward: 400, needCar: false, kind: 'goto',
  },
  {
    id: 'dock-run', title: 'Job 7 — The Dock Run',
    brief: 'Pick up the crate at the South Docks and deliver it to the Bayview Apartments — quick and quiet, no cops, no questions.',
    dialog: '<b>LENA:</b> "Crate\'s on the South Docks, buyer\'s at Bayview. Quick and quiet, Deke."',
    target: { x: -255, z: -120, label: 'South Docks pickup' },
    reward: 900, needCar: false, kind: 'deliver',
    deliver: { x: 180, z: 180, label: 'Bayview Apartments' },
    mid: '<b>LENA:</b> "Crate\'s yours. Bayview Apartments — and keep it under the speed limit this time."',
  },
  {
    id: 'downtown-heat', title: 'Job 8 — Downtown Heat',
    brief: 'Four stars downtown — the PD even sent the helicopter. Break line of sight and stay hidden until the radios go cold.',
    dialog: '<b>DISPATCH:</b> "Air One is over downtown. All units converge — four stars, do not let him slip."',
    target: null, reward: 700, needCar: false, kind: 'escape', stars: 4,
  },
  {
    id: 'lift-coupe', title: 'Job 9 — Lift the Sunset Coupe',
    brief: 'A purple Sunset Coupe is parked downtown. Steal it and bring it to Rico\'s Garage — Lena already has a buyer.',
    dialog: '<b>LENA:</b> "Purple Sunset Coupe, downtown. It\'s got a buyer already — bring it to Rico\'s Garage in one piece."',
    target: { x: 120, z: -180, label: 'Sunset Coupe downtown' },
    reward: 1200, needCar: true, kind: 'steal', steal: 'coupe',
    deliver: { x: -200, z: 200, label: "Rico's Garage" },
    mid: '<b>LENA:</b> "She\'s yours — but the PD just lit up. Shake them, then bring her to the garage in one piece."',
  },
  {
    id: 'marina-showdown', title: 'Job 10 — The Marina Showdown',
    brief: 'The Harbor Crew came back for revenge at the marina. Take them all down and Solmar Bay is yours.',
    dialog: '<b>RICO:</b> "They\'re at the marina, Deke — the whole crew. Finish this, and nobody in this town ever leans on us again."',
    target: { x: -225, z: 225, label: 'Marina showdown' },
    reward: 3500, needCar: false, kind: 'shootout',
    fightAt: { x: -225, z: 225 }, foes: 6, layout: 'marina',
    mid: '<b>RICO:</b> "The whole crew came back for this. Hold the marina, Deke — finish it."',
  },
];

export function createMissionManager() {
  let index = 0;
  let stage = 'go'; // go | deliver | escape | fight | done
  let pickedUp = false;
  let escapeTimer = 0;
  let enemiesLeft = 0;

  function current() {
    return MISSIONS[Math.min(index, MISSIONS.length - 1)];
  }
  function isFinished() {
    return index >= MISSIONS.length;
  }
  function target() {
    const m = current();
    if (isFinished()) return null;
    if (m.kind === 'steal' && stage === 'deliver') return m.deliver;
    if (m.kind === 'deliver' && pickedUp) return m.deliver;
    if (m.kind === 'escape') return null;
    return m.target;
  }
  function objectiveText() {
    if (isFinished()) return '🏆 Story complete — Solmar Bay is yours, Deke. Free roam!';
    const m = current();
    if (m.kind === 'steal' && stage === 'deliver') return `${m.title}: deliver the Comet GT to ${m.deliver.label}`;
    if (m.kind === 'deliver' && pickedUp) return `${m.title}: deliver the package to ${m.deliver.label}`;
    if (m.kind === 'deliver') return `${m.title}: pick up the package at ${m.target.label}`;
    if (m.kind === 'escape') return `${m.title}: stay out of sight until the heat dies (${Math.ceil(escapeTimer)}s)`;
    if (m.kind === 'shootout' && stage === 'fight') return `${m.title}: take down the Harbor Crew (${enemiesLeft} left)`;
    return `${m.title}: ${m.brief}`;
  }
  function advance() {
    const m = current();
    index += 1;
    stage = 'go';
    pickedUp = false;
    escapeTimer = 0;
    return m;
  }
  return {
    current, isFinished, target, objectiveText, advance,
    get index() { return index; },
    get stage() { return stage; },
    set stage(v) { stage = v; },
    get pickedUp() { return pickedUp; },
    set pickedUp(v) { pickedUp = v; },
    get escapeTimer() { return escapeTimer; },
    set escapeTimer(v) { escapeTimer = v; },
    get enemiesLeft() { return enemiesLeft; },
    set enemiesLeft(v) { enemiesLeft = v; },
    startAt(i) {
      index = Math.max(0, Math.min(i, MISSIONS.length - 1));
      stage = 'go';
      pickedUp = false;
      escapeTimer = 0;
    },
    /** Next mission's intro dialog (or the finale line). */
    intro() {
      if (isFinished()) return '<b>RICO:</b> "That\'s the whole board, Deke. Solmar Bay is yours now."';
      return current().dialog;
    },
  };
}
