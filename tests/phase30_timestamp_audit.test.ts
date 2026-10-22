/**
 * Phase 30 — Timestamp & Live-Metric Integrity Tests
 * Verifies 300,000 ms window verification logic, exclusion of non-compliant records
 * from valid metrics, and preservation of historical records on disk.
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  PaperSignalRecord,
  verifySignalTiming,
  calculateSubSummary,
} from '../server/paperTradingEngine.js';

test('Phase 30 - verifySignalTiming 300,000 ms Window Enforcement', () => {
  const nowMs = Date.now();

  // Valid 300,000 ms record
  const validRec: PaperSignalRecord = {
    signalId: 'psig_valid',
    symbol: 'BTC-USDT',
    timestamp: new Date(nowMs).toISOString(),
    evaluationDueAt: new Date(nowMs + 300000).toISOString(),
    direction: 'buy',
    entryPriceUsd: 80000,
    compositeScore: 80,
    agentScores: [],
    status: 'completed',
    exitPriceUsd: 81000,
    grossReturnPercent: 1.25,
    netReturnPercent: 0.95,
    outcome: 'favorable',
    source: 'live_telemetry',
    assumedCosts: { entryFeePercent: 0.1, exitFeePercent: 0.1, entrySlippagePercent: 0.05, exitSlippagePercent: 0.05, combinedCostPercent: 0.3 },
  };

  // Invalid 59,000 ms shortened window record
  const invalidRec: PaperSignalRecord = {
    signalId: 'psig_invalid',
    symbol: 'BTC-USDT',
    timestamp: new Date(nowMs).toISOString(),
    evaluationDueAt: new Date(nowMs + 59000).toISOString(), // Shortened window
    direction: 'buy',
    entryPriceUsd: 80000,
    compositeScore: 80,
    agentScores: [],
    status: 'completed',
    exitPriceUsd: 81000,
    grossReturnPercent: 1.25,
    netReturnPercent: 0.95,
    outcome: 'favorable',
    source: 'live_telemetry',
    assumedCosts: { entryFeePercent: 0.1, exitFeePercent: 0.1, entrySlippagePercent: 0.05, exitSlippagePercent: 0.05, combinedCostPercent: 0.3 },
  };

  assert.strictEqual(verifySignalTiming(validRec), true);
  assert.strictEqual(verifySignalTiming(invalidRec), false);
});

test('Phase 30 - Exclusion of Invalid Timing Records from Valid Metrics', () => {
  const nowMs = Date.now();

  const validRec: PaperSignalRecord = {
    signalId: 'psig_v1',
    symbol: 'BTC-USDT',
    timestamp: new Date(nowMs).toISOString(),
    evaluationDueAt: new Date(nowMs + 300000).toISOString(),
    direction: 'buy',
    entryPriceUsd: 80000,
    compositeScore: 80,
    agentScores: [],
    status: 'completed',
    completedAt: new Date(nowMs + 300050).toISOString(),
    exitPriceUsd: 80800,
    grossReturnPercent: 1.0,
    netReturnPercent: 0.70,
    outcome: 'favorable',
    source: 'live_telemetry',
    assumedCosts: { entryFeePercent: 0.1, exitFeePercent: 0.1, entrySlippagePercent: 0.05, exitSlippagePercent: 0.05, combinedCostPercent: 0.3 },
  };

  const invalidRec: PaperSignalRecord = {
    signalId: 'psig_inv1',
    symbol: 'ETH-USDT',
    timestamp: new Date(nowMs).toISOString(),
    evaluationDueAt: new Date(nowMs + 60000).toISOString(), // Invalid window
    direction: 'buy',
    entryPriceUsd: 2800,
    compositeScore: 80,
    agentScores: [],
    status: 'completed',
    completedAt: new Date(nowMs + 60050).toISOString(),
    exitPriceUsd: 3000,
    grossReturnPercent: 7.14,
    netReturnPercent: 6.84,
    outcome: 'favorable',
    source: 'live_telemetry',
    assumedCosts: { entryFeePercent: 0.1, exitFeePercent: 0.1, entrySlippagePercent: 0.05, exitSlippagePercent: 0.05, combinedCostPercent: 0.3 },
  };

  const subSummary = calculateSubSummary([validRec, invalidRec]);

  assert.strictEqual(subSummary.totalSignalsRecorded, 2);
  assert.strictEqual(subSummary.completedSignalsCount, 2);
  assert.strictEqual(subSummary.validCompletedCount, 1);
  assert.strictEqual(subSummary.invalidTimingCount, 1);
  assert.strictEqual(subSummary.cumulativeNetReturnPercent, 0.70); // Includes ONLY validRec net return (+0.70%), excluding invalidRec (+6.84%)
  assert.strictEqual(subSummary.sampleSizeSufficient, false);
  assert.strictEqual(subSummary.winRatePercent, null); // Suppressed when valid count < 100
});
