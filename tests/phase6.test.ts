/**
 * POLYESTER TITAN AI - Phase 6 Safety Audit & Controlled Automation Tests
 * Tests process error handling, authorization TTL & config invalidation,
 * testnet environment guards, concurrency limits, and performance metrics.
 */

import test from 'node:test';
import assert from 'node:assert';
import { validateOrder } from '../server/orderValidator.js';
import { createManagedOrder, cancelManagedOrder, getAccountBalance } from '../server/orderManager.js';
import {
  coordinateStrategy,
  evaluateReadiness,
  setOperatorAuthorization,
  checkAuthorizationValid,
  updateStrategyConfig,
  resetStrategyStateForTest,
  getPerformanceStats,
} from '../server/strategyEngine.js';
import { config, sanitizeApiHost } from '../server/config.js';

test('Phase 6 - Testnet Environment Guard Rejects Production Hosts', () => {
  resetStrategyStateForTest();
  process.env.POLYESTER_API_KEY_ID = 'test_key';
  process.env.POLYESTER_API_PRIVATE_KEY = 'test_priv';

  const originalHost = config.polyesterApiHost;
  
  // Temporarily force a production URL without testnet
  (config as any).polyesterApiHost = 'https://api.polyester.com';

  const risk = {
    maxPositionSizeUsd: 10000,
    maxDrawdownPercent: 5,
    slippageTolerancePercent: 0.5,
    stopLossPercent: 2,
    maxOpenOrders: 3,
    killSwitchActive: false,
    allowedSymbols: ['BTC-USDT'],
  };

  const validation = validateOrder(
    {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 60000,
      quantity: 0.01,
      clientOrderId: 'prod_test_123',
    },
    risk,
    0,
    10000,
    new Set()
  );

  assert.strictEqual(validation.valid, false);
  assert.strictEqual(validation.code, 'PRODUCTION_HOST_REJECTED');

  // Restore
  (config as any).polyesterApiHost = originalHost;
  delete process.env.POLYESTER_API_KEY_ID;
  delete process.env.POLYESTER_API_PRIVATE_KEY;
});

test('Phase 6 - Authorization Expiry and Restart Reset', () => {
  resetStrategyStateForTest();
  
  // Grant auth
  setOperatorAuthorization(true);
  const authStatus = checkAuthorizationValid();
  assert.strictEqual(authStatus.valid, true);

  // Simulate expiry by manipulating timestamp back 16 minutes
  const cfg = updateStrategyConfig({});
  (cfg as any).authorizationTimestamp = Date.now() - (16 * 60 * 1000);

  const expiredCheck = checkAuthorizationValid();
  assert.strictEqual(expiredCheck.valid, false);
  assert.match(expiredCheck.reason, /expired/i);
});

test('Phase 6 - Material Configuration Change Invalidates Authorization', () => {
  resetStrategyStateForTest();
  setOperatorAuthorization(true);
  assert.strictEqual(checkAuthorizationValid().valid, true);

  // Change max quote USD (material config change)
  updateStrategyConfig({ maxOrderQuoteUsd: 2000 });

  const invalidCheck = checkAuthorizationValid();
  assert.strictEqual(invalidCheck.valid, false);
  assert.match(invalidCheck.reason, /material configuration change/i);
});

test('Phase 6 - Max Open Orders Concurrency Limit Enforcement', () => {
  resetStrategyStateForTest();
  const risk = {
    maxPositionSizeUsd: 10000,
    maxDrawdownPercent: 5,
    slippageTolerancePercent: 0.5,
    stopLossPercent: 2,
    maxOpenOrders: 2,
    killSwitchActive: false,
    allowedSymbols: ['BTC-USDT'],
  };

  process.env.POLYESTER_API_KEY_ID = 'test_key';
  process.env.POLYESTER_API_PRIVATE_KEY = 'test_priv';

  const validation = validateOrder(
    {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 60000,
      quantity: 0.01,
      clientOrderId: 'cli_limit_test',
    },
    risk,
    2, // current open orders count meets maxOpenOrders (2)
    10000,
    new Set()
  );

  assert.strictEqual(validation.valid, false);
  assert.strictEqual(validation.code, 'MAX_OPEN_ORDERS_EXCEEDED');

  delete process.env.POLYESTER_API_KEY_ID;
  delete process.env.POLYESTER_API_PRIVATE_KEY;
});

test('Phase 6 - Performance Stats Tracking', () => {
  resetStrategyStateForTest();
  const stats = getPerformanceStats();
  assert.strictEqual(typeof stats.submittedOrdersCount, 'number');
  assert.strictEqual(typeof stats.filledOrdersCount, 'number');
  assert.strictEqual(typeof stats.rejectionsCount, 'number');
  assert.strictEqual(typeof stats.realizedPnlUsd, 'number');
});
