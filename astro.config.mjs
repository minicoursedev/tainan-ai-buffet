import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://minicourse.dev',
  output: 'static',
  build: {
    format: 'preserve',
  },
});
