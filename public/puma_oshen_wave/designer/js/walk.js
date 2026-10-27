// Walk view: one aisle drawn as a clean manga page. Ink outlines, halftone tones, warm white paper, pink and green accents.
// World: a horizontal aisle in world units. N booths on top (poster stand, table, cloth), S booths below (table seen from
// above, covers lying flat). Redraws only while something moves or an image arrives.
import { isVisited, toast } from './state.js';
import { catFits, pickLine, praiseLine } from './cats.js';
import { thumbnailUrl, retryOriginal } from './images.js';

const palette = getComputedStyle(document.documentElement);
const color = name => palette.getPropertyValue(name).trim();
const INK = color('--ink');
const PAPER = color('--paper');
const PAPER2 = color('--paper-2');
const PINK = color('--pink');
const PINK_SOFT = color('--pink-soft');
const GREEN = color('--green');
const GREEN_DEEP = color('--green-deep');
const GREEN_SOFT = color('--green-soft');
const FONT = '"Noto Sans TC", system-ui, -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Consolas, monospace';

// world layout (units)
const CROSS = 104;       // cross aisle between two islands on the same side
const EXIT_W = 190;      // exit area at each end of the aisle
const EXIT_TRIG = 72;    // walking this close to an end leaves the aisle
const Y = {
  SIGN_N: 10,            // hanging signs over the N rows
  POSTER: 56,            // top of the N poster stands
  BACK: 150,             // far floor line, back edge of the N tables
  TABLE_N: 162,          // front edge of the N tables
  CLOTH_N: 200,          // bottom of the N table cloth = top of the aisle
  AISLE_BOT: 352,        // front edge of the S tables
  FRONT_S: 362,          // S table top starts
  TABLE_S: 430,          // S table back edge
  STRIP: 458,            // foreground strip
  SIGN_S: 464,           // signs of the S rows
};
const WORLD_H = 500;
const PY_MIN = 232, PY_MAX = 342, AISLE_MID = 276, X_MIN = 22;
const SPEED = 260;
const KEYS = {
  arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
  arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
};
// physical keys, so WASD still works while a Chinese input method is on
const CODES = { KeyA: 'a', KeyD: 'd', KeyW: 'w', KeyS: 's', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright', ArrowUp: 'arrowup', ArrowDown: 'arrowdown' };
const keyOf = e => CODES[e.code] || (e.key || '').toLowerCase();
const HOLD_MS = 350;      // a press shorter than this is a tap, so the player does not start following the finger yet
const IMG_MAX = 260;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(s) {
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWalkView(canvas, { onNear = () => {}, onOpen = () => {}, onEnd = () => {}, catContext = () => ({}), display = 'booth', visited = isVisited } = {}) {
  const BW = display === 'stage' ? 224 : 112;
  const c = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let alive = true;
  let cssW = 0, cssH = 0, dpr = 1, scale = 1, offY = 0;
  let T = null;                                   // halftone patterns
  let data = null, L = null;                      // aisle data and its layout
  let opts = { prev: null, next: null };
  const player = { x: EXIT_W + 34, y: AISLE_MID, face: 1, phase: 0, moving: false };
  let camX = 0, camSnap = true;
  const keys = new Set();
  let ptr = null, hover = null, hoverExit = null;
  let target = null, pending = null, goal = null;
  let nearId, latchL = false, latchR = false;
  let npcs = [];
  let catCfg = null, cats = [];                   // Guide cats sitting in this aisle
  let chatter = null;                             // Designer dialogue from chatter.json
  let raf = 0, last = 0, frameNo = 0;
  const imgs = new Map();                         // url -> { st, cv, used }
  const fitCache = new Map();

  // ---------- drawing helpers ----------
  function tone(k, s, r) {
    const px = Math.max(2, Math.round(s * k));
    const p = document.createElement('canvas');
    p.width = p.height = px;
    const g = p.getContext('2d');
    g.fillStyle = GREEN;
    g.beginPath(); g.arc(px / 2, px / 2, r * px / s, 0, Math.PI * 2); g.fill();
    const pat = c.createPattern(p, 'repeat');
    pat.setTransform(new DOMMatrix([s / px, 0, 0, s / px, 0, 0]));
    return pat;
  }
  function hatch(k, s) {
    const px = Math.max(3, Math.round(s * k));
    const p = document.createElement('canvas');
    p.width = p.height = px;
    const g = p.getContext('2d');
    g.strokeStyle = INK; g.lineWidth = Math.max(1, 0.9 * px / s);
    for (const o of [-px, 0, px]) { g.beginPath(); g.moveTo(o, px); g.lineTo(o + px, 0); g.stroke(); }
    const pat = c.createPattern(p, 'repeat');
    pat.setTransform(new DOMMatrix([s / px, 0, 0, s / px, 0, 0]));
    return pat;
  }
  function buildTones() {
    const k = dpr * scale;
    T = { t1: tone(k, 5, 0.75), t2: tone(k, 5, 1.35), t3: tone(k, 5, 2.05), hatch: hatch(k, 6) };
  }
  function rr(x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function poly(pts) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  }
  function line(x0, y0, x1, y1) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
  function fit(text, maxW) {
    const key = c.font + '|' + maxW + '|' + text;
    let r = fitCache.get(key);
    if (r !== undefined) return r;
    if (c.measureText(text).width <= maxW) r = text;
    else {
      const ch = Array.from(text);
      let lo = 0, hi = ch.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (c.measureText(ch.slice(0, mid).join('') + '…').width <= maxW) lo = mid; else hi = mid - 1;
      }
      r = lo ? ch.slice(0, lo).join('').trimEnd() + '…' : '';
    }
    if (fitCache.size > 3000) fitCache.clear();
    fitCache.set(key, r);
    return r;
  }

  // ---------- images ----------
  function getImg(url) {
    if (!url) return null;
    let e = imgs.get(url);
    if (!e) e = loadImg(url);
    e.used = frameNo;
    return e.st === 'ok' ? e.cv : null;
  }
  function loadImg(url) {
    const e = { st: 'loading', cv: null, used: frameNo };
    imgs.set(url, e);
    if (imgs.size > IMG_MAX) evict();
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (!alive) return;
      try {
        const nw = img.naturalWidth, nh = img.naturalHeight;
        if (!nw || !nh) throw new Error('empty');
        const th = Math.min(nh, clamp(Math.ceil(78 * dpr * scale), 96, 360));
        const tw = Math.max(1, Math.round(nw * th / nh));
        const cv = document.createElement('canvas');
        cv.width = tw; cv.height = th;
        const g = cv.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, tw, th);
        e.cv = cv; e.st = 'ok';
        kick();
      } catch { e.st = 'err'; }
    };
    img.onerror = () => { if (alive && retryOriginal(img)) return; e.st = 'err'; };
    img.dataset.original = url;
    img.src = thumbnailUrl(url);
    return e;
  }
  function evict() {
    const old = [...imgs.entries()].filter(([, e]) => e.used < frameNo - 1 && e.st !== 'loading' && !e.keep).sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < old.length && imgs.size > IMG_MAX - 40; i++) imgs.delete(old[i][0]);
  }
  function drawFit(cv, x, y, w, h) {
    const ar = w / h, iar = cv.width / cv.height;
    let sx = 0, sy = 0, sw = cv.width, sh = cv.height;
    if (iar > ar) { sw = sh * ar; sx = (cv.width - sw) / 2; } else { sh = sw / ar; sy = (cv.height - sh) * 0.3; }
    c.drawImage(cv, sx, sy, sw, sh, x, y, w, h);
  }

  // ---------- layout ----------
  function signsOf(I) {
    const count = Math.max(1, Math.round(I.isl.booths.length / 3));
    const slot = I.isl.booths.length * BW / count;
    return Array.from({ length: count }, (_, i) => ({
      cx: I.x0 + slot * (i + 0.5), maxW: Math.min(slot - 12, 250),
      label: I.isl.zoneName || I.isl.zone || '',
    }));
  }
  function build(d) {
    const nIs = d.islands.filter(i => i.side === 'N');
    const sIs = d.islands.filter(i => i.side === 'S');
    const cols = Math.max(nIs.length, sIs.length);
    const booths = [], islands = [], byId = new Map();
    let x = EXIT_W;
    for (let k = 0; k < cols; k++) {
      const n = Math.max(nIs[k]?.booths.length || 0, sIs[k]?.booths.length || 0);
      for (const isl of [nIs[k], sIs[k]]) {
        if (!isl || !isl.booths.length) continue;
        const I = { side: isl.side, isl, x0: x, x1: x + isl.booths.length * BW, signs: [] };
        isl.booths.forEach((b, i) => {
          const B = { b, side: isl.side, x: x + i * BW, cx: x + i * BW + BW / 2, h: hash(b.id), I };
          booths.push(B); byId.set(b.id, B);
        });
        I.signs = signsOf(I);
        islands.push(I);
      }
      x += n * BW;
      if (k < cols - 1) x += CROSS;
    }
    const order = d.islands.flatMap(i => i.booths).map(b => byId.get(b.id)).filter(Boolean);
    return { booths, islands, byId, order, worldW: x + EXIT_W };
  }
  const frontOf = B => ({ x: B.cx, y: B.side === 'N' ? PY_MIN + 4 : PY_MAX - 4 });
  const clampWalk = p => ({ x: clamp(p.x, X_MIN, L.worldW - X_MIN), y: clamp(p.y, PY_MIN, PY_MAX) });
  const toWorld = (sx, sy) => ({ x: camX + sx / scale, y: (sy - offY) / scale });
  // the whole exit block at each end (sign, doorway, floor arrows) is one big tap target
  function exitAt(wx, wy) {
    if (wy > Y.STRIP + 10) return null;
    if (opts.prev && wx < EXIT_W) return 'prev';
    if (opts.next && wx > L.worldW - EXIT_W) return 'next';
    return null;
  }
  function boothAt(wx, wy) {
    for (const B of L.booths) {
      if (wx < B.x || wx > B.x + BW) continue;
      if (B.side === 'N' ? wy >= Y.POSTER - 4 && wy <= Y.CLOTH_N + 4 : wy >= Y.AISLE_BOT - 6 && wy <= Y.STRIP) return B;
    }
    return null;
  }

  // ---------- scene ----------
  function backdrop(x0, x1, yTop, yBot) {
    const w = x1 - x0;
    // far hall, a light tone behind the N booths
    c.fillStyle = PINK_SOFT; c.fillRect(x0, yTop, w, Y.BACK - yTop);
    c.save(); c.globalAlpha = 0.2;
    c.fillStyle = T.t1; c.fillRect(x0, yTop, w, Y.BACK - yTop); c.restore();
    // ceiling truss, the signs hang from it
    const ty = yTop + 8;
    c.strokeStyle = INK; c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x0, ty); c.lineTo(x1, ty); c.moveTo(x0, ty + 12); c.lineTo(x1, ty + 12);
    for (let x = Math.floor(x0 / 24) * 24; x < x1; x += 24) { c.moveTo(x, ty); c.lineTo(x + 12, ty + 12); c.lineTo(x + 24, ty); }
    c.stroke();
    c.lineWidth = 2.6; line(x0, Y.BACK, x1, Y.BACK);
    // floor seams that converge on the camera, so the floor reads as depth
    const vcx = camX + cssW / scale / 2;
    const floorEnd = display === 'stage' ? yBot : Y.STRIP;
    c.save(); c.globalAlpha = 0.16; c.lineWidth = 1;
    c.beginPath();
    for (let x = Math.floor((x0 - 320) / 140) * 140; x < x1 + 320; x += 140) { c.moveTo(x, Y.BACK); c.lineTo(x + (x - vcx) * 0.42, floorEnd); }
    for (const y of [Y.CLOTH_N + 50, Y.CLOTH_N + 104]) { c.moveTo(x0, y); c.lineTo(x1, y); }
    c.stroke();
    c.restore();
    if (display === 'stage') return; // The stage has an open audience area, without a lower row.
    // foreground strip with the backs of the next row
    c.fillStyle = GREEN_SOFT; c.fillRect(x0, Y.STRIP, w, yBot - Y.STRIP);
    c.save(); c.globalAlpha = 0.18;
    c.fillStyle = T.t1; c.fillRect(x0, Y.STRIP, w, yBot - Y.STRIP); c.restore();
    c.strokeStyle = INK; c.lineWidth = 2.6; line(x0, Y.STRIP, x1, Y.STRIP);
    c.lineWidth = 2; c.fillStyle = PAPER;
    for (let x = Math.floor(x0 / 98) * 98 + 30; x < x1; x += 98) { rr(x, Y.STRIP - 8, 34, 16, 6); c.fill(); c.stroke(); }
  }
  function strings(xa, xb, y0, y1) {
    c.strokeStyle = INK; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(xa, y0); c.lineTo(xa, y1); c.moveTo(xb, y0); c.lineTo(xb, y1); c.stroke();
  }
  function banquet(x0, x1) {
    if (display !== 'stage') return;
    const count = Math.max(1, Math.floor((L.worldW - 80) / 220));
    const start = (L.worldW - count * 220) / 2 + 110;
    const red = '#e96777', darkRed = '#bd465a';
    const ellipse = (x, y, rx, ry, fill, outline = true) => {
      c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      c.fillStyle = fill; c.fill();
      if (outline) { c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke(); }
    };
    for (let i = 0; i < count; i++) {
      const cx = start + i * 220, cy = 401;
      if (cx + 100 < x0 || cx - 100 > x1) continue;
      c.save();
      // Red plastic stools surround a round table, leaving the stage-side aisle open.
      ellipse(cx, cy + 24, 94, 34, 'rgba(48,59,59,.07)', false);
      for (let seat = 0; seat < 8; seat++) {
        const angle = seat * Math.PI / 4;
        const sx = cx + Math.cos(angle) * 87, sy = cy + Math.sin(angle) * 46;
        c.strokeStyle = INK; c.lineWidth = 1.6;
        line(sx - 5, sy + 3, sx - 7, sy + 12); line(sx + 5, sy + 3, sx + 7, sy + 12);
        rr(sx - 10, sy - 4, 20, 10, 3);
        c.fillStyle = red; c.fill(); c.stroke();
        c.strokeStyle = '#ffc3c6'; c.lineWidth = 1;
        line(sx - 5, sy - 1, sx + 5, sy - 1);
      }
      c.strokeStyle = INK; c.lineWidth = 3;
      line(cx - 30, cy + 18, cx - 36, cy + 47); line(cx + 30, cy + 18, cx + 36, cy + 47);
      line(cx - 30, cy + 24, cx + 32, cy + 43); line(cx + 30, cy + 24, cx - 32, cy + 43);
      // The lower ellipse gives the red tablecloth a hanging edge.
      ellipse(cx, cy + 10, 68, 34, darkRed);
      ellipse(cx, cy, 68, 34, red);
      c.beginPath(); c.ellipse(cx, cy, 63, 29, 0, 0, Math.PI * 2);
      c.strokeStyle = '#ffb0b7'; c.lineWidth = 1; c.stroke();
      // Individual rice bowls and pairs of chopsticks.
      for (let seat = 0; seat < 8; seat++) {
        const angle = seat * Math.PI / 4;
        const px = cx + Math.cos(angle) * 52, py = cy + Math.sin(angle) * 24;
        ellipse(px, py + 1.5, 5, 3.2, PAPER);
        ellipse(px, py, 5, 2.5, PAPER2);
        c.strokeStyle = '#704f3d'; c.lineWidth = 1;
        line(px + 7, py - 4, px + 7, py + 4); line(px + 9, py - 4, px + 9, py + 4);
      }
      // Shared platters: a whole fish, soup, greens and a braised dish.
      ellipse(cx - 18, cy - 7, 20, 8, PAPER);
      ellipse(cx - 19, cy - 7, 11, 3.5, '#8bc4b0');
      poly([[cx - 10, cy - 7], [cx - 4, cy - 10], [cx - 4, cy - 4]]);
      c.fillStyle = '#8bc4b0'; c.fill(); c.strokeStyle = INK; c.lineWidth = 0.8; c.stroke();
      ellipse(cx - 26, cy - 7, 0.9, 0.9, INK, false);
      for (const dx of [-23, -18, -13]) { c.strokeStyle = GREEN_DEEP; line(cx + dx, cy - 9, cx + dx + 3, cy - 5); }
      ellipse(cx + 19, cy - 6, 12, 8, PAPER);
      ellipse(cx + 19, cy - 8, 10, 5, '#e6ac54');
      for (const [dx, dy] of [[15, -9], [21, -7], [24, -10]]) ellipse(cx + dx, cy + dy, 2, 1, PAPER2, false);
      ellipse(cx + 15, cy + 12, 15, 6.5, PAPER);
      for (const [dx, dy] of [[8, 11], [14, 14], [21, 11], [15, 9], [23, 14]]) ellipse(cx + dx, cy + dy, 4, 2, GREEN, false);
      ellipse(cx - 18, cy + 12, 14, 6.5, PAPER);
      for (const [dx, dy] of [[-24, 11], [-17, 10], [-20, 14], [-12, 14]]) ellipse(cx + dx, cy + dy, 3.5, 2, '#be7748', false);
      c.restore();
    }
  }
  function board(cx, l1, l2, yTop, lit = false) {
    const w = 152, h = l2 ? 56 : 36, top = Y.SIGN_N, lx = cx - w / 2;
    strings(lx + 18, lx + w - 18, yTop + 20, top);
    c.fillStyle = INK; rr(lx + 3, top + 3, w, h, 8); c.fill();
    c.fillStyle = lit ? PINK_SOFT : PAPER; rr(lx, top, w, h, 8); c.fill();
    c.strokeStyle = INK; c.lineWidth = 2.4; c.stroke();
    c.fillStyle = INK; c.font = `700 14px ${FONT}`;
    c.fillText(fit(l1, w - 16), cx, top + (l2 ? 18 : h / 2 + 1));
    if (l2) { c.font = `600 18px ${MONO}`; c.fillText(l2, cx, top + 39); }
  }
  function exitDoor(cx, dir, label, code, yTop) {
    // doorway in the far wall
    c.fillStyle = T.t3; c.fillRect(cx - 58, 84, 116, Y.BACK - 84);
    c.strokeStyle = PAPER; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(cx - 51, Y.BACK); c.lineTo(cx - 51, 91); c.lineTo(cx + 51, 91); c.lineTo(cx + 51, Y.BACK); c.stroke();
    c.strokeStyle = INK; c.lineWidth = 2.6; c.strokeRect(cx - 58, 84, 116, Y.BACK - 84);
    // floor arrows
    c.strokeStyle = T.t3; c.lineWidth = 7;
    for (let i = 0; i < 3; i++) {
      const ax = cx + dir * (i - 1) * 30;
      c.beginPath(); c.moveTo(ax - dir * 9, AISLE_MID - 15); c.lineTo(ax + dir * 9, AISLE_MID); c.lineTo(ax - dir * 9, AISLE_MID + 15); c.stroke();
    }
    board(cx, label, code, yTop, hoverExit === (dir < 0 ? 'prev' : 'next'));
  }
  function wallEnd(dir, label, yTop) {
    const edge = dir < 0 ? 28 : L.worldW - 28;
    const bottom = display === 'stage' ? (cssH - offY) / scale + 2 : Y.STRIP;
    c.fillStyle = GREEN_SOFT;
    c.fillRect(dir < 0 ? edge - 600 : edge, yTop, 600, bottom - yTop);
    c.strokeStyle = INK; c.lineWidth = 2.6; line(edge, yTop, edge, bottom);
    board(dir < 0 ? EXIT_W / 2 + 10 : L.worldW - EXIT_W / 2 - 10, label, null, yTop);
  }
  function ends(x0, x1, yTop) {
    if (x0 < EXIT_W) {
      if (opts.prev) exitDoor(EXIT_W / 2, -1, '← 上一條走道', opts.prev, yTop);
      else wallEnd(-1, '第一條走道', yTop);
    }
    if (x1 > L.worldW - EXIT_W) {
      if (opts.next) exitDoor(L.worldW - EXIT_W / 2, 1, '下一條走道 →', opts.next, yTop);
      else wallEnd(1, '這館最後一條走道', yTop);
    }
  }

  function blank(x, y, w, h) {
    c.fillStyle = T.t1; c.fillRect(x, y, w, h);
    const r = Math.min(w, h) * 0.17;
    c.beginPath(); c.arc(x + w * 0.42, y + h * 0.4, r, 0, Math.PI * 2);
    c.fillStyle = PAPER; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
    line(x + w * 0.22, y + h * 0.8, x + w * 0.78, y + h * 0.62);
  }
  function cover(w, x, y, wd, ht, contain = false) {
    if (!w) {
      c.fillStyle = PAPER2; c.fillRect(x, y, wd, ht);
      c.strokeStyle = INK; c.lineWidth = 1.2; c.strokeRect(x, y, wd, ht);
      return;
    }
    const img = getImg(w.cover);
    if (img && contain) {
      const ratio = Math.min(wd / img.width, ht / img.height);
      const iw = img.width * ratio, ih = img.height * ratio;
      c.fillStyle = PAPER; c.fillRect(x, y, wd, ht);
      c.drawImage(img, x + (wd - iw) / 2, y + (ht - ih) / 2, iw, ih);
    } else if (img) drawFit(img, x, y, wd, ht);
    else blank(x, y, wd, ht);
    c.strokeStyle = INK; c.lineWidth = 1.5; c.strokeRect(x, y, wd, ht);
  }
  function stamp(x, y) {
    c.beginPath(); c.arc(x, y, 6.2, 0, Math.PI * 2);
    c.fillStyle = GREEN_DEEP; c.fill(); c.strokeStyle = PAPER; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.moveTo(x - 2.8, y + 0.2); c.lineTo(x - 0.7, y + 2.3); c.lineTo(x + 3, y - 2.3); c.lineWidth = 1.5; c.stroke();
  }
  function plate(cx, cy, b, full, near) {
    const label = full ? b.id : b.id.slice(b.id.indexOf('-') + 1);
    const w = full ? 66 : 32, h = 17;
    c.fillStyle = near ? PINK_SOFT : PAPER; c.fillRect(cx - w / 2, cy - h / 2, w, h);
    c.strokeStyle = INK; c.lineWidth = near ? 2 : 1.6; c.strokeRect(cx - w / 2, cy - h / 2, w, h);
    c.fillStyle = INK; c.font = `600 ${full ? 11.5 : 12.5}px ${MONO}`; c.fillText(label, cx, cy + 0.5);
    if (visited(b.id)) stamp(cx - w / 2 + 1, cy - h / 2 + 1);
  }
  const storeName = b => (data.stores[b.store] && data.stores[b.store].name) || '';
  const logoOf = b => data.stores[b.store]?.avatar || '';
  function squareDisplay(b, x, y, size) {
    const gap = 4, small = (size - gap) / 2;
    const logo = logoOf(b);
    cover(logo ? { cover: logo } : null, x, y, size, size, true);
    cover(b.works[0], x + size + gap, y, small, small);
    cover(b.works[1], x + size + gap, y + small + gap, small, small);
  }

  function tableDecor(B) {
    const { x, h } = B;
    c.strokeStyle = INK; c.lineWidth = 1.4;
    const stack = (sx, n) => {
      for (let i = 0; i < n; i++) {
        const yy = Y.BACK + 4 - i * 4;
        c.fillStyle = PAPER; c.fillRect(sx, yy, 18, 4); c.strokeRect(sx, yy, 18, 4);
      }
      c.fillStyle = T.t2; c.fillRect(sx + 1, Y.BACK + 4 - (n - 1) * 4 + 1, 16, 2);
    };
    const v = h % 3;
    if (v !== 1) stack(x + 9, 2 + (h >> 4) % 2);
    if (v !== 2) stack(x + BW - 27, 1 + (h >> 6) % 2);
    if (v === 1) {
      // a small tent card
      poly([[x + 12, Y.TABLE_N - 3], [x + 26, Y.TABLE_N - 3], [x + 19, Y.BACK - 1]]);
      c.fillStyle = PAPER; c.fill(); c.stroke();
    }
  }
  function videoStage(B) {
    const { b, x, cx } = B;
    const north = B.side === 'N', near = nearId === b.id;
    const top = north ? Y.POSTER : Y.AISLE_BOT + 10;
    const sw = BW - 64, sh = north ? 90 : 64, sx = cx - sw / 2;
    const floor = north ? Y.CLOTH_N : Y.STRIP - 4;
    // Raised platform, two speakers and a wide screen replace the market table.
    c.fillStyle = near ? PINK_SOFT : GREEN_SOFT;
    c.fillRect(x + 5, floor - 28, BW - 10, 28);
    c.strokeStyle = INK; c.lineWidth = 2;
    c.strokeRect(x + 5, floor - 28, BW - 10, 28);
    c.fillStyle = INK;
    for (const bx of [x + 10, x + BW - 26]) {
      c.fillRect(bx, top + 22, 16, sh - 8);
      c.strokeStyle = GREEN_SOFT; c.lineWidth = 1.5;
      for (const cy of [top + 34, top + sh - 2]) {
        c.beginPath(); c.arc(bx + 8, cy, 4, 0, Math.PI * 2); c.stroke();
      }
    }
    c.fillRect(sx - 3, top - 3, sw + 6, sh + 6);
    cover(b.works[0], sx, top, sw, sh, true);
    c.fillStyle = 'rgba(0,0,0,.65)';
    c.beginPath(); c.arc(cx, top + sh / 2, 16, 0, Math.PI * 2); c.fill();
    c.fillStyle = PAPER;
    poly([[cx - 4, top + sh / 2 - 7], [cx + 8, top + sh / 2], [cx - 4, top + sh / 2 + 7]]); c.fill();
    c.fillStyle = INK; c.font = `700 11px ${FONT}`;
    c.fillText(fit(storeName(b), BW - 24), cx, north ? top + sh + 13 : floor - 13);
    plate(cx, north ? floor - 13 : top - 6, b, true, near);
  }
  function boothN(B) {
    if (display === 'stage') return videoStage(B);
    const { b, x, cx } = B;
    const near = nearId === b.id, full = near || hover === b.id;
    const px = x + 9, pw = BW - 18, py = Y.POSTER, ph = Y.BACK - Y.POSTER;
    // poster stand with a halftone drop shadow and two clips
    c.fillStyle = T.t2; c.fillRect(px + 4, py + 4, pw, ph - 4);
    c.fillStyle = PAPER; c.fillRect(px, py, pw, ph);
    c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(px, py, pw, ph);
    c.fillStyle = INK; c.fillRect(px + 14, py - 3, 7, 5); c.fillRect(px + pw - 21, py - 3, 7, 5);
    c.lineWidth = 1.4; line(px, py + 15, px + pw, py + 15);
    c.fillStyle = INK; c.font = `700 10.5px ${FONT}`;
    c.fillText(fit(storeName(b), pw - 8), cx, py + 8.5);
    const size = Math.min(ph - 23, (pw - 10) * 2 / 3);
    const width = size + 4 + (size - 4) / 2;
    squareDisplay(b, cx - width / 2, py + 19 + (ph - 23 - size) / 2, size);
    // table top
    poly([[x + 1, Y.TABLE_N], [x + BW - 1, Y.TABLE_N], [x + BW - 6, Y.BACK], [x + 6, Y.BACK]]);
    c.fillStyle = PAPER; c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
    tableDecor(B);
    // cloth with two fold highlights
    c.fillStyle = B.h % 2 ? PINK_SOFT : GREEN_SOFT; c.fillRect(x + 1, Y.TABLE_N, BW - 2, Y.CLOTH_N - Y.TABLE_N);
    c.strokeStyle = PAPER; c.lineWidth = 1.3;
    c.beginPath();
    for (const f of [0.2, 0.8]) { const fx = x + BW * f; c.moveTo(fx, Y.TABLE_N + 5); c.quadraticCurveTo(fx + 2.5, Y.TABLE_N + 20, fx - 1, Y.CLOTH_N - 3); }
    c.stroke();
    c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(x + 1, Y.TABLE_N, BW - 2, Y.CLOTH_N - Y.TABLE_N);
    plate(cx, 181, b, full, near);
  }
  function boothS(B) {
    if (display === 'stage') return videoStage(B);
    const { b, x, cx } = B;
    const near = nearId === b.id, full = near || hover === b.id;
    // front of the table, seen at a steep angle
    c.fillStyle = B.h % 2 ? GREEN_SOFT : PINK_SOFT; c.fillRect(x + 1, Y.AISLE_BOT, BW - 2, Y.FRONT_S - Y.AISLE_BOT);
    c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(x + 1, Y.AISLE_BOT, BW - 2, Y.FRONT_S - Y.AISLE_BOT);
    // table top
    c.fillStyle = PAPER; c.fillRect(x + 1, Y.FRONT_S, BW - 2, Y.TABLE_S - Y.FRONT_S);
    c.strokeRect(x + 1, Y.FRONT_S, BW - 2, Y.TABLE_S - Y.FRONT_S);
    // The same square logo and work frames on the south table top.
    const size = Y.TABLE_S - Y.FRONT_S - 28;
    const width = size + 4 + (size - 4) / 2;
    squareDisplay(b, cx - width / 2, Y.FRONT_S + 6, size);
    // name card at the back of the table
    c.fillStyle = PAPER; c.fillRect(x + 9, Y.TABLE_S - 20, BW - 18, 14);
    c.strokeStyle = INK; c.lineWidth = 1.2; c.strokeRect(x + 9, Y.TABLE_S - 20, BW - 18, 14);
    c.fillStyle = INK; c.font = `700 10.5px ${FONT}`;
    c.fillText(fit(storeName(b), BW - 26), cx, Y.TABLE_S - 12.5);
    plate(cx, Y.AISLE_BOT + 5, b, full, near);
  }
  function islandEdges(x0, x1) {
    c.strokeStyle = INK;
    for (const I of L.islands) {
      if (I.x1 < x0 || I.x0 > x1) continue;
      c.lineWidth = 2.8;
      if (I.side === 'N') {
        c.fillStyle = T.hatch; c.fillRect(I.x0 + 2, Y.CLOTH_N + 1, I.x1 - I.x0 - 4, 7);
        line(I.x0 + 1, Y.CLOTH_N, I.x1 - 1, Y.CLOTH_N);
        line(I.x0 + 1, Y.TABLE_N - 1, I.x0 + 1, Y.CLOTH_N + 8);
        line(I.x1 - 1, Y.TABLE_N - 1, I.x1 - 1, Y.CLOTH_N + 8);
      } else {
        line(I.x0 + 1, Y.AISLE_BOT, I.x1 - 1, Y.AISLE_BOT);
        line(I.x0 + 1, Y.AISLE_BOT, I.x0 + 1, Y.TABLE_S);
        line(I.x1 - 1, Y.AISLE_BOT, I.x1 - 1, Y.TABLE_S);
      }
    }
  }
  function sign(s, side, yTop) {
    const h = 34, top = side === 'N' ? Y.SIGN_N : Y.SIGN_S;
    c.font = `900 17px ${FONT}`;
    const text = fit(s.label, s.maxW - 34);
    const w = Math.min(s.maxW, c.measureText(text).width + 34);
    const lx = s.cx - w / 2;
    if (side === 'N') strings(lx + 14, lx + w - 14, yTop + 20, top);
    c.fillStyle = INK; rr(lx + 3, top + 3, w, h, 10); c.fill();
    c.fillStyle = GREEN_DEEP; rr(lx, top, w, h, 10); c.fill();
    c.strokeStyle = INK; c.lineWidth = 2.4; c.stroke();
    c.fillStyle = PAPER;
    c.fillText(text, s.cx, top + h / 2 + 1);
  }
  function person(x, y, s, cloth, face, phase, moving, bag, lw, glowColor = PINK) {
    const sw = moving ? Math.sin(phase) * 2.6 * s : 0;
    const bob = moving ? -Math.abs(Math.sin(phase)) * 1.2 * s : 0;
    c.fillStyle = T.t2; c.beginPath(); c.ellipse(x, y + 1, 10.5 * s, 3 * s, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = INK; c.lineWidth = lw;
    c.beginPath();
    c.moveTo(x - 3 * s, y - 5 * s + bob); c.lineTo(x - 3 * s + sw, y);
    c.moveTo(x + 3 * s, y - 5 * s + bob); c.lineTo(x + 3 * s - sw, y);
    c.stroke();
    rr(x - 7 * s, y - 20 * s + bob, 14 * s, 16 * s, 4 * s); c.fillStyle = cloth; c.fill(); c.stroke();
    if (bag && display !== 'stage') {
      const bw = 7.5 * s, bh = 8.5 * s, bx = face > 0 ? x + 4.5 * s : x - 4.5 * s - bw, by = y - 14 * s + bob - sw * 0.2;
      c.beginPath(); c.moveTo(bx + 1.6 * s, by); c.quadraticCurveTo(bx + bw / 2, by - 6 * s, bx + bw - 1.6 * s, by); c.lineWidth = 1.6; c.stroke();
      c.fillStyle = bag; c.fillRect(bx, by, bw, bh); c.lineWidth = lw - 0.3; c.strokeRect(bx, by, bw, bh);
    }
    c.lineWidth = lw;
    const hy = y - 27 * s + bob;
    c.beginPath(); c.arc(x, hy, 8.2 * s, 0, Math.PI * 2); c.fillStyle = PAPER; c.fill(); c.stroke();
    c.beginPath(); c.arc(x - face * 0.7 * s, hy - 1 * s, 8.2 * s, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); c.fillStyle = INK; c.fill();
    c.beginPath();
    for (const ex of [-2.4, 2.4]) { c.moveTo(x + face * 1.8 * s + ex * s + 0.9 * s, hy + 2 * s); c.arc(x + face * 1.8 * s + ex * s, hy + 2 * s, 0.9 * s, 0, Math.PI * 2); }
    c.fill();
    if (display === 'stage') {
      // Raise a light stick beside the face; its gentle tilt follows the walking pose.
      const hx = x + face * 12 * s, handY = y - 17 * s + bob;
      c.strokeStyle = INK; c.lineWidth = lw;
      line(x + face * 6 * s, y - 18 * s + bob, hx, handY);
      c.save(); c.translate(hx, handY); c.rotate(face * (0.18 + sw / s * 0.035));
      c.lineCap = 'round';
      c.strokeStyle = glowColor; c.globalAlpha = 0.18; c.lineWidth = 7 * s;
      line(0, -4 * s, 0, -17 * s);
      c.globalAlpha = 1; c.strokeStyle = INK; c.lineWidth = 4 * s;
      line(0, 1 * s, 0, -17 * s);
      c.strokeStyle = glowColor; c.lineWidth = 2.7 * s;
      line(0, -4 * s, 0, -17 * s);
      c.strokeStyle = PAPER; c.lineWidth = 0.75 * s;
      line(-0.55 * s, -5 * s, -0.55 * s, -16 * s);
      c.lineWidth = 2.5 * s; line(0, 0, 0, -2.5 * s);
      c.beginPath(); c.arc(0, 0, 1.7 * s, 0, Math.PI * 2);
      c.fillStyle = PAPER; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.6; c.stroke();
      c.restore();
    }
  }
  function people(x0, x1) {
    const list = [];
    for (const n of npcs) if (n.x > x0 - 40 && n.x < x1 + 40) list.push(n);
    for (const k of cats) if (k.x > x0 - 40 && k.x < x1 + 40) list.push(k);
    list.push(null);
    list.sort((a, b) => (a ? a.y : player.y) - (b ? b.y : player.y));
    const cloths = [GREEN_SOFT, PAPER2, PINK_SOFT];
    const glowColors = [PINK, '#4fe590', '#39d9ff'];
    for (const n of list) {
      if (n && n.cat) drawCat(n);
      else if (n) person(n.x, n.y, n.s, cloths[n.cloth], n.dir, n.phase, n.pause <= 0 && !reduce.matches, n.bag ? PAPER : null, 2, glowColors[n.cloth]);
      else person(player.x, player.y, 2, GREEN, player.face, player.phase, player.moving, PINK, 2.5);
    }
  }
  // ---------- Guide cats ----------
  const CAT_S = 1.6, CAT_H = 62;
  // nobody stands on a cat: CAT_R is the cat's footprint, the floor's depth (y) counts 1.6 times
  const CAT_R = 30;
  function onCat(x, y, extra = 0) { return cats.some(k => Math.hypot(x - k.x, (y - k.y) * 1.6) < CAT_R + extra); }
  function keepOffCats(x, y) {
    for (const k of cats) {
      const dx = x - k.x;
      let dy = (y - k.y) * 1.6;
      if (Math.hypot(dx, dy) >= CAT_R) continue;
      if (Math.abs(dy) < 2) dy = k.y > AISLE_MID ? -2 : 2; // head-on: lean toward the roomier side so the walk slides around
      const d = Math.hypot(dx, dy);
      x = k.x + dx / d * CAT_R; y = k.y + dy / d * CAT_R / 1.6; // slide around the cat
    }
    return [x, y];
  }
  // stand-in drawing until cats.json gets an image: a sitting cat in ink, with a pink collar and bell
  function catShape(x, y, s, face, look) {
    const body = look === 'black' ? INK : look === 'tone' ? T.t2 : PAPER;
    const head = look === 'black' ? INK : PAPER;
    c.fillStyle = T.t2; c.beginPath(); c.ellipse(x, y + 1, 12 * s, 3 * s, 0, 0, Math.PI * 2); c.fill();
    const tail = () => { c.beginPath(); c.moveTo(x - face * 6 * s, y - 3 * s); c.bezierCurveTo(x - face * 19 * s, y - 1 * s, x - face * 20 * s, y - 15 * s, x - face * 13 * s, y - 21 * s); };
    c.strokeStyle = INK; c.lineWidth = 5.5; tail(); c.stroke();
    if (look !== 'black') { c.strokeStyle = PAPER; c.lineWidth = 2.6; tail(); c.stroke(); }
    c.strokeStyle = INK; c.lineWidth = 2.2;
    c.beginPath(); c.ellipse(x, y - 9 * s, 9 * s, 10 * s, 0, 0, Math.PI * 2); c.fillStyle = body; c.fill();
    if (look === 'calico') {
      c.save(); c.clip();
      c.fillStyle = T.t3; c.beginPath(); c.ellipse(x - face * 5 * s, y - 13 * s, 6 * s, 5 * s, 0.4, 0, Math.PI * 2); c.fill();
      c.fillStyle = INK; c.beginPath(); c.ellipse(x + face * 6 * s, y - 4 * s, 4 * s, 3.2 * s, -0.3, 0, Math.PI * 2); c.fill();
      c.restore();
      c.beginPath(); c.ellipse(x, y - 9 * s, 9 * s, 10 * s, 0, 0, Math.PI * 2);
    }
    c.stroke();
    for (const px of [-3, 3]) {
      c.beginPath(); c.ellipse(x + face * 3 * s + px * s, y - 0.8 * s, 2.6 * s, 1.8 * s, 0, 0, Math.PI * 2);
      c.fillStyle = head; c.fill(); c.lineWidth = 1.6; c.stroke();
    }
    const hx = x + face * 2 * s, hy = y - 22 * s;
    c.lineWidth = 2.2;
    for (const side of [-1, 1]) {
      poly([[hx + side * 7.2 * s, hy - 2.5 * s], [hx + side * 6 * s, hy - 12.5 * s], [hx + side * 1.4 * s, hy - 7.6 * s]]);
      c.fillStyle = head; c.fill(); c.stroke();
    }
    c.beginPath(); c.arc(hx, hy, 8 * s, 0, Math.PI * 2); c.fillStyle = head; c.fill(); c.stroke();
    if (look === 'tone' || look === 'calico') {
      c.save(); c.beginPath(); c.arc(hx, hy, 8 * s, Math.PI * 1.05, Math.PI * 1.6); c.lineTo(hx, hy); c.closePath();
      c.fillStyle = T.t2; c.fill(); c.restore();
    }
    const eye = look === 'black' ? PAPER : INK;
    for (const ex of [-2.8, 2.8]) { c.beginPath(); c.arc(hx + face * 1.4 * s + ex * s, hy + 0.4 * s, 1.15 * s, 0, Math.PI * 2); c.fillStyle = eye; c.fill(); }
    c.strokeStyle = look === 'black' ? PAPER : INK; c.lineWidth = 1.1;
    c.beginPath();
    const mx = hx + face * 1.4 * s, my = hy + 3.4 * s;
    c.moveTo(mx - 1.8 * s, my); c.quadraticCurveTo(mx - 0.9 * s, my + 1.4 * s, mx, my); c.quadraticCurveTo(mx + 0.9 * s, my + 1.4 * s, mx + 1.8 * s, my);
    for (const sd of [-1, 1]) for (const dy of [-0.6, 1.2]) { c.moveTo(hx + sd * 4.6 * s, hy + 2.6 * s + dy * s * 0.6); c.lineTo(hx + sd * 10.5 * s, hy + 2 * s + dy * s); }
    c.stroke();
    c.strokeStyle = INK; c.lineWidth = 1.4;
    rr(hx - 6 * s, hy + 6.4 * s, 12 * s, 2.6 * s, 1.2 * s); c.fillStyle = PINK_SOFT; c.fill(); c.stroke();
    c.beginPath(); c.arc(hx + face * 1 * s, hy + 10.2 * s, 1.7 * s, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  function drawCat(k) {
    const url = k.cfg.image;
    const im = url ? getImg(url) : null;
    if (url) imgs.get(url).keep = true;
    if (!im) {
      // the picture is still on its way: draw nothing rather than flash the stand-in cat
      if (url && imgs.get(url)?.st !== 'err') return;
      catShape(k.x, k.y, CAT_S, k.face, k.cfg.look);
      return;
    }
    // drawn images face right; flip when the cat looks left
    const h = CAT_H, w = h * im.width / im.height;
    c.fillStyle = T.t2; c.beginPath(); c.ellipse(k.x, k.y + 1, w * 0.42, 4.5, 0, 0, Math.PI * 2); c.fill();
    c.save(); c.translate(k.x, k.y); if (k.face < 0) c.scale(-1, 1);
    c.drawImage(im, -w / 2, -h, w, h);
    c.restore();
  }
  function wrapText(text, maxW) {
    const out = [];
    let cur = '';
    for (const ch of Array.from(text)) {
      if (cur && c.measureText(cur + ch).width > maxW) {
        // closing punctuation stays on the line it closes
        if ('，。！？、）」'.includes(ch)) { out.push(cur + ch); cur = ''; continue; }
        out.push(cur); cur = ch;
      } else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }
  // a manga speech balloon whose tail points at (x, tipY); kept inside the visible part of the aisle
  function speech(x, tipY, text, x0, x1) {
    c.font = `700 13px ${FONT}`;
    const pad = 10, lh = 19, lines = wrapText(text, 172);
    const w = Math.max(...lines.map(l => c.measureText(l).width)) + pad * 2;
    const h = lines.length * lh + pad * 2 - 4;
    const bx = clamp(x - w / 2, x0 + 36, Math.max(x0 + 36, x1 - 36 - w));
    const by = tipY - 14 - h;
    const tx = clamp(x, bx + 16, bx + w - 16);
    c.fillStyle = INK; rr(bx + 3, by + 3, w, h, 12); c.fill();
    c.fillStyle = PAPER; rr(bx, by, w, h, 12); c.fill();
    c.strokeStyle = INK; c.lineWidth = 2.2; c.stroke();
    c.beginPath(); c.moveTo(tx - 7, by + h - 1.5); c.lineTo(x, tipY); c.lineTo(tx + 7, by + h - 1.5); c.closePath(); c.fillStyle = PAPER; c.fill();
    c.beginPath(); c.moveTo(tx - 7, by + h); c.lineTo(x, tipY); c.lineTo(tx + 7, by + h); c.stroke();
    c.fillStyle = INK; c.textAlign = 'left';
    lines.forEach((l, i) => c.fillText(l, bx + pad, by + pad + lh * i + lh / 2 - 2));
    c.textAlign = 'center';
  }
  const catCtx = () => ({ hall: data?.hall, hallName: data?.hallName, ...catContext() });
  function initCats(code) {
    cats = [];
    if (!catCfg || !L) return;
    const ctx = catCtx();
    const pool = (catCfg.cats || []).filter(cat => catFits(cat, ctx));
    if (!pool.length) return;
    const R = rng(hash('pow-designer:cats:' + code));
    const order = pool.map(cat => [R(), cat]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
    const n = Math.min(catCfg.perAisle || 2, order.length);
    const lo = EXIT_W + 70, span = Math.max(0, L.worldW - 2 * lo);
    for (let i = 0; i < n; i++) {
      const x = span ? lo + span * ((i + 0.2 + R() * 0.6) / n) : L.worldW / 2;
      // middle of the aisle only, so the spots in front of the booths stay free
      const y = PY_MIN + 34 + R() * (PY_MAX - PY_MIN - 64);
      cats.push({ cat: true, cfg: order[i], x, y, face: R() < 0.5 ? -1 : 1, line: null, last: null });
    }
    // passers-by that start on top of a cat step aside
    for (const n of npcs) for (const k of cats) {
      if (Math.hypot(n.x - k.x, (n.y - k.y) * 1.6) < CAT_R + 12) n.x = k.x + (n.x < k.x ? -1 : 1) * (CAT_R + 26);
    }
  }
  function say(k) {
    k.line = pickLine(k.cfg, catCfg, catCtx(), k.last);
    k.last = k.line;
    k.face = player.x > k.x ? 1 : -1;
  }
  // a cat speaks when the player comes close, and goes quiet once the player walks away
  function talk() {
    const r = catCfg?.radius || 90;
    for (const k of cats) {
      const d = Math.hypot(k.x - player.x, (k.y - player.y) * 1.4);
      if (d < r) { if (!k.line) say(k); } else if (d > r * 1.35) k.line = null;
    }
    if (!chatter) return;
    // only the closest passer-by speaks, so the aisle does not turn into a crowd of balloons
    const rn = chatter.radius || 70;
    const dist = n => Math.hypot(n.x - player.x, (n.y - player.y) * 1.4);
    let near = null;
    for (const n of npcs) if (!near || dist(n) < dist(near)) near = n;
    for (const n of npcs) {
      if (n === near && dist(n) < rn) { if (!n.line) praise(n); } else if (n.line && dist(n) > rn * 1.35) n.line = null;
    }
  }
  // A passer-by mentions a designer from the booths on screen.
  function praise(n) {
    const vw = cssW / scale;
    const onScreen = L.booths.filter(B => B.x + BW >= camX && B.x <= camX + vw).map(B => B.b);
    n.line = praiseLine(chatter, onScreen, data.stores, n.last) || n.line;
    n.last = n.line;
  }
  const npcAt = (wx, wy) => npcs.find(n => Math.abs(wx - n.x) < 9 * n.s && wy > n.y - 36 * n.s && wy < n.y + 4) || null;
  const catAt = (wx, wy) => cats.find(k => Math.abs(wx - k.x) < 22 && wy > k.y - CAT_H - 4 && wy < k.y + 8) || null;

  function marker() {
    if (!target || ptr) return;
    c.beginPath(); c.ellipse(target.x, target.y + 1, 12, 4, 0, 0, Math.PI * 2);
    c.fillStyle = T.t1; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
  }
  function prefetch(x0, x1) {
    for (const B of L.booths) {
      if (B.x + BW < x0 || B.x > x1) continue;
      getImg(logoOf(B.b));
      for (const w of B.b.works.slice(0, 2)) getImg(w.cover);
    }
  }

  function draw() {
    frameNo++;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = PAPER2; c.fillRect(0, 0, canvas.width, canvas.height);
    if (!L || !cssW || !T) return;
    const k = dpr * scale;
    c.setTransform(k, 0, 0, k, -camX * k, offY * dpr);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const vw = cssW / scale;
    const x0 = camX - 24, x1 = camX + vw + 24;
    const yTop = -offY / scale - 2, yBot = (cssH - offY) / scale + 2;
    backdrop(x0, x1, yTop, yBot);
    ends(x0, x1, yTop);
    const vis = L.booths.filter(B => B.x + BW >= x0 && B.x <= x1);
    for (const B of vis) if (B.side === 'N') boothN(B);
    for (const B of vis) if (B.side === 'S') boothS(B);
    islandEdges(x0, x1);
    for (const I of L.islands) for (const s of I.signs) if (s.cx + 140 >= x0 && s.cx - 140 <= x1) sign(s, I.side, yTop);
    banquet(x0, x1);
    marker();
    people(x0, x1);
    for (const k of cats) if (k.line) speech(k.x, k.y - CAT_H - 2, k.line, x0, x1);
    for (const n of npcs) if (n.line) speech(n.x, n.y - 36 * n.s - 2, n.line, x0, x1);
    prefetch(x0 - BW * 2, x1 + BW * 2);
  }

  // ---------- motion ----------
  function initNpcs(code) {
    const R = rng(hash('pow-designer:' + code));
    const n = 3 + Math.floor(R() * 4);
    npcs = [];
    for (let i = 0; i < n; i++) {
      npcs.push({
        x: EXIT_W + R() * Math.max(40, L.worldW - 2 * EXIT_W), y: PY_MIN + 10 + R() * (PY_MAX - PY_MIN - 20),
        s: 1.75 + R() * 0.3, cloth: i % 3, dir: R() < 0.5 ? -1 : 1, speed: 22 + R() * 26, phase: R() * 6,
        pause: 0, bag: R() < 0.5, R: rng(hash(code + ':' + i)),
      });
    }
    npcs.sort((a, b) => a.y - b.y);
  }
  function stepNpcs(dt) {
    for (const n of npcs) {
      if (n.pause > 0) { n.pause -= dt; continue; }
      const nx = n.x + n.dir * n.speed * dt;
      if (onCat(nx, n.y, 8)) { n.dir = -n.dir; continue; } // turn back before walking into a cat
      n.x = nx;
      n.phase += n.speed * dt * 0.2;
      if (n.x < EXIT_W) n.dir = 1; else if (n.x > L.worldW - EXIT_W) n.dir = -1;
      if (n.R() < dt * 0.12) n.pause = 0.8 + n.R() * 1.8;
    }
  }
  function placeCamera(dt, snap) {
    const vw = cssW / scale;
    let tc;
    if (!L || L.worldW <= vw) tc = L ? (L.worldW - vw) / 2 : 0;
    else tc = clamp(player.x - vw / 2 + player.face * vw * 0.08, 0, L.worldW - vw);
    if (snap || reduce.matches) { camX = tc; return false; }
    const d = tc - camX;
    if (Math.abs(d) < 0.3) { camX = tc; return false; }
    camX += d * (1 - Math.exp(-dt * 6));
    return true;
  }
  function updateNear(force) {
    let id = null;
    if (L) {
      const side = display === 'stage' || player.y < AISLE_MID ? 'N' : 'S';
      const fx = player.x + player.face * BW * 0.12;
      let best = null, bd = Infinity;
      for (const B of L.booths) {
        if (B.side !== side) continue;
        const d = Math.abs(B.cx - fx);
        if (d < bd) { bd = d; best = B; }
      }
      if (best && Math.abs(best.cx - player.x) < BW * 0.8) id = best.b.id;
    }
    if (force || id !== nearId) { nearId = id; onNear(id); }
  }
  function halt() { target = null; pending = null; goal = null; }
  // leaving through an exit: stop every input so nothing keeps walking under the next dialog
  function stopAll() {
    halt(); keys.clear();
    if (ptr) { try { canvas.releasePointerCapture(ptr.id); } catch { /* already released */ } ptr = null; }
  }
  function checkExits() {
    const x = player.x;
    if (x < EXIT_TRIG) {
      if (!latchL && opts.prev) { latchL = true; stopAll(); onEnd('prev'); }
    } else if (x > EXIT_TRIG + 36) latchL = false;
    const edge = L.worldW - EXIT_TRIG;
    if (x > edge) {
      if (!latchR && opts.next) {
        latchR = true; stopAll();
        onEnd('next');
      }
    } else if (x < edge - 36) latchR = false;
  }
  function update(dt) {
    if (!L) return false;
    let mx = 0, my = 0, want = false, arrived = false;
    if (keys.size) {
      let dx = 0, dy = 0;
      for (const k of keys) { dx += KEYS[k][0]; dy += KEYS[k][1]; }
      const n = Math.hypot(dx, dy);
      if (n) { mx = dx / n * SPEED * dt; my = dy / n * SPEED * dt; }
      want = true;
    } else {
      const follow = ptr && (ptr.moved || performance.now() - ptr.t >= HOLD_MS);
      if (ptr && !follow) want = true; // still deciding between a tap and a drag
      const tg = follow ? clampWalk(toWorld(ptr.sx, ptr.sy)) : ptr ? null : target;
      if (tg) {
        const dx = tg.x - player.x, dy = tg.y - player.y, d = Math.hypot(dx, dy), step = SPEED * dt;
        if (ptr) {
          if (d > 6) { const st = Math.min(step, d - 4); mx = dx / d * st; my = dy / d * st; want = true; }
        } else if (d <= Math.max(step, 0.5)) { mx = dx; my = dy; arrived = true; }
        else { mx = dx / d * step; my = dy / d * step; want = true; }
      }
    }
    let [nx, ny] = keepOffCats(clamp(player.x + mx, X_MIN, L.worldW - X_MIN), clamp(player.y + my, PY_MIN, PY_MAX));
    nx = clamp(nx, X_MIN, L.worldW - X_MIN); ny = clamp(ny, PY_MIN, PY_MAX);
    const dist = Math.hypot(nx - player.x, ny - player.y);
    player.moving = dist > 0.01;
    if (player.moving) {
      if (Math.abs(nx - player.x) > 0.05) player.face = nx > player.x ? 1 : -1;
      player.phase += dist * 0.2;
      player.x = nx; player.y = ny;
      if (!reduce.matches) stepNpcs(dt);
    }
    if (player.moving || arrived) { updateNear(false); checkExits(); talk(); }
    if (arrived) {
      target = null;
      if (pending) { const id = pending; pending = null; onOpen(id); }
    }
    // walking toward a spot a cat sits on: stop beside the cat (and still open the booth if one was tapped)
    if (want && !player.moving && target && !ptr && !keys.size) {
      target = null; want = false;
      if (pending) { const id = pending; pending = null; onOpen(id); }
    }
    const camBusy = placeCamera(dt, camSnap);
    camSnap = false;
    return want || player.moving || camBusy;
  }
  function frame(t) {
    raf = 0;
    if (!alive) return;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
    last = t;
    const busy = update(dt);
    draw();
    if (busy) raf = requestAnimationFrame(frame); else last = 0;
  }
  function kick() { if (!raf && alive) raf = requestAnimationFrame(frame); }

  // ---------- input ----------
  function local(e) { const r = canvas.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; }
  function onDown(e) {
    if (!L || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const p = local(e);
    // w0: the world point under the finger at press time; a tap acts on it even if the camera moves meanwhile
    ptr = { id: e.pointerId, sx: p.sx, sy: p.sy, x0: p.sx, y0: p.sy, w0: toWorld(p.sx, p.sy), t: performance.now(), moved: false };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    halt(); keys.clear();
    if (document.activeElement !== canvas) canvas.focus({ preventScroll: true });
    kick();
  }
  function onMove(e) {
    const p = local(e);
    if (ptr && e.pointerId === ptr.id) {
      ptr.sx = p.sx; ptr.sy = p.sy;
      if (Math.hypot(p.sx - ptr.x0, p.sy - ptr.y0) > 10) ptr.moved = true;
      kick();
      return;
    }
    if (e.pointerType === 'mouse' && L && !ptr) {
      const w = toWorld(p.sx, p.sy), B = boothAt(w.x, w.y), id = B ? B.b.id : null, ex = exitAt(w.x, w.y);
      if (id !== hover || ex !== hoverExit) { hover = id; hoverExit = ex; kick(); }
    }
  }
  function onUp(e) {
    if (!ptr || e.pointerId !== ptr.id) return;
    const tap = !ptr.moved && performance.now() - ptr.t < HOLD_MS;
    const w = ptr.w0;
    ptr = null;
    if (tap) {
      const kitty = catAt(w.x, w.y);
      if (kitty) { say(kitty); kick(); return; }
      const passer = chatter ? npcAt(w.x, w.y) : null;
      if (passer) { praise(passer); kick(); return; }
      const ex = exitAt(w.x, w.y);
      if (ex) {
        stopAll();
        if (ex === 'prev') latchL = true; else latchR = true;
        onEnd(ex);
        kick();
        return;
      }
      const B = boothAt(w.x, w.y);
      if (B) { target = frontOf(B); pending = B.b.id; goal = B.b.id; } else target = clampWalk(w);
    } else target = null;
    kick();
  }
  function onCancel(e) { if (ptr && e.pointerId === ptr.id) { ptr = null; target = null; kick(); } }
  function onLeave(e) { if (e.pointerType === 'mouse' && (hover || hoverExit)) { hover = null; hoverExit = null; kick(); } }
  function onMenu(e) { if (ptr) e.preventDefault(); }
  function canAct(e) {
    if (!L || !cssW || canvas.offsetParent === null || e.isComposing) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (document.querySelector('dialog[open]')) return false;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return false;
    return true;
  }
  function onKeyDown(e) {
    if (!canAct(e)) return;
    if (e.key === 'Enter') {
      const t = e.target;
      if ((t === canvas || t === document.body || t === document.documentElement) && nearId) { e.preventDefault(); onOpen(nearId); }
      return;
    }
    const k = keyOf(e);
    if (!KEYS[k]) return;
    e.preventDefault();
    if (!keys.has(k)) { keys.add(k); halt(); kick(); }
  }
  function onKeyUp(e) { if (keys.delete(keyOf(e))) kick(); }
  function onBlur() { keys.clear(); ptr = null; }

  // ---------- public ----------
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const nd = Math.min(2, window.devicePixelRatio || 1);
    if (w === cssW && h === cssH && nd === dpr && T) return;
    cssW = w; cssH = h; dpr = nd;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    // leave room for the overlays: place label and status on top, the dock at the bottom
    let top = w <= 560 ? 94 : 58, bottom = 66;
    if (h < 520) { if (w > 560) top = 52; bottom = 58; } // narrow screens keep the room under the status tags
    if (display === 'stage' && w <= 560) bottom = 136; // Leave space below the banquet for the hint and two rows of actions.
    const avail = Math.max(140, h - top - bottom);
    scale = clamp(avail / WORLD_H, 0.42, 2.4);
    offY = top + (avail - WORLD_H * scale) / 2;
    buildTones();
    fitCache.clear();
    placeCamera(0, true);
    draw();
  }
  function setAisle(d, o = {}) {
    data = d;
    opts = { prev: o.prev || null, next: o.next || null };
    L = build(d);
    halt(); ptr = null; hover = null; hoverExit = null;
    const B = o.boothId ? L.byId.get(o.boothId) : null;
    if (B) { const f = frontOf(B); player.x = f.x; player.y = f.y; player.face = 1; }
    else if (o.from === 'right') { player.x = L.worldW - EXIT_W - 34; player.y = AISLE_MID - 12; player.face = -1; }
    else { player.x = EXIT_W + 34; player.y = AISLE_MID - 12; player.face = 1; }
    player.x = clamp(player.x, X_MIN, L.worldW - X_MIN);
    player.moving = false;
    latchL = player.x < EXIT_TRIG + 36;
    latchR = player.x > L.worldW - EXIT_TRIG - 36;
    initNpcs(d.code);
    initCats(d.code);
    canvas.setAttribute('aria-label', `${d.hallName} ${d.code} 走道：按住拖著小人走，${display === 'stage' ? '點舞台即可觀看影片' : '點設計師即可查看介紹'}`);
    camSnap = true;
    updateNear(true);
    kick();
  }
  function walkTo(B) { target = frontOf(B); pending = null; goal = B.b.id; kick(); }
  function focusBooth(id) {
    const B = L && L.byId.get(id);
    if (!B) return false;
    walkTo(B);
    return true;
  }
  function nextBooth() {
    if (!L) return;
    const order = L.order;
    if (!order.length) { if (opts.next) onEnd('next'); return; }
    const ref = goal && target ? goal : nearId;
    const i = ref ? order.findIndex(B => B.b.id === ref) : -1;
    if (i < 0) {
      // not at a booth: the first booth ahead on this side, else the closest one
      const side = display === 'stage' || player.y < AISLE_MID ? 'N' : 'S';
      let best = order.find(B => B.side === side && B.cx >= player.x - BW * 0.3);
      if (!best) {
        let bd = Infinity;
        for (const B of order) { const f = frontOf(B), d = Math.hypot(f.x - player.x, f.y - player.y); if (d < bd) { bd = d; best = B; } }
      }
      walkTo(best);
      return;
    }
    if (i >= order.length - 1) {
      if (opts.next) onEnd('next');
      else toast('這條走道逛完了，這館沒有下一條');
      return;
    }
    walkTo(order[i + 1]);
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('contextmenu', onMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
  if (ro) ro.observe(canvas);
  const onMotion = () => kick();
  if (reduce.addEventListener) reduce.addEventListener('change', onMotion);
  if (document.fonts && document.fonts.load) {
    Promise.all([`900 17px "Noto Sans TC"`, `700 13px "Noto Sans TC"`, `600 12px "IBM Plex Mono"`]
      .map(f => document.fonts.load(f, '設計師館走道0123').catch(() => null)))
      .then(() => { if (alive) { fitCache.clear(); kick(); } });
  }
  resize();

  return {
    setAisle,
    setCats(cfg) {
      catCfg = cfg;
      // Cat pictures load on demand when drawCat renders them in view.
      if (data) { initCats(data.code); talk(); }
      kick();
    },
    setChatter(cfg) { chatter = cfg; kick(); },
    nextBooth,
    focusBooth,
    refresh: () => kick(),
    resize,
    destroy() {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('contextmenu', onMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      if (ro) ro.disconnect();
      if (reduce.removeEventListener) reduce.removeEventListener('change', onMotion);
      imgs.clear();
    },
  };
}
