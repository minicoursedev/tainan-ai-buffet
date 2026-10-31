// Boot and wiring: header, dock, walk view, dialogs, list and map pages, routes (#/walk/<aisle or booth>, #/list, #/map).
import { state, on, emit, visitedCount, toast } from './state.js?v=20261031-yilan-zones';
import { loadIndex, aisleOfBooth, loadBoothForDesigner } from './data.js?v=20261031-yilan-zones';
import { goToAisle } from './nav.js?v=20261031-yilan-zones';
import { createWalkView } from './walk.js?v=20261031-poster-colors';
import { openBooth } from './ui/booth.js?v=20261031-poster-colors';
import { mountMap } from './ui/map.js?v=20261031-yilan-zones';
import { mountList } from './ui/list.js?v=20261031-poster-colors';
import { loadSchedule, isClosed, closeTagText, msLeft, lastOpenLabel } from './schedule.js?v=20261031-yilan-zones';
import { loadCats, loadChatter } from './cats.js?v=20261031-yilan-zones';
import { showClosed } from './ui/closed.js?v=20261031-yilan-zones';

import { designerRoot, updateDesignerMetadata, resolveDesignerRoute } from './routes.js?v=20261031-profile-route';

const $ = id => document.getElementById(id);
const BOOTH_ID = /^[A-Z]\d{2}-\d{2}$/;
const AISLE_ID = /^[A-Z]\d{2}$/;

let walk = null;
let list = null;
let map = null;

// three pages share the header tabs: 逛場子 (walk), 攤位列表 (list), 市集地圖 (map)
function setMode(mode, opts = {}) {
  $('stage-walk').hidden = mode !== 'walk';
  $('stage-list').hidden = mode !== 'list';
  $('stage-map').hidden = mode !== 'map';
  for (const b of document.querySelectorAll('.modes button')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  if (mode === 'list') {
    list ||= mountList($('stage-list'));
    list.show();
    history.replaceState(null, '', `${designerRoot}#/list`);
    updateDesignerMetadata();
  } else list?.hide();
  if (mode === 'map') {
    const firstVisit = !map; // The first visit shows the hall overview.
    map ||= mountMap($('stage-map'));
    map.show({ hall: state.hallCode, overview: firstVisit, ...opts });
    history.replaceState(null, '', `${designerRoot}#/map`);
    updateDesignerMetadata();
  }
  if (mode === 'walk') {
    walk?.resize();
    if (state.aisleCode && !location.hash.startsWith('#/walk/')) history.replaceState(null, '', `${designerRoot}#/walk/${state.aisleCode}`);
  }
}

function updateStatus() {
  const a = state.aisle;
  if (!a) return;
  const zones = [...new Set(a.islands.map(i => i.zoneName))];
  $('where-hall').textContent = a.hallName;
  $('where-aisle').textContent = `${a.code} 走道`;
  $('status-zone').textContent = zones.join('、') || '尚無攤位資料';
  $('btn-next').disabled = !a.islands.some(i => i.booths.length);
  $('status-count').textContent = `已逛 ${visitedCount()} / ${state.index.totals.designers} 攤`;
}

function wireDialogs() {
  for (const dlg of document.querySelectorAll('dialog.dlg')) {
    dlg.addEventListener('click', e => {
      if (e.target === dlg || e.target.closest('.dlg-close')) dlg.close();
    });
  }
}

async function boot() {
  wireDialogs();

  // opening period: closed means the 休市 screen only, nothing else loads
  await loadSchedule();
  const tag = $('close-tag');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    tag.textContent = '已休市'; tag.hidden = false;
    showClosed();
  };
  if (isClosed()) return close();
  const tick = () => {
    if (isClosed()) return close();
    const t = closeTagText();
    tag.textContent = t; tag.hidden = !t;
  };
  tick();
  setInterval(tick, 1000); // the countdown ticks every second
  tag.title = lastOpenLabel() ? `開到 ${lastOpenLabel()}` : '';

  state.index = await loadIndex();

  // the walk view keeps walking to a tapped booth; don't let it open things over a dialog or behind the list
  const busy = () => !!document.querySelector('dialog[open]') || $('stage-walk').hidden;
  walk = createWalkView($('walk-canvas'), {
    onNear: id => {
      state.nearBooth = id;
      const btn = $('btn-browse');
      btn.disabled = !id;
      btn.textContent = id ? `逛 ${id} 這攤` : '靠近即可認識攤商';
      emit('near', { boothId: id });
    },
    onOpen: id => { if (!busy()) openBooth(id); },
    onEnd: dir => {
      if (busy()) return;
      const target = dir === 'next' ? state.neighbors?.next : state.neighbors?.prev;
      if (target) goToAisle(target, { from: dir === 'next' ? 'left' : 'right' });
    },
    // what the guide cats may mention: visited booths and the closing time
    catContext: () => {
      const ms = msLeft();
      const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
      return {
        visited: visitedCount(), closeLabel: lastOpenLabel(),
        closingSoon: ms < 24 * 3600e3, leftText: !Number.isFinite(ms) ? '' : h > 0 ? `${h} 小時 ${m} 分` : `${m} 分鐘`,
      };
    },
  });
  loadCats().then(cfg => { if (cfg) walk.setCats(cfg); });
  loadChatter().then(cfg => { if (cfg) walk.setChatter(cfg); });

  on('aisle', d => {
    if ($('stage-walk').hidden) setMode('walk');
    state.neighbors = { prev: d.prev, next: d.next };
    walk.setAisle(d.data, d);
    $('walk-canvas').setAttribute('aria-label', `${d.data.hallName} ${d.code} 走道：按住拖著小人走，點攤位即可查看介紹`);
    updateStatus();
  });
  on('visited', () => { walk.refresh(); updateStatus(); });

  $('btn-browse').addEventListener('click', () => state.nearBooth && openBooth(state.nearBooth));
  $('btn-next').addEventListener('click', () => walk.nextBooth());
  $('btn-where').addEventListener('click', () => setMode('map', { overview: true }));
  for (const b of document.querySelectorAll('.modes button')) b.addEventListener('click', () => setMode(b.dataset.mode));
  document.querySelector('.plaque').addEventListener('click', e => { e.preventDefault(); setMode('walk'); });
  window.addEventListener('resize', () => walk.resize());
  const hint = $('hint');
  const hideHint = () => { hint.classList.add('is-gone'); };
  $('walk-canvas').addEventListener('pointerdown', hideHint, { once: true });
  window.addEventListener('keydown', hideHint, { once: true });

  // Shared links use #/designer/<id>; resolve the current booth after catalogue updates.
  // Also support #/walk/<aisle or booth>, #/walk/<booth>/open, #/list and #/map.
  // Links pasted into the address bar arrive as hashchange.
  const first = state.index.halls.find(h => h.code === 'O').aisles[0].code;
  async function route({ boot = false } = {}) {
    const { mode, target, then } = resolveDesignerRoute(new URL(location.href), { boot });
    if (mode === 'list' || mode === 'map') { if (boot) await goToAisle(first); setMode(mode); return; }
    let ok = false;
    if (mode === 'designer') {
      const boothId = await loadBoothForDesigner(target);
      if (boothId) {
        ok = await goToAisle(aisleOfBooth(boothId), { boothId });
        if (ok) {
          setMode('walk');
          await openBooth(boothId);
          return;
        }
      } else {
        $('dlg-booth').close();
        toast('找不到這個攤位，攤位可能已下架');
      }
    } else if (target && BOOTH_ID.test(target)) {
      ok = await goToAisle(aisleOfBooth(target), { boothId: target });
      if (ok && then === 'open') openBooth(target);
    }
    else if (target && AISLE_ID.test(target)) ok = await goToAisle(target);
    if (!ok && (boot || !state.aisle)) await goToAisle(first);
    setMode('walk');
  }
  window.addEventListener('hashchange', () => route());
  await route({ boot: true });
  updateStatus();
}

boot().catch(err => {
  console.error(err);
  toast('載入失敗，請重新整理再試一次');
});
