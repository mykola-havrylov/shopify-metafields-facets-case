// Offline check of data/images/: every product has exactly one valid image, nothing unexpected is in the folder.
// No credentials needed. Exit code 1 when anything is wrong.
// Usage: npm run images:check
import { readdir, readFile } from 'node:fs/promises';
import { canonicalCatalog } from './src/catalog.js';
import { listImageFiles, planImages, validateImage } from './src/images.js';

const dir = new URL('../data/images/', import.meta.url);
const files = listImageFiles(await readdir(dir));
const { matches, missing, unexpected } = planImages(canonicalCatalog(), files);

const problems = [];
for (const { filename } of matches)
  problems.push(...validateImage({ filename, bytes: await readFile(new URL(filename, dir)) }));
for (const handle of missing) problems.push(`missing image for "${handle}" (expected data/images/${handle}.jpg)`);
for (const filename of unexpected) problems.push(`unexpected file data/images/${filename}`);

console.log(`${matches.length} of ${canonicalCatalog().length} products have an image file.`);
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log('OK');
}
