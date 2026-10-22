/**
 * Phase 28 — Live-Data Paper Observation Tests
 * Verifies live telemetry sub-summary calculation isolation,
 * sample size gate enforcement for live telemetry (N_live < 100 -> null win rate),
 * and distinction from simulation script records.
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

test('Phase 28 - Isolated Live Telemetry Sub-Summary & N_live < 100 Gate Enforcement', () => {
  resetPaperTradingStoreForTest();

  // Create 10 Live Telemetry signals spaced 5 minutes apart
  for (let i = 0; i < 10; i++) {
    const liveDecision: StrategyDecision = {
      decisionId: `dec_live_${i}`,
      symbol: i % 2 === 0 ? 'BTC-USDT' : 'SOL-USDT',
      timestamp: new Date(Date.now() - (300 - i * 10) * 60000).toISOString(),
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
          details: { price: 80000 + i },
        },
      ],
      riskApproved: true,
      isDryRun: true,
    };
    recordPaperSignal(liveDecision, 'live_telemetry');
  }

  // Create 110 Simulation Script signals
  for (let i = 0; i < 110; i++) {
    const simDecision: StrategyDecision = {
      decisionId: `dec_sim_${i}`,
      symbol: 'ETH-USDT',
      timestamp: new Date(Date.now() - (200 - i) * 60000).toISOString(),
      action: 'sell',
      compositeScore: 75,
      confidence: 75,
      explanation: ['Sim signal'],
      agentSignals: [
        {
          agentName: 'MarketDataAgent',
          signal: 'neutral',
          confidence: 100,
          timestamp: new Date().toISOString(),
          details: { price: 2800 + i },
        },
      ],
      riskApproved: true,
      isDryRun: true,
    };
    recordPaperSignal(simDecision, 'simulation_script');
  }

  // Evaluate all
  evaluatePendingPaperSignals(new Map([
    ['BTC-USDT', 81000],
    ['SOL-USDT', 180],
    ['ETH-USDT', 2700],
  ]));

  const summary = getPaperTradingSummary();

  // A. Verify Live Telemetry Stream Isolation
  assert.strictEqual(summary.liveTelemetrySignalCount, 10);
  assert.strictEqual(summary.liveTelemetrySummary.completedSignalsCount, 10);
  assert.strictEqual(summary.liveTelemetrySummary.sampleSizeSufficient, false); // N_live = 10 < 100
  assert.strictEqual(summary.liveTelemetrySummary.winRatePercent, null); // Win rate SUPPRESSED for live telemetry!

  // B. Verify Simulation Script Stream Isolation
  assert.strictEqual(summary.simulationScriptSignalCount, 110);
  assert.strictEqual(summary.simulationScriptSummary.completedSignalsCount, 110);
  assert.strictEqual(summary.simulationScriptSummary.sampleSizeSufficient, true); // N_sim = 110 >= 100
  assert.notStrictEqual(summary.simulationScriptSummary.winRatePercent, null); // Win rate unlocked for sim!

  // C. Verify Combined
  assert.strictEqual(summary.totalSignalsRecorded, 120);
  assert.strictEqual(summary.watermark, 'PAPER / HYPOTHETICAL SIMULATION ONLY');
});
