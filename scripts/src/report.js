// Pure builders for the before/after normalization report.
import { FIELDS, convertValue } from './normalize.js';

/**
 * For every field: distinct raw values -> canonical values, how many were merged and which were rejected.
 * "Raw" values are counted exactly as exported (casing and whitespace included); list cells are split into items.
 */
export function buildReport(rawProducts, ctx, { products, issues }) {
  const fields = {};

  for (const [name, field] of Object.entries(FIELDS)) {
    const groups = new Map(); // canonical (JSON) -> Set of raw values
    const rejected = new Map(); // raw -> reason

    for (const raw of rawProducts) {
      const cell = raw[field.rawKey];
      if (cell === undefined || cell === null || String(cell).trim() === '') continue;
      const items = field.kind === 'list' ? field.split(cell) : [String(cell)];
      for (const item of items) {
        const result = convertValue(field, item, ctx);
        if ('reason' in result) {
          rejected.set(item, result.reason);
          continue;
        }
        const key = JSON.stringify(result.value);
        if (!groups.has(key)) groups.set(key, new Set());
        groups.get(key).add(item);
      }
    }

    const mappings = [...groups.entries()]
      .map(([canonical, raws]) => ({ canonical: JSON.parse(canonical), raw: [...raws].sort() }))
      .sort((a, b) => String(a.canonical).localeCompare(String(b.canonical), 'en', { numeric: true }));
    const rawDistinct = mappings.reduce((sum, { raw }) => sum + raw.length, 0) + rejected.size;

    fields[name] = {
      rawDistinct,
      canonicalDistinct: mappings.length,
      merged: rawDistinct - rejected.size - mappings.length,
      rejected: [...rejected.entries()].map(([raw, reason]) => ({ raw, reason })),
      mappings,
    };
  }

  const totals = Object.values(fields).reduce(
    (sum, field) => ({
      rawDistinct: sum.rawDistinct + field.rawDistinct,
      canonicalDistinct: sum.canonicalDistinct + field.canonicalDistinct,
      merged: sum.merged + field.merged,
      rejected: sum.rejected + field.rejected.length,
    }),
    { rawDistinct: 0, canonicalDistinct: 0, merged: 0, rejected: 0 },
  );

  return { products: rawProducts.length, normalized: products.filter(Boolean).length, issues, totals, fields };
}

const cell = (value) => String(JSON.stringify(value)).replace(/\|/g, '\\|');

export function renderMarkdown(report) {
  const { totals } = report;
  const lines = [
    '# Normalization report',
    '',
    `Products: ${report.products}. Raw distinct values: ${totals.rawDistinct} -> canonical: ${totals.canonicalDistinct} ` +
      `(${totals.merged} merged, ${totals.rejected} rejected). Issues: ${report.issues.length}.`,
    '',
    '| Field | Raw distinct | Canonical | Merged | Rejected |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...Object.entries(report.fields).map(
      ([name, f]) => `| ${name} | ${f.rawDistinct} | ${f.canonicalDistinct} | ${f.merged} | ${f.rejected.length} |`,
    ),
  ];

  for (const [name, field] of Object.entries(report.fields)) {
    lines.push('', `## ${name}`, '', '| Canonical | Raw values |', '| --- | --- |');
    for (const { canonical, raw } of field.mappings) lines.push(`| ${cell(canonical)} | ${raw.map(cell).join(', ')} |`);
    if (field.rejected.length > 0) {
      lines.push('', 'Rejected:', ...field.rejected.map(({ raw, reason }) => `- ${cell(raw)}: ${reason}`));
    }
  }

  if (report.issues.length > 0) {
    lines.push(
      '',
      '## Issues',
      '',
      ...report.issues.map(
        ({ product, field, value, reason }) => `- ${product} / ${field}: ${reason} (${cell(value)})`,
      ),
    );
  }
  return `${lines.join('\n')}\n`;
}
