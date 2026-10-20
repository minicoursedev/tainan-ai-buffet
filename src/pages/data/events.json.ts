import type { APIRoute } from 'astro';
import { events } from '../../lib/data';

export const GET = (() => new Response(`${JSON.stringify(events, null, 2)}\n`, {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
})) satisfies APIRoute;
