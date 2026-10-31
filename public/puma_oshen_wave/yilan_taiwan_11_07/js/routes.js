export const designerRoot = '/puma_oshen_wave/yilan_taiwan_11_07/';
export const designerPath = id => `${designerRoot}profiles/${encodeURIComponent(id)}/`;
export function designerBoothUrl(id, base = typeof location === 'undefined' ? 'https://minicourse.dev/' : location.href) {
  return new URL(designerPath(id), base).href;
}
// A shared profile URL owns the initial view, even with a stale walk hash.
export function resolveDesignerRoute(url, { boot = false } = {}) {
  const [mode, target, then] = url.hash.replace(/^#\/?/, '').split('/');
  const profile = url.pathname.match(/^\/puma_oshen_wave\/yilan_taiwan_11_07\/profiles\/([^/]+)\/?$/);
  if (profile && (boot || !mode)) {
    return { mode: 'designer', target: decodeURIComponent(profile[1]) };
  }
  return { mode, target, then };
}
export function updateDesignerMetadata(designer = null) {
  const title = designer ? `${designer.name}｜宜蘭暖流・台派市集` : '宜蘭暖流・台派市集';
  const description = designer ? `認識${designer.name}，查看作品與官方社群，走進宜蘭暖流・台派市集探索更多創作。` : '認識宜蘭暖流・台派市集、探索攤位地圖。';
  const canonical = new URL(designer ? designerPath(designer.id) : designerRoot, 'https://minicourse.dev').href;
  document.title = title;
  document.querySelector('link[rel="canonical"]').href = canonical;
  for (const [selector, value] of [['meta[name="description"]', description], ['meta[property="og:title"]', title], ['meta[property="og:description"]', description], ['meta[property="og:url"]', canonical], ['meta[name="twitter:title"]',title], ['meta[name="twitter:description"]',description]]) document.querySelector(selector).content = value;
}
