/**
 * Phase 28 — Live-Data Paper Observation Script
 * Polls verified live testnet market tickers from https://api.testnet.polyester.com/v1/markets.
 * Generates paper signals with source='live_telemetry' based strictly on real exchange data.
 * Evaluates pending signals over 5-minute observation windows using real live ticker prices.
 * Disarmed: botAutoTradeEnabled = false, botDryRun = true.
 */

import { getVerifiedMarkets } from '../polyesterClient.js';
import {
  getPaperTradingSummary,
  recordPaperSignal,
  evaluatePendingPaperSignals,
  listPaperSignals,
} from '../paperTradingEngine.js';
import { coordinateStrategy } from '../strategyEngine.js';

async function runLivePaperObservation() {
  console.log('=== PHASE 28: LIVE-DATA PAPER OBSERVATION SESSION ===');
  console.log(`Session Start Time: ${new Date().toISOString()}`);
  console.log('Safety Lock Status: botAutoTradeEnabled=false (LOCKED), botDryRun=true (ACTIVE)');

  // 1. Query Live Testnet Market Catalog
  const marketsRes = await getVerifiedMarkets();
  console.log(`\n--- 1. Live Testnet Market Catalog (${marketsRes.status.toUpperCase()}) ---`);
  console.log(`Source Host: ${marketsRes.source}`);
  console.log(`Active Spot Markets Returned: ${marketsRes.markets.length}`);

  if (!marketsRes.markets || marketsRes.markets.length === 0) {
    console.error('FAIL / BLOCKER: No live spot markets returned from Polyester testnet API.');
    process.exit(1);
  }

  const livePriceMap = new Map<string, number>();
  for (const m of marketsRes.markets) {
    if (m.lastPrice) {
      livePriceMap.set(m.symbol.toUpperCase(), Number(m.lastPrice));
      console.log(`  • ${m.symbol.toUpperCase()} Live Price: $${Number(m.lastPrice).toFixed(2)} (Timestamp: ${m.upstreamTimestamp || 'N/A'})`);
    }
  }

  // 2. Coordinate Strategy Across Active Symbols (Live Telemetry Mode)
  console.log('\n--- 2. Strategy Coordination & Live Telemetry Signal Generation ---');
  const symbols = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'POLY-USDT'];
  let newLiveSignalsCount = 0;

  for (const symbol of symbols) {
    try {
      const decision = await coordinateStrategy(symbol);
      console.log(`Symbol ${symbol} Strategy Decision: ${decision.action.toUpperCase()} (Score: ${decision.compositeScore}, Approved: ${decision.riskApproved})`);

      if (decision.action === 'buy' || decision.action === 'sell') {
        const record = recordPaperSignal(decision, 'live_telemetry');
        if (record) {
          newLiveSignalsCount++;
          console.log(`  -> Live Signal Recorded: ${record.signalId} (${symbol} ${record.direction.toUpperCase()} @ $${record.entryPriceUsd})`);
        } else {
          console.log(`  -> Signal skipped (duplicate within 60s or outage active)`);
        }
      }
    } catch (err: any) {
      console.error(`Error coordinating strategy for ${symbol}: ${err.message}`);
    }
  }

  console.log(`New Live Signals Recorded This Cycle: ${newLiveSignalsCount}`);

  // 3. Evaluate Outstanding Signals Whose 5-Minute Window Has Elapsed
  console.log('\n--- 3. Evaluating Outstanding Paper Signals Against Live Tickers ---');
  const evaluatedCount = evaluatePendingPaperSignals(livePriceMap);
  console.log(`Signals Evaluated & Completed This Cycle: ${evaluatedCount}`);

  // 4. Summarize Telemetry & Provenance Isolation
  const summary = getPaperTradingSummary();
  console.log('\n--- 4. Live Telemetry vs Simulation Script Telemetry Summary ---');
  console.log(`Watermark Badge       : ${summary.watermark}`);
  console.log(`Storage Backend       : ${summary.storageBackend}`);
  console.log(`Data Outage Status    : ${summary.dataOutagePaused ? `PAUSED (${summary.dataOutageReason})` : 'ACTIVE / VERIFIED'}`);

  console.log('\n[LIVE TELEMETRY STREAM ONLY]:');
  console.log(`  • Live Signals Recorded : ${summary.liveTelemetrySummary.totalSignalsRecorded}`);
  console.log(`  • Live Completed Signals : ${summary.liveTelemetrySummary.completedSignalsCount}`);
  console.log(`  • Live Unresolved Signals: ${summary.liveTelemetrySummary.unresolvedSignalsCount}`);
  console.log(`  • Live Sample Size Gate  : ${summary.liveTelemetrySummary.sampleSizeSufficient ? 'PASSED (N >= 100)' : 'INSUFFICIENT SAMPLE (N < 100)'}`);
  console.log(`  • Live Aggregate Win Rate: ${summary.liveTelemetrySummary.winRatePercent !== null ? `${summary.liveTelemetrySummary.winRatePercent}%` : 'SUPPRESSED (Need N >= 100 Live Signals)'}`);
  console.log(`  • Live Net Return        : ${summary.liveTelemetrySummary.cumulativeNetReturnPercent > 0 ? '+' : ''}${summary.liveTelemetrySummary.cumulativeNetReturnPercent.toFixed(2)}%`);

  console.log('\n[SIMULATION SCRIPT STREAM ONLY]:');
  console.log(`  • Sim Signals Recorded  : ${summary.simulationScriptSummary.totalSignalsRecorded}`);
  console.log(`  • Sim Completed Signals  : ${summary.simulationScriptSummary.completedSignalsCount}`);
  console.log(`  • Sim Win Rate          : ${summary.simulationScriptSummary.winRatePercent !== null ? `${summary.simulationScriptSummary.winRatePercent}%` : 'SUPPRESSED'}`);

  console.log('\n[COMBINED TOTALS]:');
  console.log(`  • Combined Total Signals : ${summary.totalSignalsRecorded}`);
  console.log(`  • Combined Completed     : ${summary.completedSignalsCount}`);

  console.log('\n=== PHASE 28 LIVE-DATA PAPER OBSERVATION SESSION COMPLETE ===');
}

runLivePaperObservation().catch(err => {
  console.error('Phase 28 Live Observation Error:', err);
  process.exit(1);
});
