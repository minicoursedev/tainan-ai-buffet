import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { renderDesignerOg, writeDesignerOgImages, ogMetadata } from './designer-og.mjs';

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

test('approved 1200×630 card uses a left logo and right name and supplied biography', async () => {
  const f = await fixture(256, 256);
  f.row.description = '第一行介紹\n第二行介紹';
  const image = await renderDesignerOg(f.row, f);
  assert.deepEqual([image.width, image.height, image.logoWidth, image.logoHeight, image.left, image.top],
    [1200, 630, 470, 470, 20, 80]);
  assert.equal(image.title.text, f.row.name);
  assert.equal(image.title.left, 508);
  assert.equal(image.biography.text, f.row.description);
  assert(image.biography.top > image.title.top + image.title.height);
  const metadata = await sharp(image.buffer).metadata();
  assert.equal(metadata.format, 'jpeg');
  const { data, info } = await sharp(image.buffer).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...data.subarray(0, 3)], [255, 255, 255]);
  assert.equal(info.width, 1200);
  assert.equal(info.height, 630);
  assert((await readFile(f.file)).equals(f.input), 'Original logo must remain unchanged');
});

test('logo sources fit the left area proportionally without cropping or changing originals', async () => {
  for (const [width, height, expected] of [[164, 256, [301, 470]], [80, 40, [470, 235]],
    [800, 400, [470, 235]], [400, 800, [235, 470]]]) {
    const f = await fixture(width, height);
    const image = await renderDesignerOg(f.row, f);
    assert.deepEqual([image.logoWidth, image.logoHeight], expected);
    assert(image.logoWidth <= 470 && image.logoHeight <= 470);
    assert(Math.abs(image.logoWidth / image.logoHeight - width / height) < 0.004);
    assert(image.left >= 0 && image.top >= 0);
    assert((await readFile(f.file)).equals(f.input));
  }
});

test('transparent sources get a white background and content changes alone change the version', async () => {
  const f = await fixture(128, 128, { r: 0, g: 0, b: 0, alpha: 0 });
  const first = await renderDesignerOg(f.row, f);
  const same = await renderDesignerOg(f.row, f);
  assert.equal(first.url, same.url);
  assert(first.buffer.equals(same.buffer));
  const { data } = await sharp(first.buffer).extract({ left: 0, top: 0, width: 500, height: 630 }).raw().toBuffer({ resolveWithObject: true });
  assert(data.every(value => value === 255), 'Transparent logo must not become black');
  await writeFile(f.file, await sharp({ create: { width: 128, height: 128, channels: 3, background: '#cc2200' } }).webp().toBuffer());
  assert.notEqual((await renderDesignerOg(f.row, f)).url, first.url);
});

test('missing biographies stay blank, with no fallback prose or website footer', async () => {
  const f = await fixture(256, 256);
  const image = await renderDesignerOg(f.row, f);
  assert.equal(image.biography, null);
  const blank = await renderDesignerOg({ ...f.row, description: ' \n ' }, f);
  assert.equal(blank.url, image.url);
  const { data } = await sharp(image.buffer).extract({ left: 508, top: 260, width: 668, height: 350 }).raw().toBuffer({ resolveWithObject: true });
  assert(data.every(value => value === 255), 'Biography and footer area must stay blank');
  const renamed = await renderDesignerOg({ ...f.row, name: '另一位作者' }, f);
  assert.notEqual(renamed.url, image.url, 'Names are part of the image cache/version');
  const described = await renderDesignerOg({ ...f.row, description: '使用者提供的簡介' }, f);
  assert.notEqual(described.url, image.url, 'Biographies are part of the image cache/version');
  assert.equal(described.biography.text, '使用者提供的簡介');
});

test('long multilingual text fits the card and markup-like input stays literal', async () => {
  const f = await fixture(256, 256);
  const row = { ...f.row, name: '名字 & <tag> "TC" 🐈 '.repeat(12), description: '簡介 <b>原文</b> & 創作，'.repeat(30) };
  const image = await renderDesignerOg(row, f);
  for (const block of [image.title, image.biography]) {
    assert(block.width <= 668 && block.left + block.width <= 1200);
    assert(block.top + block.height <= 630 - 64);
  }
  assert.equal(image.title.text, row.name.trim());
  assert.equal(image.biography.text, row.description);
  assert.equal(image.biography.renderedText.replace(/\s/g, ''), row.description.replace(/\s/g, ''), 'Wrapping must not add or rewrite words');
  const paragraphs = await renderDesignerOg({ ...f.row, description: '第一段，\n \n第二段。' }, f);
  assert.equal(paragraphs.biography.renderedText.replace(/\s/g, ''), '第一段，第二段。');
  const sentences = await renderDesignerOg({ ...f.row, description: '第一段。\n第二段。' }, f);
  assert.equal(sentences.biography.renderedText, '第一段。\n第二段。', 'Do not add blank lines after existing sentence breaks');
});

test('biographies with trailing direction marks render without changing their text', async () => {
  const f = await fixture(256, 256);
  f.row.description = '\u200e你發現了一隻野生的繪師ฅ^•ﻌ•^ฅ\n說我1450的請先匯給我1450再說不遲。\u200e';
  const image = await renderDesignerOg(f.row, f);
  assert.deepEqual([image.width, image.height], [1200, 630]);
  assert.equal(image.biography.text, f.row.description);
  assert.equal(image.biography.renderedText.replace(/\s/g, ''), f.row.description.replace(/\s/g, ''));
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
  const manifest = JSON.parse(await readFile(join(outDir, 'puma_oshen_wave/designer/og-images.json'), 'utf8'));
  assert.deepEqual(manifest, { artist: ogMetadata(images[0]) });
});

test('existing first-work fallback is retained without network access', async () => {
  const f = await fixture(256, 256);
  const row = { id: 'artist', name: '作者', productImages: [{ url: f.row.logo.url, alt: '第一張作品' }] };
  assert.equal((await renderDesignerOg(row, f)).alt, '作者｜作品圖片、名字');
  assert.equal(await renderDesignerOg({ id: 'empty', name: '沒有圖片' }, f), null);
  await assert.rejects(renderDesignerOg({ ...f.row, logo: { status: 'verified', url: 'https://example.org/logo.webp' } }, f));
  await assert.rejects(renderDesignerOg({ ...f.row, id: '../escape' }, f));
});
