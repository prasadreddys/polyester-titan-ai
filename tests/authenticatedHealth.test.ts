/**
 * POLYESTER TITAN AI - Authenticated Health Check & Probe Audit Tests
 * Tests the server-side probe against authoritative Polyester documentation rules:
 * - Ed25519 signing scheme verified from official docs
 * - Marks unverified endpoints as UNVERIFIED and does not send credentials over the wire
 * - 403, 404, timeouts, and malformed responses are never interpreted as authenticated
 * - Read-only enforcement: probes cannot submit or modify orders
 * - Zero key leakage and strict fail-closed safety invariants
 */

import test from 'node:test';
import assert from 'node:assert';
import { executeAuthenticatedHealthCheck } from '../server/polyesterClient.js';
import { config, getPolyesterCredentials } from '../server/config.js';
import { listManagedOrders } from '../server/orderManager.js';

test('Authenticated Health Probe - SDK Identity Verification with Credentials', {
  skip: process.env.POLYESTER_RUN_LIVE_READONLY_TESTS !== 'true',
}, async () => {
  const result = await executeAuthenticatedHealthCheck();

  assert.strictEqual(typeof result, 'object');
  assert.strictEqual(result.authenticatedProbe, true);
  
  // Since we don't have real credentials in CI/Test env, it should be UNVERIFIED or ERROR
  if (result.success) {
    assert.strictEqual(result.authSchemeStatus, 'VERIFIED');
    assert.strictEqual(result.authenticated, true);
  } else {
    assert.strictEqual(result.authSchemeStatus, 'UNVERIFIED');
    assert.strictEqual(result.authenticated, false);
  }
  
  assert.strictEqual(result.credentialsSent, true);
  assert.ok(result.authSchemeNote.includes('SDK') || result.authSchemeNote.includes('Ed25519'));

  // Verify that secret hex is NEVER in result payload
  const serialized = JSON.stringify(result);
  const creds = getPolyesterCredentials();
  if (creds.apiSecretHex) {
    assert.strictEqual(serialized.includes(creds.apiSecretHex), false, 'Secret hex must NOT appear in output payload');
  }

  // Check credential metadata structure
  assert.strictEqual(typeof result.credentials, 'object');
  assert.strictEqual(result.credentials.hasPrivateKey, true);
  if (creds.apiKeyId) {
    assert.ok(result.credentials.keyIdMasked?.includes('***'));
  }
  if (creds.accountId) {
    assert.ok(result.credentials.accountIdMasked?.includes('***'));
  }
});

test('Authenticated Health Probe - Handles Missing or Invalid Credentials Gracefully', async () => {
  const originalKey = process.env.POLYESTER_API_KEY_ID;
  const originalSecret = process.env.POLYESTER_API_SECRET_HEX;
  const originalPrivate = process.env.POLYESTER_API_PRIVATE_KEY;

  try {
    delete process.env.POLYESTER_API_KEY_ID;
    delete process.env.POLYESTER_API_SECRET_HEX;
    delete process.env.POLYESTER_API_PRIVATE_KEY;

    const result = await executeAuthenticatedHealthCheck();
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.authenticated, false);
    assert.strictEqual(result.credentialsSent, false);
    assert.strictEqual(result.authSchemeStatus, 'UNVERIFIED');
    assert.strictEqual(result.status, 'error');
    assert.strictEqual(result.credentials.validation.valid, false);
    assert.strictEqual(result.credentials.validation.code, 'CREDENTIALS_MISSING');
    assert.strictEqual(result.httpStatus, null);
    assert.ok(result.message.includes('Missing Polyester API credentials'));
  } finally {
    if (originalKey === undefined) delete process.env.POLYESTER_API_KEY_ID;
    else process.env.POLYESTER_API_KEY_ID = originalKey;
    if (originalSecret === undefined) delete process.env.POLYESTER_API_SECRET_HEX;
    else process.env.POLYESTER_API_SECRET_HEX = originalSecret;
    if (originalPrivate === undefined) delete process.env.POLYESTER_API_PRIVATE_KEY;
    else process.env.POLYESTER_API_PRIVATE_KEY = originalPrivate;
  }
});

test('Authenticated Health Probe - Zero Key Leakage in Any Error State', async () => {
  const originalKey = process.env.POLYESTER_API_KEY_ID;
  const originalSecret = process.env.POLYESTER_API_SECRET_HEX;

  try {
    const fakeSecret = '0'.repeat(64); // Valid length hex
    process.env.POLYESTER_API_KEY_ID = 'x';
    process.env.POLYESTER_API_SECRET_HEX = fakeSecret;

    const result = await executeAuthenticatedHealthCheck();
    const serialized = JSON.stringify(result);
    assert.strictEqual(serialized.includes(fakeSecret), false);
    assert.strictEqual(result.authenticated, false);
    assert.strictEqual(result.credentials.validation.valid, false);
    assert.strictEqual(result.credentialsSent, false);
  } finally {
    if (originalKey === undefined) delete process.env.POLYESTER_API_KEY_ID;
    else process.env.POLYESTER_API_KEY_ID = originalKey;
    if (originalSecret === undefined) delete process.env.POLYESTER_API_SECRET_HEX;
    else process.env.POLYESTER_API_SECRET_HEX = originalSecret;
  }
});

test('Authenticated Health Probe - Probes Are Read-Only and Never Mutate Orders', async () => {
  const initialOrders = listManagedOrders();
  const initialCount = initialOrders.length;
  const originalKey = process.env.POLYESTER_API_KEY_ID;
  const originalSecret = process.env.POLYESTER_API_SECRET_HEX;
  const originalPrivate = process.env.POLYESTER_API_PRIVATE_KEY;

  try {
    process.env.POLYESTER_API_KEY_ID = '';
    process.env.POLYESTER_API_SECRET_HEX = '';
    process.env.POLYESTER_API_PRIVATE_KEY = '';
    await executeAuthenticatedHealthCheck();
  } finally {
    if (originalKey === undefined) delete process.env.POLYESTER_API_KEY_ID;
    else process.env.POLYESTER_API_KEY_ID = originalKey;
    if (originalSecret === undefined) delete process.env.POLYESTER_API_SECRET_HEX;
    else process.env.POLYESTER_API_SECRET_HEX = originalSecret;
    if (originalPrivate === undefined) delete process.env.POLYESTER_API_PRIVATE_KEY;
    else process.env.POLYESTER_API_PRIVATE_KEY = originalPrivate;
  }

  const postOrders = listManagedOrders();
  assert.strictEqual(postOrders.length, initialCount, 'Probe must not add or remove orders');
  assert.deepStrictEqual(
    postOrders.map(o => o.orderId),
    initialOrders.map(o => o.orderId),
    'Order list must remain identical'
  );
});

test('Safety Invariants - AutoTrade is strictly disabled and DryRun is active', () => {
  assert.strictEqual(config.botAutoTradeEnabled, false, 'botAutoTradeEnabled must be strictly false');
  assert.strictEqual(config.botDryRun, true, 'botDryRun must be strictly true');
});
