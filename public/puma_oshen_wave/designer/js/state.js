// Shared state and a tiny event bus.
export const state = {
  index: null,          // Catalogue summary
  hallCode: 'O',
  aisleCode: null,
  aisle: null,          // AisleData of the current aisle
  nearBooth: null,
};

const bus = new EventTarget();
export const emit = (type, detail = {}) => bus.dispatchEvent(new CustomEvent(type, { detail }));
export const on = (type, fn) => bus.addEventListener(type, e => fn(e.detail));

// Visited booths live only in this browser.
const KEY = 'pow-designer-visited';
let visited = new Set();
try { visited = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { visited = new Set(); }
export const isVisited = id => visited.has(id);
export const visitedCount = () => visited.size;
export function markVisited(id) {
  if (visited.has(id)) return;
  visited.add(id);
  try { localStorage.setItem(KEY, JSON.stringify([...visited])); } catch { /* private mode: keep it in memory */ }
  emit('visited', { id, count: visited.size });
}

export function findBoothIn(aisle, id) {
  if (!aisle) return null;
  for (const isl of aisle.islands) for (const b of isl.booths) if (b.id === id) return b;
  return null;
}

// The toast is a manual popover so it shows above open dialogs (top layer); older browsers fall back to [hidden].
let toastTimer = 0;
export function toast(text) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  const pop = typeof el.showPopover === 'function';
  if (pop) { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); } else el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (pop) { if (el.matches(':popover-open')) el.hidePopover(); } else el.hidden = true; }, 2600);
}
