/**
 * POLYESTER TITAN AI - Phase 7 Live Testnet Connectivity & Diagnostics Tests
 * Tests Cloudflare challenge evaluation, authentication failures, sanitized diagnostics,
 * production endpoint rejection, and strict execution safeguards.
 */

import test from 'node:test';
import assert from 'node:assert';
import { evaluateHealthResponse, evaluateMarketsResponse } from '../server/polyesterClient.js';
import { validateOrder } from '../server/orderValidator.js';
import { resetStrategyStateForTest } from '../server/strategyEngine.js';
import { config } from '../server/config.js';

test('Phase 7 - Cloudflare Challenge Detection (HTTP 403)', () => {
  const result = evaluateHealthResponse(
    403,
    'Forbidden',
    'text/html',
    '<html><head><title>Just a moment...</title></head><body>cf-mitigated</body></html>',
    { 'server': 'cloudflare', 'cf-ray': '8abc1234-TPE' }
  );

  assert.strictEqual(result.status, 'blocked');
  assert.strictEqual(result.isCloudflareBlocked, true);
  assert.match(result.errorMessage || '', /Cloudflare Managed Challenge/);
});

test('Phase 7 - Authentication Failure vs Upstream Blocking', () => {
  const authFail = evaluateHealthResponse(
    401,
    'Unauthorized',
    'application/json',
    '{"error":"Unauthorized"}',
    {}
  );
  assert.strictEqual(authFail.status, 'error');
  assert.match(authFail.errorMessage || '', /Authentication failed/);

  const blocked = evaluateHealthResponse(
    403,
    'Forbidden',
    'text/html',
    '<html>challenges.cloudflare.com</html>',
    { 'server': 'cloudflare' }
  );
  assert.strictEqual(blocked.status, 'blocked');
  assert.strictEqual(blocked.isCloudflareBlocked, true);
});

test('Phase 7 - No Synthetic Market Data Fallback on Blocked Feed', () => {
  const marketRes = evaluateMarketsResponse(
    403,
    'text/html',
    '<html>cloudflare challenge</html>',
    { 'server': 'cloudflare', 'cf-ray': 'xyz' }
  );

  assert.strictEqual(marketRes.status, 'blocked');
  assert.strictEqual(marketRes.markets.length, 0);
  assert.match(marketRes.message, /blocked by Cloudflare/);
});

test('Phase 7 - Production Endpoint Rejection Guard', () => {
  resetStrategyStateForTest();
  process.env.POLYESTER_API_KEY_ID = 'test_key';
  process.env.POLYESTER_API_PRIVATE_KEY = 'test_priv';

  const origHost = config.polyesterApiHost;
  (config as any).polyesterApiHost = 'https://api.polyester.com'; // Production host without testnet

  const validation = validateOrder(
    {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 60000,
      quantity: 0.01,
      clientOrderId: 'prod_guard_test',
    },
    {
      maxPositionSizeUsd: 10000,
      maxDrawdownPercent: 5,
      slippageTolerancePercent: 0.5,
      stopLossPercent: 2,
      maxOpenOrders: 3,
      killSwitchActive: false,
      allowedSymbols: ['BTC-USDT'],
    },
    0,
    10000,
    new Set()
  );

  assert.strictEqual(validation.valid, false);
  assert.strictEqual(validation.code, 'PRODUCTION_HOST_REJECTED');

  (config as any).polyesterApiHost = origHost;
  delete process.env.POLYESTER_API_KEY_ID;
  delete process.env.POLYESTER_API_PRIVATE_KEY;
});

test('Phase 7 - Missing Credentials Rejection', () => {
  delete process.env.POLYESTER_API_KEY_ID;
  delete process.env.POLYESTER_API_PRIVATE_KEY;

  const validation = validateOrder(
    {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 60000,
      quantity: 0.01,
      clientOrderId: 'no_creds_test',
    },
    {
      maxPositionSizeUsd: 10000,
      maxDrawdownPercent: 5,
      slippageTolerancePercent: 0.5,
      stopLossPercent: 2,
      maxOpenOrders: 3,
      killSwitchActive: false,
      allowedSymbols: ['BTC-USDT'],
    },
    0,
    10000,
    new Set()
  );

  assert.strictEqual(validation.valid, false);
  assert.strictEqual(validation.code, 'CREDENTIALS_MISSING');
});
