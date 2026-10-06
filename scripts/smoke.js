// Smoke test: obtains a token via client credentials and runs `shop { name }`.
// Usage: npm run smoke   (reads SHOPIFY_* from .env or the process environment)
import { API_VERSION, createClient, loadConfig } from './src/client.js';

try {
  process.loadEnvFile('.env');
} catch (error) {
  // No .env is fine when variables come from the process environment.
  if (error.code !== 'ENOENT') throw error;
}

try {
  const config = loadConfig();
  const client = createClient(config);
  const data = await client.graphql('query Smoke { shop { name } }');
  console.log(`OK: ${data.shop.name} (${config.shop}, Admin API ${API_VERSION})`);
} catch (error) {
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
}
