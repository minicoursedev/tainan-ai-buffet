import data from '../../public/puma_oshen_wave/designer.json';
import { createCatalogue } from '../../public/puma_oshen_wave/designer/js/data.js';
import { readProducts, PRODUCT_LIMIT } from '../../public/puma_oshen_wave/designer/js/products.js';
import { validateWorkIds } from '../../public/puma_oshen_wave/designer/js/work-links.js';
import { renderDesignerOg } from '../../scripts/designer-og.mjs';
export { designerRoot, designerPath } from '../../public/puma_oshen_wave/designer/js/routes.js';
export interface DesignerWork { id: string; cover: string; name: string; caption: string; video?: string; url?: string; width?: number; height?: number }
interface Booth { store: string; works: DesignerWork[]; total: number; randomSelection?: boolean }
interface ProductCatalogue { products: Array<{ id: string; disabled?: boolean }> }
for (const designer of data.designers) {
  validateWorkIds(designer.id, designer.productImages ?? [], 'retiredWorkIds' in designer ? designer.retiredWorkIds : undefined);
}
const catalogue = createCatalogue(data);
const productFiles = import.meta.glob<ProductCatalogue>('../../public/puma_oshen_wave/data/designers/*.json', { eager: true, import: 'default' });
export const designers = await Promise.all(data.designers.filter(designer => designer.disabled !== true).map(async designer => {
  const boothId = catalogue.designerBooths.get(designer.id)!;
  const aisle = catalogue.aisles.get(boothId.split('-')[0]);
  const booth = aisle.islands.flatMap((island: { booths: Booth[] }) => island.booths).find((booth: Booth) => booth.store === designer.id)!;
  const store = aisle.stores[designer.id];
  let works: DesignerWork[] = booth.works;
  if (store.productsUrl) {
    const file = productFiles[`../../public${new URL(store.productsUrl).pathname}`];
    if (!file) throw new Error(`Missing bundled product catalogue for ${designer.id}`);
    validateWorkIds(designer.id, file.products);
    const products = readProducts(file, designer.id, store.productsUrl);
    if (products.length !== file.products.filter(product => product.disabled !== true).length) {
      throw new Error(`Invalid or duplicate work image for ${designer.id}`);
    }
    works = products;
    // Stable build-time sample; runtime retains the existing random selection.
    booth.works = [...products.filter((product: { pinned?: boolean }) => product.pinned), ...products.filter((product: { pinned?: boolean }) => !product.pinned)].slice(0, PRODUCT_LIMIT);
    booth.total = products.length;
    booth.randomSelection = true;
  }
  const image = await renderDesignerOg(designer);
  const og = image ? { url: image.url, width: image.width, height: image.height, type: image.type, alt: image.alt } : null;
  return { id: designer.id, name: designer.name, hallCode: aisle.hall, hallName: aisle.hallName, booth, store, og, works };
}));
export const designerWorks = designers.flatMap(designer => designer.works.map(work => ({ designer, work })));
