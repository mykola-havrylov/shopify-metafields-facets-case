// Idempotent upload of the product images in data/images/ and attaching them to the products.
// Flow per product: stagedUploadsCreate -> PUT the bytes -> productUpdate with the staged resource as media.
// A product that already has an image with the expected alt text is left alone; --replace deletes and re-uploads.
import { extname } from 'node:path';
import { IMAGE_EXTENSIONS } from './images.js';
import { imageAlt } from './image-prompts.js';

const PRODUCT_MEDIA = `#graphql
  query ProductMedia($handle: String!) {
    productByIdentifier(identifier: { handle: $handle }) {
      id
      handle
      media(first: 20) {
        nodes {
          id
          alt
          mediaContentType
          status
        }
      }
    }
  }
`;

const STAGED_UPLOAD = `#graphql
  mutation StagedUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters { name value }
      }
      userErrors { field message }
    }
  }
`;

const ATTACH_MEDIA = `#graphql
  mutation AttachMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
    productUpdate(product: $product, media: $media) {
      product { id }
      userErrors { field message }
    }
  }
`;

const DELETE_FILES = `#graphql
  mutation DeleteFiles($fileIds: [ID!]!) {
    fileDelete(fileIds: $fileIds) {
      deletedFileIds
      userErrors { field message }
    }
  }
`;

function assertNoUserErrors(action, userErrors) {
  if (userErrors.length > 0) {
    throw new Error(
      `${action} failed: ${userErrors.map(({ field, message }) => `${(field ?? []).join('.')}: ${message}`).join('; ')}`,
    );
  }
}

const images = (product) => product.media.nodes.filter(({ mediaContentType }) => mediaContentType === 'IMAGE');

/** Sends the file to the staged target. Returned parameters are sent as headers, as the PUT upload requires. */
async function putToStagedTarget(fetchImpl, target, bytes) {
  const headers = Object.fromEntries(target.parameters.map(({ name, value }) => [name, value]));
  const response = await fetchImpl(target.url, { method: 'PUT', headers, body: bytes });
  if (!response.ok)
    throw new Error(`Staged upload failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

async function waitUntilReady(client, handle, alt, { sleep, attempts, delayMs }) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { productByIdentifier } = await client.graphql(PRODUCT_MEDIA, { handle });
    const media = images(productByIdentifier).find((item) => item.alt === alt);
    if (media?.status === 'READY') return true;
    if (media?.status === 'FAILED')
      throw new Error(`Shopify could not process the image of "${handle}" (status FAILED).`);
    if (attempt < attempts) await sleep(delayMs);
  }
  return false;
}

/**
 * @param {object} options
 * @param {Array<{product: object, filename: string}>} options.matches
 * @param {(filename: string) => Promise<Buffer>} options.readImage
 * @param {(product: object) => string} options.roasterTitleOf
 * @returns {Promise<{results: Array<{handle: string, status: string, note?: string}>}>}
 *   statuses: uploaded, replaced, unchanged, would-upload, would-replace, conflict, missing-product, processing
 */
export async function uploadProductImages({
  client,
  matches,
  readImage,
  roasterTitleOf,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  dryRun = false,
  replace = false,
  attempts = 15,
  delayMs = 2000,
}) {
  const results = [];

  for (const { product, filename } of matches) {
    const { handle } = product;
    const { productByIdentifier: existing } = await client.graphql(PRODUCT_MEDIA, { handle });
    if (!existing) {
      results.push({ handle, status: 'missing-product', note: 'run npm run seed:catalog first' });
      continue;
    }

    const alt = imageAlt(product, roasterTitleOf(product));
    const current = images(existing);
    // A FAILED image is never worth keeping; it is removed and uploaded again without --replace.
    const usable = current.filter(({ status }) => status !== 'FAILED');
    const toDelete = replace ? current : current.filter(({ status }) => status === 'FAILED');
    if (!replace && usable.some((media) => media.alt === alt)) {
      results.push({ handle, status: 'unchanged' });
      continue;
    }
    if (!replace && usable.length > 0) {
      results.push({
        handle,
        status: 'conflict',
        note: `has ${usable.length} other image(s); use --replace to swap them`,
      });
      continue;
    }
    if (dryRun) {
      results.push({ handle, status: toDelete.length > 0 ? 'would-replace' : 'would-upload' });
      continue;
    }

    if (toDelete.length > 0) {
      const { fileDelete } = await client.graphql(DELETE_FILES, { fileIds: toDelete.map(({ id }) => id) });
      assertNoUserErrors(`Deleting the old images of "${handle}"`, fileDelete.userErrors);
    }

    const bytes = await readImage(filename);
    const mimeType = IMAGE_EXTENSIONS[extname(filename).toLowerCase()];
    const { stagedUploadsCreate } = await client.graphql(STAGED_UPLOAD, {
      input: [{ filename, mimeType, resource: 'IMAGE', httpMethod: 'PUT' }],
    });
    assertNoUserErrors(`Preparing the upload for "${handle}"`, stagedUploadsCreate.userErrors);
    const [target] = stagedUploadsCreate.stagedTargets;
    await putToStagedTarget(fetchImpl, target, bytes);

    const { productUpdate } = await client.graphql(ATTACH_MEDIA, {
      product: { id: existing.id },
      media: [{ originalSource: target.resourceUrl, alt, mediaContentType: 'IMAGE' }],
    });
    assertNoUserErrors(`Attaching the image to "${handle}"`, productUpdate.userErrors);

    const ready = await waitUntilReady(client, handle, alt, { sleep, attempts, delayMs });
    const status = ready ? (toDelete.length > 0 ? 'replaced' : 'uploaded') : 'processing';
    results.push({
      handle,
      status,
      ...(ready ? {} : { note: 'still processing at Shopify; npm run verify checks it later' }),
    });
  }

  return { results };
}
