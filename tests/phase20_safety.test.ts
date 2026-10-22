/**
 * POLYESTER TITAN AI - Phase 20: Order Safety & Gate Validation
 * Proves that the default configuration cannot submit real orders and that
 * the strategy-agent path is strictly gated.
 */

import test from 'node:test';
import assert from 'node:assert';

process.env.POLYESTER_API_KEY_ID = 'mock_key_20';
process.env.POLYESTER_API_SECRET_HEX = 'a'.repeat(64);

import { config } from '../server/config.js';
import { polyesterSdkAdapter } from '../server/polyesterAdapter.js';
import { createManagedOrder } from '../server/orderManager.js';

test('Phase 20 - Safety Invariants Locked', () => {
  assert.strictEqual(config.botAutoTradeEnabled, false, 'botAutoTradeEnabled must be false');
  assert.strictEqual(config.botDryRun, true, 'botDryRun must be true');
});

test('Phase 20 - Adapter Gate Rejects Live Orders', async () => {
  // Even if we try to bypass dryRun by setting it false (though config is const),
  // the adapter must fail-closed if it detects non-dry-run without authorization.
  
  // We simulate a non-dry-run request to the adapter
  const originalDryRun = config.botDryRun;
  (config as any).botDryRun = false; // Forced for test
  
  try {
    const result = await polyesterSdkAdapter.submitOrder({
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'market',
      quantity: 0.001
    });

    assert.strictEqual(result.success, false, 'Adapter must reject non-dry-run orders in Phase 20');
    assert.match(result.error!, /Manual authorization .* required/);
  } finally {
    (config as any).botDryRun = originalDryRun;
  }
});

test('Phase 20 - Automated Trading Breach Prevention', async () => {
  const originalAutoTrade = config.botAutoTradeEnabled;
  (config as any).botAutoTradeEnabled = true; // Simulating a configuration breach
  
  try {
    const result = await polyesterSdkAdapter.submitOrder({
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'market',
      quantity: 0.001
    });

    assert.strictEqual(result.success, false, 'Adapter must reject orders if automated trading is enabled in this phase');
    assert.match(result.error!, /strictly disabled/);
  } finally {
    (config as any).botAutoTradeEnabled = originalAutoTrade;
  }
});

test('Phase 20 - Order Manager Honors Dry Run', async () => {
  const req = {
    symbol: 'BTC-USDT',
    side: 'buy' as const,
    type: 'market' as const,
    quantity: 0.001,
    clientOrderId: `test_id_${Date.now()}`
  };
  
  const risk = {
    maxPositionSizeUsd: 1000,
    maxDrawdownPercent: 5,
    slippageTolerancePercent: 1,
    stopLossPercent: 2,
    maxOpenOrders: 5,
    killSwitchActive: false,
    allowedSymbols: ['BTC-USDT']
  };

  const result = await createManagedOrder(req, risk);
  
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.order?.isDryRun, true, 'Order created by manager must be marked as dry-run');
  assert.strictEqual(result.order?.status, 'open', 'Dry-run order should be simulated as open');
});
