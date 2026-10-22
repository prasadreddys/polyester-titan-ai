import test from 'node:test';
import assert from 'node:assert';
import {
  getHealthEndpoint,
  getMarketsEndpoint,
  getMarketOverviewEndpoint,
  evaluateHealthResponse,
  evaluateMarketsResponse,
} from '../server/polyesterClient.js';
import { sanitizeApiHost, sanitizeLog } from '../server/config.js';

// =========================================================================
// TEST 1: Correct Documented Endpoint Construction
// =========================================================================
test('1. Correct Documented Endpoint Construction', () => {
  const host = 'https://api.testnet.polyester.com';
  assert.strictEqual(getHealthEndpoint(host), 'https://api.testnet.polyester.com/v1/health');
  assert.strictEqual(getMarketsEndpoint(host), 'https://api.testnet.polyester.com/v1/spot/config');
  assert.strictEqual(
    getMarketOverviewEndpoint(host),
    'https://api.testnet.polyester.com/marketoverview.v1.MarketOverviewService/ListMarketOverview'
  );
});

// =========================================================================
// TEST 2: [Unit/Mock] Valid JSON Responses (Health & Market Catalog)
// Note: External responses are mocked in this unit test and do not prove live connectivity.
// =========================================================================
test('2. [Unit/Mock] Valid Health and Market Catalog JSON Responses', () => {
  const mockHealthPayload = JSON.stringify({
    status: 'healthy',
    environment: 'testnet',
    timestamp: '2026-10-21T17:00:00Z',
  });

  test('2a. Spot config pairs are parsed without inventing prices', () => {
    const result = evaluateMarketsResponse(
      200,
      'application/json',
      JSON.stringify({
        pairs: [
          { symbol: 'BTC-USDT', symbolId: 1, status: 'active', minQtyBase: '0.001', tickSize: '0.1' },
        ],
        assets: [],
      }),
    );

    assert.equal(result.status, 'verified');
    assert.equal(result.markets.length, 1);
    assert.equal(result.markets[0].marketId, '1');
    assert.equal(result.markets[0].lastPrice, null);
    assert.equal(result.markets[0].minOrderSize, 0.001);
    assert.equal(result.markets[0].priceTickSize, 0.1);
  });

  const healthResult = evaluateHealthResponse(
    200,
    'OK',
    'application/json; charset=utf-8',
    mockHealthPayload,
    {}
  );
  assert.strictEqual(healthResult.status, 'connected');
  assert.strictEqual(healthResult.schemaValid, true);
  assert.strictEqual(healthResult.isCloudflareBlocked, false);
  assert.strictEqual(healthResult.parsedData?.status, 'healthy');

  const mockMarketsPayload = JSON.stringify({
    timestamp: '2026-10-21T17:00:00Z',
    markets: [
      {
        symbol: 'BTC-USDT',
        marketId: 'mkt_btc_usdt_01',
        lastPrice: 65420.5,
        indexPrice: 65415.0,
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        status: 'active',
      },
      {
        symbol: 'ETH-USDT',
        marketId: 'mkt_eth_usdt_01',
        lastPrice: 3510.25,
        indexPrice: 3509.8,
        baseAsset: 'ETH',
        quoteAsset: 'USDT',
        status: 'active',
      },
    ],
  });

  const marketsResult = evaluateMarketsResponse(
    200,
    'application/json',
    mockMarketsPayload,
    {}
  );
  assert.strictEqual(marketsResult.status, 'verified');
  assert.strictEqual(marketsResult.markets.length, 2);
  assert.strictEqual(marketsResult.markets[0].symbol, 'BTC-USDT');
  assert.strictEqual(marketsResult.markets[0].lastPrice, 65420.5);
  assert.strictEqual(marketsResult.markets[1].symbol, 'ETH-USDT');
  assert.strictEqual(marketsResult.upstreamTimestamp, '2026-10-21T17:00:00Z');
});

// =========================================================================
// TEST 3: [Unit/Mock] HTTP 401 Unauthorized
// =========================================================================
test('3. [Unit/Mock] HTTP 401 Unauthorized Response Handling', () => {
  const result = evaluateHealthResponse(
    401,
    'Unauthorized',
    'application/json',
    '{"error":"Invalid API Key ID or signature"}',
    {}
  );
  assert.strictEqual(result.status, 'error');
  assert.strictEqual(result.schemaValid, false);
  assert.match(result.errorMessage || '', /401/);
});

// =========================================================================
// TEST 4: [Unit/Mock] HTTP 403 & Cloudflare HTML Challenge
// =========================================================================
test('4. [Unit/Mock] Cloudflare HTML Challenge Detection (HTTP 403)', () => {
  const cloudflareHtml = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>cf-mitigated: challenge</body></html>';
  const headers = { 'server': 'cloudflare', 'cf-ray': 'a4e214a35bc4a378-TPE' };

  const healthResult = evaluateHealthResponse(403, 'Forbidden', 'text/html; charset=UTF-8', cloudflareHtml, headers);
  assert.strictEqual(healthResult.status, 'blocked');
  assert.strictEqual(healthResult.isCloudflareBlocked, true);
  assert.strictEqual(healthResult.schemaValid, false);
  assert.strictEqual(healthResult.parsedData, null);

  const marketsResult = evaluateMarketsResponse(403, 'text/html', cloudflareHtml, headers);
  assert.strictEqual(marketsResult.status, 'blocked');
  assert.strictEqual(marketsResult.markets.length, 0);
  assert.match(marketsResult.message, /Cloudflare Managed Challenge/);
});

// =========================================================================
// TEST 5: [Unit/Mock] HTTP 429 Rate Limiting and Retry-After
// =========================================================================
test('5. [Unit/Mock] HTTP 429 Rate Limiting and Retry-After Header Parsing', () => {
  const headers = { 'retry-after': '30' };

  const healthResult = evaluateHealthResponse(429, 'Too Many Requests', 'application/json', '{"error":"Rate limited"}', headers);
  assert.strictEqual(healthResult.status, 'rate_limited');
  assert.strictEqual(healthResult.isRateLimited, true);
  assert.strictEqual(healthResult.retryAfterSeconds, 30);

  const marketsResult = evaluateMarketsResponse(429, 'application/json', '{"error":"Rate limited"}', headers);
  assert.strictEqual(marketsResult.status, 'rate_limited');
  assert.strictEqual(marketsResult.markets.length, 0);
  assert.match(marketsResult.message, /Retry after 30s/);
});

// =========================================================================
// TEST 6: [Unit/Mock] HTTP 5xx Server Errors & Timeouts
// =========================================================================
test('6. [Unit/Mock] HTTP 5xx Server Errors Handling', () => {
  const serverErrorStatuses = [500, 502, 503, 504];

  for (const statusCode of serverErrorStatuses) {
    const healthResult = evaluateHealthResponse(statusCode, 'Server Error', 'text/plain', 'Upstream Failure', {});
    assert.strictEqual(healthResult.status, 'disconnected');
    assert.strictEqual(healthResult.schemaValid, false);
    assert.match(healthResult.errorMessage || '', new RegExp(String(statusCode)));

    const marketsResult = evaluateMarketsResponse(statusCode, 'text/plain', 'Upstream Failure', {});
    assert.strictEqual(marketsResult.status, 'unavailable');
    assert.strictEqual(marketsResult.markets.length, 0);
  }
});

// =========================================================================
// TEST 7: [Unit/Mock] Invalid or Missing Market Fields Rejection
// =========================================================================
test('7. [Unit/Mock] Invalid or Missing Market Fields Rejection', () => {
  const malformedPayload = JSON.stringify({
    markets: [
      { lastPrice: 100 },                 // Missing symbol -> must be rejected
      { symbol: '', lastPrice: 200 },     // Empty string symbol -> must be rejected
      { symbol: 12345, lastPrice: 300 },  // Non-string symbol -> must be rejected
      { symbol: 'VALID-USDT', lastPrice: 400 }, // Valid item -> must be accepted
    ],
  });

  const result = evaluateMarketsResponse(200, 'application/json', malformedPayload, {});
  assert.strictEqual(result.status, 'verified');
  assert.strictEqual(result.markets.length, 1);
  assert.strictEqual(result.markets[0].symbol, 'VALID-USDT');
  assert.strictEqual(result.markets[0].lastPrice, 400);
});

// =========================================================================
// TEST 8: Secret Redaction Verification
// =========================================================================
test('8. Secret Redaction Verification in Logs and Objects', () => {
  const rawSecret = 'ed25519_priv_9876543210abcdef';
  const rawKey = '4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b';
  const text = `Attempting handshake with api_key="${rawSecret}" and private_key="${rawKey}"`;

  const sanitized = sanitizeLog(text);
  assert.strictEqual(sanitized.includes(rawSecret), false);
  assert.strictEqual(sanitized.includes(rawKey), false);
  assert.strictEqual(sanitized.includes('***REDACTED***'), true);
});

// =========================================================================
// TEST 9: Production Host Rejection
// =========================================================================
test('9. Production Host Rejection & Testnet Enforcement', () => {
  const prodHosts = [
    'https://polyester.com',
    'https://api.polyester.com',
    'http://polyester.com/api',
  ];

  for (const host of prodHosts) {
    const sanitized = sanitizeApiHost(host);
    assert.strictEqual(sanitized.includes('testnet'), true);
    assert.strictEqual(sanitized, 'https://api.testnet.polyester.com');
  }

  // Valid testnet host must be preserved
  const validTestnet = 'https://api.testnet.polyester.com';
  assert.strictEqual(sanitizeApiHost(validTestnet), validTestnet);
});

// =========================================================================
// TEST 10: [Unit/Mock] Empty Market Catalog Handling
// =========================================================================
test('10. [Unit/Mock] Empty Market Catalog Handling (Zero Mock Data Added)', () => {
  const emptyPayload = JSON.stringify({ markets: [] });
  const result = evaluateMarketsResponse(200, 'application/json', emptyPayload, {});

  assert.strictEqual(result.status, 'empty');
  assert.strictEqual(result.markets.length, 0);
  assert.match(result.message, /No active market pairs/);
});
