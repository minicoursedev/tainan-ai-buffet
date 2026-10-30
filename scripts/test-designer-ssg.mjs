import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createCatalogue } from '../public/puma_oshen_wave/designer/js/data.js';
import { designerPath, designerBoothUrl } from '../public/puma_oshen_wave/designer/js/routes.js';
const read = path => readFileSync(path, 'utf8');
const raw = JSON.parse(read('public/puma_oshen_wave/designer.json'));
const catalogue = createCatalogue(raw);
const home = read('dist/puma_oshen_wave/designer/index.html');
const sitemap = read('dist/sitemap.xml');
const escape = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
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
