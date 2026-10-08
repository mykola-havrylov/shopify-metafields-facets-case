// Idempotent creation of metaobject and product metafield definitions via the Admin GraphQL API.
// Existing definitions are never modified: they are compared and any drift is reported, because
// metafield types cannot change in place and the schema is accepted manually before any data write.
import {
  buildMetafieldInput,
  buildMetaobjectInput,
  diffMetafieldDefinition,
  diffMetaobjectDefinition,
} from './definitions.js';
import { assertNoUserErrors } from './user-errors.js';

const METAOBJECT_DEFINITION_BY_TYPE = `#graphql
  query MetaobjectDefinitionByType($type: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
      type
      name
      displayNameKey
      access { admin storefront }
      capabilities {
        publishable { enabled }
        renderable { enabled data { metaTitleKey metaDescriptionKey } }
        onlineStore { enabled data { urlHandle } }
      }
      fieldDefinitions {
        key
        name
        required
        type { name }
        validations { name value }
      }
    }
  }
`;

const CREATE_METAOBJECT_DEFINITION = `#graphql
  mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition { id type }
      userErrors { field message code }
    }
  }
`;

const PRODUCT_METAFIELD_DEFINITIONS = `#graphql
  query ProductMetafieldDefinitions($namespace: String!, $after: String) {
    metafieldDefinitions(ownerType: PRODUCT, namespace: $namespace, first: 100, after: $after) {
      nodes {
        id
        key
        name
        type { name }
        access { admin storefront }
        capabilities { adminFilterable { enabled } }
        validations { name value }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const CREATE_METAFIELD_DEFINITION = `#graphql
  mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id key }
      userErrors { field message code }
    }
  }
`;

async function fetchExistingMetafieldDefinitions(client, namespace) {
  const found = new Map();
  let after = null;
  do {
    const { metafieldDefinitions } = await client.graphql(PRODUCT_METAFIELD_DEFINITIONS, { namespace, after });
    for (const node of metafieldDefinitions.nodes) found.set(node.key, node);
    after = metafieldDefinitions.pageInfo.hasNextPage ? metafieldDefinitions.pageInfo.endCursor : null;
  } while (after);
  return found;
}

/**
 * Creates whatever is missing and reports drift on whatever exists.
 * With `dryRun` nothing is written; the report shows what a real run would do.
 *
 * @returns {Promise<{results: Array<{kind: string, id: string, status: 'created'|'would-create'|'exists'|'drift', drift: string[]}>}>}
 */
export async function syncDefinitions({ client, metaobjects, metafields, dryRun = false }) {
  const results = [];
  const metaobjectIds = {};

  for (const definition of metaobjects) {
    const desired = buildMetaobjectInput(definition);
    const { metaobjectDefinitionByType: existing } = await client.graphql(METAOBJECT_DEFINITION_BY_TYPE, {
      type: definition.type,
    });

    if (existing) {
      metaobjectIds[definition.type] = existing.id;
      const drift = diffMetaobjectDefinition(desired, existing);
      results.push({ kind: 'metaobject', id: definition.type, status: drift.length ? 'drift' : 'exists', drift });
    } else if (dryRun) {
      metaobjectIds[definition.type] = `<new:${definition.type}>`;
      results.push({ kind: 'metaobject', id: definition.type, status: 'would-create', drift: [] });
    } else {
      const { metaobjectDefinitionCreate: created } = await client.graphql(CREATE_METAOBJECT_DEFINITION, {
        definition: desired,
      });
      assertNoUserErrors(`Creating metaobject definition "${definition.type}"`, created.userErrors);
      metaobjectIds[definition.type] = created.metaobjectDefinition.id;
      results.push({ kind: 'metaobject', id: definition.type, status: 'created', drift: [] });
    }
  }

  const { namespace, ownerType, definitions } = metafields;
  const existingMetafields = await fetchExistingMetafieldDefinitions(client, namespace);

  for (const definition of definitions) {
    const id = `${namespace}.${definition.key}`;
    const desired = buildMetafieldInput(definition, { namespace, ownerType }, metaobjectIds);
    const existing = existingMetafields.get(definition.key);

    if (existing) {
      const drift = diffMetafieldDefinition(desired, existing);
      results.push({ kind: 'metafield', id, status: drift.length ? 'drift' : 'exists', drift });
    } else if (dryRun) {
      results.push({ kind: 'metafield', id, status: 'would-create', drift: [] });
    } else {
      const { metafieldDefinitionCreate: created } = await client.graphql(CREATE_METAFIELD_DEFINITION, {
        definition: desired,
      });
      assertNoUserErrors(`Creating metafield definition "${id}"`, created.userErrors);
      results.push({ kind: 'metafield', id, status: 'created', drift: [] });
    }
  }

  return { results };
}
