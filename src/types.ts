export interface AppHealthResult {
  status: 'healthy' | 'degraded';
  service: string;
  uptimeSeconds: number;
  timestamp: string;
  port: number;
}

export interface HealthCheckResult {
  status: 'connected' | 'disconnected' | 'blocked' | 'rate_limited' | 'error';
  checkedAt: string;
  targetHost: string;
  targetEndpoint: string;
  httpStatus: number | null;
  statusText: string | null;
  contentType: string | null;
  latencyMs: number;
  isCloudflareBlocked: boolean;
  isRateLimited: boolean;
  retryAfterSeconds?: number | null;
  schemaValid: boolean;
  parsedData: Record<string, unknown> | null;
  errorMessage: string | null;
  rawSample?: string | null;
  securityNotice: string;
}

export interface AuthenticatedHealthCheckResult {
  success: boolean;
  authenticated: boolean;
  authenticatedProbe: boolean;
  authSchemeStatus: 'UNVERIFIED' | 'VERIFIED' | 'UNSUPPORTED';
  authSchemeNote: string;
  credentialsSent: boolean;
  status: HealthCheckResult['status'];
  httpStatus: number | null;
  statusText: string | null;
  latencyMs: number;
  checkedAt: string;
  targetHost: string;
  targetEndpoint: string;
  isCloudflareBlocked: boolean;
  isRateLimited: boolean;
  schemaValid: boolean;
  parsedData: Record<string, unknown> | null;
  message: string;
  rawSample: string | null;
  headers: {
    cfRay: string | null;
    server: string | null;
    contentType: string | null;
  };
  credentials: {
    keyIdMasked: string | null;
    accountIdMasked: string | null;
    hasPrivateKey: boolean;
    validation: {
      valid: boolean;
      code?: string;
      error?: string;
    };
    localCryptographicVerification?: {
      success: boolean;
      message: string;
      details?: {
        signingCanonical?: string;
        signatureHex?: string;
        timestamp?: string;
      };
    };
  };
  identity?: {
    accountId: string;
    status: string;
    [key: string]: unknown;
  } | null;
  securityNotice: string;
}

export interface SystemRuntimeInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  pythonRuntime: {
    installedVersion: string;
    hasPip: boolean;
    sdkCompatibility: {
      compatible: boolean;
      sdkPackage: string;
      requiredPythonVersion: string;
      note: string;
    };
  };
  serverBridge: {
    type: string;
    port: number;
    testnetOnlyLock: boolean;
    credentialsConfigured: {
      hasApiKeyId: boolean;
      hasApiPrivateKey: boolean;
      hasAccountId: boolean;
    };
    fastapiCompanion: {
      configuredUrl: string | null;
      status: 'disabled' | 'active' | 'unreachable';
    };
  };
}

export interface RiskSettings {
  maxPositionSizeUsd: number;
  maxDrawdownPercent: number;
  slippageTolerancePercent: number;
  stopLossPercent: number;
  maxOpenOrders: number;
  killSwitchActive: boolean;
  updatedAt: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  category: 'system' | 'api' | 'auth' | 'risk' | 'fastapi';
  message: string;
  details?: Record<string, unknown> | null;
}

export interface MarketItem {
  id?: string;
  symbol: string;
  marketId?: string;
  status?: string;
  lastPrice?: number | string | null;
  indexPrice?: number | string | null;
  baseAsset?: string;
  quoteAsset?: string;
  minOrderSize?: number;
  priceTickSize?: number;
  upstreamTimestamp?: string | number | null;
  [key: string]: unknown;
}

export interface MarketsResponse {
  markets: MarketItem[];
  source: string;
  status: 'verified' | 'empty' | 'blocked' | 'unavailable' | 'rate_limited';
  message: string;
  upstreamTimestamp?: string | null;
}

export type TabType = 'overview' | 'markets' | 'orders' | 'risk' | 'strategy' | 'paper-trading' | 'logs';

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

export interface PaperTradingConfig {
  evaluationWindowMinutes: number;
  neutralThresholdPercent: number;
  minSampleSizeForAggregatePerformance: number;
  entryFeePercent: number;
  exitFeePercent: number;
  entrySlippagePercent: number;
  exitSlippagePercent: number;
  orderBookDepthStatus: string;
  disclaimer: string;
}

export interface PaperSignalRecord {
  signalId: string;
  symbol: string;
  timestamp: string;
  evaluationDueAt: string;
  direction: 'buy' | 'sell';
  entryPriceUsd: number;
  compositeScore: number;
  agentScores: Array<{ agentName: string; signal: string; confidence: number }>;
  status: 'unresolved' | 'completed' | 'invalidated';
  completedAt?: string;
  exitPriceUsd?: number;
  grossReturnPercent?: number;
  netReturnPercent?: number;
  outcome?: 'favorable' | 'unfavorable' | 'neutral' | 'unresolved' | 'invalidated';
  assumedCosts: {
    entryFeePercent: number;
    exitFeePercent: number;
    entrySlippagePercent: number;
    exitSlippagePercent: number;
    combinedCostPercent: number;
  };
}

export interface DirectionalStats {
  totalCount: number;
  winCount: number;
  lossCount: number;
  neutralCount: number;
  winRatePercent: number | null;
}

export interface PaperSubSummary {
  totalSignalsRecorded: number;
  completedSignalsCount: number;
  unresolvedSignalsCount: number;
  winCount: number;
  lossCount: number;
  neutralCount: number;
  winRatePercent: number | null;
  sampleSizeSufficient: boolean;
  cumulativeGrossReturnPercent: number;
  cumulativeNetReturnPercent: number;
  compoundedNetReturnPercent: number;
  peakNetReturnPercent: number;
  maxDrawdownPercent: number;
  buyStats: DirectionalStats;
  sellStats: DirectionalStats;
}

export interface PaperTradingSummary {
  config: PaperTradingConfig;
  totalSignalsRecorded: number;
  completedSignalsCount: number;
  unresolvedSignalsCount: number;
  winCount: number;
  lossCount: number;
  neutralCount: number;
  winRatePercent: number | null;
  sampleSizeSufficient: boolean;
  cumulativeGrossReturnPercent: number;
  cumulativeNetReturnPercent: number;
  compoundedNetReturnPercent?: number;
  peakNetReturnPercent: number;
  maxDrawdownPercent: number;
  buyStats?: DirectionalStats;
  sellStats?: DirectionalStats;
  liveTelemetrySummary?: PaperSubSummary;
  simulationScriptSummary?: PaperSubSummary;
  liveTelemetrySignalCount?: number;
  simulationScriptSignalCount?: number;
  dataOutagePaused?: boolean;
  dataOutageReason?: string | null;
  storageBackend?: string;
  dataFreshnessTimestamp: string;
  watermark: 'PAPER / HYPOTHETICAL SIMULATION ONLY';
}



