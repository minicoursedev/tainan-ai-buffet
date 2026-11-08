import { designerMetadata, designerStructuredData, serializeStructuredData, publicUrl } from './profile-seo.js';
import { hallPageForCode, hallPageForPath } from './hall-pages.js?v=20261108-amateur-og';

export const designerRoot = '/puma_oshen_wave/designer/';
export const designerPath = id => `${designerRoot}profiles/${encodeURIComponent(id)}/`;
export const designerHallRoot = code => hallPageForCode(code)?.path || designerRoot;
export { hallPageForPath };
export function designerWalkPath(code, boothId = null) {
  const root = designerHallRoot(code?.[0]);
  return code === 'A01' && !boothId ? root : `${root}#/walk/${boothId || code || ''}`;
}
export function designerBoothUrl(id, base = typeof location === 'undefined' ? 'https://minicourse.dev/' : location.href) {
  return new URL(designerPath(id), base).href;
}
// A shared profile URL owns the initial view, even with a stale walk hash.
export function resolveDesignerRoute(url, { boot = false } = {}) {
  const [mode, target, then] = url.hash.replace(/^#\/?/, '').split('/');
  const profile = url.pathname.match(/^\/puma_oshen_wave\/designer\/profiles\/([^/]+)\/?$/);
  if (profile && (boot || !mode)) {
    return { mode: 'designer', target: decodeURIComponent(profile[1]) };
  }
  const hall = hallPageForPath(url.pathname);
  if (hall && !mode) return { mode: 'walk', target: `${hall.code}01`, then: undefined };
  return { mode, target, then };
}
const exhibitionImage = 'https://minicourse.dev/puma_oshen_wave/designer/assets/exhibition-og.png?v=19f09d0c7c56f7bd';
const initialPreview = typeof document === 'undefined' ? null : {
  id: document.documentElement.dataset.designerProfile,
  image: document.querySelector('meta[property="og:image"]')?.content,
  alt: document.querySelector('meta[property="og:image:alt"]')?.content,
  width: document.querySelector('meta[property="og:image:width"]')?.content,
  height: document.querySelector('meta[property="og:image:height"]')?.content,
  type: document.querySelector('meta[property="og:image:type"]')?.content,
};

export function updateDesignerMetadata(designer = null, booth = {}) {
  const metadata = designer && designerMetadata(designer);
  const hall = designer ? null : hallPageForPath(location.pathname);
  const title = metadata ? metadata.title : hall?.title || '洋流設計師｜探索設計師、創作作品與線上市集';
  const description = metadata ? metadata.description : hall?.description || '走進洋流設計師線上市集，瀏覽設計師介紹、創作作品與官方社群。透過設計師列表、地圖與互動攤位，找到喜歡的創作者。';
  const canonical = new URL(designer ? designerPath(designer.id) : hall?.path || designerRoot, 'https://minicourse.dev').href;
  document.title = title;
  document.querySelector('link[rel="canonical"]').href = canonical;
  for (const [attribute, key, value] of [['name', 'description', description], ['property', 'og:title', title], ['property', 'og:description', description], ['property', 'og:url', canonical], ['name', 'twitter:title', title], ['name', 'twitter:description', description]]) {
    let tag = document.querySelector(`meta[${attribute}="${key}"]`);
    if (!value) { tag?.remove(); continue; }
    if (!tag) { tag = document.createElement('meta'); tag.setAttribute(attribute, key); document.head.append(tag); }
    tag.content = value;
  }
  const preview = designer?.og ? { ...designer.og, image: designer.og.url } : designer && initialPreview?.id === designer.id ? initialPreview : designer && publicUrl(designer.avatar)
    ? { image: publicUrl(designer.avatar) } : hall || { image: exhibitionImage, width: '2622', height: '1206', type: 'image/png' };
  const imageAlt = preview.alt || (designer && publicUrl(designer.avatar) ? `${designer.name}的頭像` : '洋流設計師展逛攤畫面');
  document.querySelector('meta[name="twitter:card"]').content = hall ? 'summary_large_image' : 'summary';
  for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) document.querySelector(selector).content = preview.image;
  for (const selector of ['meta[property="og:image:alt"]', 'meta[name="twitter:image:alt"]']) document.querySelector(selector).content = imageAlt;
  for (const key of ['width', 'height', 'type']) {
    const selector = `meta[property="og:image:${key}"]`;
    let tag = document.querySelector(selector);
    if (!preview[key]) { tag?.remove(); continue; }
    if (!tag) { tag = document.createElement('meta'); tag.setAttribute('property', `og:image:${key}`); document.head.append(tag); }
    tag.content = preview[key];
  }
  let structuredData = document.getElementById('designer-structured-data');
  if (!designer) { structuredData?.remove(); return; }
  if (!structuredData) {
    structuredData = document.createElement('script');
    structuredData.id = 'designer-structured-data';
    structuredData.type = 'application/ld+json';
    document.head.append(structuredData);
  }
  structuredData.textContent = serializeStructuredData(designerStructuredData(designer, booth, canonical, new URL(designerRoot, canonical).href));
}
