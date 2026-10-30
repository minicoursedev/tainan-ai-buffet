import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createCatalogue } from '../public/puma_oshen_wave/stage/data.js';
const read = path => readFileSync(path, 'utf8');
const data = JSON.parse(read('public/puma_oshen_wave/stage/videos.json'));
const catalogue = createCatalogue(data);
const base = '/puma_oshen_wave/stage/';
const sitemap = read('dist/sitemap.xml');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const check = (path, names) => {
  const html = read(`dist${path}index.html`);
  assert(html.includes(`<link rel="canonical" href="https://minicourse.dev${path}">`), path);
  assert(html.includes(`<meta property="og:url" content="https://minicourse.dev${path}">`));
  assert(html.includes('id="stage-list"') && !html.includes('id="stage-list" hidden'));
  assert(html.includes('src="/puma_oshen_wave/stage/app.js?'));
  assert(html.includes('href="/puma_oshen_wave/stage/stage.css?'));
  assert(html.includes('id="walk-canvas"') && html.includes('id="video-dialog"'));
  assert(sitemap.includes(`<loc>https://minicourse.dev${path}</loc>`));
  for (const name of names) assert(html.includes(escape(name)), `${path}: ${name}`);
  return html;
};
const home = check(base, catalogue.stages.map(stage => stage.title));
for (const hall of catalogue.halls) {
  const stages = catalogue.stages.filter(stage => stage.hallId === hall.id);
  const html = check(`${base}halls/${hall.id}/`, [hall.name, ...stages.map(stage => stage.title)]);
  for (const stage of stages) assert(html.includes(`href="${base}videos/${stage.id}/"`));
}
for (const stage of catalogue.stages) {
  const path = `${base}videos/${stage.id}/`;
  const html = check(path, [stage.title, stage.creator, stage.description]);
  assert(home.includes(`href="${path}"`));
  assert(html.includes(`href="${base}halls/${stage.hallId}/"`));
}
for (const stage of data.stages.filter(stage => stage.disabled)) assert(!existsSync(`dist${base}videos/${stage.id}/index.html`));
console.log(`Verified stage SSG: ${catalogue.halls.length} halls and ${catalogue.stages.length} videos, static content, links, metadata and shared UI.`);
