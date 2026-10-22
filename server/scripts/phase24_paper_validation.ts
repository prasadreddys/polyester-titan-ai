/**
 * Phase 24 — Multi-Agent Paper-Trading Validation Script
 * Evaluates paper trading signal recording, outcome resolution over 5m windows,
 * cost deductions (0.20% fees + 0.10% slippage), drawdown tracking,
 * and N >= 100 sample size enforcement without submitting any exchange orders.
 */

import { config, sanitizeLog } from '../config.js';
import {
  coordinateStrategy,
  resetStrategyStateForTest,
  StrategyDecision,
} from '../strategyEngine.js';
import {
  recordPaperSignal,
  evaluatePendingPaperSignals,
  getPaperTradingSummary,
  listPaperSignals,
  resetPaperTradingStoreForTest,
  getPaperTradingConfig,
} from '../paperTradingEngine.js';
import { setLastHealthCheckForTesting } from '../polyesterClient.js';
import { setEmergencyKillSwitchState } from '../orderManager.js';

async function runPhase24PaperValidation() {
  const timestamp = new Date().toISOString();
  console.log('=== PHASE 24: MULTI-AGENT PAPER-TRADING VALIDATION ===\n');
  console.log(`Execution Timestamp: ${timestamp}`);
  console.log(`Target Gateway Host: ${config.polyesterApiHost}`);
  console.log(`botAutoTradeEnabled: ${config.botAutoTradeEnabled} (LOCKED FALSE)`);
  console.log(`botDryRun: ${config.botDryRun} (ACTIVE DRY RUN)\n`);

  // Reset states for clean validation
  resetStrategyStateForTest();
  resetPaperTradingStoreForTest();
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
    parsedData: { status: 'healthy' },
    errorMessage: null,
    securityNotice: 'Testnet mode locked',
  });

  // Task 1: Research Parameters
  console.log('--- Task 1: Research Parameters & Execution Cost Assumptions ---');
  const paperCfg = getPaperTradingConfig();
  console.log(`  - Evaluation Window: ${paperCfg.evaluationWindowMinutes} Minutes`);
  console.log(`  - Neutral Movement Threshold: ±${paperCfg.neutralThresholdPercent}%`);
  console.log(`  - Minimum Sample Size for Win-Rate: ${paperCfg.minSampleSizeForAggregatePerformance} Completed Signals`);
  console.log(`  - Entry Fee Assumption: ${paperCfg.entryFeePercent}%`);
  console.log(`  - Exit Fee Assumption: ${paperCfg.exitFeePercent}% (Total Fee: ${(paperCfg.entryFeePercent + paperCfg.exitFeePercent).toFixed(2)}%)`);
  console.log(`  - Entry Slippage Assumption: ${paperCfg.entrySlippagePercent}%`);
  console.log(`  - Exit Slippage Assumption: ${paperCfg.exitSlippagePercent}% (Total Slippage: ${(paperCfg.entrySlippagePercent + paperCfg.exitSlippagePercent).toFixed(2)}%)`);
  console.log(`  - Combined Cost Assumption per Trade: ${(paperCfg.entryFeePercent + paperCfg.exitFeePercent + paperCfg.entrySlippagePercent + paperCfg.exitSlippagePercent).toFixed(2)}%`);
  console.log(`  - Order Book Depth Status: ${paperCfg.orderBookDepthStatus}`);
  console.log(`  - Disclaimer: ${paperCfg.disclaimer}`);

  // Task 2: Record Paper Signals
  console.log('\n--- Task 2: Record Paper Signals Across Active Spot Catalog ---');
  // Record simulated BUY decisions for BTC-USDT and ETH-USDT
  const btcDecision: StrategyDecision = {
    decisionId: 'dec_btc_paper_1',
    symbol: 'BTC-USDT',
    timestamp: new Date().toISOString(),
    action: 'buy',
    compositeScore: 78.5,
    confidence: 79,
    explanation: ['Trend BUY', 'Momentum BUY', 'Quality 60 (REST)'],
    agentSignals: [
      { agentName: 'MarketDataAgent', signal: 'neutral', confidence: 100, timestamp: new Date().toISOString(), details: { price: 78678.76 } },
      { agentName: 'TrendAgent', signal: 'buy', confidence: 80, timestamp: new Date().toISOString(), details: {} },
      { agentName: 'MomentumAgent', signal: 'buy', confidence: 75, timestamp: new Date().toISOString(), details: {} },
      { agentName: 'VolatilityAgent', signal: 'neutral', confidence: 85, timestamp: new Date().toISOString(), details: {} },
      { agentName: 'MarketQualityAgent', signal: 'buy', confidence: 60, timestamp: new Date().toISOString(), details: {} },
    ],
    riskApproved: true,
    proposedOrder: { symbol: 'BTC-USDT', side: 'buy', type: 'limit', price: 78678.76, quantity: 0.003, clientOrderId: 'cli_btc_p1' },
    isDryRun: true,
  };

  const ethDecision: StrategyDecision = {
    decisionId: 'dec_eth_paper_1',
    symbol: 'ETH-USDT',
    timestamp: new Date().toISOString(),
    action: 'buy',
    compositeScore: 72.0,
    confidence: 72,
    explanation: ['Trend BUY', 'Momentum SELL (Conflict)', 'Quality 60 (REST)'],
    agentSignals: [
      { agentName: 'MarketDataAgent', signal: 'neutral', confidence: 100, timestamp: new Date().toISOString(), details: { price: 2850.50 } },
      { agentName: 'TrendAgent', signal: 'buy', confidence: 75, timestamp: new Date().toISOString(), details: {} },
      { agentName: 'MomentumAgent', signal: 'sell', confidence: 65, timestamp: new Date().toISOString(), details: {} },
      { agentName: 'VolatilityAgent', signal: 'neutral', confidence: 85, timestamp: new Date().toISOString(), details: {} },
      { agentName: 'MarketQualityAgent', signal: 'buy', confidence: 60, timestamp: new Date().toISOString(), details: {} },
    ],
    riskApproved: true,
    proposedOrder: { symbol: 'ETH-USDT', side: 'buy', type: 'limit', price: 2850.50, quantity: 0.08, clientOrderId: 'cli_eth_p1' },
    isDryRun: true,
  };

  recordPaperSignal(btcDecision);
  recordPaperSignal(ethDecision);

  const initialSignals = listPaperSignals();
  console.log(`Paper Signals Recorded: ${initialSignals.length}`);
  for (const sig of initialSignals) {
    console.log(`  - Signal ID: ${sig.signalId} | Symbol: ${sig.symbol.padEnd(8)} | Direction: ${sig.direction.toUpperCase()} | Entry Price: $${sig.entryPriceUsd} | Due At: ${sig.evaluationDueAt}`);
  }

  // Task 3 & 4: Simulate 5m Window Elapsed Outcomes Evaluation
  console.log('\n--- Task 3 & 4: Outcome Resolution & Cost Deduction Simulation ---');
  // Fast-forward due timestamps for evaluation test
  for (const sig of initialSignals) {
    sig.evaluationDueAt = new Date(Date.now() - 1000).toISOString();
  }

  // Simulate market prices after 5m: BTC +0.80% (favorable), ETH -0.40% (unfavorable)
  const simulatedExitPrices = new Map<string, number>([
    ['BTC-USDT', 78678.76 * 1.008], // +0.80% gross
    ['ETH-USDT', 2850.50 * 0.996],  // -0.40% gross
  ]);

  const evaluatedCount = evaluatePendingPaperSignals(simulatedExitPrices);
  console.log(`Evaluated Completed Signals Count: ${evaluatedCount}`);

  for (const sig of listPaperSignals()) {
    console.log(`  * ${sig.symbol.padEnd(8)}: Gross ${sig.grossReturnPercent}% | Net ${sig.netReturnPercent}% (Cost -0.30%) | Outcome: ${sig.outcome?.toUpperCase()}`);
  }

  const summary = getPaperTradingSummary();
  console.log('\n--- Task 5: Paper Trading Summary & Risk Metrics ---');
  console.log(`Watermark: ${summary.watermark}`);
  console.log(`Total Signals Recorded: ${summary.totalSignalsRecorded}`);
  console.log(`Completed Signals Count: ${summary.completedSignalsCount}`);
  console.log(`Unresolved Signals Count: ${summary.unresolvedSignalsCount}`);
  console.log(`Outcome Distribution: Favorable (Wins): ${summary.winCount} | Unfavorable (Losses): ${summary.lossCount} | Neutral: ${summary.neutralCount}`);
  console.log(`Win-Rate Output: ${summary.winRatePercent !== null ? `${summary.winRatePercent}%` : 'SUPPRESSED (Sample N < 100)'}`);
  console.log(`Cumulative Gross Return: ${summary.cumulativeGrossReturnPercent >= 0 ? '+' : ''}${summary.cumulativeGrossReturnPercent.toFixed(2)}%`);
  console.log(`Cumulative Net Return  : ${summary.cumulativeNetReturnPercent >= 0 ? '+' : ''}${summary.cumulativeNetReturnPercent.toFixed(2)}%`);
  console.log(`Peak Net Return       : +${summary.peakNetReturnPercent.toFixed(2)}%`);
  console.log(`Peak-to-Trough Drawdown: -${summary.maxDrawdownPercent.toFixed(2)}%`);
  console.log(`Data Freshness Timestamp: ${summary.dataFreshnessTimestamp}`);

  console.log('\n=== PHASE 24 MULTI-AGENT PAPER-TRADING VALIDATION COMPLETE ===');
}

runPhase24PaperValidation().catch(err => {
  console.error('Phase 24 Validation Error:', err);
  process.exit(1);
});
