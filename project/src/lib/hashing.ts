/** SHA-256 of a file's raw bytes, as 64 lowercase hex characters. */
export async function generateFileHash(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Largest image the nodes accept (must match server/chain/config.js). */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

const TYPES_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  pjpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

/**
 * The image's MIME type. Windows often reports an empty type for files whose
 * extension it doesn't know, so fall back to the extension.
 */
export function imageTypeOf(file: File): string | null {
  if (file.type && file.type.startsWith('image/')) return file.type.toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return TYPES_BY_EXTENSION[ext] ?? null;
}

/** Can this browser actually draw the image? (HEIC and TIFF usually can't.) */
export function canDecode(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(false), 15000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth > 0 && img.naturalHeight > 0);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

/**
 * Check a picked file and explain plainly if it can't be used.
 * Returns the error message, or null when the file is fine.
 */
export async function checkImageFile(file: File, previewUrl: string): Promise<string | null> {
  const type = imageTypeOf(file);
  if (!type) return `“${file.name}” isn’t an image file. Choose a JPG, PNG, WebP or GIF.`;
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_IMAGE_BYTES) {
    return `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 25 MB. Export a smaller JPG and try again.`;
  }
  if (!(await canDecode(previewUrl))) {
    return type.includes('heic') || type.includes('heif')
      ? 'This is an iPhone HEIC photo, which browsers on Windows can’t open. Convert it to JPG (open it in Photos and choose “Save as”) and try again.'
      : `Your browser can’t open “${file.name}”. Convert it to JPG or PNG and try again.`;
  }
  return null;
}
