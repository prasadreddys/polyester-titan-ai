import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { orderApprovalStore } from '../server/authGate.js';
import { polyesterSdkAdapter } from '../server/polyesterAdapter.js';
import { config } from '../server/config.js';
import { setLastHealthCheckForTesting } from '../server/polyesterClient.js';

describe('Phase 21A: Manual Order Authorization Gate', () => {
  const originalDryRun = config.botDryRun;
  
  before(() => {
    // Force non-dry-run for testing the gate
    (config as any).botDryRun = false;
  });

  after(() => {
    (config as any).botDryRun = originalDryRun;
  });

  test('Rejects order when no approvalId is provided', async () => {
    const orderReq = { symbol: 'BTC-USDT', symbolId: 1, side: 'buy', quantity: 0.001, type: 'market' };
    const result = await polyesterSdkAdapter.submitOrder(orderReq);
    
    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /Manual authorization \(approvalId\) is required/);
  });

  test('Rejects order with invalid/non-existent approvalId', async () => {
    const orderReq = { symbol: 'BTC-USDT', symbolId: 1, side: 'buy', quantity: 0.001, type: 'market' };
    const result = await polyesterSdkAdapter.submitOrder(orderReq, 'invalid_id');
    
    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /Authorization failed: Approval not found/);
  });

  test('Successfully validates a correctly scoped approval', async () => {
    const approvalId = orderApprovalStore.createApproval({
      symbolId: 1,
      side: 'buy',
      type: 'market_ioc',
      maxQty: '0.01',
      maxNotional: 1000,
    });

    const orderReq = { symbol: 'BTC-USDT', symbolId: 1, side: 'buy', quantity: 0.001, type: 'market' };
    const result = await (polyesterSdkAdapter.submitOrder(orderReq, approvalId) as any);
    
    assert.strictEqual(result.success, true);
    assert.match(result.orderId || '', /authorized_simulation_/);
    assert.match(result.message || '', /Manual authorization verified/);
  });

  test('Rejects reuse of a one-time approval', async () => {
    const approvalId = orderApprovalStore.createApproval({
      symbolId: 1,
      side: 'buy',
      type: 'market_ioc',
      maxQty: '0.01',
      maxNotional: 1000,
    });

    const orderReq = { symbol: 'BTC-USDT', symbolId: 1, side: 'buy', quantity: 0.001, type: 'market' };
    
    // First use: success
    await polyesterSdkAdapter.submitOrder(orderReq, approvalId);
    
    // Second use: failure
    const result = await polyesterSdkAdapter.submitOrder(orderReq, approvalId);
    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /Authorization failed: Approval already used/);
  });

  test('Rejects order exceeding approved quantity', async () => {
    const approvalId = orderApprovalStore.createApproval({
      symbolId: 1,
      side: 'buy',
      type: 'market_ioc',
      maxQty: '0.001',
      maxNotional: 1000,
    });

    const orderReq = { symbol: 'BTC-USDT', symbolId: 1, side: 'buy', quantity: 0.002, type: 'market' };
    const result = await polyesterSdkAdapter.submitOrder(orderReq, approvalId);
    
    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /Quantity exceeds approved limit/);
  });

  test('Rejects order with mismatched side', async () => {
    const approvalId = orderApprovalStore.createApproval({
      symbolId: 1,
      side: 'buy',
      type: 'market_ioc',
      maxQty: '0.01',
      maxNotional: 1000,
    });

    const orderReq = { symbol: 'BTC-USDT', symbolId: 1, side: 'sell', quantity: 0.001, type: 'market' };
    const result = await polyesterSdkAdapter.submitOrder(orderReq, approvalId);
    
    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /Side mismatch/);
  });

  test('Kill switch: revoking all approvals blocks pending orders', async () => {
    const approvalId = orderApprovalStore.createApproval({
      symbolId: 1,
      side: 'buy',
      type: 'market_ioc',
      maxQty: '0.01',
      maxNotional: 1000,
    });

    orderApprovalStore.revokeAll();

    const orderReq = { symbol: 'BTC-USDT', symbolId: 1, side: 'buy', quantity: 0.001, type: 'market' };
    const result = await polyesterSdkAdapter.submitOrder(orderReq, approvalId);
    
    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /Authorization failed: Approval not found/);
  });

  test('StrategyEngine cannot bypass the gate without approvalId', async () => {
    const { executeStrategyDecision } = await import('../server/strategyEngine.js');
    
    const decision = {
      decisionId: 'test_dec',
      symbol: 'BTC-USDT',
      timestamp: new Date().toISOString(),
      action: 'buy' as const,
      compositeScore: 90,
      confidence: 90,
      explanation: [],
      agentSignals: [],
      riskApproved: true,
      proposedOrder: {
        symbol: 'BTC-USDT',
        side: 'buy' as const,
        type: 'market' as const,
        price: 50000,
        quantity: 0.001,
        clientOrderId: 'cli_test_123',
      },
      isDryRun: false,
    };

    // Force auto-trade enabled for the test
    const { updateStrategyConfig, setOperatorAuthorization } = await import('../server/strategyEngine.js');
    updateStrategyConfig({ autoTradeEnabled: true });
    setOperatorAuthorization(true);

    // Mock health check to pass readiness
    setLastHealthCheckForTesting({
      status: 'connected',
      checkedAt: new Date().toISOString(),
      targetHost: 'testnet',
      targetEndpoint: '/v1/health',
      httpStatus: 200,
      statusText: 'OK',
      contentType: 'application/json',
      latencyMs: 10,
      isCloudflareBlocked: false,
      isRateLimited: false,
      schemaValid: true,
      parsedData: {},
      errorMessage: null,
      securityNotice: 'test',
    });

    const result = await executeStrategyDecision(decision); // No approvalId passed
    
    assert.strictEqual(result.executed, false);
    assert.match(result.message || '', /Manual authorization \(approvalId\) is required/);
  });
});
