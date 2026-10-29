// 設計師地圖 page (<main id="stage-map">): hall overview, and a hall plan with one compact row per aisle.
import { state, on, isVisited } from '../state.js';
import { goToAisle, goToBooth } from '../nav.js?v=20261030-site-data';

const ZONES_SHOWN = 8;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = n => String(n).padStart(2, '0');
const fmt = n => Number(n || 0).toLocaleString('zh-TW');

const view = { mode: 'overview', hall: 'O', zone: null };
let root = null;   // <main id="stage-map">, scrolls by itself
let wired = false;
const shown = () => !!root && !root.hidden;

const halls = () => state.index?.halls || [];
const hallByCode = code => halls().find(h => h.code === code) || halls()[0];
const zoneBooths = hall => hall.zones.reduce((s, z) => s + z.booths, 0);
const curAisleZones = () => new Set(state.aisle ? state.aisle.islands.map(i => i.zoneName) : []);

export function mountMap(container) {
  root = container;
  return { show: openMap, hide() {} };
}

function openMap({ hall, overview } = {}) {
  if (!root || !state.index) return;
  view.hall = hallByCode(hall || state.hallCode)?.code || 'O';
  view.mode = overview ? 'overview' : 'hall';
  view.zone = null;
  root.innerHTML = `
    <div class="mp-page">
    <h1 class="mp-title" id="map-title">設計師地圖</h1>
    <div class="mp-tools">
      <div class="mp-tabs" role="group" aria-label="館">
        <button type="button" class="mp-tab" data-tab="overview">總覽</button>
        ${halls().map(h => `<button type="button" class="mp-tab" data-tab="${h.code}">${esc(h.name)}</button>`).join('')}
      </div>
      <label class="mp-jump"><span>跳到</span><select aria-label="跳到哪一區"></select></label>
    </div>
    <div class="mp-body"></div>
    </div>`;
  if (!wired) wire();
  render();
  scrollToFocus();
}

function wire() {
  wired = true;
  root.addEventListener('click', onClick);
  root.addEventListener('change', e => {
    if (!e.target.matches('.mp-jump select')) return;
    const el = root.querySelector(`.mp-zone-h[data-zone="${CSS.escape(e.target.value)}"]`);
    if (el) scrollInto(el, 0.05);
  });
  on('aisle', () => { if (shown()) render(); });
}

function onClick(e) {
  const t = e.target;
  const tab = t.closest('.mp-tab');
  if (tab) {
    if (tab.dataset.tab === 'overview') view.mode = 'overview';
    else {
      view.mode = 'hall';
      view.hall = tab.dataset.tab;
      view.zone = null;
    }
    return rerender();
  }
  const hallBtn = t.closest('[data-go-hall]');
  if (hallBtn) {
    view.mode = 'hall';
    view.hall = hallBtn.dataset.goHall;
    view.zone = hallBtn.dataset.zone || null;
    return rerender();
  }
  const cell = t.closest('[data-booth]');
  if (cell) { goToBooth(cell.dataset.booth); return; } // app.js switches back to the walk page on 'aisle'
  const row = t.closest('.mp-row');
  if (row) goToAisle(row.dataset.aisle, { from: 'left' });
}

function rerender() {
  render();
  scrollToFocus();
}

function render() {
  for (const b of root.querySelectorAll('.mp-tab')) {
    const pressed = view.mode === 'overview' ? b.dataset.tab === 'overview' : b.dataset.tab === view.hall;
    b.setAttribute('aria-pressed', String(pressed));
  }
  const jump = root.querySelector('.mp-jump');
  const hall = hallByCode(view.hall);
  const body = root.querySelector('.mp-body');
  const title = root.querySelector('#map-title');
  if (view.mode === 'overview') {
    title.textContent = '設計師地圖・全館總覽';
    jump.hidden = true;
    body.innerHTML = overviewHtml();
    return;
  }
  title.textContent = `設計師地圖・${hall.name}`;
  body.innerHTML = planHtml(hall);
  const zones = [...body.querySelectorAll('.mp-zone-h')];
  jump.hidden = zones.length < 2;
  jump.querySelector('select').innerHTML = `<option value="">選一區</option>` +
    zones.map(z => `<option value="${esc(z.dataset.zone)}">${esc(z.dataset.label)}</option>`).join('');
}

// ---------- hall overview
function overviewHtml() {
  const here = state.hallCode;
  const zonesHere = curAisleZones();
  const cards = halls().map(h => {
    const zones = h.zones;
    const keep = new Set([...zones].sort((a, b) => b.booths - a.booths).slice(0, ZONES_SHOWN).map(z => z.code));
    const shown = zones.filter(z => keep.has(z.code));
    const rest = zones.length - shown.length;
    const isHere = h.code === here;
    const zoneBtns = shown.map(z => {
      const cur = isHere && zonesHere.has(z.name);
      return `<button type="button" class="mp-zone${cur ? ' is-here' : ''}" style="flex-grow:${Math.max(1, Math.round(Math.sqrt(z.booths)))}"
        data-go-hall="${h.code}" data-zone="${esc(z.code)}"><b>${esc(z.name)}</b><span class="mono">${fmt(z.booths)}</span></button>`;
    }).join('');
    return `<section class="mp-hall${isHere ? ' is-here' : ''}" aria-label="${esc(h.name)}">
      <button type="button" class="mp-hall-name" data-go-hall="${h.code}">
        <b>${esc(h.name)}</b><small>${fmt(zoneBooths(h))} 攤・${h.aisles.length} 條走道</small>
        ${isHere ? '<span class="mp-pin">你在這裡</span>' : ''}</button>
      <div class="mp-zones">${zoneBtns}${rest > 0 ? `<button type="button" class="mp-zone mp-zone-more" data-go-hall="${h.code}"><b>還有 ${rest} 區</b></button>` : ''}</div>
      <div class="mp-door" aria-hidden="true">入口</div>
    </section>`;
  }).join('');
  return `<p class="mp-note">點一館看走道。</p><div class="mp-venue">${cards}</div>`;
}

// ---------- hall plan: one row per aisle. N islands on top (left to right), walkway, S islands below.
function planHtml(hall) {
  const aisles = hall.aisles;
  const zoneName = new Map(hall.zones.map(z => [z.code, z.name]));
  const seen = new Set();
  const out = [];
  for (const a of aisles) {
    const fresh = [];
    for (const isl of a.islands) if (!seen.has(isl.zone)) { seen.add(isl.zone); fresh.push(isl.zone); }
    if (fresh.length) {
      const label = fresh.map(z => zoneName.get(z) || z).join('、');
      out.push(`<h3 class="mp-zone-h" data-zone="${esc(fresh[0])}" data-zones="${esc(fresh.join(' '))}" data-label="${esc(label)}">${esc(label)}</h3>`);
    }
    out.push(rowHtml(a, zoneName));
  }
  return `<div class="mp-plan">${out.join('')}</div>
    <p class="mp-legend"><span><i class="mp-c"></i>一攤</span><span><i class="mp-c is-visited"></i>逛過</span><span><i class="mp-c is-near"></i>你旁邊這攤</span><span><i class="mp-key-here"></i>你在這條走道</span></p>`;
}

function rowHtml(a, zoneName) {
  const here = a.code === state.aisleCode;
  let slot = 0;
  const sides = { N: [], S: [] };
  for (const isl of a.islands) {
    const zn = zoneName.get(isl.zone) || isl.zone;
    let cells = '';
    for (let i = 0; i < isl.n; i++) {
      slot += 1;
      const id = `${a.code}-${pad2(slot)}`;
      const cls = id === state.nearBooth && here ? ' is-near' : isVisited(id) ? ' is-visited' : '';
      cells += `<span class="mp-c${cls}" data-booth="${id}" title="${id} ${esc(zn)}"></span>`;
    }
    (sides[isl.side] || sides.N).push(`<span class="mp-isl">${cells}</span>`);
  }
  const line = list => `<span class="mp-side">${list.join('') || '<span class="mp-isl is-empty"></span>'}</span>`;
  return `<div class="mp-row${here ? ' is-here' : ''}" data-aisle="${a.code}">
    <button type="button" class="mp-label" aria-label="${a.code} 走道，${a.booths} 攤，${esc(a.zones.join('、'))}">
      <b class="mono">${a.code}</b><small>${a.booths} 攤</small>${here ? '<span class="mp-pin">你在這裡</span>' : ''}</button>
    <span class="mp-strip" aria-hidden="true">${line(sides.N)}<span class="mp-walk"></span>${line(sides.S)}</span>
  </div>`;
}

// ---------- scrolling
function scrollInto(el, at = 0.35) {
  const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - root.clientHeight * at;
  root.scrollTop = Math.max(0, top);
}

function scrollToFocus() {
  const body = root.querySelector('.mp-body');
  root.scrollTop = 0;
  requestAnimationFrame(() => {
    if (!shown()) return;
    let el = null;
    if (view.zone) el = body.querySelector(`.mp-zone-h[data-zones~="${CSS.escape(view.zone)}"]`);
    if (!el) el = body.querySelector('.mp-row.is-here');
    if (el) scrollInto(el, view.zone ? 0.05 : 0.35);
  });
}
