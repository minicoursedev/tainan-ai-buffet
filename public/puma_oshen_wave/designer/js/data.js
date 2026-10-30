// Build the walk, map and search views from one shared designer.json response.
import { CONFIG } from './config.js?v=20261030-site-data';

const HALL = { code: 'O', name: '設計師館' };
const ZONE = { code: 'DESIGNERS', name: '設計師' };
const PER_ISLAND = 8;
const PER_AISLE = PER_ISLAND * 2;
const pad2 = n => String(n).padStart(2, '0');

// Relative images belong to the source catalogue, even when this app moves.
function imageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, CONFIG.DESIGNERS_URL);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function externalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

// Image provenance is not a product page. Uploaded files stay non-clickable.
function productLink(product) {
  const source = externalUrl(product?.source);
  if (!source) return '';
  const url = new URL(source);
  if (source === product?.url || source === product?.originalUrl
    || /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(url.pathname)
    || /(^|\.)(?:discordapp\.(?:com|net)|discord\.com|fbcdn\.net|cdninstagram\.com)$/.test(url.hostname)) return '';
  return source;
}

export function createCatalogue(data) {
  if (!Array.isArray(data?.designers)) throw new Error('Invalid designer list');
  const ids = new Set();
  for (const designer of data.designers) {
    if (!designer || typeof designer.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(designer.id)
      || ids.has(designer.id) || typeof designer.name !== 'string' || !designer.name.trim()) {
      throw new Error('Invalid designer record');
    }
    ids.add(designer.id);
  }
  const designers = data.designers.filter(d => d.disabled !== true);
  const aisles = new Map();
  const designerBooths = new Map();
  const summaries = [];
  const search = [];

  // Keep one empty aisle so the app also works before any designers are listed.
  for (let start = 0; start < Math.max(1, designers.length); start += PER_AISLE) {
    const code = `${HALL.code}${pad2(start / PER_AISLE + 1)}`;
    const members = designers.slice(start, start + PER_AISLE);
    const stores = {};
    const booths = members.map((designer, pos) => {
      const id = `${code}-${pad2(pos + 1)}`;
      designerBooths.set(designer.id, id);
      const social = Object.fromEntries(Object.entries(designer.social || {})
        .map(([key, value]) => [key, externalUrl(value)]));
      const works = (Array.isArray(designer.productImages) ? designer.productImages : [])
        .map((product, i) => ({
          id: `${designer.id}-${i + 1}`,
          name: typeof product?.alt === 'string' && product.alt.trim() ? product.alt : `${designer.name} 作品參考 ${i + 1}`,
          cover: imageUrl(product?.url),
          video: imageUrl(product?.videoUrl),
          url: productLink(product),
        })).filter(work => work.cover);
      stores[designer.id] = {
        id: designer.id, name: designer.name, owner: designer.name,
        avatar: designer.logo?.status === 'verified' ? imageUrl(designer.logo.url) : '',
        avatarFit: designer.logo?.fit === 'contain' ? 'contain' : 'cover',
        productsUrl: imageUrl(designer.productsUrl),
        social, verification: designer.verification === true, booths: 1,
      };
      search.push([id, designer.name, designer.name, ZONE.name, HALL.code, '']);
      return {
        id, pos: pos % PER_ISLAND, store: designer.id,
        corner: pos % PER_ISLAND === 0 || pos % PER_ISLAND === PER_ISLAND - 1 || pos === members.length - 1,
        zone: ZONE.code, zoneName: ZONE.name, type: '',
        works, total: works.length, also: [],
      };
    });
    const islands = ['N', 'S'].map((side, i) => ({
      side, zone: ZONE.code, zoneName: ZONE.name,
      booths: booths.slice(i * PER_ISLAND, (i + 1) * PER_ISLAND),
    })).filter(island => island.booths.length);
    aisles.set(code, { code, hall: HALL.code, hallName: HALL.name, islands, stores });
    summaries.push({
      code, booths: booths.length, zones: booths.length ? [ZONE.name] : [],
      islands: islands.map(island => ({
        side: island.side, zone: island.zone, n: island.booths.length,
        corners: island.booths.map(booth => booth.corner),
      })),
    });
  }
  return {
    index: {
      halls: [{
        ...HALL, aisles: summaries,
        zones: designers.length ? [{ ...ZONE, booths: designers.length, aisles: summaries.map(a => a.code) }] : [],
      }],
      totals: { designers: designers.length },
    },
    aisles, search, designerBooths,
  };
}

let catalogue = null;
function loadCatalogue() {
  if (!catalogue) {
    catalogue = fetch(new URL('../../designer.json', import.meta.url), { credentials: 'omit', cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error(`Could not load designer.json: HTTP ${response.status}`);
        return response.json();
      }).then(createCatalogue)
      .catch(error => { catalogue = null; throw error; });
  }
  return catalogue;
}

export const aisleOfBooth = boothId => boothId.split('-')[0];
export const hallOf = code => code[0];
export const loadIndex = async () => (await loadCatalogue()).index;
export const loadBoothForDesigner = async id => (await loadCatalogue()).designerBooths.get(id) || null;
export async function loadAisle(code) {
  const aisle = (await loadCatalogue()).aisles.get(code);
  if (!aisle) throw Object.assign(new Error('Aisle not found'), { status: 404 });
  return aisle;
}
export const loadSearch = async () => (await loadCatalogue()).search;
