import type { APIRoute } from 'astro';
import { events } from '../lib/data';

const base = 'https://minicourse.dev/';
const urls = [`${base}youtube-uploader/`, `${base}youtube-uploader/privacy/`, `${base}youtube-uploader/terms/`, base, `${base}friends.html`, ...new Set(events.filter(event => event.slides).map(event => `${base}${event.slides}`))];
const escape = (value: string) => value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);

export const GET = (() => new Response(
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${escape(url)}</loc></url>`).join('\n')}\n</urlset>\n`,
  { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
)) satisfies APIRoute;
