/**
 * POLYESTER TITAN AI - Phase 14 Authorized Testnet Integration Readiness Tests
 * Tests integration-readiness state when upstream access is blocked by Cloudflare,
 * ensuring zero synthetic fallback and strict safety enforcements.
 */

import test from 'node:test';
import assert from 'node:assert';
import { evaluateReadiness, resetStrategyStateForTest } from '../server/strategyEngine.js';
import {
  getVerifiedMarkets,
  getLastHealthCheck,
  mapSdkMarkets,
  setLastHealthCheckForTesting,
} from '../server/polyesterClient.js';
import { config } from '../server/config.js';

test('Phase 14 - Integration Readiness Blocks Execution When Upstream Blocked', async () => {
  resetStrategyStateForTest();
  
  const health = getLastHealthCheck();
  // When health is disconnected or blocked, readiness must fail closed
  const readiness = evaluateReadiness();
  
  assert.strictEqual(readiness.allChecksPassed, false);
  assert.strictEqual(readiness.autoTradeAllowed, false);
  assert.strictEqual(readiness.connectivity.status, 'failed');
});

test('Phase 14 - Zero Synthetic Data Substitution When Market Feed Blocked', async () => {
  setLastHealthCheckForTesting({
    status: 'blocked',
    checkedAt: new Date().toISOString(),
    targetHost: config.polyesterApiHost,
    targetEndpoint: '/v1/health',
    httpStatus: 403,
    statusText: 'Forbidden',
    contentType: 'text/html',
    latencyMs: 10,
    isCloudflareBlocked: true,
    isRateLimited: false,
    schemaValid: false,
    parsedData: null,
    errorMessage: 'Cloudflare challenge',
    securityNotice: 'Polyester Testnet mode locked',
  });

  const marketsRes = await getVerifiedMarkets();
  // When upstream is unverified/blocked, markets array must be empty (zero synthetic data)
  assert.strictEqual(marketsRes.markets.length, 0);
  assert.ok(marketsRes.status === 'blocked' || marketsRes.status === 'unavailable' || marketsRes.status === 'empty');
});

test('Phase 14 - Missing SDK market prices remain unavailable instead of receiving synthetic values', () => {
  const markets = mapSdkMarkets([
    { symbol: 'BTC-USDT', symbolId: 1, lastPrice: undefined, minQtyBase: '0.001', tickSize: '0.1' },
    { symbol: 'ETH-USDT', symbolId: 2, lastPrice: '0', minQtyBase: '0.01', tickSize: '0.01' },
    { symbol: 'SOL-USDT', symbolId: 4, lastPrice: '12.5', minQtyBase: '0.1', tickSize: '0.01' },
  ]);

  assert.equal(markets[0].lastPrice, null);
  assert.equal(markets[1].lastPrice, null);
  assert.equal(markets[2].lastPrice, 12.5);
});
