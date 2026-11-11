import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { createCatalogue } from '../public/puma_oshen_wave/designer/js/data.js';
import { readProducts } from '../public/puma_oshen_wave/designer/js/products.js';
import { designerWorkPath, designerWorkUrl, validateWorkIds } from '../public/puma_oshen_wave/designer/js/work-links.js';
import { boothHtml } from '../public/puma_oshen_wave/designer/js/ui/booth-markup.js';

const read = path => readFileSync(path, 'utf8');
const raw = JSON.parse(read('public/puma_oshen_wave/designer.json'));
const catalogue = createCatalogue(raw);
const sitemap = read('dist/sitemap.xml');
const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

test('each active work has a static landing page, the matching share image and a route back to its author', () => {
  let count = 0;
  for (const designer of raw.designers) {
    const directory = `dist/puma_oshen_wave/designer/profiles/${designer.id}/works`;
    if (designer.disabled === true) {
      assert(!existsSync(directory), `Disabled author has work pages: ${designer.id}`);
      continue;
    }
    const boothId = catalogue.designerBooths.get(designer.id);
    const aisle = catalogue.aisles.get(boothId.split('-')[0]);
    const booth = aisle.islands.flatMap(island => island.booths).find(booth => booth.store === designer.id);
    const works = designer.productsUrl
      ? readProducts(JSON.parse(read(`public${new URL(designer.productsUrl).pathname}`)), designer.id, designer.productsUrl)
      : booth.works;
    assert.equal(existsSync(directory) ? readdirSync(directory).length : 0, works.length);
    for (const work of works) {
      const path = designerWorkPath(designer.id, work.id);
      const html = read(`dist${path}index.html`);
      const canonical = `https://minicourse.dev${path}`;
      assert(html.includes(`<link rel="canonical" href="${canonical}">`));
      assert(html.includes(`<meta property="og:url" content="${canonical}">`));
      assert(html.includes(`<meta property="og:title" content="${escape(designer.name)} 設計師">`), 'Share titles use only the author name and designer label');
      assert(html.includes(`<meta name="twitter:title" content="${escape(designer.name)} 設計師">`));
      assert(html.includes(`<title>${escape(designer.name)}的作品｜洋流設計師</title>`), 'The SEO title keeps the site name');
      assert.equal((html.match(/property="og:image"/g) || []).length, 1);
      assert(html.includes(`<meta property="og:image" content="${escape(work.cover)}">`));
      assert(html.includes(`<meta name="twitter:image" content="${escape(work.cover)}">`));
      assert(html.includes(`<a class="btn btn-primary" href="/puma_oshen_wave/designer/profiles/${designer.id}/">逛他的攤位 →</a>`));
      assert(html.includes(`data-share-work="${path}"`));
      assert(html.includes('id="work-share-dialog"'));
      assert(html.includes('>繼續逛市集 →</a>'));
      assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
      assert(!html.includes('/js/app.js'), 'Work entry must keep its selected work, without booting the booth router');
      if (work.video) assert(html.includes(`<video controls playsinline preload="metadata" poster="${escape(work.cover)}" src="${escape(work.video)}"`));
      else assert(html.includes(`<img src="${escape(work.cover)}"`));
      if (work.caption) assert(html.includes(`<figcaption class="work-caption">${escape(work.caption)}</figcaption>`));
      else assert(!html.includes('<figcaption'), 'Alternative text must not become a visible caption');
      if (work.url) assert(html.includes(`href="${escape(work.url)}" target="_blank" rel="noopener noreferrer"`));
      assert(sitemap.includes(`<loc>${canonical}</loc>`));
      count++;
    }
    const boothMarkup = boothHtml({ ...booth, works }, aisle.stores[designer.id]);
    for (const work of works) {
      assert(boothMarkup.includes(`data-share-work="${designerWorkPath(designer.id, work.id)}"`));
      if (work.url && !work.video) assert(boothMarkup.includes(`class="bo-work" href="${escape(work.url)}" target="_blank"`), 'Existing source links must stay intact');
    }
  }
  console.log(`Verified ${count} work pages with static previews, media, captions, booth links and share controls.`);
});

test('inline work identities survive reordering and image cache-version changes, and omit disabled works', () => {
  const first = { url: 'https://minicourse.dev/puma_oshen_wave/assets/test-artist/4.webp?v=old', alt: '第四件' };
  const second = { url: 'https://example.test/other/cover.webp?v=old', alt: '另一件' };
  const worksOf = images => createCatalogue({ designers: [{ id: 'test-artist', name: '作者', productImages: images }] }).aisles.get('O01').islands[0].booths[0].works;
  const before = worksOf([first, second]);
  const after = worksOf([{ ...second, url: second.url.replace('old', 'new') }, { ...first, url: first.url.replace('old', 'new') }]);
  assert.equal(before[0].id, 'test-artist-4');
  assert.equal(before[0].id, after[1].id);
  assert.equal(before[1].id, after[0].id);
  assert.equal(worksOf([{ ...first, disabled: true }, second]).length, 1);
  assert.equal(worksOf([{ url: 'https://' }]).length, 0);
  assert.equal(designerWorkUrl('test-artist', before[0].id), `https://minicourse.dev${designerWorkPath('test-artist', before[0].id)}`);
  assert.equal(new URL(designerWorkUrl('test-artist', before[0].id, 'http://127.0.0.1:4325/')).origin, 'http://127.0.0.1:4325');
});

test('persisted work IDs survive renaming, replacement, and changes to nearby works', () => {
  const artist = { id: 'test-artist', name: '作者' };
  const work = { id: 'test-artist-4', url: 'https://minicourse.dev/puma_oshen_wave/assets/test-artist/4.webp' };
  const other = { id: 'other-work', url: 'https://example.test/old-work.webp' };
  const fresh = { id: 'new-work', url: 'https://example.test/new-work.webp' };
  const worksOf = productImages => createCatalogue({ designers: [{ ...artist, productImages }] }).aisles.get('O01').islands[0].booths[0].works;
  const path = designerWorkPath(artist.id, worksOf([work, other])[0].id);
  for (const url of [work.url, work.url.replace('/4.webp', '/renamed.webp'), 'https://example.test/replacement.png']) {
    const [added, edited] = worksOf([fresh, { ...work, url }]);
    assert.equal(added.id, fresh.id);
    assert.equal(edited.cover, url);
    assert.equal(designerWorkPath(artist.id, edited.id), path);
  }
  assert.throws(() => validateWorkIds(artist.id, [{ url: work.url }]), /Missing or invalid work ID/);
  assert.throws(() => validateWorkIds(artist.id, [work, { ...work, disabled: true }]), /Duplicate or retired work ID/);
  assert.throws(() => validateWorkIds(artist.id, [work], [work.id]), /Duplicate or retired work ID/);
});

test('disabled catalogue works have no landing page or sitemap entry', () => {
  const products = JSON.parse(read('public/puma_oshen_wave/data/designers/yang-liu.products.json'));
  for (const work of products.products.filter(work => work.disabled === true)) {
    const path = designerWorkPath(products.designerId, work.id);
    assert(!existsSync(`dist${path}index.html`));
    assert(!sitemap.includes(`https://minicourse.dev${path}`));
  }
});
