export const designerRoot = '/puma_oshen_wave/designer/';
export const designerPath = id => `${designerRoot}profiles/${encodeURIComponent(id)}/`;
export function designerBoothUrl(id, base = typeof location === 'undefined' ? 'https://minicourse.dev/' : location.href) {
  return new URL(designerPath(id), base).href;
}
export function updateDesignerMetadata(designer = null) {
  const title = designer ? `${designer.name}｜洋流設計師` : '洋流設計師';
  const description = designer ? `認識${designer.name}，查看作品與官方社群，走進洋流設計師市集探索更多創作。` : '認識洋流設計師、探索設計師地圖。';
  const canonical = new URL(designer ? designerPath(designer.id) : designerRoot, 'https://minicourse.dev').href;
  document.title = title;
  document.querySelector('link[rel="canonical"]').href = canonical;
  for (const [selector, value] of [['meta[name="description"]', description], ['meta[property="og:title"]', title], ['meta[property="og:description"]', description], ['meta[property="og:url"]', canonical], ['meta[name="twitter:title"]',title], ['meta[name="twitter:description"]',description]]) document.querySelector(selector).content = value;
}
