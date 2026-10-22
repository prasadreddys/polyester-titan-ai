/**
 * Phase 30 — Timestamp & Live-Metric Integrity Audit Script
 * Audits every signal in /server/data/paper_signals.json for 300,000 ms window compliance.
 * Flags non-compliant records (duration < 300,000 ms) and excludes them from verified live metrics.
 * Recalculates corrected live telemetry metrics from persisted entry and exit prices.
 * Asserts N_live_valid >= 100 gate enforcement.
 */

import fs from 'fs';
import path from 'path';
import {
  PaperSignalRecord,
  verifySignalTiming,
  getPaperTradingSummary,
} from '../paperTradingEngine.js';

async function auditTimestampIntegrity() {
  console.log('=== PHASE 30: TIMESTAMP & LIVE-METRIC INTEGRITY AUDIT ===');
  console.log(`Execution Timestamp: ${new Date().toISOString()}`);

  const filePath = path.resolve(process.cwd(), 'server', 'data', 'paper_signals.json');
  console.log(`Target Persistence File: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.error('FAIL / BLOCKER: /server/data/paper_signals.json missing.');
    process.exit(1);
  }

  const rawData = fs.readFileSync(filePath, 'utf-8');
  const records: PaperSignalRecord[] = JSON.parse(rawData);
  console.log(`Total Persisted Records Loaded: ${records.length}`);

  let totalValidTiming = 0;
  let totalInvalidTiming = 0;

  const flaggedList: Array<{ id: string; symbol: string; source: string; durationMs: number; reason: string }> = [];

  for (const r of records) {
    const startMs = new Date(r.timestamp).getTime();
    const dueMs = new Date(r.evaluationDueAt).getTime();
    const durationMs = dueMs - startMs;

    const isValid = verifySignalTiming(r);

    if (isValid) {
      totalValidTiming++;
      r.isTimingValid = true;
      r.timingWindowMs = durationMs;
    } else {
      totalInvalidTiming++;
      r.isTimingValid = false;
      r.timingWindowMs = durationMs;
      r.flaggedReason = `Non-compliant window duration: ${durationMs}ms (required: 300,000ms)`;

      flaggedList.push({
        id: r.signalId,
        symbol: r.symbol,
        source: r.source || 'unknown',
        durationMs,
        reason: r.flaggedReason,
      });
    }
  }

  console.log('\n--- 1. Window Duration Audit Results ---');
  console.log(`Compliant Records (300,000ms window) : ${totalValidTiming}`);
  console.log(`Flagged Records (Non-compliant window): ${totalInvalidTiming}`);

  if (flaggedList.length > 0) {
    console.log('\n--- 2. Sample Flagged Records (Non-Compliant Windows) ---');
    for (const f of flaggedList.slice(0, 10)) {
      console.log(`  • ID: ${f.id} | Symbol: ${f.symbol} | Source: ${f.source} | Duration: ${f.durationMs}ms | Reason: ${f.reason}`);
    }
  }

  // Write updated records back to disk with flags preserved
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
  console.log('\nPreserved records on disk with timing validity flags.');

  // Recalculate summary from paperTradingEngine
  const summary = getPaperTradingSummary();
  console.log('\n--- 3. Corrected Isolated Telemetry Summary ---');
  console.log(`[LIVE TELEMETRY STREAM ONLY]:`);
  console.log(`  • Live Total Recorded        : ${summary.liveTelemetrySummary.totalSignalsRecorded}`);
  console.log(`  • Live Completed Count       : ${summary.liveTelemetrySummary.completedSignalsCount}`);
  console.log(`  • Live Valid Completed Count : ${summary.liveTelemetrySummary.validCompletedCount}`);
  console.log(`  • Live Invalid Timing Count  : ${summary.liveTelemetrySummary.invalidTimingCount}`);
  console.log(`  • Live Sample Size Gate      : ${summary.liveTelemetrySummary.sampleSizeSufficient ? 'PASSED (N >= 100)' : 'INSUFFICIENT SAMPLE (N_valid < 100)'}`);
  console.log(`  • Live Aggregate Win Rate    : ${summary.liveTelemetrySummary.winRatePercent !== null ? `${summary.liveTelemetrySummary.winRatePercent}%` : 'SUPPRESSED (Requires N_valid >= 100)'}`);
  console.log(`  • Live Cumulative Net Return : ${summary.liveTelemetrySummary.cumulativeNetReturnPercent > 0 ? '+' : ''}${summary.liveTelemetrySummary.cumulativeNetReturnPercent.toFixed(2)}%`);

  console.log('\n=== PHASE 30 TIMESTAMP INTEGRITY AUDIT COMPLETE ===');
}

auditTimestampIntegrity().catch(err => {
  console.error('Phase 30 Audit Error:', err);
  process.exit(1);
});
