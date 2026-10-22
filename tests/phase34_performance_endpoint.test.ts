import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../server/config.js';
import { liveExecutionAdapter } from '../server/liveExecutionAdapter.js';
import { POLYESTER_TESTNET_ENVIRONMENT } from '@polyester/sdk';
import { loadPersistedSignals, verifySignalTiming } from '../server/paperTradingEngine.js';
import { runPhase34PerformanceVerification } from '../server/scripts/phase34_performance_verification.js';

describe('Phase 34: Performance & Endpoint Verification Test Suite', () => {
  test('1. System execution locks are strictly maintained', () => {
    assert.equal(config.botAutoTradeEnabled, false, 'botAutoTradeEnabled must be strictly false');
    assert.equal(config.botDryRun, true, 'botDryRun must be strictly true');
    assert.equal(liveExecutionAdapter.getConfig().enabled, false, 'liveExecutionAdapter must be disabled');
    assert.equal(liveExecutionAdapter.isLiveExecutionAllowed(), false, 'isLiveExecutionAllowed must be false');
  });

  test('2. Performance recalculation directly from 10 live records matches -49.5650%', () => {
    const allSignals = loadPersistedSignals();
    const liveRecords = allSignals.filter(s => s.source !== 'simulation_script' && s.status === 'completed' && verifySignalTiming(s));
    
    assert.equal(liveRecords.length, 10, 'Must have exactly 10 valid live telemetry records');

    let sumNet = 0;
    let sumGross = 0;

    for (const r of liveRecords) {
      assert.equal(r.source, 'live_telemetry', 'Record provenance must be live_telemetry');
      assert.equal(r.assumedCosts?.combinedCostPercent, 0.30, 'Cost deduction must be 0.30%');
      assert.ok(r.entryPriceUsd > 0, 'Entry price must be positive');
      assert.ok((r.exitPriceUsd ?? 0) > 0, 'Exit price must be positive');
      
      sumGross += r.grossReturnPercent ?? 0;
      sumNet += r.netReturnPercent ?? 0;
    }

    const meanNet = sumNet / liveRecords.length;
    const meanGross = sumGross / liveRecords.length;

    assert.equal(Number(sumNet.toFixed(4)), -495.6503, 'Sum of net returns across 10 records must equal -495.6503%');
    assert.equal(Number(meanNet.toFixed(4)), -49.5650, 'Mean net return must equal -49.5650%');
    assert.equal(Number(meanGross.toFixed(4)), -49.2650, 'Mean gross return must equal -49.2650%');
  });

  test('3. Statistical variance and 95% confidence interval are strictly negative', () => {
    const allSignals = loadPersistedSignals();
    const liveRecords = allSignals.filter(s => s.source !== 'simulation_script' && s.status === 'completed' && verifySignalTiming(s));
    const N = liveRecords.length;
    const netReturns = liveRecords.map(r => r.netReturnPercent ?? 0);
    const meanNet = netReturns.reduce((a, b) => a + b, 0) / N;

    const variance = netReturns.reduce((sum, v) => sum + Math.pow(v - meanNet, 2), 0) / (N - 1);
    const sd = Math.sqrt(variance);
    const se = sd / Math.sqrt(N);
    const tCrit = 2.262157; // df=9
    const margin = tCrit * se;

    const ciLower = meanNet - margin;
    const ciUpper = meanNet + margin;

    assert.ok(ciLower < 0, '95% confidence interval lower bound must be negative');
    assert.ok(ciUpper < 0, '95% confidence interval upper bound must be negative');
    assert.equal(Number(ciLower.toFixed(2)), -87.65, 'Lower CI bound approximately -87.65%');
    assert.equal(Number(ciUpper.toFixed(2)), -11.48, 'Upper CI bound approximately -11.48%');
  });

  test('4. Simulation records are strictly excluded from live performance metrics', () => {
    const allSignals = loadPersistedSignals();
    const simRecords = allSignals.filter(s => s.source === 'simulation_script');
    assert.ok(simRecords.length > 0, 'Simulation records exist in store');

    // Confirm that filtering live telemetry excludes all sim records
    const liveRecords = allSignals.filter(s => s.source !== 'simulation_script' && s.status === 'completed');
    assert.equal(liveRecords.length, 10, 'Only 10 live records should be selected');
    for (const r of liveRecords) {
      assert.notEqual(r.source, 'simulation_script');
    }
  });

  test('5. SDK package version and testnet endpoint constants match official definitions', () => {
    assert.equal(POLYESTER_TESTNET_ENVIRONMENT.apiUrl, 'https://api.testnet.polyester.com');
    assert.equal(config.polyesterTestnetHost, 'https://api.testnet.polyester.com');
    assert.equal(config.polyesterMainnetHost, 'https://api.polyester.exchange');
  });

  test('6. Phase 34 audit script executes and generates compliant audit report', async () => {
    const report = await runPhase34PerformanceVerification();
    assert.equal(report.phaseName, 'PHASE_34_CRITICAL_PERFORMANCE_AND_ENDPOINT_VERIFICATION');
    assert.equal(report.safetyLocks.safetyLocksIntact, true);
    assert.equal(report.performanceRecalculation.formulaVerified, true);
    assert.equal(report.performanceRecalculation.calculatedMeanNetReturnPercent, -49.5650);
    assert.equal(report.sdkAndEndpointVerification.installedSdkPackage, '@polyester/sdk');
    assert.equal(report.sdkAndEndpointVerification.sdkTestnetConstantApiUrl, 'https://api.testnet.polyester.com');
    assert.equal(report.overallStatus, 'PHASE_34_VERIFICATION_PASSED_LIVE_TRADING_LOCKED');
  });
});
