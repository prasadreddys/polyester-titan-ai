/**
 * Phase 22 — Multi-Agent Strategy Validation Tests
 * Verifies multi-agent signals, conflicting signal detection, stale data rejection,
 * risk governor limit enforcement, duplicate signal suppression, and signal evaluation.
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  coordinateStrategy,
  evaluateRiskGovernor,
  evaluateSignalOutcome,
  resetStrategyStateForTest,
  getStrategyConfig,
  updateStrategyConfig,
  runMarketDataAgent,
  runTrendAgent,
  runMomentumAgent,
  runVolatilityAgent,
  runMarketQualityAgent,
  setMarketDataProviderForTesting,
  StrategyDecision,
} from '../server/strategyEngine.js';
import { setLastHealthCheckForTesting } from '../server/polyesterClient.js';

const verifiedBtcMarket = {
  markets: [{
    symbol: 'BTC-USDT',
    lastPrice: 80000,
    minOrderSize: 0.001,
    upstreamTimestamp: new Date().toISOString(),
  }],
  source: 'test fixture',
  status: 'verified' as const,
  message: 'Controlled test fixture',
};

test('Phase 22 - Multi-Agent Signal Generation in Signal-Only Mode', async (t) => {
  setMarketDataProviderForTesting(async () => verifiedBtcMarket);
  t.after(() => setMarketDataProviderForTesting());
  resetStrategyStateForTest();
  setLastHealthCheckForTesting({
    status: 'connected',
    checkedAt: new Date().toISOString(),
    targetHost: 'https://api.testnet.polyester.com',
    targetEndpoint: '/v1/health',
    httpStatus: 200,
    statusText: 'OK',
    contentType: 'application/json',
    latencyMs: 15,
    isCloudflareBlocked: false,
    isRateLimited: false,
    schemaValid: true,
    parsedData: { status: 'healthy' },
    errorMessage: null,
    securityNotice: 'Testnet mode locked',
  });

  const decision = await coordinateStrategy('BTC-USDT');
  assert.ok(decision.decisionId.startsWith('dec_'));
  assert.strictEqual(decision.symbol, 'BTC-USDT');
  assert.strictEqual(decision.isDryRun, true);
  assert.ok(Array.isArray(decision.agentSignals));
  assert.strictEqual(decision.agentSignals.length, 5);

  // Verify execution assumptions are included
  assert.ok(decision.executionAssumptions);
  assert.strictEqual(decision.executionAssumptions?.makerFeePercent, 0.1);
  assert.strictEqual(decision.executionAssumptions?.takerFeePercent, 0.1);
  assert.ok(decision.executionAssumptions?.disclaimer.includes('Zero exchange orders submitted'));
});

test('Phase 22 - Stale Market Data Feed Rejection (Fail Closed)', async (t) => {
  setMarketDataProviderForTesting(async () => ({
    ...verifiedBtcMarket,
    markets: [{
      ...verifiedBtcMarket.markets[0],
      upstreamTimestamp: new Date(Date.now() - 60_000).toISOString(),
    }],
  }));
  t.after(() => setMarketDataProviderForTesting());
  resetStrategyStateForTest();
  updateStrategyConfig({ maxDataAgeSeconds: 0 }); // 0s forces data staleness check to fail

  const mdSignal = await runMarketDataAgent('BTC-USDT');
  assert.strictEqual(mdSignal.signal, 'reject');
  assert.ok((mdSignal.details as any).error.includes('stale'));
});

test('Phase 22 - Missing verified prices are rejected instead of substituted', async (t) => {
  setMarketDataProviderForTesting(async () => ({
    ...verifiedBtcMarket,
    markets: [{ symbol: 'BTC-USDT', minOrderSize: 0.001 }],
  }));
  t.after(() => setMarketDataProviderForTesting());
  resetStrategyStateForTest();

  const decision = await coordinateStrategy('BTC-USDT');
  assert.equal(decision.action, 'hold');
  assert.equal(decision.agentSignals.length, 1);
  assert.equal(decision.agentSignals[0].agentName, 'MarketDataAgent');
  assert.equal(decision.agentSignals[0].signal, 'reject');
});

test('Phase 22 - Risk Governor Enforces Maximum Order Quote Limit', async () => {
  resetStrategyStateForTest();
  updateStrategyConfig({ maxOrderQuoteUsd: 100 }); // Low limit

  const decision: StrategyDecision = {
    decisionId: 'dec_test_overlimit',
    symbol: 'BTC-USDT',
    timestamp: new Date().toISOString(),
    action: 'buy',
    compositeScore: 80,
    confidence: 80,
    explanation: ['Test decision over limit'],
    agentSignals: [],
    riskApproved: false,
    proposedOrder: {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 80000,
      quantity: 0.01, // Notional $800 > max $100
      clientOrderId: 'cli_overlimit',
    },
    isDryRun: true,
  };

  const riskResult = evaluateRiskGovernor(decision);
  assert.strictEqual(riskResult.approved, false);
  assert.ok(riskResult.reason.includes('exceeds'));
});

test('Phase 22 - Risk Governor Suppresses Duplicate Signals Within Window', async () => {
  resetStrategyStateForTest();

  const decision: StrategyDecision = {
    decisionId: 'dec_test_dup',
    symbol: 'BTC-USDT',
    timestamp: new Date().toISOString(),
    action: 'buy',
    compositeScore: 85,
    confidence: 85,
    explanation: ['Test decision duplicate'],
    agentSignals: [],
    isDuplicateSignal: true,
    riskApproved: false,
    proposedOrder: {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 80000,
      quantity: 0.001,
      clientOrderId: 'cli_dup',
    },
    isDryRun: true,
  };

  const riskResult = evaluateRiskGovernor(decision);
  assert.strictEqual(riskResult.approved, false);
  assert.ok(riskResult.reason.includes('Duplicate signal suppressed'));
});

test('Phase 22 - Signal Outcome Evaluation (Hypothetical Movement)', async () => {
  resetStrategyStateForTest();

  const decision: StrategyDecision = {
    decisionId: 'dec_test_eval',
    symbol: 'BTC-USDT',
    timestamp: new Date().toISOString(),
    action: 'buy',
    compositeScore: 80,
    confidence: 80,
    explanation: ['Test evaluation decision'],
    agentSignals: [
      {
        agentName: 'MarketDataAgent',
        signal: 'neutral',
        confidence: 100,
        timestamp: new Date().toISOString(),
        details: { price: 80000 },
      },
    ],
    riskApproved: true,
    proposedOrder: {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 80000,
      quantity: 0.001,
      clientOrderId: 'cli_eval',
    },
    isDryRun: true,
  };

  // Evaluate against subsequent higher price ($81,000)
  const evalOutcome = evaluateSignalOutcome(decision, 81000);
  assert.strictEqual(evalOutcome.signalOutcome, 'favorable_movement');
  assert.strictEqual(evalOutcome.priceDeltaUsd, 1000);
  assert.strictEqual(evalOutcome.evaluationType, 'HYPOTHETICAL_SIGNAL_OBSERVATION');
  assert.ok(evalOutcome.disclaimer.includes('Zero real or simulated order fills claimed'));
});

test('Phase 22 - Disarmament Verification (botAutoTradeEnabled = false)', async () => {
  resetStrategyStateForTest();
  const cfg = getStrategyConfig();
  assert.strictEqual(cfg.autoTradeEnabled, false);
  assert.strictEqual(cfg.dryRun, true);
});
