// Idempotent seed of the coffee catalog: one manual collection, products with Size x Grind variants,
// the 11 `coffee.*` metafields (references resolved to metaobject ids), all published to the Online Store.
// Products are written with productSet keyed by handle, so a repeat run updates instead of duplicating.

export const NAMESPACE = 'coffee';
export const PRODUCT_TYPE = 'Coffee';
export const COLLECTION = { handle: 'coffee', title: 'Coffee' };
export const ONLINE_STORE_PUBLICATION_TITLE = 'Online Store';

// The catalog title of the Online Store publication looks like "Channel Catalog 206156660926 for Online Store".
export const isOnlineStoreCatalog = (title) =>
  title === ONLINE_STORE_PUBLICATION_TITLE || (title ?? '').endsWith(` for ${ONLINE_STORE_PUBLICATION_TITLE}`);

// Five products spread over every roast level, three processes and a decaf: the pilot batch.
export const PILOT_HANDLES = [
  'yirgacheffe-kochere',
  'huila-supremo',
  'cerrado-mineiro',
  'sumatra-mandheling',
  'decaf-colombia-sugarcane',
];

// Price of a variant relative to the 250 g price.
export const SIZE_PRICE_FACTORS = { '250 g': 1, '500 g': 1.8, '1 kg': 3.2 };

export const variantPrice = (price250g, size) => (Number(price250g) * SIZE_PRICE_FACTORS[size]).toFixed(2);

export const variantSku = (handle, size, grind) =>
  [handle, size, grind].map((part) => part.toLowerCase().replace(/[^a-z0-9]+/g, '-')).join('-');

export const pilotProducts = (products) =>
  PILOT_HANDLES.map((handle) => {
    const product = products.find((candidate) => candidate.handle === handle);
    if (!product) throw new Error(`Pilot product "${handle}" is not in the catalog.`);
    return product;
  });

/** `rich_text_field` value: one paragraph per brew guide paragraph. */
export const richTextFromParagraphs = (paragraphs) =>
  JSON.stringify({
    type: 'root',
    children: paragraphs.map((text) => ({ type: 'paragraph', children: [{ type: 'text', value: text }] })),
  });

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The generated product description as plain text. */
export function descriptionText(product, { roasterTitle, processTitle }) {
  const origin = product.origin.join(' / ');
  const notes = product.tasting_notes.join(', ').toLowerCase();
  return `${product.title} by ${roasterTitle}: a ${product.roast_level.toLowerCase()} roast, ${processTitle.toLowerCase()} process coffee from ${origin}. Tasting notes: ${notes}.`;
}

export function descriptionHtml(product, titles) {
  return `<p>${escapeHtml(descriptionText(product, titles))}</p>`;
}

/** Metafield inputs for the 11 keys. `types` maps key -> metafield type from scripts/definitions. */
export function buildMetafields(product, { types, roasterIds, processIds }) {
  const idOf = (ids, handle, what) => {
    const id = ids.get(handle);
    if (!id) throw new Error(`No ${what} metaobject with handle "${handle}"; run npm run seed:metaobjects.`);
    return id;
  };
  const values = {
    roaster: idOf(roasterIds, product.roaster, 'roaster'),
    origin: JSON.stringify(product.origin),
    process: idOf(processIds, product.process, 'process_method'),
    roast_level: product.roast_level,
    cupping_score: String(product.cupping_score),
    altitude_masl: String(product.altitude_masl),
    decaf: String(product.decaf),
    tasting_notes: JSON.stringify(product.tasting_notes),
    variety: JSON.stringify(product.variety),
    harvest_year: String(product.harvest_year),
    brew_guide: richTextFromParagraphs(product.brew_guide),
  };
  return Object.entries(values).map(([key, value]) => ({ namespace: NAMESPACE, key, type: types[key], value }));
}

export function buildProductSetInput(product, { roasterTitle, processTitle, collectionId, metafields }) {
  return {
    handle: product.handle,
    title: product.title,
    vendor: roasterTitle,
    productType: PRODUCT_TYPE,
    status: 'ACTIVE',
    descriptionHtml: descriptionHtml(product, { roasterTitle, processTitle }),
    collections: [collectionId],
    productOptions: [
      { name: 'Size', position: 1, values: product.sizes.map((name) => ({ name })) },
      { name: 'Grind', position: 2, values: product.grinds.map((name) => ({ name })) },
    ],
    variants: product.sizes.flatMap((size) =>
      product.grinds.map((grind) => ({
        optionValues: [
          { optionName: 'Size', name: size },
          { optionName: 'Grind', name: grind },
        ],
        price: variantPrice(product.price_250g, size),
        sku: variantSku(product.handle, size, grind),
      })),
    ),
    metafields,
  };
}

// ---- Admin API ----------------------------------------------------------------------------------------------

const METAOBJECT_IDS = `#graphql
  query MetaobjectIds($type: String!) {
    metaobjects(type: $type, first: 100) {
      nodes { id handle }
    }
  }
`;

const PUBLICATIONS = `#graphql
  query OnlineStorePublication {
    publications(first: 20) {
      nodes { id catalog { title } }
    }
  }
`;

const COLLECTION_BY_HANDLE = `#graphql
  query CollectionByHandle($handle: String!) {
    collectionByIdentifier(identifier: { handle: $handle }) {
      id
      handle
    }
  }
`;

const CREATE_COLLECTION = `#graphql
  mutation CreateCollection($collection: CollectionCreateInput!) {
    collectionCreate(collection: $collection) {
      collection { id handle }
      userErrors { field message }
    }
  }
`;

const PRODUCT_BY_HANDLE = `#graphql
  query ProductByHandle($handle: String!) {
    productByIdentifier(identifier: { handle: $handle }) {
      id
      handle
    }
  }
`;

const PRODUCT_SET = `#graphql
  mutation ProductSet($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
    productSet(input: $input, identifier: $identifier, synchronous: true) {
      product { id handle }
      userErrors { field message code }
    }
  }
`;

const PRODUCT_PUBLISHED = `#graphql
  query ProductPublished($id: ID!, $publicationId: ID!) {
    product(id: $id) {
      publishedOnPublication(publicationId: $publicationId)
    }
  }
`;

const COLLECTION_PUBLISHED = `#graphql
  query CollectionPublished($id: ID!, $publicationId: ID!) {
    collection(id: $id) {
      publishedOnPublication(publicationId: $publicationId)
    }
  }
`;

const PUBLISH = `#graphql
  mutation PublishToChannel($id: ID!, $publicationId: ID!) {
    publishablePublish(id: $id, input: [{ publicationId: $publicationId }]) {
      userErrors { field message }
    }
  }
`;

function assertNoUserErrors(action, userErrors) {
  if (userErrors.length > 0) {
    const details = userErrors.map(
      ({ field, message, code }) => `${(field ?? []).join('.')}: ${message}${code ? ` (${code})` : ''}`,
    );
    throw new Error(`${action} failed: ${details.join('; ')}`);
  }
}

/** handle -> metaobject GID for every entry of a definition. */
export async function fetchMetaobjectIds(client, type) {
  const { metaobjects } = await client.graphql(METAOBJECT_IDS, { type });
  return new Map(metaobjects.nodes.map(({ id, handle }) => [handle, id]));
}

export async function findOnlineStorePublication(client) {
  const { publications } = await client.graphql(PUBLICATIONS);
  const found = publications.nodes.find(({ catalog }) => isOnlineStoreCatalog(catalog?.title));
  if (!found) {
    const titles = publications.nodes.map(({ catalog }) => catalog?.title ?? '(no title)').join(', ');
    throw new Error(
      `No "${ONLINE_STORE_PUBLICATION_TITLE}" publication found (got: ${titles}). Check the read_publications scope.`,
    );
  }
  return found.id;
}

async function publishIfNeeded(client, { id, publicationId, check, dryRun }) {
  const query = check === 'collection' ? COLLECTION_PUBLISHED : PRODUCT_PUBLISHED;
  const data = await client.graphql(query, { id, publicationId });
  const published = (data.product ?? data.collection).publishedOnPublication;
  if (published) return false;
  if (!dryRun) {
    const { publishablePublish } = await client.graphql(PUBLISH, { id, publicationId });
    assertNoUserErrors(`Publishing ${id}`, publishablePublish.userErrors);
  }
  return true;
}

/** Finds the collection by handle, creating and publishing it when missing. */
export async function ensureCollection(client, { publicationId, dryRun }) {
  const { collectionByIdentifier: existing } = await client.graphql(COLLECTION_BY_HANDLE, {
    handle: COLLECTION.handle,
  });
  let id = existing?.id;
  let status = 'exists';

  if (!id) {
    if (dryRun) return { id: '<new-collection>', status: 'would-create' };
    const { collectionCreate } = await client.graphql(CREATE_COLLECTION, { collection: COLLECTION });
    assertNoUserErrors('Creating the collection', collectionCreate.userErrors);
    id = collectionCreate.collection.id;
    status = 'created';
  }

  await publishIfNeeded(client, { id, publicationId, check: 'collection', dryRun });
  return { id, status };
}

/**
 * Creates or updates products so the store matches `products`, then publishes them.
 * With `dryRun` only reads are made.
 *
 * @param {object} options
 * @param {object[]} options.products   normalized products
 * @param {object[]} options.roasters   roaster dictionary (title by handle)
 * @param {object[]} options.processMethods
 * @param {Record<string, string>} options.metafieldTypes  key -> metafield type
 * @returns {Promise<{collection: object, results: Array<{handle: string, status: 'created'|'synced'|'would-create'|'would-sync', published: boolean}>}>}
 */
export async function seedCatalog({ client, products, roasters, processMethods, metafieldTypes, dryRun = false }) {
  const publicationId = await findOnlineStorePublication(client);
  const roasterIds = await fetchMetaobjectIds(client, 'roaster');
  const processIds = await fetchMetaobjectIds(client, 'process_method');
  const collection = await ensureCollection(client, { publicationId, dryRun });
  const titleOf = (entries, handle) => entries.find((entry) => entry.handle === handle).title;

  const results = [];
  for (const product of products) {
    const { productByIdentifier: existing } = await client.graphql(PRODUCT_BY_HANDLE, { handle: product.handle });

    if (dryRun) {
      // Building the input validates the references even though nothing is written.
      buildMetafields(product, { types: metafieldTypes, roasterIds, processIds });
      results.push({ handle: product.handle, status: existing ? 'would-sync' : 'would-create', published: false });
      continue;
    }

    const input = buildProductSetInput(product, {
      roasterTitle: titleOf(roasters, product.roaster),
      processTitle: titleOf(processMethods, product.process),
      collectionId: collection.id,
      metafields: buildMetafields(product, { types: metafieldTypes, roasterIds, processIds }),
    });
    const { productSet } = await client.graphql(PRODUCT_SET, {
      input,
      identifier: { handle: product.handle },
    });
    assertNoUserErrors(`Saving product "${product.handle}"`, productSet.userErrors);

    await publishIfNeeded(client, { id: productSet.product.id, publicationId, check: 'product', dryRun });
    results.push({ handle: product.handle, status: existing ? 'synced' : 'created', published: true });
  }

  return { collection, results };
}
