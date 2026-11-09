// Move between designer aisles and resolve share links.
import { designerRoot, updateDesignerMetadata } from './routes.js';
import { state, emit, toast } from './state.js?v=20261031-yilan-zones';
import { loadAisle, aisleOfBooth, hallOf } from './data.js?v=20261031-oshen-shop';

const hallOfIndex = code => state.index.halls.find(h => h.code === hallOf(code));

export { designerBoothUrl } from './routes.js';

export function aisleNeighbors(code) {
  const hall = hallOfIndex(code);
  const list = hall.aisles;
  const i = list.findIndex(a => a.code === code);
  return {
    prev: list[i - 1]?.code || null,
    next: list[i + 1]?.code || null,
  };
}

// A missing aisle or network error returns false and shows a message.
export async function goToAisle(code, { boothId = null, from = null } = {}) {
  try {
    if (!hallOfIndex(code)) { toast('找不到這條走道'); return false; }
    const data = await loadAisle(code);
    state.aisleCode = code;
    state.aisle = data;
    state.hallCode = data.hall;
    emit('aisle', { code, data, boothId, from, ...aisleNeighbors(code) });
    history.replaceState(null, '', `${designerRoot}#/walk/${boothId || code}`);
    updateDesignerMetadata();
    return true;
  } catch (e) {
    if (e.status === 404) toast('找不到這條走道，名單可能剛更新過');
    else toast('換走道失敗，請再試一次');
    return false;
  }
}

export const goToBooth = boothId => goToAisle(aisleOfBooth(boothId), { boothId });
