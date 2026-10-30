import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');
const { stores } = JSON.parse(read('public/puma_oshen_wave/stores.json'));
const sitemap = read('dist/sitemap.xml');
const directory = read('dist/puma_oshen_wave/shops/index.html');
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
  assert(html.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1] === escape(store.name), `Missing name: ${store.id}`);
  assert(html.includes(escape(store.address)), `Missing address: ${store.id}`);
  assert(html.includes(`<link rel="canonical" href="https://minicourse.dev${path}">`), `Wrong canonical: ${store.id}`);
  assert(html.includes(`<meta property="og:url" content="https://minicourse.dev${path}">`));
  assert(html.includes('<meta name="description" content="'));
  assert(html.includes(`?shop=${encodeURIComponent(store.id)}#map-area`));
  assert(sitemap.includes(`<loc>https://minicourse.dev${path}</loc>`));
  assert(directory.includes(`href="${path}"`), `Not discoverable: ${store.id}`);
  assert(!html.includes('verificationNote'), 'Internal audit field exposed');
}
console.log(`Verified static content, canonical, map links, directory and sitemap for ${stores.filter(s => s.disabled !== true).length} stores; disabled stores excluded.`);
