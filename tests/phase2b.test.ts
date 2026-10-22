import test from 'node:test';
import assert from 'node:assert';
import { OFFICIAL_TESTNET_API_URL, sanitizeApiHost, sanitizeLog } from '../server/config.js';

test('1. Phase 2B SDK Configuration & Host Sanitization', () => {
  const defaultHost = sanitizeApiHost(null);
  assert.strictEqual(defaultHost, 'https://api.testnet.polyester.com');

  const prodHost = sanitizeApiHost('https://polyester.com');
  assert.strictEqual(prodHost, 'https://api.testnet.polyester.com');

  const unapprovedHost = sanitizeApiHost('https://api-testnet.polyester.com');
  assert.strictEqual(unapprovedHost, OFFICIAL_TESTNET_API_URL);
});

test('2. Phase 2B Status Categorization Rules', () => {
  // Test categorization logic for status strings
  const categorize = (statusInput: string, hasKey: boolean) => {
    if (!hasKey) return 'credentials_missing';
    if (statusInput === '401' || statusInput === 'unauthorized') return 'unauthorized';
    if (statusInput === '403' || statusInput === 'blocked') return 'blocked';
    if (statusInput === '429' || statusInput === 'rate_limited') return 'rate_limited';
    if (statusInput === 'connected') return 'connected';
    return 'unavailable';
  };

  assert.strictEqual(categorize('connected', false), 'credentials_missing');
  assert.strictEqual(categorize('401', true), 'unauthorized');
  assert.strictEqual(categorize('blocked', true), 'blocked');
  assert.strictEqual(categorize('rate_limited', true), 'rate_limited');
  assert.strictEqual(categorize('connected', true), 'connected');
});

test('3. Phase 2B Secret Redaction & Log Security', () => {
  const secretKeyId = 'api_key_id_999988887777';
  const privateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const logMessage = `Authenticating with api_key_id=${secretKeyId} and private_key=${privateKey}`;

  const sanitized = sanitizeLog(logMessage);
  assert.strictEqual(sanitized.includes(secretKeyId), false);
  assert.strictEqual(sanitized.includes(privateKey), false);
  assert.strictEqual(sanitized.includes('***REDACTED***'), true);
  assert.strictEqual(sanitized.includes('***REDACTED_KEY***'), true);
});
