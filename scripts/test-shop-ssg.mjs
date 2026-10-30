import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');
const { stores } = JSON.parse(read('public/puma_oshen_wave/stores.json'));
const sitemap = read('dist/sitemap.xml');
const directory = read('dist/puma_oshen_wave/index.html');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
for (const store of stores) {
  const path = `/puma_oshen_wave/shops/${encodeURIComponent(store.id)}/`;
  const file = `dist${path}index.html`;
  if (store.disabled === true) {
    assert(!existsSync(file), `Disabled store emitted: ${store.id}`);
    assert(!sitemap.includes(`<loc>https://minicourse.dev${path}</loc>`));
    continue;
  }
  const html = read(file);
  assert(html.includes(`<h2>${escape(store.name)}</h2>`), `Missing name: ${store.id}`);
  assert(html.includes(escape(store.address)), `Missing address: ${store.id}`);
  assert(html.includes(`<link rel="canonical" href="https://minicourse.dev${path}">`), `Wrong canonical: ${store.id}`);
  assert(html.includes(`<meta property="og:url" content="https://minicourse.dev${path}">`));
  assert(html.includes('<meta name="description" content="'));
  assert(html.includes('id="all-shops-map"'), 'Shared map missing');
  assert(html.includes('src="/puma_oshen_wave/app.js?'), 'Shared interaction module missing');
  assert(html.includes('href="/puma_oshen_wave/style.css?'), 'Original stylesheet missing');
  assert(html.includes('id="shop-detail" class="shop-detail" aria-label='), 'Static detail must be visible');
  assert(sitemap.includes(`<loc>https://minicourse.dev${path}</loc>`));
  assert(directory.includes(`href="${path}"`), `Not discoverable: ${store.id}`);
  assert(!html.includes('verificationNote'), 'Internal audit field exposed');
}
console.log(`Verified static content, canonical, shared map and stylesheet, directory and sitemap for ${stores.filter(s => s.disabled !== true).length} stores; disabled stores excluded.`);
const active = stores.filter(store => store.disabled !== true);
const categories = [...new Set(active.map(store => store.category))];
for (const category of categories) {
  const path = `/puma_oshen_wave/categories/${encodeURIComponent(category)}/`;
  const html = read(`dist/puma_oshen_wave/categories/${category}/index.html`);
  assert(html.includes(`<title>${escape(category)}店家｜我們的洋流地圖</title>`));
  assert(html.includes(`<link rel="canonical" href="https://minicourse.dev${path}">`));
  assert(html.includes(`<meta property="og:url" content="https://minicourse.dev${path}">`));
  assert(html.includes('id="all-shops-map"'));
  assert(html.includes('href="/puma_oshen_wave/style.css?'));
  assert(html.includes('src="/puma_oshen_wave/app.js?'));
  const ids = [...html.matchAll(/class="shop-card" data-shop-id="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids.sort(), active.filter(store => store.category === category).map(store => store.id).sort(), `Incorrect category membership: ${category}`);
  assert(sitemap.includes(`<loc>https://minicourse.dev${path}</loc>`));
  assert(directory.includes(`href="${path}"`));
}
console.log(`Verified ${categories.length} static categories: exact membership, metadata, discoverable links and shared map.`);
