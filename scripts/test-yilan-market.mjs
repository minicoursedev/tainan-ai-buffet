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
test('all poster booths are present and grouped by category', () => {
  assert.equal(data.designers.length, 60);
  assert.equal(c.index.totals.designers, 60);
  assert.deepEqual(Object.fromEntries([...new Set(data.designers.map(d => d.category))].map(category => [category, data.designers.filter(d => d.category === category).length])), {'暖心日常':13,'台派創集':21,'暖流食堂':12,'暖心甜點':14});
});
test('map and walk aisles preserve the four poster zones', () => {
  const zones = c.index.halls[0].zones;
  assert.deepEqual(zones.map(({name, booths}) => [name, booths]), [['暖心日常', 13], ['台派創集', 21], ['暖流食堂', 12], ['暖心甜點', 14]]);
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
test('joint booths retain both partners, social links, and addresses', () => {
  for (const [id, names] of [['yilan-20261107-31', ['熱血', '石毛']], ['yilan-20261107-57', ['熊甜宅', '木子口']]]) {
    const {booth, store} = record(id);
    const html = boothHtml(booth, store);
    for (const name of names) assert.ok(html.includes(name));
    for (const p of data.designers.find(d => d.id === id).partners) {
      for (const url of Object.values(p.social).filter(Boolean)) assert.ok(html.includes(url.replaceAll('&', '&amp;')));
      if (p.address) assert.ok(html.includes(p.address));
    }
  }
});
test('unidentified booth has no invented social links or avatar', () => {
  const {booth, store} = record('yilan-20261107-40');
  const html = boothHtml(booth, store);
  assert.ok(!store.avatar);
  assert.doesNotMatch(html, /<a class="btn" href="https?:/);
});
test('profile links and routes stay within the Yilan market', () => {
  const id = 'yilan-20261107-57';
  const path = designerPath(id);
  assert.equal(path, `/puma_oshen_wave/yilan_taiwan_11_07/profiles/${id}/`);
  assert.deepEqual(resolveDesignerRoute(new URL(path, 'https://minicourse.dev'), {boot:true}), {mode:'designer', target:id});
  const {booth, store} = record(id);
  const html = boothHtml(booth, store);
  assert.ok(html.includes(`href="/puma_oshen_wave/yilan_taiwan_11_07/#/map/${id}">看看地圖</a>`));
  assert.deepEqual(resolveDesignerRoute(new URL(`/puma_oshen_wave/yilan_taiwan_11_07/#/map/${id}`, 'https://minicourse.dev'), {boot:true}), {mode:'map', target:id, then:undefined});
});
