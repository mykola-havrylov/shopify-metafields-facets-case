// Verification of the seeded store against the normalized source of truth.
// verifyCatalog() and the filter plan are pure; readStoreState() and verifyPlatformFilters() talk to the Admin API.
import { COLLECTION, NAMESPACE, PRODUCT_TYPE, variantPrice, variantSku } from './catalog-seed.js';
import { ShopifyClientError } from './client.js';

export const FILTERABLE_KEYS = [
  'roaster',
  'origin',
  'process',
  'roast_level',
  'cupping_score',
  'altitude_masl',
  'decaf',
];
export const NON_FILTERABLE_KEYS = ['tasting_notes', 'variety', 'harvest_year', 'brew_guide'];
export const ALL_KEYS = [...FILTERABLE_KEYS, ...NON_FILTERABLE_KEYS];

// Search & Discovery: at most 200 unique values per filter group.
export const FACET_GROUP_LIMIT = 200;

const CATALOG_PRODUCTS = `#graphql
  query CatalogProducts($query: String!, $after: String, $publicationId: ID!) {
    products(first: 10, query: $query, after: $after) {
      nodes {
        id
        handle
        title
        status
        productType
        vendor
        publishedOnPublication(publicationId: $publicationId)
        collections(first: 10) { nodes { handle } }
        media(first: 5) { nodes { mediaContentType status } }
        metafields(namespace: "${NAMESPACE}", first: 20) { nodes { key type value } }
        variants(first: 30) { nodes { sku price selectedOptions { name value } } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const COUNT_PRODUCTS = `#graphql
  query CountProducts($query: String!) {
    productsCount(query: $query) { count }
  }
`;

/** Reads every Coffee product with the data verifyCatalog needs. */
export async function readStoreState(client, publicationId) {
  const products = [];
  let after = null;
  do {
    const { products: page } = await client.graphql(CATALOG_PRODUCTS, {
      query: `product_type:${PRODUCT_TYPE}`,
      after,
      publicationId,
    });
    for (const node of page.nodes) {
      products.push({
        id: node.id,
        handle: node.handle,
        title: node.title,
        status: node.status,
        vendor: node.vendor,
        published: node.publishedOnPublication,
        collections: node.collections.nodes.map(({ handle }) => handle),
        images: node.media.nodes.filter(({ mediaContentType }) => mediaContentType === 'IMAGE'),
        metafields: new Map(node.metafields.nodes.map(({ key, type, value }) => [key, { type, value }])),
        variants: node.variants.nodes.map(({ sku, price, selectedOptions }) => ({
          sku,
          price,
          options: Object.fromEntries(selectedOptions.map(({ name, value }) => [name, value])),
        })),
      });
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return { products };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Plain text of a rich_text_field value: one entry per paragraph. */
function paragraphsOf(value) {
  const root = JSON.parse(value);
  return root.children.map((node) => (node.children ?? []).map((child) => child.value ?? '').join(''));
}

/**
 * Decodes a stored metafield value into the canonical shape used by the source data.
 * @returns {{value: unknown} | {error: string}}
 */
function decode(key, { type, value }, { roasterHandleById, processHandleById }) {
  try {
    switch (type) {
      case 'metaobject_reference': {
        const handle = (key === 'roaster' ? roasterHandleById : processHandleById).get(value);
        return handle ? { value: handle } : { error: `${value} is not a known ${key} entry` };
      }
      case 'list.single_line_text_field':
        return { value: JSON.parse(value) };
      case 'number_decimal':
      case 'number_integer':
        return { value: Number(value) };
      case 'boolean':
        return { value: value === 'true' };
      case 'rich_text_field':
        return { value: paragraphsOf(value) };
      default:
        return { value };
    }
  } catch {
    return { error: `unreadable ${type} value` };
  }
}

/**
 * Compares the store with the expected catalog.
 *
 * @param {object} input
 * @param {object[]} input.expected         normalized products that must exist
 * @param {Set<string>} input.knownHandles  every legitimate catalog handle (pilot runs expect only a subset)
 * @param {object[]} input.products         from readStoreState
 * @param {Map<string,string>} input.roasterHandleById   metaobject GID -> handle
 * @param {Map<string,string>} input.processHandleById
 * @param {object} input.dictionaries       { roasters, processMethods, vocabularies } files
 * @returns {{failures: string[], facetGroups: Record<string, number>}}
 */
export function verifyCatalog({
  expected,
  knownHandles,
  products,
  roasterHandleById,
  processHandleById,
  dictionaries,
}) {
  const failures = [];
  const fail = (message) => failures.push(message);
  const byHandle = new Map(products.map((product) => [product.handle, product]));
  const allowed = {
    roaster: new Set(dictionaries.roasters.map(({ handle }) => handle)),
    process: new Set(dictionaries.processMethods.map(({ handle }) => handle)),
    origin: new Set(dictionaries.vocabularies.origins.map(({ canonical }) => canonical)),
    roast_level: new Set(dictionaries.vocabularies.roast_levels.map(({ canonical }) => canonical)),
    variety: new Set(dictionaries.vocabularies.varieties.map(({ canonical }) => canonical)),
  };
  const roasterTitles = new Map(dictionaries.roasters.map(({ handle, title }) => [handle, title]));
  const facetValues = Object.fromEntries(FILTERABLE_KEYS.map((key) => [key, new Set()]));

  for (const product of products) {
    if (!knownHandles.has(product.handle)) {
      fail(`unexpected product "${product.handle}" (a handle with a numeric suffix means a duplicate title)`);
    }
  }

  for (const want of expected) {
    const have = byHandle.get(want.handle);
    if (!have) {
      fail(`missing product "${want.handle}"`);
      continue;
    }
    const where = `"${want.handle}"`;

    if (have.status !== 'ACTIVE') fail(`${where}: status is ${have.status}, expected ACTIVE`);
    if (!have.published) fail(`${where}: not published to the Online Store`);
    if (!have.collections.includes(COLLECTION.handle)) fail(`${where}: not in the "${COLLECTION.handle}" collection`);
    if (!have.images.some(({ status }) => status === 'READY'))
      fail(`${where}: no product image in status READY (npm run upload-images)`);
    if (have.vendor !== roasterTitles.get(want.roaster))
      fail(`${where}: vendor is "${have.vendor}", expected "${roasterTitles.get(want.roaster)}"`);

    for (const key of ALL_KEYS) {
      const stored = have.metafields.get(key);
      if (!stored || stored.value === '' || stored.value === null) {
        fail(`${where}: missing metafield ${NAMESPACE}.${key}`);
        continue;
      }
      const decoded = decode(key, stored, { roasterHandleById, processHandleById });
      if ('error' in decoded) {
        fail(`${where}: ${NAMESPACE}.${key}: ${decoded.error}`);
        continue;
      }

      const items = Array.isArray(decoded.value) && key !== 'brew_guide' ? decoded.value : [decoded.value];
      if (allowed[key]) {
        for (const item of items) {
          if (!allowed[key].has(item)) fail(`${where}: ${NAMESPACE}.${key} value "${item}" is outside the dictionary`);
        }
      }
      if (!same(decoded.value, want[key])) {
        fail(
          `${where}: ${NAMESPACE}.${key} is ${JSON.stringify(decoded.value)}, expected ${JSON.stringify(want[key])}`,
        );
      }
      if (facetValues[key]) for (const item of items) facetValues[key].add(String(item));
    }

    const wantedVariants = want.sizes.flatMap((size) => want.grinds.map((grind) => ({ size, grind })));
    if (have.variants.length !== wantedVariants.length) {
      fail(`${where}: ${have.variants.length} variants, expected ${wantedVariants.length} (Size x Grind)`);
    }
    for (const { size, grind } of wantedVariants) {
      const variant = have.variants.find(({ options }) => options.Size === size && options.Grind === grind);
      if (!variant) {
        fail(`${where}: missing variant ${size} / ${grind}`);
        continue;
      }
      if (Number(variant.price) !== Number(variantPrice(want.price_250g, size))) {
        fail(
          `${where}: variant ${size} / ${grind} costs ${variant.price}, expected ${variantPrice(want.price_250g, size)}`,
        );
      }
      if (variant.sku !== variantSku(want.handle, size, grind))
        fail(`${where}: variant ${size} / ${grind} has SKU "${variant.sku}"`);
    }
  }

  const facetGroups = Object.fromEntries(Object.entries(facetValues).map(([key, values]) => [key, values.size]));
  for (const [key, count] of Object.entries(facetGroups)) {
    if (count > FACET_GROUP_LIMIT)
      fail(`facet ${NAMESPACE}.${key} has ${count} unique values, the limit is ${FACET_GROUP_LIMIT}`);
  }
  return { failures, facetGroups };
}

// ---- Platform filter behavior ---------------------------------------------------------------------------------

const countWhere = (expected, predicate) => expected.filter(predicate).length;
const distinct = (values) => [...new Set(values)];

/**
 * Admin API product queries that must work, with the count the expected catalog implies.
 * Only the seven filterable metafields are used for positive checks.
 */
export function planFilterChecks(expected, { roasterIds, processIds }) {
  const q = (filter) => `product_type:${PRODUCT_TYPE} AND metafields.${NAMESPACE}.${filter}`;
  const checks = [
    { label: 'decaf:true', query: q('decaf:true'), count: countWhere(expected, (p) => p.decaf) },
    {
      label: 'cupping_score >= 88',
      query: q('cupping_score:>=88'),
      count: countWhere(expected, (p) => p.cupping_score >= 88),
    },
    {
      label: 'altitude_masl >= 2000',
      query: q('altitude_masl:>=2000'),
      count: countWhere(expected, (p) => p.altitude_masl >= 2000),
    },
    {
      label: 'origin:Ethiopia',
      query: q('origin:"Ethiopia"'),
      count: countWhere(expected, (p) => p.origin.includes('Ethiopia')),
    },
    ...distinct(expected.map((p) => p.roast_level)).map((level) => ({
      label: `roast_level:${level}`,
      query: q(`roast_level:"${level}"`),
      count: countWhere(expected, (p) => p.roast_level === level),
    })),
  ];
  const roaster = expected[0].roaster;
  const process = expected[0].process;
  checks.push(
    {
      label: `roaster:${roaster}`,
      query: q(`roaster:"${roasterIds.get(roaster)}"`),
      count: countWhere(expected, (p) => p.roaster === roaster),
    },
    {
      label: `process:${process}`,
      query: q(`process:"${processIds.get(process)}"`),
      count: countWhere(expected, (p) => p.process === process),
    },
  );

  // On 2026-10 filtering by a metafield without a filterable definition is an error, not an ignored predicate.
  const rejected = NON_FILTERABLE_KEYS.map((key) => ({
    label: `${key} (not filterable)`,
    query: q(key === 'harvest_year' ? `${key}:2025` : `${key}:"x"`),
  }));
  return { checks, rejected };
}

/**
 * Runs the filter plan against the store. Metafield search indexing can lag a little behind writes,
 * so a count mismatch is retried a few times before it counts as a failure.
 */
export async function verifyPlatformFilters({
  client,
  expected,
  roasterIds,
  processIds,
  sleep,
  attempts = 4,
  delayMs = 2000,
}) {
  const failures = [];
  const { checks, rejected } = planFilterChecks(expected, { roasterIds, processIds });

  for (const { label, query, count } of checks) {
    let actual;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      ({
        productsCount: { count: actual },
      } = await client.graphql(COUNT_PRODUCTS, { query }));
      if (actual === count) break;
      if (attempt < attempts) await sleep(delayMs);
    }
    if (actual !== count) failures.push(`filter ${label}: ${actual} products, expected ${count}`);
  }

  for (const { label, query } of rejected) {
    try {
      await client.graphql(COUNT_PRODUCTS, { query });
      failures.push(
        `filter ${label}: the Admin API accepted it, but 2026-10 should reject filtering by a non-filterable metafield`,
      );
    } catch (error) {
      if (!(error instanceof ShopifyClientError) || error.throttled) throw error;
    }
  }
  return { failures, checked: checks.length + rejected.length };
}
