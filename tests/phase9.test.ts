/**
 * POLYESTER TITAN AI - Phase 9 Official API Integration & Controlled Order Verification Tests
 * Tests upstream adapter contract, 5-state readiness evaluation, reconciliation workflow,
 * and strict testnet execution safety guards.
 */

import test from 'node:test';
import assert from 'node:assert';
import { getUpstreamAdapter, setUpstreamAdapter, UpstreamAdapter } from '../server/upstreamAdapter.js';
import { validateOrder } from '../server/orderValidator.js';
import { createManagedOrder, cancelManagedOrder, reconcileManagedOrder } from '../server/orderManager.js';
import { resetStrategyStateForTest } from '../server/strategyEngine.js';
import { config } from '../server/config.js';
import { executeLifecycleTest } from '../server/phase21e_handler.js';
import { cancelTargetOrder } from '../server/phase21g_handler.js';
import { polyesterPhase21bAdapter } from '../server/polyesterPhase21bAdapter.js';

test('Phase 9 - Upstream Adapter Custom Implementation Contract', async () => {
  const customAdapter: UpstreamAdapter = {
    name: 'CustomTestAdapter',
    isConfigured() { return true; },
    async checkHealth() { return { status: 'connected', httpStatus: 200, message: 'Custom operational' }; },
    async getMarkets() { return { markets: [{ symbol: 'BTC-USDT', lastPrice: 62000 }], status: 'verified', source: 'custom_adapter' }; },
    async getAccount() { return { accountId: 'test_acct_99', availableBalance: 100000, currency: 'USDT' }; },
    async submitOrder(req) { return { success: true, orderId: `ord_custom_${Date.now()}` }; },
    async cancelOrder(id) { return { success: true }; },
    async getOrderStatus(id) { return { success: true, status: 'filled' }; },
  };

  setUpstreamAdapter(customAdapter);
  const adapter = getUpstreamAdapter();

  assert.strictEqual(adapter.name, 'CustomTestAdapter');
  assert.strictEqual(adapter.isConfigured(), true);

  const health = await adapter.checkHealth();
  assert.strictEqual(health.status, 'connected');

  const markets = await adapter.getMarkets();
  assert.strictEqual(markets.markets[0].symbol, 'BTC-USDT');

  const account = await adapter.getAccount();
  assert.strictEqual(account.availableBalance, 100000);

  const sub = await adapter.submitOrder({ symbol: 'BTC-USDT', side: 'buy', quantity: 0.1 });
  assert.strictEqual(sub.success, true);
  assert.ok(sub.orderId?.startsWith('ord_custom_'));
});

test('Phase 9 - Strict Testnet Host Validation & Rejection of Production URLs', () => {
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
      clientOrderId: 'phase9_prod_guard',
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

test('Phase 9 - Order Reconciliation and Idempotency Protection', async () => {
  resetStrategyStateForTest();
  process.env.POLYESTER_API_KEY_ID = 'test_key';
  process.env.POLYESTER_API_PRIVATE_KEY = 'test_priv';

  const risk = {
    maxPositionSizeUsd: 10000,
    maxDrawdownPercent: 5,
    slippageTolerancePercent: 0.5,
    stopLossPercent: 2,
    maxOpenOrders: 3,
    killSwitchActive: false,
    allowedSymbols: ['BTC-USDT'],
  };

  const clientId = 'dup_recon_test_123';
  const res1 = await createManagedOrder(
    {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 60000,
      quantity: 0.01,
      clientOrderId: clientId,
    },
    risk
  );

  assert.strictEqual(res1.success, true);

  // Attempt duplicate submission with same clientOrderId (collision protection)
  const res2 = await createManagedOrder(
    {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 60000,
      quantity: 0.01,
      clientOrderId: clientId,
    },
    risk
  );

  assert.strictEqual(res2.success, false);
  assert.strictEqual(res2.code, 'DUPLICATE_CLIENT_ORDER_ID');

  if (res1.order) {
    await cancelManagedOrder(res1.order.orderId);
  }
  delete process.env.POLYESTER_API_KEY_ID;
  delete process.env.POLYESTER_API_PRIVATE_KEY;
});

test('Phase 9 - Cancellation acknowledgement does not mark an order cancelled', async () => {
  const previousAdapter = getUpstreamAdapter();
  const previousDryRun = config.botDryRun;
  const previousKeyId = process.env.POLYESTER_API_KEY_ID;
  const previousPrivateKey = process.env.POLYESTER_API_PRIVATE_KEY;
  let exchangeStatus = 'working';

  (config as any).botDryRun = false;
  process.env.POLYESTER_API_KEY_ID = 'test_key';
  process.env.POLYESTER_API_PRIVATE_KEY = 'test_private_key';
  setUpstreamAdapter({
    ...previousAdapter,
    async getAccount() {
      return { accountId: 'test_account', availableBalance: 100000, currency: 'USDT' };
    },
    async submitOrder() {
      return { success: true, orderId: 'test_exchange_order_123' };
    },
    async cancelOrder() {
      return { success: true };
    },
    async getOrderStatus() {
      return { success: true, status: exchangeStatus };
    },
  });

  try {
    const created = await createManagedOrder(
      {
        symbol: 'BTC-USDT',
        side: 'buy',
        type: 'limit',
        price: 1000,
        quantity: 0.001,
        clientOrderId: `cancel_ack_${Date.now()}`,
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
      'test_approval',
    );
    assert.equal(created.success, true);
    assert.ok(created.order);

    const cancelResult = await cancelManagedOrder(created.order!.orderId);
    assert.equal(cancelResult.success, false);
    assert.equal(cancelResult.order?.status, 'open');

    exchangeStatus = 'canceled';
    const reconciled = await reconcileManagedOrder(created.order!.orderId);
    assert.equal(reconciled?.status, 'cancelled');
  } finally {
    setUpstreamAdapter(previousAdapter);
    (config as any).botDryRun = previousDryRun;
    if (previousKeyId === undefined) delete process.env.POLYESTER_API_KEY_ID;
    else process.env.POLYESTER_API_KEY_ID = previousKeyId;
    if (previousPrivateKey === undefined) delete process.env.POLYESTER_API_PRIVATE_KEY;
    else process.env.POLYESTER_API_PRIVATE_KEY = previousPrivateKey;
  }
});

test('Phase 9 - Explicit exchange mutation routes remain blocked in dry-run mode', async () => {
  assert.equal(config.botDryRun, true);
  await assert.rejects(executeLifecycleTest(true), /BOT_DRY_RUN=true/);
  await assert.rejects(cancelTargetOrder('test_order_id', true), /BOT_DRY_RUN=true/);
  const adapterResult = await polyesterPhase21bAdapter.submitOrder({}, 'test_approval');
  assert.equal(adapterResult.success, false);
  assert.match(adapterResult.error || '', /BOT_DRY_RUN=true/);
});
