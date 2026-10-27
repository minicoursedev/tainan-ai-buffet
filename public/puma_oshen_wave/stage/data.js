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
  const ids = new Set();
  const stages = data.stages.filter(item => item?.disabled !== true).map(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || ids.has(item.id)
      || typeof item.title !== 'string' || !item.title.trim()) throw new Error('舞台編號或名稱不正確');
    ids.add(item.id);
    return {
      id: item.id, title: item.title.trim(),
      creator: typeof item.creator === 'string' ? item.creator : '',
      description: typeof item.description === 'string' ? item.description : '',
      video: parseVideo(item.url),
    };
  });
  const aisles = [];
  for (let start = 0; start < Math.max(1, stages.length); start += PER_AISLE) {
    const code = `S${pad2(aisles.length + 1)}`;
    const members = stages.slice(start, start + PER_AISLE);
    const stores = {};
    const booths = members.map((stage, i) => {
      stage.boothId = `${code}-${pad2(i + 1)}`;
      stage.aisleCode = code;
      stores[stage.id] = { name: stage.title };
      return {
        id: stage.boothId, store: stage.id, pos: i,
        zone: 'VIDEOS', zoneName: '洋流舞台',
        works: [{ cover: stage.video.poster, name: stage.title }],
      };
    });
    aisles.push({
      code, hall: 'S', hallName: '洋流舞台', stores,
      islands: booths.length ? [{ side: 'N', zone: 'VIDEOS', zoneName: '洋流舞台', booths }] : [],
    });
  }
  return { stages, aisles };
}

export async function loadCatalogue() {
  const response = await fetch(new URL('./videos.json', import.meta.url), { cache: 'no-cache', credentials: 'omit' });
  if (!response.ok) throw new Error(`舞台資料讀取失敗（${response.status}）`);
  return createCatalogue(await response.json());
}
