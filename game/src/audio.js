// All sound is synthesized with WebAudio — no audio files. A tiny chiptune loop
// (bass + plucked lead) plays as the in-car / street radio, plus one-shot effects:
// gunshot, siren wail, engine hum, pickup chime, crash thud, mission sting.
// The context is created lazily on the first user gesture; every call is guarded
// so a browser without audio never breaks the game.

const NOTES = [220, 261.63, 329.63, 392, 440, 523.25, 659.25];
const BASS = [110, 87.31, 98, 130.81];

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicTimer = null;
  let step = 0;
  let engineOsc = null;
  let engineGain = null;
  let sirenOn = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ensure()) return;
    try {
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch { /* audio is decoration */ }
  }

  function noise(dur, vol, lowpass = 1200) {
    if (!ensure()) return;
    try {
      const t0 = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
    } catch { /* ignore */ }
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    gunshot() { noise(0.14, 0.5, 2800); tone(160, 0.1, 'square', 0.18, 0, 60); },
    enemyShot() { noise(0.1, 0.22, 1800); },
    reload() { tone(700, 0.06, 'square', 0.12); tone(900, 0.06, 'square', 0.12, 0.09); },
    crash() { noise(0.25, 0.5, 500); tone(70, 0.25, 'sine', 0.4, 0, 35); },
    pickup() { tone(880, 0.12, 'sine', 0.25); tone(1318, 0.2, 'sine', 0.25, 0.1); },
    cash() { tone(1046, 0.1, 'triangle', 0.25); tone(1318, 0.1, 'triangle', 0.25, 0.08); tone(1568, 0.22, 'triangle', 0.25, 0.16); },
    missionDone() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.25, i * 0.11)); },
    fail() { [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.14, i * 0.16)); },
    horn() { tone(370, 0.35, 'square', 0.16); tone(466, 0.35, 'square', 0.12); },
    steal() { tone(220, 0.15, 'sawtooth', 0.16, 0, 440); },
    siren(on) {
      sirenOn = on;
      if (!on || !ensure()) return;
      // Two-tone wail while wanted: schedule a few cycles; re-armed by the caller.
      for (let i = 0; i < 4; i += 1) {
        tone(750, 0.32, 'sine', 0.07, i * 0.64);
        tone(560, 0.32, 'sine', 0.07, i * 0.64 + 0.32);
      }
    },
    sirenActive() { return sirenOn; },
    engine(speed01) {
      if (!ensure()) return;
      try {
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineGain = ctx.createGain();
          engineOsc.type = 'sawtooth';
          engineOsc.frequency.value = 60;
          engineGain.gain.value = 0;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 420;
          engineOsc.connect(filter);
          filter.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
        }
        engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, ctx.currentTime, 0.08);
        engineGain.gain.setTargetAtTime(speed01 > 0.02 ? 0.05 + speed01 * 0.05 : 0, ctx.currentTime, 0.1);
      } catch { /* ignore */ }
    },
    startMusic() {
      if (!ensure() || musicTimer !== null) return;
      musicTimer = window.setInterval(() => {
        if (!ctx || ctx.state !== 'running') return;
        const bar = step % 8;
        const bass = BASS[Math.floor(step / 8) % BASS.length];
        tone(bass, 0.42, 'triangle', 0.16);
        if (bar % 2 === 0) tone(NOTES[(step * 3 + 2) % NOTES.length] * 2, 0.16, 'square', 0.045);
        if (bar === 4) tone(NOTES[(step + 1) % NOTES.length] * 2, 0.3, 'square', 0.05);
        step += 1;
      }, 240);
    },
    stopMusic() {
      if (musicTimer !== null) { window.clearInterval(musicTimer); musicTimer = null; }
    },
  };
}
