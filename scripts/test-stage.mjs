import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCatalogue, parseVideo } from '../public/puma_oshen_wave/stage/data.js';

const videoUrl = 'https://www.youtube.com/watch?v=LnIlsGFRB_4';
const record = id => ({ id, title: `影片 ${id}`, creator: '創作者', url: videoUrl });

test('YouTube links resolve to a trusted player without arbitrary query injection', () => {
  for (const url of [videoUrl, 'https://youtu.be/LnIlsGFRB_4?t=20', 'https://www.youtube.com/shorts/LnIlsGFRB_4', 'https://www.youtube.com/live/LnIlsGFRB_4']) {
    const video = parseVideo(url);
    assert.equal(video.id, 'LnIlsGFRB_4');
    assert.equal(video.embed, 'https://www.youtube-nocookie.com/embed/LnIlsGFRB_4?playsinline=1&rel=0');
  }
  for (const url of ['javascript:alert(1)', 'https://youtube.com.evil.test/watch?v=LnIlsGFRB_4', 'https://www.youtube.com/watch?v=invalid', 'http://example.test/video.mp4', 'https://user:password@example.test/video.mp4']) {
    assert.throws(() => parseVideo(url));
  }
});

test('direct video files preserve signed query parameters', () => {
  const url = 'https://example.test/film.mp4?token=example';
  assert.deepEqual(parseVideo(url), { type: 'file', url, poster: '' });
  assert.equal(parseVideo('https://example.test/film.webm').type, 'file');
});

test('creator social links survive grouping and only use HTTPS destinations', () => {
  const socials = [{ label: 'YouTube 頻道', url: 'https://www.youtube.com/@creator' }, { label: 'Threads', url: 'https://www.threads.net/@creator' }];
  const data = { stages: [record('creator-video')], creators: { '創作者': { socials } } };
  assert.deepEqual(createCatalogue(data).stages[0].socials, socials);
  assert.deepEqual(createCatalogue({ stages: [record('without-profile')] }).stages[0].socials, []);
  for (const url of ['javascript:alert(1)', 'http://example.test/profile', 'https://user:password@example.test/profile']) {
    assert.throws(() => createCatalogue({ ...data, creators: { '創作者': { socials: [{ label: '社群', url }] } } }));
  }
});

test('stages occupy only the upper row and overflow into another aisle', () => {
  const data = { stages: Array.from({ length: 19 }, (_, i) => record(`stage-${i}`)) };
  const result = createCatalogue(data);
  assert.equal(result.aisles.length, 5);
  assert.deepEqual(result.aisles.map(a => a.islands.reduce((n, s) => n + s.booths.length, 0)), [4, 4, 4, 4, 3]);
  assert.ok(result.aisles.every(aisle => aisle.islands.every(island => island.side === 'N')));
  assert.equal(result.stages[4].boothId, 'S02-01');
  assert.equal(new Set(result.stages.map(s => s.boothId)).size, 19);
  for (const stage of result.stages) {
    const aisle = result.aisles.find(a => a.code === stage.aisleCode);
    assert.equal(aisle.stores[stage.id].name, stage.title);
    assert.equal(aisle.stores[stage.id].creator, '創作者');
    assert.ok(aisle.islands.some(island => island.booths.some(b => b.id === stage.boothId && b.store === stage.id)));
  }
  const reordered = createCatalogue({ stages: [...data.stages].reverse() });
  assert.equal(reordered.stages.find(s => s.id === 'stage-0').video.url, videoUrl);
});

test('empty, hidden and invalid records have defined outcomes', () => {
  assert.equal(createCatalogue({ stages: [] }).aisles[0].islands.length, 0);
  assert.equal(createCatalogue({ stages: [{ ...record('hidden'), disabled: true }] }).stages.length, 0);
  assert.throws(() => createCatalogue({ stages: [record('same'), record('same')] }));
  assert.throws(() => createCatalogue({ stages: [{ ...record('missing'), title: '' }] }));
  assert.throws(() => createCatalogue({}));
});

test('halls keep separate aisles and retain an empty hall for upcoming videos', () => {
  const halls = [{ id: 'puma', name: 'PUMA 館', code: 'S' }, { id: 'chiaohui', name: '巧慧館', code: 'C' }];
  const stages = Array.from({ length: 5 }, (_, i) => ({ ...record(`puma-${i}`), hall: 'puma' }));
  const empty = createCatalogue({ halls, stages });
  assert.deepEqual(empty.aisles.map(aisle => [aisle.code, aisle.hallName]), [['S01', 'PUMA 館'], ['S02', 'PUMA 館'], ['C01', '巧慧館']]);
  assert.deepEqual(empty.aisles[2].islands, []);
  assert.ok(empty.stages.every(stage => stage.hallId === 'puma'));

  const populated = createCatalogue({ halls, stages: [...stages, { ...record('chiaohui-one'), hall: 'chiaohui' }] });
  assert.equal(populated.stages.at(-1).boothId, 'C01-01');
  assert.deepEqual(populated.aisles[2].islands[0].booths.map(booth => booth.store), ['chiaohui-one']);
  assert.equal(populated.stages[4].boothId, 'S02-01');
  assert.throws(() => createCatalogue({ halls, stages: [{ ...record('unknown'), hall: 'unknown' }] }));
});

test('the current catalogue preserves video identity and groups single-song authors on the public stage', async () => {
  const data = JSON.parse(await readFile(new URL('../public/puma_oshen_wave/stage/videos.json', import.meta.url), 'utf8'));
  const catalogue = createCatalogue(data);
  const original = catalogue.stages.find(stage => stage.id === 'ocean-drifts-over-taipei');
  assert.equal(original.video.url, videoUrl);
  assert.equal(original.creator, '謝和弦 R-chord');
  const counts = new Map();
  for (const stage of catalogue.stages) counts.set(stage.creator, (counts.get(stage.creator) || 0) + 1);
  assert.equal(catalogue.halls.length, [...counts.values()].filter(count => count > 1).length + 1);
  assert.equal(catalogue.halls[0].name, '公共舞台');
  for (const stage of catalogue.stages) {
    if (counts.get(stage.creator) === 1) assert.equal(stage.hallId, 'public-stage');
    else assert.equal(catalogue.halls.find(hall => hall.id === stage.hallId).name, stage.creator);
  }
  assert.equal(new Set(catalogue.stages.filter(stage => stage.creator === '忙活').map(stage => stage.hallId)).size, 1);
});
