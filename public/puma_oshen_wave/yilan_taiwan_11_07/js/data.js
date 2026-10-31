// Build the walk, map and search views from one shared designer.json response.
import { CONFIG } from './config.js?v=20261031-yilan-zones';

const HALL = { code: 'O', name: '宜蘭暖流市集' };
const DEFAULT_ZONE = '其他攤位';
const PER_ISLAND = 8;
const PER_AISLE = PER_ISLAND * 2;
const pad2 = n => String(n).padStart(2, '0');

// Relative images belong to the source catalogue, even when this app moves.
function imageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, CONFIG.DESIGNERS_URL);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
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

  // Each poster category has its own virtual aisles; never mix categories in one aisle.
  const groups = new Map();
  for (const designer of designers) {
    const name = typeof designer.category === 'string' && designer.category.trim() ? designer.category : DEFAULT_ZONE;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(designer);
  }
  const zones = [...groups].map(([name, members], index) => ({ code: `Z${pad2(index + 1)}`, name, members }));
  const chunks = [];
  for (const zone of zones) {
    for (let start = 0; start < zone.members.length; start += PER_AISLE) {
      chunks.push({ zone, members: zone.members.slice(start, start + PER_AISLE) });
    }
  }
  // Keep an empty aisle so navigation still works for an empty catalogue.
  if (!chunks.length) chunks.push({ zone: {code: 'Z00', name: DEFAULT_ZONE}, members: [] });
  for (const [index, {zone, members}] of chunks.entries()) {
    const code = `${HALL.code}${pad2(index + 1)}`;
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
        social, address: designer.address || '', locationSource: externalUrl(designer.locationSource), locationNote: designer.locationNote || '', partners: (designer.partners || []).map(partner => ({ name: partner.name, social: Object.fromEntries(Object.entries(partner.social || {}).map(([key, value]) => [key, externalUrl(value)])), address: partner.address || '', locationSource: externalUrl(partner.locationSource), locationNote: partner.locationNote || '', avatar: partner.logo?.status === 'verified' ? imageUrl(partner.logo.url) : '' })), verification: designer.verification === true, booths: 1,
      };
      search.push([id, designer.name, designer.name, zone.name, HALL.code, '']);
      return {
        id, pos: pos % PER_ISLAND, store: designer.id,
        corner: pos % PER_ISLAND === 0 || pos % PER_ISLAND === PER_ISLAND - 1 || pos === members.length - 1,
        zone: zone.code, zoneName: zone.name, type: '',
        works, total: works.length, also: [],
      };
    });
    const islands = ['N', 'S'].map((side, i) => ({
      side, zone: zone.code, zoneName: zone.name,
      booths: booths.slice(i * PER_ISLAND, (i + 1) * PER_ISLAND),
    })).filter(island => island.booths.length);
    aisles.set(code, { code, hall: HALL.code, hallName: HALL.name, islands, stores });
    summaries.push({
      code, booths: booths.length, zones: booths.length ? [zone.name] : [],
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
        zones: zones.map(zone => ({ code: zone.code, name: zone.name, booths: zone.members.length, aisles: summaries.filter(a => a.zones.includes(zone.name)).map(a => a.code) })),
      }],
      totals: { designers: designers.length },
    },
    aisles, search, designerBooths,
  };
}

let catalogue = null;
function loadCatalogue() {
  if (!catalogue) {
    catalogue = fetch(new URL('../../yilan_taiwan_11_07.json', import.meta.url), { credentials: 'omit', cache: 'no-store' })
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
