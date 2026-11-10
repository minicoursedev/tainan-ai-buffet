import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createCatalogue } from '../public/puma_oshen_wave/designer/js/data.js';
import { aisleNeighbors } from '../public/puma_oshen_wave/designer/js/nav.js';
import { state } from '../public/puma_oshen_wave/designer/js/state.js';
import { boothHtml } from '../public/puma_oshen_wave/designer/js/ui/booth-markup.js';
import { renderDesignerOg } from './designer-og.mjs';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { designerPath, designerBoothUrl, resolveDesignerRoute, designerWalkPath } from '../public/puma_oshen_wave/designer/js/routes.js';
import { hallPages } from '../public/puma_oshen_wave/designer/js/hall-pages.js';
import { designerMetadata, designerStructuredData, serializeStructuredData } from '../public/puma_oshen_wave/designer/js/profile-seo.js';
const read = path => readFileSync(path, 'utf8');
const raw = JSON.parse(read('public/puma_oshen_wave/designer.json'));
const catalogue = createCatalogue(raw);
const home = read('dist/puma_oshen_wave/designer/index.html');
const sitemap = read('dist/sitemap.xml');
const previewManifest = JSON.parse(read('dist/puma_oshen_wave/designer/og-images.json'));
const runtimeCatalogue = createCatalogue(raw, { ogImages: previewManifest });
const escape = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const unescape = value => value.replace(/&(amp|lt|gt|quot|apos|#39|#x27);/g,
  (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'" })[entity]);
const exhibitionImage = 'https://minicourse.dev/puma_oshen_wave/designer/assets/exhibition-og.png?v=19f09d0c7c56f7bd';
assert(home.includes(`<meta property="og:image" content="${exhibitionImage}">`), 'Exhibition share image must remain unchanged');
assert(home.includes('id="stage-loading"'), 'Entry must provide a loading state before routing');
assert(home.includes("classList.add('designer-booting')"), 'Entry must hide the fallback list before the first paint');
assert(!/<html[^>]*data-designer-profile/.test(home), 'Entry must start in loading mode');
const amateurHall = hallPages.find(hall => hall.code === 'A');
const amateurUrl = `https://minicourse.dev${amateurHall.path}`;
const amateurHtml = read(`dist${amateurHall.path}index.html`);
assert(amateurHtml.includes(`<title>${amateurHall.title}</title>`));
assert(amateurHtml.includes(`<link rel="canonical" href="${amateurUrl}">`));
assert(amateurHtml.includes(`<meta property="og:url" content="${amateurUrl}">`));
assert.equal((amateurHtml.match(/property="og:image"/g) || []).length, 1);
assert(amateurHtml.includes(`<meta property="og:image" content="${amateurHall.image}">`));
assert(amateurHtml.includes(`<meta name="twitter:image" content="${amateurHall.image}">`));
assert(amateurHtml.includes('<meta name="twitter:card" content="summary_large_image">'));
assert(sitemap.includes(`<loc>${amateurUrl}</loc>`));
const amateurImageUrl = new URL(amateurHall.image);
const amateurImage = readFileSync(`dist${amateurImageUrl.pathname}`);
const amateurDimensions = await sharp(amateurImage).metadata();
assert.deepEqual([amateurDimensions.width, amateurDimensions.height], [1200, 630]);
assert(amateurImage.length <= 100000);
assert.equal(amateurImageUrl.searchParams.get('v'), createHash('sha256').update(amateurImage).digest('hex').slice(0, 16));
for (const author of raw.designers) {
  const shouldList = author.disabled !== true && author.category === '愛好者';
  assert.equal(amateurHtml.includes(`href="${designerPath(author.id)}"`), shouldList, `Wrong hall directory entry: ${author.id}`);
}
assert.deepEqual(resolveDesignerRoute(new URL(amateurUrl), { boot: true }), { mode: 'walk', target: 'A01', then: undefined });
assert.equal(resolveDesignerRoute(new URL(amateurUrl + '#/list'), { boot: true }).mode, 'list');
assert.equal(designerWalkPath('A01'), amateurHall.path);
assert.equal(designerWalkPath('A02'), `${amateurHall.path}#/walk/A02`);
assert.equal(designerWalkPath('A01', 'A01-03'), `${amateurHall.path}#/walk/A01-03`);
assert.equal(designerWalkPath('O01'), '/puma_oshen_wave/designer/#/walk/O01');
assert.equal(designerBoothUrl('yang-liu', amateurUrl), 'https://minicourse.dev/puma_oshen_wave/designer/profiles/yang-liu/');
console.log('Verified independent amateur hall URL, static OG image, sitemap, hall directory and legacy routes.');
let count = 0;
for (const designer of raw.designers) {
  const path = designerPath(designer.id);
  if (designer.disabled === true) {
    assert(!existsSync(`dist${path}index.html`));
    assert(!sitemap.includes(`https://minicourse.dev${path}`));
    assert(!(designer.id in previewManifest));
    continue;
  }
  count++;
  const html = read(`dist${path}index.html`);
  assert(html.includes(`data-designer-profile="${designer.id}"`), 'Direct profiles must keep their static content while booting');
  const og = await renderDesignerOg(designer);
  const previewImage = og?.url || exhibitionImage;
  assert.equal((html.match(/property="og:image"/g) || []).length, 1, `Expected one explicit OG image: ${designer.id}`);
  assert(html.includes(`<meta property="og:image" content="${escape(previewImage)}">`), `Missing author OG image: ${designer.id}`);
  assert(html.includes(`<meta name="twitter:image" content="${escape(previewImage)}">`), `Missing author Twitter image: ${designer.id}`);
  if (og) {
    assert.equal(previewManifest[designer.id].url, og.url, 'Runtime share preview must match the static OG image');
    const runtimeAisle = runtimeCatalogue.aisles.get(catalogue.designerBooths.get(designer.id).split('-')[0]);
    assert.deepEqual(runtimeAisle.stores[designer.id].og, previewManifest[designer.id]);
    assert.equal(og.biography?.text || '', designer.description?.trim() || '', 'Only supplied biographies may appear in OG images');
    const generated = readFileSync(`dist/${og.relativePath}`);
    const dimensions = await sharp(generated).metadata();
    assert.deepEqual([dimensions.width, dimensions.height], [1200, 630], `Wrong OG dimensions: ${designer.id}`);
    assert(generated.equals(og.buffer), `OG image and metadata must match: ${designer.id}`);
    assert(html.includes('<meta property="og:image:width" content="1200">'));
    assert(html.includes('<meta property="og:image:height" content="630">'));
  }
  const category = designer.category || '設計師';
  assert(!html.includes('class="bo-owner"'), `Profile subtitle must not repeat the name: ${designer.id}`);
  assert(html.includes(`<span class="tag tag-zone">${category}</span>`), `Wrong category tag: ${designer.id}`);
  assert(home.includes(`<p class="lc-owner">${category} ${escape(designer.name)}</p>`), `Wrong directory category: ${designer.id}`);
  assert(html.includes(`<h1 id="static-designer-title">${escape(designer.name)}</h1>`));
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `Expected one page heading: ${designer.id}`);
  assert(html.includes('>作品選集</h2>'), `Missing works section: ${designer.id}`);
  assert.equal(html.includes('class="bo-intro"'), !!designer.description?.trim(), `Missing biographies must stay empty: ${designer.id}`);
  assert(html.includes('class="bo-breadcrumbs"'), `Missing visible breadcrumbs: ${designer.id}`);
  assert(!html.includes('aria-label="關閉">×</button></div>'), 'Static profiles must not display a nonfunctional close control');
  const graph = JSON.parse(html.match(/<script[^>]*id="designer-structured-data"[^>]*>(.*?)<\/script>/s)[1])['@graph'];
  const page = graph.find(node => node['@type'] === 'WebPage' || node['@type'] === 'ProfilePage');
  const entity = graph.find(node => node['@id'] === page.mainEntity['@id']);
  assert.equal(entity.name, designer.name);
  assert.equal(page.url, `https://minicourse.dev${path}`);
  assert.equal(page.inLanguage, 'zh-Hant-TW');
  assert(html.includes(`<title>${escape(page.name)}</title>`), 'Structured title must match the visible page metadata');
  const shareTitle = `${designer.name} 設計師`;
  assert(html.includes(`<meta property="og:title" content="${escape(shareTitle)}">`), `Wrong profile share title: ${designer.id}`);
  assert(html.includes(`<meta name="twitter:title" content="${escape(shareTitle)}">`));
  assert.equal(page.name, `${designer.name}｜${category}介紹與作品｜洋流設計師`, 'SEO title keeps the site name separately from sharing');
  if (designer.description?.trim()) {
    const attribute = html.match(/<meta name="description" content="([^"]*)">/);
    assert(attribute, `Missing meta description: ${designer.id}`);
    assert.equal(unescape(attribute[1]), page.description, `Structured description must match meta description: ${designer.id}`);
  } else {
    assert(!html.includes('<meta name="description"') && !html.includes('property="og:description"') && !html.includes('name="twitter:description"'), 'Missing biographies must not generate generic summaries');
    assert(!('description' in page) && !('description' in entity));
  }
  const breadcrumbs = graph.find(node => node['@type'] === 'BreadcrumbList').itemListElement;
  assert.equal(breadcrumbs.at(-1).item, page.url);
  for (const node of graph.filter(node => node['@type'] === 'ImageObject')) {
    assert(html.includes(escape(node.contentUrl)), `Structured image must be visible in the profile: ${designer.id}`);
    if (node.caption) assert(html.includes(escape(node.caption)), 'Structured captions must also be visible');
  }
  assert(html.includes(`<link rel="canonical" href="https://minicourse.dev${path}">`));
  assert(html.includes(`<meta property="og:url" content="https://minicourse.dev${path}">`));
  assert(html.includes('src="/puma_oshen_wave/designer/js/app.js?'));
  assert(html.includes('href="/puma_oshen_wave/designer/css/booth.css?'));
  assert(html.includes('id="walk-canvas"') && html.includes('id="dlg-booth"'));
  assert(!html.includes('id="stage-list" hidden'));
  assert(home.includes(`href="${path}"`));
  assert(sitemap.includes(`<loc>https://minicourse.dev${path}</loc>`));
  assert.equal(designerBoothUrl(designer.id, 'https://minicourse.dev/puma_oshen_wave/designer/#/list'), `https://minicourse.dev${path}`);
  const booth = catalogue.designerBooths.get(designer.id);
  const hallName = category === '愛好者' ? '愛好者館' : '設計師館';
  assert.equal(booth[0], category === '愛好者' ? 'A' : 'O', `Wrong hall: ${designer.id}`);
  assert(home.includes(`<p class="lc-zone">${hallName}・${category}</p>`), `Wrong static directory hall: ${designer.id}`);
  assert(html.includes(booth), 'Static and interactive booth must match');
  for (const social of Object.values(designer.social || {}).filter(url => /^https?:/.test(url))) assert(html.includes(escape(social)), `Missing social: ${designer.id}`);
  assert(!html.includes('originalUrl'), 'Internal provenance exposed');
}
const products = JSON.parse(read('public/puma_oshen_wave/data/designers/yang-liu.products.json'));
const yang = read(`dist${designerPath('yang-liu')}index.html`);
for (const product of products.products.filter(product => product.pinned && !product.disabled)) assert(yang.includes(escape(product.url)), 'Pinned work missing from SSG');
console.log(`Verified ${count} designer pages: static profile, social links, pinned works, canonical, sitemap and shared UI.`);

const classified = createCatalogue({ designers: [
  { id: 'default-artist', name: '既有作者' },
  { id: 'creator', name: '創作者範例', category: '創作者' },
  { id: 'amateur', name: '愛好者範例', category: '愛好者' },
] });
const aisle = classified.aisles.get('O01');
assert.equal(classified.designerBooths.get('creator'), 'O01-02', 'Category must not move existing booths');
assert.deepEqual(classified.search.map(row => row[3]), ['設計師', '創作者', '愛好者'], 'List category filter must use each author category');
const creatorBooth = aisle.islands[0].booths[1];
assert.equal(creatorBooth.zoneName, '創作者');
assert.equal(aisle.stores['default-artist'].category, '設計師');
assert(boothHtml(creatorBooth, aisle.stores.creator).includes('<p class="bo-owner">創作者 創作者範例</p>'));
const amateurAisle = classified.aisles.get('A01');
const amateurBooth = amateurAisle.islands[0].booths[0];
assert.equal(classified.designerBooths.get('amateur'), 'A01-01');
assert.equal(amateurBooth.zoneName, '愛好者');
assert.equal(amateurAisle.hallName, '愛好者館');
assert.equal(amateurAisle.stores.amateur.category, '愛好者');
assert(boothHtml(amateurBooth, amateurAisle.stores.amateur).includes('<span class="tag tag-zone">愛好者</span>'));
assert(!('amateur' in aisle.stores), 'Amateurs must not also appear in the designer hall');
assert.deepEqual(classified.index.halls.map(hall => [hall.code, hall.name, hall.zones[0].booths]),
  [['O', '設計師館', 2], ['A', '愛好者館', 1]]);
assert.deepEqual(classified.search.map(row => row[4]), ['O', 'O', 'A'], 'List hall filters must match the walk/map halls');
const empty = createCatalogue({ designers: [] });
assert.equal(empty.index.halls.length, 2);
assert(empty.aisles.has('O01') && empty.aisles.has('A01'), 'Both empty halls must have a valid entry route');
const overflow = createCatalogue({ designers: [
  ...Array.from({ length: 17 }, (_, i) => ({ id: `amateur-${i}`, name: `愛好者 ${i}`, category: '愛好者' })),
  { id: 'designer-after-amateurs', name: '設計師' },
  { id: 'disabled-amateur', name: '下架愛好者', category: '愛好者', disabled: true },
] });
assert.equal(overflow.designerBooths.get('amateur-16'), 'A02-01', 'Amateur aisles must paginate independently');
assert.equal(overflow.designerBooths.get('designer-after-amateurs'), 'O01-01');
assert(!overflow.designerBooths.has('disabled-amateur'));
assert.equal(overflow.index.totals.designers, 18);
console.log('Verified separate designer/amateur halls, category filters, empty halls and independent aisle pagination.');

const previousIndex = state.index;
try {
  state.index = catalogue.index;
  const lastDesignerAisle = catalogue.index.halls.find(hall => hall.code === 'O').aisles.at(-1).code;
  assert.equal(aisleNeighbors(lastDesignerAisle).next, 'A01', 'The designer hall exit must lead to the amateur hall');
  assert.equal(aisleNeighbors('A01').prev, lastDesignerAisle, 'The amateur hall entrance must return to the designer hall');
  assert.equal(aisleNeighbors('O01').prev, null, 'The first entrance remains the start of the route');
  state.index = overflow.index;
  assert.deepEqual(aisleNeighbors('A01'), { prev: 'O01', next: 'A02' });
  assert.deepEqual(aisleNeighbors('A02'), { prev: 'A01', next: null });
} finally {
  state.index = previousIndex;
}
console.log('Verified two-way hall passages and unchanged aisle/end navigation.');

// Future records with a biography use it in both rendering paths; sparse records remain valid.
const sample = { id: 'future-studio', name: '未來工作室 & 朋友', category: '創作者',
  description: '以木工與插畫記錄日常。\n每件作品都保留手作紋理。', entityType: 'Organization',
  social: { ig: 'https://www.instagram.com/example/', web: 'javascript:alert(1)' } };
const sampleCatalogue = createCatalogue({ designers: [sample] });
const sampleAisle = sampleCatalogue.aisles.get('O01');
const sampleStore = sampleAisle.stores[sample.id];
const sampleBooth = sampleAisle.islands[0].booths[0];
const metadata = designerMetadata(sampleStore);
assert.equal(metadata.introduction, sample.description);
assert.equal(metadata.description, sample.description.replace(/\s+/g, ' '));
for (const staticProfile of [true, false]) {
  const rendered = boothHtml(sampleBooth, sampleStore, { profile: true, staticProfile });
  assert(rendered.includes(escape(sample.description)), 'Biography must be visible in static and interactive profiles');
  assert(rendered.includes('<h1 ') && rendered.includes('<h2>簡介</h2>'));
  assert(!rendered.includes('javascript:'), 'Invalid official URLs must not become links');
}
const sampleUrl = `https://minicourse.dev${designerPath(sample.id)}`;
const sampleGraph = designerStructuredData(sampleStore, sampleBooth, sampleUrl, 'https://minicourse.dev/puma_oshen_wave/designer/')['@graph'];
assert.equal(sampleGraph[0]['@type'], 'ProfilePage');
assert.equal(sampleGraph[1]['@type'], 'Organization');
assert.deepEqual(sampleGraph[1].sameAs, [sample.social.ig]);
const sparse = { id: 'future-person', name: '未來作者' };
assert(!designerMetadata(sparse).introduction.includes('官方連結'), 'Do not invent missing social profiles');
assert.equal(designerMetadata(sparse).introduction, '', 'Missing biographies must remain empty');
assert.equal(designerMetadata(sparse).description, '', 'Missing biographies must not generate a search summary');
assert(!boothHtml(sampleBooth, { ...sampleStore, description: '' }, { profile: true }).includes('class="bo-intro"'), 'Do not show a placeholder introduction');
const sparseGraph = designerStructuredData(sparse, { works: [] }, sampleUrl, 'https://minicourse.dev/puma_oshen_wave/designer/')['@graph'];
assert.equal(sparseGraph[1]['@type'], 'Thing', 'Do not guess person vs organization from a display name');
assert(!('image' in sparseGraph[1]) && !('sameAs' in sparseGraph[1]), 'Do not insert placeholder entity data');
const hostile = '</script><script>alert(1)</script>';
assert(!serializeStructuredData({ description: hostile }).includes('</script>'));
assert.equal(JSON.parse(serializeStructuredData({ description: hostile })).description, hostile);
const escapedProfile = boothHtml(sampleBooth, { ...sampleStore, description: hostile }, { profile: true });
assert(!escapedProfile.includes('<script>'), 'Description must render as text');
const longBio = designerMetadata({ ...sparse, description: '🙂'.repeat(200) });
assert.equal(Array.from(longBio.description).length, 160, 'Snippet truncation must preserve Unicode characters');
console.log('Verified biography support, sparse/future profiles, safe structured data and static/interactive parity.');

const profile = 'https://minicourse.dev/puma_oshen_wave/designer/profiles/yuan-art-space/';
for (const hash of ['', '#/walk/O01', '#/list', '#/map', '#/designer/wolfsignal-tw']) {
  assert.deepEqual(resolveDesignerRoute(new URL(profile + hash), { boot: true }), { mode: 'designer', target: 'yuan-art-space' });
}
assert.deepEqual(resolveDesignerRoute(new URL('https://minicourse.dev/puma_oshen_wave/designer/#/designer/wolfsignal-tw'), { boot: true }), { mode: 'designer', target: 'wolfsignal-tw', then: undefined });
assert.equal(resolveDesignerRoute(new URL(profile + '#/list')).mode, 'list');
assert.deepEqual(resolveDesignerRoute(new URL('https://minicourse.dev/puma_oshen_wave/designer/#/walk/O01-14/open'), { boot: true }), { mode: 'walk', target: 'O01-14', then: 'open' });
assert.equal(designerBoothUrl('yuan-art-space', profile + '#/walk/O01'), profile);
console.log('Verified profile precedence, legacy routes and hash-free share URLs.');
