// 設計師列表模式 <main id="stage-list">: filter the search rows in memory, render 60 cards at a time,
// Fill each card’s logo and product images as it scrolls into view.
import { state, toast, findBoothIn } from '../state.js';
import { loadSearch, loadAisle, aisleOfBooth } from '../data.js?v=20261030-site-data';
import { goToBooth } from '../nav.js?v=20261030-site-data';
import { openBooth } from './booth.js?v=20261031-social-buttons';
import { thumbnailUrl, retryOriginal } from '../images.js';

const PAGE = 60;
const TYPES = ['漫畫', '插圖', '小說', '攝影', '有聲'];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n || 0).toLocaleString('zh-TW');
const norm = s => String(s || '').toLowerCase().normalize('NFKC');

export function mountList(container) {
  const f = { hall: '', zone: '', types: new Set(), q: '' };
  let rows = null;      // Search rows from designer.json
  let results = [];
  let shown = 0;
  let loading = null;

  const halls = () => state.index?.halls || [];
  const hallName = code => halls().find(h => h.code === code)?.name || code;

  container.innerHTML = `
    <div class="ls-wrap">
      <h1 class="ls-title">設計師列表</h1>
      <form class="ls-filters" role="search">
        <label class="ls-search"><span class="ls-sr">搜尋</span>
          <input type="search" name="q" placeholder="搜尋設計師名稱、攤位編號" autocomplete="off" enterkeyhint="search"></label>
        <div class="ls-line">
          <div class="ls-chips" role="group" aria-label="館">
            <button type="button" class="chip" data-hall="" aria-pressed="true">全部館</button>
            ${halls().map(h => `<button type="button" class="chip" data-hall="${h.code}" aria-pressed="false">${esc(h.name)}</button>`).join('')}
          </div>
          <label class="ls-zone"><span>區</span><select name="zone" disabled><option value="">全部區</option></select></label>
        </div>
        <div class="ls-line">
          <div class="ls-chips" role="group" aria-label="作品類型">
            ${TYPES.map(t => `<button type="button" class="chip" data-type="${t}" aria-pressed="false">${t}</button>`).join('')}
          </div>
        </div>
      </form>
      <div class="ls-summary" aria-live="polite">
        <b class="ls-count">讀取中</b><span class="ls-cond"></span>
        <button type="button" class="link-btn ls-clear" hidden>清除篩選</button>
      </div>
      <div class="ls-grid"></div>
      <p class="ls-empty" hidden>沒有符合的設計師。換個關鍵字，或少選一點條件。</p>
      <div class="ls-more"><button type="button" class="btn" hidden>再多 60 攤</button></div>
    </div>`;

  const $ = sel => container.querySelector(sel);
  const grid = $('.ls-grid');
  const input = $('input[name="q"]');
  const zoneSel = $('select[name="zone"]');
  const moreBtn = $('.ls-more .btn');
  const sentinel = $('.ls-more');

  // ---------- rows
  const toRow = r => ({
    id: r[0], store: r[1] || '', owner: r[2] || '', zone: r[3] || '', hall: r[4] || r[0][0], type: r[5] || '',
    hay: norm([r[0], r[1], r[2], r[3]].join(' ')),
  });

  async function ensureRows() {
    if (!rows) rows = (await loadSearch()).map(toRow);
  }

  function filterRows() {
    const q = norm(input.value.trim());
    const words = q ? q.split(/\s+/) : [];
    results = rows.filter(r =>
      (!f.hall || r.hall === f.hall) &&
      (!f.zone || r.zone === f.zone) &&
      (!f.types.size || f.types.has(r.type)) &&
      words.every(w => r.hay.includes(w)));
  }

  // ---------- filters UI
  function fillZones() {
    const hall = halls().find(h => h.code === f.hall);
    zoneSel.disabled = !hall;
    const names = [];
    if (hall) {
      for (const z of hall.zones) {
        if (!names.includes(z.name)) names.push(z.name);
      }
    }
    if (!names.includes(f.zone)) f.zone = '';
    zoneSel.innerHTML = `<option value="">全部區</option>` + names.map(n => `<option value="${esc(n)}"${n === f.zone ? ' selected' : ''}>${esc(n)}</option>`).join('');
  }

  function summary() {
    $('.ls-count').textContent = `共 ${fmt(results.length)} 攤`;
    const parts = [];
    parts.push(f.hall ? hallName(f.hall) : '全部館');
    if (f.zone) parts.push(f.zone);
    if (f.types.size) parts.push(TYPES.filter(t => f.types.has(t)).join('、'));
    const q = input.value.trim();
    if (q) parts.push(`搜尋「${q}」`);
    $('.ls-cond').textContent = parts.join('・');
    $('.ls-clear').hidden = !(f.hall || f.zone || f.types.size || q);
  }

  // ---------- cards
  const coverIO = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      coverIO.unobserve(e.target);
      fillCovers(e.target);
    }
  }, { root: container, rootMargin: '400px 0px' });

  const moreIO = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting) && !container.hidden) renderMore();
  }, { root: container, rootMargin: '600px 0px' });
  moreIO.observe(sentinel);

  function cardHtml(r) {
    const where = r.zone;
    return `<article class="lc" data-id="${esc(r.id)}">
      <div class="lc-heading"><span class="lc-logo lc-cv" aria-hidden="true"></span><h3 class="lc-name"><button type="button" class="lc-open">${esc(r.store)}</button></h3></div>
      <div class="lc-covers" aria-hidden="true"></div>
      <div class="lc-meta"><span class="lc-id mono">${esc(r.id)}</span>${r.type ? `<span class="lc-type">${esc(r.type)}</span>` : ''}</div>
      <p class="lc-owner">設計師 ${esc(r.owner)}</p>
      <p class="lc-zone">${esc(hallName(r.hall))}・${esc(where)}</p>
      <button type="button" class="btn lc-go">看設計師</button>
    </article>`;
  }

  function renderMore() {
    if (shown >= results.length) return;
    const next = results.slice(shown, shown + PAGE);
    shown += next.length;
    grid.insertAdjacentHTML('beforeend', next.map(cardHtml).join(''));
    const cards = grid.children;
    for (let i = cards.length - next.length; i < cards.length; i++) coverIO.observe(cards[i]);
    moreBtn.hidden = shown >= results.length;
    moreBtn.textContent = `再多 ${Math.min(PAGE, results.length - shown)} 攤`;
  }

  function slotFill(slot, w) {
    slot.classList.remove('is-none', 'is-blank', 'is-loaded');
    slot.textContent = '';
    if (!w) { slot.classList.add('is-none'); return; }
    if (!w.cover) { slot.classList.add('is-blank'); return; }
    const img = new Image();
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer-when-downgrade';
    img.onload = () => slot.classList.add('is-loaded');
    img.onerror = () => { if (retryOriginal(img)) return; img.remove(); slot.classList.add('is-blank'); };
    img.dataset.original = w.cover;
    img.src = thumbnailUrl(w.cover);
    slot.append(img);
  }

  async function fillCovers(card) {
    const id = card.dataset.id;
    const code = aisleOfBooth(id);
    let booth = null;
    let aisle;
    try {
      aisle = await loadAisle(code);
      booth = findBoothIn(aisle, id);
    } catch { return; }
    if (!booth || !card.isConnected) return;
    const avatar = aisle.stores[booth.store]?.avatar;
    const logo = card.querySelector('.lc-logo');
    logo.hidden = !avatar;
    if (avatar) slotFill(logo, { cover: avatar });
    const covers = card.querySelector('.lc-covers');
    const works = booth.works || [];
    covers.hidden = !works.length;
    for (const work of works) {
      const slot = document.createElement('span');
      slot.className = 'lc-cv';
      covers.append(slot);
      slotFill(slot, work);
    }
    card.dataset.filled = '1';
  }

  // ---------- refresh
  async function refresh({ keepScroll = false } = {}) {
    const p = (loading = (async () => { await ensureRows(); })());
    try { await p; } catch {
      $('.ls-count').textContent = '讀取失敗';
      toast('設計師資料讀取失敗，請重新整理再試一次');
      return;
    }
    if (p !== loading) return;
    filterRows();
    container.querySelector('[aria-label="作品類型"]').hidden = !rows.some(row => row.type);
    summary();
    for (const c of grid.children) coverIO.unobserve(c);
    grid.textContent = '';
    shown = 0;
    if (!keepScroll) container.scrollTop = 0;
    $('.ls-empty').hidden = results.length > 0;
    $('.ls-empty').textContent = rows.length ? '沒有符合的設計師。換個關鍵字，或少選一點條件。' : '目前尚無設計師資料。';
    renderMore();
  }

  // ---------- events
  $('.ls-filters').addEventListener('submit', e => e.preventDefault());
  let timer = 0;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => refresh(), 140); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(timer); refresh(); input.blur(); } });

  container.addEventListener('click', e => {
    const t = e.target;
    const hallChip = t.closest('[data-hall]');
    if (hallChip && container.contains(hallChip)) {
      f.hall = hallChip.dataset.hall;
      for (const b of container.querySelectorAll('[data-hall]')) b.setAttribute('aria-pressed', String(b === hallChip));
      fillZones();
      return refresh();
    }
    const typeChip = t.closest('[data-type]');
    if (typeChip) {
      const ty = typeChip.dataset.type;
      if (f.types.has(ty)) f.types.delete(ty); else f.types.add(ty);
      typeChip.setAttribute('aria-pressed', String(f.types.has(ty)));
      return refresh();
    }
    if (t.closest('.ls-clear')) {
      f.hall = ''; f.zone = ''; f.types.clear(); input.value = '';
      for (const b of container.querySelectorAll('[data-hall],[data-type]')) b.setAttribute('aria-pressed', String(b.dataset.hall === ''));
      fillZones();
      return refresh();
    }
    if (t.closest('.ls-more .btn')) return renderMore();
    const card = t.closest('.lc');
    if (!card) return;
    const id = card.dataset.id;
    if (t.closest('.lc-go')) {
      document.querySelector('.modes button[data-mode="walk"]')?.click();
      goToBooth(id);
      return;
    }
    if (t.closest('.lc-open') || !t.closest('button, a')) openBooth(id);
  });

  zoneSel.addEventListener('change', () => { f.zone = zoneSel.value; refresh(); });
  return {
    show() {
      fillZones();
      if (!rows) refresh();
    },
    hide() {
      clearTimeout(timer);
    },
  };
}
