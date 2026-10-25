// Use the image URL supplied by the catalogue.
export const thumbnailUrl = source => source;

export function retryOriginal(img) {
  const original = img.dataset.original;
  delete img.dataset.original;
  if (!original || img.getAttribute('src') === original) return false;
  img.src = original;
  return true;
}
