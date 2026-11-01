export const designerRoot = '/puma_oshen_wave/designer/';
export const designerPath = id => `${designerRoot}profiles/${encodeURIComponent(id)}/`;
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
  return { mode, target, then };
}
export function updateDesignerMetadata(designer = null) {
  const title = designer ? `${designer.name}｜洋流設計師` : '洋流設計師｜探索設計師、創作作品與線上市集';
  const description = designer ? `認識${designer.name}，查看作品與官方社群，走進洋流設計師市集探索更多創作。` : '走進洋流設計師線上市集，瀏覽設計師介紹、創作作品與官方社群。透過設計師列表、地圖與互動攤位，找到喜歡的創作者。';
  const canonical = new URL(designer ? designerPath(designer.id) : designerRoot, 'https://minicourse.dev').href;
  document.title = title;
  document.querySelector('link[rel="canonical"]').href = canonical;
  for (const [selector, value] of [['meta[name="description"]', description], ['meta[property="og:title"]', title], ['meta[property="og:description"]', description], ['meta[property="og:url"]', canonical], ['meta[name="twitter:title"]',title], ['meta[name="twitter:description"]',description]]) document.querySelector(selector).content = value;
}
