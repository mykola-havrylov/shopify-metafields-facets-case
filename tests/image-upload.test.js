import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canonicalCatalog } from '../scripts/src/catalog.js';
import { imageAlt } from '../scripts/src/image-prompts.js';
import { uploadProductImages } from '../scripts/src/image-upload.js';

const catalog = canonicalCatalog().slice(0, 3);
const matches = catalog.map((product) => ({ product, filename: `${product.handle}.jpg` }));
const roasterTitleOf = () => 'Some Roaster';
const bytes = Buffer.from('fake-image-bytes');

/** In-memory Shopify: products with media, staged uploads and processing that finishes after a few polls. */
function fakeStore({ products = catalog, readyAfterPolls = 1 } = {}) {
  const state = {
    products: new Map(
      products.map((p, i) => [p.handle, { id: `gid://shopify/Product/${i + 1}`, handle: p.handle, media: [] }]),
    ),
    calls: [],
    deleted: [],
    puts: [],
    polls: 0,
    stagedErrors: [],
    failNew: false,
  };
  let nextMedia = 1;

  const client = {
    async graphql(query, variables) {
      const name = /(?:query|mutation) (\w+)/.exec(query)[1];
      state.calls.push(name);
      if (name === 'ProductMedia') {
        const product = state.products.get(variables.handle);
        if (!product) return { productByIdentifier: null };
        state.polls += 1;
        for (const media of product.media) {
          if (media.status === 'PROCESSING' && media.readyAt <= state.polls) media.status = 'READY';
        }
        return { productByIdentifier: { ...product, media: { nodes: product.media } } };
      }
      if (name === 'StagedUpload') {
        const [input] = variables.input;
        state.lastStaged = input;
        return {
          stagedUploadsCreate: {
            stagedTargets: [
              {
                url: `https://staged.example/upload/${input.filename}`,
                resourceUrl: `https://staged.example/resource/${input.filename}`,
                parameters: [
                  { name: 'content_type', value: input.mimeType },
                  { name: 'acl', value: 'private' },
                ],
              },
            ],
            userErrors: state.stagedErrors,
          },
        };
      }
      if (name === 'AttachMedia') {
        const product = [...state.products.values()].find(({ id }) => id === variables.product.id);
        for (const media of variables.media) {
          product.media.push({
            id: `gid://shopify/MediaImage/${nextMedia++}`,
            alt: media.alt,
            mediaContentType: 'IMAGE',
            status: state.failNew ? 'FAILED' : 'PROCESSING',
            readyAt: state.polls + readyAfterPolls,
            source: media.originalSource,
          });
        }
        return { productUpdate: { product: { id: product.id }, userErrors: [] } };
      }
      if (name === 'DeleteFiles') {
        state.deleted.push(...variables.fileIds);
        for (const product of state.products.values())
          product.media = product.media.filter(({ id }) => !variables.fileIds.includes(id));
        return { fileDelete: { deletedFileIds: variables.fileIds, userErrors: [] } };
      }
      throw new Error(`unexpected operation ${name}`);
    },
  };

  const fetchImpl = async (url, init) => {
    state.puts.push({ url, init });
    return new Response('', { status: state.putStatus ?? 200 });
  };
  return { client, fetchImpl, state };
}

const run = (store, options = {}) =>
  uploadProductImages({
    client: store.client,
    fetchImpl: store.fetchImpl,
    matches,
    roasterTitleOf,
    readImage: async () => bytes,
    sleep: async () => {},
    ...options,
  });

describe('uploadProductImages', () => {
  it('stages the file, PUTs it with the returned parameters as headers and attaches it with an AI-disclosing alt', async () => {
    const store = fakeStore();
    const { results } = await run(store);

    assert.deepEqual(
      results.map(({ status }) => status),
      ['uploaded', 'uploaded', 'uploaded'],
    );
    assert.deepEqual(store.state.lastStaged, {
      filename: `${catalog[2].handle}.jpg`,
      mimeType: 'image/jpeg',
      resource: 'IMAGE',
      httpMethod: 'PUT',
    });
    const [first] = store.state.puts;
    assert.equal(first.init.method, 'PUT');
    assert.deepEqual(first.init.headers, { content_type: 'image/jpeg', acl: 'private' });
    assert.equal(first.init.body, bytes);

    const media = store.state.products.get(catalog[0].handle).media[0];
    assert.equal(media.alt, imageAlt(catalog[0], 'Some Roaster'));
    assert.match(media.alt, /^AI-generated/);
    assert.equal(media.source, `https://staged.example/resource/${catalog[0].handle}.jpg`);
  });

  it('dry run reads only', async () => {
    const store = fakeStore();
    const { results } = await run(store, { dryRun: true });
    assert.ok(results.every(({ status }) => status === 'would-upload'));
    assert.deepEqual(store.state.puts, []);
    assert.ok(store.state.calls.every((call) => call === 'ProductMedia'));
  });

  it('is idempotent: a second run uploads nothing', async () => {
    const store = fakeStore();
    await run(store);
    store.state.puts.length = 0;
    store.state.calls.length = 0;

    const { results } = await run(store);
    assert.ok(results.every(({ status }) => status === 'unchanged'));
    assert.deepEqual(store.state.puts, []);
    assert.ok(!store.state.calls.includes('StagedUpload'));
  });

  it('reports a conflict instead of touching a product that has other images', async () => {
    const store = fakeStore();
    store.state.products.get(catalog[0].handle).media.push({
      id: 'gid://shopify/MediaImage/900',
      alt: 'Manual photo',
      mediaContentType: 'IMAGE',
      status: 'READY',
    });

    const { results } = await run(store);
    assert.equal(results[0].status, 'conflict');
    assert.match(results[0].note, /--replace/);
    assert.equal(store.state.products.get(catalog[0].handle).media.length, 1);
    assert.equal(results[1].status, 'uploaded');
  });

  it('--replace deletes the existing images and uploads the new ones', async () => {
    const store = fakeStore();
    store.state.products.get(catalog[0].handle).media.push({
      id: 'gid://shopify/MediaImage/900',
      alt: 'Manual photo',
      mediaContentType: 'IMAGE',
      status: 'READY',
    });

    const dry = await run(store, { dryRun: true, replace: true });
    assert.equal(dry.results[0].status, 'would-replace');
    assert.deepEqual(store.state.deleted, []);

    const { results } = await run(store, { replace: true });
    assert.equal(results[0].status, 'replaced');
    assert.deepEqual(store.state.deleted.slice(0, 1), ['gid://shopify/MediaImage/900']);
    const { calls } = store.state;
    const attached = calls.indexOf('AttachMedia');
    const deletion = calls.indexOf('DeleteFiles');
    assert.ok(attached >= 0 && deletion > attached, 'the old image is deleted after the new one is attached');
    assert.ok(calls.slice(attached, deletion).includes('ProductMedia'), 'and after waiting for the new one');
    const alts = store.state.products.get(catalog[0].handle).media.map(({ alt }) => alt);
    assert.deepEqual(alts, [imageAlt(catalog[0], 'Some Roaster')]);
  });

  it('--replace keeps the old image while the new one is still processing', async () => {
    const store = fakeStore({ readyAfterPolls: 100 });
    store.state.products.get(catalog[0].handle).media.push({
      id: 'gid://shopify/MediaImage/900',
      alt: 'Manual photo',
      mediaContentType: 'IMAGE',
      status: 'READY',
    });

    const { results } = await run(store, { matches: matches.slice(0, 1), replace: true, attempts: 3 });
    assert.equal(results[0].status, 'processing');
    assert.match(results[0].note, /previous image\(s\) were kept/);
    assert.deepEqual(store.state.deleted, []);
    assert.ok(store.state.products.get(catalog[0].handle).media.some(({ id }) => id.endsWith('/900')));
  });

  it('--replace keeps the old image when the new one fails, and reports it', async () => {
    const store = fakeStore();
    store.state.failNew = true;
    store.state.products.get(catalog[0].handle).media.push({
      id: 'gid://shopify/MediaImage/900',
      alt: 'Manual photo',
      mediaContentType: 'IMAGE',
      status: 'READY',
    });

    const { results } = await run(store, { matches: matches.slice(0, 1), replace: true });
    assert.equal(results[0].status, 'failed');
    assert.match(results[0].note, /could not process the new image; the previous image\(s\) were kept/);
    assert.deepEqual(store.state.deleted, []);
  });

  it('does not mistake an old image with the same alt text for the new one', async () => {
    const store = fakeStore({ readyAfterPolls: 100 });
    store.state.products.get(catalog[0].handle).media.push({
      id: 'gid://shopify/MediaImage/900',
      alt: imageAlt(catalog[0], 'Some Roaster'),
      mediaContentType: 'IMAGE',
      status: 'READY',
    });

    const { results } = await run(store, { matches: matches.slice(0, 1), replace: true, attempts: 3 });
    assert.equal(results[0].status, 'processing');
    assert.deepEqual(store.state.deleted, []);
  });

  it('uploads again over a FAILED image without --replace, and reports a missing product', async () => {
    const store = fakeStore({ products: catalog.slice(0, 2) });
    store.state.products.get(catalog[0].handle).media.push({
      id: 'gid://shopify/MediaImage/901',
      alt: imageAlt(catalog[0], 'Some Roaster'),
      mediaContentType: 'IMAGE',
      status: 'FAILED',
    });

    const { results } = await run(store, { replace: false });
    assert.equal(results[2].status, 'missing-product');
    assert.match(results[2].note, /seed:catalog/);
    assert.equal(results[0].status, 'replaced');
    assert.deepEqual(store.state.deleted, ['gid://shopify/MediaImage/901']);
  });

  it('reports processing when Shopify has not finished within the wait', async () => {
    const store = fakeStore({ readyAfterPolls: 100 });
    const { results } = await run(store, { matches: matches.slice(0, 1), attempts: 3 });
    assert.equal(results[0].status, 'processing');
    assert.match(results[0].note, /still processing/);
  });

  it('fails clearly when the staged upload is rejected', async () => {
    const store = fakeStore();
    store.state.putStatus = 403;
    await assert.rejects(run(store), /Staged upload failed with HTTP 403/);

    const broken = fakeStore();
    broken.state.stagedErrors = [{ field: ['input'], message: 'Bad mime type' }];
    await assert.rejects(run(broken), /Preparing the upload for ".*" failed: input: Bad mime type/);
  });
});
