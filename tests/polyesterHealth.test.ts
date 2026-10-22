import test from 'node:test';
import assert from 'node:assert';
import { evaluateHealthResponse, getLocalAppHealth } from '../server/polyesterClient.js';

test('Polyester Health Evaluation - Cloudflare Managed Challenge Detection', () => {
  const result = evaluateHealthResponse(
    403,
    'Forbidden',
    'text/html; charset=UTF-8',
    '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><script>cf-mitigated</script></body></html>',
    { 'server': 'cloudflare', 'cf-ray': 'a4e1fe-TPE' }
  );

  assert.strictEqual(result.status, 'blocked');
  assert.strictEqual(result.isCloudflareBlocked, true);
  assert.strictEqual(result.schemaValid, false);
  assert.strictEqual(result.parsedData, null);
  assert.match(result.errorMessage || '', /Cloudflare Managed Challenge/);
});

test('Polyester Health Evaluation - Rate Limiting (HTTP 429)', () => {
  const result = evaluateHealthResponse(
    429,
    'Too Many Requests',
    'application/json',
    '{"error":"Rate limit exceeded"}',
    { 'retry-after': '60' }
  );

  assert.strictEqual(result.status, 'rate_limited');
  assert.strictEqual(result.isRateLimited, true);
  assert.strictEqual(result.retryAfterSeconds, 60);
  assert.strictEqual(result.schemaValid, false);
});

test('Polyester Health Evaluation - Valid 200 JSON Schema', () => {
  const validJson = JSON.stringify({
    status: 'ok',
    timestamp: '2026-10-21T17:00:00Z',
    version: '1.0.0',
    network: 'polyester-testnet',
  });

  const result = evaluateHealthResponse(
    200,
    'OK',
    'application/json; charset=utf-8',
    validJson,
    {}
  );

  assert.strictEqual(result.status, 'connected');
  assert.strictEqual(result.schemaValid, true);
  assert.strictEqual(result.isCloudflareBlocked, false);
  assert.notStrictEqual(result.parsedData, null);
  assert.strictEqual(result.parsedData?.status, 'ok');
});

test('Polyester Health Evaluation - HTTP 200 with HTML (Refuses to parse as valid schema)', () => {
  const result = evaluateHealthResponse(
    200,
    'OK',
    'text/html',
    '<html><body>Gateway Page</body></html>',
    {}
  );

  assert.strictEqual(result.status, 'disconnected');
  assert.strictEqual(result.schemaValid, false);
  assert.strictEqual(result.parsedData, null);
  assert.match(result.errorMessage || '', /non-JSON response/);
});

test('Polyester Health Evaluation - Upstream 503 Server Error', () => {
  const result = evaluateHealthResponse(
    503,
    'Service Unavailable',
    'text/plain',
    'Service Unavailable',
    {}
  );

  assert.strictEqual(result.status, 'disconnected');
  assert.strictEqual(result.schemaValid, false);
  assert.match(result.errorMessage || '', /503/);
});

test('Local Application Health Separation', () => {
  const localHealth = getLocalAppHealth();
  assert.strictEqual(localHealth.status, 'healthy');
  assert.strictEqual(typeof localHealth.uptimeSeconds, 'number');
  assert.strictEqual(typeof localHealth.port, 'number');
  assert.strictEqual(localHealth.service, 'polyester-titan-ai-bridge');
});
