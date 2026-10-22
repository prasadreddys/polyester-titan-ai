/**
 * Phase 23 — Strategy Integrity, Position Sizing & Risk Calibration Tests
 * Verifies risk-state disambiguation, fee reserve position sizing, symbol-specific calculations,
 * scoring model documentation, and aggregate evaluation disclaimers.
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  coordinateStrategy,
  evaluateRiskGovernor,
  resetStrategyStateForTest,
  getStrategyConfig,
  updateStrategyConfig,
  getScoringModelDocumentation,
  runTrendAgent,
  runMomentumAgent,
  runMarketQualityAgent,
  clearSymbolPriceHistoryForTesting,
  StrategyDecision,
} from '../server/strategyEngine.js';
import { setLastHealthCheckForTesting } from '../server/polyesterClient.js';
import { setEmergencyKillSwitchState } from '../server/orderManager.js';

test('Phase 23 - Disambiguates Emergency Kill Switch vs API Disconnect', async () => {
  resetStrategyStateForTest();
  setEmergencyKillSwitchState(false);

  // Set health check to connected
  setLastHealthCheckForTesting({
    status: 'connected',
    checkedAt: new Date().toISOString(),
    targetHost: 'https://api.testnet.polyester.com',
    targetEndpoint: '/v1/health',
    httpStatus: 200,
    statusText: 'OK',
    contentType: 'application/json',
    latencyMs: 12,
    isCloudflareBlocked: false,
    isRateLimited: false,
    schemaValid: true,
    parsedData: { status: 'ok' },
    errorMessage: null,
    securityNotice: 'Testnet mode locked',
  });

  const decision: StrategyDecision = {
    decisionId: 'dec_ks_test',
    symbol: 'BTC-USDT',
    timestamp: new Date().toISOString(),
    action: 'buy',
    compositeScore: 80,
    confidence: 80,
    explanation: ['Test decision'],
    agentSignals: [],
    riskApproved: false,
    proposedOrder: {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 78000,
      quantity: 0.001,
      clientOrderId: 'cli_ks_test',
    },
    isDryRun: true,
  };

  // Case A: Active Emergency Kill Switch
  setEmergencyKillSwitchState(true);
  const resA = evaluateRiskGovernor(decision);
  assert.strictEqual(resA.approved, false);
  assert.ok(resA.reason.includes('Emergency Kill Switch is ACTIVE'));

  // Case B: Inactive Emergency Kill Switch, Disconnected Gateway
  setEmergencyKillSwitchState(false);
  setLastHealthCheckForTesting({
    status: 'disconnected',
    checkedAt: new Date().toISOString(),
    targetHost: 'https://api.testnet.polyester.com',
    targetEndpoint: '/v1/health',
    httpStatus: null,
    statusText: null,
    contentType: null,
    latencyMs: 0,
    isCloudflareBlocked: false,
    isRateLimited: false,
    schemaValid: false,
    parsedData: null,
    errorMessage: 'Disconnected',
    securityNotice: 'Testnet mode locked',
  });

  const resB = evaluateRiskGovernor(decision);
  assert.strictEqual(resB.approved, false);
  assert.ok(resB.reason.includes('API Gateway is disconnected'));
});

test('Phase 23 - Fee Reserves & Position Sizing Rejection ($500 Notional vs Available Balance)', async () => {
  resetStrategyStateForTest();
  setEmergencyKillSwitchState(false);
  setLastHealthCheckForTesting({
    status: 'connected',
    checkedAt: new Date().toISOString(),
    targetHost: 'https://api.testnet.polyester.com',
    targetEndpoint: '/v1/health',
    httpStatus: 200,
    statusText: 'OK',
    contentType: 'application/json',
    latencyMs: 12,
    isCloudflareBlocked: false,
    isRateLimited: false,
    schemaValid: true,
    parsedData: { status: 'ok' },
    errorMessage: null,
    securityNotice: 'Testnet mode locked',
  });

  // Propose $500 notional when available balance is $200 (or $279.24)
  const decision: StrategyDecision = {
    decisionId: 'dec_sizing_test',
    symbol: 'BTC-USDT',
    timestamp: new Date().toISOString(),
    action: 'buy',
    compositeScore: 80,
    confidence: 80,
    explanation: ['Test proposed sizing'],
    agentSignals: [],
    riskApproved: false,
    proposedOrder: {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      price: 78678.76,
      quantity: 0.006355, // $500 notional
      clientOrderId: 'cli_size_test',
    },
    isDryRun: true,
  };

  const riskRes = evaluateRiskGovernor(decision);
  assert.strictEqual(riskRes.approved, false);
  // Verify order is rejected without auto-reducing quantity
  assert.strictEqual(decision.proposedOrder?.quantity, 0.006355); // Quantity remains unchanged
  assert.ok(riskRes.reason.includes('exceeds') || riskRes.reason.includes('Insufficient available funds'));
});

test('Phase 23 - Dynamic Symbol-Specific Indicator Scores (No Identical Defaults)', async () => {
  clearSymbolPriceHistoryForTesting();

  // Feed distinct price trajectories for BTC and ETH
  await runTrendAgent('BTC-USDT', 75000);
  await runTrendAgent('BTC-USDT', 78000); // Upward trend
  const btcTrend = await runTrendAgent('BTC-USDT', 80000);

  await runTrendAgent('ETH-USDT', 3000);
  await runTrendAgent('ETH-USDT', 2900); // Downward trend
  const ethTrend = await runTrendAgent('ETH-USDT', 2800);

  // Compare signals and details
  assert.strictEqual(btcTrend.signal, 'buy');
  assert.strictEqual(ethTrend.signal, 'sell');
  assert.notStrictEqual((btcTrend.details as any).deltaPct, (ethTrend.details as any).deltaPct);
});

test('Phase 23 - Scoring Model Documentation & REST Depth Cap', async () => {
  const modelDoc = getScoringModelDocumentation();
  assert.strictEqual(modelDoc.agents.length, 5);
  assert.strictEqual(modelDoc.conflictPenalty, -15);
  assert.ok(modelDoc.disclaimer.includes('heuristic signal decision rules'));

  const qualSignal = await runMarketQualityAgent('BTC-USDT');
  assert.strictEqual(qualSignal.confidence, 60); // Capped at 60 due to REST depth limitation
  assert.strictEqual((qualSignal.details as any).orderBookDepthStatus, 'UNAVAILABLE_REST_MODE');
});

test('Phase 23 - HOLD Action is Not Counted as Rejected Trade Signal', async () => {
  resetStrategyStateForTest();
  setEmergencyKillSwitchState(false);
  setLastHealthCheckForTesting({
    status: 'connected',
    checkedAt: new Date().toISOString(),
    targetHost: 'https://api.testnet.polyester.com',
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
    securityNotice: 'Testnet mode locked',
  });

  const holdDecision: StrategyDecision = {
    decisionId: 'dec_hold_test',
    symbol: 'BTC-USDT',
    timestamp: new Date().toISOString(),
    action: 'hold',
    compositeScore: 50,
    confidence: 50,
    explanation: ['Composite score below threshold'],
    agentSignals: [],
    riskApproved: false,
    isDryRun: true,
  };

  const riskRes = evaluateRiskGovernor(holdDecision);
  assert.strictEqual(riskRes.approved, true);
  assert.ok(riskRes.reason.includes('No trade action proposed (HOLD)'));
});
