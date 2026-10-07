import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { before, describe, it } from 'node:test';
import { canonicalCatalog, toRawExport } from '../scripts/src/catalog.js';
import { loadDictionaries, loadDictionaryFiles } from '../scripts/src/dictionaries.js';
import {
  NormalizationError,
  compileDictionaries,
  lookupKey,
  normalizeCatalog,
  normalizeCatalogOrThrow,
} from '../scripts/src/normalize.js';
import { buildReport, renderMarkdown } from '../scripts/src/report.js';

let ctx;
let files;
let raw;
let base; // one valid raw product to tweak

before(async () => {
  files = await loadDictionaryFiles();
  ctx = await loadDictionaries();
  raw = JSON.parse(await readFile(new URL('../data/source/products.raw.json', import.meta.url), 'utf8'));
  base = raw[0];
});

/** Normalizes `base` with some raw columns replaced and returns the first product plus issues. */
const normalizeWith = (overrides) => {
  const { products, issues } = normalizeCatalog([{ ...base, ...overrides }], ctx);
  return { product: products[0], issues };
};

describe('lookupKey', () => {
  it('ignores case, accents, punctuation and whitespace', () => {
    assert.equal(lookupKey('  Ethiopía '), 'ethiopia');
    assert.equal(lookupKey('Med-Light'), 'med light');
    assert.equal(lookupKey('SL-28'), 'sl 28');
    assert.equal(lookupKey('City+'), 'city');
  });
});

describe('compileDictionaries', () => {
  it('rejects a synonym that maps to two different canonical values', () => {
    const vocabularies = {
      ...files.vocabularies,
      origins: [
        { canonical: 'Colombia', synonyms: ['Columbia'] },
        { canonical: 'Columbia', synonyms: [] },
      ],
    };
    assert.throws(() => compileDictionaries({ ...files, vocabularies }), /maps to both/);
  });

  it('compiles the shipped dictionaries without collisions', () => {
    assert.doesNotThrow(() => compileDictionaries(files));
  });
});

describe('generated catalog', () => {
  it('has 24-30 products, all different and diverse enough for seven facet groups', () => {
    const catalog = canonicalCatalog();
    assert.ok(catalog.length >= 24 && catalog.length <= 30, `${catalog.length} products`);
    assert.equal(new Set(catalog.map(({ handle }) => handle)).size, catalog.length);

    const distinct = (pick) => new Set(catalog.flatMap(pick)).size;
    assert.ok(distinct((p) => [p.roaster]) >= 5);
    assert.ok(distinct((p) => p.origin) >= 8);
    assert.equal(
      distinct((p) => [p.process]),
      5,
    );
    assert.equal(
      distinct((p) => [p.roast_level]),
      5,
    );
    assert.equal(
      distinct((p) => [p.decaf]),
      2,
    );
    assert.ok(Math.max(...catalog.map((p) => p.cupping_score)) - Math.min(...catalog.map((p) => p.cupping_score)) > 8);
    assert.ok(
      Math.max(...catalog.map((p) => p.altitude_masl)) - Math.min(...catalog.map((p) => p.altitude_masl)) > 1000,
    );
    // Facet groups are capped at 200 unique values.
    assert.ok(distinct((p) => p.tasting_notes) < 200);
  });

  it('keeps the committed raw export in sync with the generator', () => {
    assert.deepEqual(raw, toRawExport(canonicalCatalog(), files));
  });

  it('is genuinely dirty: raw values differ in casing, whitespace, separators, formats and units', () => {
    const cells = (key) => new Set(raw.map((product) => product[key]));
    assert.ok(
      raw.some(({ brand }) => brand !== brand.trim()),
      'whitespace',
    );
    assert.ok(
      raw.some(({ countries }) => countries !== countries.toLowerCase() && countries !== countries.toUpperCase()),
      'mixed case',
    );
    assert.ok(
      raw.some(({ cupping_score }) => cupping_score.includes(',')),
      'decimal comma',
    );
    assert.ok(
      raw.some(({ altitude }) => /ft/.test(altitude)),
      'feet',
    );
    assert.ok(
      raw.some(({ sizes }) => /oz/.test(sizes)),
      'ounces',
    );
    assert.ok(
      raw.some(({ price_250g }) => price_250g.includes('$')),
      'currency symbol',
    );
    assert.ok(cells('process').size > 12, 'process synonyms');
  });
});

describe('normalizeCatalog', () => {
  it('turns the dirty export into exactly the canonical catalog', () => {
    const products = normalizeCatalogOrThrow(raw, ctx);
    assert.deepEqual(products, canonicalCatalog());
  });

  it('parses each field format', () => {
    const { product, issues } = normalizeWith({
      cupping_score: ' 86,5 pts ',
      altitude: '6234 ft',
      decaf: ' Y ',
      harvest: 'Crop 2025',
      sizes: '8.8 oz, 1000 g',
      price_250g: '18,5 USD',
      tasting_notes: 'DARK chocolate;  caramel / dark Chocolate',
      countries: 'costa  rica & Brasil',
    });
    assert.deepEqual(issues, []);
    assert.equal(product.cupping_score, 86.5);
    assert.equal(product.altitude_masl, 1900);
    assert.equal(product.decaf, true);
    assert.equal(product.harvest_year, 2025);
    assert.deepEqual(product.sizes, ['250 g', '1 kg']);
    assert.equal(product.price_250g, '18.50');
    assert.deepEqual(product.tasting_notes, ['Dark chocolate', 'Caramel']);
    assert.deepEqual(product.origin, ['Costa Rica', 'Brazil']);
  });

  it('reads thousands separators in altitudes but not decimals', () => {
    for (const value of ['1,950 m', '1.950 m', '1 950 masl', '1950']) {
      assert.equal(normalizeWith({ altitude: value }).product.altitude_masl, 1950, value);
    }
    assert.match(normalizeWith({ altitude: '1.5 m' }).issues[0].reason, /unrecognized altitude/);
  });

  it('splits brew guides into paragraphs from newlines, <br> and <p>', () => {
    const expected = ['One.', 'Two.'];
    for (const value of ['One.\n\nTwo.', 'One.<br><br>Two.', '<p>One.</p><p>Two.</p>', 'One.\r\n\r\nTwo.']) {
      assert.deepEqual(normalizeWith({ brew_guide: value }).product.brew_guide, expected, value);
    }
  });

  it('records every rejected value as an issue instead of guessing or skipping it', () => {
    const cases = [
      [{ brand: 'Mystery Roasters' }, 'roaster', /unknown roaster/],
      [{ countries: 'Ethiopia, Atlantis' }, 'origin', /unknown origin/],
      [{ process: 'carbonic maceration' }, 'process', /unknown process method/],
      [{ roast: 'burnt' }, 'roast_level', /unknown roast level/],
      [{ variety: 'Bourbon, Unobtainium' }, 'variety', /unknown variety/],
      [{ grinds: 'Whole bean, Powder' }, 'grinds', /unknown grind/],
      [{ cupping_score: '101' }, 'cupping_score', /outside 0-100/],
      [{ cupping_score: '86.256' }, 'cupping_score', /more than 2 decimal/],
      [{ cupping_score: 'great' }, 'cupping_score', /unrecognized cupping/],
      [{ altitude: '12000 ft' }, 'altitude_masl', /outside 0-3000/],
      [{ altitude: '1900 yards' }, 'altitude_masl', /unrecognized altitude/],
      [{ decaf: 'maybe' }, 'decaf', /unrecognized decaf/],
      [{ harvest: 'last year' }, 'harvest_year', /unrecognized harvest/],
      [{ sizes: '300 g' }, 'sizes', /not one of/],
      [{ sizes: '1 lb' }, 'sizes', /unrecognized size/],
      [{ price_250g: 'free' }, 'price_250g', /unrecognized price/],
      [{ brew_guide: '<b>Bold</b> advice' }, 'brew_guide', /unsupported markup/],
      [{ countries: '' }, 'origin', /missing value/],
      [{ variety: undefined }, 'variety', /missing value/],
    ];
    for (const [overrides, field, reason] of cases) {
      const { issues } = normalizeWith(overrides);
      assert.equal(issues.length, 1, JSON.stringify(overrides));
      assert.equal(issues[0].field, field);
      assert.match(issues[0].reason, reason);
    }
  });

  it('reports all problems of a run, not just the first', () => {
    const { issues } = normalizeCatalog(
      [
        { ...base, brand: 'Nobody', roast: 'burnt' },
        { ...base, title: 'Another', altitude: '??' },
      ],
      ctx,
    );
    assert.deepEqual(
      issues.map(({ field }) => field),
      ['roaster', 'roast_level', 'altitude_masl'],
    );
  });

  it('fails on duplicate handles', () => {
    const { issues } = normalizeCatalog([base, { ...base, title: base.title.toUpperCase() }], ctx);
    assert.match(issues[0].reason, /duplicate handle/);
  });

  it('stops the pipeline with a NormalizationError listing the issues', () => {
    assert.throws(
      () => normalizeCatalogOrThrow([{ ...base, brand: 'Nobody' }], ctx),
      (error) =>
        error instanceof NormalizationError && error.issues.length === 1 && /unknown roaster/.test(error.message),
    );
  });

  it('is pure: the input is not modified', () => {
    const before = JSON.stringify(raw);
    normalizeCatalog(raw, ctx);
    assert.equal(JSON.stringify(raw), before);
  });
});

describe('buildReport', () => {
  it('shows distinct raw values merging into canonical ones', () => {
    const result = normalizeCatalog(raw, ctx);
    const report = buildReport(raw, ctx, result);

    assert.equal(report.products, raw.length);
    assert.equal(report.issues.length, 0);
    assert.equal(report.totals.rejected, 0);
    assert.ok(report.totals.rawDistinct > report.totals.canonicalDistinct);
    assert.equal(report.fields.roaster.canonicalDistinct, 6);
    assert.equal(report.fields.process.canonicalDistinct, 5);
    assert.ok(report.fields.roaster.rawDistinct > 6);
    assert.equal(report.totals.merged, report.totals.rawDistinct - report.totals.canonicalDistinct);
    assert.match(renderMarkdown(report), /# Normalization report[\s\S]*## roaster/);
  });

  it('lists rejected values', () => {
    const rawWithBad = [{ ...base, brand: 'Nobody' }];
    const report = buildReport(rawWithBad, ctx, normalizeCatalog(rawWithBad, ctx));
    assert.deepEqual(report.fields.roaster.rejected, [{ raw: 'Nobody', reason: 'unknown roaster' }]);
    assert.equal(report.totals.rejected, 1);
    assert.match(renderMarkdown(report), /Rejected:[\s\S]*unknown roaster/);
  });
});
