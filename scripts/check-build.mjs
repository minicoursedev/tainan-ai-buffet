import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const root = process.cwd();
const requiredFiles = [
  'CNAME', 'index.html', 'friends.html', 'sitemap.xml', 'robots.txt',
  'google0dd0e2c38ab50487.html', 'assets/site.css', 'assets/archive.js',
  'assets/friends.js', 'assets/favicon.svg', 'data/events.json',
  'data/friends.json', 'data/skills.json', 'event/20260909/index.html',
];

for (const path of requiredFiles) {
  if (!existsSync(resolve(root, 'dist', path))) throw new Error(`Missing build output: /${path}`);
}

const readDist = path => readFileSync(resolve(root, 'dist', path), 'utf8');
const home = readDist('index.html');
const friends = readDist('friends.html');
const sitemap = readDist('sitemap.xml');

for (const [label, content, expected] of [
  ['homepage canonical', home, '<link rel="canonical" href="https://minicourse.dev/">'],
  ['friends canonical', friends, '<link rel="canonical" href="https://minicourse.dev/friends.html">'],
  ['legacy slides link', home, 'href="/event/20260909/"'],
  ['archive refresh script', home, 'src="/assets/archive.js"'],
  ['friends refresh script', friends, 'src="/assets/friends.js"'],
]) {
  if (!content.includes(expected)) throw new Error(`Missing ${label}: ${expected}`);
}

const homeNav = home.match(/<nav aria-label="主要導覽">[\s\S]*?<\/nav>/)?.[0] ?? '';
const friendsNav = friends.match(/<nav aria-label="主要導覽">[\s\S]*?<\/nav>/)?.[0] ?? '';
for (const [label, nav] of [['home', homeNav], ['friends', friendsNav]]) {
  if (!nav.includes('<a href="/friends.html">串門子</a>')) throw new Error(`Missing friends navigation link in ${label}`);
}
if (readDist('CNAME').trim() !== 'minicourse.dev') throw new Error('CNAME must remain minicourse.dev');

for (const url of ['https://minicourse.dev/', 'https://minicourse.dev/friends.html', 'https://minicourse.dev/event/20260909/']) {
  if (!sitemap.includes(`<loc>${url}</loc>`)) throw new Error(`Missing sitemap URL: ${url}`);
}

for (const name of ['events', 'friends', 'skills']) {
  const source = JSON.parse(readFileSync(resolve(root, 'src', 'data', `${name}.json`), 'utf8'));
  const output = JSON.parse(readDist(`data/${name}.json`));
  if (!isDeepStrictEqual(source, output)) throw new Error(`Generated /data/${name}.json differs from source data`);
}

console.log(`Verified ${requiredFiles.length} build outputs and public route compatibility.`);
