import { WORLD, STATIONS, OBSTACLES, CARGO_NAMES, createState, start, togglePause, tick, interact, nearestStation, actionHint, objective } from './level.js';

const $ = id => document.getElementById(id);
const canvas = $('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = WORLD.width;
canvas.height = WORLD.height;
const dom = Object.fromEntries(['startOverlay', 'startButton', 'pauseOverlay', 'resumeButton', 'resultOverlay', 'resultTitle', 'resultDescription', 'resultStats', 'retryButton', 'timeValue', 'deliveryValue', 'batteryValue', 'bagSlots', 'gameMessage', 'actionHint', 'pauseButton', 'muteButton', 'restartButton', 'interactButton', 'gameStatus'].map(id => [id, $(id)]));
let state = createState();
let previousFrame = performance.now();
let uiClock = 0;
let visualTime = 0;
let walkTarget = null;
let muted = false;
let audioContext;
let bagSignature = '';
let resultStatus = '';
const keys = new Set();
const pointers = new Map();
let jumpQueued = false;
const images = {};
let courierCrop = null;

const put = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
const on = (el, type, callback) => el?.addEventListener(type, callback);
function unlockAudio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audioContext ||= new Audio();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  } catch { /* Audio is optional when the browser disallows playback. */ }
}
function sound(event) {
  if (muted || !audioContext || audioContext.state !== 'running') return;
  const notes = { pickup: [523, 659], deliver: [659, 784], cool: [392, 523], cooldone: [523, 784], win: [523, 659, 784, 1047], lose: [392, 294], jump: [440], notice: [330] }[event];
  if (!notes) return;
  notes.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const volume = audioContext.createGain();
    const time = audioContext.currentTime + index * 0.09;
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(0, time);
    volume.gain.linearRampToValueAtTime(0.045, time + 0.012);
    volume.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    oscillator.connect(volume).connect(audioContext.destination);
    oscillator.start(time); oscillator.stop(time + 0.18);
    oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
  });
}
function clearInput() {
  keys.clear(); pointers.clear(); jumpQueued = false; walkTarget = null;
  document.querySelectorAll('[data-control].is-pressed').forEach(button => button.classList.remove('is-pressed'));
}
function play() {
  unlockAudio();
  if (state.status === 'ready') start(state);
  else if (state.status === 'paused') togglePause(state);
  previousFrame = performance.now(); renderUI(); canvas.focus({ preventScroll: true });
}
function restart() {
  const wasReady = state.status === 'ready';
  clearInput(); state = createState(); bagSignature = ''; resultStatus = '';
  if (!wasReady) start(state);
  unlockAudio(); previousFrame = performance.now(); renderUI();
  if (!wasReady) canvas.focus({ preventScroll: true });
}
function pause() {
  if (!['running', 'paused'].includes(state.status)) return;
  togglePause(state); clearInput(); previousFrame = performance.now(); renderUI();
}
function useAction() { unlockAudio(); interact(state); renderUI(); canvas.focus({ preventScroll: true }); }
on(dom.startButton, 'click', play);
on(dom.resumeButton, 'click', play);
on(dom.pauseButton, 'click', pause);
on(dom.restartButton, 'click', restart);
on(dom.retryButton, 'click', restart);
on(dom.interactButton, 'click', useAction);
on(dom.muteButton, 'click', () => {
  muted = !muted; unlockAudio();
  dom.muteButton.setAttribute('aria-pressed', String(muted));
  dom.muteButton.setAttribute('aria-label', muted ? '開啟音效' : '關閉音效');
  dom.muteButton.title = muted ? '音效已關閉，點擊開啟' : '音效已開啟，點擊關閉';
  dom.muteButton.dataset.muted = String(muted);
});

document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const key = event.key.toLowerCase();
  if (!['arrowleft', 'arrowright', 'a', 'd', ' ', 'e', 'b', 'escape', 'p'].includes(key)) return;
  if ((key === ' ' || key === 'e' || key === 'b') && event.target.closest?.('button')) return;
  event.preventDefault(); unlockAudio();
  if (!event.repeat && (key === 'escape' || key === 'p')) { pause(); return; }
  if (state.status !== 'running') return;
  keys.add(key);
  if (['arrowleft', 'arrowright', 'a', 'd'].includes(key)) walkTarget = null;
  if (!event.repeat && key === ' ') jumpQueued = true;
  if (!event.repeat && (key === 'e' || key === 'b')) useAction();
});
document.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
for (const button of document.querySelectorAll('[data-control]')) {
  const control = button.dataset.control;
  if (!['left', 'right', 'jump'].includes(control)) continue;
  button.style.touchAction = 'none';
  if (control === 'jump') button.addEventListener('click', event => {
    if (event.detail === 0 && state.status === 'running') {
      unlockAudio(); jumpQueued = true; canvas.focus({ preventScroll: true });
    }
  });
  button.addEventListener('pointerdown', event => {
    event.preventDefault(); unlockAudio();
    if (state.status !== 'running') return;
    button.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, control); walkTarget = null;
    if (control === 'jump') jumpQueued = true;
    button.classList.add('is-pressed');
  });
  const release = event => {
    pointers.delete(event.pointerId);
    button.classList.remove('is-pressed');
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
}
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', event => {
  if (state.status !== 'running' || state.cooling > 0) return;
  event.preventDefault(); unlockAudio();
  const bounds = canvas.getBoundingClientRect();
  walkTarget = Math.max(55, Math.min(WORLD.width - 55, (event.clientX - bounds.left) / bounds.width * WORLD.width));
});
window.addEventListener('blur', () => { if (state.status === 'running') pause(); else clearInput(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state.status === 'running') pause(); });

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image); image.onerror = () => reject(new Error(`圖片載入失敗：${src}`)); image.src = src;
  });
}
async function loadArt() {
  try {
    [images.background, images.courier] = await Promise.all([loadImage('assets/level-01-background.png'), loadImage('assets/courier.png')]);
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = images.courier.width; cropCanvas.height = images.courier.height;
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
    cropCtx.drawImage(images.courier, 0, 0);
    const { data } = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
    let minX = cropCanvas.width, maxX = 0, minY = cropCanvas.height, maxY = 0;
    for (let y = 0; y < cropCanvas.height; y++) for (let x = 0; x < cropCanvas.width; x++) {
      if (data[(y * cropCanvas.width + x) * 4 + 3] > 24) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
    courierCrop = maxX > minX ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : { x: 0, y: 0, w: images.courier.width, h: images.courier.height };
    canvas.dataset.assets = 'loaded';
  } catch (error) {
    canvas.dataset.assets = 'error';
    put(dom.gameStatus, error.message);
  }
}

function roundRect(x, y, w, h, r, fill, stroke) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke(); }
}
function text(value, x, y, size = 24, color = '#173f33', align = 'center') {
  ctx.font = `700 ${size}px system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(value, x, y);
}
function draw() {
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  if (images.background) ctx.drawImage(images.background, 0, 0, WORLD.width, WORLD.height);
  else {
    ctx.fillStyle = '#c6dfca'; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.fillStyle = '#f2d5a2'; ctx.fillRect(0, 675, WORLD.width, 110);
  }
  const nearby = nearestStation(state);
  for (const station of STATIONS) {
    const active = nearby?.id === station.id && state.status === 'running';
    const badgeY = 456;
    ctx.globalAlpha = active ? 0.3 : 0.15;
    ctx.fillStyle = station.color; ctx.beginPath(); ctx.ellipse(station.x, WORLD.ground + 2, 85, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    roundRect(station.x - 87, badgeY, 174, 82, 16, active ? '#fffbed' : '#fffbedee', active ? '#225d43' : '#ffffff');
    text(station.name, station.x, badgeY + 27, 28);
    const detail = station.kind ? `待領 ${state.stock[station.kind]} 箱` : station.id === 'cold' ? `預冷電力 ${state.battery} / 2` : `已送達 ${state.delivered.length} / 4`;
    text(detail, station.x, badgeY + 60, 18, '#4a6d5c');
    ctx.fillStyle = station.color; ctx.beginPath(); ctx.moveTo(station.x - 10, badgeY + 83); ctx.lineTo(station.x + 10, badgeY + 83); ctx.lineTo(station.x, badgeY + 96); ctx.fill();
  }
  for (const barrier of OBSTACLES) {
    const y = WORLD.ground - barrier.height;
    ctx.fillStyle = '#173f3329'; ctx.beginPath(); ctx.ellipse(barrier.x + barrier.width / 2, WORLD.ground + 4, 37, 8, 0, 0, 7); ctx.fill();
    roundRect(barrier.x, y, barrier.width, barrier.height, 6, '#e98065', '#fff4d8');
    ctx.strokeStyle = '#fff3d6'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(barrier.x + 9, y + 8); ctx.lineTo(barrier.x + 24, y + 27); ctx.moveTo(barrier.x + 26, y + 8); ctx.lineTo(barrier.x + 40, y + 27); ctx.stroke();
  }
  if (walkTarget !== null && state.status === 'running') {
    ctx.strokeStyle = '#fffbed'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(walkTarget, WORLD.ground + 2, 18, 6, 0, 0, 7); ctx.stroke();
  }
  const moving = state.status === 'running' && state.cooling <= 0 && (keys.size > 0 || pointers.size > 0 || walkTarget !== null);
  const bob = moving && state.y === WORLD.ground ? Math.sin(visualTime * 15) * 3 : 0;
  ctx.fillStyle = '#183e3738'; ctx.beginPath(); ctx.ellipse(state.x, WORLD.ground + 4, 25, 8, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(state.x, state.y + bob); ctx.scale(state.facing, 1);
  if (images.courier && courierCrop) {
    const height = 118, width = courierCrop.w / courierCrop.h * height;
    ctx.drawImage(images.courier, courierCrop.x, courierCrop.y, courierCrop.w, courierCrop.h, -width / 2, -height, width, height);
  } else {
    roundRect(-18, -70, 36, 55, 10, '#326f59'); ctx.fillStyle = '#f1cba1'; ctx.beginPath(); ctx.arc(0, -85, 17, 0, 7); ctx.fill();
  }
  ctx.restore();
  if (state.cargo.length) {
    state.cargo.forEach((cargo, index) => {
      const x = state.x - 21 + index * 43;
      roundRect(x - 18, state.y - 149, 36, 26, 5, cargo.kind === 'mango' ? '#f3b950' : '#6dc9db', '#fff9e8');
      text(cargo.cooled ? '❄' : cargo.kind === 'mango' ? '果' : '魚', x, state.y - 136, 17);
    });
  }
  if (state.cooling > 0) {
    roundRect(state.x - 70, state.y - 185, 140, 21, 10, '#fffbed');
    roundRect(state.x - 66, state.y - 181, 132 * (1 - state.cooling / 3), 13, 6, '#5fae9d');
  }
  // A compact route below the illustration keeps goals visible at mobile sizes.
  roundRect(115, 900, 1306, 92, 24, '#fffbeded');
  ctx.strokeStyle = '#b4cbb9'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(220, 932); ctx.lineTo(1370, 932); ctx.stroke();
  for (const station of STATIONS) {
    ctx.fillStyle = station.color; ctx.beginPath(); ctx.arc(station.x, 932, 11, 0, 7); ctx.fill();
    text(station.name, station.x, 968, 21);
  }
  ctx.fillStyle = '#204d3e'; ctx.beginPath(); ctx.moveTo(state.x, 909); ctx.lineTo(state.x - 9, 892); ctx.lineTo(state.x + 9, 892); ctx.fill();
  if (state.status === 'running' && !state.cooling) {
    const hint = nearby ? '按 E／互動' : '點路面可自動走跳';
    const anchor = Math.max(100, Math.min(WORLD.width - 100, state.x));
    roundRect(anchor - 96, 802, 192, 40, 15, '#fffbedee'); text(hint, anchor, 822, 19);
  }
}
function renderUI() {
  put(dom.timeValue, `${Math.ceil(state.seconds)} 秒`);
  put(dom.deliveryValue, `${state.delivered.length} / 4`);
  put(dom.batteryValue, `${state.battery} / 2`);
  put(dom.gameMessage, state.messageTime > 0 ? state.message : objective(state));
  put(dom.actionHint, actionHint(state));
  if (dom.interactButton) {
    dom.interactButton.disabled = state.status !== 'running' || state.cooling > 0;
    dom.interactButton.setAttribute('aria-label', `互動：${actionHint(state)}`);
  }
  if (dom.pauseButton) {
    dom.pauseButton.disabled = !['running', 'paused'].includes(state.status);
    dom.pauseButton.setAttribute('aria-label', state.status === 'paused' ? '繼續配送' : '暫停遊戲');
    dom.pauseButton.title = state.status === 'paused' ? '繼續配送' : '暫停遊戲';
  }
  if (dom.startOverlay) dom.startOverlay.hidden = state.status !== 'ready';
  if (dom.pauseOverlay) dom.pauseOverlay.hidden = state.status !== 'paused';
  const ended = state.status === 'won' || state.status === 'lost';
  if (dom.resultOverlay) dom.resultOverlay.hidden = !ended;
  if ($('resultPolicy')) $('resultPolicy').hidden = state.status !== 'won';
  if (ended && resultStatus !== state.status) {
    resultStatus = state.status;
    const average = state.delivered.length ? Math.round(state.delivered.reduce((total, cargo) => total + cargo.freshness, 0) / state.delivered.length) : 0;
    put(dom.resultTitle, state.status === 'won' ? '配送成功！' : '再挑戰一次');
    put(dom.resultDescription, state.status === 'won' ? '芒果與魚貨各兩箱全部送達。預冷只能減慢流失，及時配送同樣重要。' : state.lossReason);
    if (dom.resultStats) dom.resultStats.replaceChildren(...[`送達 ${state.delivered.length} / 4 箱`, `送達平均鮮度 ${average}%`, `預冷用電 ${state.energyUsed} / 2`, `配送用時 ${Math.ceil(150 - state.seconds)} 秒`].map(value => { const p = document.createElement('p'); p.textContent = value; return p; }));
  }
  const signature = JSON.stringify(state.cargo.map(c => [c.id, Math.ceil(c.freshness), c.cooled]));
  if (dom.bagSlots && signature !== bagSignature) {
    bagSignature = signature;
    dom.bagSlots.replaceChildren(...[0, 1].map(index => {
      const cargo = state.cargo[index]; const slot = document.createElement('div');
      slot.className = `cargo-slot${cargo ? '' : ' cargo-empty'}`;
      if (!cargo) { slot.textContent = '空位'; return slot; }
      const name = document.createElement('span'); name.className = 'cargo-name'; name.textContent = `${CARGO_NAMES[cargo.kind]}${cargo.cooled ? ' ❄' : ''}`;
      const percent = document.createElement('span'); percent.className = 'cargo-freshness'; percent.textContent = `${Math.ceil(cargo.freshness)}%`;
      const bar = document.createElement('progress'); bar.max = 100; bar.value = cargo.freshness; bar.setAttribute('aria-label', `${CARGO_NAMES[cargo.kind]}鮮度`);
      if (cargo.freshness < 35) slot.classList.add('cargo-warning');
      slot.append(name, percent, bar); return slot;
    }));
  }
  const states = { ready: '等待開始', running: '配送進行中', paused: '已暫停，時間與鮮度凍結', won: '配送成功', lost: '本次配送結束' };
  put(dom.gameStatus, states[state.status]);
  canvas.dataset.state = state.status;
}
function frame(now) {
  const dt = Math.min((now - previousFrame) / 1000, 0.1); previousFrame = now;
  let move = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
  const held = [...pointers.values()];
  move += (held.includes('right') ? 1 : 0) - (held.includes('left') ? 1 : 0);
  let jump = jumpQueued; jumpQueued = false;
  if (walkTarget !== null && state.status === 'running' && !state.cooling) {
    if (Math.abs(walkTarget - state.x) < 5) walkTarget = null;
    else {
      move = Math.sign(walkTarget - state.x);
      // Tapping a destination also crosses small barriers; keyboard players jump manually.
      jump ||= OBSTACLES.some(o => move > 0 ? o.x - state.x > 0 && o.x - state.x < 90 : state.x - o.x - o.width > 0 && state.x - o.x - o.width < 90);
    }
  }
  tick(state, dt, { move, jump });
  if (state.event) { sound(state.event); state.event = null; }
  if (state.status === 'running') visualTime += dt;
  draw(); uiClock += dt;
  if (uiClock >= 0.1 || ['won', 'lost'].includes(state.status)) { renderUI(); uiClock = 0; }
  requestAnimationFrame(frame);
}
// Read-only inspection supports QA without changing the actual input path.
Object.defineProperty(window, 'freshRoute', { value: Object.freeze({ getState: () => structuredClone(state) }) });
renderUI(); loadArt(); requestAnimationFrame(frame);
