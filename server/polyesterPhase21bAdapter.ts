/**
 * Polyester Phase 21B Adapter
 * Implements real testnet order submission gated by manual approval.
 */

import { UpstreamAdapter } from './upstreamAdapter.js';
import { getSDKClient, executeHealthCheck } from './polyesterClient.js';
import { config, validateHostAllowlist } from './config.js';
import { addLog } from './logger.js';
import { orderApprovalStore } from './authGate.js';

export const polyesterPhase21bAdapter: UpstreamAdapter = {
  name: 'PolyesterPhase21bAdapter',

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
    if (!client) return { markets: [], status: 'error', source: 'SDK' };
    try {
      const spotConfig = await client.marketData.getSpotConfig();
      const overview = await client.marketOverview.list();
      
      const markets = spotConfig.pairs.map(p => {
        const stats = overview.markets.find(m => m.symbolId === p.symbolId);
        return {
          symbol: p.symbol,
          symbolId: p.symbolId,
          status: p.status,
          lastPrice: stats?.lastPrice || null,
          tickSize: p.tickSize,
          stepSize: p.stepSize,
          minQty: p.minQtyBase,
          minNotional: p.minNotionalQuote,
        };
      });

      return { markets, status: 'connected', source: 'SDK_SPOT_CONFIG' };
    } catch (err: any) {
      addLog('error', 'api', `Failed to fetch markets in 21B adapter: ${err.message}`);
      return { markets: [], status: 'error', source: 'SDK' };
    }
  },

  async getAccount() {
    const client = getSDKClient();
    if (!client) throw new Error('SDK client not initialized');
    
    // Note: This may fail if API key has no policy, as discovered in audit.
    try {
      const [balances, spotConfig] = await Promise.all([
        client.balances.list(),
        client.marketData.getSpotConfig()
      ]);

      const usdtAsset = spotConfig.assets.find(a => a.symbol === 'USDT');
      const usdcAsset = spotConfig.assets.find(a => a.symbol === 'USDC');
      
      const balance = balances.find(b => 
        (usdtAsset && b.assetId === usdtAsset.ledgerId) || 
        (usdcAsset && b.assetId === usdcAsset.ledgerId)
      );

      return {
        accountId: (client as any).auth?.accountId || 'unknown',
        availableBalance: balance ? Number(balance.available) : 0,
        currency: balance && usdtAsset && balance.assetId === usdtAsset.ledgerId ? 'USDT' : (usdcAsset ? 'USDC' : 'USDT'),
      };
    } catch (err: any) {
      addLog('warn', 'api', `Balance check failed: ${err.message}`);
      return {
        accountId: 'unknown',
        availableBalance: 0,
        currency: 'USDT',
      };
    }
  },

  async submitOrder(orderReq: any, approvalId?: string) {
    // SECURITY GATE
    if (config.botDryRun) {
      return { success: false, error: 'Real testnet order submission is disabled while BOT_DRY_RUN=true.' };
    }

    if (config.botAutoTradeEnabled) {
      return { success: false, error: 'Automated trading is strictly disabled.' };
    }

    const hostValidation = validateHostAllowlist(config.polyesterApiHost, false);
    if (!hostValidation.allowed) {
      return { success: false, error: hostValidation.reason || 'Only the official testnet host is allowed.' };
    }

    if (!approvalId) {
      return { success: false, error: 'Manual authorization (approvalId) is required for real testnet orders.' };
    }

    const client = getSDKClient();
    if (!client) return { success: false, error: 'SDK client not initialized' };

    let symbolId = orderReq.symbolId;
    if (!Number.isInteger(symbolId)) {
      try {
        const spotConfig = await client.marketData.getSpotConfig();
        const pair = spotConfig.pairs.find(
          market => market.symbol.toUpperCase() === String(orderReq.symbol).toUpperCase()
        );
        if (!pair) {
          return { success: false, error: `Testnet market not found for ${orderReq.symbol}.` };
        }
        symbolId = pair.symbolId;
      } catch (err: any) {
        addLog('error', 'api', `Failed to resolve testnet market for order: ${err.message}`);
        return { success: false, error: 'Unable to verify testnet market for order submission.' };
      }
    }

    // 1. Verify Approval
    const validation = orderApprovalStore.consumeApproval(approvalId, {
      symbolId,
      side: orderReq.side,
      type: orderReq.type === 'market' ? 'market_ioc' : 'limit_gtc', // Adjusted to common testnet types
      qty: String(orderReq.quantity),
      price: orderReq.price ? String(orderReq.price) : undefined,
    });

    if (!validation.valid) {
      return { success: false, error: `Authorization failed: ${validation.reason}` };
    }

    try {
      addLog('info', 'risk', `EXECUTING REAL TESTNET ORDER for ${orderReq.symbol} via Phase 21B Adapter`);
      
      // 2. Real Submission
      // clientOrderId is required for idempotency per SDK docs
      const clientOrderId = orderReq.clientOrderId || `cli_21b_${Date.now()}`;

      const result = await client.orders.create({
        symbolId,
        side: orderReq.side,
        qty: String(orderReq.quantity),
        clientOrderId,
        execution: orderReq.type === 'market' 
          ? { type: 'market_ioc' } 
          : { type: 'limit_gtc', price: String(orderReq.price), postOnly: orderReq.postOnly !== false },
      });

      addLog('info', 'risk', `Testnet order submitted successfully. Exchange ID: ${result.orderId}`);

      return {
        success: true,
        orderId: result.orderId,
        message: 'Order successfully submitted to Polyester testnet.',
      };
    } catch (err: any) {
      addLog('error', 'risk', `Real order submission failed: ${err.message}`);
      return { success: false, error: err.message, uncertain: true };
    }
  },

  async cancelOrder(orderId: string) {
    const client = getSDKClient();
    if (!client) return { success: false, error: 'SDK client not initialized' };
    
    try {
      addLog('info', 'risk', `Cancelling testnet order ${orderId}`);
      await client.orders.cancel({ orderId });
      return { success: true };
    } catch (err: any) {
      addLog('error', 'risk', `Cancellation failed for ${orderId}: ${err.message}`);
      return { success: false, error: err.message };
    }
  },

  async getOrderStatus(orderId: string) {
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

  async getOrderByClientOrderId(clientOrderId: string) {
    const client = getSDKClient();
    if (!client) return { success: false, found: false, error: 'SDK client not initialized' };

    try {
      const details = await client.orders.getDetails({ clientOrderId });
      return {
        success: true,
        found: Boolean(details?.order),
        orderId: details?.order.orderId,
        status: details?.order.status,
      };
    } catch (err: any) {
      addLog('error', 'risk', `Order reconciliation failed for client ID ${clientOrderId}: ${err.message}`);
      return { success: false, found: false, error: err.message };
    }
  },
};
