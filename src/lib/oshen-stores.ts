import data from '../../public/puma_oshen_wave/stores.json';

export interface Store {
  id: string;
  name: string;
  category: string;
  address: string;
  disabled?: boolean;
  visitNote?: string;
  social?: Record<string, string>;
  openingHours?: { status?: string; text?: string; note?: string };
  shopPhoto?: { status?: string; url?: string };
}

export const stores = (data.stores as Store[]).filter(store => store.disabled !== true);
export const shopPath = (id: string) => `/puma_oshen_wave/shops/${encodeURIComponent(id)}/`;
export function httpsUrl(value?: string) {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' ? url.href : undefined; }
  catch { return undefined; }
}
export function hoursText(store: Store) {
  const hours = store.openingHours;
  if (!hours?.text || ['unknown', 'unverified'].includes(hours.status ?? '')) return undefined;
  if (hours.status === 'appointment' && !/\d{1,2}[:：]\d{2}/.test(hours.text)) return undefined;
  return hours.text;
}
