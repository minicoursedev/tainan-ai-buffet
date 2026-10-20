import type { APIRoute } from 'astro';
import { skills } from '../../lib/data';

export const GET = (() => new Response(`${JSON.stringify(skills, null, 2)}\n`, {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
})) satisfies APIRoute;
