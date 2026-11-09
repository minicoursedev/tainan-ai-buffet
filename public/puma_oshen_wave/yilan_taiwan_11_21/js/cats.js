// Guide cats: which cats sit in an aisle and what they say. The walk view draws them; cats.json holds the cast and the lines.

async function loadJson(name) {
  try {
    const r = await fetch(new URL(name, new URL('../', import.meta.url)), { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
export const loadCats = () => loadJson('cats.json');
export const loadChatter = () => loadJson('chatter.json');

const CJK_GAP = /([⺀-鿿　-〿＀-￯])\s+(?=[⺀-鿿　-〿＀-￯])/g;
const cut = (s, n) => { const a = Array.from(s || ''); return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };

// Passers-by mention a designer from the booths visible on screen.
// booths: [Booth], stores: { storeId: Store }
export function praiseLine(chatter, booths, stores, last, rand = Math.random) {
  const pool = chatter?.lines?.designer || [];
  if (!pool.length) return null;
  for (let i = 0; i < 8 && booths.length; i++) {
    const b = booths[Math.floor(rand() * booths.length)];
    const st = stores?.[b.store];
    const designer = st?.owner || st?.name;
    if (!designer) continue;
    const line = pool[Math.floor(rand() * pool.length)].replaceAll('{designer}', cut(designer, 12))
      .replace(CJK_GAP, '$1');
    if (line !== last) return line;
  }
  return null;
}

// Context: hall, hallName, visited, closeLabel, leftText, closingSoon.
export function catFits(cat, ctx) {
  const w = cat.where || {};
  if (w.halls && !w.halls.includes(ctx.hall)) return false;
  return true;
}

const fill = (line, ctx) => line
  .replaceAll('{close}', ctx.closeLabel || '休市')
  .replaceAll('{left}', ctx.leftText || '一點點時間')
  .replaceAll('{visited}', String(ctx.visited || 0))
  .replaceAll('{hall}', ctx.hallName || '');

// Prefer the cat's own lines, with hall, visit and closing-time messages when relevant.
export function pickLine(cat, cfg, ctx, last, rand = Math.random) {
  const s = cfg.shared || {};
  const own = cat.lines || [];
  const extra = [
    ...(s[ctx.hall] || []),
    ...(ctx.visited > 0 ? s.visited || [] : []),
    ...(ctx.closingSoon ? [...(s.closing || []), ...(s.closing || [])] : []),
  ];
  const usable = l => (!l.includes('{visited}') || ctx.visited > 0) && (!l.includes('{left}') || ctx.closingSoon);
  const pool = (rand() < 0.6 && own.length ? own : [...own, ...extra]).filter(usable);
  const fresh = pool.filter(l => fill(l, ctx) !== last);
  const list = fresh.length ? fresh : pool;
  if (!list.length) return '喵。';
  return fill(list[Math.floor(rand() * list.length)], ctx);
}
