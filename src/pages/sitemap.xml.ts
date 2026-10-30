import type { APIRoute } from 'astro';
import { events } from '../lib/data';
import { stores, shopPath } from '../lib/oshen-stores';

const base = 'https://minicourse.dev/';
const urls = [`${base}puma_oshen_wave/`, ...stores.map(store => new URL(shopPath(store.id), base).href), `${base}puma_oshen_wave/support/`, `${base}puma_oshen_wave/privacy/`, `${base}youtube-uploader/`, `${base}youtube-uploader/privacy/`, `${base}youtube-uploader/terms/`, base, `${base}friends.html`, ...new Set(events.filter(event => event.slides).map(event => `${base}${event.slides}`))];
const escape = (value: string) => value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);

export const GET = (() => new Response(
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${escape(url)}</loc></url>`).join('\n')}\n</urlset>\n`,
  { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
)) satisfies APIRoute;
