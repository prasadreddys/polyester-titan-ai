import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { config, validateHostAllowlist } from '../server/config.js';
import { liveExecutionAdapter, LiveExecutionAdapter } from '../server/liveExecutionAdapter.js';
import { getEmergencyKillSwitchState, setEmergencyKillSwitchState } from '../server/orderManager.js';
import { validateOrder, RiskSettings, OrderRequest } from '../server/orderValidator.js';
import { runPhase33GateVerification } from '../server/scripts/phase33_gate_verification.js';
import { getUpstreamAdapter, setUpstreamAdapter } from '../server/upstreamAdapter.js';

describe('Phase 33: Live-Trading Gate Verification Test Suite', () => {
  beforeEach(() => {
    setEmergencyKillSwitchState(false);
  });

  afterEach(() => {
    setEmergencyKillSwitchState(false);
  });

  test('1. System safety locks are strictly maintained', async () => {
    assert.equal(config.botAutoTradeEnabled, false, 'botAutoTradeEnabled must be strictly false');
    assert.equal(config.botDryRun, true, 'botDryRun must be strictly true');
    assert.equal(liveExecutionAdapter.getConfig().enabled, false, 'liveExecutionAdapter must be disabled by default');
    assert.equal(liveExecutionAdapter.isLiveExecutionAllowed(), false, 'isLiveExecutionAllowed() must return false');

    const sampleOrder: OrderRequest = {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 50000,
      quantity: 0.002,
      clientOrderId: `safety_test_${Date.now()}`,
    };

    const liveRes = await liveExecutionAdapter.executeLiveOrder(sampleOrder, 25000, 0, 0);
    assert.equal(liveRes.success, false, 'Live execution attempt must be strictly rejected');
    assert.ok(
      liveRes.code === 'LIVE_EXECUTION_DISABLED' || liveRes.code === 'PHASE_32_EXECUTION_GATE_LOCKED',
      `Unexpected error code: ${liveRes.code}`
    );
  });

  test('2. Official host allowlists and symmetry are enforced', () => {
    const testnetCheck = validateHostAllowlist('https://testnet-api.polyester.exchange', false);
    assert.equal(testnetCheck.allowed, true, 'Official testnet host must be allowed');

    const mainnetCheck = validateHostAllowlist('https://api.polyester.exchange', true);
    assert.equal(mainnetCheck.allowed, true, 'Official mainnet host must be allowed for mainnet');

    const unverifiedCheck = validateHostAllowlist('https://fake-unauthorized-exchange.com', true);
    assert.equal(unverifiedCheck.allowed, false, 'Unverified mainnet host must be rejected');
    assert.ok(unverifiedCheck.reason?.includes('not in official Mainnet allowlist'));
  });

  test('3. Emergency kill switch rejects order creation and execution', () => {
    setEmergencyKillSwitchState(true);
    assert.equal(getEmergencyKillSwitchState(), true);

    const req: OrderRequest = {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 50000,
      quantity: 0.002,
      clientOrderId: `ks_test_${Date.now()}`,
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

    const result = validateOrder(req, risk, 0, 25000, new Set());
    assert.equal(result.valid, false, 'Order must be rejected when kill switch is active');
    assert.equal(result.code, 'KILL_SWITCH_ACTIVE');
  });

  test('4. 10% Fee reserve buffer is strictly enforced', () => {
    const req: OrderRequest = {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 50000,
      quantity: 0.002, // $100 notional
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

    // $100 notional + 10% fee buffer = $110 required balance
    const lowBalanceRes = validateOrder(req, risk, 0, 105, new Set(), { feeBufferPercent: 10 });
    assert.equal(lowBalanceRes.valid, false, '$105 balance must fail 10% fee buffer check');
    assert.equal(lowBalanceRes.code, 'INSUFFICIENT_BALANCE');

    const highBalanceRes = validateOrder(req, risk, 0, 115, new Set(), { feeBufferPercent: 10 });
    assert.equal(highBalanceRes.valid, true, '$115 balance must pass 10% fee buffer check');
  });

  test('5. Single order notional and total position cap limits are enforced', () => {
    const defaultRisk: RiskSettings = {
      maxPositionSizeUsd: 5000,
      maxDrawdownPercent: 10,
      slippageTolerancePercent: 0.5,
      stopLossPercent: 2.0,
      maxOpenOrders: 5,
      killSwitchActive: false,
      allowedSymbols: ['BTC-USDT'],
    };

    // Single order USD limit ($5,000)
    const oversizedReq: OrderRequest = {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 50000,
      quantity: 0.12, // $6,000 notional
      clientOrderId: `oversize_test_${Date.now()}`,
    };

    const oversizeRes = validateOrder(oversizedReq, defaultRisk, 0, 25000, new Set());
    assert.equal(oversizeRes.valid, false, 'Order over $5,000 must be rejected');
    assert.equal(oversizeRes.code, 'MAX_NOTIONAL_EXCEEDED');

    // Total position limit cap ($10,000)
    const validReq: OrderRequest = {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 50000,
      quantity: 0.004, // $200 notional
      clientOrderId: `position_test_${Date.now()}`,
    };

    const adapter = new LiveExecutionAdapter();
    const positionCapRes = adapter.validatePreconditions(validReq, 25000, 0, 9900); // $9,900 current + $200 = $10,100 > $10,000
    assert.equal(positionCapRes.valid, false, 'Resulting position over $10,000 must be rejected');
    assert.equal(positionCapRes.code, 'MAX_POSITION_CAP_EXCEEDED');
  });

  test('6. Duplicate clientOrderId collision is rejected', () => {
    const req: OrderRequest = {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 50000,
      quantity: 0.002,
      clientOrderId: 'dup_client_id_999',
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

    const existingIds = new Set(['dup_client_id_999']);
    const dupRes = validateOrder(req, risk, 0, 25000, existingIds);
    assert.equal(dupRes.valid, false, 'Duplicate clientOrderId must be rejected');
    assert.equal(dupRes.code, 'DUPLICATE_CLIENT_ORDER_ID');
  });

  test('7. Withdrawal permission scope presence triggers security rejection', () => {
    const adapter = new LiveExecutionAdapter();
    const auditWithWithdraw = adapter.auditAccountPermissions(['ORDER_READ_WRITE', 'BALANCE_READ', 'WITHDRAW_FUNDS']);
    assert.equal(auditWithWithdraw.permissions.withdrawDisabled, false, 'withdrawDisabled must be false when WITHDRAW scope present');
    assert.equal(auditWithWithdraw.readyForLive, false, 'readyForLive must be false when WITHDRAW scope present');
    assert.ok(auditWithWithdraw.missingPermissions.includes('WITHDRAW_MUST_BE_DISABLED'));
  });

  test('8. Timeout uncertain order reconciliation guard is enforced', async () => {
    const adapter = new LiveExecutionAdapter();
    const req: OrderRequest = {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 50000,
      quantity: 0.002,
      clientOrderId: 'timeout_order_123',
    };

    adapter.markOrderUncertain('timeout_order_123', 'Network socket timeout after 7000ms');

    const checkBeforeReconcile = adapter.validatePreconditions(req, 25000, 0, 0);
    assert.equal(checkBeforeReconcile.valid, false, 'Order in UNCERTAIN state must be rejected before reconciliation');
    assert.equal(checkBeforeReconcile.code, 'ORDER_STATUS_UNCERTAIN_RECONCILIATION_REQUIRED');

    const previousAdapter = getUpstreamAdapter();
    setUpstreamAdapter({
      ...previousAdapter,
      async getOrderByClientOrderId() {
        return { success: true, found: false };
      },
    });
    try {
      const reconciled = await adapter.reconcileTargetOrder('timeout_order_123');
      assert.ok(reconciled.reconciledAt, 'Reconciliation attempt should be recorded');
      assert.equal(reconciled.recommendation, 'MANUAL_INSPECTION_REQUIRED');

      const checkAfterReconcile = adapter.validatePreconditions(req, 25000, 0, 0);
      assert.equal(checkAfterReconcile.valid, false, 'A lookup miss must not permit a retry');
      assert.equal(
        checkAfterReconcile.code,
        'ORDER_STATUS_UNCERTAIN_RECONCILIATION_REQUIRED',
      );
    } finally {
      setUpstreamAdapter(previousAdapter);
    }
  });

  test('8a. Confirmed exchange order remains protected from retry', async () => {
    const adapter = new LiveExecutionAdapter();
    const req: OrderRequest = {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 50000,
      quantity: 0.002,
      clientOrderId: 'confirmed_order_123',
    };
    adapter.markOrderUncertain(req.clientOrderId, 'Network timeout');

    const previousAdapter = getUpstreamAdapter();
    setUpstreamAdapter({
      ...previousAdapter,
      async getOrderByClientOrderId() {
        return { success: true, found: true, orderId: 'exchange_order_123', status: 'working' };
      },
    });
    try {
      const reconciled = await adapter.reconcileTargetOrder(req.clientOrderId);
      assert.equal(reconciled.recommendation, 'DO_NOT_RETRY');

      const retryCheck = adapter.validatePreconditions(req, 25000, 0, 0);
      assert.equal(retryCheck.valid, false, 'A confirmed client order ID must not be reusable');
      assert.equal(retryCheck.code, 'DUPLICATE_CLIENT_ORDER_ID');
    } finally {
      setUpstreamAdapter(previousAdapter);
    }
  });

  test('9. Phase 33 Gate Verification script produces compliant report', async () => {
    const report = await runPhase33GateVerification();

    assert.equal(report.phaseName, 'PHASE_33_LIVE_TRADING_GATE_VERIFICATION');
    assert.equal(report.safetyFlags.safetyLocksIntact, true, 'Safety locks must be intact');
    assert.equal(report.observationGateAudit.sampleSizeGatePassed, false, '100-signal gate must NOT be passed');
    assert.equal(report.observationGateAudit.winRateSuppressed, true, 'Win rate must be suppressed');
    assert.equal(report.costAdjustedPerformanceEvaluation.roundTripCostPercent, 0.30, '0.30% round trip cost must be deducted');
    assert.ok(report.blockersToLiveExecution.length > 0, 'Blockers list must contain items');
    assert.ok(report.verifiedDocumentationSources.length > 0, 'Documentation sources must be listed');
    assert.equal(report.overallStatus, 'PHASE_33_VERIFICATION_PASSED_LIVE_TRADING_STRICTLY_LOCKED');
  });
});
