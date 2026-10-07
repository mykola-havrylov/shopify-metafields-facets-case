import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { loadDictionaryFiles } from '../scripts/src/dictionaries.js';
import { buildSeedEntries, seedMetaobjects, validateLogoProvenance } from '../scripts/src/seed-metaobjects.js';

let files;
let entries;
before(async () => {
  files = await loadDictionaryFiles();
  entries = buildSeedEntries(files);
});

/** In-memory Shopify metaobjects keyed by `type/handle`. */
function fakeStore() {
  const state = { entries: new Map(), writes: [], userErrors: [] };
  const client = {
    async graphql(query, variables) {
      const key = `${variables.handle.type}/${variables.handle.handle}`;
      if (query.includes('query MetaobjectByHandle')) return { metaobjectByHandle: state.entries.get(key) ?? null };
      if (query.includes('mutation UpsertMetaobject')) {
        if (state.userErrors.length) return { metaobjectUpsert: { metaobject: null, userErrors: state.userErrors } };
        state.writes.push(key);
        const { fields, capabilities } = variables.metaobject;
        const previous = state.entries.get(key);
        const stored = new Map((previous?.fields ?? []).map(({ key: k, value }) => [k, value]));
        for (const { key: k, value } of fields) stored.set(k, value);
        state.entries.set(key, {
          id: `gid://shopify/Metaobject/${state.entries.size + 1}`,
          handle: variables.handle.handle,
          fields: [...stored].map(([k, value]) => ({ key: k, value })),
          capabilities: { publishable: capabilities ? { status: capabilities.publishable.status } : null },
        });
        return { metaobjectUpsert: { metaobject: { id: 'x' }, userErrors: [] } };
      }
      throw new Error(`unexpected operation: ${query.slice(0, 60)}`);
    },
  };
  return { client, state };
}

describe('buildSeedEntries', () => {
  it('builds roaster and process_method entries; only roasters get a status', () => {
    assert.equal(entries.length, files.roasters.length + files.processMethods.length);
    const roasters = entries.filter(({ type }) => type === 'roaster');
    const processes = entries.filter(({ type }) => type === 'process_method');
    assert.ok(roasters.every(({ status }) => status === 'ACTIVE'));
    assert.ok(processes.every(({ status }) => status === undefined));
    assert.ok(processes.every(({ fields }) => /^#[0-9A-Fa-f]{6}$/.test(fields.color)));
    assert.equal(roasters[0].fields.founded_year, String(files.roasters[0].founded_year));
  });

  it('uses unique handles per type', () => {
    const keys = entries.map(({ type, handle }) => `${type}/${handle}`);
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe('logo provenance', () => {
  const logo = { file: 'logos/a.png', kind: 'ai', source: 'Some image tool', license: 'n/a', date: '2026-10-07' };

  it('passes for roasters without a logo and for a fully documented logo', () => {
    assert.deepEqual(validateLogoProvenance(files.roasters), []);
    assert.deepEqual(validateLogoProvenance([{ handle: 'a', logo }]), []);
  });

  it('lists every missing provenance field and an invalid kind', () => {
    const problems = validateLogoProvenance([{ handle: 'a', logo: { file: 'logos/a.png', kind: 'stock' } }]);
    assert.deepEqual(problems, [
      'a: logo.source is required',
      'a: logo.license is required',
      'a: logo.date is required',
      'a: logo.kind must be one of own, third-party, ai',
    ]);
  });

  it('refuses to seed a logo without provenance, and logos at all until upload exists', () => {
    const roasters = [{ ...files.roasters[0], logo: { file: 'x.png' } }];
    assert.throws(() => buildSeedEntries({ ...files, roasters }), /Logo provenance is incomplete/);
    assert.throws(
      () => buildSeedEntries({ ...files, roasters: [{ ...files.roasters[0], logo }] }),
      /Logo upload is not implemented/,
    );
  });
});

describe('seedMetaobjects', () => {
  it('dry run reports would-create and writes nothing', async () => {
    const { client, state } = fakeStore();
    const { results } = await seedMetaobjects({ client, entries, dryRun: true });
    assert.ok(results.every(({ status }) => status === 'would-create'));
    assert.deepEqual(state.writes, []);
  });

  it('creates every entry, roasters as ACTIVE', async () => {
    const { client, state } = fakeStore();
    const { results } = await seedMetaobjects({ client, entries });
    assert.ok(results.every(({ status }) => status === 'created'));
    assert.equal(state.writes.length, entries.length);
    assert.equal(state.entries.get('roaster/northern-ember').capabilities.publishable.status, 'ACTIVE');
    assert.equal(state.entries.get('process_method/washed').capabilities.publishable, null);
  });

  it('is idempotent: a second run changes nothing and never duplicates', async () => {
    const { client, state } = fakeStore();
    await seedMetaobjects({ client, entries });
    state.writes.length = 0;

    const { results } = await seedMetaobjects({ client, entries });
    assert.ok(results.every(({ status }) => status === 'unchanged'));
    assert.deepEqual(state.writes, []);
    assert.equal(state.entries.size, entries.length);
  });

  it('accepts a hex color returned in a different case', async () => {
    const { client, state } = fakeStore();
    await seedMetaobjects({ client, entries });
    const washed = state.entries.get('process_method/washed');
    washed.fields = washed.fields.map((field) =>
      field.key === 'color' ? { ...field, value: field.value.toLowerCase() } : field,
    );

    const { results } = await seedMetaobjects({ client, entries });
    assert.ok(results.every(({ status }) => status === 'unchanged'));
  });

  it('repairs a DRAFT status and edited fields, reporting what changed', async () => {
    const { client, state } = fakeStore();
    await seedMetaobjects({ client, entries });
    state.writes.length = 0;
    const roaster = state.entries.get('roaster/copper-kettle');
    roaster.capabilities.publishable.status = 'DRAFT';
    roaster.fields = roaster.fields.map((field) => (field.key === 'country' ? { ...field, value: 'Narnia' } : field));

    const dry = await seedMetaobjects({ client, entries, dryRun: true });
    const planned = dry.results.filter(({ status }) => status !== 'unchanged');
    assert.deepEqual(
      planned.map(({ handle, status }) => [handle, status]),
      [['copper-kettle', 'would-update']],
    );
    assert.deepEqual(state.writes, []);

    const { results } = await seedMetaobjects({ client, entries });
    const updated = results.find(({ status }) => status === 'updated');
    assert.equal(updated.handle, 'copper-kettle');
    assert.ok(updated.changes.some((change) => change.startsWith('status: DRAFT -> ACTIVE')));
    assert.ok(updated.changes.some((change) => change.startsWith('country:')));
    assert.deepEqual(state.writes, ['roaster/copper-kettle']);
  });

  it('fails on userErrors from Shopify', async () => {
    const { client, state } = fakeStore();
    state.userErrors = [{ field: ['metaobject', 'fields'], message: 'Invalid', code: 'INVALID' }];
    await assert.rejects(
      seedMetaobjects({ client, entries }),
      /Seeding roaster\/northern-ember failed: metaobject\.fields: Invalid \(INVALID\)/,
    );
  });
});
