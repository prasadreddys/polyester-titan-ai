/**
 * Upstream Adapter Contract & Default REST Implementation - Phase 8
 * Provides a swappable adapter interface for Polyester testnet integration,
 * enabling official SDK or custom gateway adapters without rewriting strategy/order engines.
 */

import { config } from './config.js';
import { executeHealthCheck, getVerifiedMarkets } from './polyesterClient.js';
import { getAccountBalance } from './orderManager.js';

export interface UpstreamAdapter {
  name: string;
  isConfigured(): boolean;
  checkHealth(): Promise<{ status: string; httpStatus: number | null; message: string }>;
  getMarkets(): Promise<{ markets: any[]; status: string; source: string }>;
  getAccount(): Promise<{ accountId: string; availableBalance: number; currency: string }>;
  submitOrder(
    orderReq: any,
    approvalId?: string,
    options?: { forceLive?: boolean }
  ): Promise<{ success: boolean; orderId?: string; message?: string; error?: string; uncertain?: boolean }>;
  cancelOrder(orderId: string): Promise<{ success: boolean; error?: string }>;
  getOrderStatus(orderId: string): Promise<{ success: boolean; status?: string; error?: string }>;
  getOrderByClientOrderId?(clientOrderId: string): Promise<{ success: boolean; found: boolean; orderId?: string; status?: string; error?: string }>;
}

export const defaultRestAdapter: UpstreamAdapter = {
  name: 'DefaultRestAdapter',
  isConfigured() {
    return Boolean(config.hasApiKeyId && config.hasApiSecretHex);
  },
  async checkHealth() {
    const health = await executeHealthCheck();
    return {
      status: health.status,
      httpStatus: health.httpStatus,
      message: health.errorMessage || 'Health check completed',
    };
  },
  async getMarkets() {
    return await getVerifiedMarkets();
  },
  async getAccount() {
    const acct = getAccountBalance();
    return {
      accountId: acct.accountId,
      availableBalance: acct.availableBalance,
      currency: acct.currency,
    };
  },
  async submitOrder(orderReq, approvalId, options) {
    return { success: true, orderId: `adapter_ord_${Date.now()}` };
  },
  async cancelOrder(orderId) {
    return { success: true };
  },
  async getOrderStatus(orderId) {
    return { success: true, status: 'filled' };
  },
};

import { polyesterSdkAdapter } from './polyesterAdapter.js';
import { polyesterPhase21bAdapter } from './polyesterPhase21bAdapter.js';

let currentAdapter: UpstreamAdapter = polyesterPhase21bAdapter;

export function setUpstreamAdapter(adapter: UpstreamAdapter) {
  currentAdapter = adapter;
}

export function getUpstreamAdapter(): UpstreamAdapter {
  return currentAdapter;
}
