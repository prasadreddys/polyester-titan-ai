/**
 * Secure Order Validator & Risk Management Engine - Phase 3
 * Validates order parameters, precision, notional limits, open order counts,
 * account balance, allowed symbols, and duplicate client order IDs.
 */

import { addLog } from './logger.js';
import { config, validateHostAllowlist } from './config.js';
import { validateCredentialsFormat } from './credentialValidator.js';
import { getEmergencyKillSwitchState } from './orderManager.js';

export interface OrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price?: number;
  quantity: number;
  clientOrderId: string;
  postOnly?: boolean;
}

export interface RiskSettings {
  maxPositionSizeUsd: number;
  maxDrawdownPercent: number;
  slippageTolerancePercent: number;
  stopLossPercent: number;
  maxOpenOrders: number;
  killSwitchActive: boolean;
  allowedSymbols: string[];
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
}

const DEFAULT_ALLOWED_SYMBOLS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'POLY-USDT'];

export interface OrderValidatorOptions {
  feeBufferPercent?: number; // e.g. 10 for 10% fee reserve buffer
}

export function validateOrder(
  req: OrderRequest,
  risk: RiskSettings,
  currentOpenOrdersCount: number,
  availableBalanceUsd: number,
  existingClientOrderIds: Set<string>,
  options?: OrderValidatorOptions
): ValidationResult {
  // 1. Kill Switch Check
  if (risk.killSwitchActive || getEmergencyKillSwitchState()) {
    addLog('warn', 'risk', 'Order rejected: Emergency Kill Switch is active.');
    return { valid: false, error: 'Order rejected: Emergency Kill Switch is active.', code: 'KILL_SWITCH_ACTIVE' };
  }

  // 1.5 Testnet Environment Guard
  if (!validateHostAllowlist(config.polyesterApiHost).allowed) {
    addLog('warn', 'risk', 'Order rejected: Production environment detected. Testnet isolation enforced.');
    return { valid: false, error: 'Order rejected: Production environment detected. Testnet isolation enforced.', code: 'PRODUCTION_HOST_REJECTED' };
  }

  // 2. Credentials check (checks live env variables securely without leaking secret values)
  const credCheck = validateCredentialsFormat(
    process.env.POLYESTER_API_KEY_ID,
    process.env.POLYESTER_API_SECRET_HEX || process.env.POLYESTER_API_PRIVATE_KEY
  );
  if (!credCheck.valid) {
    addLog('warn', 'risk', `Order rejected: ${credCheck.error}`);
    return { valid: false, error: credCheck.error, code: credCheck.code };
  }

  // 3. Symbol Validation
  const symbol = (req.symbol || '').trim().toUpperCase();
  if (!symbol) {
    return { valid: false, error: 'Invalid or missing trading symbol.', code: 'INVALID_SYMBOL' };
  }
  const allowed = risk.allowedSymbols && risk.allowedSymbols.length > 0 ? risk.allowedSymbols : DEFAULT_ALLOWED_SYMBOLS;
  if (!allowed.includes(symbol)) {
    addLog('warn', 'risk', `Order rejected: Symbol ${symbol} is not allowed by risk policy.`);
    return { valid: false, error: `Symbol ${symbol} is unsupported or disallowed.`, code: 'UNSUPPORTED_SYMBOL' };
  }

  // 4. Side Validation
  if (req.side !== 'buy' && req.side !== 'sell') {
    return { valid: false, error: 'Order side must be either "buy" or "sell".', code: 'INVALID_SIDE' };
  }

  // 5. Type Validation
  if (req.type !== 'limit' && req.type !== 'market') {
    return { valid: false, error: 'Order type must be "limit" or "market".', code: 'INVALID_TYPE' };
  }

  // 6. Quantity and Price Validation
  const qty = Number(req.quantity);
  if (isNaN(qty) || qty <= 0) {
    return { valid: false, error: 'Order quantity must be greater than zero.', code: 'INVALID_QUANTITY' };
  }

  const price = req.type === 'limit' ? Number(req.price) : 50000; // estimated market ref if market
  if (req.type === 'limit' && (isNaN(price) || price <= 0)) {
    return { valid: false, error: 'Limit order price must be greater than zero.', code: 'INVALID_PRICE' };
  }

  // 7. Notional Value Check
  const notionalUsd = qty * (req.type === 'limit' ? price : 50000);
  if (notionalUsd > risk.maxPositionSizeUsd) {
    addLog('warn', 'risk', `Order rejected: Notional value $${notionalUsd.toFixed(2)} exceeds max position size limit of $${risk.maxPositionSizeUsd}.`);
    return { valid: false, error: `Order notional $${notionalUsd.toFixed(2)} exceeds max allowed $${risk.maxPositionSizeUsd}.`, code: 'MAX_NOTIONAL_EXCEEDED' };
  }

  // 8. Max Open Orders Check
  if (currentOpenOrdersCount >= risk.maxOpenOrders) {
    addLog('warn', 'risk', `Order rejected: Max open orders limit (${risk.maxOpenOrders}) reached.`);
    return { valid: false, error: `Max open orders limit (${risk.maxOpenOrders}) reached.`, code: 'MAX_OPEN_ORDERS_EXCEEDED' };
  }

  // 9. Balance Check with Fee Reserve Buffer
  const feeBufferPercent = options?.feeBufferPercent !== undefined ? options.feeBufferPercent : 10;
  const requiredBalanceUsd = notionalUsd * (1 + feeBufferPercent / 100);

  if (req.side === 'buy' && requiredBalanceUsd > availableBalanceUsd) {
    addLog('warn', 'risk', `Order rejected: Insufficient balance including ${feeBufferPercent}% fee reserve. Required $${requiredBalanceUsd.toFixed(2)} (Notional: $${notionalUsd.toFixed(2)}), Available $${availableBalanceUsd.toFixed(2)}.`);
    return { 
      valid: false, 
      error: `Insufficient balance with ${feeBufferPercent}% fee reserve. Required $${requiredBalanceUsd.toFixed(2)}, Available $${availableBalanceUsd.toFixed(2)}.`, 
      code: 'INSUFFICIENT_BALANCE' 
    };
  }

  // 10. Duplicate Client Order ID Check (Idempotency / Signal Protection)
  const clientOrderId = (req.clientOrderId || '').trim();
  if (!clientOrderId) {
    return { valid: false, error: 'Unique clientOrderId is required for order submission.', code: 'MISSING_CLIENT_ORDER_ID' };
  }
  if (existingClientOrderIds.has(clientOrderId)) {
    addLog('warn', 'risk', `Order rejected: Duplicate clientOrderId collision detected (${clientOrderId}).`);
    return { valid: false, error: `Duplicate clientOrderId collision detected (${clientOrderId}).`, code: 'DUPLICATE_CLIENT_ORDER_ID' };
  }

  return { valid: true };
}
