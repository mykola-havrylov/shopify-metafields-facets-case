// Offline checks for the product image files in data/images/: names, format, size and dimensions.
import { IMAGE_SIZE } from './image-prompts.js';

export const IMAGE_EXTENSIONS = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
export const MIN_SIDE = 1000;
export const MAX_SIDE = 4000;
export const MAX_BYTES = 800 * 1024;

const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export const extensionOf = (filename) => (/\.[^.]+$/.exec(filename.toLowerCase()) ?? [''])[0];

/**
 * Reads format and pixel size from the file header (JPEG and PNG only, no dependencies).
 * @returns {{format: 'jpeg'|'png', width: number, height: number} | null} null when the bytes are not a readable image
 */
export function readImageInfo(bytes) {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47 && bytes.toString('ascii', 12, 16) === 'IHDR') {
    return { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (JPEG_SOF.has(marker)) {
        return { format: 'jpeg', height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
  }
  return null;
}

/** Problems with one image file; an empty array means it can be uploaded. */
export function validateImage({ filename, bytes }) {
  const problems = [];
  const mime = IMAGE_EXTENSIONS[extensionOf(filename)];
  if (!mime) {
    return [`${filename}: extension must be one of ${Object.keys(IMAGE_EXTENSIONS).join(', ')}`];
  }

  if (bytes.length > MAX_BYTES)
    problems.push(`${filename}: ${Math.round(bytes.length / 1024)} KB, the limit is ${MAX_BYTES / 1024} KB`);

  const info = readImageInfo(bytes);
  if (!info) return [...problems, `${filename}: not a readable JPEG or PNG`];
  if ((info.format === 'jpeg') !== (mime === 'image/jpeg'))
    problems.push(`${filename}: content is ${info.format} but the extension says otherwise`);
  if (info.width !== info.height) problems.push(`${filename}: ${info.width}x${info.height}, must be square`);
  if (info.width < MIN_SIDE || info.width > MAX_SIDE) {
    problems.push(`${filename}: ${info.width}px wide, expected ${MIN_SIDE}-${MAX_SIDE} (target ${IMAGE_SIZE})`);
  }
  return problems;
}

/** Names in data/images/ that are meant to be images (so brief.md and prompts.json are ignored). */
export const listImageFiles = (names) =>
  names.filter((name) => IMAGE_EXTENSIONS[extensionOf(name)] || /\.(gif|webp|bmp|tiff?|svg)$/i.test(name));

/**
 * Pairs product handles with files named `<handle>.<ext>`.
 * @returns {{matches: Array<{product: object, filename: string}>, missing: string[], unexpected: string[]}}
 */
export function planImages(products, filenames) {
  const byHandle = new Map();
  const unexpected = [];
  const handles = new Set(products.map(({ handle }) => handle));

  for (const filename of filenames) {
    const ext = extensionOf(filename);
    const handle = filename.slice(0, filename.length - ext.length);
    if (IMAGE_EXTENSIONS[ext] && handles.has(handle) && !byHandle.has(handle)) byHandle.set(handle, filename);
    else unexpected.push(filename);
  }

  const matches = products
    .filter(({ handle }) => byHandle.has(handle))
    .map((product) => ({ product, filename: byHandle.get(product.handle) }));
  const missing = products.filter(({ handle }) => !byHandle.has(handle)).map(({ handle }) => handle);
  return { matches, missing, unexpected };
}
