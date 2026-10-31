import assert from 'node:assert/strict';
import {test} from 'node:test';
import {findShopsByName} from '../public/puma_oshen_wave/shop-search.js';

const shops = [
  {id:'inside', name:'日常咖啡'},
  {id:'prefix', name:'咖啡小店'},
  {id:'exact', name:'咖啡'},
  {id:'disabled', name:'咖啡舊店', disabled:true},
  {id:'english', name:'B.B.CAFE 小黑熊咖啡'},
  {id:'taiwan', name:'臺灣小店'},
  {id:'same-name', name:'日常咖啡'}
];
const ids = query => findShopsByName(shops, query).map(shop => shop.id);

test('partial names rank exact and prefix matches first without changing input data', () => {
  const original = structuredClone(shops);
  assert.deepEqual(ids('咖啡'), ['exact','prefix','inside','english','same-name']);
  assert.deepEqual(shops, original);
});
test('English case, full-width input, spaces and 台／臺 work with store names', () => {
  assert.deepEqual(ids('  ＣＡＦＥ   小黑熊 '), ['english']);
  assert.deepEqual(ids('台灣'), ['taiwan']);
});
test('duplicate names remain separately selectable, disabled shops never appear', () => {
  assert.deepEqual(ids('日常'), ['inside','same-name']);
  assert.deepEqual(ids('舊店'), []);
  assert.deepEqual(ids('不存在的商店'), []);
  assert.deepEqual(ids('  '), shops.filter(shop => !shop.disabled).map(shop => shop.id));
});
