// Verifies an uploaded "image" is genuinely one, by its actual bytes — not
// just the data URL's own declared MIME prefix. The client-side compression
// pipeline (frontend/src/utils/imageCompress.js) only ever produces real
// image data, since it goes through the browser's own createImageBitmap()
// + canvas encoding, which fails on non-image input before a data URL can
// even be constructed. But that's a client-side guarantee — nothing stops
// someone from calling this API directly (curl/Postman) with a hand-crafted
// string like "data:image/jpeg;base64,<anything>", which the old
// `.startsWith('data:image/')` check alone would happily accept.
//
// Realistic severity, stated plainly: low. This data is only ever stored as
// a string and later re-embedded in an <img src>; nothing here does
// server-side image processing that a malformed "image" could exploit. This
// is a real gap worth closing cheaply (a few magic-byte checks, no new
// dependency), not an urgent vulnerability.
export function isValidImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
    return true;
  // WebP: "RIFF"....'WEBP' (bytes 0-3, then 8-11)
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return true;
  return false;
}

// Combines the existing cheap prefix check with real byte verification.
export function isValidImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return false;
  const base64Part = dataUrl.split(',')[1];
  if (!base64Part) return false;
  try {
    return isValidImageBuffer(Buffer.from(base64Part, 'base64'));
  } catch {
    return false;
  }
}
