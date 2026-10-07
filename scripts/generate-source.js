// Regenerates data/source/products.raw.json: the dirty export of the generated demo catalog.
// Deterministic, so a clean checkout reproduces the committed file byte for byte.
// Usage: npm run generate-source
import { mkdir, writeFile } from 'node:fs/promises';
import { canonicalCatalog, toRawExport } from './src/catalog.js';
import { loadDictionaryFiles } from './src/dictionaries.js';

const outDir = new URL('../data/source/', import.meta.url);
const raw = toRawExport(canonicalCatalog(), await loadDictionaryFiles());

await mkdir(outDir, { recursive: true });
await writeFile(new URL('products.raw.json', outDir), `${JSON.stringify(raw, null, 2)}\n`);
console.log(`Wrote ${raw.length} raw products to data/source/products.raw.json`);
