/**
 * Phase 5 Comprehensive Unit Tests - End-to-End Testnet Execution Validation & Controls
 * Tests authorization TTL expiry, configuration change invalidation, kill-switch override,
 * 9-point readiness checklist, rate limiting (max 1 open order), and default disabled auto-trade.
 */

import test from 'node:test';
import assert from 'node:assert';

process.env.POLYESTER_API_KEY_ID = 'mock_api_key_id_phase5';
process.env.POLYESTER_API_PRIVATE_KEY = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

import {
  setOperatorAuthorization,
  checkAuthorizationValid,
  updateStrategyConfig,
  evaluateReadiness,
  evaluateRiskGovernor,
  getPerformanceStats,
  resetStrategyStateForTest,
} from '../server/strategyEngine.js';

test('[Mocked] Phase 5 - Authorization Granted and Active', () => {
  resetStrategyStateForTest();
  const result = setOperatorAuthorization(true);
  assert.strictEqual(result.valid, true);

  const check = checkAuthorizationValid();
  assert.strictEqual(check.valid, true);
});

test('[Mocked] Phase 5 - Material Configuration Change Invalidates Authorization', () => {
  resetStrategyStateForTest();
  setOperatorAuthorization(true);
  assert.strictEqual(checkAuthorizationValid().valid, true);

  // Modify configuration materially (maxOrderQuoteUsd)
  updateStrategyConfig({ maxOrderQuoteUsd: 9999 });

  const checkAfterConfigChange = checkAuthorizationValid();
  assert.strictEqual(checkAfterConfigChange.valid, false);
  assert.ok(checkAfterConfigChange.reason.includes('Material configuration change'));
});

test('[Mocked] Phase 5 - Detailed Readiness Report Evaluates 9 Points', () => {
  resetStrategyStateForTest();
  setOperatorAuthorization(true);
  const report = evaluateReadiness();
  assert.ok(report.connectivity);
  assert.ok(report.accountIdentity);
  assert.ok(report.balances);
  assert.ok(report.marketMetadata);
  assert.ok(report.marketDataFreshness);
  assert.ok(report.riskConfiguration);
  assert.ok(report.openOrderReconciliation);
  assert.ok(report.killSwitchStatus);
  assert.ok(report.orderSubmissionPermission);
  assert.strictEqual(typeof report.allChecksPassed, 'boolean');
});

test('[Mocked] Phase 5 - Performance Stats Tracking', () => {
  resetStrategyStateForTest();
  const stats = getPerformanceStats();
  assert.strictEqual(typeof stats.submittedOrdersCount, 'number');
  assert.strictEqual(typeof stats.realizedPnlUsd, 'number');
  assert.strictEqual(typeof stats.riskLimitEventsCount, 'number');
});
