// Writes data/images/prompts.json and data/images/brief.md from the catalog (deterministic).
// Usage: npm run generate-image-prompts
import { mkdir, writeFile } from 'node:fs/promises';
import { canonicalCatalog } from './src/catalog.js';
import { loadDictionaryFiles } from './src/dictionaries.js';
import { buildPromptPack, renderBrief } from './src/image-prompts.js';

const outDir = new URL('../data/images/', import.meta.url);
const pack = buildPromptPack(canonicalCatalog(), await loadDictionaryFiles());

await mkdir(outDir, { recursive: true });
await writeFile(new URL('prompts.json', outDir), `${JSON.stringify(pack, null, 2)}\n`);
await writeFile(new URL('brief.md', outDir), renderBrief(pack));
console.log(`Wrote ${pack.products.length} prompts to data/images/prompts.json and data/images/brief.md`);
