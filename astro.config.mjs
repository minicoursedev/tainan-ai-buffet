import { defineConfig } from 'astro/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { writeDesignerOgImages } from './scripts/designer-og.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  site: 'https://minicourse.dev',
  output: 'static',
  integrations: [{
    name: 'designer-og-images',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const data = JSON.parse(await readFile(new URL('./public/puma_oshen_wave/designer.json', import.meta.url), 'utf8'));
        const images = await writeDesignerOgImages(data.designers, { root, outDir: fileURLToPath(dir) });
        console.log(`Generated ${images.length} author OG images: 600×315, white background, no enlargement.`);
      },
    },
  }],
  build: {
    format: 'preserve',
  },
});
