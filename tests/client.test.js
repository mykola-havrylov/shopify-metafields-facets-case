import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { API_VERSION, ShopifyClientError, createClient, loadConfig } from '../scripts/src/client.js';

const SHOP = 'demo-store.myshopify.com';
const SECRET = 'test-secret-value';

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Shopify-API-Version': API_VERSION, ...headers },
  });

const tokenResponse = (token, expiresIn = 86399) =>
  json(200, { access_token: token, scope: 'read_products', expires_in: expiresIn });
const dataResponse = (data = { shop: { name: 'Demo' } }) => json(200, { data });

/** Fake fetch driven by a queue of responders per endpoint kind; records every call. */
function fakeShopify({ tokens = [], graphql = [] }) {
  const calls = [];
  const queues = { token: [...tokens], graphql: [...graphql] };
  const fetchImpl = async (url, init) => {
    const kind = url.endsWith('/admin/oauth/access_token') ? 'token' : 'graphql';
    calls.push({ kind, url, init });
    const next = queues[kind].shift();
    assert.ok(next, `unexpected extra ${kind} request`);
    return next;
  };
  return { fetchImpl, calls, count: (kind) => calls.filter((call) => call.kind === kind).length };
}

function makeClient(fake, now = () => 0, sleep = async () => {}) {
  return createClient({ shop: SHOP, clientId: 'client-id', clientSecret: SECRET, fetch: fake.fetchImpl, now, sleep });
}

const throttledResponse = (cost) =>
  json(200, {
    errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }],
    ...(cost && { extensions: { cost } }),
  });
const costOf = (requestedQueryCost, currentlyAvailable, restoreRate = 100) => ({
  requestedQueryCost,
  actualQueryCost: null,
  throttleStatus: { maximumAvailable: 2000, currentlyAvailable, restoreRate },
});

describe('createClient', () => {
  it('requests a token with form-encoded client credentials and sends it as a header', async () => {
    const fake = fakeShopify({ tokens: [tokenResponse('tok-1')], graphql: [dataResponse()] });
    const data = await makeClient(fake).graphql('{ shop { name } }');

    assert.deepEqual(data, { shop: { name: 'Demo' } });
    const [tokenCall, graphqlCall] = fake.calls;
    assert.equal(tokenCall.url, `https://${SHOP}/admin/oauth/access_token`);
    assert.equal(tokenCall.init.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(tokenCall.init.body.get('grant_type'), 'client_credentials');
    assert.equal(tokenCall.init.body.get('client_id'), 'client-id');
    assert.equal(graphqlCall.url, `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`);
    assert.equal(graphqlCall.init.headers['X-Shopify-Access-Token'], 'tok-1');
  });

  it('caches the token until expires_in minus the safety margin', async () => {
    let clock = 0;
    const fake = fakeShopify({
      tokens: [tokenResponse('tok-1', 1000), tokenResponse('tok-2', 1000)],
      graphql: [dataResponse(), dataResponse(), dataResponse()],
    });
    const client = makeClient(fake, () => clock);

    await client.graphql('{ shop { name } }');
    clock = 900_000; // still inside 1000s - 60s margin
    await client.graphql('{ shop { name } }');
    assert.equal(fake.count('token'), 1);

    clock = 945_000; // past the margin (940s), before the real expiry (1000s)
    await client.graphql('{ shop { name } }');
    assert.equal(fake.count('token'), 2);
    assert.equal(fake.calls.at(-1).init.headers['X-Shopify-Access-Token'], 'tok-2');
  });

  it('shares one in-flight token request between concurrent calls', async () => {
    const fake = fakeShopify({ tokens: [tokenResponse('tok-1')], graphql: [dataResponse(), dataResponse()] });
    const client = makeClient(fake);

    await Promise.all([client.graphql('{ shop { name } }'), client.graphql('{ shop { name } }')]);
    assert.equal(fake.count('token'), 1);
  });

  it('refreshes the token and retries exactly once on 401', async () => {
    const fake = fakeShopify({
      tokens: [tokenResponse('tok-old'), tokenResponse('tok-new')],
      graphql: [json(401, { errors: 'Invalid API key or access token' }), dataResponse()],
    });
    const data = await makeClient(fake).graphql('{ shop { name } }');

    assert.deepEqual(data, { shop: { name: 'Demo' } });
    assert.equal(fake.count('token'), 2);
    assert.equal(fake.count('graphql'), 2);
    const graphqlCalls = fake.calls.filter((call) => call.kind === 'graphql');
    assert.equal(graphqlCalls[0].init.headers['X-Shopify-Access-Token'], 'tok-old');
    assert.equal(graphqlCalls[1].init.headers['X-Shopify-Access-Token'], 'tok-new');
    assert.equal(graphqlCalls[1].init.body, graphqlCalls[0].init.body, 'the original request is replayed');
  });

  it('fails with a diagnostic error on a second 401, without a third attempt or leaking secrets', async () => {
    const fake = fakeShopify({
      tokens: [tokenResponse('tok-old'), tokenResponse('tok-new')],
      graphql: [json(401, {}), json(401, {})],
    });

    await assert.rejects(makeClient(fake).graphql('{ shop { name } }'), (error) => {
      assert.ok(error instanceof ShopifyClientError);
      assert.equal(error.status, 401);
      assert.match(error.message, /after one refresh/);
      assert.match(error.message, /scopes/);
      for (const secret of ['tok-old', 'tok-new', SECRET]) assert.ok(!error.message.includes(secret));
      return true;
    });
    assert.equal(fake.count('token'), 2);
    assert.equal(fake.count('graphql'), 2);
  });

  it('reports a diagnostic error when the token request is rejected', async () => {
    const fake = fakeShopify({
      tokens: [
        json(400, {
          error: 'shop_not_permitted',
          error_description: 'Client credentials cannot be performed on this shop',
        }),
      ],
    });

    await assert.rejects(makeClient(fake).graphql('{ shop { name } }'), (error) => {
      assert.equal(error.status, 400);
      assert.match(error.message, /same Dev Dashboard organization/);
      assert.ok(!error.message.includes(SECRET));
      return true;
    });
  });

  it('throws on GraphQL errors in a 200 response', async () => {
    const fake = fakeShopify({
      tokens: [tokenResponse('tok-1')],
      graphql: [json(200, { errors: [{ message: 'Field does not exist' }] })],
    });

    await assert.rejects(makeClient(fake).graphql('{ nope }'), /GraphQL errors: .*Field does not exist/);
  });

  it('waits (requested - available) / restoreRate and retries when throttled, then succeeds', async () => {
    const waits = [];
    const fake = fakeShopify({
      tokens: [tokenResponse('tok-1')],
      graphql: [throttledResponse(costOf(500, 100)), dataResponse()],
    });
    const data = await makeClient(fake, undefined, async (ms) => waits.push(ms)).graphql('{ shop { name } }');

    assert.deepEqual(data, { shop: { name: 'Demo' } });
    assert.deepEqual(waits, [4000]); // (500 - 100) / 100 s
    assert.equal(fake.count('graphql'), 2);
    assert.equal(fake.count('token'), 1, 'throttling does not touch the token');
  });

  it('applies a small floor to the wait and a fallback when cost data is missing', async () => {
    const waits = [];
    const fake = fakeShopify({
      tokens: [tokenResponse('tok-1')],
      graphql: [throttledResponse(costOf(10, 10)), throttledResponse(), dataResponse()],
    });
    await makeClient(fake, undefined, async (ms) => waits.push(ms)).graphql('{ shop { name } }');

    assert.deepEqual(waits, [250, 1000]);
  });

  it('gives up with a throttled error after 3 retries', async () => {
    const waits = [];
    const fake = fakeShopify({
      tokens: [tokenResponse('tok-1')],
      graphql: Array.from({ length: 4 }, () => throttledResponse(costOf(100, 0))),
    });

    await assert.rejects(
      makeClient(fake, undefined, async (ms) => waits.push(ms)).graphql('{ shop { name } }'),
      (error) => {
        assert.ok(error instanceof ShopifyClientError);
        assert.equal(error.throttled, true);
        assert.match(error.message, /throttled/i);
        return true;
      },
    );
    assert.equal(fake.count('graphql'), 4, '1 attempt + 3 retries');
    assert.equal(waits.length, 3);
  });

  it('does not treat mixed THROTTLED and other errors as throttling', async () => {
    const fake = fakeShopify({
      tokens: [tokenResponse('tok-1')],
      graphql: [
        json(200, { errors: [{ extensions: { code: 'THROTTLED' } }, { message: 'Boom', extensions: { code: 'X' } }] }),
      ],
    });

    await assert.rejects(makeClient(fake).graphql('{ shop { name } }'), /GraphQL errors: .*Boom/);
    assert.equal(fake.count('graphql'), 1);
  });

  it('throws when Shopify serves a different API version than the pinned one', async () => {
    const fake = fakeShopify({
      tokens: [tokenResponse('tok-1')],
      graphql: [json(200, { data: {} }, { 'X-Shopify-API-Version': '2025-01' })],
    });

    await assert.rejects(makeClient(fake).graphql('{ shop { name } }'), /served 2025-01/);
  });
});

describe('loadConfig', () => {
  const valid = { SHOPIFY_CLIENT_ID: 'id', SHOPIFY_CLIENT_SECRET: 'secret', SHOPIFY_SHOP: 'Demo-Store.myshopify.com' };

  it('normalizes a valid shop domain', () => {
    assert.deepEqual(loadConfig(valid), { shop: 'demo-store.myshopify.com', clientId: 'id', clientSecret: 'secret' });
  });

  it('lists missing variables by name', () => {
    assert.throws(() => loadConfig({ SHOPIFY_CLIENT_ID: 'id' }), /SHOPIFY_CLIENT_SECRET, SHOPIFY_SHOP/);
  });

  it('rejects hosts other than *.myshopify.com so credentials cannot be sent elsewhere', () => {
    for (const shop of ['evil.example.com', 'https://demo.myshopify.com', 'demo.myshopify.com.evil.com']) {
      assert.throws(() => loadConfig({ ...valid, SHOPIFY_SHOP: shop }), /myshopify\.com/);
    }
  });
});
