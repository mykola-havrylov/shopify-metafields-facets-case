import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import {
  PILOT_HANDLES,
  isOnlineStoreCatalog,
  SIZE_PRICE_FACTORS,
  buildMetafields,
  buildProductSetInput,
  fetchMetaobjectIds,
  pilotProducts,
  richTextFromParagraphs,
  seedCatalog,
  variantPrice,
} from '../scripts/src/catalog-seed.js';
import { canonicalCatalog } from '../scripts/src/catalog.js';
import { loadDefinitionFiles } from '../scripts/src/definitions.js';
import { loadDictionaryFiles } from '../scripts/src/dictionaries.js';
import { fakeShopify } from './helpers/fake-shopify.js';

let catalog;
let dictionaries;
let metafieldTypes;
let options;

before(async () => {
  catalog = canonicalCatalog();
  dictionaries = await loadDictionaryFiles();
  const { metafields } = await loadDefinitionFiles();
  metafieldTypes = Object.fromEntries(metafields.definitions.map(({ key, type }) => [key, type]));
  options = { roasters: dictionaries.roasters, processMethods: dictionaries.processMethods, metafieldTypes };
});

const ids = (prefix, handles) =>
  new Map(handles.map((handle, i) => [handle, `gid://shopify/Metaobject/${prefix}${i}`]));

describe('product input', () => {
  const product = () => catalog.find(({ handle }) => handle === 'nyeri-kiambu-aa'); // 3 sizes x 3 grinds
  const context = () => ({
    types: metafieldTypes,
    roasterIds: ids(
      1,
      dictionaries.roasters.map(({ handle }) => handle),
    ),
    processIds: ids(
      2,
      dictionaries.processMethods.map(({ handle }) => handle),
    ),
  });

  it('builds all 11 metafields with the types from the definitions', () => {
    const metafields = buildMetafields(product(), context());
    assert.equal(metafields.length, 11);
    for (const { namespace, key, type } of metafields) {
      assert.equal(namespace, 'coffee');
      assert.equal(type, metafieldTypes[key], key);
    }
    const value = (key) => metafields.find((metafield) => metafield.key === key).value;
    assert.match(value('roaster'), /^gid:\/\/shopify\/Metaobject\/1/);
    assert.equal(value('origin'), '["Kenya"]');
    assert.equal(value('cupping_score'), '87');
    assert.equal(value('decaf'), 'false');
  });

  it('fails when a referenced metaobject entry has not been seeded', () => {
    assert.throws(() => buildMetafields(product(), { ...context(), roasterIds: new Map() }), /seed:metaobjects/);
  });

  it('creates Size x Grind variants with prices by size and unique SKUs', () => {
    const input = buildProductSetInput(product(), {
      roasterTitle: 'Copper Kettle Coffee',
      processTitle: 'Washed',
      collectionId: 'gid://shopify/Collection/1',
      metafields: [],
    });
    assert.deepEqual(
      input.productOptions.map(({ name }) => name),
      ['Size', 'Grind'],
    );
    assert.equal(input.variants.length, product().sizes.length * product().grinds.length);
    assert.equal(new Set(input.variants.map(({ sku }) => sku)).size, input.variants.length);
    const kilo = input.variants.find(({ optionValues }) => optionValues[0].name === '1 kg');
    assert.equal(kilo.price, (17.9 * SIZE_PRICE_FACTORS['1 kg']).toFixed(2));
    assert.equal(input.vendor, 'Copper Kettle Coffee');
    assert.deepEqual(input.collections, ['gid://shopify/Collection/1']);
    assert.equal(input.status, 'ACTIVE');
  });

  it('escapes HTML in the generated description', () => {
    const harbor = catalog.find(({ roaster }) => roaster === 'harbor-and-hill');
    const input = buildProductSetInput(harbor, {
      roasterTitle: 'Harbor & Hill',
      processTitle: 'Washed',
      collectionId: 'x',
      metafields: [],
    });
    assert.match(input.descriptionHtml, /Harbor &amp; Hill/);
  });

  it('writes brew guides as a rich text document with one paragraph each', () => {
    const doc = JSON.parse(richTextFromParagraphs(['One.', 'Two.']));
    assert.equal(doc.type, 'root');
    assert.deepEqual(
      doc.children.map((node) => [node.type, node.children[0].value]),
      [
        ['paragraph', 'One.'],
        ['paragraph', 'Two.'],
      ],
    );
  });

  it('rounds variant prices to cents', () => {
    assert.equal(variantPrice('12.90', '500 g'), '23.22');
    assert.equal(variantPrice('12.90', '250 g'), '12.90');
  });
});

describe('Online Store publication', () => {
  it('is recognized by its catalog title, as returned by Shopify', () => {
    assert.ok(isOnlineStoreCatalog('Channel Catalog 206156660926 for Online Store'));
    assert.ok(isOnlineStoreCatalog('Online Store'));
    assert.ok(!isOnlineStoreCatalog('Channel Catalog 206156693694 for Shop'));
    assert.ok(!isOnlineStoreCatalog('Channel Catalog 206156726462 for Point of Sale'));
    assert.ok(!isOnlineStoreCatalog(undefined));
  });
});

describe('pilot batch', () => {
  it('is 5 existing products that cover a decaf, four roast levels and three processes', () => {
    const pilot = pilotProducts(catalog);
    assert.equal(pilot.length, 5);
    assert.deepEqual(
      pilot.map(({ handle }) => handle),
      PILOT_HANDLES,
    );
    assert.ok(pilot.some(({ decaf }) => decaf));
    assert.ok(new Set(pilot.map(({ roast_level }) => roast_level)).size >= 4);
    assert.ok(new Set(pilot.map(({ process }) => process)).size >= 3);
  });

  it('fails when a pilot handle is missing from the catalog', () => {
    assert.throws(() => pilotProducts(catalog.slice(1)), /Pilot product/);
  });
});

describe('fetchMetaobjectIds', () => {
  it('reads every entry across pages', async () => {
    const { client, state } = fakeShopify(dictionaries);
    state.metaobjectPageSize = 2;

    const ids = await fetchMetaobjectIds(client, 'roaster');
    assert.equal(ids.size, dictionaries.roasters.length);
    assert.deepEqual(
      [...ids.keys()],
      dictionaries.roasters.map(({ handle }) => handle),
    );
  });
});

describe('seedCatalog', () => {
  it('dry run reads only', async () => {
    const { client, state } = fakeShopify(dictionaries);
    const { collection, results } = await seedCatalog({ client, products: catalog, ...options, dryRun: true });
    assert.equal(collection.status, 'would-create');
    assert.ok(results.every(({ status }) => status === 'would-create'));
    assert.deepEqual(state.mutations, []);
  });

  it('creates the collection first, then every product, and publishes all of them', async () => {
    const { client, state } = fakeShopify(dictionaries);
    const { collection, results } = await seedCatalog({ client, products: catalog, ...options });

    assert.equal(collection.status, 'created');
    assert.equal(state.mutations[0], 'collection:coffee');
    assert.ok(results.every(({ status }) => status === 'created'));
    assert.equal(state.products.size, catalog.length);
    assert.equal(state.publishedProducts.size, catalog.length);
    assert.equal(state.publishedCollections.size, 1);
    assert.ok([...state.products.values()].every(({ input }) => input.collections[0] === collection.id));
  });

  it('pilot first, then the full catalog, without duplicates or a second collection', async () => {
    const { client, state } = fakeShopify(dictionaries);
    await seedCatalog({ client, products: pilotProducts(catalog), ...options });
    assert.equal(state.products.size, 5);

    const { results } = await seedCatalog({ client, products: catalog, ...options });
    assert.equal(results.filter(({ status }) => status === 'synced').length, 5);
    assert.equal(results.filter(({ status }) => status === 'created').length, catalog.length - 5);
    assert.equal(state.products.size, catalog.length);
    assert.equal(state.mutations.filter((m) => m.startsWith('collection:')).length, 1);
  });

  it('is idempotent: a repeat run creates nothing new and does not republish', async () => {
    const { client, state } = fakeShopify(dictionaries);
    await seedCatalog({ client, products: catalog, ...options });
    const publishes = state.mutations.filter((m) => m.startsWith('publish:')).length;

    const { collection, results } = await seedCatalog({ client, products: catalog, ...options });
    assert.equal(collection.status, 'exists');
    assert.ok(results.every(({ status }) => status === 'synced'));
    assert.equal(state.products.size, catalog.length);
    assert.equal(state.mutations.filter((m) => m.startsWith('publish:')).length, publishes);
  });

  it('fails when the Online Store publication is missing', async () => {
    const { client, state } = fakeShopify(dictionaries);
    state.publicationTitle = 'Channel Catalog 1 for Something Else';
    await assert.rejects(
      seedCatalog({ client, products: catalog, ...options }),
      /No "Online Store" publication.*Something Else.*Point of Sale/,
    );
  });

  it('fails on userErrors from productSet', async () => {
    const { client, state } = fakeShopify(dictionaries);
    state.userErrors.product = [{ field: ['input', 'variants'], message: 'Too many', code: 'INVALID' }];
    await assert.rejects(
      seedCatalog({ client, products: catalog, ...options }),
      /Saving product "yirgacheffe-kochere" failed: input\.variants: Too many \(INVALID\)/,
    );
  });
});
