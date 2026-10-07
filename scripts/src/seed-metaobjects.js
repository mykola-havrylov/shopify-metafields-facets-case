// Idempotent seed of the `roaster` and `process_method` metaobject entries, keyed by handle.
// Entries of publishable definitions (roaster) are set to ACTIVE; without that they are invisible on the storefront.
// `process_method` has no publishable capability, so its entries have no status at all.

const METAOBJECT_BY_HANDLE = `#graphql
  query MetaobjectByHandle($handle: MetaobjectHandleInput!) {
    metaobjectByHandle(handle: $handle) {
      id
      handle
      capabilities { publishable { status } }
      fields { key value }
    }
  }
`;

const UPSERT_METAOBJECT = `#graphql
  mutation UpsertMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject { id handle capabilities { publishable { status } } }
      userErrors { field message code }
    }
  }
`;

const LOGO_KINDS = ['own', 'third-party', 'ai'];

/**
 * A logo may only be used with a complete provenance record, so docs/third-party-assets.md and docs/ai-assets.md can be filled in.
 * @returns {string[]} problems; empty when every logo is documented
 */
export function validateLogoProvenance(roasters) {
  return roasters.flatMap(({ handle, logo }) => {
    if (!logo) return [];
    const missing = ['file', 'source', 'license', 'date'].filter((key) => !logo[key]);
    const problems = missing.map((key) => `${handle}: logo.${key} is required`);
    if (!LOGO_KINDS.includes(logo.kind)) problems.push(`${handle}: logo.kind must be one of ${LOGO_KINDS.join(', ')}`);
    return problems;
  });
}

/** Seed entries for both definitions, as {type, handle, fields: {key: value}, status?}. */
export function buildSeedEntries({ roasters, processMethods }) {
  const problems = validateLogoProvenance(roasters);
  if (problems.length > 0) throw new Error(`Logo provenance is incomplete:\n${problems.join('\n')}`);
  if (roasters.some(({ logo }) => logo)) {
    throw new Error('Logo upload is not implemented yet: remove `logo` from scripts/dictionaries/roasters.json.');
  }

  return [
    ...roasters.map(({ handle, title, country, founded_year, description }) => ({
      type: 'roaster',
      handle,
      fields: { title, country, founded_year: String(founded_year), description },
      status: 'ACTIVE',
    })),
    ...processMethods.map(({ handle, title, color, description }) => ({
      type: 'process_method',
      handle,
      fields: { title, color, description },
    })),
  ];
}

// Hex colors may come back in a different case.
const sameValue = (a, b) => (a ?? '') === (b ?? '') || String(a).toLowerCase() === String(b).toLowerCase();

/**
 * Creates or updates entries so the store matches `entries`; unchanged entries are not written.
 * With `dryRun` only reads are made.
 * @returns {Promise<{results: Array<{type: string, handle: string, status: 'created'|'updated'|'unchanged'|'would-create'|'would-update', changes: string[]}>}>}
 */
export async function seedMetaobjects({ client, entries, dryRun = false }) {
  const results = [];

  for (const { type, handle, fields, status } of entries) {
    const { metaobjectByHandle: existing } = await client.graphql(METAOBJECT_BY_HANDLE, { handle: { type, handle } });

    const changes = [];
    if (existing) {
      const stored = new Map(existing.fields.map(({ key, value }) => [key, value]));
      for (const [key, value] of Object.entries(fields)) {
        if (!sameValue(stored.get(key), value))
          changes.push(`${key}: ${JSON.stringify(stored.get(key) ?? null)} -> ${JSON.stringify(value)}`);
      }
      const storedStatus = existing.capabilities?.publishable?.status;
      if (status && storedStatus !== status) changes.push(`status: ${storedStatus ?? null} -> ${status}`);
      if (changes.length === 0) {
        results.push({ type, handle, status: 'unchanged', changes });
        continue;
      }
    }

    if (dryRun) {
      results.push({ type, handle, status: existing ? 'would-update' : 'would-create', changes });
      continue;
    }

    const metaobject = {
      fields: Object.entries(fields).map(([key, value]) => ({ key, value })),
      ...(status && { capabilities: { publishable: { status } } }),
    };
    const { metaobjectUpsert } = await client.graphql(UPSERT_METAOBJECT, { handle: { type, handle }, metaobject });
    if (metaobjectUpsert.userErrors.length > 0) {
      const details = metaobjectUpsert.userErrors.map(
        ({ field, message, code }) => `${(field ?? []).join('.')}: ${message} (${code})`,
      );
      throw new Error(`Seeding ${type}/${handle} failed: ${details.join('; ')}`);
    }
    results.push({ type, handle, status: existing ? 'updated' : 'created', changes });
  }

  return { results };
}
