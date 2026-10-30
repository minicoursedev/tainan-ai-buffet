import data from '../../public/puma_oshen_wave/stage/videos.json';
import { createCatalogue } from '../../public/puma_oshen_wave/stage/data.js';
interface Stage { id: string; title: string; creator: string; description: string; hallId: string; video: { url: string; poster: string } }
export const catalogue = createCatalogue(data) as { halls: Array<{ id: string; name: string; code: string }>; stages: Stage[] };
export const stageBase = '/puma_oshen_wave/stage/';
export const stagePath = (id: string) => `${stageBase}videos/${encodeURIComponent(id)}/`;
export const hallPath = (id: string) => `${stageBase}halls/${encodeURIComponent(id)}/`;
