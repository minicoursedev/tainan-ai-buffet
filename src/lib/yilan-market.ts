import data from '../../public/puma_oshen_wave/yilan_taiwan_11_07.json';
import { createCatalogue } from '../../public/puma_oshen_wave/yilan_taiwan_11_07/js/data.js';
export { designerRoot, designerPath } from '../../public/puma_oshen_wave/yilan_taiwan_11_07/js/routes.js';
const catalogue = createCatalogue(data);
export const designers = data.designers.filter(designer => designer.disabled !== true).map(designer => {
  const boothId = catalogue.designerBooths.get(designer.id)!;
  const aisle = catalogue.aisles.get(boothId.split('-')[0]);
  const booth = aisle.islands.flatMap((island: { booths: { store: string }[] }) => island.booths).find((item: { store: string }) => item.store === designer.id)!;
  return { id: designer.id, name: designer.name, booth, store: aisle.stores[designer.id] };
});
