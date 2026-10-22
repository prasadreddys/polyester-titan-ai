/**
 * Phase 26 — Extended Paper-Trading Validation Tests
 * Verifies disk persistence, market data outage pause state, directional BUY vs SELL stats,
 * and N >= 100 sample size gate transition.
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  recordPaperSignal,
  evaluatePendingPaperSignals,
  getPaperTradingSummary,
  resetPaperTradingStoreForTest,
  setDataOutageState,
} from '../server/paperTradingEngine.js';
import { StrategyDecision } from '../server/strategyEngine.js';

test('Phase 26 - Market Data Outage Pause State', () => {
  resetPaperTradingStoreForTest();

  const decision: StrategyDecision = {
    decisionId: 'dec_p26_outage',
    symbol: 'BTC-USDT',
    timestamp: new Date().toISOString(),
    action: 'buy',
    compositeScore: 80,
    confidence: 80,
    explanation: ['Test buy decision during outage'],
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

  // Set outage active
  setDataOutageState(true, 'Testnet feed connection timed out');

  const record = recordPaperSignal(decision);
  assert.strictEqual(record, null); // Signal creation paused

  const summary = getPaperTradingSummary();
  assert.strictEqual(summary.dataOutagePaused, true);
  assert.strictEqual(summary.dataOutageReason, 'Testnet feed connection timed out');

  // Resume data feed
  setDataOutageState(false);
  const validRecord = recordPaperSignal(decision);
  assert.ok(validRecord);
  assert.strictEqual(getPaperTradingSummary().dataOutagePaused, false);
});

test('Phase 26 - Directional BUY vs SELL Statistics & N >= 100 Gate Transition', () => {
  resetPaperTradingStoreForTest();

  // Create 60 BUY signals and 40 SELL signals (total 100)
  for (let i = 0; i < 60; i++) {
    const buyDecision: StrategyDecision = {
      decisionId: `dec_buy_${i}`,
      symbol: i % 2 === 0 ? 'BTC-USDT' : 'ETH-USDT',
      timestamp: new Date(Date.now() - (300 - i * 2) * 60000).toISOString(),
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
          details: { price: 80000 + i },
        },
      ],
      riskApproved: true,
      isDryRun: true,
    };
    recordPaperSignal(buyDecision);
  }

  for (let i = 0; i < 40; i++) {
    const sellDecision: StrategyDecision = {
      decisionId: `dec_sell_${i}`,
      symbol: i % 2 === 0 ? 'SOL-USDT' : 'POLY-USDT',
      timestamp: new Date(Date.now() - (180 - i * 2) * 60000).toISOString(),
      action: 'sell',
      compositeScore: 75,
      confidence: 75,
      explanation: ['Sell decision'],
      agentSignals: [
        {
          agentName: 'MarketDataAgent',
          signal: 'neutral',
          confidence: 100,
          timestamp: new Date().toISOString(),
          details: { price: 200 + i },
        },
      ],
      riskApproved: true,
      isDryRun: true,
    };
    recordPaperSignal(sellDecision);
  }

  // Check state before evaluation
  let summary = getPaperTradingSummary();
  assert.strictEqual(summary.sampleSizeSufficient, false);
  assert.strictEqual(summary.winRatePercent, null); // N < 100 before evaluation

  // Evaluate all 100 signals with price maps
  const priceMap = new Map<string, number>([
    ['BTC-USDT', 81600], // Favorable for BUY
    ['ETH-USDT', 81600], // Favorable for BUY
    ['SOL-USDT', 180],   // Favorable for SELL
    ['POLY-USDT', 180],  // Favorable for SELL
  ]);

  evaluatePendingPaperSignals(priceMap);

  summary = getPaperTradingSummary();
  assert.ok(summary.completedSignalsCount >= 100);
  assert.strictEqual(summary.sampleSizeSufficient, true);
  assert.notStrictEqual(summary.winRatePercent, null); // Unlocked numerical win rate!
  assert.ok(typeof summary.winRatePercent === 'number');

  // Verify directional breakdown presence
  assert.ok(summary.buyStats);
  assert.ok(summary.sellStats);
  assert.ok(summary.buyStats.totalCount > 0);
  assert.ok(summary.sellStats.totalCount > 0);
  assert.notStrictEqual(summary.buyStats.winRatePercent, null);
  assert.notStrictEqual(summary.sellStats.winRatePercent, null);
  assert.strictEqual(summary.watermark, 'PAPER / HYPOTHETICAL SIMULATION ONLY');
});
