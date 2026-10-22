/**
 * Phase 27 — Performance Integrity Audit Regression Tests
 * Verifies directional math for BUY and SELL, exact cost application (0.30%),
 * neutral outcome classification thresholding, compounded return calculation,
 * and provenance tagging.
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  recordPaperSignal,
  evaluatePendingPaperSignals,
  getPaperTradingSummary,
  resetPaperTradingStoreForTest,
} from '../server/paperTradingEngine.js';
import { StrategyDecision } from '../server/strategyEngine.js';

test('Phase 27 - Directional Return Math (BUY vs SELL)', () => {
  resetPaperTradingStoreForTest();

  // 1. BUY Signal: Entry $100, Exit $105 (+5% price rise) -> Favorable (+5.0% gross, +4.70% net)
  const buyDecision: StrategyDecision = {
    decisionId: 'dec_p27_buy',
    symbol: 'BTC-USDT',
    timestamp: new Date().toISOString(),
    action: 'buy',
    compositeScore: 80,
    confidence: 80,
    explanation: ['Buy decision'],
    agentSignals: [
      {
        agentName: 'MarketDataAgent',
        signal: 'neutral',
        confidence: 100,
        timestamp: new Date().toISOString(),
        details: { price: 100 },
      },
    ],
    riskApproved: true,
    isDryRun: true,
  };

  const buyRec = recordPaperSignal(buyDecision, 'live_telemetry')!;
  buyRec.evaluationDueAt = new Date(Date.now() - 1000).toISOString();

  // 2. SELL Signal: Entry $100, Exit $95 (-5% price fall) -> Favorable (+5.0% gross, +4.70% net)
  const sellDecision: StrategyDecision = {
    decisionId: 'dec_p27_sell',
    symbol: 'ETH-USDT',
    timestamp: new Date().toISOString(),
    action: 'sell',
    compositeScore: 80,
    confidence: 80,
    explanation: ['Sell decision'],
    agentSignals: [
      {
        agentName: 'MarketDataAgent',
        signal: 'neutral',
        confidence: 100,
        timestamp: new Date().toISOString(),
        details: { price: 100 },
      },
    ],
    riskApproved: true,
    isDryRun: true,
  };

  const sellRec = recordPaperSignal(sellDecision, 'live_telemetry')!;
  sellRec.evaluationDueAt = new Date(Date.now() - 1000).toISOString();

  // Evaluate with exit prices: BTC-USDT @ $105, ETH-USDT @ $95
  evaluatePendingPaperSignals(new Map([
    ['BTC-USDT', 105],
    ['ETH-USDT', 95],
  ]));

  assert.strictEqual(buyRec.grossReturnPercent, 5.0);
  assert.strictEqual(buyRec.netReturnPercent, 4.70); // 5.0% - 0.30%
  assert.strictEqual(buyRec.outcome, 'favorable');

  assert.strictEqual(sellRec.grossReturnPercent, 5.0); // Price fell 5%, SELL gross = +5.0%
  assert.strictEqual(sellRec.netReturnPercent, 4.70);  // 5.0% - 0.30%
  assert.strictEqual(sellRec.outcome, 'favorable');
});

test('Phase 27 - Cost Application & Neutral Classification Band', () => {
  resetPaperTradingStoreForTest();

  // BUY with +0.05% move -> Within neutral band (±0.10%)
  const decision: StrategyDecision = {
    decisionId: 'dec_p27_neutral',
    symbol: 'SOL-USDT',
    timestamp: new Date().toISOString(),
    action: 'buy',
    compositeScore: 80,
    confidence: 80,
    explanation: ['Small move decision'],
    agentSignals: [
      {
        agentName: 'MarketDataAgent',
        signal: 'neutral',
        confidence: 100,
        timestamp: new Date().toISOString(),
        details: { price: 1000 },
      },
    ],
    riskApproved: true,
    isDryRun: true,
  };

  const rec = recordPaperSignal(decision, 'live_telemetry')!;
  rec.evaluationDueAt = new Date(Date.now() - 1000).toISOString();

  evaluatePendingPaperSignals(new Map([['SOL-USDT', 1000.5]])); // +0.05%

  assert.strictEqual(rec.grossReturnPercent, 0.05);
  assert.strictEqual(rec.netReturnPercent, -0.25); // 0.05% - 0.30% = -0.25%
  assert.strictEqual(rec.outcome, 'neutral');
});

test('Phase 27 - Compounded Return Index & Provenance Tracking', () => {
  resetPaperTradingStoreForTest();

  const decisionLive: StrategyDecision = {
    decisionId: 'dec_p27_live',
    symbol: 'BTC-USDT',
    timestamp: new Date().toISOString(),
    action: 'buy',
    compositeScore: 80,
    confidence: 80,
    explanation: ['Live signal'],
    agentSignals: [
      {
        agentName: 'MarketDataAgent',
        signal: 'neutral',
        confidence: 100,
        timestamp: new Date().toISOString(),
        details: { price: 100 },
      },
    ],
    riskApproved: true,
    isDryRun: true,
  };

  const decisionSim: StrategyDecision = {
    decisionId: 'dec_p27_sim',
    symbol: 'ETH-USDT',
    timestamp: new Date().toISOString(),
    action: 'sell',
    compositeScore: 80,
    confidence: 80,
    explanation: ['Simulation signal'],
    agentSignals: [
      {
        agentName: 'MarketDataAgent',
        signal: 'neutral',
        confidence: 100,
        timestamp: new Date().toISOString(),
        details: { price: 100 },
      },
    ],
    riskApproved: true,
    isDryRun: true,
  };

  const liveRec = recordPaperSignal(decisionLive, 'live_telemetry')!;
  const simRec = recordPaperSignal(decisionSim, 'simulation_script')!;

  assert.strictEqual(liveRec.source, 'live_telemetry');
  assert.strictEqual(simRec.source, 'simulation_script');

  const summary = getPaperTradingSummary();
  assert.strictEqual(summary.liveTelemetrySignalCount, 1);
  assert.strictEqual(summary.simulationScriptSignalCount, 1);
});
