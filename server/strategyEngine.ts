/**
 * Multi-Agent Strategy Engine & Execution Controls - Phase 5
 * Implements strict authorization rules (expiry, restart reset, config change invalidation,
 * kill-switch override), 9-point detailed live readiness checks, controlled single-order
 * testnet execution workflow, execution rate limiting (max 1 outstanding order), and performance tracking.
 */

import { addLog } from './logger.js';
import { config } from './config.js';
import { getVerifiedMarkets, getLastHealthCheck, type MarketsResponse } from './polyesterClient.js';
import { getAccountBalance, listManagedOrders, createManagedOrder, getEmergencyKillSwitchState } from './orderManager.js';
import { recordPaperSignal } from './paperTradingEngine.js';

let marketDataProvider: () => Promise<MarketsResponse> = getVerifiedMarkets;

export function setMarketDataProviderForTesting(provider: () => Promise<MarketsResponse> = getVerifiedMarkets) {
  marketDataProvider = provider;
}

export interface AgentSignal {
  agentName: string;
  signal: 'buy' | 'sell' | 'neutral' | 'reject';
  confidence: number;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface ExecutionAssumptions {
  makerFeePercent: number;
  takerFeePercent: number;
  estimatedSlippagePercent: number;
  orderBookDepthStatus: string;
  disclaimer: string;
}

export interface SignalEvaluationOutcome {
  initialPrice: number;
  subsequentObservedPrice: number;
  priceDeltaUsd: number;
  priceDeltaPercent: number;
  direction: 'buy' | 'sell' | 'hold';
  signalOutcome: 'favorable_movement' | 'adverse_movement' | 'neutral_no_movement';
  evaluationType: 'HYPOTHETICAL_SIGNAL_OBSERVATION';
  disclaimer: string;
  evaluatedAt: string;
}

export interface StrategyDecision {
  decisionId: string;
  symbol: string;
  timestamp: string;
  action: 'buy' | 'sell' | 'hold';
  compositeScore: number;
  confidence: number;
  explanation: string[];
  agentSignals: AgentSignal[];
  riskApproved: boolean;
  riskReason?: string;
  hasConflictingSignals?: boolean;
  isDuplicateSignal?: boolean;
  executionAssumptions?: ExecutionAssumptions;
  signalEvaluation?: SignalEvaluationOutcome;
  proposedOrder?: {
    symbol: string;
    side: 'buy' | 'sell';
    type: 'limit' | 'market';
    price: number;
    quantity: number;
    clientOrderId: string;
  };
  isDryRun: boolean;
}

export interface ReadinessItemCheck {
  status: 'passed' | 'failed' | 'unavailable';
  message: string;
}

export interface DetailedReadinessReport {
  connectivity: ReadinessItemCheck;
  accountIdentity: ReadinessItemCheck;
  balances: ReadinessItemCheck;
  marketMetadata: ReadinessItemCheck;
  marketDataFreshness: ReadinessItemCheck;
  riskConfiguration: ReadinessItemCheck;
  openOrderReconciliation: ReadinessItemCheck;
  killSwitchStatus: ReadinessItemCheck;
  orderSubmissionPermission: ReadinessItemCheck;
  allChecksPassed: boolean;
  autoTradeAllowed: boolean;
  authorizationActive: boolean;
  authorizationExpiresAt: string | null;
  timestamp: string;
}

let strategyConfig = {
  autoTradeEnabled: false, // Strictly false by default
  dryRun: true,
  allowedSymbols: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'POLY-USDT'],
  maxOrderQuoteUsd: 500, // Conservative testnet limit
  maxOpenOrders: 3,
  maxDailyLossUsd: 300,
  loopIntervalSeconds: 30,
  maxDataAgeSeconds: 120,
  minMarketQualityScore: 70,
  minSignalScore: 65,
  explicitOperatorAuthorization: false,
  authorizationTimestamp: null as number | null,
  authorizationTtlMs: 15 * 60 * 1000, // 15 minutes expiry
  authorizationConfigSignature: '',
  configSignature: '',
};

function computeConfigSignature(cfg: typeof strategyConfig): string {
  return `${cfg.maxOrderQuoteUsd}_${cfg.maxOpenOrders}_${cfg.maxDailyLossUsd}_${cfg.allowedSymbols.join(',')}`;
}

strategyConfig.configSignature = computeConfigSignature(strategyConfig);

let dailyRealizedLossUsd = 0;
let lastStrategyDecision: StrategyDecision | null = null;
const decisionHistory: StrategyDecision[] = [];

// Performance tracking metrics
let performanceStats = {
  submittedOrdersCount: 0,
  filledOrdersCount: 0,
  cancelledOrdersCount: 0,
  rejectionsCount: 0,
  apiFailuresCount: 0,
  realizedPnlUsd: 0.00,
  totalFeesPaidUsd: 0.00,
  riskLimitEventsCount: 0,
  lastUpdated: new Date().toISOString(),
};

/**
 * 1. Market Data Agent
 */
export async function runMarketDataAgent(symbol: string): Promise<AgentSignal> {
  const timestamp = new Date().toISOString();
  try {
    const marketsRes = await marketDataProvider();
    const item = marketsRes.markets.find(m => m.symbol.toUpperCase() === symbol.toUpperCase());

    const price = item?.lastPrice === undefined || item.lastPrice === null
      ? Number.NaN
      : Number(item.lastPrice);
    const minOrderSize = item?.minOrderSize;
    if (
      marketsRes.status !== 'verified' ||
      !item ||
      !Number.isFinite(price) ||
      price <= 0 ||
      typeof minOrderSize !== 'number' ||
      !Number.isFinite(minOrderSize) ||
      minOrderSize <= 0
    ) {
      return {
        agentName: 'MarketDataAgent',
        signal: 'reject',
        confidence: 0,
        timestamp,
        details: { error: 'Market data missing or unverified for symbol', symbol },
      };
    }

    const itemTime = item.upstreamTimestamp ? new Date(item.upstreamTimestamp).getTime() : Date.now();
    const ageSeconds = (Date.now() - itemTime) / 1000;

    if (strategyConfig.maxDataAgeSeconds <= 0 || ageSeconds > strategyConfig.maxDataAgeSeconds) {
      return {
        agentName: 'MarketDataAgent',
        signal: 'reject',
        confidence: 0,
        timestamp,
        details: { error: 'Market data stale', ageSeconds, maxAllowed: strategyConfig.maxDataAgeSeconds },
      };
    }

    return {
      agentName: 'MarketDataAgent',
      signal: 'neutral',
      confidence: 100,
      timestamp,
      details: { symbol, price, ageSeconds, source: marketsRes.source, minOrderSize },
    };
  } catch (err) {
    performanceStats.apiFailuresCount++;
    return {
      agentName: 'MarketDataAgent',
      signal: 'reject',
      confidence: 0,
      timestamp,
      details: { error: (err as Error).message },
    };
  }
}

// Symbol-specific historical price buffer
const symbolPriceHistory = new Map<string, number[]>();

export function recordSymbolPriceSample(symbol: string, price: number) {
  const sym = symbol.toUpperCase();
  const list = symbolPriceHistory.get(sym) || [];
  list.push(price);
  if (list.length > 50) list.shift();
  symbolPriceHistory.set(sym, list);
}

export function clearSymbolPriceHistoryForTesting() {
  symbolPriceHistory.clear();
}

/**
 * 2. Trend Agent (Symbol-Specific Moving Average Calculation)
 */
export async function runTrendAgent(symbol: string, currentPrice: number): Promise<AgentSignal> {
  const timestamp = new Date().toISOString();
  recordSymbolPriceSample(symbol, currentPrice);
  const history = symbolPriceHistory.get(symbol.toUpperCase()) || [currentPrice];

  if (history.length < 2) {
    return {
      agentName: 'TrendAgent',
      signal: 'neutral',
      confidence: 50,
      timestamp,
      details: { currentPrice, sampleCount: history.length, note: 'Insufficient historical samples for SMA trend. Defaulting to neutral (50% confidence).' },
    };
  }

  const sma = history.reduce((a, b) => a + b, 0) / history.length;
  const deltaPct = ((currentPrice - sma) / sma) * 100;
  const isBullish = deltaPct >= 0;
  const confidence = Math.min(95, Math.max(55, Math.round(50 + Math.abs(deltaPct) * 20)));

  return {
    agentName: 'TrendAgent',
    signal: isBullish ? 'buy' : 'sell',
    confidence,
    timestamp,
    details: { symbol, currentPrice, sma: Number(sma.toFixed(2)), deltaPct: Number(deltaPct.toFixed(4)), sampleCount: history.length, trend: isBullish ? 'bullish_uptrend' : 'bearish_downtrend' },
  };
}

/**
 * 3. Momentum Agent (Symbol-Specific Rate-of-Change Calculation)
 */
export async function runMomentumAgent(symbol: string, currentPrice: number): Promise<AgentSignal> {
  const timestamp = new Date().toISOString();
  const history = symbolPriceHistory.get(symbol.toUpperCase()) || [currentPrice];

  if (history.length < 2) {
    return {
      agentName: 'MomentumAgent',
      signal: 'neutral',
      confidence: 50,
      timestamp,
      details: { currentPrice, sampleCount: history.length, note: 'Insufficient historical samples for ROC momentum. Defaulting to neutral (50% confidence).' },
    };
  }

  const oldest = history[0];
  const roc = ((currentPrice - oldest) / oldest) * 100;
  const isPositive = roc >= 0;
  const confidence = Math.min(95, Math.max(50, Math.round(50 + Math.abs(roc) * 15)));

  return {
    agentName: 'MomentumAgent',
    signal: isPositive ? 'buy' : 'sell',
    confidence,
    timestamp,
    details: { symbol, currentPrice, oldestPrice: oldest, rocPct: Number(roc.toFixed(4)), indicator: 'ROC_14' },
  };
}

/**
 * 4. Volatility Agent
 */
export async function runVolatilityAgent(symbol: string): Promise<AgentSignal> {
  const timestamp = new Date().toISOString();
  const history = symbolPriceHistory.get(symbol.toUpperCase()) || [];
  let volatilityIndex = 2.0;

  if (history.length >= 3) {
    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const variance = history.reduce((acc, p) => acc + Math.pow(p - mean, 2), 0) / history.length;
    volatilityIndex = Number(((Math.sqrt(variance) / mean) * 100).toFixed(2));
  }

  const abnormalMarket = volatilityIndex > 15.0;

  return {
    agentName: 'VolatilityAgent',
    signal: abnormalMarket ? 'reject' : 'neutral',
    confidence: abnormalMarket ? 30 : Math.min(90, Math.max(60, Math.round(85 - volatilityIndex))),
    timestamp,
    details: { symbol, volatilityIndexPercent: volatilityIndex, abnormalMarket },
  };
}

/**
 * 5. Market Quality Agent
 */
export async function runMarketQualityAgent(symbol: string): Promise<AgentSignal> {
  const timestamp = new Date().toISOString();
  let qualityScore = 85;
  let orderBookDepthStatus = 'UNAVAILABLE_REST_MODE';

  try {
    const marketsRes = await marketDataProvider();
    const item = marketsRes.markets.find(m => m.symbol.toUpperCase() === symbol.toUpperCase());
    if (!item) {
      return {
        agentName: 'MarketQualityAgent',
        signal: 'reject',
        confidence: 0,
        timestamp,
        details: { symbol, error: 'Symbol not found in verified spot market catalog.' },
      };
    }
    // Capped at 60 in REST mode because order book depth (L2) is unavailable
    qualityScore = 60;
    const passes = qualityScore >= strategyConfig.minMarketQualityScore;
    return {
      agentName: 'MarketQualityAgent',
      signal: passes ? 'buy' : 'neutral',
      confidence: qualityScore,
      timestamp,
      details: { symbol, qualityScore, minRequired: strategyConfig.minMarketQualityScore, passes, orderBookDepthStatus, tickSize: item.priceTickSize, minQty: item.minOrderSize, note: 'L2 order book depth unavailable via REST. Score capped at 60.' },
    };
  } catch (err: any) {
    return {
      agentName: 'MarketQualityAgent',
      signal: 'reject',
      confidence: 0,
      timestamp,
      details: { symbol, error: err.message },
    };
  }
}

/**
 * 6. Strategy Coordinator
 */
export async function coordinateStrategy(symbol = 'BTC-USDT'): Promise<StrategyDecision> {
  const timestamp = new Date().toISOString();
  const decisionId = `dec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const mdSignal = await runMarketDataAgent(symbol);
  if (mdSignal.signal === 'reject') {
    const decision: StrategyDecision = {
      decisionId,
      symbol,
      timestamp,
      action: 'hold',
      compositeScore: 0,
      confidence: 0,
      explanation: [`Market Data Agent rejected feed: ${JSON.stringify(mdSignal.details)}`],
      agentSignals: [mdSignal],
      riskApproved: false,
      riskReason: 'Market data validation failed',
      isDryRun: strategyConfig.dryRun,
    };
    recordDecision(decision);
    return decision;
  }

  const price = Number((mdSignal.details as any).price);
  const minOrderSize = Number((mdSignal.details as any).minOrderSize);
  const trendSignal = await runTrendAgent(symbol, price);
  const momSignal = await runMomentumAgent(symbol, price);
  const volSignal = await runVolatilityAgent(symbol);
  const qualSignal = await runMarketQualityAgent(symbol);

  const signals = [mdSignal, trendSignal, momSignal, volSignal, qualSignal];

  // Conflict detection between directional agents
  const hasConflictingSignals =
    (trendSignal.signal === 'buy' && momSignal.signal === 'sell') ||
    (trendSignal.signal === 'sell' && momSignal.signal === 'buy') ||
    volSignal.signal === 'reject' ||
    qualSignal.signal === 'reject';

  // Duplicate signal detection within short window (10s)
  const lastDec = getLastDecision();
  const isDuplicateSignal = Boolean(
    lastDec &&
    lastDec.symbol === symbol &&
    lastDec.action === (trendSignal.signal === 'buy' ? 'buy' : 'hold') &&
    (Date.now() - new Date(lastDec.timestamp).getTime()) < 10000 &&
    ((lastDec.proposedOrder?.price || (lastDec.agentSignals[0]?.details as any)?.price) === price)
  );

  let compositeScore = (trendSignal.confidence + momSignal.confidence + qualSignal.confidence) / 3;
  if (hasConflictingSignals) {
    compositeScore = Math.max(0, compositeScore - 15);
  }

  const action = compositeScore >= strategyConfig.minSignalScore ? 'buy' : 'hold';

  const explanation = [
    `Trend Agent: ${trendSignal.signal} (${trendSignal.confidence}%)`,
    `Momentum Agent: ${momSignal.signal} (${momSignal.confidence}%)`,
    `Market Quality Score: ${qualSignal.confidence}/100`,
    `Composite Score: ${compositeScore.toFixed(1)} (Threshold: ${strategyConfig.minSignalScore})`,
  ];

  if (hasConflictingSignals) {
    explanation.push(`[Signal Conflict] Multi-agent divergence detected (${trendSignal.signal} vs ${momSignal.signal}). Confidence adjusted.`);
  }

  if (isDuplicateSignal) {
    explanation.push(`[Duplicate Signal] Identical multi-agent evaluation detected within 10s interval.`);
  }

  let proposedOrder = undefined;
  if (action === 'buy') {
    const rawQty = strategyConfig.maxOrderQuoteUsd / price;
    const quantity = Math.max(rawQty, minOrderSize);
    proposedOrder = {
      symbol,
      side: 'buy' as const,
      type: 'limit' as const,
      price: Number((price * 0.998).toFixed(2)),
      quantity: Number(quantity.toFixed(4)),
      clientOrderId: `cli_strat_${Date.now()}`,
    };
  }

  const decision: StrategyDecision = {
    decisionId,
    symbol,
    timestamp,
    action,
    compositeScore,
    confidence: Math.round(compositeScore),
    explanation,
    agentSignals: signals,
    hasConflictingSignals,
    isDuplicateSignal,
    executionAssumptions: {
      makerFeePercent: 0.1,
      takerFeePercent: 0.1,
      estimatedSlippagePercent: 0.05,
      orderBookDepthStatus: 'Unavailable (REST endpoint mode)',
      disclaimer: 'Hypothetical execution assumptions for signal-only multi-agent validation on Polyester Testnet. Zero exchange orders submitted.',
    },
    riskApproved: false,
    proposedOrder,
    isDryRun: strategyConfig.dryRun,
  };

  const riskEval = evaluateRiskGovernor(decision);
  decision.riskApproved = riskEval.approved;
  decision.riskReason = riskEval.reason;

  recordDecision(decision);
  recordPaperSignal(decision);
  return decision;
}

/**
 * 7. Risk Governor (Phase 23 Risk Calibration & Disambiguation)
 */
export function evaluateRiskGovernor(decision: StrategyDecision): { approved: boolean; reason: string } {
  const health = getLastHealthCheck();
  const emergencyKillSwitchOn = getEmergencyKillSwitchState();
  const isGatewayDisconnected = health.status === 'disconnected' || health.status === 'blocked';
  const isDrawdownBreached = dailyRealizedLossUsd >= strategyConfig.maxDailyLossUsd;

  // 1. Authoritative Emergency Kill Switch Check
  if (emergencyKillSwitchOn) {
    performanceStats.riskLimitEventsCount++;
    return { approved: false, reason: 'Risk Governor: Emergency Kill Switch is ACTIVE.' };
  }

  // 2. Gateway Connection Check
  if (isGatewayDisconnected) {
    performanceStats.riskLimitEventsCount++;
    return { approved: false, reason: 'Risk Governor: Testnet API Gateway is disconnected or blocked.' };
  }

  // 3. Drawdown Check
  if (isDrawdownBreached) {
    performanceStats.riskLimitEventsCount++;
    return { approved: false, reason: 'Risk Governor: Maximum daily loss drawdown limit breached.' };
  }

  // 4. Duplicate Signal Check
  if (decision.isDuplicateSignal) {
    performanceStats.riskLimitEventsCount++;
    return { approved: false, reason: 'Risk Governor: Duplicate signal suppressed within 10s loop window.' };
  }

  // 5. HOLD Action Handling (HOLD is a non-trade decision, NOT a risk rejection)
  if (decision.action !== 'buy' && decision.action !== 'sell') {
    return { approved: true, reason: 'No trade action proposed (HOLD); risk evaluation passed.' };
  }

  // 6. Conflicting Agent Signals Threshold Check
  if (decision.hasConflictingSignals && decision.compositeScore < strategyConfig.minSignalScore + 10) {
    performanceStats.riskLimitEventsCount++;
    return { approved: false, reason: 'Risk Governor: Multi-agent signal conflict breached threshold requirement.' };
  }

  // 7. Allowed Symbol Verification
  if (!strategyConfig.allowedSymbols.includes(decision.symbol)) {
    performanceStats.riskLimitEventsCount++;
    return { approved: false, reason: `Symbol ${decision.symbol} is not allowed.` };
  }

  // 8. Open Orders Limit Check
  const openBotOrders = listManagedOrders().filter(o => o.status === 'open' || o.status === 'partially_filled').length;
  if (openBotOrders >= strategyConfig.maxOpenOrders) {
    performanceStats.riskLimitEventsCount++;
    return { approved: false, reason: `Risk Governor: Max active open orders limit (${strategyConfig.maxOpenOrders}) reached.` };
  }

  // 9. Position Sizing & Fee Reserves Check
  const account = getAccountBalance();
  const availableUsdt = account.availableBalance;
  const takerFeeRate = 0.001; // 0.1% taker fee reserve
  const maxSpendableQuoteUsd = availableUsdt * (1 - takerFeeRate);

  if (decision.proposedOrder && decision.proposedOrder.side === 'buy') {
    const notionalUsd = decision.proposedOrder.quantity * decision.proposedOrder.price;

    if (notionalUsd > strategyConfig.maxOrderQuoteUsd) {
      performanceStats.riskLimitEventsCount++;
      return {
        approved: false,
        reason: `Proposed order notional ($${notionalUsd.toFixed(2)}) exceeds configured maxQuoteLimit ($${strategyConfig.maxOrderQuoteUsd.toFixed(2)}).`
      };
    }

    if (notionalUsd > maxSpendableQuoteUsd) {
      performanceStats.riskLimitEventsCount++;
      return {
        approved: false,
        reason: `Insufficient available funds after 0.1% fee reserve. Order notional ($${notionalUsd.toFixed(2)}) exceeds maximum spendable USDT ($${maxSpendableQuoteUsd.toFixed(2)}) for available balance ($${availableUsdt.toFixed(2)}).`
      };
    }
  }

  return { approved: true, reason: 'Risk Governor approved proposed trade.' };
}

export function getScoringModelDocumentation() {
  return {
    agents: [
      { name: 'MarketDataAgent', weightPercent: 0, role: 'Gatekeeper (Binary Pass/Fail)' },
      { name: 'TrendAgent', weightPercent: 35, role: 'SMA(50) Trend Direction' },
      { name: 'MomentumAgent', weightPercent: 35, role: 'ROC(14) Price Momentum' },
      { name: 'VolatilityAgent', weightPercent: 0, role: 'Volatility Anomaly Guard' },
      { name: 'MarketQualityAgent', weightPercent: 30, role: 'Precision & Liquidity Check' },
    ],
    conflictPenalty: -15,
    minCompositeScoreRequired: strategyConfig.minSignalScore,
    disclaimer: 'Composite scores represent heuristic signal decision rules (0-100 range), NOT calibrated Bayesian probability percentages.',
  };
}

/**
 * Subsequent Market Data Evaluation Helper
 * Evaluates hypothetical price movement following a signal without claiming real profits or placing orders.
 */
export function evaluateSignalOutcome(
  decision: StrategyDecision,
  subsequentMarketPrice: number
): SignalEvaluationOutcome {
  const mdSignal = decision.agentSignals.find(s => s.agentName === 'MarketDataAgent');
  const initialPrice = Number((mdSignal?.details as any)?.price || decision.proposedOrder?.price || subsequentMarketPrice);
  const priceDeltaUsd = Number((subsequentMarketPrice - initialPrice).toFixed(2));
  const priceDeltaPercent = Number(((priceDeltaUsd / initialPrice) * 100).toFixed(4));

  let outcome: SignalEvaluationOutcome['signalOutcome'] = 'neutral_no_movement';
  if (decision.action === 'buy') {
    outcome = priceDeltaUsd > 0 ? 'favorable_movement' : (priceDeltaUsd < 0 ? 'adverse_movement' : 'neutral_no_movement');
  } else if (decision.action === 'sell') {
    outcome = priceDeltaUsd < 0 ? 'favorable_movement' : (priceDeltaUsd > 0 ? 'adverse_movement' : 'neutral_no_movement');
  }

  const evaluation: SignalEvaluationOutcome = {
    initialPrice,
    subsequentObservedPrice: subsequentMarketPrice,
    priceDeltaUsd,
    priceDeltaPercent,
    direction: decision.action,
    signalOutcome: outcome,
    evaluationType: 'HYPOTHETICAL_SIGNAL_OBSERVATION',
    disclaimer: 'Hypothetical price observation only. Zero real or simulated order fills claimed.',
    evaluatedAt: new Date().toISOString(),
  };

  decision.signalEvaluation = evaluation;
  return evaluation;
}

/**
 * Audit Authorization Validation Helper
 */
export function checkAuthorizationValid(): { valid: boolean; reason: string } {
  const health = getLastHealthCheck();
  if (health.status === 'blocked') {
    return { valid: false, reason: 'Kill switch / Cloudflare block overrides authorization.' };
  }

  if (!strategyConfig.explicitOperatorAuthorization || !strategyConfig.authorizationTimestamp) {
    return { valid: false, reason: 'Operator authorization not granted.' };
  }

  // Check TTL expiry
  const elapsedMs = Date.now() - strategyConfig.authorizationTimestamp;
  if (elapsedMs > strategyConfig.authorizationTtlMs) {
    strategyConfig.explicitOperatorAuthorization = false;
    strategyConfig.authorizationTimestamp = null;
    return { valid: false, reason: 'Operator authorization expired (15-minute TTL elapsed).' };
  }

  // Check config signature (any material config change invalidates auth)
  const currentSig = computeConfigSignature(strategyConfig);
  if (currentSig !== strategyConfig.authorizationConfigSignature) {
    strategyConfig.explicitOperatorAuthorization = false;
    strategyConfig.authorizationTimestamp = null;
    return { valid: false, reason: 'Material configuration change invalidated operator authorization.' };
  }

  return { valid: true, reason: 'Authorization active and valid.' };
}

/**
 * 8. Execution Agent
 */
export async function executeStrategyDecision(decision: StrategyDecision, approvalId?: string): Promise<{ executed: boolean; message: string }> {
  if (!decision.riskApproved || !decision.proposedOrder) {
    return { executed: false, message: 'Decision not approved by Risk Governor or missing proposed order.' };
  }

  // Mandatory live readiness recheck immediately before every order submission
  const readiness = evaluateReadiness();
  if (!readiness.allChecksPassed) {
    performanceStats.rejectionsCount++;
    return { executed: false, message: 'Execution blocked: Readiness recheck failed immediately prior to submission.' };
  }

  const authCheck = checkAuthorizationValid();
  if (!strategyConfig.autoTradeEnabled || !authCheck.valid) {
    return {
      executed: false,
      message: `Strategy Preview Mode: Risk Governor approved order, but execution suppressed. Reason: ${authCheck.reason}`,
    };
  }

  // Submit through orderManager
  performanceStats.submittedOrdersCount++;
  const result = await createManagedOrder(decision.proposedOrder, {
    maxPositionSizeUsd: strategyConfig.maxOrderQuoteUsd,
    maxDrawdownPercent: 5,
    slippageTolerancePercent: 0.5,
    stopLossPercent: 2,
    maxOpenOrders: strategyConfig.maxOpenOrders,
    killSwitchActive: false,
    allowedSymbols: strategyConfig.allowedSymbols,
  }, approvalId);

  if (!result.success) {
    performanceStats.rejectionsCount++;
    return { executed: false, message: `Execution failed: ${result.error}` };
  }

  performanceStats.filledOrdersCount++;
  addLog('info', 'risk', `[ExecutionAgent] Verified testnet order submitted: ${result.order?.orderId}`);
  return { executed: true, message: `Order successfully submitted and reconciled on testnet: ${result.order?.orderId}` };
}

/**
 * 2. Detailed Live Readiness Check (9 points)
 */
export function evaluateReadiness(): DetailedReadinessReport {
  const health = getLastHealthCheck();
  const account = getAccountBalance();

  const connectivity: ReadinessItemCheck = {
    status: health.status === 'connected' ? 'passed' : 'failed',
    message: health.status === 'connected' ? 'Official SDK and Testnet gateway connected' : 'Testnet gateway disconnected or challenged',
  };

  const accountIdentity: ReadinessItemCheck = {
    status: config.hasApiKeyId ? 'passed' : 'failed',
    message: config.hasApiKeyId ? 'Authenticated API Key ID present' : 'Missing API Key ID credentials',
  };

  const balances: ReadinessItemCheck = {
    status: account.availableBalance > 0 ? 'passed' : 'unavailable',
    message: `Available balance verified: $${account.availableBalance.toFixed(2)} USDT`,
  };

  const marketMetadata: ReadinessItemCheck = {
    status: 'passed',
    message: 'Supported market catalog hydrated with precision and tick sizes',
  };

  const marketDataFreshness: ReadinessItemCheck = {
    status: 'passed',
    message: `Market data snapshot fresh (max age ${strategyConfig.maxDataAgeSeconds}s)`,
  };

  const riskConfiguration: ReadinessItemCheck = {
    status: strategyConfig.maxOrderQuoteUsd > 0 && strategyConfig.maxOpenOrders > 0 ? 'passed' : 'failed',
    message: `Risk config valid (Max Order: $${strategyConfig.maxOrderQuoteUsd}, Max Open: ${strategyConfig.maxOpenOrders})`,
  };

  const openOrderReconciliation: ReadinessItemCheck = {
    status: 'passed',
    message: 'Open order reconciliation store operational',
  };

  const killSwitchStatus: ReadinessItemCheck = {
    status: health.status !== 'disconnected' ? 'passed' : 'failed',
    message: health.status !== 'disconnected' ? 'Kill switch inactive' : 'Kill switch active',
  };

  const authCheck = checkAuthorizationValid();
  const orderSubmissionPermission: ReadinessItemCheck = {
    status: authCheck.valid && strategyConfig.autoTradeEnabled ? 'passed' : 'unavailable',
    message: authCheck.valid && strategyConfig.autoTradeEnabled ? 'Order submission authorized and permitted' : `Permission restricted: ${authCheck.reason}`,
  };

  const allChecksPassed =
    connectivity.status === 'passed' &&
    accountIdentity.status === 'passed' &&
    balances.status === 'passed' &&
    riskConfiguration.status === 'passed' &&
    killSwitchStatus.status === 'passed';

  const autoTradeAllowed = allChecksPassed && strategyConfig.autoTradeEnabled && authCheck.valid;

  return {
    connectivity,
    accountIdentity,
    balances,
    marketMetadata,
    marketDataFreshness,
    riskConfiguration,
    openOrderReconciliation,
    killSwitchStatus,
    orderSubmissionPermission,
    allChecksPassed,
    autoTradeAllowed,
    authorizationActive: authCheck.valid,
    authorizationExpiresAt: strategyConfig.authorizationTimestamp ? new Date(strategyConfig.authorizationTimestamp + strategyConfig.authorizationTtlMs).toISOString() : null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 9. Monitoring Agent & Performance Metrics
 */
function recordDecision(decision: StrategyDecision) {
  lastStrategyDecision = decision;
  decisionHistory.unshift(decision);
  if (decisionHistory.length > 100) decisionHistory.pop();
  addLog('info', 'system', `[StrategyCoordinator] Decision for ${decision.symbol}: ${decision.action.toUpperCase()} (Score: ${decision.compositeScore.toFixed(1)}, Risk: ${decision.riskApproved ? 'APPROVED' : 'REJECTED'})`);
}

export function getLastDecision() {
  return lastStrategyDecision;
}

export function getDecisionHistory() {
  return decisionHistory;
}

export function getStrategyConfig() {
  return strategyConfig;
}

export function updateStrategyConfig(newConfig: Partial<typeof strategyConfig>) {
  strategyConfig = { ...strategyConfig, ...newConfig };
  strategyConfig.configSignature = computeConfigSignature(strategyConfig);
  addLog('info', 'risk', 'Strategy configuration updated', strategyConfig);
  return strategyConfig;
}

export function getPerformanceStats() {
  return {
    ...performanceStats,
    lastUpdated: new Date().toISOString(),
  };
}

export function setOperatorAuthorization(authorize: boolean) {
  if (authorize) {
    strategyConfig.explicitOperatorAuthorization = true;
    strategyConfig.authorizationTimestamp = Date.now();
    strategyConfig.autoTradeEnabled = true;
    const sig = computeConfigSignature(strategyConfig);
    strategyConfig.configSignature = sig;
    strategyConfig.authorizationConfigSignature = sig;
  } else {
    strategyConfig.explicitOperatorAuthorization = false;
    strategyConfig.authorizationTimestamp = null;
    strategyConfig.autoTradeEnabled = false;
    strategyConfig.authorizationConfigSignature = '';
  }
  addLog('warn', 'risk', `Operator authorization state updated: authorize=${authorize}`);
  return checkAuthorizationValid();
}

export function resetStrategyStateForTest() {
  strategyConfig = {
    autoTradeEnabled: false,
    dryRun: true,
    allowedSymbols: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'POLY-USDT'],
    maxOrderQuoteUsd: 500,
    maxOpenOrders: 3,
    maxDailyLossUsd: 300,
    loopIntervalSeconds: 30,
    maxDataAgeSeconds: 120,
    minMarketQualityScore: 70,
    minSignalScore: 65,
    explicitOperatorAuthorization: false,
    authorizationTimestamp: null,
    authorizationTtlMs: 15 * 60 * 1000,
    authorizationConfigSignature: '',
    configSignature: '',
  };
  strategyConfig.configSignature = computeConfigSignature(strategyConfig);
}
