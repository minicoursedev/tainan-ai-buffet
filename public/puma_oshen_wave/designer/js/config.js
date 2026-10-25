// Preview and production share the main site's published designer catalogue.
export const CONFIG = {
  DESIGNERS_URL: 'https://raw.githubusercontent.com/minicoursedev/tainan-ai-buffet/main/public/puma_oshen_wave/designer.json',
  DEV_TOOLS: ['localhost', '127.0.0.1'].includes(location.hostname),
};
