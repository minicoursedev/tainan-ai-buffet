// Optional closing time from schedule.json; a null closeAt keeps the site open.
import { CONFIG } from './config.js';

let closeAt = null;

export async function loadSchedule() {
  try {
    const r = await fetch(new URL('schedule.json', new URL('.', location.href)), { cache: 'default' });
    const j = r.ok ? await r.json() : {};
    const t = Date.parse(j.closeAt);
    closeAt = Number.isFinite(t) ? t : null;
  } catch { closeAt = null; }
  return closeAt;
}

// local preview: ?closed=1 shows the closed screen before the real date
const forced = () => CONFIG.DEV_TOOLS && new URLSearchParams(location.search).get('closed') === '1';
export const isClosed = (now = Date.now()) => forced() || (closeAt !== null && now >= closeAt);
export const msLeft = (now = Date.now()) => (closeAt === null ? Infinity : closeAt - now);

// Format the last open minute in Taipei time.
export function lastOpenLabel() {
  if (closeAt === null) return '';
  const d = new Date(closeAt - 1000);
  const part = type => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', [type]: type === 'weekday' ? 'narrow' : '2-digit', hour12: false })
    .formatToParts(d).find(p => p.type === type)?.value;
  const md = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' }).format(d);
  return `${md}（${part('weekday')}）${part('hour')}:${part('minute')}`;
}

// header tag text: a live countdown to closing, "休市倒數 3 天 04:12:33"
export function closeTagText(now = Date.now()) {
  const left = msLeft(now);
  if (!Number.isFinite(left)) return '';
  const t = Math.max(0, Math.floor(left / 1000));
  const d = Math.floor(t / 86400), hh = Math.floor((t % 86400) / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  const clock = [hh, mm, ss].map(n => String(n).padStart(2, '0')).join(':');
  return d > 0 ? `休市倒數 ${d} 天 ${clock}` : `休市倒數 ${clock}`;
}
