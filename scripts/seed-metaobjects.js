// Seeds roaster and process_method metaobject entries. Safe to repeat: entries are matched by handle.
// Usage: npm run seed:metaobjects            (writes)
//        npm run seed:metaobjects:dry-run    (reads only)
import { API_VERSION, createClient, loadConfig } from './src/client.js';
import { loadDictionaryFiles } from './src/dictionaries.js';
import { buildSeedEntries, seedMetaobjects } from './src/seed-metaobjects.js';
import { loadEnv } from './src/env.js';

const dryRun = process.argv.includes('--dry-run');

loadEnv();

try {
  const config = loadConfig();
  const client = createClient(config);
  const entries = buildSeedEntries(await loadDictionaryFiles());

  console.log(`${dryRun ? 'DRY RUN: ' : ''}${config.shop}, Admin API ${API_VERSION}`);
  const { results } = await seedMetaobjects({ client, entries, dryRun });

  for (const { type, handle, status, changes } of results) {
    console.log(`${status.toUpperCase().padEnd(12)} ${type.padEnd(15)} ${handle}`);
    for (const change of changes) console.log(`             - ${change}`);
  }
} catch (error) {
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
}
