// Designer dialog: profile, catalogue images, social links and share link.
import { state, markVisited, findBoothIn, toast } from '../state.js?v=20261031-yilan-zones';
import { loadAisle, aisleOfBooth } from '../data.js?v=20261031-oshen-shop';
import { goToBooth, designerBoothUrl } from '../nav.js?v=20261031-oshen-shop';
import { boothHtml, loadingHtml, failHtml } from './booth-markup.js?v=20261113-hide-oshen-stores';
import { designerRoot, updateDesignerMetadata } from '../routes.js';
import { retryOriginal } from '../images.js';
import { loadProducts, sampleProducts } from '../products.js?v=20261031-yilan-zones';

const dlg = () => document.getElementById('dlg-booth');

// The designer currently shown in the dialog.
let current = null;   // { boothId, booth, aisle }
let openToken = 0;


function paint() {
  const d = dlg();
  if (!d || !current) return;
  const { booth, aisle } = current;
  const store = aisle.stores?.[booth.store] || null;
  const scroll = d.querySelector('.dlg-body')?.scrollTop || 0;
  const hideOshenStores = document.documentElement.hasAttribute('data-oshen-stores-hidden');
  d.innerHTML = boothHtml(booth, store, { hideOshenStores });
  const body = d.querySelector('.dlg-body');
  if (body) body.scrollTop = scroll;
}

async function getAisleFor(boothId) {
  const code = aisleOfBooth(boothId);
  if (state.aisle && state.aisle.code === code) return state.aisle;
  return loadAisle(code);
}

export async function openBooth(boothId) {
  const d = dlg();
  if (!d || !boothId) return;
  const token = ++openToken;
  current = null;
  d.innerHTML = loadingHtml(boothId);
  if (!d.open) d.showModal();

  let aisle;
  try {
    aisle = await getAisleFor(boothId);
  } catch (e) {
    if (token !== openToken) return;
    d.innerHTML = failHtml(boothId, '攤位資料載入失敗，請再試一次。');
    return;
  }
  if (token !== openToken) return;
  if (!aisle) { if (d.open) d.close(); return; }
  let booth = findBoothIn(aisle, boothId);
  if (!booth) {
    d.innerHTML = failHtml(boothId, '找不到這個攤位。');
    return;
  }
  const store = aisle.stores?.[booth.store];
  if (store?.productsUrl) {
    try {
      const products = await loadProducts(store.productsUrl, booth.store);
      booth = { ...booth, works: sampleProducts(products), total: products.length, randomSelection: true };
    } catch {
      booth = { ...booth, productsError: true };
    }
    if (token !== openToken) return;
  }
  current = { boothId, booth, aisle };
  history.replaceState(null, '', designerBoothUrl(booth.store));
  updateDesignerMetadata({ id: booth.store, name: store?.name || '攤位' });
  paint();
  if (!d.open) d.showModal();
  d.querySelector('.dlg-close')?.focus();
  markVisited(boothId);
}

function switchToWalk() {
  const list = document.getElementById('stage-list');
  if (list && !list.hidden) document.querySelector('.modes button[data-mode="walk"]')?.click();
}

async function shareBooth(button) {
  const share = button.closest('.bo-share');
  const link = button.dataset.shareBooth;
  const status = share.querySelector('[role="status"]');
  button.disabled = true;
  status.textContent = '';
  try {
    const { qrcode } = await import('../../../vendor/qrcode-generator/qrcode-2.0.4.mjs');
    if (!button.isConnected || !dlg().open) return;
    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    const name = document.getElementById('booth-title').textContent;
    const shareDialog = document.getElementById('booth-share-dialog');
    document.getElementById('booth-share-title').textContent = name;
    const image = document.getElementById('booth-share-qr');
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qr.createSvgTag({ cellSize: 6, margin: 24, scalable: true }));
    image.alt = `${name} QR Code，掃描開啟 ${link}`;
    image.hidden = false;
    const url = document.getElementById('booth-share-url');
    url.href = link;
    url.textContent = link;
    document.getElementById('booth-share-status').textContent = '';
    shareDialog.showModal();
  } catch {
    status.textContent = '暫時無法產生 QRCode，請稍後再試。';
  } finally {
    button.disabled = false;
  }
}

function wire() {
  const d = dlg();
  if (!d) return;
  d.addEventListener('click', e => {
    const share = e.target.closest('[data-share-booth]');
    if (share) { shareBooth(share); return; }
    const go = e.target.closest('[data-go]');
    if (go) {
      const id = go.dataset.go;
      d.close();
      switchToWalk();
      goToBooth(id).catch(() => toast('換攤位失敗，請再試一次'));
    }
  });
  // a cover that fails to load falls back to the halftone square
  d.addEventListener('error', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (retryOriginal(img)) return;
    const box = img.parentElement;
    if (box?.classList.contains('bo-cover')) { box.classList.add('bo-cover-none'); img.remove(); }
    else if (box?.classList.contains('bo-avatar')) { box.classList.add('bo-avatar-none'); img.remove(); }
  }, true);
  d.addEventListener('close', () => {
    openToken++; current = null;
    if (location.pathname.startsWith(`${designerRoot}profiles/`) || location.hash.startsWith('#/designer/')) {
      history.replaceState(null, '', `${designerRoot}#/walk/${state.aisleCode || ''}`);
      updateDesignerMetadata();
    }
  });
  document.getElementById('booth-share-copy').addEventListener('click', async () => {
    const status = document.getElementById('booth-share-status');
    try {
      await navigator.clipboard.writeText(document.getElementById('booth-share-url').href);
      status.textContent = '已複製連結';
    } catch {
      status.textContent = '無法自動複製，請長按或右鍵上方網址複製。';
    }
  });
}

wire();
