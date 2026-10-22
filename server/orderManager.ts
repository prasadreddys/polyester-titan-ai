/**
 * Secure Testnet Order Manager & Lifecycle Engine - Phase 3
 * Manages order state, client order ID reconciliation, audit events,
 * open orders, cancellation, and safe dry-run testnet execution.
 */

import { addLog } from './logger.js';
import { validateOrder, OrderRequest, RiskSettings } from './orderValidator.js';
import { config } from './config.js';

export interface ManagedOrder {
  orderId: string;
  clientOrderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price?: number;
  quantity: number;
  status: 'pending' | 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected';
  filledQuantity: number;
  averageFillPrice?: number;
  notionalUsd: number;
  createdAt: string;
  updatedAt: string;
  rejectReason?: string;
  isDryRun: boolean;
}

export interface AuditEvent {
  eventId: string;
  timestamp: string;
  eventType: 'ORDER_SUBMITTED' | 'ORDER_VALIDATED' | 'ORDER_REJECTED' | 'ORDER_CANCELLED' | 'ORDER_FILLED' | 'KILL_SWITCH_TRIGGERED';
  details: Record<string, unknown>;
}

// In-memory order and audit stores
const activeOrders = new Map<string, ManagedOrder>();
const clientOrderIds = new Set<string>();
const auditEvents: AuditEvent[] = [];

let mockAccountBalanceUsd = 25000.00; // Simulated testnet USDT starting balance
let emergencyKillSwitchActive = false;

export function getEmergencyKillSwitchState(): boolean {
  return emergencyKillSwitchActive;
}

export function setEmergencyKillSwitchState(active: boolean): void {
  emergencyKillSwitchActive = active;
  addLog('warn', 'risk', `Emergency Kill Switch state changed: active=${active}`);
  recordAuditEvent('KILL_SWITCH_TRIGGERED', { active, timestamp: new Date().toISOString() });
}

export function getAccountBalance() {
  return {
    accountId: process.env.POLYESTER_ACCOUNT_ID ? 'testnet_acct_***' : 'unconfigured_account',
    currency: 'USDT',
    totalBalance: mockAccountBalanceUsd,
    availableBalance: mockAccountBalanceUsd,
    lockedBalance: 0.00,
    isMocked: true, // Clearly labeled as testnet simulated account balance per spec
    updatedAt: new Date().toISOString(),
  };
}

export function recordAuditEvent(eventType: AuditEvent['eventType'], details: Record<string, unknown>) {
  const event: AuditEvent = {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    eventType,
    details,
  };
  auditEvents.unshift(event);
  if (auditEvents.length > 200) auditEvents.pop();
  addLog('info', 'risk', `[Audit] ${eventType}`, details);
}

export function listManagedOrders(): ManagedOrder[] {
  return Array.from(activeOrders.values());
}

export function getManagedOrder(orderId: string): ManagedOrder | null {
  return activeOrders.get(orderId) || null;
}

import { getUpstreamAdapter } from './upstreamAdapter.js';

export async function createManagedOrder(
  req: OrderRequest,
  risk: RiskSettings,
  approvalId?: string
): Promise<{ success: boolean; order?: ManagedOrder; error?: string; code?: string }> {
  const openCount = Array.from(activeOrders.values()).filter(
    o => o.status === 'open' || o.status === 'partially_filled' || o.status === 'pending'
  ).length;
  const isDryRun = config.botDryRun;
  const adapter = isDryRun ? null : getUpstreamAdapter();

  if (!isDryRun && !approvalId) {
    return {
      success: false,
      error: 'Manual authorization (approvalId) is required for real testnet orders.',
      code: 'MANUAL_APPROVAL_REQUIRED',
    };
  }

  let balance = getAccountBalance().availableBalance;
  if (adapter) {
    try {
      balance = (await adapter.getAccount()).availableBalance;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unable to read testnet balance.',
        code: 'UPSTREAM_BALANCE_FAILURE',
      };
    }
  }

  // Validate order against risk & rules
  const validation = validateOrder(req, risk, openCount, balance, clientOrderIds);
  if (!validation.valid) {
    recordAuditEvent('ORDER_REJECTED', {
      clientOrderId: req.clientOrderId,
      symbol: req.symbol,
      reason: validation.error,
      code: validation.code,
    });
    return { success: false, error: validation.error, code: validation.code };
  }

  let orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const notionalUsd = req.quantity * (req.type === 'limit' && req.price ? req.price : 50000);

  // If not dry-run, submit to upstream adapter
  if (!isDryRun) {
    if (!adapter) {
      return { success: false, error: 'Testnet order adapter is unavailable.', code: 'UPSTREAM_UNAVAILABLE' };
    }

    addLog('info', 'risk', `Submitting non-dry-run order ${req.clientOrderId} to ${adapter.name} with approvalId: ${approvalId || 'NONE'}`);
    let upstream;
    try {
      upstream = await adapter.submitOrder(req, approvalId);
    } catch (err) {
      upstream = {
        success: false,
        uncertain: true,
        error: err instanceof Error ? err.message : 'Order submission outcome is uncertain.',
      };
    }
    if (!upstream.success) {
      if (upstream.uncertain) {
        const uncertainOrder: ManagedOrder = {
          orderId: `uncertain_${req.clientOrderId}`,
          clientOrderId: req.clientOrderId,
          symbol: req.symbol.toUpperCase(),
          side: req.side,
          type: req.type,
          price: req.price,
          quantity: req.quantity,
          status: 'pending',
          filledQuantity: 0,
          notionalUsd,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isDryRun: false,
        };
        activeOrders.set(uncertainOrder.orderId, uncertainOrder);
        clientOrderIds.add(req.clientOrderId);
        recordAuditEvent('ORDER_REJECTED', {
          clientOrderId: req.clientOrderId,
          symbol: req.symbol,
          reason: 'Submission outcome is uncertain; reconcile before any retry.',
          code: 'ORDER_STATUS_UNCERTAIN',
        });
        return {
          success: false,
          order: uncertainOrder,
          error: 'Submission outcome is uncertain. Reconcile this client order ID before retrying.',
          code: 'ORDER_STATUS_UNCERTAIN',
        };
      }
      recordAuditEvent('ORDER_REJECTED', {
        clientOrderId: req.clientOrderId,
        symbol: req.symbol,
        reason: upstream.error || 'Upstream submission failed',
        code: 'UPSTREAM_FAILURE',
      });
      return { success: false, error: upstream.error || 'Upstream submission failed', code: 'UPSTREAM_FAILURE' };
    }
    if (!upstream.orderId) {
      clientOrderIds.add(req.clientOrderId);
      const uncertainOrder: ManagedOrder = {
        orderId: `uncertain_${req.clientOrderId}`,
        clientOrderId: req.clientOrderId,
        symbol: req.symbol.toUpperCase(),
        side: req.side,
        type: req.type,
        price: req.price,
        quantity: req.quantity,
        status: 'pending',
        filledQuantity: 0,
        notionalUsd,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDryRun: false,
      };
      activeOrders.set(uncertainOrder.orderId, uncertainOrder);
      recordAuditEvent('ORDER_REJECTED', {
        clientOrderId: req.clientOrderId,
        symbol: req.symbol,
        reason: 'Upstream accepted order without returning an exchange order ID.',
        code: 'UPSTREAM_ORDER_ID_MISSING',
      });
      return {
        success: false,
        order: uncertainOrder,
        error: 'Upstream accepted the order but did not return an exchange order ID. Reconcile before retrying.',
        code: 'ORDER_STATUS_UNCERTAIN',
      };
    }
    orderId = upstream.orderId;
  }

  const newOrder: ManagedOrder = {
    orderId,
    clientOrderId: req.clientOrderId,
    symbol: req.symbol.toUpperCase(),
    side: req.side,
    type: req.type,
    price: req.price,
    quantity: req.quantity,
    status: 'open',
    filledQuantity: 0,
    notionalUsd,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDryRun,
  };

  activeOrders.set(orderId, newOrder);
  clientOrderIds.add(req.clientOrderId);

  // Only dry-run orders adjust the local simulated balance.
  if (isDryRun && req.side === 'buy') {
    mockAccountBalanceUsd = Math.max(0, mockAccountBalanceUsd - notionalUsd);
  }

  recordAuditEvent('ORDER_SUBMITTED', {
    orderId,
    clientOrderId: req.clientOrderId,
    symbol: newOrder.symbol,
    side: newOrder.side,
    notionalUsd,
    isDryRun: newOrder.isDryRun,
  });

  return { success: true, order: newOrder };
}

export async function cancelManagedOrder(orderId: string): Promise<{ success: boolean; order?: ManagedOrder; error?: string }> {
  const order = activeOrders.get(orderId);
  if (!order) {
    return { success: false, error: 'Order not found.' };
  }

  if (order.status === 'filled' || order.status === 'cancelled' || order.status === 'rejected') {
    return { success: false, error: `Cannot cancel order in status: ${order.status}.` };
  }
  if (order.status === 'pending' && order.orderId.startsWith('uncertain_')) {
    return { success: false, order, error: 'Reconcile this uncertain order before attempting cancellation.' };
  }

  if (!order.isDryRun) {
    const adapter = getUpstreamAdapter();
    let upstream;
    try {
      upstream = await adapter.cancelOrder(order.orderId);
    } catch (err) {
      return {
        success: false,
        order,
        error: err instanceof Error ? err.message : 'Upstream cancellation outcome is uncertain.',
      };
    }
    if (!upstream.success) {
      return { success: false, order, error: upstream.error || 'Upstream cancellation failed.' };
    }

    let statusResult;
    try {
      statusResult = await adapter.getOrderStatus(order.orderId);
    } catch (err) {
      return {
        success: false,
        order,
        error: err instanceof Error
          ? `Cancellation was requested, but final status could not be confirmed: ${err.message}`
          : 'Cancellation was requested, but final status could not be confirmed.',
      };
    }
    if (!statusResult.success) {
      return {
        success: false,
        order,
        error: statusResult.error
          ? `Cancellation was requested, but final status could not be confirmed: ${statusResult.error}`
          : 'Cancellation was requested, but final status could not be confirmed.',
      };
    }

    const status = statusResult.status?.toLowerCase();
    if (status === 'canceled' || status === 'cancelled') {
      order.status = 'cancelled';
    } else {
      if (status === 'filled') {
        order.status = 'filled';
      } else if (status === 'partially_filled') {
        order.status = 'partially_filled';
      } else if (status === 'open' || status === 'working') {
        order.status = 'open';
      } else if (status === 'pending') {
        order.status = 'pending';
      }
      order.updatedAt = new Date().toISOString();
      return {
        success: false,
        order,
        error: `Cancellation was requested, but terminal cancellation was not confirmed (status: ${statusResult.status || 'unknown'}).`,
      };
    }
  }

  order.status = 'cancelled';
  order.updatedAt = new Date().toISOString();

  // Release locked balance if buy
  if (order.isDryRun && order.side === 'buy') {
    const remainingQty = order.quantity - order.filledQuantity;
    const releasedUsd = remainingQty * (order.price || 50000);
    mockAccountBalanceUsd += releasedUsd;
  }

  recordAuditEvent('ORDER_CANCELLED', {
    orderId,
    clientOrderId: order.clientOrderId,
    symbol: order.symbol,
  });

  return { success: true, order };
}

export async function cancelAllBotOrders(): Promise<number> {
  let cancelledCount = 0;
  for (const [orderId, order] of activeOrders.entries()) {
    if (order.status === 'open' || order.status === 'partially_filled') {
      const res = await cancelManagedOrder(orderId);
      if (res.success) cancelledCount++;
    }
  }
  recordAuditEvent('KILL_SWITCH_TRIGGERED', { cancelledCount });
  return cancelledCount;
}

export async function reconcileManagedOrder(orderId: string): Promise<ManagedOrder | null> {
  let order = activeOrders.get(orderId);
  if (order?.status === 'pending' && order.orderId.startsWith('uncertain_')) {
    const adapter = getUpstreamAdapter();
    if (!adapter.getOrderByClientOrderId) {
      throw new Error('This adapter cannot reconcile by client order ID; manual inspection is required.');
    }
    const result = await adapter.getOrderByClientOrderId(order.clientOrderId);
    if (!result.success) {
      throw new Error(result.error || 'Unable to reconcile uncertain testnet order.');
    }
    if (!result.found || !result.orderId) {
      throw new Error('Order was not found among open testnet orders. Manual inspection is required before retrying.');
    }
    activeOrders.delete(order.orderId);
    order.orderId = result.orderId;
    activeOrders.set(order.orderId, order);
    order.status = result.status?.toLowerCase() === 'partially_filled' ? 'partially_filled' : 'open';
  }
  if (!order || order.isDryRun || ['filled', 'cancelled', 'rejected'].includes(order.status)) {
    return order || null;
  }

  const result = await getUpstreamAdapter().getOrderStatus(order.orderId);
  if (!result.success) {
    throw new Error(result.error || `Unable to reconcile order ${order.orderId}.`);
  }

  const status = result.status?.toLowerCase();
  if (status === 'open' || status === 'working' || status === 'pending') {
    order.status = 'open';
  } else if (status === 'partially_filled') {
    order.status = 'partially_filled';
  } else if (status === 'filled') {
    order.status = 'filled';
  } else if (status === 'cancelled' || status === 'canceled') {
    order.status = 'cancelled';
  } else if (status === 'rejected') {
    order.status = 'rejected';
  }
  order.updatedAt = new Date().toISOString();
  return order;
}

export function getAuditEvents(limit = 50): AuditEvent[] {
  return auditEvents.slice(0, limit);
}
