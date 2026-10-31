// Designer dialog: profile, catalogue images, social links and share link.
import { state, markVisited, findBoothIn, toast } from '../state.js?v=20261031-yilan-zones';
import { loadAisle, aisleOfBooth } from '../data.js?v=20261031-yilan-zones';
import { goToBooth, designerBoothUrl } from '../nav.js?v=20261031-yilan-zones';
import { boothHtml, loadingHtml, failHtml } from './booth-markup.js';
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
  d.innerHTML = boothHtml(booth, store);
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

async function copyBoothLink(button) {
  const share = button.closest('.bo-share');
  const link = button.dataset.copyBooth;
  const status = share.querySelector('[role="status"]');
  button.disabled = true;
  try {
    await navigator.clipboard.writeText(link);
    status.textContent = '攤位連結已複製';
  } catch {
    status.textContent = `無法自動複製，請複製此網址：${link}`;
  } finally {
    button.disabled = false;
  }
}

function wire() {
  const d = dlg();
  if (!d) return;
  d.addEventListener('click', e => {
    const copy = e.target.closest('[data-copy-booth]');
    if (copy) { copyBoothLink(copy); return; }
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
}

wire();
