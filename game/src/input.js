// Keyboard + mouse input. Held keys are read every frame; one-shot presses
// (enter car, shoot, reload, pause, mission, horn, camera) are queued as bit
// flags and taken once by the loop, so a press between frames is never lost.

export const ACT_ENTER = 1;
export const ACT_EXIT = 2;
export const ACT_SHOOT = 4;
export const ACT_RELOAD = 8;
export const ACT_PAUSE = 16;
export const ACT_MISSION = 32;
export const ACT_HORN = 64;
export const ACT_CAMERA = 128;
export const ACT_JUMP = 256;

const KEYS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'brake',
};

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, sprint: false, brake: false };
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let locked = false;

  window.addEventListener('keydown', (event) => {
    const name = KEYS[event.code];
    if (name) {
      held[name] = true;
      if (event.code === 'Space') event.preventDefault();
      return;
    }
    if (event.repeat) return;
    if (event.code === 'KeyE') actions |= ACT_ENTER;
    else if (event.code === 'KeyF') actions |= ACT_EXIT;
    else if (event.code === 'KeyR') actions |= ACT_RELOAD;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACT_PAUSE;
    else if (event.code === 'KeyM') actions |= ACT_MISSION;
    else if (event.code === 'KeyH') actions |= ACT_HORN;
    else if (event.code === 'KeyC') actions |= ACT_CAMERA;
    else if (event.code === 'Space') actions |= ACT_JUMP;
  });
  window.addEventListener('keyup', (event) => {
    const name = KEYS[event.code];
    if (name) held[name] = false;
  });
  window.addEventListener('blur', () => {
    for (const key of Object.keys(held)) held[key] = false;
    mouseDown = false;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      actions |= ACT_SHOOT;
      if (!locked && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (event) => {
    if (!locked) return;
    mouseDX += event.movementX || 0;
    mouseDY += event.movementY || 0;
  });

  return {
    held,
    get mouseDown() { return mouseDown; },
    takeMouse() {
      const dx = mouseDX;
      const dy = mouseDY;
      mouseDX = 0;
      mouseDY = 0;
      return { dx, dy };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Test/autopilot hook: pretend keys are held. */
    setHeld(name, value) { held[name] = value; },
    queue(action) { actions |= action; },
  };
}
