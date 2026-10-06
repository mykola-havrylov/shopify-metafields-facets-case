// Admin GraphQL client for a Dev Dashboard app using the client credentials grant.
// Docs: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant
//
// The access token lives in memory only: it is never written to a file or env,
// never logged and never included in error messages.

// Pinned stable Admin API version; bump deliberately. See https://shopify.dev/docs/api/usage/versioning
export const API_VERSION = '2026-10';

// Refresh this long before the server-provided expiry (the docs example uses 60s).
const EXPIRY_SAFETY_MARGIN_MS = 60_000;
const MAX_THROTTLE_RETRIES = 3;
const MIN_THROTTLE_WAIT_MS = 250;
// Used when a THROTTLED response carries no usable cost data.
const FALLBACK_THROTTLE_WAIT_MS = 1_000;
const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export class ShopifyClientError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ShopifyClientError';
    Object.assign(this, details);
  }
}

/**
 * Reads and validates connection settings.
 * The shop domain is validated so credentials are only ever sent to *.myshopify.com.
 */
export function loadConfig(env = process.env) {
  const missing = ['SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'SHOPIFY_SHOP'].filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new ShopifyClientError(`Missing environment variables: ${missing.join(', ')}. See .env.example.`);
  }

  const shop = env.SHOPIFY_SHOP.trim().toLowerCase();
  if (!SHOP_DOMAIN_PATTERN.test(shop)) {
    throw new ShopifyClientError('SHOPIFY_SHOP must be a "<name>.myshopify.com" domain without protocol or path.');
  }

  return { shop, clientId: env.SHOPIFY_CLIENT_ID, clientSecret: env.SHOPIFY_CLIENT_SECRET };
}

const truncate = (text, max = 500) => (text.length > max ? `${text.slice(0, max)}…` : text);
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isThrottled = (errors) =>
  Array.isArray(errors) && errors.length > 0 && errors.every((error) => error?.extensions?.code === 'THROTTLED');

/**
 * Milliseconds until the cost bucket can afford the query:
 * (requestedQueryCost - currentlyAvailable) / restoreRate seconds.
 * Cost is read from the top-level `extensions.cost` (documented), falling back to the error's own extensions.
 */
function throttleWaitMs(body) {
  const cost = body.extensions?.cost ?? body.errors.find((error) => error.extensions?.cost)?.extensions.cost;
  const requested = cost?.requestedQueryCost;
  const { currentlyAvailable, restoreRate } = cost?.throttleStatus ?? {};

  if (![requested, currentlyAvailable, restoreRate].every(Number.isFinite) || restoreRate <= 0) {
    return FALLBACK_THROTTLE_WAIT_MS;
  }
  return Math.max(MIN_THROTTLE_WAIT_MS, Math.ceil(((requested - currentlyAvailable) / restoreRate) * 1000));
}

/**
 * @param {object} options
 * @param {string} options.shop            "<name>.myshopify.com"
 * @param {string} options.clientId
 * @param {string} options.clientSecret
 * @param {typeof fetch} [options.fetch]   injectable for tests
 * @param {() => number} [options.now]     injectable clock (ms), for tests
 * @param {(ms: number) => Promise<void>} [options.sleep]  injectable delay, for tests
 */
export function createClient({
  shop,
  clientId,
  clientSecret,
  fetch: fetchImpl = fetch,
  now = Date.now,
  sleep = defaultSleep,
}) {
  let cached = null; // { value, expiresAt }
  let pending = null; // in-flight token request, shared by concurrent callers

  async function requestToken() {
    const response = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new ShopifyClientError(
        `Token request failed with HTTP ${response.status}: ${truncate(text)}. ` +
          'Check the client ID/secret and that the app and the store belong to the same Dev Dashboard organization ' +
          '(otherwise Shopify answers "Client credentials cannot be performed on this shop").',
        { status: response.status },
      );
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ShopifyClientError('Token response is not valid JSON.', { status: response.status });
    }
    if (!payload.access_token || !Number.isFinite(payload.expires_in)) {
      throw new ShopifyClientError('Token response is missing access_token or expires_in.', {
        status: response.status,
      });
    }

    cached = {
      value: payload.access_token,
      expiresAt: now() + payload.expires_in * 1000 - EXPIRY_SAFETY_MARGIN_MS,
    };
    return cached.value;
  }

  function getToken() {
    if (cached && now() < cached.expiresAt) return Promise.resolve(cached.value);
    pending ??= requestToken().finally(() => {
      pending = null;
    });
    return pending;
  }

  function invalidate(token) {
    // Only drop the token that failed; a concurrent caller may already have refreshed it.
    if (cached?.value === token) cached = null;
  }

  async function send(query, variables, token) {
    const response = await fetchImpl(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    });

    // Shopify silently falls forward to the oldest supported version when the requested one is inaccessible.
    const servedVersion = response.headers.get('X-Shopify-API-Version');
    if (servedVersion && servedVersion !== API_VERSION) {
      throw new ShopifyClientError(
        `Requested Admin API ${API_VERSION} but Shopify served ${servedVersion}. The pinned version is not accessible.`,
        { status: response.status },
      );
    }

    return response;
  }

  /**
   * One HTTP round trip returning the parsed body.
   * On 401 the cached token is dropped, a new one is requested and the request is retried exactly once.
   */
  async function execute(query, variables) {
    let token = await getToken();
    let response = await send(query, variables, token);

    if (response.status === 401) {
      invalidate(token);
      token = await getToken();
      response = await send(query, variables, token);

      if (response.status === 401) {
        throw new ShopifyClientError(
          `Admin API rejected a freshly issued token for ${shop} (HTTP 401 after one refresh). ` +
            'Check that the app is installed on this store and that its scopes were approved.',
          { status: 401 },
        );
      }
    }

    const text = await response.text();
    if (!response.ok) {
      throw new ShopifyClientError(`Admin API request failed with HTTP ${response.status}: ${truncate(text)}`, {
        status: response.status,
      });
    }

    try {
      return { status: response.status, body: JSON.parse(text) };
    } catch {
      throw new ShopifyClientError('Admin API response is not valid JSON.', { status: response.status });
    }
  }

  /**
   * Runs an Admin GraphQL operation and returns `data`.
   * THROTTLED responses (HTTP 200) are waited out and retried up to MAX_THROTTLE_RETRIES times.
   */
  async function graphql(query, variables = {}) {
    for (let retries = 0; ; retries += 1) {
      const { status, body } = await execute(query, variables);

      if (!body.errors?.length) return body.data;

      if (!isThrottled(body.errors)) {
        throw new ShopifyClientError(`Admin API returned GraphQL errors: ${truncate(JSON.stringify(body.errors))}`, {
          status,
          errors: body.errors,
        });
      }
      if (retries === MAX_THROTTLE_RETRIES) {
        throw new ShopifyClientError(
          `Admin API throttled the request and it still failed after ${MAX_THROTTLE_RETRIES} retries.`,
          { status, errors: body.errors, throttled: true },
        );
      }
      await sleep(throttleWaitMs(body));
    }
  }

  return { graphql };
}
