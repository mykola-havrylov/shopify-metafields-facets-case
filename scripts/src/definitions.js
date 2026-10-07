// Pure helpers for metaobject/metafield definitions: JSON loading, GraphQL input builders and drift diffing.
// No network access here; see definitions-sync.js for the Admin API calls.
import { readFile } from 'node:fs/promises';

const DEFINITIONS_DIR = new URL('../definitions/', import.meta.url);

// Every definition is readable on the Storefront API: Search & Discovery filters need it.
export const STOREFRONT_ACCESS = 'PUBLIC_READ';

export async function loadDefinitionFiles() {
  const read = async (name) => JSON.parse(await readFile(new URL(name, DEFINITIONS_DIR), 'utf8'));
  return {
    metaobjects: await read('metaobjects.json'),
    metafields: await read('product-metafields.json'),
  };
}

/**
 * Resolves `metaobjectType` references in validations to `metaobject_definition_id` GIDs.
 * @param {Array<{name: string, value?: string, metaobjectType?: string}>} validations
 * @param {Record<string, string>} metaobjectIds  type -> GID
 */
function resolveValidations(validations = [], metaobjectIds = {}) {
  return validations.map(({ name, value, metaobjectType }) => {
    if (!metaobjectType) return { name, value };
    const id = metaobjectIds[metaobjectType];
    if (!id) throw new Error(`Unknown metaobject definition "${metaobjectType}" referenced by validation "${name}".`);
    return { name, value: id };
  });
}

export function buildMetaobjectInput(definition) {
  const { type, name, description, displayNameKey, access, capabilities, fields } = definition;
  return {
    type,
    name,
    description,
    displayNameKey,
    access,
    ...(capabilities && { capabilities }),
    fieldDefinitions: fields.map(({ key, name: fieldName, type: fieldType, required = false, validations = [] }) => ({
      key,
      name: fieldName,
      type: fieldType,
      required,
      validations,
    })),
  };
}

export function buildMetafieldInput(definition, { namespace, ownerType }, metaobjectIds) {
  return {
    namespace,
    ownerType,
    key: definition.key,
    name: definition.name,
    type: definition.type,
    description: definition.description,
    access: { storefront: STOREFRONT_ACCESS },
    capabilities: { adminFilterable: { enabled: Boolean(definition.filterable) } },
    validations: resolveValidations(definition.validations, metaobjectIds),
  };
}

// Shopify may return numbers in a different shape ("0" vs "0.0") and JSON with different whitespace.
function sameValue(a, b) {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (a.trim() !== '' && b.trim() !== '' && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Number(a) === Number(b);
  }
  try {
    return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b));
  } catch {
    return false;
  }
}

/** Every desired validation must exist with the same value; extra validations set by Shopify are ignored. */
function diffValidations(label, desired, existing) {
  const byName = new Map(existing.map(({ name, value }) => [name, value]));
  return desired.flatMap(({ name, value }) => {
    if (!byName.has(name)) return [`${label}: validation "${name}" is missing`];
    return sameValue(value, byName.get(name))
      ? []
      : [`${label}: validation "${name}" is ${byName.get(name)}, expected ${value}`];
  });
}

const check = (label, actual, expected) =>
  actual === expected ? [] : [`${label} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`];

/**
 * Differences between a desired metaobject definition and the one in the store.
 * Returns human-readable drift messages; an empty array means it matches.
 */
export function diffMetaobjectDefinition(desired, existing) {
  const drift = [
    ...check('name', existing.name, desired.name),
    ...check('displayNameKey', existing.displayNameKey, desired.displayNameKey),
    ...check('access.storefront', existing.access?.storefront, desired.access?.storefront),
  ];

  const caps = desired.capabilities ?? {};
  for (const capability of ['publishable', 'renderable', 'onlineStore']) {
    drift.push(
      ...check(
        `capabilities.${capability}.enabled`,
        Boolean(existing.capabilities?.[capability]?.enabled),
        Boolean(caps[capability]?.enabled),
      ),
    );
  }
  for (const key of ['metaTitleKey', 'metaDescriptionKey']) {
    if (caps.renderable?.data?.[key]) {
      drift.push(
        ...check(
          `capabilities.renderable.data.${key}`,
          existing.capabilities?.renderable?.data?.[key],
          caps.renderable.data[key],
        ),
      );
    }
  }
  if (caps.onlineStore?.data?.urlHandle) {
    drift.push(
      ...check(
        'capabilities.onlineStore.data.urlHandle',
        existing.capabilities?.onlineStore?.data?.urlHandle,
        caps.onlineStore.data.urlHandle,
      ),
    );
  }

  const existingFields = new Map(existing.fieldDefinitions.map((field) => [field.key, field]));
  for (const field of desired.fieldDefinitions) {
    const label = `field "${field.key}"`;
    const found = existingFields.get(field.key);
    if (!found) {
      drift.push(`${label} is missing`);
      continue;
    }
    drift.push(
      ...check(`${label} type`, found.type.name, field.type),
      ...check(`${label} required`, found.required, field.required),
      ...diffValidations(label, field.validations, found.validations),
    );
  }
  return drift;
}

/**
 * Differences between a desired metafield definition (as built by buildMetafieldInput) and the one in the store.
 * A type mismatch cannot be fixed in place: the definition has to be recreated and re-seeded.
 */
export function diffMetafieldDefinition(desired, existing) {
  return [
    ...check('type', existing.type.name, desired.type),
    ...check('name', existing.name, desired.name),
    ...check('access.storefront', existing.access?.storefront, desired.access.storefront),
    ...check(
      'capabilities.adminFilterable.enabled',
      Boolean(existing.capabilities?.adminFilterable?.enabled),
      desired.capabilities.adminFilterable.enabled,
    ),
    ...diffValidations('validations', desired.validations, existing.validations),
  ];
}
