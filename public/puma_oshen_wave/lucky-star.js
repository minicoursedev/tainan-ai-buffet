export const starSource = 'https://raw.githubusercontent.com/minicoursedev/tainan-ai-buffet/main/public/puma_oshen_wave/star.json';

export function parseStars(data) {
  if (!Array.isArray(data)) throw new Error('Invalid star list');
  return data.flatMap(row => {
    if (!row || typeof row !== 'object') return [];
    const {lat, lng} = row.latlng || {};
    const end = typeof row.end_date === 'string' ? Date.parse(row.end_date) : NaN;
    const start = Object.hasOwn(row, 'start_date')
      ? (typeof row.start_date === 'string' ? Date.parse(row.start_date) : NaN) : -Infinity;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 ||
        !Number.isFinite(end) || Number.isNaN(start) || start >= end ||
        typeof row.message !== 'string' || !row.message.trim()) return [];
    return [{latlng:{lat,lng}, start, end, message:row.message, shopId:typeof row.shop_id === 'string' ? row.shop_id : null}];
  });
}
export function selectStar(stars, now = Date.now(), position = null, random = Math.random) {
  const active = stars.filter(s => s.start <= now && now < s.end);
  if (!active.length) return null;
  if (!position) return active[Math.floor(random() * active.length)];
  const rad = n => n * Math.PI / 180;
  const distance = ({latlng:p}) => Math.sin(rad(p.lat-position.lat)/2)**2 +
    Math.cos(rad(position.lat))*Math.cos(rad(p.lat))*Math.sin(rad(p.lng-position.lng)/2)**2;
  return active.reduce((a,b) => distance(a) <= distance(b) ? a : b);
}
export function locateForStar() {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), 16000);
    const finish = value => {clearTimeout(timer); resolve(value);};
    try {
      if (!navigator.geolocation) return finish(null);
      navigator.geolocation.getCurrentPosition(({coords}) => finish({lat:coords.latitude,lng:coords.longitude}),
        () => finish(null), {enableHighAccuracy:false, timeout:15000, maximumAge:60000});
    } catch {finish(null);}
  });
}
export function nextStar(stars, previous, now = Date.now()) {
  const index = stars.findIndex(star => star.shopId === previous.shopId &&
    star.latlng.lat === previous.latlng.lat && star.latlng.lng === previous.latlng.lng &&
    star.start === previous.start && star.end === previous.end);
  for (let offset = 1; offset <= stars.length; offset++) {
    const star = stars[(index + offset) % stars.length];
    if (star.start <= now && now < star.end) return star;
  }
  return null;
}
export async function findStar(previous = null) {
  const response = await fetch(['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? './star.json' : starSource, {cache:'no-store', signal:AbortSignal.timeout(15000)});
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Star request failed');
  const stars = parseStars(await response.json());
  if (previous) return nextStar(stars, previous);
  if (!selectStar(stars)) return null;
  const position = await locateForStar();
  return selectStar(stars, Date.now(), position);
}
