import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import {
  STOREFRONT_ACCESS,
  buildMetafieldInput,
  buildMetaobjectInput,
  diffMetafieldDefinition,
  diffMetaobjectDefinition,
  loadDefinitionFiles,
} from '../scripts/src/definitions.js';
import { syncDefinitions } from '../scripts/src/definitions-sync.js';

const FILTERABLE_KEYS = ['roaster', 'origin', 'process', 'roast_level', 'cupping_score', 'altitude_masl', 'decaf'];
const NON_FILTERABLE_KEYS = ['tasting_notes', 'variety', 'harvest_year', 'brew_guide'];
// Types the storefront filtering docs list as filterable.
const FILTERABLE_TYPES = [
  'single_line_text_field',
  'list.single_line_text_field',
  'metaobject_reference',
  'list.metaobject_reference',
  'number_integer',
  'number_decimal',
  'boolean',
];
const IDS = { roaster: 'gid://shopify/MetaobjectDefinition/1', process_method: 'gid://shopify/MetaobjectDefinition/2' };

let files;
before(async () => {
  files = await loadDefinitionFiles();
});

describe('definition files', () => {
  it('define exactly the 11 product metafields from the plan', () => {
    const keys = files.metafields.definitions.map(({ key }) => key).sort();
    assert.deepEqual(keys, [...FILTERABLE_KEYS, ...NON_FILTERABLE_KEYS].sort());
    assert.equal(files.metafields.namespace, 'coffee');
    assert.equal(files.metafields.ownerType, 'PRODUCT');
  });

  it('mark exactly the 7 facet metafields as filterable, all with a filterable type', () => {
    const filterable = files.metafields.definitions.filter(({ filterable }) => filterable);
    assert.deepEqual(filterable.map(({ key }) => key).sort(), [...FILTERABLE_KEYS].sort());
    for (const { key, type } of filterable) assert.ok(FILTERABLE_TYPES.includes(type), `${key} has type ${type}`);
  });

  it('enable adminFilterable and storefront access exactly as designed', () => {
    for (const definition of files.metafields.definitions) {
      const input = buildMetafieldInput(definition, files.metafields, IDS);
      assert.equal(input.access.storefront, STOREFRONT_ACCESS, `${definition.key} storefront access`);
      assert.equal(
        input.capabilities.adminFilterable.enabled,
        FILTERABLE_KEYS.includes(definition.key),
        `${definition.key} adminFilterable`,
      );
    }
  });

  it('give both metaobjects storefront access and a naming field that exists', () => {
    assert.deepEqual(files.metaobjects.map(({ type }) => type).sort(), ['process_method', 'roaster']);
    for (const definition of files.metaobjects) {
      assert.equal(definition.access.storefront, STOREFRONT_ACCESS);
      assert.ok(
        definition.fields.some(({ key }) => key === definition.displayNameKey),
        `${definition.type} naming field`,
      );
    }
  });

  it('keep process_method.color as the single color field', () => {
    const processMethod = files.metaobjects.find(({ type }) => type === 'process_method');
    assert.deepEqual(
      processMethod.fields.filter(({ type }) => type === 'color').map(({ key }) => key),
      ['color'],
    );
  });

  it('give roaster the publishable, renderable and onlineStore capabilities', () => {
    const { capabilities } = files.metaobjects.find(({ type }) => type === 'roaster');
    for (const name of ['publishable', 'renderable', 'onlineStore'])
      assert.equal(capabilities[name].enabled, true, name);
  });

  it('point metaobject references at defined metaobject types', () => {
    const types = new Set(files.metaobjects.map(({ type }) => type));
    const refs = files.metafields.definitions.flatMap(({ validations = [] }) =>
      validations.filter(({ metaobjectType }) => metaobjectType),
    );
    assert.equal(refs.length, 2);
    for (const { metaobjectType } of refs) assert.ok(types.has(metaobjectType), metaobjectType);
  });
});

describe('buildMetafieldInput', () => {
  it('resolves metaobject types to definition ids', () => {
    const definition = files.metafields.definitions.find(({ key }) => key === 'process');
    const input = buildMetafieldInput(definition, files.metafields, IDS);
    assert.deepEqual(input.validations, [{ name: 'metaobject_definition_id', value: IDS.process_method }]);
  });

  it('fails on a reference to an unknown metaobject type', () => {
    const definition = files.metafields.definitions.find(({ key }) => key === 'roaster');
    assert.throws(
      () => buildMetafieldInput(definition, files.metafields, {}),
      /Unknown metaobject definition "roaster"/,
    );
  });
});

describe('diffMetafieldDefinition', () => {
  const desired = () =>
    buildMetafieldInput(
      files.metafields.definitions.find(({ key }) => key === 'cupping_score'),
      files.metafields,
      IDS,
    );
  const stored = (overrides = {}) => ({
    key: 'cupping_score',
    name: 'Cupping score',
    type: { name: 'number_decimal' },
    access: { admin: 'PUBLIC_READ_WRITE', storefront: 'PUBLIC_READ' },
    capabilities: { adminFilterable: { enabled: true } },
    // Shopify may echo decimals differently and add validations of its own.
    validations: [
      { name: 'min', value: '0.0' },
      { name: 'max', value: '100.0' },
      { name: 'max_precision', value: '2' },
      { name: 'added_by_shopify', value: 'x' },
    ],
    ...overrides,
  });

  it('accepts a matching definition, ignoring number formatting and extra validations', () => {
    assert.deepEqual(diffMetafieldDefinition(desired(), stored()), []);
  });

  it('reports a type change, which cannot be fixed in place', () => {
    const drift = diffMetafieldDefinition(desired(), stored({ type: { name: 'number_integer' } }));
    assert.match(drift.join('\n'), /type is "number_integer", expected "number_decimal"/);
  });

  it('reports missing storefront access, disabled filtering and wrong validation values', () => {
    const drift = diffMetafieldDefinition(
      desired(),
      stored({
        access: { admin: 'PUBLIC_READ_WRITE', storefront: 'NONE' },
        capabilities: { adminFilterable: { enabled: false } },
        validations: [{ name: 'min', value: '5' }],
      }),
    ).join('\n');
    assert.match(drift, /access\.storefront/);
    assert.match(drift, /adminFilterable/);
    assert.match(drift, /validation "min" is 5, expected 0/);
    assert.match(drift, /validation "max" is missing/);
  });

  it('compares JSON validation values regardless of whitespace', () => {
    const roastLevel = buildMetafieldInput(
      files.metafields.definitions.find(({ key }) => key === 'roast_level'),
      files.metafields,
      IDS,
    );
    const existing = {
      name: 'Roast level',
      type: { name: 'single_line_text_field' },
      access: { storefront: 'PUBLIC_READ' },
      capabilities: { adminFilterable: { enabled: true } },
      validations: [{ name: 'choices', value: '["Light", "Medium-Light", "Medium", "Medium-Dark", "Dark"]' }],
    };
    assert.deepEqual(diffMetafieldDefinition(roastLevel, existing), []);
  });
});

/** In-memory Shopify: mutations store what was sent, queries return it in the shape the Admin API uses. */
function fakeStore() {
  const state = { metaobjects: new Map(), metafields: new Map(), mutations: [] };
  let nextId = 1;
  const client = {
    async graphql(query, variables) {
      if (query.includes('query MetaobjectDefinitionByType')) {
        return { metaobjectDefinitionByType: state.metaobjects.get(variables.type) ?? null };
      }
      if (query.includes('query ProductMetafieldDefinitions')) {
        return {
          metafieldDefinitions: {
            nodes: [...state.metafields.values()],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        };
      }
      if (query.includes('mutation CreateMetaobjectDefinition')) {
        const input = variables.definition;
        state.mutations.push(`metaobject:${input.type}`);
        if (state.failMetaobject) {
          return {
            metaobjectDefinitionCreate: {
              metaobjectDefinition: null,
              userErrors: [{ field: ['definition', 'type'], message: 'Taken', code: 'TAKEN' }],
            },
          };
        }
        const id = `gid://shopify/MetaobjectDefinition/${nextId++}`;
        state.metaobjects.set(input.type, {
          id,
          type: input.type,
          name: input.name,
          displayNameKey: input.displayNameKey,
          access: input.access,
          capabilities: input.capabilities ?? {},
          fieldDefinitions: input.fieldDefinitions.map((field) => ({ ...field, type: { name: field.type } })),
        });
        return { metaobjectDefinitionCreate: { metaobjectDefinition: { id, type: input.type }, userErrors: [] } };
      }
      if (query.includes('mutation CreateMetafieldDefinition')) {
        const input = variables.definition;
        state.mutations.push(`metafield:${input.key}`);
        state.metafields.set(input.key, {
          id: `gid://shopify/MetafieldDefinition/${nextId++}`,
          ...input,
          type: { name: input.type },
        });
        return { metafieldDefinitionCreate: { createdDefinition: { id: 'x', key: input.key }, userErrors: [] } };
      }
      throw new Error(`unexpected operation: ${query.slice(0, 80)}`);
    },
  };
  return { client, state };
}

describe('syncDefinitions', () => {
  it('dry run reports everything as would-create and writes nothing', async () => {
    const { client, state } = fakeStore();
    const { results } = await syncDefinitions({ client, ...files, dryRun: true });

    assert.equal(results.length, 13);
    assert.ok(results.every(({ status }) => status === 'would-create'));
    assert.deepEqual(state.mutations, []);
  });

  it('creates metaobjects before the metafields that reference them, using the created ids', async () => {
    const { client, state } = fakeStore();
    const { results } = await syncDefinitions({ client, ...files });

    assert.ok(results.every(({ status }) => status === 'created'));
    assert.deepEqual(state.mutations.slice(0, 2), ['metaobject:roaster', 'metaobject:process_method']);
    assert.equal(state.mutations.length, 13);
    const roasterId = state.metaobjects.get('roaster').id;
    assert.deepEqual(state.metafields.get('roaster').validations, [
      { name: 'metaobject_definition_id', value: roasterId },
    ]);
  });

  it('is idempotent: a second run finds everything and creates nothing', async () => {
    const { client, state } = fakeStore();
    await syncDefinitions({ client, ...files });
    state.mutations.length = 0;

    const { results } = await syncDefinitions({ client, ...files });
    assert.ok(
      results.every(({ status }) => status === 'exists'),
      JSON.stringify(results.filter(({ status }) => status !== 'exists')),
    );
    assert.deepEqual(state.mutations, []);
  });

  it('reports drift on an existing definition without modifying it', async () => {
    const { client, state } = fakeStore();
    await syncDefinitions({ client, ...files });
    state.mutations.length = 0;
    state.metafields.get('decaf').type = { name: 'single_line_text_field' };
    state.metaobjects.get('process_method').access = { storefront: 'NONE' };

    const { results } = await syncDefinitions({ client, ...files });
    const drifted = results.filter(({ status }) => status === 'drift').map(({ id }) => id);
    assert.deepEqual(drifted.sort(), ['coffee.decaf', 'process_method']);
    assert.deepEqual(state.mutations, []);
  });

  it('fails on userErrors from Shopify', async () => {
    const { client, state } = fakeStore();
    state.failMetaobject = true;
    await assert.rejects(
      syncDefinitions({ client, ...files }),
      /Creating metaobject definition "roaster" failed: definition\.type: Taken \(TAKEN\)/,
    );
  });
});

describe('buildMetaobjectInput / diffMetaobjectDefinition', () => {
  it('matches a stored definition built from the same input', () => {
    for (const definition of files.metaobjects) {
      const input = buildMetaobjectInput(definition);
      const stored = {
        ...input,
        capabilities: input.capabilities ?? { publishable: { enabled: false } },
        fieldDefinitions: input.fieldDefinitions.map((field) => ({ ...field, type: { name: field.type } })),
      };
      assert.deepEqual(diffMetaobjectDefinition(input, stored), [], definition.type);
    }
  });

  it('reports a missing field and a disabled capability', () => {
    const input = buildMetaobjectInput(files.metaobjects.find(({ type }) => type === 'roaster'));
    const stored = {
      ...input,
      capabilities: { ...input.capabilities, onlineStore: { enabled: false } },
      fieldDefinitions: input.fieldDefinitions
        .filter(({ key }) => key !== 'logo')
        .map((field) => ({ ...field, type: { name: field.type } })),
    };
    const drift = diffMetaobjectDefinition(input, stored).join('\n');
    assert.match(drift, /capabilities\.onlineStore\.enabled/);
    assert.match(drift, /field "logo" is missing/);
  });
});
