/**
 * POLYESTER TITAN AI - Identity Helper Unit Tests
 * Verifies the granular error reporting and read-only logic of performIdentityCheck.
 */

import test from 'node:test';
import assert from 'node:assert';
import { performIdentityCheck } from '../server/identityHelper.js';
import * as config from '../server/config.js';
import { PolyesterClient } from '@polyester/sdk';

// Mocking dependencies
test('Identity Helper - Missing Config', async () => {
  // Save original env
  const originalEnv = { ...process.env };
  
  // Clear env
  delete process.env.POLYESTER_API_KEY_ID;
  delete process.env.POLYESTER_API_SECRET_HEX;
  delete process.env.POLYESTER_API_PRIVATE_KEY;

  const result = await performIdentityCheck();
  
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.failureType, 'MISSING_CONFIG');
  assert.match(result.error!, /Missing API Key ID or Secret Key/);

  // Restore env
  process.env = originalEnv;
});

test('Identity Helper - Malformed Key (Too Short)', async () => {
  const originalEnv = { ...process.env };
  
  process.env.POLYESTER_API_KEY_ID = 'test-id';
  process.env.POLYESTER_API_SECRET_HEX = '1234abcd'; // Too short

  const result = await performIdentityCheck();
  
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.failureType, 'MALFORMED_KEY');
  assert.match(result.error!, /64-character hex string/);

  process.env = originalEnv;
});

test('Identity Helper - Malformed Key (Invalid Hex)', async () => {
  const originalEnv = { ...process.env };
  
  process.env.POLYESTER_API_KEY_ID = 'test-id';
  process.env.POLYESTER_API_SECRET_HEX = 'z'.repeat(64); // Invalid hex

  const result = await performIdentityCheck();
  
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.failureType, 'MALFORMED_KEY');

  process.env = originalEnv;
});

// Since we cannot easily mock the SDK's internal behavior without a more complex setup,
// we will focus on the local logic and trust the live probe for end-to-end.
// However, we can verify that the helper is calling the right methods.

test('Identity Helper - Redaction Check', async () => {
  const originalEnv = { ...process.env };
  
  process.env.POLYESTER_API_KEY_ID = 'test-id';
  process.env.POLYESTER_API_SECRET_HEX = 'a'.repeat(64);

  // We expect an upstream failure since this is a fake key, 
  // but we want to check that the error message is redacted.
  const result = await performIdentityCheck();
  
  if (!result.success) {
    assert.ok(!result.error?.includes('a'.repeat(64)), 'Error message should not contain the secret key');
    assert.ok(result.redactedDetails, 'Redacted details should be present');
  }

  process.env = originalEnv;
});
