// Designer dialog: profile, catalogue images, social links and share link.
import { state, markVisited, findBoothIn, toast } from '../state.js';
import { loadAisle, aisleOfBooth } from '../data.js?v=20261030-site-data';
import { goToBooth, designerBoothUrl } from '../nav.js?v=20261030-site-data';
import { thumbnailUrl, retryOriginal } from '../images.js';
import { loadProducts, sampleProducts } from '../products.js?v=20261030-pinned-work';

const dlg = () => document.getElementById('dlg-booth');

// The designer currently shown in the dialog.
let current = null;   // { boothId, booth, aisle }
let openToken = 0;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);
// only http(s) links from the data go into href/src
function safeUrl(u) {
  if (!u) return '';
  try {
    const url = new URL(u, location.href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}

const closeBtn = '<button type="button" class="dlg-close" aria-label="關閉">×</button>';

function loadingHtml(boothId) {
  return `
    <div class="dlg-head"><h2 id="booth-title">${esc(boothId)}</h2>${closeBtn}</div>
    <div class="dlg-body"><p class="bo-note">設計師資料載入中。</p></div>`;
}

function failHtml(boothId, text) {
  return `
    <div class="dlg-head"><h2 id="booth-title">${esc(boothId)}</h2>${closeBtn}</div>
    <div class="dlg-body"><p class="bo-note">${esc(text)}</p></div>`;
}

function coverHtml(src, label, width, height) {
  const url = safeUrl(src);
  if (!url) return `<span class="bo-cover bo-cover-none" aria-hidden="true"></span>`;
  const dimensions = width > 0 && height > 0 ? ` width="${Number(width)}" height="${Number(height)}"` : '';
  return `<span class="bo-cover"><img src="${esc(thumbnailUrl(url))}" data-original="${esc(url)}" alt="${esc(label)}"${dimensions} loading="lazy" decoding="async" data-label="${esc(label)}"></span>`;
}

function workHtml(w) {
  const video = safeUrl(w.video);
  const description = w.caption ? `<span class="bo-caption">${esc(w.caption)}</span>` : '';
  if (video) return `<li><div class="bo-work"><video controls playsinline preload="metadata" poster="${esc(safeUrl(w.cover))}" aria-label="${esc(w.name)}" style="display:block;width:100%;max-height:400px" src="${esc(video)}"></video>${description}</div></li>`;
  const url = safeUrl(w.url);
  const generic = /作品(?:照片|參考)\s*\d+$/.test(w.name || '');
  const caption = generic || typeof w.caption === 'string' ? '' : `<span class="bo-name">${esc(w.name || '未命名作品')}</span>`;
  const inner = `${coverHtml(w.cover, w.name, w.width, w.height)}${caption}${description}`;
  return url
    ? `<li><a class="bo-work" href="${esc(url)}" target="_blank" rel="noopener">${inner}</a></li>`
    : `<li><span class="bo-work">${inner}</span></li>`;
}

function boothHtml(booth, store) {
  const storeUrl = safeUrl(store?.url);
  const socialLinks = [['fb', 'Facebook'], ['threads', 'Threads'], ['ig', 'Instagram'], ['web', '網站']]
    .map(([key, label]) => {
      const url = safeUrl(store?.social?.[key]);
      return url ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : '';
    }).join('');
  const avatar = safeUrl(store?.avatar);
  const name = store?.name || '設計師';
  const where = [booth.zoneName].filter(Boolean);
  const works = booth.works || [];
  const more = booth.randomSelection ? 0 : Math.max(0, (booth.total || 0) - works.length);

  const also = booth.also || [];
  const alsoHtml = also.length ? `
    <section class="bo-also" aria-label="這家也在">
      <h3>這家也在</h3>
      ${also.length ? `<div class="bo-also-list">${also.map(a => `<button type="button" class="bo-also-item" data-go="${esc(a.id)}">
        <span class="bo-also-where">${esc(a.hall)}・${esc(a.zone)}</span><span class="mono">${esc(a.id)}</span></button>`).join('')}</div>` : ''}
    </section>` : '';

  return `
    <div class="dlg-head bo-head">
      <span class="bo-avatar${store?.avatarFit === 'contain' ? ' bo-avatar-contain' : ''}${avatar ? '' : ' bo-avatar-none'}" aria-hidden="true">${avatar ? `<img src="${esc(thumbnailUrl(avatar))}" data-original="${esc(avatar)}" alt="" loading="lazy" decoding="async">` : ''}</span>
      <div class="bo-title">
        <h2 id="booth-title">${esc(name)}</h2>
        <p class="bo-owner">${store?.owner ? `設計師 ${esc(store.owner)}` : ''}</p>
        <p class="bo-meta">
          <span class="tag mono">${esc(booth.id)}</span>
          ${where.map((t, i) => `<span class="tag${i === 0 ? ' tag-zone' : ''}">${esc(t)}</span>`).join('')}
          ${store?.corp ? '<span class="tag bo-corp">法人</span>' : ''}
        </p>
      </div>
      ${closeBtn}
    </div>
    <div class="dlg-body bo-body">
      ${booth.productsError ? '<p class="bo-note" role="status">產品清單暫時無法載入，目前顯示預覽圖片，請稍後重新開啟。</p>' : ''}
      ${works.length ? `<ul class="bo-works">
        ${works.map(workHtml).join('')}
        ${more > 0 ? `<li>${storeUrl
          ? `<a class="bo-work bo-more" href="${esc(storeUrl)}" target="_blank" rel="noopener"><span class="bo-more-n">還有 ${more} 部</span><span>看設計師</span></a>`
          : `<span class="bo-work bo-more"><span class="bo-more-n">還有 ${more} 部</span></span>`}</li>` : ''}
      </ul>` : '<p class="bo-note">這攤還沒擺上作品。</p>'}
      ${alsoHtml}
    </div>
    <div class="bo-foot">
      ${socialLinks}
      ${storeUrl ? `<a class="btn btn-primary" href="${esc(storeUrl)}" target="_blank" rel="noopener">看設計師</a>` : ''}
      <span class="bo-count muted">${booth.randomSelection ? `本次顯示 ${works.length} / 共 ${Number(booth.total) || 0} 張` : works.length ? `共 ${Number(booth.total) || works.length} 部作品` : ''}</span>
      <div class="bo-share">
        <button type="button" class="btn" data-copy-booth="${esc(designerBoothUrl(booth.store))}">複製設計師連結</button>
        <span class="bo-share-status muted" role="status"></span>
      </div>
    </div>`;
}

function paint() {
  const d = dlg();
  if (!d || !current) return;
  const { booth, aisle } = current;
  const store = aisle.stores?.[booth.store] || null;
  const scroll = d.querySelector('.dlg-body')?.scrollTop || 0;
  d.innerHTML = boothHtml(booth, store);
  const body = d.querySelector('.dlg-body');
  if (body) body.scrollTop = scroll;
}

async function getAisleFor(boothId) {
  const code = aisleOfBooth(boothId);
  if (state.aisle && state.aisle.code === code) return state.aisle;
  return loadAisle(code);
}

export async function openBooth(boothId) {
  const d = dlg();
  if (!d || !boothId) return;
  const token = ++openToken;
  current = null;
  d.innerHTML = loadingHtml(boothId);
  if (!d.open) d.showModal();

  let aisle;
  try {
    aisle = await getAisleFor(boothId);
  } catch (e) {
    if (token !== openToken) return;
    d.innerHTML = failHtml(boothId, '設計師資料載入失敗，請再試一次。');
    return;
  }
  if (token !== openToken) return;
  if (!aisle) { if (d.open) d.close(); return; }
  let booth = findBoothIn(aisle, boothId);
  if (!booth) {
    d.innerHTML = failHtml(boothId, '找不到這位設計師。');
    return;
  }
  const store = aisle.stores?.[booth.store];
  if (store?.productsUrl) {
    try {
      const products = await loadProducts(store.productsUrl, booth.store);
      booth = { ...booth, works: sampleProducts(products), total: products.length, randomSelection: true };
    } catch {
      booth = { ...booth, productsError: true };
    }
    if (token !== openToken) return;
  }
  current = { boothId, booth, aisle };
  paint();
  if (!d.open) d.showModal();
  d.querySelector('.dlg-close')?.focus();
  markVisited(boothId);
}

function switchToWalk() {
  const list = document.getElementById('stage-list');
  if (list && !list.hidden) document.querySelector('.modes button[data-mode="walk"]')?.click();
}

async function copyBoothLink(button) {
  const share = button.closest('.bo-share');
  const link = button.dataset.copyBooth;
  const status = share.querySelector('[role="status"]');
  button.disabled = true;
  try {
    await navigator.clipboard.writeText(link);
    status.textContent = '設計師連結已複製';
  } catch {
    status.textContent = `無法自動複製，請複製此網址：${link}`;
  } finally {
    button.disabled = false;
  }
}

function wire() {
  const d = dlg();
  if (!d) return;
  d.addEventListener('click', e => {
    const copy = e.target.closest('[data-copy-booth]');
    if (copy) { copyBoothLink(copy); return; }
    const go = e.target.closest('[data-go]');
    if (go) {
      const id = go.dataset.go;
      d.close();
      switchToWalk();
      goToBooth(id).catch(() => toast('換設計師失敗，請再試一次'));
    }
  });
  // a cover that fails to load falls back to the halftone square
  d.addEventListener('error', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (retryOriginal(img)) return;
    const box = img.parentElement;
    if (box?.classList.contains('bo-cover')) { box.classList.add('bo-cover-none'); img.remove(); }
    else if (box?.classList.contains('bo-avatar')) { box.classList.add('bo-avatar-none'); img.remove(); }
  }, true);
  d.addEventListener('close', () => { openToken++; current = null; });
}

wire();
