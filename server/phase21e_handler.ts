/**
 * Phase 21E Lifecycle Execution Handler
 * Implements the mandatory gates and execution logic for the single-order testnet test.
 */

import { getSDKClient } from './polyesterClient.js';
import { config, validateHostAllowlist } from './config.js';
import { orderApprovalStore } from './authGate.js';
import { addLog } from './logger.js';
import { polyesterPhase21bAdapter } from './polyesterPhase21bAdapter.js';

export interface StagedOrderParams {
  symbolId: number;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit';
  qty: string;
  price: string;
  maxNotional: number;
}

const STAGED_ORDER: StagedOrderParams = {
  symbolId: 1,
  symbol: 'BTC-USDT',
  side: 'buy',
  type: 'limit',
  qty: '0.00006355',
  price: '78678.76',
  maxNotional: 5.01
};

export async function getStagedOrderPreview() {
  const hostCheck = validateHostAllowlist(config.polyesterApiHost);
  if (!hostCheck.allowed) {
    throw new Error(hostCheck.reason || 'Only an allowlisted testnet host is permitted.');
  }

  const client = getSDKClient();
  if (!client) throw new Error('SDK client not initialized');

  // 1. Host & Identity check
  const me = await client.auth.me();

  // 2. Fresh Market Rules
  const spotConfig = await client.marketData.getSpotConfig();
  const btcPair = spotConfig.pairs.find(p => p.symbolId === STAGED_ORDER.symbolId);
  if (!btcPair) throw new Error('BTC-USDT market rules not found.');

  // 3. Balance Check
  const balances = await client.balances.list();
  const usdtAsset = spotConfig.assets.find(a => a.symbol === 'USDT');
  const usdtBal = usdtAsset ? balances.find(b => b.assetId === usdtAsset.ledgerId) : null;
  const availableUsdt = usdtBal ? parseFloat(usdtBal.available) : 0;

  // 4. Preview
  const preview = await client.orders.preview({
    symbolId: STAGED_ORDER.symbolId,
    side: STAGED_ORDER.side,
    qty: STAGED_ORDER.qty,
    execution: {
      type: 'limit_gtc',
      price: STAGED_ORDER.price,
      postOnly: false
    }
  });

  return {
    staged: STAGED_ORDER,
    preview,
    account: {
      id: me.accountId,
      availableUsdt
    },
    market: {
      tickSize: btcPair.tickSize,
      stepSize: btcPair.stepSize,
      minQty: btcPair.minQtyBase,
      minNotional: btcPair.minNotionalQuote
    }
  };
}

export async function executeLifecycleTest(confirmed: boolean) {
  if (!confirmed) {
    throw new Error('Explicit operator confirmation required.');
  }
  if (config.botDryRun) {
    throw new Error('Phase 21E order submission is disabled while BOT_DRY_RUN=true.');
  }
  if (config.botAutoTradeEnabled) {
    throw new Error('Phase 21E order submission is disabled while BOT_AUTO_TRADE_ENABLED=true.');
  }

  // Mandatory re-verification of all gates
  const audit = await getStagedOrderPreview();
  if (!audit.preview.admissible) {
    throw new Error('Order preview rejected by exchange.');
  }

  if (audit.account.availableUsdt < audit.staged.maxNotional) {
    throw new Error('Insufficient balance for test order.');
  }

  // 1. Create one-time approval
  const approvalId = orderApprovalStore.createApproval({
    symbolId: audit.staged.symbolId,
    side: audit.staged.side,
    type: 'limit_gtc',
    maxQty: audit.staged.qty,
    maxPrice: audit.staged.price,
    maxNotional: audit.staged.maxNotional,
  });

  addLog('info', 'risk', `Phase 21E: Executing lifecycle test with approval ${approvalId}`);

  // 2. Submit Order
  const submitResult = await polyesterPhase21bAdapter.submitOrder({
    symbolId: audit.staged.symbolId,
    symbol: audit.staged.symbol,
    side: audit.staged.side,
    type: 'limit',
    quantity: parseFloat(audit.staged.qty),
    price: parseFloat(audit.staged.price),
    clientOrderId: `phase21e_${Date.now()}`
  }, approvalId);

  if (!submitResult.success || !submitResult.orderId) {
    throw new Error(`Order submission failed: ${submitResult.error}`);
  }

  const orderId = submitResult.orderId;
  addLog('info', 'risk', `Phase 21E: Order submitted. ID: ${orderId}. Waiting for status...`);

  // 3. Query Status
  // Wait a moment for the order to hit the book
  await new Promise(r => setTimeout(r, 2000));
  const statusResult = await polyesterPhase21bAdapter.getOrderStatus(orderId);
  
  // 4. Cancel Order
  let cancelResult = null;
  if (statusResult.success && (statusResult.status === 'open' || statusResult.status === 'partially_filled' || statusResult.status === 'working')) {
    addLog('info', 'risk', `Phase 21E: Order ${orderId} is ${statusResult.status}. Cancelling...`);
    cancelResult = await polyesterPhase21bAdapter.cancelOrder(orderId);
  }

  // 5. Final Reconciliation
  const finalStatus = await polyesterPhase21bAdapter.getOrderStatus(orderId);

  return {
    submission: submitResult,
    initialStatus: statusResult.status,
    cancellation: cancelResult,
    finalStatus: finalStatus.status,
    audit
  };
}
