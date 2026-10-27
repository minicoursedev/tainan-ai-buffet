// Adapt the video catalogue to the existing designer walk renderer.
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const pad2 = n => String(n).padStart(2, '0');
const PER_AISLE = 4;

export function parseVideo(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('缺少影片網址');
  let url;
  try { url = new URL(value); } catch { throw new Error('影片網址格式不正確'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('請使用 HTTPS 影片網址');
  let id = '';
  if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
    const [, kind, key] = url.pathname.split('/');
    id = kind === 'watch' ? url.searchParams.get('v') : ['shorts', 'embed', 'live'].includes(kind) ? key : '';
  }
  if (VIDEO_ID.test(id || '')) {
    return {
      type: 'youtube', id,
      url: `https://www.youtube.com/watch?v=${id}`,
      embed: `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0`,
      poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }
  if (/\.(mp4|webm)$/i.test(url.pathname)) return { type: 'file', url: url.href, poster: '' };
  throw new Error('目前支援 YouTube、MP4 與 WebM 影片');
}

export function createCatalogue(data) {
  if (!Array.isArray(data?.stages)) throw new Error('舞台資料格式不正確');
  const halls = data.halls ?? [{ id: 'puma', name: 'PUMA 館', code: 'S' }];
  if (!Array.isArray(halls) || !halls.length
    || halls.some(hall => !hall || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(hall.id || '')
      || typeof hall.name !== 'string' || !hall.name.trim() || !/^[A-Z]+$/.test(hall.code || ''))
    || new Set(halls.map(hall => hall.id)).size !== halls.length
    || new Set(halls.map(hall => hall.code)).size !== halls.length) throw new Error('展館資料格式不正確');
  const hallIds = new Set(halls.map(hall => hall.id));
  const ids = new Set();
  const stages = data.stages.filter(item => item?.disabled !== true).map(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || ids.has(item.id)
      || typeof item.title !== 'string' || !item.title.trim()) throw new Error('舞台編號或名稱不正確');
    const hallId = item.hall || halls[0].id;
    if (!hallIds.has(hallId)) throw new Error('找不到影片所屬展館');
    ids.add(item.id);
    return {
      id: item.id, title: item.title.trim(), hallId,
      creator: typeof item.creator === 'string' ? item.creator : '',
      description: typeof item.description === 'string' ? item.description : '',
      video: parseVideo(item.url),
    };
  });
  const aisles = [];
  for (const hall of halls) {
    const hallStages = stages.filter(stage => stage.hallId === hall.id);
    for (let start = 0; start < Math.max(1, hallStages.length); start += PER_AISLE) {
      const code = `${hall.code}${pad2(start / PER_AISLE + 1)}`;
      const members = hallStages.slice(start, start + PER_AISLE);
      const stores = {};
      const booths = members.map((stage, i) => {
        stage.boothId = `${code}-${pad2(i + 1)}`;
        stage.aisleCode = code;
        stores[stage.id] = { name: stage.title, creator: stage.creator.trim() };
        return {
          id: stage.boothId, store: stage.id, pos: i,
          zone: 'VIDEOS', zoneName: hall.name,
          works: [{ cover: stage.video.poster, name: stage.title }],
        };
      });
      aisles.push({
        code, hall: hall.id, hallName: hall.name, stores,
        islands: booths.length ? [{ side: 'N', zone: 'VIDEOS', zoneName: hall.name, booths }] : [],
      });
    }
  }
  return { stages, aisles, halls };
}

export async function loadCatalogue() {
  const response = await fetch(new URL('./videos.json', import.meta.url), { cache: 'no-cache', credentials: 'omit' });
  if (!response.ok) throw new Error(`舞台資料讀取失敗（${response.status}）`);
  return createCatalogue(await response.json());
}
