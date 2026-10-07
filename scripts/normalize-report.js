// Normalizes data/source/products.raw.json and writes the before/after report to data/reports/ (git-ignored).
// Exit code 1 when any value cannot be normalized.
// Usage: npm run normalize
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadDictionaries } from './src/dictionaries.js';
import { normalizeCatalog } from './src/normalize.js';
import { buildReport, renderMarkdown } from './src/report.js';

const raw = JSON.parse(await readFile(new URL('../data/source/products.raw.json', import.meta.url), 'utf8'));
const ctx = await loadDictionaries();
const result = normalizeCatalog(raw, ctx);
const report = buildReport(raw, ctx, result);

const outDir = new URL('../data/reports/', import.meta.url);
await mkdir(outDir, { recursive: true });
await writeFile(new URL('normalization-report.json', outDir), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(new URL('normalization-report.md', outDir), renderMarkdown(report));

const { totals } = report;
console.log(
  `${report.products} products. Raw distinct values ${totals.rawDistinct} -> canonical ${totals.canonicalDistinct} ` +
    `(${totals.merged} merged, ${totals.rejected} rejected). Report: data/reports/normalization-report.md`,
);

if (result.issues.length > 0) {
  console.error(`\n${result.issues.length} issue(s):`);
  for (const { product, field, value, reason } of result.issues) {
    console.error(`  ${product} / ${field}: ${reason} (${JSON.stringify(value)})`);
  }
  process.exitCode = 1;
}
