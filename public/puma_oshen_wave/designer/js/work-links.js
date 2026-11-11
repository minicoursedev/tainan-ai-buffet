// Work links use the stored work ID, independently of the image URL and booth order.
const root = '/puma_oshen_wave/designer/';
export const designerWorkPath = (designerId, workId) => `${root}profiles/${encodeURIComponent(designerId)}/works/${encodeURIComponent(workId)}/`;
export const designerWorkUrl = (designerId, workId, base = typeof location === 'undefined' ? 'https://minicourse.dev/' : location.href) => new URL(designerWorkPath(designerId, workId), base).href;

export function inlineWorkId(designerId, product) {
  if (typeof product?.id === 'string' && product.id.trim()) return product.id.trim();
  // Older catalogue snapshots only have image URLs.
  let url;
  try { url = new URL(product?.url || '', 'https://minicourse.dev/puma_oshen_wave/designer.json'); }
  catch { return ''; }
  const filename = url.pathname.match(new RegExp(`/assets/${designerId}/([a-z0-9-]+)\\.[a-z0-9]+$`, 'i'))?.[1];
  if (filename) return `${designerId}-${filename}`;
  // Reordering a work or changing its cache version keeps the same work URL.
  let hash = 2166136261;
  for (const character of url.origin + url.pathname) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${designerId}-work-${(hash >>> 0).toString(16)}`;
}

/** @param {unknown} retiredIds */
export function validateWorkIds(designerId, works, retiredIds = []) {
  const ids = new Set();
  if (!Array.isArray(retiredIds)) throw new Error(`Invalid retired work IDs for ${designerId}`);
  for (const id of [...retiredIds, ...works.map(work => work?.id)]) {
    if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      throw new Error(`Missing or invalid work ID for ${designerId}`);
    }
    if (ids.has(id)) throw new Error(`Duplicate or retired work ID for ${designerId}: ${id}`);
    ids.add(id);
  }
}
