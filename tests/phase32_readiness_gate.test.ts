import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  config,
  isMainnetHost,
  OFFICIAL_TESTNET_API_URL,
  sanitizeApiHost,
  validateHostAllowlist,
} from '../server/config.js';
import { liveExecutionAdapter, LiveExecutionAdapter } from '../server/liveExecutionAdapter.js';
import { validateOrder, RiskSettings } from '../server/orderValidator.js';
import { getEmergencyKillSwitchState, setEmergencyKillSwitchState } from '../server/orderManager.js';
import { OrderRequest } from '../server/orderValidator.js';
import { getUpstreamAdapter, setUpstreamAdapter } from '../server/upstreamAdapter.js';

describe('Phase 32: Live-Trading Readiness & Execution Gate', () => {
  it('enforces safety locks (botAutoTradeEnabled=false, botDryRun=true)', () => {
    assert.strictEqual(config.botAutoTradeEnabled, false, 'botAutoTradeEnabled must be strictly false');
    assert.strictEqual(config.botDryRun, true, 'botDryRun must be strictly true');
    assert.strictEqual(liveExecutionAdapter.isLiveExecutionAllowed(), false, 'isLiveExecutionAllowed must return false');
  });

  it('validates testnet and mainnet host allowlists correctly', () => {
    // Testnet allowlist tests
    const testnetValid = validateHostAllowlist('https://testnet-api.polyester.exchange', false);
    assert.strictEqual(testnetValid.allowed, true, 'Official testnet host must be allowed');

    const testnetAltValid = validateHostAllowlist('https://api.testnet.polyester.com', false);
    assert.strictEqual(testnetAltValid.allowed, true, 'Alternative testnet host must be allowed');

    const testnetInvalid = validateHostAllowlist('https://unauthorized-domain.com', false);
    assert.strictEqual(testnetInvalid.allowed, false, 'Unallowlisted testnet domain must be rejected');
    assert.strictEqual(
      validateHostAllowlist('http://api.testnet.polyester.com', false).allowed,
      false,
      'Remote testnet APIs must require HTTPS',
    );
    assert.strictEqual(
      validateHostAllowlist('https://api.testnet.polyester.com.evil.example', false).allowed,
      false,
      'Lookalike testnet domains must be rejected',
    );
    assert.strictEqual(
      validateHostAllowlist('https://user@api.testnet.polyester.com', false).allowed,
      false,
      'Userinfo in host URLs must be rejected',
    );
    assert.strictEqual(
      validateHostAllowlist('https://api.testnet.polyester.com/untrusted-path', false).allowed,
      false,
      'Unapproved URL paths must be rejected',
    );

    // Mainnet allowlist tests
    const mainnetValid = validateHostAllowlist('https://api.polyester.exchange', true);
    assert.strictEqual(mainnetValid.allowed, true, 'Official mainnet host must be allowed when mainnet requested');

    const mainnetInvalid = validateHostAllowlist('https://fake-mainnet-api.com', true);
    assert.strictEqual(mainnetInvalid.allowed, false, 'Fake mainnet domain must be rejected');

    // Host helper tests
    assert.strictEqual(isMainnetHost('https://api.polyester.exchange'), true, 'api.polyester.exchange must be mainnet');
    assert.strictEqual(isMainnetHost('https://testnet-api.polyester.exchange'), false, 'testnet host must not be mainnet');
    assert.strictEqual(
      isMainnetHost('https://api.polyester.exchange.evil.example'),
      false,
      'Lookalike mainnet domains must not be classified as official hosts',
    );
  });

  it('falls back to the official testnet host when configured API hosts are unapproved', () => {
    const previousFallback = process.env.POLYESTER_TESTNET_HOST;
    process.env.POLYESTER_TESTNET_HOST = 'https://attacker.example';
    try {
      assert.strictEqual(sanitizeApiHost('https://attacker.example'), OFFICIAL_TESTNET_API_URL);
      assert.strictEqual(sanitizeApiHost(), OFFICIAL_TESTNET_API_URL);
    } finally {
      if (previousFallback === undefined) delete process.env.POLYESTER_TESTNET_HOST;
      else process.env.POLYESTER_TESTNET_HOST = previousFallback;
    }
  });

  it('enforces 10% fee reserve buffer during balance checks', () => {
    const buyOrder: OrderRequest = {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 50000,
      quantity: 0.02, // $1,000 notional
      clientOrderId: `fee_test_${Date.now()}`,
    };

    const risk: RiskSettings = {
      maxPositionSizeUsd: 5000,
      maxDrawdownPercent: 10,
      slippageTolerancePercent: 0.5,
      stopLossPercent: 2.0,
      maxOpenOrders: 5,
      killSwitchActive: false,
      allowedSymbols: ['BTC-USDT'],
    };

    // $1,000 notional with 10% fee buffer requires $1,100 balance.
    // $1,050 balance should fail.
    const lowBalanceRes = validateOrder(buyOrder, risk, 0, 1050, new Set(), { feeBufferPercent: 10 });
    assert.strictEqual(lowBalanceRes.valid, false, 'Order must be rejected when balance does not cover 10% fee reserve');
    assert.strictEqual(lowBalanceRes.code, 'INSUFFICIENT_BALANCE');

    // $1,150 balance should pass.
    const highBalanceRes = validateOrder(buyOrder, risk, 0, 1150, new Set(), { feeBufferPercent: 10 });
    assert.strictEqual(highBalanceRes.valid, true, 'Order must be accepted when balance covers 10% fee reserve');
  });

  it('enforces reconciliation rule for uncertain orders before retrying', async () => {
    const customAdapter = new LiveExecutionAdapter();
    const orderReq: OrderRequest = {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 50000,
      quantity: 0.01,
      clientOrderId: `uncertain_client_id_${Date.now()}`,
    };

    // Mark order uncertain due to simulated network timeout
    customAdapter.markOrderUncertain(orderReq.clientOrderId, 'HTTP 504 Gateway Timeout');

    // Precondition check must fail due to missing reconciliation
    const preCheck = customAdapter.validatePreconditions(orderReq, 10000, 0, 0);
    assert.strictEqual(preCheck.valid, false, 'Unreconciled uncertain order must fail validation');
    assert.strictEqual(preCheck.code, 'ORDER_STATUS_UNCERTAIN_RECONCILIATION_REQUIRED');

    const previousAdapter = getUpstreamAdapter();
    setUpstreamAdapter({
      ...previousAdapter,
      async getOrderByClientOrderId() {
        return { success: false, found: false, error: 'Lookup unavailable' };
      },
    });
    try {
      const reconciliation = await customAdapter.reconcileTargetOrder(orderReq.clientOrderId);
      assert.strictEqual(reconciliation.clientOrderId, orderReq.clientOrderId);
      assert.strictEqual(reconciliation.recommendation, 'MANUAL_INSPECTION_REQUIRED');

      const postReconcileCheck = customAdapter.validatePreconditions(orderReq, 10000, 0, 0);
      assert.strictEqual(postReconcileCheck.valid, false, 'Order must remain blocked until confirmed');
    } finally {
      setUpstreamAdapter(previousAdapter);
    }
  });

  it('enforces position cap limits and max single order size', () => {
    const customAdapter = new LiveExecutionAdapter({
      maxSingleOrderUsd: 5000,
      maxTotalPositionUsd: 10000,
    });

    // 1. Single order size violation ($6,000 > $5,000 limit)
    const largeOrder: OrderRequest = {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 60000,
      quantity: 0.1, // $6,000 notional
      clientOrderId: `large_ord_${Date.now()}`,
    };

    const singleCheck = customAdapter.validatePreconditions(largeOrder, 50000, 0, 0);
    assert.strictEqual(singleCheck.valid, false, 'Order exceeding single order cap must be rejected');
    assert.strictEqual(singleCheck.code, 'MAX_SINGLE_ORDER_EXCEEDED');

    // 2. Position cap violation (Current position $8,000 + order $3,000 = $11,000 > $10,000 cap)
    const mediumOrder: OrderRequest = {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 30000,
      quantity: 0.1, // $3,000 notional
      clientOrderId: `pos_cap_ord_${Date.now()}`,
    };

    const capCheck = customAdapter.validatePreconditions(mediumOrder, 50000, 0, 8000);
    assert.strictEqual(capCheck.valid, false, 'Order exceeding total position cap must be rejected');
    assert.strictEqual(capCheck.code, 'MAX_POSITION_CAP_EXCEEDED');
  });

  it('rejects live execution attempts with locked safety code', async () => {
    const res = await liveExecutionAdapter.executeLiveOrder(
      {
        symbol: 'BTC-USDT',
        side: 'buy',
        type: 'limit',
        price: 50000,
        quantity: 0.01,
        clientOrderId: `live_attempt_${Date.now()}`,
      },
      10000,
      0,
      0
    );

    assert.strictEqual(res.success, false, 'executeLiveOrder must return success=false');
    assert.strictEqual(res.code, 'LIVE_EXECUTION_DISABLED', 'Error code must be LIVE_EXECUTION_DISABLED');
  });

  it('respects emergency kill switch overrides', () => {
    setEmergencyKillSwitchState(true);
    assert.strictEqual(getEmergencyKillSwitchState(), true);

    const testOrder: OrderRequest = {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 50000,
      quantity: 0.01,
      clientOrderId: `kill_switch_test_${Date.now()}`,
    };

    const risk: RiskSettings = {
      maxPositionSizeUsd: 5000,
      maxDrawdownPercent: 10,
      slippageTolerancePercent: 0.5,
      stopLossPercent: 2.0,
      maxOpenOrders: 5,
      killSwitchActive: true,
      allowedSymbols: ['BTC-USDT'],
    };

    const res = validateOrder(testOrder, risk, 0, 10000, new Set());
    assert.strictEqual(res.valid, false, 'Validation must fail when kill switch active');
    assert.strictEqual(res.code, 'KILL_SWITCH_ACTIVE');

    // Restore kill switch state
    setEmergencyKillSwitchState(false);
    assert.strictEqual(getEmergencyKillSwitchState(), false);
  });
});
