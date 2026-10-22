/**
 * Polyester Official SDK Adapter - Phase 20
 * Implements the UpstreamAdapter interface using the official @polyester/sdk.
 * Strictly gated by safety controls and environment guards.
 */

import { UpstreamAdapter } from './upstreamAdapter.js';
import { getSDKClient, executeHealthCheck } from './polyesterClient.js';
import { config } from './config.js';
import { addLog } from './logger.js';
import { orderApprovalStore } from './authGate.js';

/**
 * Official SDK Adapter
 */
export const polyesterSdkAdapter: UpstreamAdapter = {
  name: 'PolyesterSdkAdapter',

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
    const client = getSDKClient();
    if (!client) {
      return { markets: [], status: 'error', source: 'SDK' };
    }
    try {
      // Using balances.list as a read-only probe for markets/assets or similar if needed,
      // but for now we rely on the existing getVerifiedMarkets in polyesterClient.js
      // which uses the documented /v1/spot/markets REST endpoint.
      return { markets: [], status: 'connected', source: 'SDK' };
    } catch (err: any) {
      return { markets: [], status: 'error', source: 'SDK' };
    }
  },

  async getAccount() {
    const client = getSDKClient();
    if (!client) {
      throw new Error('SDK client not initialized');
    }
    // Using official SDK to get real testnet balances
    const balances = await client.balances.list();
    const usdtBalance = balances.find((b: any) => b.asset === 'USDT' || b.currency === 'USDT');
    
    return {
      accountId: (client as any).auth?.accountId || 'unknown',
      availableBalance: usdtBalance ? Number(usdtBalance.available) : 0,
      currency: 'USDT',
    };
  },

  async submitOrder(orderReq: any, approvalId?: string) {
    // SECURITY GATE: PHASE 20 Safety Invariant
    // 1. Dry run must be true OR Manual Gated Approval must be granted.
    // 2. botAutoTradeEnabled must be false in Phase 20.
    
    if (config.botAutoTradeEnabled) {
      addLog('error', 'risk', 'SECURITY BREACH ATTEMPT: Automated trading detected in Phase 20. REJECTED.');
      return { success: false, error: 'Automated trading is strictly disabled in this phase.' };
    }

    if (!config.botDryRun) {
      // PHASE 21A: Manual Gated Approval Check
      if (!approvalId) {
        addLog('warn', 'risk', 'Order submission rejected: Missing manual authorization.');
        return { success: false, error: 'Manual authorization (approvalId) is required for real testnet orders.' };
      }

      const validation = orderApprovalStore.consumeApproval(approvalId, {
        symbolId: orderReq.symbolId || 1,
        side: orderReq.side,
        type: orderReq.type === 'market' ? 'market_ioc' : 'limit_fok',
        qty: String(orderReq.quantity),
        price: orderReq.price ? String(orderReq.price) : undefined,
      });

      if (!validation.valid) {
        addLog('error', 'risk', `Manual authorization failed: ${validation.reason}`);
        return { success: false, error: `Authorization failed: ${validation.reason}` };
      }

      // SECURITY LOCK: In Phase 21A, we still DO NOT submit live orders.
      // We only prove the gate works.
      addLog('info', 'risk', `MANUAL AUTHORIZATION VERIFIED for ${orderReq.symbol}. (Simulation only in Phase 21A)`);
      return { 
        success: true, 
        orderId: `authorized_simulation_${Date.now()}`,
        message: 'Manual authorization verified. Real submission is still disabled in Phase 21A.'
      };
    }

    const client = getSDKClient();
    if (!client) {
      return { success: false, error: 'SDK client not initialized' };
    }

    try {
      addLog('info', 'risk', `Dry-run order simulation for ${orderReq.symbol} via official SDK`);
      
      // In a real scenario, we would map orderReq.symbol to the numeric symbolId.
      // For this phase's simulation, we use a placeholder or try to find it if we have a market list.
      const symbolId = 1; // Placeholder for BTC-USDT or similar in testnet if unknown

      // Strictly dry-run: using .preview() as confirmed in SDK inspection
      // Using 'as any' to satisfy the strict SDK type which expects symbolId: number and qty: string
      const preview = await (client.orders as any).preview({
        symbolId,
        side: orderReq.side,
        qty: String(orderReq.quantity),
        execution: {
          type: orderReq.type === 'market' ? 'market_ioc' : 'limit_fok',
          price: orderReq.price ? String(orderReq.price) : undefined,
        }
      });

      return { 
        success: true, 
        orderId: `dry_run_${Date.now()}`,
        details: preview 
      };
    } catch (err: any) {
      addLog('error', 'risk', `Dry-run simulation failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  },

  async cancelOrder(orderId: string) {
    if (config.botDryRun) {
      return { success: true };
    }
    
    const client = getSDKClient();
    if (!client) return { success: false, error: 'SDK client not initialized' };
    
    try {
      await client.orders.cancel({ orderId });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async getOrderStatus(orderId: string) {
    if (config.botDryRun) {
      return { success: true, status: 'filled' };
    }

    const client = getSDKClient();
    if (!client) return { success: false, error: 'SDK client not initialized' };

    try {
      const details = await client.orders.getDetails({ orderId });
      return { 
        success: true, 
        status: details?.order.status || 'unknown' 
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};
