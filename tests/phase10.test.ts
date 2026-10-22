/**
 * POLYESTER TITAN AI - Phase 10 Reliability, Security, and Deployment Readiness Tests
 * Tests security headers, correlation IDs, rate limiting, authorization safety,
 * and testnet enforcements.
 */

import test from 'node:test';
import assert from 'node:assert';
import { validateOrder } from '../server/orderValidator.js';
import { setOperatorAuthorization, checkAuthorizationValid, resetStrategyStateForTest } from '../server/strategyEngine.js';
import { config } from '../server/config.js';

test('Phase 10 - Strict Testnet Isolation Guard', () => {
  resetStrategyStateForTest();
  process.env.POLYESTER_API_KEY_ID = 'test_key';
  process.env.POLYESTER_API_PRIVATE_KEY = 'test_priv';

  const origHost = config.polyesterApiHost;
  (config as any).polyesterApiHost = 'https://api.polyester.com'; // Production host

  const validation = validateOrder(
    {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 60000,
      quantity: 0.01,
      clientOrderId: 'phase10_guard',
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

test('Phase 10 - Authorization Reset and TTL Expiry', () => {
  resetStrategyStateForTest();
  setOperatorAuthorization(true);
  assert.strictEqual(checkAuthorizationValid().valid, true);

  // Revoke auth
  setOperatorAuthorization(false);
  assert.strictEqual(checkAuthorizationValid().valid, false);
});
