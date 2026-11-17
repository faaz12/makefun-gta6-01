// Boot and the one loop: Solmar Bay runs on a fixed 1/60 s simulation step,
// rendered as fast as the display allows. ?shot=<scene>&seed=N stages a
// screenshot scene instead of the title screen and sets window.__shotReady.
import * as THREE from 'three';
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { buildCity } from './city.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createGame } from './game.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('scene');
const status = document.getElementById('status');
const random = createRandom(seed);
const city = buildCity(random);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => renderer.setSize(window.innerWidth, window.innerHeight));

const audio = createAudio();
const input = createInput(canvas);
const hud = createHud();
const game = createGame({ scene: city.scene, city, hud, audio, input, random });

function announce(message) { status.textContent = message; }

window.__game = game;
window.__state = game.stateSnapshot();

function runShot(name) {
  stageShot(name, game, city, hud, input);
  let painted = 0;
  function paint() {
    renderer.render(city.scene, game.camera);
    painted += 1;
    if (painted < 4) requestAnimationFrame(paint);
    else {
      window.__state = game.stateSnapshot();
      window.__shotReady = true;
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  let shownSave = false;

  document.getElementById('play').addEventListener('click', () => {
    audio.unlock();
    game.start('story', false);
    announce('Story started. Meet Rico at the marina.');
  });
  document.getElementById('continue').addEventListener('click', () => {
    audio.unlock();
    game.start('story', true);
    announce('Save loaded.');
  });
  document.getElementById('freeroam').addEventListener('click', () => {
    audio.unlock();
    game.start('free', false);
    announce('Free roam. Explore Solmar Bay.');
  });
  document.getElementById('resume').addEventListener('click', () => game.resume());
  document.getElementById('quitToTitle').addEventListener('click', () => game.quitToTitle());
  document.getElementById('retry').addEventListener('click', () => game.retry());
  document.getElementById('endTitleBtn').addEventListener('click', () => {
    game.quitToTitle();
    game.state.phase = 'title';
    hud.hideEnd();
    hud.showStart(game.hasSave());
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state.phase === 'play') game.pause();
  });

  hud.showStart(game.hasSave());
  announce('Solmar Bay. Press Start Story or Free Roam.');

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (accumulator >= STEP) {
      game.step(STEP);
      accumulator -= STEP;
    }
    if (game.state.phase !== 'title' || !shownSave) {
      renderer.render(city.scene, game.camera);
      shownSave = true;
    } else {
      renderer.render(city.scene, game.camera);
    }
    window.__state = game.stateSnapshot();
  }
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
