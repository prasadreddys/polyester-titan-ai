import React, { useState, useEffect } from 'react';
import { ManagedOrder } from '../types.js';
import {
  Lock,
  ShieldCheck,
  PlusCircle,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  XCircle,
  FileCheck2,
  AlertTriangle,
  ArrowRight,
  X
} from 'lucide-react';

export const OrdersTab: React.FC = () => {
  const [orders, setOrders] = useState<ManagedOrder[]>([]);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Single Testnet Order Form State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isConfirmStep, setIsConfirmStep] = useState<boolean>(false);
  const [symbol, setSymbol] = useState<string>('BTC-USDT');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
  const [quantity, setQuantity] = useState<string>('0.01');
  const [price, setPrice] = useState<string>('65000');
  const [confirmedByOperator, setConfirmedByOperator] = useState<boolean>(false);
  
  // Phase 21E Lifecycle Test State
  const [isLifecycleModalOpen, setIsLifecycleModalOpen] = useState<boolean>(false);
  const [lifecycleData, setLifecycleData] = useState<any>(null);
  const [isLifecycleLoading, setIsLifecycleLoading] = useState<boolean>(false);
  const [lifecycleResult, setLifecycleResult] = useState<any>(null);
  const [isLifecycleConfirmed, setIsLifecycleConfirmed] = useState<boolean>(false);

  // Phase 21G Manual Reconciliation & Cancellation
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState<boolean>(false);
  const [targetOrderId, setTargetOrderId] = useState<string>('XTtTXdFr22a');
  const [reconcileReport, setReconcileReport] = useState<any>(null);
  const [isReconcileLoading, setIsReconcileLoading] = useState<boolean>(false);
  const [isCancelConfirmed, setIsCancelConfirmed] = useState<boolean>(false);
  const [cancelResult, setCancelResult] = useState<any>(null);
  const [showRaw, setShowRaw] = useState<boolean>(false);

  // Fetch managed orders
  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setActiveCount(data.activeCount || 0);
      }
    } catch (err) {
      console.warn('Failed to fetch orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const numQty = parseFloat(quantity) || 0;
  const numPrice = orderType === 'limit' ? (parseFloat(price) || 0) : 65000;
  const maxNotional = numQty * numPrice;

  const handleOpenForm = () => {
    setFeedback(null);
    setIsConfirmStep(false);
    setConfirmedByOperator(false);
    setIsModalOpen(true);
  };

  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (numQty <= 0) {
      setFeedback({ type: 'error', message: 'Order quantity must be greater than zero.' });
      return;
    }
    if (orderType === 'limit' && numPrice <= 0) {
      setFeedback({ type: 'error', message: 'Limit price must be greater than zero.' });
      return;
    }
    setFeedback(null);
    setIsConfirmStep(true);
  };

  const handleSubmitOrder = async () => {
    if (!confirmedByOperator) return;

    setIsSubmitting(true);
    setFeedback(null);

    const clientOrderId = `test_cli_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          side,
          type: orderType,
          quantity: numQty,
          price: orderType === 'limit' ? numPrice : undefined,
          clientOrderId,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `Single testnet order ${data.order?.orderId || clientOrderId} executed successfully in Dry-Run mode.`,
        });
        setIsModalOpen(false);
        setIsConfirmStep(false);
        setConfirmedByOperator(false);
        await fetchOrders();
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Order submission was rejected by the risk governor.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: (err as Error).message || 'Network error occurred during order submission.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', message: `Order ${orderId} cancelled successfully.` });
        await fetchOrders();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Failed to cancel order.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message || 'Error cancelling order.' });
    }
  };

  const fetchLifecycleData = async () => {
    setIsLifecycleLoading(true);
    try {
      const res = await fetch('/api/phase21e/staged-order');
      if (res.ok) {
        const data = await res.json();
        setLifecycleData(data);
      }
    } catch (err) {
      console.warn('Failed to fetch lifecycle data:', err);
    } finally {
      setIsLifecycleLoading(false);
    }
  };

  useEffect(() => {
    if (isLifecycleModalOpen) {
      fetchLifecycleData();
    }
  }, [isLifecycleModalOpen]);

  const handleExecuteLifecycle = async () => {
    if (!isLifecycleConfirmed) return;
    setIsLifecycleLoading(true);
    try {
      const res = await fetch('/api/phase21e/confirm-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLifecycleResult(data.result);
        await fetchOrders();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Lifecycle execution failed.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message || 'Network error during lifecycle test.' });
    } finally {
      setIsLifecycleLoading(false);
    }
  };

  const handleReconcile = async () => {
    if (!targetOrderId) return;
    setIsReconcileLoading(true);
    setCancelResult(null);
    try {
      const res = await fetch(`/api/phase21g/reconcile/${targetOrderId}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setReconcileReport(data.report);
      } else {
        setFeedback({ type: 'error', message: data.error || 'Reconciliation failed.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Network error during reconciliation.' });
    } finally {
      setIsReconcileLoading(false);
    }
  };

  const handleCancelTarget = async () => {
    if (!isCancelConfirmed || !targetOrderId) return;
    setIsReconcileLoading(true);
    try {
      const res = await fetch(`/api/phase21g/cancel/${targetOrderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCancelResult(data);
        setReconcileReport(data.finalAudit);
        await fetchOrders();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Cancellation failed.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Network error during cancellation.' });
    } finally {
      setIsReconcileLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-900/40 border border-slate-800 rounded-lg">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-emerald-400" />
            <span>Orders & Position Reconciliation</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Phase 14 Testnet Trading Terminal · Strict Dry-Run Mode active · Automated trading disarmed
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-1 rounded">
              DRY-RUN: ACTIVE
            </span>
            <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
              Active Orders: {activeCount}
            </span>
          </div>

          <button
            onClick={fetchOrders}
            disabled={isLoading}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50"
            title="Refresh Orders"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleOpenForm}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded transition-colors shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Test Single Order</span>
          </button>

          <button
            onClick={() => setIsLifecycleModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded transition-colors shadow-sm"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Phase 21E Lifecycle</span>
          </button>

          <button
            onClick={() => setIsReconcileModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded transition-colors shadow-sm"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Phase 21G Reconcile</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="p-1 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Safety Invariant Notice */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-lg flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-200 block">Dry-Run Simulation Lock</span>
            <span className="text-slate-400 text-[11px] leading-relaxed">
              Orders execute safely through full risk validation without real testnet fund exposure.
            </span>
          </div>
        </div>

        <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-lg flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-200 block">Background Bot Disarmed</span>
            <span className="text-slate-400 text-[11px] leading-relaxed">
              `botAutoTradeEnabled = false`. No autonomous orders can be placed.
            </span>
          </div>
        </div>

        <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-lg flex items-start gap-2.5">
          <FileCheck2 className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-200 block">Server-Side Reconciliation</span>
            <span className="text-slate-400 text-[11px] leading-relaxed">
              Idempotency keys and clientOrderId deduplication strictly enforced.
            </span>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
            Managed Orders Trail ({orders.length})
          </h3>
          <span className="text-[11px] font-mono text-slate-500">
            Source: Server In-Memory Reconciled Ledger
          </span>
        </div>

        {orders.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-xs text-slate-400">No testnet orders placed yet in this session.</p>
            <p className="text-[11px] text-slate-500">
              Click <strong>Test Single Order</strong> above to configure and preview a single dry-run testnet order.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-[11px] text-slate-400 uppercase font-mono">
                <tr>
                  <th className="px-4 py-2.5">Order ID / Client ID</th>
                  <th className="px-4 py-2.5">Market</th>
                  <th className="px-4 py-2.5">Side / Type</th>
                  <th className="px-4 py-2.5">Quantity</th>
                  <th className="px-4 py-2.5">Price / Notional</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Mode</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
                {orders.map((o) => (
                  <tr key={o.orderId} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-slate-200">{o.orderId}</div>
                      <div className="text-[10px] text-slate-500">{o.clientOrderId}</div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-200 font-bold">{o.symbol}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-bold mr-1.5 ${
                          o.side === 'buy' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                        }`}
                      >
                        {o.side}
                      </span>
                      <span className="text-slate-400 text-[11px]">{o.type}</span>
                    </td>
                    <td className="px-4 py-2.5">{o.quantity}</td>
                    <td className="px-4 py-2.5">
                      <div>${o.price ? o.price.toLocaleString() : 'Market'}</div>
                      <div className="text-[10px] text-slate-500">${o.notionalUsd.toFixed(2)}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${
                          o.status === 'open'
                            ? 'bg-sky-950/80 text-sky-400 border border-sky-800/50'
                            : o.status === 'filled'
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50'
                            : o.status === 'cancelled'
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-rose-950/80 text-rose-400 border border-rose-800/50'
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {o.isDryRun ? (
                        <span className="text-[10px] text-emerald-400 font-semibold">Dry-Run</span>
                      ) : (
                        <span className="text-[10px] text-amber-400 font-semibold">Live</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {o.status === 'open' || o.status === 'partially_filled' ? (
                        <button
                          onClick={() => handleCancelOrder(o.orderId)}
                          className="px-2 py-1 text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded border border-rose-800/40 transition-colors"
                        >
                          Cancel
                        </button>
                      ) : (
                        <span className="text-slate-600 text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Single Testnet Order Preview & Explicit Confirmation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-lg w-full flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  {isConfirmStep ? 'Operator Confirmation: Single Testnet Order' : 'Configure Single Testnet Order'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step 1: Input Form */}
            {!isConfirmStep ? (
              <form onSubmit={handleProceedToConfirm} className="p-6 space-y-4 text-xs">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded flex items-start gap-2.5 text-slate-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <p>
                    <strong>Safety First:</strong> This form configures a single isolated test order. Before placement, you will review the exact market, side, type, quantity, price, and maximum notional.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block font-medium text-slate-300">Market Symbol</label>
                    <select
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                    >
                      <option value="BTC-USDT">BTC-USDT</option>
                      <option value="ETH-USDT">ETH-USDT</option>
                      <option value="SOL-USDT">SOL-USDT</option>
                      <option value="POLY-USDT">POLY-USDT</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block font-medium text-slate-300">Order Side</label>
                    <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setSide('buy')}
                        className={`py-1.5 rounded font-bold uppercase transition-colors ${
                          side === 'buy'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Buy
                      </button>
                      <button
                        type="button"
                        onClick={() => setSide('sell')}
                        className={`py-1.5 rounded font-bold uppercase transition-colors ${
                          side === 'sell'
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Sell
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block font-medium text-slate-300">Order Type</label>
                    <select
                      value={orderType}
                      onChange={(e) => setOrderType(e.target.value as 'limit' | 'market')}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                    >
                      <option value="limit">Limit Order</option>
                      <option value="market">Market Order</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block font-medium text-slate-300">Quantity</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {orderType === 'limit' && (
                  <div className="space-y-1">
                    <label className="block font-medium text-slate-300">Limit Price (USD)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}

                <div className="p-3 bg-slate-950 border border-slate-800 rounded flex items-center justify-between font-mono">
                  <span className="text-slate-400">Calculated Maximum Notional:</span>
                  <span className="text-slate-100 font-bold text-sm">
                    ${maxNotional.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-3 py-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded transition-colors"
                  >
                    <span>Review Confirmation</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            ) : (
              /* Step 2: Strict Operator Confirmation Screen */
              <div className="p-6 space-y-4 text-xs">
                <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded flex items-start gap-2.5 text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Operator Confirmation Required:</strong>
                    <p className="mt-0.5 leading-relaxed text-[11px] text-amber-300/90">
                      Please verify all order parameters before submission. The order will be submitted to the server validation engine in Dry-Run mode.
                    </p>
                  </div>
                </div>

                {/* Exact Order Parameter Breakdown */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2.5 font-mono">
                  <div className="flex justify-between border-b border-slate-900 pb-1.5">
                    <span className="text-slate-400">Market Symbol:</span>
                    <span className="text-slate-100 font-bold">{symbol}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-1.5">
                    <span className="text-slate-400">Side:</span>
                    <span className={`font-bold uppercase ${side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {side}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-1.5">
                    <span className="text-slate-400">Order Type:</span>
                    <span className="text-slate-200 uppercase">{orderType}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-1.5">
                    <span className="text-slate-400">Order Quantity:</span>
                    <span className="text-slate-100 font-bold">{numQty}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-1.5">
                    <span className="text-slate-400">Order Price:</span>
                    <span className="text-slate-100 font-bold">
                      {orderType === 'limit' ? `$${numPrice.toLocaleString()}` : 'Best Market Price'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-1.5">
                    <span className="text-slate-400">Maximum Notional:</span>
                    <span className="text-emerald-400 font-bold text-sm">
                      ${maxNotional.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-slate-400">Execution Mode:</span>
                    <span className="text-emerald-400 font-semibold">Dry-Run Simulation (Safe)</span>
                  </div>
                </div>

                {/* Operator Checkbox */}
                <label className="flex items-start gap-2.5 p-3 bg-slate-950 border border-slate-800 rounded cursor-pointer hover:border-slate-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={confirmedByOperator}
                    onChange={(e) => setConfirmedByOperator(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-slate-300 leading-normal text-xs">
                    I explicitly confirm the accuracy of this single testnet order and authorize server-side execution under dry-run simulation.
                  </span>
                </label>

                {/* Confirmation Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsConfirmStep(false)}
                    className="px-3 py-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Back to Edit
                  </button>

                  <button
                    type="button"
                    onClick={handleSubmitOrder}
                    disabled={!confirmedByOperator || isSubmitting}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? 'Validating & Submitting...' : 'Confirm & Place Order'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Phase 21E Lifecycle Test Modal */}
      {isLifecycleModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full flex flex-col shadow-2xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-base font-semibold text-slate-100">Phase 21E: Single-Order Lifecycle Execution</h3>
                  <p className="text-[11px] text-slate-400">Strictly Controlled Testnet Lifecycle Validation</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsLifecycleModalOpen(false);
                  setLifecycleResult(null);
                  setIsLifecycleConfirmed(false);
                }}
                className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLifecycleLoading && !lifecycleData && (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
                  <p className="text-xs text-slate-400">Performing mandatory pre-submission gates...</p>
                </div>
              )}

              {lifecycleData && !lifecycleResult && (
                <div className="space-y-6">
                  {/* Gates Status */}
                  <div className="grid grid-cols-2 gap-4 text-[11px]">
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Account Identity:</span>
                        <span className="text-emerald-400 font-mono">{lifecycleData.account.id}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Host Environment:</span>
                        <span className="text-emerald-400 font-mono font-bold">TESTNET</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-900 pt-2">
                        <span className="text-slate-400">USDT Balance:</span>
                        <span className="text-slate-100 font-bold">${lifecycleData.account.availableUsdt.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Symbol ID:</span>
                        <span className="text-slate-100 font-mono">{lifecycleData.staged.symbolId}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Market Tick:</span>
                        <span className="text-slate-100 font-mono">{lifecycleData.market.tickSize}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-900 pt-2">
                        <span className="text-slate-400">Order Preview:</span>
                        <span className={lifecycleData.preview.admissible ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                          {lifecycleData.preview.admissible ? "PASS" : "FAIL"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Staged Parameters */}
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Exact Staged Order</h4>
                    <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden font-mono text-xs">
                      <div className="grid grid-cols-3 divide-x divide-slate-800 text-center">
                        <div className="p-3">
                          <div className="text-slate-500 text-[10px] uppercase mb-1">Side</div>
                          <div className="text-emerald-400 font-bold uppercase">{lifecycleData.staged.side}</div>
                        </div>
                        <div className="p-3">
                          <div className="text-slate-500 text-[10px] uppercase mb-1">Quantity</div>
                          <div className="text-slate-100 font-bold">{lifecycleData.staged.qty}</div>
                        </div>
                        <div className="p-3">
                          <div className="text-slate-500 text-[10px] uppercase mb-1">Limit Price</div>
                          <div className="text-slate-100 font-bold">${parseFloat(lifecycleData.staged.price).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Safety Warning & Confirmation */}
                  <div className="p-4 bg-amber-950/20 border border-amber-800/40 rounded-lg space-y-4">
                    <div className="flex items-start gap-3 text-amber-200">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold">Lifecycle Execution Boundary</p>
                        <p className="text-[11px] text-amber-300/80 leading-relaxed">
                          By confirming, you authorize a real-time testnet lifecycle: Submission, Status Query, and Cancellation. 
                          This action bypasses global dry-run flags and executes a live order via the official SDK.
                        </p>
                      </div>
                    </div>

                    <label className="flex items-start gap-2.5 p-3 bg-slate-950/60 border border-amber-900/30 rounded cursor-pointer hover:bg-slate-950 transition-colors">
                      <input
                        type="checkbox"
                        checked={isLifecycleConfirmed}
                        onChange={(e) => setIsLifecycleConfirmed(e.target.checked)}
                        className="mt-0.5 rounded border-slate-700 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-slate-300 leading-normal text-[11px]">
                        I explicitly confirm the audit report and authorize the single-order lifecycle execution on the Polyester Testnet.
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {lifecycleResult && (
                <div className="space-y-6">
                  <div className="p-4 bg-emerald-950/20 border border-emerald-800/40 rounded-lg flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    <div>
                      <h4 className="text-sm font-bold text-emerald-200">Lifecycle Test Completed</h4>
                      <p className="text-[11px] text-emerald-400/80 font-mono">Exchange ID: {lifecycleResult.submission.orderId}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Lifecycle Results</h4>
                    <div className="bg-slate-950 border border-slate-800 rounded-lg divide-y divide-slate-800 font-mono text-[11px]">
                      <div className="p-3 flex justify-between">
                        <span className="text-slate-400">Submission:</span>
                        <span className="text-emerald-400 font-bold">SUCCESS</span>
                      </div>
                      <div className="p-3 flex justify-between">
                        <span className="text-slate-400">Initial Status:</span>
                        <span className="text-slate-100">{lifecycleResult.initialStatus}</span>
                      </div>
                      <div className="p-3 flex justify-between">
                        <span className="text-slate-400">Cancellation:</span>
                        <span className={lifecycleResult.cancellation?.success ? "text-emerald-400" : "text-amber-400"}>
                          {lifecycleResult.cancellation?.success ? "SUCCESS" : "NOT APPLICABLE (OR FAILED)"}
                        </span>
                      </div>
                      <div className="p-3 flex justify-between">
                        <span className="text-slate-400">Final Reconciled Status:</span>
                        <span className="text-sky-400 font-bold uppercase">{lifecycleResult.finalStatus}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-[10px] text-slate-400 leading-relaxed">
                    <strong>Reconciliation Note:</strong> The order was successfully submitted, queried, and cancelled as per the Phase 21E protocol. 
                    All autonomous trading systems remained disabled throughout this test.
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-800 flex items-center justify-between bg-slate-950/40">
              <button
                onClick={() => {
                  setIsLifecycleModalOpen(false);
                  setLifecycleResult(null);
                  setIsLifecycleConfirmed(false);
                }}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Close
              </button>

              {!lifecycleResult && (
                <button
                  onClick={handleExecuteLifecycle}
                  disabled={!isLifecycleConfirmed || isLifecycleLoading}
                  className="inline-flex items-center gap-2 px-6 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded transition-colors shadow-lg shadow-amber-900/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isLifecycleLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  <span>{isLifecycleLoading ? "Executing Lifecycle..." : "Authorize & Execute"}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Phase 21G Manual Reconciliation & Cancellation Modal */}
      {isReconcileModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full flex flex-col shadow-2xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <XCircle className="w-5 h-5 text-rose-400" />
                <div>
                  <h3 className="text-base font-semibold text-slate-100">Phase 21G: Safe Manual Cancellation</h3>
                  <p className="text-[11px] text-slate-400">Explicitly Authorized Reconciliation & Termination</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsReconcileModalOpen(false);
                  setReconcileReport(null);
                  setIsCancelConfirmed(false);
                  setCancelResult(null);
                }}
                className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Order Selection */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase">Target Exchange Order ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={targetOrderId}
                    onChange={(e) => setTargetOrderId(e.target.value)}
                    placeholder="Enter order ID (e.g., XTtTXdFr22a)"
                    className="flex-1 px-4 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono text-sm focus:outline-none focus:border-rose-500"
                  />
                  <button
                    onClick={handleReconcile}
                    disabled={isReconcileLoading}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {isReconcileLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Reconcile"}
                  </button>
                </div>
              </div>

              {reconcileReport && (
                <div className="space-y-6">
                  {/* Status Report */}
                  <div className="grid grid-cols-2 gap-4 text-[11px]">
                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Exchange Order ID:</span>
                        <span className="font-mono text-slate-100 font-bold">{reconcileReport.orderId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Current Status:</span>
                        <span className={`font-mono font-bold uppercase ${reconcileReport.isActive ? "text-emerald-400" : "text-amber-400"}`}>
                          {reconcileReport.status}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-slate-900 pt-2">
                        <span className="text-slate-400">Activity State:</span>
                        <span className={`font-bold ${reconcileReport.isActive ? "text-emerald-400" : "text-slate-500"}`}>
                          {reconcileReport.isActive ? "ACTIVE (ELIGIBLE)" : "TERMINAL (CLOSED)"}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Original Qty:</span>
                        <span className="text-slate-100 font-mono">{reconcileReport.totalQty}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Filled Qty:</span>
                        <span className="text-emerald-400 font-mono font-bold">{reconcileReport.cumQty}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-900 pt-2">
                        <span className="text-slate-400">Remaining Qty:</span>
                        <span className="text-slate-100 font-mono">{reconcileReport.remainingQty}</span>
                      </div>
                    </div>
                  </div>

                  {/* Pricing & Time */}
                  <div className="grid grid-cols-2 gap-4 text-[11px]">
                     <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Avg Fill Price:</span>
                          <span className="text-slate-100 font-mono">${parseFloat(reconcileReport.avgPx).toLocaleString()}</span>
                        </div>
                     </div>
                     <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Last Verified:</span>
                          <span className="text-slate-400 font-mono">{new Date(reconcileReport.timestamp).toLocaleTimeString()}</span>
                        </div>
                     </div>
                  </div>

                  {/* Balance Reconciliation */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Current Exchange Balances</h4>
                    <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-900 font-mono text-[10px]">
                      {reconcileReport.availableBalances.length > 0 ? reconcileReport.availableBalances.map((b: any) => (
                        <div key={b.assetId} className="px-4 py-2 flex justify-between">
                          <span className="text-slate-400">{b.symbol} ({b.assetId}):</span>
                          <span className="text-slate-100">Avail: {b.available} | Lock: {b.reserved || 0}</span>
                        </div>
                      )) : (
                        <div className="px-4 py-2 text-slate-500">No active balances detected.</div>
                      )}
                    </div>
                  </div>

                  {/* Raw Response Section */}
                  <div className="space-y-2">
                    <button 
                      onClick={() => setShowRaw(!showRaw)}
                      className="text-[10px] text-slate-500 hover:text-slate-300 underline font-mono"
                    >
                      {showRaw ? "Hide Raw Diagnosis" : "Show Raw Diagnosis (Redacted)"}
                    </button>
                    {showRaw && (
                      <pre className="p-3 bg-black/40 border border-slate-800 rounded text-[9px] text-slate-500 font-mono overflow-auto max-h-40">
                        {JSON.stringify(reconcileReport.rawResponse, null, 2)}
                      </pre>
                    )}
                  </div>

                  {/* Cancellation Action */}
                  {reconcileReport.isActive && !cancelResult && (
                    <div className="p-4 bg-rose-950/20 border border-rose-800/40 rounded-lg space-y-4">
                      <div className="flex items-start gap-3 text-rose-200">
                        <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                        <div className="space-y-1.5">
                          <p className="text-xs font-bold">Authorized Termination Boundary</p>
                          <p className="text-[11px] text-rose-300/80 leading-relaxed">
                            Confirming this action will send a real-time cancellation request to the Polyester Testnet for this specific order. 
                            This is an irreversible operational command.
                          </p>
                        </div>
                      </div>

                      <label className="flex items-start gap-2.5 p-3 bg-slate-950/60 border border-rose-900/30 rounded cursor-pointer hover:bg-slate-950 transition-colors">
                        <input
                          type="checkbox"
                          checked={isCancelConfirmed}
                          onChange={(e) => setIsCancelConfirmed(e.target.checked)}
                          className="mt-0.5 rounded border-slate-700 text-rose-600 focus:ring-rose-500"
                        />
                        <span className="text-slate-300 leading-normal text-[11px]">
                          I explicitly authorize the manual cancellation of order <strong>{targetOrderId}</strong>.
                        </span>
                      </label>
                    </div>
                  )}

                  {cancelResult && (
                    <div className="p-4 bg-emerald-950/20 border border-emerald-800/40 rounded-lg flex items-center gap-3">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                      <div>
                        <h4 className="text-sm font-bold text-emerald-200">Cancellation Executed</h4>
                        <p className="text-[11px] text-emerald-400/80 font-mono">Status: {cancelResult.success ? "Success" : "Failed"}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-800 flex items-center justify-between bg-slate-950/40">
              <button
                onClick={() => {
                  setIsReconcileModalOpen(false);
                  setReconcileReport(null);
                  setIsCancelConfirmed(false);
                  setCancelResult(null);
                }}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Close
              </button>

              {reconcileReport?.isActive && !cancelResult && (
                <button
                  onClick={handleCancelTarget}
                  disabled={!isCancelConfirmed || isReconcileLoading}
                  className="inline-flex items-center gap-2 px-6 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded transition-colors shadow-lg shadow-rose-900/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isReconcileLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                  <span>{isReconcileLoading ? "Executing Cancellation..." : "Authorize Cancellation"}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
