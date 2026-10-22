/**
 * Phase 21G: Safe Manual Cancellation and Reconciliation Handler
 */

import { getSDKClient } from './polyesterClient.js';
import { config, validateHostAllowlist } from './config.js';
import { addLog } from './logger.js';
import { polyesterPhase21bAdapter } from './polyesterPhase21bAdapter.js';

export interface ReconciliationReport {
  orderId: string;
  status: string;
  isActive: boolean;
  totalQty: string;
  cumQty: string;
  remainingQty: string;
  avgPx: string;
  availableBalances: any[];
  timestamp: string;
  rawResponse: any;
}

export async function reconcileTargetOrder(orderId: string): Promise<ReconciliationReport> {
  const hostCheck = validateHostAllowlist(config.polyesterApiHost);
  if (!hostCheck.allowed) {
    throw new Error(hostCheck.reason || 'Only an allowlisted testnet host is permitted.');
  }

  const client = getSDKClient();
  if (!client) throw new Error('SDK client not initialized');

  const fetchWithRetry = async () => {
    let attempts = 0;
    while (attempts < 3) {
      try {
        return await client.orders.getDetails({ orderId });
      } catch (err: any) {
        const msg = err.message?.toLowerCase() || '';
        if (msg.includes('unavailable') || msg.includes('timeout')) {
          attempts++;
          addLog('warn', 'api', `Upstream temporary error during reconciliation (attempt ${attempts}): ${err.message}`);
          await new Promise(r => setTimeout(r, 1000 * attempts));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Upstream service consistently unavailable during reconciliation.');
  };

  addLog('info', 'risk', `Phase 21G: Reconciling target order ${orderId}`);

  // 1. Fetch order details
  const details = await fetchWithRetry();
  if (!details || !details.order) {
    throw new Error(`Order ${orderId} not found on exchange.`);
  }

  const order = details.order;
  const activeStates = ['working', 'open', 'partially_filled', 'pending'];
  const isActive = activeStates.includes(order.status);

  // 2. Fetch balances with similar retry logic if needed, but keeping it simple for now
  const balances = await client.balances.list();
  const spotConfig = await client.marketData.getSpotConfig();
  
  const enrichedBalances = balances
    .filter(b => parseFloat(b.available) > 0)
    .map(b => {
      const asset = spotConfig.assets.find(a => a.ledgerId === b.assetId);
      return {
        assetId: b.assetId,
        symbol: asset?.symbol || 'UNKNOWN',
        available: b.available,
        reserved: b.reserved
      };
    });

  return {
    orderId: order.orderId,
    status: order.status,
    isActive,
    totalQty: order.totalQty || 'Unavailable',
    cumQty: order.cumQty || '0',
    remainingQty: order.leavesQty || '0',
    avgPx: order.avgPx || '0',
    availableBalances: enrichedBalances,
    timestamp: new Date().toISOString(),
    rawResponse: details // Sanitized enough as it's just the order/trades response
  };
}

export async function cancelTargetOrder(orderId: string, confirmed: boolean) {
  if (!confirmed) {
    throw new Error('Explicit operator confirmation required for cancellation.');
  }

  if (config.botAutoTradeEnabled) {
     throw new Error('Automated trading safety lock active.');
  }
  if (config.botDryRun) {
    throw new Error('Exchange cancellation is disabled while BOT_DRY_RUN=true.');
  }

  const client = getSDKClient();
  if (!client) throw new Error('SDK client not initialized');

  addLog('info', 'risk', `Phase 21G: Operator authorized cancellation for order ${orderId}`);

  // 1. Double check status before cancellation
  const audit = await reconcileTargetOrder(orderId);
  if (!audit.isActive) {
    return { 
      success: false, 
      message: `Order is already in a terminal state: ${audit.status}`,
      audit
    };
  }

  // 2. Execute cancellation with retry for temporary failures
  let cancelResult: any;
  let cancelAttempts = 0;
  while (cancelAttempts < 3) {
    cancelResult = await polyesterPhase21bAdapter.cancelOrder(orderId);
    if (cancelResult.success) break;

    const errorMsg = cancelResult.error?.toLowerCase() || '';
    if (errorMsg.includes('unavailable') || errorMsg.includes('timeout')) {
      cancelAttempts++;
      addLog('warn', 'risk', `Upstream temporary error during cancellation (attempt ${cancelAttempts}): ${cancelResult.error}`);
      await new Promise(r => setTimeout(r, 1000 * cancelAttempts));
      continue;
    }
    break; // Non-retryable error
  }
  
  // 3. Post-cancellation reconciliation with retry/polling
  let finalAudit = audit;
  let attempts = 0;
  const maxAttempts = 5; // Increased attempts for post-cancellation sync
  
  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 2000)); // Wait for exchange state to propagate
    try {
      finalAudit = await reconcileTargetOrder(orderId);
      if (!finalAudit.isActive) break;
    } catch (err) {
      addLog('warn', 'risk', `Post-cancellation reconciliation attempt ${attempts + 1} failed, retrying...`);
    }
    attempts++;
  }

  return {
    success: cancelResult.success,
    cancellationResponse: cancelResult,
    finalAudit
  };
}
