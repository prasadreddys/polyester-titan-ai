/**
 * POLYESTER TITAN AI - Comprehensive Credential Format Validation & Leak Guard Tests
 * Verifies that the server-side validator correctly identifies and rejects improperly formatted,
 * empty, or invalid API Key and Secret inputs without leaking them in error messages.
 */

import test from 'node:test';
import assert from 'node:assert';
import { validateCredentialsFormat } from '../server/credentialValidator.js';
import { validateOrder } from '../server/orderValidator.js';

test('Credential Validator - Rejects Undefined or Null Credentials', () => {
  const r1 = validateCredentialsFormat(undefined, undefined);
  assert.strictEqual(r1.valid, false);
  assert.strictEqual(r1.code, 'CREDENTIALS_MISSING');
  assert.strictEqual(typeof r1.error, 'string');

  const r2 = validateCredentialsFormat(null, null);
  assert.strictEqual(r2.valid, false);
  assert.strictEqual(r2.code, 'CREDENTIALS_MISSING');

  const r3 = validateCredentialsFormat('valid_key_id', undefined);
  assert.strictEqual(r3.valid, false);
  assert.strictEqual(r3.code, 'CREDENTIALS_MISSING');

  const r4 = validateCredentialsFormat(undefined, 'valid_private_key_123');
  assert.strictEqual(r4.valid, false);
  assert.strictEqual(r4.code, 'CREDENTIALS_MISSING');
});

test('Credential Validator - Rejects Empty and Whitespace-Only Credentials', () => {
  const r1 = validateCredentialsFormat('', '');
  assert.strictEqual(r1.valid, false);
  assert.strictEqual(r1.code, 'CREDENTIALS_MISSING');

  const r2 = validateCredentialsFormat('   ', '   ');
  assert.strictEqual(r2.valid, false);
  assert.strictEqual(r2.code, 'CREDENTIALS_MISSING');

  const r3 = validateCredentialsFormat("  \n\t  ", "  \r\n  ");
  assert.strictEqual(r3.valid, false);
  assert.strictEqual(r3.code, 'CREDENTIALS_MISSING');

  const r4 = validateCredentialsFormat('valid_api_key_id', '   ');
  assert.strictEqual(r4.valid, false);
  assert.strictEqual(r4.code, 'CREDENTIALS_MISSING');
});

test('Credential Validator - Rejects Non-String Data Types', () => {
  const r1 = validateCredentialsFormat(12345, 67890123);
  assert.strictEqual(r1.valid, false);
  assert.strictEqual(r1.code, 'INVALID_TYPE');

  const r2 = validateCredentialsFormat({ key: 'test' }, ['secret']);
  assert.strictEqual(r2.valid, false);
  assert.strictEqual(r2.code, 'INVALID_TYPE');

  const r3 = validateCredentialsFormat(true, false);
  assert.strictEqual(r3.valid, false);
  assert.strictEqual(r3.code, 'INVALID_TYPE');
});

test('Credential Validator - Rejects Under-Length API Key ID (< 4 chars)', () => {
  const shortKeyIds = ['a', 'ab', 'abc', ' 1 '];
  for (const shortKey of shortKeyIds) {
    const res = validateCredentialsFormat(shortKey, 'valid_secret_length_123');
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'INVALID_KEY_ID_FORMAT');
    assert.strictEqual(res.error?.includes('API Key ID'), true);
  }
});

test('Credential Validator - Rejects Under-Length Private Key (< 8 chars)', () => {
  const shortSecrets = ['1', '12', '123', '1234', '12345', '123456', '1234567', ' short '];
  for (const shortSecret of shortSecrets) {
    const res = validateCredentialsFormat('valid_api_key_id', shortSecret);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'INVALID_PRIVATE_KEY_FORMAT');
    assert.strictEqual(res.error?.includes('Private Key'), true);
  }
});

test('Credential Validator - Zero Credential Leakage in Error Messages', () => {
  const sensitiveSecret = 'SECRET_HEX_KEY_517d4ebd2ec0ab6c280cab734491492f508bac25834182dbc6b8a293ec212224';
  const sensitiveKeyId = 'KEY_ID_004a988d179d74c221b86ba581c4767130fa49ea3bd0379462c7e753e8bd761d';

  // Test 1: Invalid key format with sensitive secret present
  const res1 = validateCredentialsFormat('bad', sensitiveSecret);
  assert.strictEqual(res1.valid, false);
  assert.strictEqual(res1.error?.includes(sensitiveSecret), false);
  assert.strictEqual(res1.error?.includes(sensitiveKeyId), false);

  // Test 2: Invalid secret format with sensitive key present
  const res2 = validateCredentialsFormat(sensitiveKeyId, 'short');
  assert.strictEqual(res2.valid, false);
  assert.strictEqual(res2.error?.includes(sensitiveSecret), false);
  assert.strictEqual(res2.error?.includes(sensitiveKeyId), false);

  // Test 3: Non-string type attempt
  const res3 = validateCredentialsFormat({ secret: sensitiveSecret }, sensitiveSecret);
  assert.strictEqual(res3.valid, false);
  assert.strictEqual(res3.error?.includes(sensitiveSecret), false);
});

test('Credential Validator - Accepts Documented Valid Key Formats', () => {
  // Standard 64-character hexadecimal key
  const validHexKey = '517d4ebd2ec0ab6c280cab734491492f508bac25834182dbc6b8a293ec212224';
  const validKeyId = '004a988d179d74c221b86ba581c4767130fa49ea3bd0379462c7e753e8bd761d';

  const res1 = validateCredentialsFormat(validKeyId, validHexKey);
  assert.strictEqual(res1.valid, true);
  assert.strictEqual(res1.code, 'VALID');

  // Standard alphanumeric API key and Base64/Ed25519 secret
  const res2 = validateCredentialsFormat('ak_testnet_trader_01', 'ed25519_priv_key_example_secret_123');
  assert.strictEqual(res2.valid, true);
  assert.strictEqual(res2.code, 'VALID');
});

test('Order Validator - Integrates Credential Validation and Fails Closed Without Leaks', () => {
  const origKey = process.env.POLYESTER_API_KEY_ID;
  const origSecret = process.env.POLYESTER_API_SECRET_HEX;
  const origPriv = process.env.POLYESTER_API_PRIVATE_KEY;

  try {
    // Delete credentials
    delete process.env.POLYESTER_API_KEY_ID;
    delete process.env.POLYESTER_API_SECRET_HEX;
    delete process.env.POLYESTER_API_PRIVATE_KEY;

    const risk = {
      maxPositionSizeUsd: 10000,
      maxDrawdownPercent: 5,
      slippageTolerancePercent: 0.5,
      stopLossPercent: 2,
      maxOpenOrders: 3,
      killSwitchActive: false,
      allowedSymbols: ['BTC-USDT'],
    };

    const res = validateOrder(
      {
        symbol: 'BTC-USDT',
        side: 'buy',
        type: 'limit',
        price: 65000,
        quantity: 0.01,
        clientOrderId: 'cred_leak_test_order',
      },
      risk,
      0,
      10000,
      new Set()
    );

    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'CREDENTIALS_MISSING');
    assert.strictEqual(res.error?.includes('credentials'), true);
  } finally {
    if (origKey) process.env.POLYESTER_API_KEY_ID = origKey;
    if (origSecret) process.env.POLYESTER_API_SECRET_HEX = origSecret;
    if (origPriv) process.env.POLYESTER_API_PRIVATE_KEY = origPriv;
  }
});
