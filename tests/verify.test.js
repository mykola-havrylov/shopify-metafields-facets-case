import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { seedCatalog } from '../scripts/src/catalog-seed.js';
import { canonicalCatalog } from '../scripts/src/catalog.js';
import { loadDefinitionFiles } from '../scripts/src/definitions.js';
import { loadDictionaryFiles } from '../scripts/src/dictionaries.js';
import {
  FACET_GROUP_LIMIT,
  FILTERABLE_KEYS,
  NON_FILTERABLE_KEYS,
  planFilterChecks,
  readStoreState,
  verifyCatalog,
  verifyPlatformFilters,
} from '../scripts/src/verify.js';
import { fakeShopify } from './helpers/fake-shopify.js';

let catalog;
let dictionaries;
let options;

before(async () => {
  catalog = canonicalCatalog();
  dictionaries = await loadDictionaryFiles();
  const { metafields } = await loadDefinitionFiles();
  const metafieldTypes = Object.fromEntries(metafields.definitions.map(({ key, type }) => [key, type]));
  options = { roasters: dictionaries.roasters, processMethods: dictionaries.processMethods, metafieldTypes };
});

const invert = (map) => new Map([...map].map(([handle, id]) => [id, handle]));

/** Seeds `products` into a fake store and returns what verify needs. */
async function seeded(products = catalog) {
  const fake = fakeShopify(dictionaries);
  await seedCatalog({ client: fake.client, products, ...options });
  const { products: stored } = await readStoreState(fake.client, 'gid://shopify/Publication/1');
  const run = (overrides = {}) =>
    verifyCatalog({
      expected: products,
      knownHandles: new Set(products.map(({ handle }) => handle)),
      products: stored,
      roasterHandleById: invert(fake.state.metaobjects.roaster),
      processHandleById: invert(fake.state.metaobjects.process_method),
      dictionaries,
      ...overrides,
    });
  return { ...fake, stored, run };
}

const filterArgs = (state) => ({
  roasterIds: state.metaobjects.roaster,
  processIds: state.metaobjects.process_method,
  sleep: async () => {},
});

describe('verifyCatalog', () => {
  it('passes for a correctly seeded catalog and counts facet group values', async () => {
    const { run } = await seeded();
    const { failures, facetGroups } = run();
    assert.deepEqual(failures, []);
    assert.deepEqual(Object.keys(facetGroups), FILTERABLE_KEYS);
    assert.equal(facetGroups.roaster, 6);
    assert.equal(facetGroups.process, 5);
    assert.equal(facetGroups.decaf, 2);
  });

  it('fails on a missing product', async () => {
    const { run, stored } = await seeded();
    const { failures } = run({ products: stored.slice(1) });
    assert.deepEqual(failures, [`missing product "${stored[0].handle}"`]);
  });

  it('fails on a missing field', async () => {
    const { run, stored } = await seeded();
    stored[0].metafields.delete('altitude_masl');
    stored[1].metafields.set('variety', { type: 'list.single_line_text_field', value: '' });
    const { failures } = run();
    assert.ok(failures.includes(`"${stored[0].handle}": missing metafield coffee.altitude_masl`));
    assert.ok(failures.includes(`"${stored[1].handle}": missing metafield coffee.variety`));
  });

  it('fails on a value outside the dictionary', async () => {
    const { run, stored } = await seeded();
    stored[0].metafields.set('origin', { type: 'list.single_line_text_field', value: '["Atlantis"]' });
    stored[1].metafields.set('roast_level', { type: 'single_line_text_field', value: 'Burnt' });
    stored[2].metafields.set('roaster', { type: 'metaobject_reference', value: 'gid://shopify/Metaobject/999' });
    const { failures } = run();
    assert.ok(failures.some((f) => /coffee\.origin value "Atlantis" is outside the dictionary/.test(f)));
    assert.ok(failures.some((f) => /coffee\.roast_level value "Burnt" is outside the dictionary/.test(f)));
    assert.ok(failures.some((f) => /coffee\.roaster: .* is not a known roaster entry/.test(f)));
  });

  it('fails when a value is valid but differs from the source', async () => {
    const { run, stored } = await seeded();
    const current = stored[0].metafields.get('cupping_score');
    stored[0].metafields.set('cupping_score', { ...current, value: '70' });
    assert.ok(run().failures.some((f) => /coffee\.cupping_score is 70, expected/.test(f)));
  });

  it('fails on an unexpected product, such as a handle with a numeric suffix', async () => {
    const { run, stored } = await seeded();
    const extra = { ...stored[0], handle: `${stored[0].handle}-1` };
    const { failures } = run({ products: [...stored, extra] });
    assert.ok(failures.some((f) => /unexpected product ".*-1"/.test(f)));
  });

  it('fails when a product is draft, unpublished or outside the collection', async () => {
    const { run, stored } = await seeded();
    stored[0].status = 'DRAFT';
    stored[1].published = false;
    stored[2].collections = [];
    const { failures } = run();
    assert.ok(failures.some((f) => /status is DRAFT/.test(f)));
    assert.ok(failures.some((f) => /not published to the Online Store/.test(f)));
    assert.ok(failures.some((f) => /not in the "coffee" collection/.test(f)));
  });

  it('fails on missing variants and wrong prices', async () => {
    const { run, stored } = await seeded();
    stored[0].variants.pop();
    stored[1].variants[0].price = '1.00';
    const { failures } = run();
    assert.ok(failures.some((f) => /variants, expected/.test(f)));
    assert.ok(failures.some((f) => /missing variant/.test(f)));
    assert.ok(failures.some((f) => /costs 1\.00, expected/.test(f)));
  });

  it('fails when a facet group has more than 200 unique values', async () => {
    const many = Array.from({ length: FACET_GROUP_LIMIT + 5 }, (_, i) => ({
      ...catalog[0],
      handle: `bulk-${i}`,
      title: `Bulk ${i}`,
      cupping_score: 50 + i / 10,
    }));
    const { run } = await seeded(many);
    const { failures, facetGroups } = run();
    assert.equal(facetGroups.cupping_score, FACET_GROUP_LIMIT + 5);
    assert.ok(failures.some((f) => /coffee\.cupping_score has 205 unique values, the limit is 200/.test(f)));
  });
});

describe('platform filter checks', () => {
  it('plans positive checks only for filterable metafields and rejections for the other four', () => {
    const ids = {
      roasterIds: new Map(catalog.map(({ roaster }, i) => [roaster, `gid://shopify/Metaobject/${i}`])),
      processIds: new Map(catalog.map(({ process }, i) => [process, `gid://shopify/Metaobject/${i}`])),
    };
    const { checks, rejected } = planFilterChecks(catalog, ids);
    for (const { query } of checks) {
      assert.ok(
        FILTERABLE_KEYS.some((key) => query.includes(`metafields.coffee.${key}:`)),
        query,
      );
      assert.ok(!NON_FILTERABLE_KEYS.some((key) => query.includes(`metafields.coffee.${key}:`)), query);
    }
    assert.equal(rejected.length, NON_FILTERABLE_KEYS.length);
    assert.equal(checks.find(({ label }) => label === 'decaf:true').count, 3);
  });

  it('passes on a correctly seeded store', async () => {
    const { client, state } = await seeded();
    const result = await verifyPlatformFilters({ client, expected: catalog, ...filterArgs(state) });
    assert.deepEqual(result.failures, []);
    assert.ok(result.checked >= 11);
  });

  it('fails when the Admin API accepts a filter on a non-filterable metafield', async () => {
    const { client, state } = await seeded();
    state.acceptNonFilterable = true;
    const { failures } = await verifyPlatformFilters({ client, expected: catalog, ...filterArgs(state) });
    assert.equal(failures.length, NON_FILTERABLE_KEYS.length);
    assert.ok(failures.every((f) => /should reject filtering by a non-filterable metafield/.test(f)));
  });

  it('retries a count mismatch before failing, then reports it', async () => {
    const { client, state } = await seeded();
    const handle = catalog.find(({ decaf }) => decaf).handle;
    const product = state.products.get(handle);
    product.input.metafields = product.input.metafields.filter(({ key }) => key !== 'decaf');

    let sleeps = 0;
    const { failures } = await verifyPlatformFilters({
      client,
      expected: catalog,
      ...filterArgs(state),
      sleep: async () => {
        sleeps += 1;
      },
      attempts: 3,
    });
    assert.deepEqual(failures, ['filter decaf:true: 2 products, expected 3']);
    assert.equal(sleeps, 2);
  });
});
