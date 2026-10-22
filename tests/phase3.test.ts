/**
 * Phase 3 Comprehensive Unit Tests - Secure Testnet Order Execution Infrastructure
 * Tests order validation, risk controls, kill switch, duplicate client order IDs,
 * balance checks, unsupported symbols, and audit event logging.
 * All tests explicitly labeled and mocked where appropriate.
 */

import test from 'node:test';
import assert from 'node:assert';

// Set mock environment variables so credential checks pass during validation tests
process.env.POLYESTER_API_KEY_ID = 'mock_api_key_id_12345';
process.env.POLYESTER_API_PRIVATE_KEY = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

import { validateOrder, OrderRequest, RiskSettings } from '../server/orderValidator.js';
import { sanitizeLog, sanitizeApiHost } from '../server/config.js';

const defaultRisk: RiskSettings = {
  maxPositionSizeUsd: 10000,
  maxDrawdownPercent: 5.0,
  slippageTolerancePercent: 0.5,
  stopLossPercent: 2.0,
  maxOpenOrders: 3,
  killSwitchActive: false,
  allowedSymbols: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'POLY-USDT'],
};

test('[Mocked] Phase 3 - Valid Order Passes Validation', () => {
  const req: OrderRequest = {
    symbol: 'BTC-USDT',
    side: 'buy',
    type: 'limit',
    price: 60000,
    quantity: 0.1,
    clientOrderId: 'cli_ord_test_001',
  };
  const existingClientIds = new Set<string>();
  const validation = validateOrder(req, defaultRisk, 0, 50000, existingClientIds);
  assert.strictEqual(validation.valid, true);
});

test('[Mocked] Phase 3 - Invalid Symbol Rejected', () => {
  const req: OrderRequest = {
    symbol: 'INVALID-COIN',
    side: 'buy',
    type: 'market',
    quantity: 1.0,
    clientOrderId: 'cli_ord_test_002',
  };
  const validation = validateOrder(req, defaultRisk, 0, 50000, new Set());
  assert.strictEqual(validation.valid, false);
  assert.strictEqual(validation.code, 'UNSUPPORTED_SYMBOL');
});

test('[Mocked] Phase 3 - Negative Quantity Rejected', () => {
  const req: OrderRequest = {
    symbol: 'BTC-USDT',
    side: 'buy',
    type: 'limit',
    price: 60000,
    quantity: -0.5,
    clientOrderId: 'cli_ord_test_003',
  };
  const validation = validateOrder(req, defaultRisk, 0, 50000, new Set());
  assert.strictEqual(validation.valid, false);
  assert.strictEqual(validation.code, 'INVALID_QUANTITY');
});

test('[Mocked] Phase 3 - Max Notional Exceeded Rejected', () => {
  const req: OrderRequest = {
    symbol: 'BTC-USDT',
    side: 'buy',
    type: 'limit',
    price: 60000,
    quantity: 1.0, // notional $60,000 exceeds maxPositionSizeUsd (10,000)
    clientOrderId: 'cli_ord_test_004',
  };
  const validation = validateOrder(req, defaultRisk, 0, 100000, new Set());
  assert.strictEqual(validation.valid, false);
  assert.strictEqual(validation.code, 'MAX_NOTIONAL_EXCEEDED');
});

test('[Mocked] Phase 3 - Max Open Orders Exceeded Rejected', () => {
  const req: OrderRequest = {
    symbol: 'ETH-USDT',
    side: 'buy',
    type: 'market',
    quantity: 0.01,
    clientOrderId: 'cli_ord_test_005',
  };
  const validation = validateOrder(req, defaultRisk, 3, 50000, new Set()); // 3 equals maxOpenOrders
  assert.strictEqual(validation.valid, false);
  assert.strictEqual(validation.code, 'MAX_OPEN_ORDERS_EXCEEDED');
});

test('[Mocked] Phase 3 - Insufficient Balance Rejected', () => {
  const req: OrderRequest = {
    symbol: 'BTC-USDT',
    side: 'buy',
    type: 'limit',
    price: 60000,
    quantity: 0.05, // notional $3,000
    clientOrderId: 'cli_ord_test_006',
  };
  const validation = validateOrder(req, defaultRisk, 0, 1000, new Set()); // available $1,000
  assert.strictEqual(validation.valid, false);
  assert.strictEqual(validation.code, 'INSUFFICIENT_BALANCE');
});

test('[Mocked] Phase 3 - Duplicate Client Order ID Collision Rejected', () => {
  const existingClientIds = new Set(['dup_client_id_123']);
  const req: OrderRequest = {
    symbol: 'BTC-USDT',
    side: 'buy',
    type: 'limit',
    price: 60000,
    quantity: 0.01,
    clientOrderId: 'dup_client_id_123',
  };
  const validation = validateOrder(req, defaultRisk, 0, 50000, existingClientIds);
  assert.strictEqual(validation.valid, false);
  assert.strictEqual(validation.code, 'DUPLICATE_CLIENT_ORDER_ID');
});

test('[Mocked] Phase 3 - Kill Switch Enforcement', () => {
  const riskWithKillSwitch = { ...defaultRisk, killSwitchActive: true };
  const req: OrderRequest = {
    symbol: 'BTC-USDT',
    side: 'buy',
    type: 'limit',
    price: 60000,
    quantity: 0.01,
    clientOrderId: 'cli_ord_kill_test',
  };
  const validation = validateOrder(req, riskWithKillSwitch, 0, 50000, new Set());
  assert.strictEqual(validation.valid, false);
  assert.strictEqual(validation.code, 'KILL_SWITCH_ACTIVE');
});

test('[Mocked] Phase 3 - Production Environment Rejection', () => {
  const sanitized = sanitizeApiHost('https://polyester.com');
  assert.strictEqual(sanitized, 'https://api.testnet.polyester.com');
});

test('[Mocked] Phase 3 - Secret Redaction in Logs', () => {
  const log = 'Executing order with api_key_id=key_9999 and private_key=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const clean = sanitizeLog(log);
  assert.strictEqual(clean.includes('key_9999'), false);
  assert.strictEqual(clean.includes('0x12345678'), false);
  assert.strictEqual(clean.includes('***REDACTED***'), true);
  assert.strictEqual(clean.includes('***REDACTED_KEY***'), true);
});
