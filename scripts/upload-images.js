// Uploads data/images/<handle>.jpg and attaches each image to its product. Safe to repeat.
// Run `npm run images:check` first, and `npm run seed:catalog` so the products exist.
// Usage: npm run upload-images -- --dry-run     (reads only)
//        npm run upload-images                  (uploads what is missing)
//        npm run upload-images -- --replace     (deletes and re-uploads existing images)
import { readdir, readFile } from 'node:fs/promises';
import { PILOT_HANDLES } from './src/catalog-seed.js';
import { canonicalCatalog } from './src/catalog.js';
import { API_VERSION, createClient, loadConfig } from './src/client.js';
import { loadDictionaryFiles } from './src/dictionaries.js';
import { listImageFiles, planImages, validateImage } from './src/images.js';
import { uploadProductImages } from './src/image-upload.js';

const dryRun = process.argv.includes('--dry-run');
const replace = process.argv.includes('--replace');
const pilot = process.argv.includes('--pilot');

try {
  process.loadEnvFile('.env');
} catch (error) {
  // No .env is fine when variables come from the process environment.
  if (error.code !== 'ENOENT') throw error;
}

try {
  const config = loadConfig();
  const client = createClient(config);
  const { roasters } = await loadDictionaryFiles();
  const dir = new URL('../data/images/', import.meta.url);

  const catalog = canonicalCatalog().filter(({ handle }) => !pilot || PILOT_HANDLES.includes(handle));
  const { matches, missing, unexpected } = planImages(catalog, listImageFiles(await readdir(dir)));
  if (missing.length > 0) throw new Error(`No image file for: ${missing.join(', ')}. Run npm run images:check.`);
  if (unexpected.length > 0 && !pilot) throw new Error(`Unexpected files in data/images/: ${unexpected.join(', ')}.`);

  const problems = [];
  for (const { filename } of matches)
    problems.push(...validateImage({ filename, bytes: await readFile(new URL(filename, dir)) }));
  if (problems.length > 0) throw new Error(`Invalid images:\n  ${problems.join('\n  ')}`);

  console.log(`${dryRun ? 'DRY RUN: ' : ''}${config.shop}, Admin API ${API_VERSION}, ${matches.length} images`);
  const { results } = await uploadProductImages({
    client,
    matches,
    dryRun,
    replace,
    readImage: (filename) => readFile(new URL(filename, dir)),
    roasterTitleOf: (product) => roasters.find(({ handle }) => handle === product.roaster).title,
  });

  for (const { handle, status, note } of results)
    console.log(`${status.toUpperCase().padEnd(16)} ${handle}${note ? `  (${note})` : ''}`);
  if (results.some(({ status }) => status === 'conflict' || status === 'missing-product')) process.exitCode = 1;
} catch (error) {
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
}
