import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
const SITE = 'https://minicourse.dev/';
const FONT_DIR = resolve(process.cwd(), 'scripts/fonts');
const TEXT_LEFT = 508;
const TEXT_WIDTH = 668;
const LOGO_SIZE = 470;
const rendered = new Map();
const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const plainText = value => typeof value === 'string' ? value.trim().replace(/\r\n?/g, '\n') : '';
let fontsReady;

function prepareFonts() {
  return fontsReady ||= (async () => {
    // Use bundled fonts and a writable, build-only cache on both macOS and Linux.
    const sources = await readFile(resolve(FONT_DIR, 'sources.json'));
    const version = createHash('sha256').update(FONT_DIR).update(sources).digest('hex').slice(0, 16);
    const cache = resolve(tmpdir(), `oshen-og-fonts-${version}`);
    await mkdir(cache, { recursive: true });
    const config = resolve(cache, 'fonts.conf');
    await writeFile(config, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><dir>${escape(FONT_DIR)}</dir><cachedir>${escape(cache)}</cachedir></fontconfig>`);
    process.env.FONTCONFIG_FILE = config;
    return sources;
  })();
}

async function textImage(text, { bold = false, size, maxHeight }) {
  const options = {
    text: `<span foreground="${bold ? '#24302d' : '#343b37'}">${escape(text)}</span>`,
    font: `Noto Sans TC${bold ? ' Bold' : ''} ${size}`,
    fontfile: resolve(FONT_DIR, bold ? 'NotoSansTC-Bold.otf' : 'NotoSansTC-Regular.otf'),
    width: TEXT_WIDTH, rgba: true, wrap: 'word-char', spacing: 0,
  };
  let result = await sharp({ text: options }).png().toBuffer({ resolveWithObject: true });
  if (result.info.height > maxHeight) {
    result = await sharp({ text: { ...options, height: maxHeight } }).png().toBuffer({ resolveWithObject: true });
  }
  return result;
}

async function biographyLines(description) {
  // Preserve verse line breaks. Prose can reflow at its existing punctuation;
  // only whitespace changes, never the author's words.
  if (!/[，。；！？]/u.test(description)) return description;
  const widths = new Map();
  async function fits(text) {
    // Direction marks alone have no visible width and cannot be rasterized by Pango.
    if (!/[^\p{Cf}\s]/u.test(text)) return true;
    if (!widths.has(text)) {
      const result = await sharp({ text: {
        text: escape(text), font: 'Noto Sans TC 40',
        fontfile: resolve(FONT_DIR, 'NotoSansTC-Regular.otf'), rgba: true,
      } }).png().toBuffer({ resolveWithObject: true });
      widths.set(text, result.info.width);
    }
    return widths.get(text) <= TEXT_WIDTH;
  }
  const lines = [];
  let line = '';
  for (const clause of description.split(/(?<=[，。；！？])|\n/u).map(clause => clause.trim()).filter(Boolean)) {
    if (line && !await fits(line + clause)) { lines.push(line); line = ''; }
    if (await fits(clause)) line += clause;
    else {
      for (const { segment } of new Intl.Segmenter('zh-TW', { granularity: 'grapheme' }).segment(clause)) {
        if (line && !await fits(line + segment)) { lines.push(line); line = ''; }
        line += segment;
      }
    }
    if (/[。！？]$/u.test(clause)) { lines.push(line); line = ''; }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

export const ogMetadata = image => image && ({
  url: image.url, width: image.width, height: image.height, type: image.type, alt: image.alt,
});

export async function renderDesignerOg(designer, { root = process.cwd() } = {}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(designer.id)) throw new Error('Invalid designer OG id');
  const logo = designer.logo?.status === 'verified' ? designer.logo.url : '';
  const firstWork = designer.productImages?.find(photo => photo.url);
  const source = logo || firstWork?.url;
  if (!source) return null;
  const url = new URL(source, SITE + 'puma_oshen_wave/');
  if (url.origin !== new URL(SITE).origin) throw new Error(`OG source must be bundled: ${designer.id}`);
  const directory = resolve(root, 'public/puma_oshen_wave/assets', designer.id);
  const path = resolve(root, 'public', decodeURIComponent(url.pathname).replace(/^\//, ''));
  if (!path.startsWith(directory + sep) || (await lstat(path)).isSymbolicLink()) {
    throw new Error(`Invalid designer OG source: ${designer.id}`);
  }
  const input = await readFile(path);
  const name = plainText(designer.name);
  const description = plainText(designer.description);
  const fonts = await prepareFonts();
  const key = createHash('sha256').update(input).update(fonts).update(JSON.stringify([name, description, OG_WIDTH, OG_HEIGHT])).digest('hex');
  if (!rendered.has(key)) rendered.set(key, (async () => {
    const overlay = await sharp(input).rotate().resize({
      width: LOGO_SIZE, height: LOGO_SIZE, fit: 'inside',
    }).png().toBuffer({ resolveWithObject: true });
    const left = 20 + Math.floor((LOGO_SIZE - overlay.info.width) / 2);
    const top = Math.floor((OG_HEIGHT - overlay.info.height) / 2);
    const title = await textImage(name.replace(/。(?!$)/g, '。\n'), { bold: true, size: 60, maxHeight: 164 });
    const titleTop = 64;
    const descriptionTop = titleTop + title.info.height + 56;
    // An absent biography is a blank area, never generated text or a placeholder.
    const formattedDescription = description ? await biographyLines(description) : '';
    const biography = description ? await textImage(formattedDescription, { size: 40, maxHeight: OG_HEIGHT - descriptionTop - 64 }) : null;
    const layers = [
      { input: overlay.data, left, top },
      { input: title.data, left: TEXT_LEFT, top: titleTop },
      ...(biography ? [{ input: biography.data, left: TEXT_LEFT, top: descriptionTop }] : []),
    ];
    const buffer = await sharp({ create: {
      width: OG_WIDTH, height: OG_HEIGHT, channels: 3, background: '#ffffff',
    } }).composite(layers).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer();
    return {
      buffer, logoWidth: overlay.info.width, logoHeight: overlay.info.height, left, top,
      title: { text: name, left: TEXT_LEFT, top: titleTop, width: title.info.width, height: title.info.height },
      biography: biography ? { text: description, renderedText: formattedDescription, left: TEXT_LEFT, top: descriptionTop, width: biography.info.width, height: biography.info.height } : null,
    };
  })());
  const image = await rendered.get(key);
  const version = createHash('sha256').update(image.buffer).digest('hex').slice(0, 16);
  const relativePath = `puma_oshen_wave/assets/${designer.id}/og.jpg`;
  return {
    ...image, relativePath, url: SITE + relativePath + '?v=' + version,
    width: OG_WIDTH, height: OG_HEIGHT, type: 'image/jpeg',
    alt: `${name}｜${logo ? 'Logo' : '作品圖片'}、名字${description ? '與簡介' : ''}`,
  };
}

export async function writeDesignerOgImages(designers, { root = process.cwd(), outDir = resolve(root, 'dist') } = {}) {
  const images = await Promise.all(designers.filter(row => row.disabled !== true)
    .map(row => renderDesignerOg(row, { root })));
  for (const image of images.filter(Boolean)) {
    const target = resolve(outDir, image.relativePath);
    await mkdir(dirname(target), { recursive: true });
    const previous = await readFile(target).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (!previous?.equals(image.buffer)) await writeFile(target, image.buffer);
  }
  const manifestPath = resolve(outDir, 'puma_oshen_wave/designer/og-images.json');
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(Object.fromEntries(images.filter(Boolean).map(image => {
    const id = image.relativePath.split('/')[2];
    return [id, ogMetadata(image)];
  }))) + '\n');
  return images.filter(Boolean);
}
