import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createCatalogue } from '../public/puma_oshen_wave/designer/js/data.js';
import { boothHtml } from '../public/puma_oshen_wave/designer/js/ui/booth-markup.js';
import { designerPath, designerBoothUrl, resolveDesignerRoute } from '../public/puma_oshen_wave/designer/js/routes.js';
const read = path => readFileSync(path, 'utf8');
const raw = JSON.parse(read('public/puma_oshen_wave/designer.json'));
const catalogue = createCatalogue(raw);
const home = read('dist/puma_oshen_wave/designer/index.html');
const sitemap = read('dist/sitemap.xml');
const escape = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const exhibitionImage = 'https://minicourse.dev/puma_oshen_wave/designer/assets/exhibition-og.png?v=19f09d0c7c56f7bd';
assert(home.includes(`<meta property="og:image" content="${exhibitionImage}">`), 'Exhibition share image must remain unchanged');
let count = 0;
for (const designer of raw.designers) {
  const path = designerPath(designer.id);
  if (designer.disabled === true) {
    assert(!existsSync(`dist${path}index.html`));
    assert(!sitemap.includes(`https://minicourse.dev${path}`));
    continue;
  }
  count++;
  const html = read(`dist${path}index.html`);
  const previewImage = designer.logo?.status === 'verified' && designer.logo.url
    ? designer.logo.url : designer.productImages?.[0]?.url || exhibitionImage;
  assert.equal((html.match(/property="og:image"/g) || []).length, 1, `Expected one explicit OG image: ${designer.id}`);
  assert(html.includes(`<meta property="og:image" content="${escape(previewImage)}">`), `Missing author OG image: ${designer.id}`);
  assert(html.includes(`<meta name="twitter:image" content="${escape(previewImage)}">`), `Missing author Twitter image: ${designer.id}`);
  const category = designer.category || '設計師';
  assert(html.includes(`<p class="bo-owner">${category} ${escape(designer.name)}</p>`), `Wrong owner category: ${designer.id}`);
  assert(html.includes(`<span class="tag tag-zone">${category}</span>`), `Wrong category tag: ${designer.id}`);
  assert(home.includes(`<p class="lc-owner">${category} ${escape(designer.name)}</p>`), `Wrong directory category: ${designer.id}`);
  assert(html.includes(`<h2 id="static-designer-title">${escape(designer.name)}</h2>`));
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
] });
const aisle = classified.aisles.get('O01');
assert.equal(classified.designerBooths.get('creator'), 'O01-02', 'Category must not move existing booths');
assert.deepEqual(classified.search.map(row => row[3]), ['設計師', '創作者'], 'List category filter must use each author category');
const creatorBooth = aisle.islands[0].booths[1];
assert.equal(creatorBooth.zoneName, '創作者');
assert.equal(aisle.stores['default-artist'].category, '設計師');
assert(boothHtml(creatorBooth, aisle.stores.creator).includes('<p class="bo-owner">創作者 創作者範例</p>'));
console.log('Verified optional author categories in profiles and list filters without moving booths.');

const profile = 'https://minicourse.dev/puma_oshen_wave/designer/profiles/yuan-art-space/';
for (const hash of ['', '#/walk/O01', '#/list', '#/map', '#/designer/wolfsignal-tw']) {
  assert.deepEqual(resolveDesignerRoute(new URL(profile + hash), { boot: true }), { mode: 'designer', target: 'yuan-art-space' });
}
assert.deepEqual(resolveDesignerRoute(new URL('https://minicourse.dev/puma_oshen_wave/designer/#/designer/wolfsignal-tw'), { boot: true }), { mode: 'designer', target: 'wolfsignal-tw', then: undefined });
assert.equal(resolveDesignerRoute(new URL(profile + '#/list')).mode, 'list');
assert.deepEqual(resolveDesignerRoute(new URL('https://minicourse.dev/puma_oshen_wave/designer/#/walk/O01-14/open'), { boot: true }), { mode: 'walk', target: 'O01-14', then: 'open' });
assert.equal(designerBoothUrl('yuan-art-space', profile + '#/walk/O01'), profile);
console.log('Verified profile precedence, legacy routes and hash-free share URLs.');
