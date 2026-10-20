import type { APIRoute } from 'astro';
import { friends } from '../../lib/data';

export const GET = (() => new Response(`${JSON.stringify(friends, null, 2)}\n`, {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
})) satisfies APIRoute;
