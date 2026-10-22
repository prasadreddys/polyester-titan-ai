import test from 'node:test';
import assert from 'node:assert';
import { sanitizeLog, config } from '../server/config.js';

test('Security Sanitization - Redacts API Key Strings', () => {
  const sensitiveString = 'Error connecting with api_key="secret_test_key_99998888" to gateway';
  const sanitized = sanitizeLog(sensitiveString);

  assert.strictEqual(sanitized.includes('secret_test_key_99998888'), false);
  assert.strictEqual(sanitized.includes('***REDACTED***'), true);
});

test('Security Sanitization - Redacts 64-char Hexadecimal Private Keys', () => {
  const hexPrivateKey = '4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a';
  const sensitiveLog = `Signing order with private key ${hexPrivateKey}`;
  const sanitized = sanitizeLog(sensitiveLog);

  assert.strictEqual(sanitized.includes(hexPrivateKey), false);
  assert.strictEqual(sanitized.includes('***REDACTED_KEY***'), true);
});

test('Security Sanitization - Redacts Sensitive Object Fields', () => {
  const payload = {
    user: 'trader_1',
    apiKeyId: 'sec_abc12345',
    apiPrivateKey: '0x9999888877776666555544443333222211110000aaaa',
    normalField: 'testnet_order',
  };

  const serialized = sanitizeLog(payload);
  const parsed = JSON.parse(serialized);

  assert.strictEqual(parsed.apiKeyId, '***REDACTED***');
  assert.strictEqual(parsed.apiPrivateKey, '***REDACTED***');
  assert.strictEqual(parsed.normalField, 'testnet_order');
});

test('Security Enforcements - Testnet Host Enforcement', () => {
  // Ensure host contains testnet
  assert.strictEqual(config.polyesterApiHost.includes('testnet'), true);
});
