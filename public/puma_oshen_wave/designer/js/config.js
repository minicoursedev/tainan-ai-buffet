// Preview and production share the main site's published designer catalogue.
export const CONFIG = {
  DESIGNERS_URL: 'https://minicourse.dev/puma_oshen_wave/designer.json',
  DEV_TOOLS: typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname),
};
