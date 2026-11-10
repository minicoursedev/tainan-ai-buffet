// Shared by the static profiles and the interactive profile dialog.
const text = value => typeof value === 'string' ? value.trim() : '';
const compact = value => text(value).replace(/\s+/g, ' ');
const shorten = (value, limit = 160) => {
  const chars = Array.from(compact(value));
  return chars.length > limit ? chars.slice(0, limit - 1).join('') + '…' : chars.join('');
};
export function publicUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export function officialLinks(store) {
  return [['fb', 'Facebook'], ['threads', 'Threads'], ['ig', 'Instagram'], ['web', '官網']]
    .flatMap(([key, label]) => {
      const url = publicUrl(store?.social?.[key]);
      return url ? [{ key, label, url }] : [];
    });
}

export function designerMetadata(store) {
  const name = text(store.name);
  const category = text(store.category) || '設計師';
  // A missing biography stays empty in visible content and metadata.
  const introduction = text(store.description);
  const description = shorten(introduction);
  const shareTitle = `${name} 設計師`;
  return { title: `${name}｜${category}介紹與作品｜洋流設計師`, shareTitle, description, introduction };
}

export function designerStructuredData(store, booth, canonical, directoryUrl) {
  const metadata = designerMetadata(store);
  const entityId = `${canonical}#designer`;
  const pageId = `${canonical}#webpage`;
  const breadcrumbId = `${canonical}#breadcrumb`;
  // A name/category alone cannot tell us whether a profile is a person or a brand.
  const entityType = ['Person', 'Organization'].includes(store.entityType) ? store.entityType : 'Thing';
  const avatar = publicUrl(store.avatar);
  const sameAs = [...new Set(officialLinks(store).map(link => link.url))];
  const images = (booth.works || []).flatMap(work => {
    const url = publicUrl(work.cover);
    if (!url) return [];
    return [{
      '@type': 'ImageObject', '@id': `${canonical}#work-${encodeURIComponent(work.id)}`,
      contentUrl: url, name: text(work.name) || `${store.name}作品圖片`,
      ...(text(work.caption) ? { caption: text(work.caption) } : {}),
      isPartOf: { '@id': pageId },
    }];
  });
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': entityType === 'Thing' ? 'WebPage' : 'ProfilePage', '@id': pageId,
        url: canonical, name: metadata.title, inLanguage: 'zh-Hant-TW',
        ...(metadata.description ? { description: metadata.description } : {}),
        mainEntity: { '@id': entityId }, breadcrumb: { '@id': breadcrumbId },
        ...(images.length ? { image: images.map(image => ({ '@id': image['@id'] })) } : {}),
      },
      {
        '@type': entityType, '@id': entityId, name: store.name, url: canonical,
        ...(text(store.description) ? { description: text(store.description) } : {}),
        ...(avatar ? { image: avatar } : {}), ...(sameAs.length ? { sameAs } : {}),
      },
      {
        '@type': 'BreadcrumbList', '@id': breadcrumbId,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '洋流地圖', item: new URL('/puma_oshen_wave/', canonical).href },
          { '@type': 'ListItem', position: 2, name: '洋流設計師', item: directoryUrl },
          { '@type': 'ListItem', position: 3, name: store.name, item: canonical },
        ],
      },
      ...images,
    ],
  };
}

// Safe inside an HTML script element, including user-supplied descriptions/captions.
export const serializeStructuredData = data => JSON.stringify(data).replace(/</g, '\\u003c');
