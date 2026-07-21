// Shared by Profile.jsx (avatar) and OwnerDashboard.jsx (station photos) —
// both need a base64 image under a byte cap for MongoDB-friendly storage,
// just at different sizes. Resizes down and re-compresses as WebP in the
// browser until it fits — WebP typically lands 25-35% smaller than JPEG at
// equivalent visual quality, which directly stretches these byte budgets
// further. Safe to rely on: per spec, canvas.toDataURL() silently falls
// back to PNG on the rare browser without WebP encoding support, rather
// than throwing — so this never breaks, worst case one has a larger (but
// still valid) image on a very old browser.

export function dataUrlByteLength(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.floor((base64.length * 3) / 4);
}

export async function compressImageToUnder(
  file,
  maxBytes,
  { startSide = 256, startQuality = 0.85 } = {}
) {
  const imageBitmap = await createImageBitmap(file);
  let side = startSide;
  let quality = startQuality;

  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, side / Math.max(imageBitmap.width, imageBitmap.height));
    canvas.width = Math.round(imageBitmap.width * scale);
    canvas.height = Math.round(imageBitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/webp', quality);
    if (dataUrlByteLength(dataUrl) <= maxBytes) {
      return dataUrl;
    }
    // Still too big — shrink dimensions first, then quality, and try again.
    if (side > 96) side = Math.round(side * 0.8);
    else quality = Math.max(0.4, quality - 0.15);
  }

  throw new Error(
    `Could not compress image under ${Math.round(maxBytes / 1024)}KB. Try a simpler/smaller photo.`
  );
}
