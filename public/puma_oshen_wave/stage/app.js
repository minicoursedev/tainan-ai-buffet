import { createWalkView } from '../designer/js/walk.js?v=20261028-creator-socials';
import { toast } from '../designer/js/state.js';
import { loadCatalogue, createPublicShowcase } from './data.js?v=20261030-site-data';
import { mountPlayer } from './player.js?v=20261031-player-type';

const $ = id => document.getElementById(id);
const make = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};
const KEY = 'pow-stage-visited';
const PUBLIC_HALL = 'public-stage';
const PUBLIC_KEY = 'pow-stage-public-halls';
let visited = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '[]');
  if (Array.isArray(saved)) visited = new Set(saved.filter(id => typeof id === 'string'));
} catch { /* Browser storage is optional. */ }
let previousPublicHalls = [];
try {
  const saved = JSON.parse(sessionStorage.getItem(PUBLIC_KEY) || '[]');
  if (Array.isArray(saved)) previousPublicHalls = saved.filter(id => typeof id === 'string');
} catch { /* Keep the last selection in memory when storage is unavailable. */ }
let catalogue, walk, hallId, aisleIndex = 0, nearId = null, mode = 'walk';
let publicShowcase = null;
let current = null, returnHash = '#/walk';
let destroyPlayer = null, continuousIndex = -1;
const dialog = $('video-dialog');
const creatorDialog = $('creator-dialog');
const byBooth = new Map();
const byId = new Map();
const hallStages = () => hallId === PUBLIC_HALL ? publicShowcase.stages : catalogue.stages.filter(stage => stage.hallId === hallId);
const currentHall = () => catalogue.halls.find(hall => hall.id === hallId);

function refreshPublicShowcase() {
  publicShowcase = createPublicShowcase(catalogue, { previousHalls: previousPublicHalls });
  previousPublicHalls = publicShowcase.stages.map(stage => stage.sourceHallId);
  try { sessionStorage.setItem(PUBLIC_KEY, JSON.stringify(previousPublicHalls)); } catch { /* Storage is optional. */ }
  catalogue.aisles = catalogue.halls.flatMap(hall => hall.id === PUBLIC_HALL
    ? publicShowcase.aisles : catalogue.aisles.filter(aisle => aisle.hall === hall.id));
  byBooth.clear();
  for (const stage of catalogue.stages.filter(stage => stage.hallId !== PUBLIC_HALL)) byBooth.set(stage.boothId, stage);
  for (const stage of publicShowcase.stages) byBooth.set(stage.boothId, stage);
}

const stageRoot = '/puma_oshen_wave/stage/';
const hallUrl = id => `${stageRoot}halls/${encodeURIComponent(id)}/`;
function stageUrl(id) {
  return new URL(`${stageRoot}videos/${encodeURIComponent(id)}/`, location.origin).href;
}
function updateMetadata(stage = null) {
  const hall = currentHall();
  const title = stage ? `${stage.title}｜${stage.creator}｜洋流舞台` : hall ? `${hall.name}｜洋流舞台` : '洋流舞台｜我們的洋流地圖';
  const description = stage ? `${stage.creator}的《${stage.title}》。${stage.description || '在洋流舞台觀看影片與探索作者作品。'}` : hall ? `走進${hall.name}，在洋流舞台探索影片與作者作品。` : '走進洋流舞台，點一座舞台，看一部影片。';
  const path = stage ? `${stageRoot}videos/${encodeURIComponent(stage.id)}/` : location.pathname === stageRoot ? stageRoot : hall ? hallUrl(hall.id) : stageRoot;
  const canonical = new URL(path, 'https://minicourse.dev').href;
  document.title = title;
  document.querySelector('link[rel="canonical"]').href = canonical;
  for (const [selector, value] of [['meta[name="description"]', description], ['meta[property="og:title"]', title], ['meta[property="og:description"]', description], ['meta[property="og:url"]', canonical]]) document.querySelector(selector).content = value;
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
  $('list-title').textContent = `${hall.name}｜${hallId === PUBLIC_HALL ? '本次精選' : '影片列表'}`;
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
  if (navigate) history.pushState(null, '', hallUrl(hallId) + (next === 'walk' ? `#/walk/${catalogue.aisles[aisleIndex].code}` : `#/${next}/${hallId}`));
  updateMetadata();
}

function goToAisle(index, boothId = null, from = null) {
  if (!catalogue.aisles[index]) return;
  if (catalogue.aisles[index].hall === PUBLIC_HALL && hallId !== PUBLIC_HALL) {
    refreshPublicShowcase();
    index = catalogue.aisles.findIndex(aisle => aisle.hall === PUBLIC_HALL);
  }
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
  if (restore && (location.hash.startsWith('#/stage/') || location.pathname.includes('/stage/videos/'))) history.replaceState(null, '', returnHash);
  updateMetadata();
}

function openCreator(stage) {
  if (!stage) return;
  $('creator-title').textContent = stage.creator || '作者資訊';
  $('creator-socials').replaceChildren(...stage.socials.map(social => {
    const link = make('a', social.label, 'btn btn-primary');
    link.href = social.url;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `開啟 ${stage.creator} 的 ${social.label}（另開分頁）`);
    return link;
  }));
  $('creator-empty').hidden = stage.socials.length > 0;
  if (!creatorDialog.open) creatorDialog.showModal();
  creatorDialog.querySelector('.dlg-close').focus();
}

function openStage(stage, navigate = true, continuous = false) {
  if (!stage) return;
  if (!continuous) continuousIndex = -1;
  if (navigate && !current) returnHash = hallUrl(hallId) + (location.hash || '#/walk');
  stopPlayer();
  current = stage;
  $('video-title').textContent = stage.title;
  $('video-creator').textContent = stage.creator;
  $('video-creator').hidden = !stage.creator;
  $('video-creator').setAttribute('aria-label', `查看 ${stage.creator} 的社群連結`);
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
  updateMetadata(stage);
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
    const creator = make('p', undefined, 'muted creator-meta');
    const profile = make('button', stage.creator, 'creator-name');
    profile.type = 'button'; profile.setAttribute('aria-label', `查看 ${stage.creator} 的社群連結`);
    profile.addEventListener('click', () => openCreator(stage));
    creator.append(profile);
    if (stage.permission) creator.append(make('span', '原作者許可', 'permission-tag'));
    card.append(poster, make('h2', stage.title), creator, make('p', stage.boothId, 'mono'), watch);
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
  let [next, target] = location.hash.replace(/^#\/?/, '').split('/');
  const path = location.pathname.match(/^\/puma_oshen_wave\/stage\/(videos|halls)\/([^/]+)\/?$/);
  if (!next && path) { next = path[1] === 'videos' ? 'stage' : 'hall'; target = decodeURIComponent(path[2]); }
  if (creatorDialog.open) creatorDialog.close();
  closeVideo(false);
  if (next === 'stage') {
    const stage = byId.get(target);
    if (stage) {
      const index = catalogue.aisles.findIndex(aisle => stage.hallId === PUBLIC_HALL ? aisle.hall === PUBLIC_HALL : aisle.code === stage.aisleCode);
      goToAisle(index, stage.hallId === PUBLIC_HALL ? null : stage.boothId);
      returnHash = hallUrl(hallId) + `#/walk/${catalogue.aisles[aisleIndex].code}`;
      openStage(stage, false);
      return;
    }
    toast('找不到這座舞台，影片可能已下架。');
  }
  if (next === 'hall') {
    const index = catalogue.aisles.findIndex(aisle => aisle.hall === target);
    return goToAisle(index < 0 ? 0 : index);
  }
  if (next === 'list' || next === 'map') {
    const index = catalogue.aisles.findIndex(aisle => aisle.hall === target);
    if (index >= 0) goToAisle(index);
    return setMode(next, false);
  }
  if (!target && (!next || next === 'walk')) {
    if (hallId === PUBLIC_HALL) hallId = null;
    return goToAisle(0);
  }
  const index = catalogue.aisles.findIndex(aisle => aisle.code === target?.split('-')[0]);
  goToAisle(index < 0 ? aisleIndex : index, byBooth.has(target) ? target : null);
}

async function boot() {
  catalogue = await loadCatalogue();
  $('hall-select').replaceChildren(...catalogue.halls.map(hall => {
    const option = make('option', hall.name);
    option.value = hall.id;
    return option;
  }));
  $('hall-select').disabled = false;
  $('hall-select').addEventListener('change', () => selectHall($('hall-select').value));
  for (const stage of catalogue.stages) { byBooth.set(stage.boothId, stage); byId.set(stage.id, stage); }
  const busy = () => dialog.open || creatorDialog.open || mode !== 'walk';
  walk = createWalkView($('walk-canvas'), {
    display: 'stage', visited: id => visited.has(byBooth.get(id)?.id),
    onNear: id => {
      nearId = id;
      $('btn-watch').disabled = !id;
      $('btn-watch').textContent = id ? '觀看影片' : '靠近舞台看影片';
    },
    onOpen: id => { if (!busy()) openStage(byBooth.get(id)); },
    onCreator: id => { if (!busy()) openCreator(byBooth.get(id)); },
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
  $('video-creator').addEventListener('click', () => openCreator(current));
  creatorDialog.querySelector('.dlg-close').addEventListener('click', () => creatorDialog.close());
  creatorDialog.addEventListener('click', event => { if (event.target === creatorDialog) creatorDialog.close(); });
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
  window.addEventListener('popstate', () => { if (!location.hash) route(); });
  window.addEventListener('pagehide', stopPlayer);
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
