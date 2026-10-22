/**
 * Phase 22 — Multi-Agent Strategy Validation Script
 * Evaluates multi-agent signal generation across live testnet data in signal-only mode.
 * Performs independent risk checks, tracks signal counts, rejection reasons,
 * data freshness, and execution assumptions without submitting any exchange orders.
 */

import { config, sanitizeLog } from '../config.js';
import {
  coordinateStrategy,
  evaluateRiskGovernor,
  evaluateSignalOutcome,
  resetStrategyStateForTest,
  getStrategyConfig,
  runMarketDataAgent,
  runTrendAgent,
  runMomentumAgent,
  runVolatilityAgent,
  runMarketQualityAgent,
} from '../strategyEngine.js';
import {
  getVerifiedMarkets,
  getLastHealthCheck,
  getSDKClient,
} from '../polyesterClient.js';

async function runPhase22Validation() {
  const timestamp = new Date().toISOString();
  console.log('=== PHASE 22: MULTI-AGENT STRATEGY VALIDATION (SIGNAL-ONLY MODE) ===\n');
  console.log(`Execution Timestamp: ${timestamp}`);
  console.log(`Target Gateway Host: ${config.polyesterApiHost}`);
  console.log(`botAutoTradeEnabled: ${config.botAutoTradeEnabled} (LOCKED FALSE)`);
  console.log(`botDryRun: ${config.botDryRun} (ACTIVE DRY RUN)`);

  // Task 1: Document Multi-Agent Architecture & Roles
  console.log('\n--- Task 1: Multi-Agent Architecture Inspection ---');
  console.log('1. MarketDataAgent     : Source: live verified spot config / REST. Checks feed age, lastPrice, tick rules.');
  console.log('2. TrendAgent          : Source: live spot price. Evaluates moving average baseline & price trend direction.');
  console.log('3. MomentumAgent       : Source: live price delta. Evaluates Rate of Change (ROC_14) momentum indicators.');
  console.log('4. VolatilityAgent     : Source: market variance. Evaluates volatility index and abnormal market spikes.');
  console.log('5. MarketQualityAgent  : Source: spot market catalog. Evaluates liquidity & quality threshold (min score 70).');
  console.log('6. StrategyCoordinator : Aggregates signals, calculates composite score, evaluates conflicts & duplicate signals.');
  console.log('7. RiskGovernor        : Independent risk check (position size, exposure, daily loss, kill switch, max orders).');

  // Task 2 & 3: Run Multi-Agent Strategy across symbols in signal-only mode
  console.log('\n--- Task 2 & 3: Live Multi-Agent Signal Generation ---');
  const symbolsToEvaluate = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'POLY-USDT'];
  let totalEvaluated = 0;
  let totalProposed = 0;
  let totalApprovedByRisk = 0;
  let totalRejectedByRisk = 0;
  const decisionsMap = new Map<string, any>();

  for (const symbol of symbolsToEvaluate) {
    try {
      console.log(`\n[Evaluating ${symbol}]...`);
      const decision = await coordinateStrategy(symbol);
      totalEvaluated++;
      decisionsMap.set(symbol, decision);

      console.log(`  - Action Proposed: ${decision.action.toUpperCase()}`);
      console.log(`  - Composite Score: ${decision.compositeScore.toFixed(1)} / 100 (Threshold: 65.0)`);
      console.log(`  - Risk Approved: ${decision.riskApproved ? 'PASS (Approved)' : 'FAIL (Rejected)'}`);
      if (decision.riskReason) {
        console.log(`  - Risk Decision Note: ${decision.riskReason}`);
      }

      console.log(`  - Agent Signals Summary:`);
      for (const sig of decision.agentSignals) {
        console.log(`      * ${sig.agentName.padEnd(20)}: ${sig.signal.padEnd(8)} (Confidence: ${sig.confidence}%, Time: ${sig.timestamp})`);
      }

      if (decision.action === 'buy' || decision.action === 'sell') {
        totalProposed++;
      }
      if (decision.riskApproved) {
        totalApprovedByRisk++;
      } else {
        totalRejectedByRisk++;
      }
    } catch (err: any) {
      console.log(`  - Signal Evaluation Error for ${symbol}: ${sanitizeLog(err.message || String(err))}`);
    }
  }

  // Task 4: Test Duplicate Signal & Conflict Checks explicitly
  console.log('\n--- Task 4: Risk Governor Conflict & Duplicate Signal Enforcement ---');
  console.log('Testing duplicate signal suppression on immediate re-evaluation of BTC-USDT...');
  const dupDecision = await coordinateStrategy('BTC-USDT');
  console.log(`  - Duplicate Signal Flag: ${dupDecision.isDuplicateSignal}`);
  console.log(`  - Risk Approval: ${dupDecision.riskApproved}`);
  console.log(`  - Risk Reason: ${dupDecision.riskReason}`);

  // Task 6: Evaluate Signal Outcome against subsequent price
  console.log('\n--- Task 6: Subsequent Market Data Signal Evaluation ---');
  const btcDec = decisionsMap.get('BTC-USDT');
  if (btcDec) {
    const mdSig = btcDec.agentSignals.find((s: any) => s.agentName === 'MarketDataAgent');
    const currentPrice = Number((mdSig?.details as any)?.price);
    if (Number.isFinite(currentPrice) && currentPrice > 0) {
      // Compare with a clearly hypothetical follow-up price; never invent the initial observation.
      const observedHigherPrice = Number((currentPrice * 1.005).toFixed(2));
      const evalResult = evaluateSignalOutcome(btcDec, observedHigherPrice);
      console.log(`Signal Evaluation Outcome (Hypothetical Price Delta Observation):`);
      console.log(`  - Initial Observed Price: $${evalResult.initialPrice} USDT`);
      console.log(`  - Subsequent Price: $${evalResult.subsequentObservedPrice} USDT`);
      console.log(`  - Price Movement: +$${evalResult.priceDeltaUsd} USDT (+${evalResult.priceDeltaPercent}%)`);
      console.log(`  - Signal Direction: ${evalResult.direction.toUpperCase()}`);
      console.log(`  - Signal Outcome: ${evalResult.signalOutcome.toUpperCase()}`);
      console.log(`  - Evaluation Tag: ${evalResult.evaluationType}`);
      console.log(`  - Disclaimer: ${evalResult.disclaimer}`);
    } else {
      console.log('Signal outcome skipped: no verified initial market price was available.');
    }
  }

  // Task 7: Execution Assumptions & Fee Report
  console.log('\n--- Task 7: Execution & Fee Assumptions Report ---');
  const sampleAssumptions = btcDec?.executionAssumptions || {
    makerFeePercent: 0.1,
    takerFeePercent: 0.1,
    estimatedSlippagePercent: 0.05,
    orderBookDepthStatus: 'Unavailable (REST endpoint mode)',
    disclaimer: 'Hypothetical execution assumptions for signal-only multi-agent validation on Polyester Testnet. Zero exchange orders submitted.',
  };
  console.log(`  - Maker Fee Assumption: ${sampleAssumptions.makerFeePercent}%`);
  console.log(`  - Taker Fee Assumption: ${sampleAssumptions.takerFeePercent}%`);
  console.log(`  - Estimated Slippage Tolerance: ${sampleAssumptions.estimatedSlippagePercent}%`);
  console.log(`  - Order Book Depth Status: ${sampleAssumptions.orderBookDepthStatus}`);
  console.log(`  - Disclaimer: ${sampleAssumptions.disclaimer}`);

  // Task 10: Summary Matrix
  console.log('\n--- Task 10: Multi-Agent Validation Summary ---');
  console.log(`  - Total Symbols Evaluated: ${totalEvaluated}`);
  console.log(`  - Total Proposed Signals: ${totalProposed}`);
  console.log(`  - Total Risk Approved Signals: ${totalApprovedByRisk}`);
  console.log(`  - Total Risk Rejected Signals: ${totalRejectedByRisk}`);
  console.log(`  - Exchange Orders Submitted: 0 (Strictly disarmed & signal-only)`);
  console.log(`  - Execution Gates Status: CLOSED`);

  console.log('\n=== PHASE 22 MULTI-AGENT STRATEGY VALIDATION COMPLETE ===');
}

runPhase22Validation().catch(err => {
  console.error('Phase 22 Validation Error:', err);
  process.exit(1);
});
