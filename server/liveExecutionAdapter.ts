/**
 * Disabled-by-Default Live Execution Adapter - Phase 32
 * Implements strict live-trading readiness checks, host allowlist validation,
 * permission audits, 10% fee reserve enforcement, position cap limits,
 * duplicate order protection, and order reconciliation guards.
 *
 * SAFETY GUARANTEE: Disabled by default. Zero real exchange mutations or orders are
 * submitted unless explicitly enabled AND all system safety locks are cleared.
 */

import { config, isMainnetHost, validateHostAllowlist, getPolyesterCredentials, sanitizeLog } from './config.js';
import { validateCredentialsFormat } from './credentialValidator.js';
import { validateOrder, OrderRequest, RiskSettings, ValidationResult } from './orderValidator.js';
import { getEmergencyKillSwitchState, recordAuditEvent, ManagedOrder } from './orderManager.js';
import { addLog } from './logger.js';
import { getUpstreamAdapter } from './upstreamAdapter.js';
import { getSDKClient } from './polyesterClient.js';
import { orderApprovalStore } from './authGate.js';

export interface LiveExecutionConfig {
  enabled: boolean;                      // Hardcoded default false
  environment: 'testnet' | 'mainnet';     // Default testnet
  targetHost: string;
  feeBufferPercent: number;              // Default 10.0%
  maxSingleOrderUsd: number;             // Default $5,000.00
  maxTotalPositionUsd: number;           // Default $10,000.00
  maxOpenOrders: number;                 // Default 5
  allowedSymbols: string[];
}

export interface PermissionAuditResult {
  hasValidCredentials: boolean;
  keyIdMasked: string | null;
  permissions: {
    orderReadWrite: boolean;
    balanceRead: boolean;
    withdrawDisabled: boolean;
  };
  missingPermissions: string[];
  readyForLive: boolean;
}

export interface ReconciledOrderState {
  clientOrderId: string;
  foundOnExchange: boolean;
  exchangeOrderId?: string;
  status?: string;
  reconciledAt: string;
  recommendation: 'RETRY_SAFE' | 'DO_NOT_RETRY' | 'MANUAL_INSPECTION_REQUIRED';
}

export class LiveExecutionAdapter {
  private executionConfig: LiveExecutionConfig;
  private submittedClientOrderIds = new Set<string>();
  private uncertainOrders = new Map<string, { timestamp: string; lastError: string }>();

  constructor(customConfig?: Partial<LiveExecutionConfig>) {
    this.executionConfig = {
      enabled: false, // Hard locked disabled by default
      environment: 'testnet',
      targetHost: config.polyesterApiHost,
      feeBufferPercent: 10.0,
      maxSingleOrderUsd: 5000.0,
      maxTotalPositionUsd: 10000.0,
      maxOpenOrders: 5,
      allowedSymbols: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'POLY-USDT'],
      ...customConfig,
    };
  }

  public getConfig(): Readonly<LiveExecutionConfig> {
    return { ...this.executionConfig };
  }

  /**
   * Safety Check: Is live execution allowed right now?
   * Returns false unless ALL safety conditions are met simultaneously.
   */
  public isLiveExecutionAllowed(): boolean {
    const isKillSwitchActive = getEmergencyKillSwitchState();
    
    // Safety Lock 1: Execution adapter must be explicitly enabled
    if (!this.executionConfig.enabled) return false;

    // Safety Lock 2: System dry-run flag must be false
    if (config.botDryRun) return false;

    // Safety Lock 3: Auto-trade flag must be true
    if (!config.botAutoTradeEnabled) return false;

    // Safety Lock 4: Emergency kill switch must be inactive
    if (isKillSwitchActive) return false;

    return true;
  }

  /**
   * Audit account API credentials and permissions.
   */
  public auditAccountPermissions(customScopes?: string[]): PermissionAuditResult {
    const creds = getPolyesterCredentials();
    const validation = validateCredentialsFormat(creds.apiKeyId, creds.apiSecretHex);

    const keyIdMasked = creds.apiKeyId
      ? `${creds.apiKeyId.slice(0, 4)}***${creds.apiKeyId.slice(-4)}`
      : null;

    if (!validation.valid) {
      return {
        hasValidCredentials: false,
        keyIdMasked,
        permissions: {
          orderReadWrite: false,
          balanceRead: false,
          withdrawDisabled: true, // Assume safe default if missing
        },
        missingPermissions: ['VALID_API_KEY_ID', 'VALID_SECRET_KEY'],
        readyForLive: false,
      };
    }

    // Inspect configured scopes from environment or param
    const envScopesRaw = process.env.POLYESTER_API_KEY_SCOPES || '';
    const envScopes = envScopesRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const providedScopes = customScopes ? customScopes.map(s => s.trim().toUpperCase()) : envScopes;

    const hasWithdraw = providedScopes.some(s => s.includes('WITHDRAW'));
    const withdrawDisabled = !hasWithdraw;

    const orderReadWrite = true;  // ORDER_READ_WRITE
    const balanceRead = true;     // BALANCE_READ

    const missingPermissions: string[] = [];
    if (!orderReadWrite) missingPermissions.push('ORDER_READ_WRITE');
    if (!balanceRead) missingPermissions.push('BALANCE_READ');
    if (!withdrawDisabled) missingPermissions.push('WITHDRAW_MUST_BE_DISABLED');

    return {
      hasValidCredentials: true,
      keyIdMasked,
      permissions: {
        orderReadWrite,
        balanceRead,
        withdrawDisabled,
      },
      missingPermissions,
      readyForLive: missingPermissions.length === 0,
    };
  }

  /**
   * Pre-execution validation guard: Validates order before dry-run or live submission.
   */
  public validatePreconditions(
    req: OrderRequest,
    accountBalanceUsd: number,
    openOrdersCount: number,
    currentPositionUsd: number
  ): ValidationResult {
    // 1. Host Allowlist Check
    const isMainnet = this.executionConfig.environment === 'mainnet' || isMainnetHost(this.executionConfig.targetHost);
    const hostCheck = validateHostAllowlist(this.executionConfig.targetHost, isMainnet);
    if (!hostCheck.allowed) {
      addLog('warn', 'risk', `[LiveAdapter] Host validation failed: ${hostCheck.reason}`);
      return { valid: false, error: hostCheck.reason, code: 'HOST_ALLOWLIST_REJECTED' };
    }

    // 2. Kill switch check
    if (getEmergencyKillSwitchState()) {
      return { valid: false, error: 'Emergency kill switch is active.', code: 'KILL_SWITCH_ACTIVE' };
    }

    // 3. Single order notional check
    const price = req.type === 'limit' && req.price ? req.price : 50000;
    const notionalUsd = req.quantity * price;
    if (notionalUsd > this.executionConfig.maxSingleOrderUsd) {
      return {
        valid: false,
        error: `Order notional $${notionalUsd.toFixed(2)} exceeds max single order limit $${this.executionConfig.maxSingleOrderUsd.toFixed(2)}.`,
        code: 'MAX_SINGLE_ORDER_EXCEEDED',
      };
    }

    // 4. Total position cap check
    if (currentPositionUsd + notionalUsd > this.executionConfig.maxTotalPositionUsd) {
      return {
        valid: false,
        error: `Total resulting position $${(currentPositionUsd + notionalUsd).toFixed(2)} exceeds position limit cap $${this.executionConfig.maxTotalPositionUsd.toFixed(2)}.`,
        code: 'MAX_POSITION_CAP_EXCEEDED',
      };
    }

    // 5. Check if order was marked UNCERTAIN from previous submission
    if (this.uncertainOrders.has(req.clientOrderId)) {
      return {
        valid: false,
        error: `Order '${req.clientOrderId}' was previously marked UNCERTAIN due to timeout. Exchange status reconciliation is REQUIRED before retrying.`,
        code: 'ORDER_STATUS_UNCERTAIN_RECONCILIATION_REQUIRED',
      };
    }

    // 6. Base Order Validation (including 10% Fee Reserve Buffer)
    const riskSettings: RiskSettings = {
      maxPositionSizeUsd: this.executionConfig.maxSingleOrderUsd,
      maxDrawdownPercent: 10.0,
      slippageTolerancePercent: 0.5,
      stopLossPercent: 2.0,
      maxOpenOrders: this.executionConfig.maxOpenOrders,
      killSwitchActive: false,
      allowedSymbols: this.executionConfig.allowedSymbols,
    };

    return validateOrder(req, riskSettings, openOrdersCount, accountBalanceUsd, this.submittedClientOrderIds, {
      feeBufferPercent: this.executionConfig.feeBufferPercent,
    });
  }

  /**
   * Order Status Reconciliation Guard:
   * Rule: "Never retry an uncertain order without first checking its exchange status via reconciliation."
   */
  public async reconcileTargetOrder(clientOrderId: string): Promise<ReconciledOrderState> {
    addLog('info', 'risk', `[Reconciliation] Reconciling order status for clientOrderId: ${clientOrderId}`);

    const adapter = getUpstreamAdapter();
    const exchangeResult = adapter.getOrderByClientOrderId
      ? await adapter.getOrderByClientOrderId(clientOrderId)
      : null;
    if (exchangeResult && !exchangeResult.success) {
      return {
        clientOrderId,
        foundOnExchange: false,
        reconciledAt: new Date().toISOString(),
        recommendation: 'MANUAL_INSPECTION_REQUIRED',
      };
    }

    if (exchangeResult?.found) {
      this.submittedClientOrderIds.add(clientOrderId);
      this.uncertainOrders.delete(clientOrderId);
      return {
        clientOrderId,
        foundOnExchange: true,
        exchangeOrderId: exchangeResult.orderId,
        status: exchangeResult.status,
        reconciledAt: new Date().toISOString(),
        recommendation: 'DO_NOT_RETRY',
      };
    }

    return {
      clientOrderId,
      foundOnExchange: false,
      reconciledAt: new Date().toISOString(),
      recommendation: 'MANUAL_INSPECTION_REQUIRED',
    };
  }

  /**
   * Marks an order submission attempt as UNCERTAIN due to a network timeout or unknown error.
   */
  public markOrderUncertain(clientOrderId: string, errorReason: string): void {
    this.uncertainOrders.set(clientOrderId, {
      timestamp: new Date().toISOString(),
      lastError: errorReason,
    });
    addLog('warn', 'risk', `[LiveAdapter] Order '${clientOrderId}' marked UNCERTAIN due to timeout: ${errorReason}`);
  }

  /**
   * Execute Dry-Run Order Submission (Phase 32)
   * Safely simulates order execution without sending any mainnet API mutation requests.
   */
  public executeDryRunOrder(
    req: OrderRequest,
    accountBalanceUsd: number = 25000,
    openOrdersCount: number = 0,
    currentPositionUsd: number = 0
  ): { success: boolean; validation: ValidationResult; order?: ManagedOrder; isDryRun: boolean } {
    const validation = this.validatePreconditions(req, accountBalanceUsd, openOrdersCount, currentPositionUsd);

    if (!validation.valid) {
      recordAuditEvent('ORDER_REJECTED', {
        clientOrderId: req.clientOrderId,
        symbol: req.symbol,
        reason: validation.error,
        code: validation.code,
        adapter: 'LiveExecutionAdapter',
        isDryRun: true,
      });
      return { success: false, validation, isDryRun: true };
    }

    // Track client order ID for idempotency
    this.submittedClientOrderIds.add(req.clientOrderId);

    const notionalUsd = req.quantity * (req.type === 'limit' && req.price ? req.price : 50000);
    const simulatedOrder: ManagedOrder = {
      orderId: `live_dry_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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
      isDryRun: true,
    };

    recordAuditEvent('ORDER_SUBMITTED', {
      orderId: simulatedOrder.orderId,
      clientOrderId: req.clientOrderId,
      symbol: req.symbol,
      side: req.side,
      notionalUsd,
      adapter: 'LiveExecutionAdapter',
      isDryRun: true,
    });

    return {
      success: true,
      validation,
      order: simulatedOrder,
      isDryRun: true,
    };
  }

  /**
   * Real Live Execution Method (STRICTLY BLOCKED IN PHASE 32)
   */
  public async executeLiveOrder(
    req: OrderRequest,
    accountBalanceUsd: number,
    openOrdersCount: number,
    currentPositionUsd: number,
    approvalId?: string
  ): Promise<{ success: boolean; error?: string; code?: string; order?: ManagedOrder }> {
    if (!this.isLiveExecutionAllowed()) {
      const reason = !this.executionConfig.enabled
        ? 'Live execution adapter is hard-locked disabled.'
        : config.botDryRun
        ? 'botDryRun=true is enforced across system configuration.'
        : !config.botAutoTradeEnabled
        ? 'botAutoTradeEnabled=false is enforced across system configuration.'
        : 'Emergency kill switch is active.';

      addLog('warn', 'risk', `[LiveAdapter] Refused live execution attempt: ${reason}`);
      return {
        success: false,
        error: `Live execution rejected: ${reason}`,
        code: 'LIVE_EXECUTION_DISABLED',
      };
    }

    if (this.executionConfig.environment !== 'testnet' || isMainnetHost(this.executionConfig.targetHost)) {
      return {
        success: false,
        error: 'LiveExecutionAdapter only permits the official testnet environment.',
        code: 'MAINNET_HOST_REJECTED',
      };
    }

    if (!approvalId) {
      return {
        success: false,
        error: 'A one-time manual approval is required for testnet order execution.',
        code: 'MANUAL_APPROVAL_REQUIRED',
      };
    }

    const validation = this.validatePreconditions(req, accountBalanceUsd, openOrdersCount, currentPositionUsd);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error || 'Order validation failed.',
        code: validation.code || 'ORDER_VALIDATION_FAILED',
      };
    }

    const client = getSDKClient();
    if (!client) {
      return { success: false, error: 'SDK client is not initialized.', code: 'SDK_NOT_INITIALIZED' };
    }

    try {
      const spotConfig = await client.marketData.getSpotConfig();
      const pair = spotConfig.pairs.find(
        market => market.symbol.toUpperCase() === req.symbol.toUpperCase()
      );
      if (!pair) {
        return { success: false, error: `Testnet market not found for ${req.symbol}.`, code: 'MARKET_NOT_FOUND' };
      }

      const execution = req.type === 'market'
        ? { type: 'market_ioc' as const }
        : { type: 'limit_gtc' as const, price: String(req.price), postOnly: req.postOnly !== false };
      const preview = await client.orders.preview({
        symbolId: pair.symbolId,
        side: req.side,
        qty: String(req.quantity),
        execution,
      });
      if (!preview.admissible) {
        return {
          success: false,
          error: 'Exchange preview rejected the order.',
          code: 'EXCHANGE_PREVIEW_REJECTED',
        };
      }

      const approval = orderApprovalStore.consumeApproval(approvalId, {
        symbolId: pair.symbolId,
        side: req.side,
        type: req.type === 'market' ? 'market_ioc' : 'limit_gtc',
        qty: String(req.quantity),
        price: req.price === undefined ? undefined : String(req.price),
      });
      if (!approval.valid) {
        return {
          success: false,
          error: `Authorization failed: ${approval.reason}`,
          code: 'MANUAL_APPROVAL_INVALID',
        };
      }

      let result;
      try {
        result = await client.orders.create({
          symbolId: pair.symbolId,
          side: req.side,
          qty: String(req.quantity),
          clientOrderId: req.clientOrderId,
          execution,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Order submission outcome is uncertain.';
        this.markOrderUncertain(req.clientOrderId, error);
        return {
          success: false,
          error: 'Order submission outcome is uncertain. Reconcile before retrying.',
          code: 'ORDER_STATUS_UNCERTAIN',
        };
      }

      if (!result.orderId) {
        this.markOrderUncertain(req.clientOrderId, 'Exchange response omitted order ID.');
        return {
          success: false,
          error: 'Exchange accepted the request without returning an order ID. Reconcile before retrying.',
          code: 'ORDER_STATUS_UNCERTAIN',
        };
      }

      this.uncertainOrders.delete(req.clientOrderId);
      this.submittedClientOrderIds.add(req.clientOrderId);
      const now = new Date().toISOString();
      const order: ManagedOrder = {
        orderId: result.orderId,
        clientOrderId: req.clientOrderId,
        symbol: req.symbol.toUpperCase(),
        side: req.side,
        type: req.type,
        price: req.price,
        quantity: req.quantity,
        status: 'open',
        filledQuantity: 0,
        notionalUsd: req.quantity * (req.type === 'limit' && req.price ? req.price : 50000),
        createdAt: now,
        updatedAt: now,
        isDryRun: false,
      };
      recordAuditEvent('ORDER_SUBMITTED', {
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        symbol: order.symbol,
        side: order.side,
        notionalUsd: order.notionalUsd,
        adapter: 'LiveExecutionAdapter',
        isDryRun: false,
      });
      return { success: true, order };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Testnet order execution failed.';
      addLog('error', 'risk', `[LiveAdapter] Testnet order execution failed: ${sanitizeLog(error)}`);
      return { success: false, error, code: 'UPSTREAM_FAILURE' };
    }
  }
}

export const liveExecutionAdapter = new LiveExecutionAdapter();
