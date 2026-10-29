import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readProducts, sampleProducts, loadProducts } from '../public/puma_oshen_wave/designer/js/products.js';

const base = 'https://example.test/catalogue.json';
const record = i => ({ id: `image-${i}`, url: `https://example.test/${i}.webp`, caption: `Caption ${i}`, width: 600, height: 800 });

test('samples at most 20 distinct images without changing caption associations or source order', () => {
  const products = readProducts({ designerId: 'test', products: Array.from({ length: 35 }, (_, i) => record(i)) }, 'test', base);
  const before = structuredClone(products);
  for (const random of [() => 0, () => 0.99, Math.random]) {
    const selected = sampleProducts(products, random);
    assert.equal(selected.length, 20);
    assert.equal(new Set(selected.map(p => p.cover)).size, 20);
    for (const p of selected) assert.deepEqual(p, products.find(source => source.id === p.id));
  }
  assert.deepEqual(products, before);
  assert.notDeepEqual(sampleProducts(products, () => 0), sampleProducts(products, () => 0.99));
});

test('small and empty catalogues use available images, never repeated padding', () => {
  for (const size of [0, 1, 2, 19, 20]) {
    const products = Array.from({ length: size }, (_, i) => record(i));
    assert.equal(sampleProducts(products).length, size);
  }
});

test('invalid, disabled and duplicate images are excluded before sampling', () => {
  const products = [record(0), record(0), { ...record(1), url: record(0).url },
    { ...record(2), disabled: true }, { ...record(3), url: 'javascript:alert(1)' },
    { ...record(4), id: '' }, null, record(5)];
  assert.deepEqual(readProducts({ designerId: 'test', products }, 'test', base).map(p => p.id), ['image-0', 'image-5']);
  assert.throws(() => readProducts({ designerId: 'other', products }, 'test', base));
  assert.throws(() => readProducts({ designerId: 'test' }, 'test', base));
});

test('a failed catalogue can retry; successful data is cached and resampled on opening', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return calls === 1 ? { ok: false, status: 503 } : {
      ok: true, json: async () => ({ designerId: 'retry', products: [record(1), record(2)] }),
    };
  });
  await assert.rejects(loadProducts(base, 'retry'));
  const first = await loadProducts(base, 'retry');
  const second = await loadProducts(base, 'retry');
  assert.equal(calls, 2);
  assert.deepEqual(first, second);
  assert.notDeepEqual(sampleProducts(first, () => 0), sampleProducts(second, () => 0.99));
});

test('Yang Liu captions stay attached to the supplied images and retain their natural ratios', async () => {
  const data = JSON.parse(await readFile(new URL('../public/puma_oshen_wave/data/designers/yang-liu.products.json', import.meta.url)));
  const products = readProducts(data, 'yang-liu', base);
  assert.equal(products.length, 2);
  assert.equal(products[0].caption, '招牌就是從這裡開始...');
  assert.equal(products[1].caption, '所以... 我們一起幸福');
  assert.equal(products[0].width / products[0].height, 600 / 800);
  assert.equal(products[1].width / products[1].height, 684 / 800);
});
