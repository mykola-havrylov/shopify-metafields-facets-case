// In-memory stand-in for the parts of the Admin API used by seed-catalog and verify.
// It stores what productSet receives and answers the verify queries from that state, so a seed -> verify round trip can be tested.
import { ShopifyClientError } from '../../scripts/src/client.js';

const FILTERABLE = new Set(['roaster', 'origin', 'process', 'roast_level', 'cupping_score', 'altitude_masl', 'decaf']);

/** Evaluates `product_type:Coffee AND metafields.coffee.<key>:<filter>` against a stored product. */
function matches(product, query) {
  const match = /metafields\.coffee\.(\w+):(.+)$/.exec(query);
  const [, key, filter] = match;
  if (!FILTERABLE.has(key)) {
    throw new ShopifyClientError(`Admin API returned GraphQL errors: metafield coffee.${key} is not filterable`, {
      status: 200,
      errors: [{ message: 'not filterable' }],
    });
  }
  const field = product.input.metafields.find((metafield) => metafield.key === key);
  if (!field) return false;

  const range = /^(>=|<=|>|<)(\d+(?:\.\d+)?)$/.exec(filter);
  if (range) {
    const [, op, limit] = range;
    const value = Number(field.value);
    return { '>=': value >= limit, '<=': value <= limit, '>': value > limit, '<': value < limit }[op];
  }
  const wanted = filter.replace(/^"|"$/g, '');
  if (field.type.startsWith('list.')) return JSON.parse(field.value).includes(wanted);
  return field.value === wanted;
}

export function fakeShopify({ roasters, processMethods }) {
  const state = {
    publicationTitle: 'Channel Catalog 206156660926 for Online Store',
    metaobjects: {
      roaster: new Map(roasters.map(({ handle }, i) => [handle, `gid://shopify/Metaobject/${100 + i}`])),
      process_method: new Map(processMethods.map(({ handle }, i) => [handle, `gid://shopify/Metaobject/${200 + i}`])),
    },
    collections: new Map(),
    products: new Map(),
    publishedProducts: new Set(),
    publishedCollections: new Set(),
    mutations: [],
    userErrors: {},
    acceptNonFilterable: false,
    withImages: true,
  };
  let nextId = 1;

  const operations = {
    MetaobjectIds: ({ type }) => ({
      metaobjects: { nodes: [...state.metaobjects[type]].map(([handle, id]) => ({ id, handle })) },
    }),
    OnlineStorePublication: () => ({
      publications: {
        nodes: [
          { id: 'gid://shopify/Publication/2', catalog: { title: 'Channel Catalog 206156693694 for Shop' } },
          { id: 'gid://shopify/Publication/1', catalog: { title: state.publicationTitle } },
          { id: 'gid://shopify/Publication/3', catalog: { title: 'Channel Catalog 206156726462 for Point of Sale' } },
        ],
      },
    }),
    CollectionByHandle: ({ handle }) => ({ collectionByIdentifier: state.collections.get(handle) ?? null }),
    CreateCollection: ({ collection }) => {
      state.mutations.push(`collection:${collection.handle}`);
      const created = { id: `gid://shopify/Collection/${nextId++}`, handle: collection.handle };
      state.collections.set(collection.handle, created);
      return { collectionCreate: { collection: created, userErrors: state.userErrors.collection ?? [] } };
    },
    ProductByHandle: ({ handle }) => ({ productByIdentifier: state.products.get(handle) ?? null }),
    ProductSet: ({ input, identifier }) => {
      state.mutations.push(`product:${identifier.handle}`);
      if (state.userErrors.product) return { productSet: { product: null, userErrors: state.userErrors.product } };
      const id = state.products.get(identifier.handle)?.id ?? `gid://shopify/Product/${nextId++}`;
      state.products.set(identifier.handle, { id, handle: identifier.handle, input });
      return { productSet: { product: { id, handle: identifier.handle }, userErrors: [] } };
    },
    ProductPublished: ({ id }) => ({ product: { publishedOnPublication: state.publishedProducts.has(id) } }),
    CollectionPublished: ({ id }) => ({ collection: { publishedOnPublication: state.publishedCollections.has(id) } }),
    PublishToChannel: ({ id }) => {
      state.mutations.push(`publish:${id}`);
      (id.includes('/Collection/') ? state.publishedCollections : state.publishedProducts).add(id);
      return { publishablePublish: { userErrors: [] } };
    },
    CatalogProducts: ({ publicationId }) => ({
      products: {
        nodes: [...state.products.values()].map(({ id, handle, input }) => ({
          id,
          handle,
          title: input.title,
          status: input.status,
          productType: input.productType,
          vendor: input.vendor,
          publishedOnPublication: state.publishedProducts.has(id) && publicationId === 'gid://shopify/Publication/1',
          media: { nodes: state.withImages ? [{ mediaContentType: 'IMAGE', status: 'READY' }] : [] },
          collections: {
            nodes: input.collections.flatMap((collectionId) =>
              [...state.collections.values()]
                .filter(({ id: known }) => known === collectionId)
                .map(({ handle: h }) => ({ handle: h })),
            ),
          },
          metafields: { nodes: input.metafields.map(({ key, type, value }) => ({ key, type, value })) },
          variants: {
            nodes: input.variants.map(({ sku, price, optionValues }) => ({
              sku,
              price,
              selectedOptions: optionValues.map(({ optionName, name }) => ({ name: optionName, value: name })),
            })),
          },
        })),
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    }),
    CountProducts: ({ query }) => {
      if (
        state.acceptNonFilterable &&
        !/metafields\.coffee\.(roaster|origin|process|roast_level|cupping_score|altitude_masl|decaf):/.test(query)
      ) {
        return { productsCount: { count: 0 } };
      }
      return {
        productsCount: { count: [...state.products.values()].filter((product) => matches(product, query)).length },
      };
    },
  };

  const client = {
    async graphql(query, variables = {}) {
      const name = /(?:query|mutation) (\w+)/.exec(query)[1];
      if (!operations[name]) throw new Error(`unexpected operation ${name}`);
      return operations[name](variables);
    },
  };
  return { client, state };
}
