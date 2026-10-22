/**
 * Adapter Contract Tests (Controlled Fixtures) - Phase 8
 * Tests the UpstreamAdapter contract using mock/controlled fixtures
 * to verify adapter method signatures and responses.
 */

import test from 'node:test';
import assert from 'node:assert';
import { setUpstreamAdapter, getUpstreamAdapter, UpstreamAdapter } from '../server/upstreamAdapter.js';

test('Adapter Contract - Controlled Fixture Adapter Validation', async () => {
  const mockAdapter: UpstreamAdapter = {
    name: 'MockFixtureAdapter',
    isConfigured() { return true; },
    async checkHealth() { return { status: 'connected', httpStatus: 200, message: 'Mock healthy' }; },
    async getMarkets() { return { markets: [{ symbol: 'BTC-USDT', lastPrice: 65000 }], status: 'verified', source: 'fixture' }; },
    async getAccount() { return { accountId: 'mock_acct_1', availableBalance: 50000, currency: 'USDT' }; },
    async submitOrder() { return { success: true, orderId: 'mock_ord_1' }; },
    async cancelOrder() { return { success: true }; },
    async getOrderStatus() { return { success: true, status: 'filled' }; },
  };

  setUpstreamAdapter(mockAdapter);
  const activeAdapter = getUpstreamAdapter();

  assert.strictEqual(activeAdapter.name, 'MockFixtureAdapter');
  assert.strictEqual(activeAdapter.isConfigured(), true);

  const health = await activeAdapter.checkHealth();
  assert.strictEqual(health.status, 'connected');

  const markets = await activeAdapter.getMarkets();
  assert.strictEqual(markets.markets.length, 1);
  assert.strictEqual(markets.markets[0].symbol, 'BTC-USDT');

  const account = await activeAdapter.getAccount();
  assert.strictEqual(account.availableBalance, 50000);

  const orderRes = await activeAdapter.submitOrder({});
  assert.strictEqual(orderRes.success, true);
  assert.strictEqual(orderRes.orderId, 'mock_ord_1');
});
