// Verifies the seeded store against the normalized source data. Exit code 1 on any failure.
// Usage: npm run verify          (all products)
//        npm run verify:pilot    (only the pilot products must exist)
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { PILOT_HANDLES, fetchMetaobjectIds, findOnlineStorePublication } from './src/catalog-seed.js';
import { API_VERSION, createClient, loadConfig } from './src/client.js';
import { loadDictionaries, loadDictionaryFiles } from './src/dictionaries.js';
import { normalizeCatalogOrThrow } from './src/normalize.js';
import { readStoreState, verifyCatalog, verifyPlatformFilters } from './src/verify.js';

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
  const dictionaries = await loadDictionaryFiles();

  // The source data must itself be clean; unknown values stop the run here.
  const raw = JSON.parse(await readFile(new URL('../data/source/products.raw.json', import.meta.url), 'utf8'));
  const catalog = normalizeCatalogOrThrow(raw, await loadDictionaries());
  const expected = pilot ? catalog.filter(({ handle }) => PILOT_HANDLES.includes(handle)) : catalog;

  console.log(
    `${config.shop}, Admin API ${API_VERSION}, ${pilot ? 'pilot' : 'full'} (${expected.length} products expected)`,
  );

  const publicationId = await findOnlineStorePublication(client);
  const roasterIds = await fetchMetaobjectIds(client, 'roaster');
  const processIds = await fetchMetaobjectIds(client, 'process_method');
  const invert = (ids) => new Map([...ids].map(([handle, id]) => [id, handle]));

  const { products } = await readStoreState(client, publicationId);
  const { failures, facetGroups } = verifyCatalog({
    expected,
    knownHandles: new Set(catalog.map(({ handle }) => handle)),
    products,
    roasterHandleById: invert(roasterIds),
    processHandleById: invert(processIds),
    dictionaries,
  });

  // Filter counts are checked against every catalog product present in the store, so a pilot run after a full seed still agrees.
  const storeHandles = new Set(products.map(({ handle }) => handle));
  const present = catalog.filter(({ handle }) => storeHandles.has(handle));
  let checkedFilters = 0;
  if (present.length > 0) {
    const platform = await verifyPlatformFilters({ client, expected: present, roasterIds, processIds, sleep });
    failures.push(...platform.failures);
    checkedFilters = platform.checked;
  }

  console.log(`Products in store: ${products.length}. Filter queries checked: ${checkedFilters}.`);
  console.log(
    `Facet groups (unique values): ${Object.entries(facetGroups)
      .map(([key, count]) => `${key} ${count}`)
      .join(', ')}`,
  );

  if (failures.length > 0) {
    console.error(`\n${failures.length} problem(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('OK');
  }
} catch (error) {
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
}
