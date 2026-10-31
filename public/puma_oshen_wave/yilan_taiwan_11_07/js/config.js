// Preview and production share the main site's published designer catalogue.
export const CONFIG = {
  DESIGNERS_URL: new URL('../../yilan_taiwan_11_07.json', import.meta.url).protocol === 'file:' ? 'https://minicourse.dev/puma_oshen_wave/yilan_taiwan_11_07.json' : new URL('../../yilan_taiwan_11_07.json', import.meta.url).href,
  DEV_TOOLS: typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname),
};
