import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createCatalogue } from '../public/puma_oshen_wave/yilan_taiwan_11_07/js/data.js';
import { boothHtml } from '../public/puma_oshen_wave/yilan_taiwan_11_07/js/ui/booth-markup.js';
import { resolveDesignerRoute, designerPath } from '../public/puma_oshen_wave/yilan_taiwan_11_07/js/routes.js';
const data = JSON.parse(readFileSync(new URL('../public/puma_oshen_wave/yilan_taiwan_11_07.json', import.meta.url)));
const c = createCatalogue(data);
function record(id) {
  const boothId = c.designerBooths.get(id);
  const aisle = c.aisles.get(boothId.split('-')[0]);
  return { booth: aisle.islands.flatMap(i => i.booths).find(b => b.store === id), store: aisle.stores[id] };
}
test('all vendors are present and grouped by poster category', () => {
  assert.equal(data.designers.length, 62);
  assert.equal(c.index.totals.designers, 62);
  assert.deepEqual(Object.fromEntries([...new Set(data.designers.map(d => d.category))].map(category => [category, data.designers.filter(d => d.category === category).length])), {'暖心日常':13,'台派創集':22,'暖流食堂':12,'暖心甜點':15});
});
test('map and walk aisles preserve the four poster zones', () => {
  const zones = c.index.halls[0].zones;
  assert.deepEqual(zones.map(({name, booths}) => [name, booths]), [['暖心日常', 13], ['台派創集', 22], ['暖流食堂', 12], ['暖心甜點', 15]]);
  assert.equal(c.index.halls[0].aisles.length, 5);
  for (const zone of zones) {
    assert.ok(zone.aisles.length);
    for (const code of zone.aisles) {
      const aisle = c.aisles.get(code);
      for (const island of aisle.islands) {
        assert.equal(island.zone, zone.code);
        assert.equal(island.zoneName, zone.name);
        for (const booth of island.booths) assert.equal(data.designers.find(d => d.id === booth.store).category, zone.name);
      }
    }
  }
});
test('joint poster booths have separate booths with their own information', () => {
  for (const pair of [
    [['yilan-20261107-31', '熱血'], ['yilan-20261107-31-b', '石毛']],
    [['yilan-20261107-57', '熊甜宅'], ['yilan-20261107-57-b', '木子口']],
  ]) {
    assert.notEqual(c.designerBooths.get(pair[0][0]), c.designerBooths.get(pair[1][0]));
    for (const [id, name] of pair) {
      const source = data.designers.find(d => d.id === id);
      const {booth, store} = record(id);
      const html = boothHtml(booth, store);
      assert.equal(store.name, name);
      assert.equal(store.avatar, new URL(source.logo.url, 'https://minicourse.dev/puma_oshen_wave/yilan_taiwan_11_07.json').href);
      for (const url of Object.values(source.social).filter(Boolean)) assert.ok(html.includes(url.replaceAll('&', '&amp;')));
      if (source.address) assert.ok(html.includes(source.address));
      assert.ok(html.includes(`#/map/${id}`));
    }
  }
  const wood = record('yilan-20261107-57-b');
  assert.equal(wood.booth.works.length, 2);
  assert.equal(record('yilan-20261107-57').booth.works.length, 0);
});
test('unidentified booth has no invented social links or avatar', () => {
  const {booth, store} = record('yilan-20261107-40');
  const html = boothHtml(booth, store);
  assert.ok(!store.avatar);
  assert.doesNotMatch(html, /<a class="btn" href="https?:/);
});
test('profile links and routes stay within the Yilan market', () => {
  const id = 'yilan-20261107-57-b';
  const path = designerPath(id);
  assert.equal(path, `/puma_oshen_wave/yilan_taiwan_11_07/profiles/${id}/`);
  assert.deepEqual(resolveDesignerRoute(new URL(path, 'https://minicourse.dev'), {boot:true}), {mode:'designer', target:id});
  const {booth, store} = record(id);
  const html = boothHtml(booth, store);
  assert.ok(html.includes(`href="/puma_oshen_wave/yilan_taiwan_11_07/#/map/${id}">看看地圖</a>`));
  assert.deepEqual(resolveDesignerRoute(new URL(`/puma_oshen_wave/yilan_taiwan_11_07/#/map/${id}`, 'https://minicourse.dev'), {boot:true}), {mode:'map', target:id, then:undefined});
});
