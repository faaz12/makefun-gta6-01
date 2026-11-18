// The HUD: cash/health/wanted/clock/objective DOM panels, the circular
// minimap (roads, player arrow, cars, police, mission blip), toasts, dialogue
// and the damage vignette. All DOM writes are cached so unchanged values
// don't touch the layout every frame.
import { CITY } from './config.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const els = {
    cash: $('cash'), rep: $('rep'), healthText: $('healthtext'), healthFill: $('healthfill'),
    armor: $('armorline'), stars: $('stars'), clock: $('clock'), obj: $('objtext'),
    speedo: $('speedo'), speed: $('speed'), carName: $('carname'),
    ammo: $('ammo'), ammoText: $('ammotext'), toast: $('toast'),
    crosshair: $('crosshair'), hint: $('hint'), dialog: $('dialog'),
    damage: $('damage'), minimap: $('minimap'), hitmarker: $('hitmarker'),
  };
  const mapCtx = els.minimap.getContext('2d');
  const cache = {};
  let toastTimer = null;
  let dialogTimer = null;

  function setText(el, key, value) {
    if (cache[key] !== value) {
      cache[key] = value;
      el.textContent = value;
    }
  }
  function setHtml(el, key, value) {
    if (cache[key] !== value) {
      cache[key] = value;
      el.innerHTML = value;
    }
  }

  function toast(message, ms = 2600) {
    els.toast.textContent = message;
    els.toast.style.opacity = '1';
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { els.toast.style.opacity = '0'; }, ms);
  }
  function dialog(html, ms = 6000) {
    els.dialog.innerHTML = html;
    els.dialog.style.display = 'block';
    if (dialogTimer) window.clearTimeout(dialogTimer);
    dialogTimer = window.setTimeout(() => { els.dialog.style.display = 'none'; }, ms);
  }
  function hideDialog() {
    els.dialog.style.display = 'none';
    if (dialogTimer) window.clearTimeout(dialogTimer);
  }

  function drawMinimap(state) {
    const ctx = mapCtx;
    const S = 190;
    const half = 280;
    const toMap = (x, z) => [S / 2 + (x / half) * (S / 2 - 8), S / 2 + (z / half) * (S / 2 - 8)];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#0e2a3e';
    ctx.fillRect(0, 0, S, S);
    // Ocean (west) + beach.
    ctx.fillStyle = '#1e7fa8';
    ctx.fillRect(0, 0, 14, S);
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(14, 0, 6, S);
    // Roads.
    ctx.strokeStyle = '#4a5058';
    ctx.lineWidth = 5;
    for (let k = -4; k <= 4; k += 1) {
      const [ax] = toMap(k * 60, 0);
      ctx.beginPath(); ctx.moveTo(ax, 6); ctx.lineTo(ax, S - 6); ctx.stroke();
      const [, az] = toMap(0, k * 60);
      ctx.beginPath(); ctx.moveTo(6, az); ctx.lineTo(S - 6, az); ctx.stroke();
    }
    // Blocks.
    ctx.fillStyle = 'rgba(220,200,160,0.25)';
    for (let bx = -4; bx < 4; bx += 1) {
      for (let bz = -4; bz < 4; bz += 1) {
        const [x, z] = toMap(bx * 60 + 30, bz * 60 + 30);
        ctx.fillRect(x - 7, z - 7, 14, 14);
      }
    }
    const dot = (x, z, r, color) => {
      const [mx, mz] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(mx, mz, r, 0, Math.PI * 2); ctx.fill();
    };
    if (state.missionTarget) {
      const [mx, mz] = toMap(state.missionTarget.x, state.missionTarget.z);
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, mz, 7 + Math.sin(state.time * 4) * 2, 0, Math.PI * 2); ctx.stroke();
      dot(state.missionTarget.x, state.missionTarget.z, 3.5, '#ffd23e');
    }
    for (const c of state.cars) if (c.alive && !c.police) dot(c.x, c.z, 2, '#c8d8e8');
    for (const p of state.police) if (p.alive) dot(p.x, p.z, 3, '#ff4444');
    for (const e of state.enemies || []) if (e.alive) dot(e.x, e.z, 3, '#ff8800');
    // Shops (orange), safehouse (green), garage (blue), helicopter (red ring).
    for (const s of state.shops || []) dot(s.x, s.z, 3, '#ff9f2e');
    if (state.safehouse) dot(state.safehouse.x, state.safehouse.z, 3.5, '#7dff9b');
    if (state.garage) dot(state.garage.x, state.garage.z, 3, '#6fb7ff');
    if (state.heli) {
      const [hx, hz] = toMap(state.heli.x, state.heli.z);
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hx, hz, 6, 0, Math.PI * 2); ctx.stroke();
      dot(state.heli.x, state.heli.z, 3, '#ff4444');
    }
    // Player arrow, rotated to the player's heading.
    const [px, pz] = toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(state.player.yaw);
    ctx.fillStyle = '#7dff9b';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', S / 2, 12);
  }

  return {
    toast, dialog, hideDialog, drawMinimap,
    setCash(v) { setText(els.cash, 'cash', `$${Math.floor(v).toLocaleString('en-US')}`); },
    setRep(v) { setText(els.rep, 'rep', v > 0 ? ` · REP ${v}` : ''); },
    setHealth(v, max) {
      setText(els.healthText, 'hp', `Health ${Math.max(0, Math.ceil(v))}`);
      const pct = Math.max(0, Math.min(100, (v / max) * 100));
      if (cache.hppct !== pct) {
        cache.hppct = pct;
        els.healthFill.style.width = `${pct}%`;
        els.healthFill.style.background = pct > 50 ? 'linear-gradient(90deg,#37e07a,#a8f04a)' : pct > 25 ? 'linear-gradient(90deg,#f2a93e,#f2d23e)' : 'linear-gradient(90deg,#e03a3a,#f26a3e)';
      }
    },
    setArmor(v) { setText(els.armor, 'armor', v > 0 ? `Armor ${Math.ceil(v)}` : ''); },
    setWanted(stars) {
      let html = '';
      for (let i = 0; i < 5; i += 1) html += i < stars ? '★' : '<span class="off">☆</span>';
      setHtml(els.stars, 'stars', html);
      els.stars.parentElement.style.color = stars >= 3 ? '#ff5a4a' : '#ffd23e';
    },
    setClock(hour, minute) {
      const hh = String(hour).padStart(2, '0');
      const mm = String(minute).padStart(2, '0');
      setText(els.clock, 'clock', `${hh}:${mm} · SUNNY`);
    },
    setObjective(text) { setText(els.obj, 'obj', text); },
    setDriving(on, speedKmh, carName) {
      els.speedo.style.display = on ? 'block' : 'none';
      if (on) {
        setText(els.speed, 'speed', String(Math.round(speedKmh)));
        setText(els.carName, 'carname', carName);
      }
    },
    setAmmo(on, mag, reserve) {
      els.ammo.style.display = on ? 'block' : 'none';
      if (on) setText(els.ammoText, 'ammo', `${mag} / ${reserve === Infinity ? '∞' : reserve}`);
    },
    setCrosshair(on) { els.crosshair.style.display = on ? 'block' : 'none'; },
    /** Flash a hit marker over the crosshair when a shot lands. */
    hitmarker() {
      els.hitmarker.style.opacity = '1';
      window.setTimeout(() => { els.hitmarker.style.opacity = '0'; }, 130);
    },
    setDamage(v) { els.damage.style.opacity = String(Math.max(0, Math.min(1, v))); },
    setHint(text) { setText(els.hint, 'hint', text); },
    showStart(hasSave) {
      $('startScreen').style.display = 'flex';
      $('continue').style.display = hasSave ? 'inline-block' : 'none';
    },
    hideStart() { $('startScreen').style.display = 'none'; },
    showPause(stats) {
      $('pauseScreen').style.display = 'flex';
      $('pauseStats').textContent = stats;
    },
    hidePause() { $('pauseScreen').style.display = 'none'; },
    showEnd(title, text) {
      $('endTitle').textContent = title;
      $('endText').textContent = text;
      $('endScreen').style.display = 'flex';
    },
    hideEnd() { $('endScreen').style.display = 'none'; },
  };
}
