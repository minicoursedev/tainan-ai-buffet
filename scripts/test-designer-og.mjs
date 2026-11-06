import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { renderDesignerOg, writeDesignerOgImages } from './designer-og.mjs';

async function fixture(width, height, background = '#227744') {
  const root = await mkdtemp(join(tmpdir(), 'designer-og-'));
  const directory = join(root, 'public/puma_oshen_wave/assets/artist');
  await mkdir(directory, { recursive: true });
  const file = join(directory, 'logo.webp');
  const input = await sharp({ create: { width, height, channels: 4, background } }).webp({ lossless: true }).toBuffer();
  await writeFile(file, input);
  return { root, file, input, row: { id: 'artist', name: '作者', logo: {
    status: 'verified', url: 'https://minicourse.dev/puma_oshen_wave/assets/artist/logo.webp?v=source',
  } } };
}

test('approved square composition is 600×315 with a 256×256 logo and white margins', async () => {
  const f = await fixture(256, 256);
  const image = await renderDesignerOg(f.row, f);
  assert.deepEqual([image.width, image.height, image.logoWidth, image.logoHeight, image.left, image.top],
    [600, 315, 256, 256, 172, 29]);
  const metadata = await sharp(image.buffer).metadata();
  assert.equal(metadata.format, 'jpeg');
  const { data, info } = await sharp(image.buffer).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...data.subarray(0, 3)], [255, 255, 255]);
  assert.equal(info.width, 600);
  assert.equal(info.height, 315);
  assert((await readFile(f.file)).equals(f.input), 'Original logo must remain unchanged');
});

test('portrait and oversized sources keep proportions and are never enlarged or cropped', async () => {
  for (const [width, height, expected] of [[164, 256, [164, 256]], [80, 40, [80, 40]],
    [800, 400, [600, 300]], [400, 800, [158, 315]]]) {
    const f = await fixture(width, height);
    const image = await renderDesignerOg(f.row, f);
    assert.deepEqual([image.logoWidth, image.logoHeight], expected);
    assert(image.logoWidth <= width && image.logoHeight <= height);
    assert(Math.abs(image.logoWidth / image.logoHeight - width / height) < 0.004);
    assert(image.left >= 0 && image.top >= 0);
  }
});

test('transparent sources get a white background and content changes alone change the version', async () => {
  const f = await fixture(128, 128, { r: 0, g: 0, b: 0, alpha: 0 });
  const first = await renderDesignerOg(f.row, f);
  const same = await renderDesignerOg(f.row, f);
  assert.equal(first.url, same.url);
  assert(first.buffer.equals(same.buffer));
  const { data } = await sharp(first.buffer).raw().toBuffer({ resolveWithObject: true });
  assert(data.every(value => value === 255), 'Transparent logo must not become black');
  await writeFile(f.file, await sharp({ create: { width: 128, height: 128, channels: 3, background: '#cc2200' } }).webp().toBuffer());
  assert.notEqual((await renderDesignerOg(f.row, f)).url, first.url);
});

test('build emits only active authors and never changes source data or source images', async () => {
  const f = await fixture(256, 256);
  const rows = [f.row, { ...f.row, id: 'disabled', disabled: true }];
  const original = structuredClone(rows);
  const outDir = join(f.root, 'dist');
  const images = await writeDesignerOgImages(rows, { root: f.root, outDir });
  assert.equal(images.length, 1);
  assert.deepEqual(await readdir(join(outDir, 'puma_oshen_wave/assets')), ['artist']);
  assert((await readFile(join(outDir, images[0].relativePath))).equals(images[0].buffer));
  assert.deepEqual(rows, original);
  assert((await readFile(f.file)).equals(f.input));
  assert.equal((await writeDesignerOgImages(rows, { root: f.root, outDir }))[0].url, images[0].url);
});

test('existing first-work fallback is retained without network access', async () => {
  const f = await fixture(256, 256);
  const row = { id: 'artist', name: '作者', productImages: [{ url: f.row.logo.url, alt: '第一張作品' }] };
  assert.equal((await renderDesignerOg(row, f)).alt, '第一張作品');
  assert.equal(await renderDesignerOg({ id: 'empty', name: '沒有圖片' }, f), null);
  await assert.rejects(renderDesignerOg({ ...f.row, logo: { status: 'verified', url: 'https://example.org/logo.webp' } }, f));
  await assert.rejects(renderDesignerOg({ ...f.row, id: '../escape' }, f));
});
