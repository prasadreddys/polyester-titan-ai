/**
 * Phase 24 — Paper-Trading Configuration Validation
 * Reports configured assumptions only; price-based outcomes require independent verified observations.
 */

import { config } from '../config.js';
import { getPaperTradingConfig } from '../paperTradingEngine.js';

function runPhase24PaperValidation() {
  const timestamp = new Date().toISOString();
  console.log('=== PHASE 24: PAPER-TRADING CONFIGURATION VALIDATION ===\n');
  console.log(`Execution Timestamp: ${timestamp}`);
  console.log(`Target Gateway Host: ${config.polyesterApiHost}`);
  console.log(`botAutoTradeEnabled: ${config.botAutoTradeEnabled} (LOCKED FALSE)`);
  console.log(`botDryRun: ${config.botDryRun} (ACTIVE DRY RUN)\n`);

  const paperConfig = getPaperTradingConfig();
  console.log('--- Paper-Trading Assumptions ---');
  console.log(`Evaluation Window: ${paperConfig.evaluationWindowMinutes} minutes`);
  console.log(`Neutral Movement Threshold: ±${paperConfig.neutralThresholdPercent}%`);
  console.log(`Minimum Sample Size: ${paperConfig.minSampleSizeForAggregatePerformance}`);
  console.log(`Combined Cost Assumption: ${(
    paperConfig.entryFeePercent +
    paperConfig.exitFeePercent +
    paperConfig.entrySlippagePercent +
    paperConfig.exitSlippagePercent
  ).toFixed(2)}%`);
  console.log(`Order Book Depth Status: ${paperConfig.orderBookDepthStatus}`);
  console.log(`Disclaimer: ${paperConfig.disclaimer}`);

  console.log('\nPrice-based validation skipped: this script has no independent verified entry/exit observations.');
  console.log('No paper signals were created, no stored signals were changed, and no performance metrics were calculated.');
  console.log('\n=== PHASE 24 PAPER-TRADING CONFIGURATION VALIDATION COMPLETE ===');
}

runPhase24PaperValidation();
