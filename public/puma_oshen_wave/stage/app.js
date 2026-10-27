import { createWalkView } from '../designer/js/walk.js?v=20261028-stage-author-plates';
import { toast } from '../designer/js/state.js';
import { loadCatalogue } from './data.js?v=20261028-author-halls';
import { mountPlayer } from './player.js';

const $ = id => document.getElementById(id);
const make = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};
const KEY = 'pow-stage-visited';
let visited = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '[]');
  if (Array.isArray(saved)) visited = new Set(saved.filter(id => typeof id === 'string'));
} catch { /* Browser storage is optional. */ }
let catalogue, walk, hallId, aisleIndex = 0, nearId = null, mode = 'walk';
let current = null, returnHash = '#/walk';
let destroyPlayer = null, continuousIndex = -1;
const dialog = $('video-dialog');
const byBooth = new Map();
const byId = new Map();
const hallStages = () => catalogue.stages.filter(stage => stage.hallId === hallId);
const currentHall = () => catalogue.halls.find(hall => hall.id === hallId);

function stageUrl(id) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = `/stage/${encodeURIComponent(id)}`;
  return url.href;
}

function updateStatus() {
  const stages = hallStages();
  const count = stages.filter(stage => visited.has(stage.id)).length;
  $('status-count').textContent = stages.length ? `已造訪 ${count} / ${stages.length} 座舞台` : '影片準備中';
  $('btn-next').disabled = catalogue.halls.length < 2;
  $('btn-continuous').disabled = !stages.length;
}

function updateHall() {
  const hall = currentHall();
  $('where-hall').textContent = hall.name;
  $('list-title').textContent = `${hall.name}｜影片列表`;
  $('map-title').textContent = `${hall.name}｜舞台地圖`;
  $('hall-select').value = hallId;
  const empty = !hallStages().length;
  $('stage-message').textContent = `${hall.name}的影片正在準備中，敬請期待。`;
  $('stage-message').hidden = !empty;
  $('hint').hidden = empty;
  updateStatus();
}

function setMode(next, navigate = true) {
  mode = next;
  for (const name of ['walk', 'list', 'map']) $(`stage-${name}`).hidden = name !== next;
  for (const button of document.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === next));
  if (next === 'walk') walk?.resize();
  if (next === 'list') renderList();
  if (next === 'map') renderMap();
  if (navigate) history.pushState(null, '', next === 'walk' ? `#/walk/${catalogue.aisles[aisleIndex].code}` : `#/${next}/${hallId}`);
}

function goToAisle(index, boothId = null, from = null) {
  if (!catalogue.aisles[index]) return;
  aisleIndex = index;
  const aisle = catalogue.aisles[index];
  hallId = aisle.hall;
  setMode('walk', false);
  walk.setAisle(aisle, {
    boothId, from,
    prev: catalogue.aisles[index - 1]?.hall === hallId ? catalogue.aisles[index - 1].code : null,
    next: catalogue.aisles[index + 1]?.hall === hallId ? catalogue.aisles[index + 1].code : null,
  });
  $('where-aisle').textContent = `${aisle.code} 走道`;
  updateHall();
}

function selectHall(id) {
  const index = catalogue.aisles.findIndex(aisle => aisle.hall === id);
  if (index < 0) return;
  const next = mode;
  goToAisle(index);
  setMode(next);
}

function stopPlayer() {
  destroyPlayer?.();
  destroyPlayer = null;
  $('video-player').replaceChildren();
}

function advanceContinuous() {
  const stages = hallStages();
  const index = continuousIndex + 1;
  if (index >= stages.length) {
    continuousIndex = -1;
    $('continuous-status').textContent = '已全部播放完畢';
    return;
  }
  continuousIndex = index;
  openStage(stages[index], true, true);
}

function closeVideo(restore = true) {
  continuousIndex = -1;
  $('continuous-status').hidden = true;
  stopPlayer();
  current = null;
  if (dialog.open) dialog.close();
  if (restore && location.hash.startsWith('#/stage/')) history.replaceState(null, '', returnHash);
  document.title = '洋流舞台｜我們的洋流地圖';
}

function openStage(stage, navigate = true, continuous = false) {
  if (!stage) return;
  if (!continuous) continuousIndex = -1;
  if (!location.hash.startsWith('#/stage/')) returnHash = location.hash || '#/walk';
  stopPlayer();
  current = stage;
  $('video-title').textContent = stage.title;
  $('video-creator').textContent = stage.creator;
  $('video-description').textContent = stage.description;
  $('video-description').hidden = !stage.description;
  $('share-status').textContent = '';
  $('video-source').href = stage.video.url;
  $('video-source').textContent = stage.video.type === 'youtube' ? '到 YouTube 觀看' : '開啟原影片';
  $('video-help').textContent = stage.video.type === 'youtube' ? '若影片無法在此播放，可以到 YouTube 觀看。' : '';
  const progress = () => `連續播放 ${continuousIndex + 1} / ${hallStages().length}｜關閉影片即可停止`;
  $('continuous-status').hidden = !continuous;
  $('continuous-status').textContent = continuous ? progress() : '';
  destroyPlayer = mountPlayer($('video-player'), stage.video, {
    title: stage.title, continuous,
    onEnded: () => { if (continuousIndex >= 0) advanceContinuous(); },
    onPlaying: () => { if (continuousIndex >= 0) $('continuous-status').textContent = progress(); },
    onBlocked: () => { if (continuousIndex >= 0) $('continuous-status').textContent = '請按播放器的播放鍵，即可繼續連續播放。'; },
    onError: () => {
      if (continuousIndex >= 0) $('continuous-status').textContent = '連續播放已停止，請試試到原網站觀看。';
      continuousIndex = -1;
      $('video-help').textContent = '影片暫時無法載入，請試試到原網站觀看。';
    },
  });
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('.dlg-close').focus();
  document.title = `${stage.title}｜洋流舞台`;
  visited.add(stage.id);
  try { localStorage.setItem(KEY, JSON.stringify([...visited])); } catch { /* Keep visits in memory. */ }
  walk.refresh();
  updateStatus();
  if (navigate) {
    if (continuous && continuousIndex > 0) history.replaceState(null, '', stageUrl(stage.id));
    else history.pushState(null, '', stageUrl(stage.id));
  }
}

function renderList() {
  const words = $('video-search').value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const stages = hallStages().filter(stage => words.every(word => `${stage.title} ${stage.creator} ${stage.boothId}`.toLocaleLowerCase().includes(word)));
  $('list-count').textContent = stages.length ? `共 ${stages.length} 部影片` : hallStages().length ? '沒有符合的影片，換個關鍵字試試。' : `${currentHall().name}的影片正在準備中，敬請期待。`;
  $('video-list').replaceChildren(...stages.map(stage => {
    const card = make('article', undefined, 'video-card');
    const poster = make('button', undefined, 'video-poster');
    poster.type = 'button';
    poster.setAttribute('aria-label', `觀看 ${stage.title}`);
    if (stage.video.poster) {
      const image = document.createElement('img');
      image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.src = stage.video.poster;
      image.addEventListener('error', () => image.remove(), { once: true });
      poster.append(image);
    }
    poster.addEventListener('click', () => openStage(stage));
    const watch = make('button', '觀看影片', 'btn btn-primary');
    watch.type = 'button'; watch.addEventListener('click', () => openStage(stage));
    card.append(poster, make('h2', stage.title), make('p', stage.creator, 'muted'), make('p', stage.boothId, 'mono'), watch);
    return card;
  }));
}

function renderMap() {
  $('stage-plan').replaceChildren(...catalogue.aisles.filter(aisle => aisle.hall === hallId).map(aisle => {
    const index = catalogue.aisles.indexOf(aisle);
    const section = make('section', undefined, 'plan-aisle');
    section.append(make('h2', `${aisle.code} 走道`));
    for (const island of aisle.islands) {
      const row = make('div', undefined, 'plan-row');
      for (const booth of island.booths) {
        const stage = byBooth.get(booth.id);
        const button = make('button', undefined, `plan-stage${visited.has(stage.id) ? ' is-visited' : ''}`);
        button.type = 'button';
        button.append(make('b', booth.id), make('span', stage.title));
        button.addEventListener('click', () => {
          goToAisle(index, booth.id);
          history.pushState(null, '', `#/walk/${booth.id}`);
          $('walk-canvas').focus();
        });
        row.append(button);
      }
      section.append(row);
    }
    section.append(make('p', '← 舞台走道 →', 'plan-walkway'));
    if (!hallStages().length) section.append(make('p', `${currentHall().name}的影片正在準備中，敬請期待。`));
    return section;
  }));
}

function route() {
  const [next, target] = location.hash.replace(/^#\/?/, '').split('/');
  closeVideo(false);
  if (next === 'stage') {
    const stage = byId.get(target);
    if (stage) {
      goToAisle(catalogue.aisles.findIndex(aisle => aisle.code === stage.aisleCode), stage.boothId);
      returnHash = `#/walk/${stage.aisleCode}`;
      openStage(stage, false);
      return;
    }
    toast('找不到這座舞台，影片可能已下架。');
  }
  if (next === 'list' || next === 'map') {
    const index = catalogue.aisles.findIndex(aisle => aisle.hall === target);
    if (index >= 0) goToAisle(index);
    return setMode(next, false);
  }
  const index = catalogue.aisles.findIndex(aisle => aisle.code === target?.split('-')[0]);
  goToAisle(index < 0 ? aisleIndex : index, byBooth.has(target) ? target : null);
}

async function boot() {
  catalogue = await loadCatalogue();
  hallId = catalogue.halls[0].id;
  $('hall-select').replaceChildren(...catalogue.halls.map(hall => {
    const option = make('option', hall.name);
    option.value = hall.id;
    return option;
  }));
  $('hall-select').disabled = false;
  $('hall-select').addEventListener('change', () => selectHall($('hall-select').value));
  for (const stage of catalogue.stages) { byBooth.set(stage.boothId, stage); byId.set(stage.id, stage); }
  const busy = () => dialog.open || mode !== 'walk';
  walk = createWalkView($('walk-canvas'), {
    display: 'stage', visited: id => visited.has(byBooth.get(id)?.id),
    onNear: id => {
      nearId = id;
      $('btn-watch').disabled = !id;
      $('btn-watch').textContent = id ? '觀看影片' : '靠近舞台看影片';
    },
    onOpen: id => { if (!busy()) openStage(byBooth.get(id)); },
    onEnd: direction => {
      if (busy()) return;
      const index = aisleIndex + (direction === 'next' ? 1 : -1);
      if (catalogue.aisles[index]?.hall !== hallId) return;
      goToAisle(index, null, direction === 'next' ? 'left' : 'right');
      history.replaceState(null, '', `#/walk/${catalogue.aisles[aisleIndex].code}`);
    },
  });
  $('btn-watch').addEventListener('click', () => openStage(byBooth.get(nearId)));
  $('btn-next').addEventListener('click', () => {
    const index = catalogue.halls.findIndex(hall => hall.id === hallId);
    selectHall(catalogue.halls[(index + 1) % catalogue.halls.length].id);
  });
  $('btn-continuous').addEventListener('click', () => {
    continuousIndex = -1;
    advanceContinuous();
  });
  $('btn-where').addEventListener('click', () => setMode('map'));
  $('video-search').addEventListener('input', renderList);
  for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => setMode(button.dataset.mode));
  dialog.querySelector('.dlg-close').addEventListener('click', () => closeVideo());
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeVideo(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) closeVideo(); });
  dialog.addEventListener('close', () => { if (!dialog.open) closeVideo(); });
  $('copy-stage').addEventListener('click', async () => {
    if (!current) return;
    const stage = current, url = stageUrl(stage.id);
    try {
      await navigator.clipboard.writeText(url);
      if (current === stage) $('share-status').textContent = '舞台連結已複製';
    } catch {
      if (current === stage) $('share-status').textContent = `請複製此網址：${url}`;
    }
  });
  $('walk-canvas').addEventListener('pointerdown', () => $('hint').classList.add('is-gone'), { once: true });
  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', stopPlayer);
  goToAisle(0);
  route();
}

boot().catch(error => {
  console.error(error);
  $('status-count').textContent = '舞台暫時無法開放';
  const message = $('stage-message');
  message.replaceChildren(make('p', '影片資料暫時無法載入，請再試一次。'));
  const retry = make('button', '重新載入', 'btn');
  retry.type = 'button'; retry.addEventListener('click', () => location.reload());
  message.append(retry); message.hidden = false;
});
