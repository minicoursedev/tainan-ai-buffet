import { thumbnailUrl } from '../images.js';
import { designerBoothUrl, designerRoot } from '../routes.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);
// only http(s) links from the data go into href/src
function safeUrl(u) {
  if (!u) return '';
  try {
    const url = new URL(u, 'https://minicourse.dev/puma_oshen_wave/yilan_taiwan_11_07/');
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}

const closeBtn = '<button type="button" class="dlg-close" aria-label="關閉">×</button>';

export function loadingHtml(boothId) {
  return `
    <div class="dlg-head"><h2 id="booth-title">${esc(boothId)}</h2>${closeBtn}</div>
    <div class="dlg-body"><p class="bo-note">攤位資料載入中。</p></div>`;
}

export function failHtml(boothId, text) {
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

export function boothHtml(booth, store) {
  const storeUrl = safeUrl(store?.url);
  const linksFor = social => [['fb', 'Facebook'], ['threads', 'Threads'], ['ig', 'Instagram'], ['web', '網站']]
    .map(([key, label]) => {
      const url = safeUrl(social?.[key]);
      return url ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : '';
    }).join('');
  const locationFor = item => {
    if (!item?.address) return '';
    const url = safeUrl(item.locationSource);
    return `<p class="yl-address">地址：${esc(item.address)} ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">地圖</a>` : ''}</p>${item.locationNote ? `<p class="yl-location-note">${esc(item.locationNote.replace(/地址來源：https?:\/\/\S+$/, ''))}</p>` : ''}`;
  };
  const partners = Array.isArray(store?.partners) ? store.partners : [];
  const socialLinks = partners.length ? '' : linksFor(store?.social);
  const partnerHtml = partners.length ? `<section class="yl-partners" aria-label="共同攤位品牌">${partners.map(partner => {
    const logo = safeUrl(partner.avatar);
    return `<div class="yl-partner"><div class="yl-partner-heading">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy">` : ''}<h3>${esc(partner.name)}</h3></div>${locationFor(partner)}<div class="yl-links">${linksFor(partner.social)}</div></div>`;
  }).join('')}</section>` : locationFor(store);
  const avatar = safeUrl(store?.avatar);
  const name = store?.name || '攤位';
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
        <p class="bo-owner">${store?.owner ? `攤商 ${esc(store.owner)}` : ''}</p>
        <p class="bo-meta">
          <span class="tag mono">${esc(booth.id)}</span>
          ${where.map((t, i) => `<span class="tag${i === 0 ? ' tag-zone' : ''}" data-category="${esc(t)}">${esc(t)}</span>`).join('')}
          ${store?.corp ? '<span class="tag bo-corp">法人</span>' : ''}
        </p>
      </div>
      ${closeBtn}
    </div>
    <div class="dlg-body bo-body">
      ${booth.productsError ? '<p class="bo-note" role="status">產品清單暫時無法載入，目前顯示預覽圖片，請稍後重新開啟。</p>' : ''}
      ${partnerHtml}
      ${works.length ? `<ul class="bo-works">
        ${works.map(workHtml).join('')}
        ${more > 0 ? `<li>${storeUrl
          ? `<a class="bo-work bo-more" href="${esc(storeUrl)}" target="_blank" rel="noopener"><span class="bo-more-n">還有 ${more} 部</span><span>看攤位</span></a>`
          : `<span class="bo-work bo-more"><span class="bo-more-n">還有 ${more} 部</span></span>`}</li>` : ''}
      </ul>` : ''}
      ${alsoHtml}
    </div>
    <div class="bo-foot">
      ${socialLinks}
      <a class="btn" href="${esc(designerRoot)}#/map/${encodeURIComponent(booth.store)}">看看地圖</a>
      ${storeUrl ? `<a class="btn btn-primary" href="${esc(storeUrl)}" target="_blank" rel="noopener">看攤位</a>` : ''}
      <span class="bo-count muted">${booth.randomSelection ? `本次顯示 ${works.length} / 共 ${Number(booth.total) || 0} 張` : works.length ? `共 ${Number(booth.total) || works.length} 部作品` : ''}</span>
      <div class="bo-share">
        <button type="button" class="btn" data-copy-booth="${esc(designerBoothUrl(booth.store))}">複製攤位連結</button>
        <span class="bo-share-status muted" role="status"></span>
      </div>
    </div>`;
}
