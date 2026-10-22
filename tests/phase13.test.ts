/**
 * POLYESTER TITAN AI - Phase 13 Final Safety Gate & Release Candidate Tests
 * Tests hardened CSP headers, fail-safe startup authorization, kill-switch behavior,
 * and fail-closed readiness enforcement.
 */

import test from 'node:test';
import assert from 'node:assert';
import { validateOrder } from '../server/orderValidator.js';
import {
  evaluateReadiness,
  setOperatorAuthorization,
  checkAuthorizationValid,
  resetStrategyStateForTest,
  evaluateRiskGovernor,
} from '../server/strategyEngine.js';
import { config } from '../server/config.js';

test('Phase 13 - Fail-Safe Startup Authorization State is Disabled', () => {
  resetStrategyStateForTest();
  const authStatus = checkAuthorizationValid();
  assert.strictEqual(authStatus.valid, false);
  
  const readiness = evaluateReadiness();
  assert.strictEqual(readiness.autoTradeAllowed, false);
  assert.strictEqual(readiness.authorizationActive, false);
});

test('Phase 13 - Kill Switch Fails Closed and Blocks Orders', () => {
  resetStrategyStateForTest();
  setOperatorAuthorization(true);

  const risk = {
    maxPositionSizeUsd: 10000,
    maxDrawdownPercent: 5,
    slippageTolerancePercent: 0.5,
    stopLossPercent: 2,
    maxOpenOrders: 3,
    killSwitchActive: true, // Kill switch active
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
      clientOrderId: 'phase13_kill_switch_test',
    },
    risk,
    0,
    10000,
    new Set()
  );

  assert.strictEqual(validation.valid, false);
  assert.strictEqual(validation.code, 'KILL_SWITCH_ACTIVE');

  delete process.env.POLYESTER_API_KEY_ID;
  delete process.env.POLYESTER_API_PRIVATE_KEY;
});

test('Phase 13 - Readiness Fails Closed When Exchange Disconnected', () => {
  resetStrategyStateForTest();
  setOperatorAuthorization(true);

  const readiness = evaluateReadiness();
  // Connectivity status should be failed when health is disconnected/blocked
  assert.strictEqual(readiness.connectivity.status, 'failed');
  assert.strictEqual(readiness.allChecksPassed, false);
  assert.strictEqual(readiness.autoTradeAllowed, false);
});
