import { thumbnailUrl } from '../images.js';
import { designerBoothUrl } from '../routes.js?v=20261108-amateur-og';
import { designerMetadata } from '../profile-seo.js';
import { designerWorkPath } from '../work-links.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);
// only http(s) links from the data go into href/src
function safeUrl(u) {
  if (!u) return '';
  try {
    const url = new URL(u, 'https://minicourse.dev/puma_oshen_wave/designer/');
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}

const closeBtn = '<button type="button" class="dlg-close" aria-label="關閉">×</button>';

export function loadingHtml(boothId) {
  return `
    <div class="dlg-head"><h2 id="booth-title">${esc(boothId)}</h2>${closeBtn}</div>
    <div class="dlg-body"><p class="bo-note">設計師資料載入中。</p></div>`;
}

export function failHtml(boothId, text) {
  return `
    <div class="dlg-head"><h2 id="booth-title">${esc(boothId)}</h2>${closeBtn}</div>
    <div class="dlg-body"><p class="bo-note">${esc(text)}</p></div>`;
}

function coverHtml(src, label, width, height, eager = false) {
  const url = safeUrl(src);
  if (!url) return `<span class="bo-cover bo-cover-none" aria-hidden="true"></span>`;
  const dimensions = width > 0 && height > 0 ? ` width="${Number(width)}" height="${Number(height)}"` : '';
  return `<span class="bo-cover"><img src="${esc(thumbnailUrl(url))}" data-original="${esc(url)}" alt="${esc(label)}"${dimensions} loading="${eager ? 'eager' : 'lazy'}"${eager ? ' fetchpriority="high"' : ''} decoding="async" data-label="${esc(label)}"></span>`;
}

function workHtml(w, index, name, profile, designerId) {
  const label = w.name?.trim() || w.caption?.trim() || `${name}作品圖片 ${index + 1}`;
  const video = safeUrl(w.video);
  const description = w.caption ? `<span class="bo-caption">${esc(w.caption)}</span>` : '';
  const path = designerWorkPath(designerId, w.id);
  const actions = `<div class="bo-work-actions"><a class="bo-work-detail" href="${esc(path)}">查看作品</a><button type="button" class="btn" data-share-work="${esc(path)}" data-work-designer="${esc(name)}" data-work-image="${esc(safeUrl(w.cover))}" data-work-label="${esc(label)}" aria-label="分享${esc(label)}" aria-haspopup="dialog" aria-controls="work-share-dialog">分享作品</button></div>`;
  if (video) return `<li><div class="bo-work"><video controls playsinline preload="metadata" poster="${esc(safeUrl(w.cover))}" aria-label="${esc(label)}" style="display:block;width:100%;max-height:400px" src="${esc(video)}"></video>${description}</div>${actions}</li>`;
  const url = safeUrl(w.url);
  // Image alternative text is not a display title; only explicit captions appear below works.
  const inner = `${coverHtml(w.cover, label, w.width, w.height, profile && index === 0)}${description}`;
  return url
    ? `<li><a class="bo-work" href="${esc(url)}" target="_blank" rel="noopener">${inner}</a>${actions}</li>`
    : `<li><span class="bo-work">${inner}</span>${actions}</li>`;
}

export function boothHtml(booth, store, { profile = false, staticProfile = false } = {}) {
  const storeUrl = safeUrl(store?.url);
  const socialLinks = [['fb', 'Facebook', 'facebook.png'], ['threads', 'Threads', 'threads.svg'], ['ig', 'Instagram', 'instagram.svg'], ['web', '官網', 'website.svg']]
    .map(([key, label, icon]) => {
      const url = safeUrl(store?.social?.[key]);
      return url ? `<a class="btn bo-social-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(store?.name)}的${label}" title="${label}"><img src="/puma_oshen_wave/yilan_taiwan_11_07/assets/buttons/${icon}" width="32" height="32" alt="" decoding="async"></a>` : '';
    }).join('');
  const genericLinks = (store?.links || []).map(link => {
    const url = safeUrl(link.url);
    return url ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(url)}">${esc(link.label)} ↗</a>` : '';
  }).join('');
  const avatar = safeUrl(store?.avatar);
  const name = store?.name || '設計師';
  const category = store?.category || '設計師';
  const heading = profile ? 'h1' : 'h2';
  const subheading = profile ? 'h2' : 'h3';
  const titleId = staticProfile ? 'static-designer-title' : 'booth-title';
  const introduction = designerMetadata(store || { name }).introduction;
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
    ${profile ? `<nav class="bo-breadcrumbs" aria-label="麵包屑導覽"><a href="/puma_oshen_wave/">洋流地圖</a><span aria-hidden="true"> › </span><a href="/puma_oshen_wave/designer/">洋流設計師</a></nav>` : ''}
    <div class="dlg-head bo-head">
      <div class="bo-identity">
      <span class="bo-avatar${store?.avatarFit === 'contain' ? ' bo-avatar-contain' : ''}${avatar ? '' : ' bo-avatar-none'}" aria-hidden="true">${avatar ? `<img src="${esc(thumbnailUrl(avatar))}" data-original="${esc(avatar)}" alt="" loading="lazy" decoding="async">` : ''}</span>
      <div class="bo-title">
        <${heading} id="${titleId}">${esc(name)}</${heading}>
        ${profile ? '' : `<p class="bo-owner">${store?.owner ? `${esc(category)} ${esc(store.owner)}` : ''}</p>`}
        <p class="bo-meta">
          <span class="tag mono">${esc(booth.id)}</span>
          ${where.map((t, i) => `<span class="tag${i === 0 ? ' tag-zone' : ''}">${esc(t)}</span>`).join('')}
          ${store?.corp ? '<span class="tag bo-corp">法人</span>' : ''}
        </p>
      </div>
      </div>
      ${staticProfile ? '' : closeBtn}
    </div>
    <div class="dlg-body bo-body">
      ${introduction ? `<section class="bo-intro" aria-label="${esc(name)}介紹">
        <${subheading}>簡介</${subheading}>
        <p>${esc(introduction)}</p>
      </section>` : ''}
      <${subheading} class="bo-section-title">作品選集</${subheading}>
      ${booth.productsError ? '<p class="bo-note" role="status">產品清單暫時無法載入，目前顯示預覽圖片，請稍後重新開啟。</p>' : ''}
      ${works.length ? `<ul class="bo-works">
        ${works.map((work, index) => workHtml(work, index, name, profile, booth.store)).join('')}
        ${more > 0 ? `<li>${storeUrl
          ? `<a class="bo-work bo-more" href="${esc(storeUrl)}" target="_blank" rel="noopener"><span class="bo-more-n">還有 ${more} 部</span><span>看設計師</span></a>`
          : `<span class="bo-work bo-more"><span class="bo-more-n">還有 ${more} 部</span></span>`}</li>` : ''}
      </ul>` : '<p class="bo-note">這攤還沒擺上作品。</p>'}
      ${alsoHtml}
    </div>
    <div class="bo-foot">
      ${socialLinks}
      ${genericLinks ? `<div class="bo-share bo-links" aria-label="通用連結">${genericLinks}</div>` : ''}
      <div class="bo-share">
        ${storeUrl ? `<a class="btn btn-primary" href="${esc(storeUrl)}" target="_blank" rel="noopener">看設計師</a>` : ''}
        <button type="button" class="btn" data-share-designer="${esc(designerBoothUrl(booth.store))}" aria-haspopup="dialog" aria-controls="designer-share-dialog">分享設計師</button>
        <span class="bo-share-status muted" role="status"></span>
      </div>
    </div>`;
}

