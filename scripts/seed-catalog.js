// Seeds the demo catalog: collection, products with Size x Grind variants, coffee.* metafields, Online Store publication.
// Run `npm run seed:metaobjects` first. Safe to repeat: products are matched by handle.
// Usage: npm run seed:catalog:pilot     (5 products, to check the storefront before the full run)
//        npm run seed:catalog           (all products)
//        add -- --dry-run to read only
import { API_VERSION, createClient, loadConfig } from './src/client.js';
import { seedCatalog, pilotProducts } from './src/catalog-seed.js';
import { loadDefinitionFiles } from './src/definitions.js';
import { loadDictionaries, loadDictionaryFiles } from './src/dictionaries.js';
import { normalizeCatalogOrThrow } from './src/normalize.js';
import { readFile } from 'node:fs/promises';
import { loadEnv } from './src/env.js';

const dryRun = process.argv.includes('--dry-run');
const pilot = process.argv.includes('--pilot');

loadEnv();

try {
  const config = loadConfig();
  const client = createClient(config);

  const raw = JSON.parse(await readFile(new URL('../data/source/products.raw.json', import.meta.url), 'utf8'));
  const normalized = normalizeCatalogOrThrow(raw, await loadDictionaries());
  const products = pilot ? pilotProducts(normalized) : normalized;

  const { roasters, processMethods } = await loadDictionaryFiles();
  const { metafields } = await loadDefinitionFiles();
  const metafieldTypes = Object.fromEntries(metafields.definitions.map(({ key, type }) => [key, type]));

  console.log(
    `${dryRun ? 'DRY RUN: ' : ''}${config.shop}, Admin API ${API_VERSION}, ${pilot ? 'pilot' : 'full'} (${products.length} products)`,
  );
  const { collection, results } = await seedCatalog({
    client,
    products,
    roasters,
    processMethods,
    metafieldTypes,
    dryRun,
  });

  console.log(`${collection.status.toUpperCase().padEnd(12)} collection      coffee`);
  for (const { handle, status } of results) console.log(`${status.toUpperCase().padEnd(12)} product         ${handle}`);
} catch (error) {
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
}
