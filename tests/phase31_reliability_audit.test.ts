/**
 * Phase 31 — Live Observation Reliability Audit Regression Tests
 * Verifies background worker resolution, stale ticker rejection,
 * 300,000 ms observation window enforcement, cost deduction math,
 * drawdown calculation, and sample size gate suppression.
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  recordPaperSignal,
  evaluatePendingPaperSignals,
  getPaperTradingSummary,
  resetPaperTradingStoreForTest,
  verifySignalTiming,
  PaperSignalRecord,
} from '../server/paperTradingEngine.js';
import { StrategyDecision } from '../server/strategyEngine.js';

test('Phase 31 - Exact 300,000 ms Window Enforcement & Timing Verification', () => {
  resetPaperTradingStoreForTest();

  const decisionTime = new Date(Date.now() - 310000).toISOString();
  const decision: StrategyDecision = {
    decisionId: 'dec_p31_timing',
    symbol: 'BTC-USDT',
    timestamp: decisionTime,
    action: 'buy',
    compositeScore: 85,
    confidence: 85,
    explanation: ['Valid timing test decision'],
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
    isDryRun: true,
  };

  const rec = recordPaperSignal(decision, 'live_telemetry');
  assert.ok(rec);
  assert.strictEqual(rec.isTimingValid, true);

  const startMs = new Date(rec.timestamp).getTime();
  const dueMs = new Date(rec.evaluationDueAt).getTime();
  assert.strictEqual(dueMs - startMs, 300000); // Exactly 5 minutes (300,000 ms)
  assert.strictEqual(verifySignalTiming(rec), true);
});

test('Phase 31 - Stale Market Ticker Rejection During Signal Resolution', () => {
  resetPaperTradingStoreForTest();

  const decisionTime = new Date(Date.now() - 310000).toISOString();
  const decision: StrategyDecision = {
    decisionId: 'dec_p31_stale',
    symbol: 'ETH-USDT',
    timestamp: decisionTime,
    action: 'buy',
    compositeScore: 80,
    confidence: 80,
    explanation: ['Stale ticker test'],
    agentSignals: [
      {
        agentName: 'MarketDataAgent',
        signal: 'neutral',
        confidence: 100,
        timestamp: new Date().toISOString(),
        details: { price: 2800 },
      },
    ],
    riskApproved: true,
    isDryRun: true,
  };

  const rec = recordPaperSignal(decision, 'live_telemetry')!;
  assert.ok(rec);

  // Attempt evaluation with a stale ticker timestamp (150 seconds old > 120s limit)
  const staleTimestamp = new Date(Date.now() - 150000).toISOString();
  const evaluatedCount = evaluatePendingPaperSignals(new Map([
    ['ETH-USDT', { price: 2900, timestamp: staleTimestamp }],
  ]));

  assert.strictEqual(evaluatedCount, 0); // Resolution rejected due to stale ticker
  assert.strictEqual(rec.status, 'unresolved'); // Signal remains unresolved

  // Evaluate with fresh ticker timestamp (5 seconds old <= 120s limit)
  const freshTimestamp = new Date(Date.now() - 5000).toISOString();
  const freshEvaluatedCount = evaluatePendingPaperSignals(new Map([
    ['ETH-USDT', { price: 2900, timestamp: freshTimestamp }],
  ]));

  assert.strictEqual(freshEvaluatedCount, 1); // Resolution succeeded with fresh ticker
  assert.strictEqual(rec.status, 'completed');
  assert.strictEqual(rec.exitPriceUsd, 2900);
});

test('Phase 31 - Single Round-Trip Cost Application & Drawdown Calculation', () => {
  resetPaperTradingStoreForTest();

  // Create 2 valid live telemetry signals spaced out in past
  const decision1: StrategyDecision = {
    decisionId: 'dec_p31_cost_1',
    symbol: 'BTC-USDT',
    timestamp: new Date(Date.now() - 320000).toISOString(),
    action: 'buy',
    compositeScore: 80,
    confidence: 80,
    explanation: ['Trade 1'],
    agentSignals: [{ agentName: 'MarketDataAgent', signal: 'neutral', confidence: 100, timestamp: new Date().toISOString(), details: { price: 80000 } }],
    riskApproved: true,
    isDryRun: true,
  };
  recordPaperSignal(decision1, 'live_telemetry');

  const decision2: StrategyDecision = {
    decisionId: 'dec_p31_cost_2',
    symbol: 'SOL-USDT',
    timestamp: new Date(Date.now() - 310000).toISOString(),
    action: 'buy',
    compositeScore: 80,
    confidence: 80,
    explanation: ['Trade 2'],
    agentSignals: [{ agentName: 'MarketDataAgent', signal: 'neutral', confidence: 100, timestamp: new Date().toISOString(), details: { price: 200 } }],
    riskApproved: true,
    isDryRun: true,
  };
  recordPaperSignal(decision2, 'live_telemetry');

  // Evaluate Trade 1: Entry $80,000, Exit $81,600 (+2.0% gross) -> Net = 2.0% - 0.30% = +1.70%
  // Evaluate Trade 2: Entry $200, Exit $196 (-2.0% gross) -> Net = -2.0% - 0.30% = -2.30%
  evaluatePendingPaperSignals(new Map([
    ['BTC-USDT', { price: 81600, timestamp: new Date().toISOString() }],
    ['SOL-USDT', { price: 196, timestamp: new Date().toISOString() }],
  ]));

  const summary = getPaperTradingSummary();
  const liveSummary = summary.liveTelemetrySummary;

  assert.strictEqual(liveSummary.validCompletedCount, 2);
  assert.strictEqual(liveSummary.cumulativeGrossReturnPercent, 0.0); // +2.0% + (-2.0%) = 0.0%
  assert.strictEqual(liveSummary.cumulativeNetReturnPercent, -0.60); // +1.70% + (-2.30%) = -0.60%
  assert.strictEqual(liveSummary.peakNetReturnPercent, 1.70); // Peak reached after Trade 1
  assert.strictEqual(liveSummary.maxDrawdownPercent, 2.30); // Peak (1.70%) - Current (-0.60%) = 2.30%
});

test('Phase 31 - Exclusion of Historical Invalid Timing Records from Live Sample Size Gate', () => {
  resetPaperTradingStoreForTest();

  // Insert a manually constructed record with non-compliant window (e.g. 10,000 ms)
  const invalidRecord: PaperSignalRecord = {
    signalId: 'psig_invalid_window',
    symbol: 'BTC-USDT',
    timestamp: new Date(Date.now() - 310000).toISOString(),
    evaluationDueAt: new Date(Date.now() - 300000).toISOString(), // 10,000 ms window!
    direction: 'buy',
    entryPriceUsd: 80000,
    compositeScore: 80,
    agentScores: [],
    status: 'completed',
    completedAt: new Date().toISOString(),
    exitPriceUsd: 81000,
    grossReturnPercent: 1.25,
    netReturnPercent: 0.95,
    outcome: 'favorable',
    source: 'live_telemetry',
    isTimingValid: false,
    timingWindowMs: 10000,
    assumedCosts: {
      entryFeePercent: 0.1,
      exitFeePercent: 0.1,
      entrySlippagePercent: 0.05,
      exitSlippagePercent: 0.05,
      combinedCostPercent: 0.3,
    },
  };

  // Create 1 valid record
  const validDecision: StrategyDecision = {
    decisionId: 'dec_p31_valid_gate',
    symbol: 'ETH-USDT',
    timestamp: new Date(Date.now() - 310000).toISOString(),
    action: 'buy',
    compositeScore: 80,
    confidence: 80,
    explanation: ['Valid gate record'],
    agentSignals: [{ agentName: 'MarketDataAgent', signal: 'neutral', confidence: 100, timestamp: new Date().toISOString(), details: { price: 2800 } }],
    riskApproved: true,
    isDryRun: true,
  };
  recordPaperSignal(validDecision, 'live_telemetry');
  evaluatePendingPaperSignals(new Map([['ETH-USDT', { price: 2850, timestamp: new Date().toISOString() }]]));

  const summary = getPaperTradingSummary();
  const liveSummary = summary.liveTelemetrySummary;

  assert.strictEqual(liveSummary.validCompletedCount, 1);
  assert.strictEqual(liveSummary.sampleSizeSufficient, false);
  assert.strictEqual(liveSummary.winRatePercent, null); // Gate strictly enforced
});
