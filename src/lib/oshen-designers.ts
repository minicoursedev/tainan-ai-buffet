import data from '../../public/puma_oshen_wave/designer.json';
import { createCatalogue } from '../../public/puma_oshen_wave/designer/js/data.js';
import { readProducts, PRODUCT_LIMIT } from '../../public/puma_oshen_wave/designer/js/products.js';
export { designerRoot, designerPath } from '../../public/puma_oshen_wave/designer/js/routes.js';
interface Booth { store: string; works: unknown[]; total: number; randomSelection?: boolean }
const catalogue = createCatalogue(data);
const productFiles = import.meta.glob('../../public/puma_oshen_wave/data/designers/*.json', { eager: true, import: 'default' });
export const designers = data.designers.filter(designer => designer.disabled !== true).map(designer => {
  const boothId = catalogue.designerBooths.get(designer.id)!;
  const aisle = catalogue.aisles.get(boothId.split('-')[0]);
  const booth = aisle.islands.flatMap((island: { booths: Booth[] }) => island.booths).find((booth: Booth) => booth.store === designer.id)!;
  const store = aisle.stores[designer.id];
  if (store.productsUrl) {
    const file = productFiles[`../../public${new URL(store.productsUrl).pathname}`];
    if (!file) throw new Error(`Missing bundled product catalogue for ${designer.id}`);
    const products = readProducts(file, designer.id, store.productsUrl);
    // Stable build-time sample; runtime retains the existing random selection.
    booth.works = [...products.filter((product: { pinned?: boolean }) => product.pinned), ...products.filter((product: { pinned?: boolean }) => !product.pinned)].slice(0, PRODUCT_LIMIT);
    booth.total = products.length;
    booth.randomSelection = true;
  }
  return { id: designer.id, name: designer.name, booth, store };
});
