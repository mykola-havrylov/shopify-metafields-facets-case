// Creates metaobject and product metafield definitions. Safe to repeat: existing definitions are only compared.
// Usage: npm run definitions            (writes)
//        npm run definitions:dry-run    (reads only, prints the plan)
// Exit code 1 on drift or errors.
import { API_VERSION, createClient, loadConfig } from './src/client.js';
import { loadDefinitionFiles } from './src/definitions.js';
import { syncDefinitions } from './src/definitions-sync.js';

const dryRun = process.argv.includes('--dry-run');

try {
  process.loadEnvFile('.env');
} catch (error) {
  // No .env is fine when variables come from the process environment.
  if (error.code !== 'ENOENT') throw error;
}

try {
  const config = loadConfig();
  const client = createClient(config);
  const { metaobjects, metafields } = await loadDefinitionFiles();

  console.log(`${dryRun ? 'DRY RUN: ' : ''}${config.shop}, Admin API ${API_VERSION}`);
  const { results } = await syncDefinitions({ client, metaobjects, metafields, dryRun });

  for (const { kind, id, status, drift } of results) {
    console.log(`${status.toUpperCase().padEnd(12)} ${kind.padEnd(10)} ${id}`);
    for (const message of drift) console.log(`             - ${message}`);
  }

  const drifted = results.filter(({ status }) => status === 'drift');
  if (drifted.length > 0) {
    console.error(
      `\n${drifted.length} definition(s) differ from scripts/definitions/. Nothing was changed on them: ` +
        'a type change needs delete + recreate + re-seed, anything else needs a deliberate update.',
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
}
