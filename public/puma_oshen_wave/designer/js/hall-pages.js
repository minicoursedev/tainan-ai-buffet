// Static share pages for halls with their own entry URL and preview image.
export const hallPages = [{
  code: 'A',
  name: '愛好者館',
  path: '/puma_oshen_wave/designer/halls/amateurs/',
  title: '愛好者館｜洋流線上市集',
  description: '走進洋流愛好者館，瀏覽愛好者的作品、介紹與社群連結。',
  image: 'https://minicourse.dev/puma_oshen_wave/designer/assets/amateur-hall-og.jpg?v=7d23cdfb659206c6',
  alt: '洋流愛好者館逛攤畫面',
  width: 1200,
  height: 630,
  type: 'image/jpeg',
}];

export const hallPageForCode = code => hallPages.find(hall => hall.code === code) || null;
export const hallPageForPath = pathname => hallPages.find(hall => hall.path === pathname.replace(/\/?$/, '/')) || null;
