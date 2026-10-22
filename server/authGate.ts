/**
 * Order Authorization Gate - Phase 21A
 * Manages manual, one-time approvals for testnet order execution.
 */

import { addLog } from './logger.js';

export interface OrderApproval {
  id: string;
  symbolId: number;
  side: 'buy' | 'sell';
  type: string; // e.g., 'market_ioc', 'limit_fok'
  maxQty: string;
  maxPrice?: string;
  maxNotional: number; // qty * price approximation or absolute limit
  expiresAt: number;
  isUsed: boolean;
  createdAt: number;
}

class OrderApprovalStore {
  private approvals: Map<string, OrderApproval> = new Map();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes default expiration

  /**
   * Generates a new scoped approval.
   * In a real UI, this would be triggered by a manual "Approve Order" button.
   */
  createApproval(params: Omit<OrderApproval, 'id' | 'expiresAt' | 'isUsed' | 'createdAt'>): string {
    const id = `auth_${Math.random().toString(36).substring(2, 15)}`;
    const now = Date.now();
    const approval: OrderApproval = {
      ...params,
      id,
      createdAt: now,
      expiresAt: now + this.TTL_MS,
      isUsed: false,
    };
    this.approvals.set(id, approval);
    addLog('info', 'risk', `New order approval created: ${id} for symbol ${params.symbolId}`);
    return id;
  }

  /**
   * Validates and consumes an approval for a specific order request.
   */
  consumeApproval(id: string, orderReq: { 
    symbolId: number; 
    side: 'buy' | 'sell'; 
    type: string; 
    qty: string; 
    price?: string;
  }): { valid: boolean; reason?: string } {
    const approval = this.approvals.get(id);

    if (!approval) {
      return { valid: false, reason: 'Approval not found' };
    }

    if (approval.isUsed) {
      return { valid: false, reason: 'Approval already used (one-time only)' };
    }

    if (Date.now() > approval.expiresAt) {
      this.approvals.delete(id);
      return { valid: false, reason: 'Approval expired' };
    }

    // SCOPE VALIDATION
    if (approval.symbolId !== orderReq.symbolId) {
      return { valid: false, reason: 'Market mismatch' };
    }

    if (approval.side !== orderReq.side) {
      return { valid: false, reason: 'Side mismatch' };
    }

    if (approval.type !== orderReq.type) {
      return { valid: false, reason: 'Order type mismatch' };
    }

    // QUANTITY VALIDATION
    const requestedQty = parseFloat(orderReq.qty);
    const approvedMaxQty = parseFloat(approval.maxQty);
    if (requestedQty > approvedMaxQty) {
      return { valid: false, reason: `Quantity exceeds approved limit: ${requestedQty} > ${approvedMaxQty}` };
    }

    // PRICE VALIDATION (for limit orders)
    if (orderReq.price && approval.maxPrice) {
      const requestedPrice = parseFloat(orderReq.price);
      const approvedMaxPrice = parseFloat(approval.maxPrice);
      // For BUY orders, maxPrice is an upper bound. For SELL orders, maxPrice is a lower bound or we just check notional.
      // Usually "maxPrice" in a security gate for a buyer means "don't buy above this".
      if (orderReq.side === 'buy' && requestedPrice > approvedMaxPrice) {
         return { valid: false, reason: `Price exceeds approved limit: ${requestedPrice} > ${approvedMaxPrice}` };
      }
    }

    // NOTIONAL VALIDATION
    const price = orderReq.price ? parseFloat(orderReq.price) : 1; // Simplistic for market orders if price unknown here
    const notional = requestedQty * price;
    if (notional > approval.maxNotional) {
      return { valid: false, reason: `Notional value exceeds approved limit: ${notional} > ${approval.maxNotional}` };
    }

    // Consume it
    approval.isUsed = true;
    addLog('info', 'risk', `Approval ${id} successfully consumed for order.`);
    return { valid: true };
  }

  /**
   * Revokes all pending approvals (Kill Switch).
   */
  revokeAll() {
    this.approvals.clear();
    addLog('warn', 'risk', 'All pending order approvals revoked via kill switch.');
  }
}

export const orderApprovalStore = new OrderApprovalStore();
