import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export const OG_WIDTH = 600;
export const OG_HEIGHT = 315;
const SITE = 'https://minicourse.dev/';
const rendered = new Map();

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
  const key = createHash('sha256').update(input).digest('hex');
  if (!rendered.has(key)) rendered.set(key, (async () => {
    const overlay = await sharp(input).rotate().resize({
      width: OG_WIDTH, height: OG_HEIGHT, fit: 'inside', withoutEnlargement: true,
    }).png().toBuffer({ resolveWithObject: true });
    const left = Math.floor((OG_WIDTH - overlay.info.width) / 2);
    const top = Math.floor((OG_HEIGHT - overlay.info.height) / 2);
    const buffer = await sharp({ create: {
      width: OG_WIDTH, height: OG_HEIGHT, channels: 3, background: '#ffffff',
    } }).composite([{ input: overlay.data, left, top }])
      .jpeg({ quality: 85, chromaSubsampling: '4:4:4' }).toBuffer();
    return { buffer, logoWidth: overlay.info.width, logoHeight: overlay.info.height, left, top };
  })());
  const image = await rendered.get(key);
  const version = createHash('sha256').update(image.buffer).digest('hex').slice(0, 16);
  const relativePath = `puma_oshen_wave/assets/${designer.id}/og.jpg`;
  return {
    ...image, relativePath, url: SITE + relativePath + '?v=' + version,
    width: OG_WIDTH, height: OG_HEIGHT, type: 'image/jpeg',
    alt: logo ? `${designer.name}的頭像` : firstWork.alt || `${designer.name}的作品`,
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
  return images.filter(Boolean);
}
