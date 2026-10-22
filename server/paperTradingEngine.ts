import fs from 'fs';
import path from 'path';
import { addLog } from './logger.js';
import { StrategyDecision } from './strategyEngine.js';

export interface PaperTradingConfig {
  evaluationWindowMinutes: number; // default 5
  neutralThresholdPercent: number; // default 0.10%
  minSampleSizeForAggregatePerformance: number; // default 100
  entryFeePercent: number; // 0.10%
  exitFeePercent: number; // 0.10%
  entrySlippagePercent: number; // 0.05%
  exitSlippagePercent: number; // 0.05%
  orderBookDepthStatus: string;
  disclaimer: string;
}

export type PaperOutcomeType = 'favorable' | 'unfavorable' | 'neutral' | 'unresolved' | 'invalidated';

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
  exitPriceTimestamp?: string;
  grossReturnPercent?: number;
  netReturnPercent?: number;
  outcome?: PaperOutcomeType;
  source?: 'live_telemetry' | 'simulation_script';
  isTimingValid?: boolean;
  timingWindowMs?: number;
  flaggedReason?: string;
  assumedCosts: {
    entryFeePercent: number;
    exitFeePercent: number;
    entrySlippagePercent: number;
    exitSlippagePercent: number;
    combinedCostPercent: number; // 0.30%
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
  validCompletedCount: number;
  invalidTimingCount: number;
  unresolvedSignalsCount: number;
  winCount: number;
  lossCount: number;
  neutralCount: number;
  winRatePercent: number | null; // null if valid completed < 100
  sampleSizeSufficient: boolean; // true if valid completed >= 100
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
  validCompletedCount: number;
  invalidTimingCount: number;
  unresolvedSignalsCount: number;
  winCount: number;
  lossCount: number;
  neutralCount: number;
  winRatePercent: number | null; // null if valid completed < 100
  sampleSizeSufficient: boolean; // true if valid completed >= 100
  cumulativeGrossReturnPercent: number;
  cumulativeNetReturnPercent: number;
  compoundedNetReturnPercent: number;
  peakNetReturnPercent: number;
  maxDrawdownPercent: number;
  buyStats: DirectionalStats;
  sellStats: DirectionalStats;
  liveTelemetrySummary: PaperSubSummary;
  simulationScriptSummary: PaperSubSummary;
  liveTelemetrySignalCount: number;
  simulationScriptSignalCount: number;
  dataOutagePaused: boolean;
  dataOutageReason: string | null;
  storageBackend: string;
  dataFreshnessTimestamp: string;
  watermark: 'PAPER / HYPOTHETICAL SIMULATION ONLY';
}

/**
 * Verify whether a paper signal record satisfies the 300,000 ms (5-minute) observation window.
 */
export function verifySignalTiming(rec: PaperSignalRecord): boolean {
  const startMs = new Date(rec.timestamp).getTime();
  const dueMs = new Date(rec.evaluationDueAt).getTime();
  if (isNaN(startMs) || isNaN(dueMs)) return false;
  const durationMs = dueMs - startMs;
  // Strictly enforce 300,000 ms (allow +/- 1000ms ISO string serialization rounding tolerance)
  return durationMs >= 299000 && durationMs <= 301000;
}

const paperConfig: PaperTradingConfig = {
  evaluationWindowMinutes: 5,
  neutralThresholdPercent: 0.10,
  minSampleSizeForAggregatePerformance: 100,
  entryFeePercent: 0.10,
  exitFeePercent: 0.10,
  entrySlippagePercent: 0.05,
  exitSlippagePercent: 0.05,
  orderBookDepthStatus: 'Unavailable (REST endpoint mode)',
  disclaimer: 'Paper trading results are hypothetical research simulations. Zero exchange orders submitted. Never use paper results to authorize real trading.',
};

const paperSignalStore = new Map<string, PaperSignalRecord>();
let lastEvaluationTimestamp = new Date().toISOString();
let dataOutagePaused = false;
let dataOutageReason: string | null = null;
let isTestStoreActive = false;

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');

function getPersistFilePath(): string {
  if (isTestStoreActive || process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT)) {
    return path.join(DATA_DIR, 'paper_signals_test.json');
  }
  return path.join(DATA_DIR, 'paper_signals.json');
}

// Initialize disk persistence store
function loadStoreFromDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const persistFile = getPersistFilePath();
    if (fs.existsSync(persistFile)) {
      const raw = fs.readFileSync(persistFile, 'utf-8');
      const records: PaperSignalRecord[] = JSON.parse(raw);
      paperSignalStore.clear();
      for (const r of records) {
        paperSignalStore.set(r.signalId, r);
      }
      addLog('info', 'system', `[PaperTradingEngine] Loaded ${paperSignalStore.size} persistent paper signals from ${path.basename(persistFile)}`);
    }
  } catch (err) {
    addLog('warn', 'system', `[PaperTradingEngine] Could not load persisted paper signals: ${(err as Error).message}`);
  }
}

function saveStoreToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const persistFile = getPersistFilePath();
    const records = Array.from(paperSignalStore.values());
    fs.writeFileSync(persistFile, JSON.stringify(records, null, 2), 'utf-8');
  } catch (err) {
    addLog('warn', 'system', `[PaperTradingEngine] Could not persist paper signals to disk: ${(err as Error).message}`);
  }
}

// Load on startup
loadStoreFromDisk();

export function getPaperTradingConfig(): PaperTradingConfig {
  return paperConfig;
}

export function updatePaperTradingConfig(newConfig: Partial<PaperTradingConfig>): PaperTradingConfig {
  Object.assign(paperConfig, newConfig);
  addLog('info', 'risk', 'Paper trading research parameters updated', paperConfig as any);
  return paperConfig;
}

export function setDataOutageState(paused: boolean, reason: string | null = null) {
  dataOutagePaused = paused;
  dataOutageReason = reason;
  if (paused) {
    addLog('warn', 'system', `[PaperTradingEngine] Signal creation PAUSED due to market data outage: ${reason}`);
  } else {
    addLog('info', 'system', `[PaperTradingEngine] Signal creation RESUMED. Market data verified.`);
  }
}

/**
 * Record an eligible strategy decision as a paper trading signal record
 */
export function recordPaperSignal(
  decision: StrategyDecision,
  source: 'live_telemetry' | 'simulation_script' = 'live_telemetry'
): PaperSignalRecord | null {
  if (dataOutagePaused) {
    addLog('warn', 'system', `[PaperTradingEngine] Skipped signal creation for ${decision.symbol}: market data outage active`);
    return null;
  }

  if (decision.action !== 'buy' && decision.action !== 'sell') {
    return null; // HOLD decisions do not create paper signals
  }

  // Prevent duplicate signal recording for same symbol within 1 minute
  const nowMs = Date.now();
  for (const sig of paperSignalStore.values()) {
    if (
      sig.symbol === decision.symbol &&
      sig.direction === decision.action &&
      nowMs - new Date(sig.timestamp).getTime() < 60000
    ) {
      return null; // Skip duplicate
    }
  }

  const signalId = `psig_${nowMs}_${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = decision.timestamp || new Date().toISOString();
  const signalTimeMs = new Date(timestamp).getTime();
  const dueMs = signalTimeMs + paperConfig.evaluationWindowMinutes * 60 * 1000;
  const evaluationDueAt = new Date(dueMs).toISOString();

  const mdSignal = decision.agentSignals.find(a => a.agentName === 'MarketDataAgent');
  const entryPriceUsd = Number(
    (mdSignal?.details as any)?.price || decision.proposedOrder?.price
  );

  if (!entryPriceUsd || isNaN(entryPriceUsd) || entryPriceUsd <= 0) {
    addLog('warn', 'system', `[PaperTradingEngine] Rejected paper signal creation: invalid or missing market entry price for ${decision.symbol}`);
    return null;
  }

  const combinedCostPercent =
    paperConfig.entryFeePercent +
    paperConfig.exitFeePercent +
    paperConfig.entrySlippagePercent +
    paperConfig.exitSlippagePercent; // 0.30%

  const record: PaperSignalRecord = {
    signalId,
    symbol: decision.symbol,
    timestamp,
    evaluationDueAt,
    direction: decision.action,
    entryPriceUsd,
    compositeScore: decision.compositeScore,
    agentScores: decision.agentSignals.map(a => ({
      agentName: a.agentName,
      signal: a.signal,
      confidence: a.confidence,
    })),
    status: 'unresolved',
    source,
    isTimingValid: true,
    timingWindowMs: 300000,
    assumedCosts: {
      entryFeePercent: paperConfig.entryFeePercent,
      exitFeePercent: paperConfig.exitFeePercent,
      entrySlippagePercent: paperConfig.entrySlippagePercent,
      exitSlippagePercent: paperConfig.exitSlippagePercent,
      combinedCostPercent,
    },
  };

  paperSignalStore.set(signalId, record);
  saveStoreToDisk();
  addLog('info', 'system', `[PaperTradingEngine] Signal recorded: ${signalId} (${decision.symbol} ${decision.action.toUpperCase()} @ $${entryPriceUsd}, source=${source})`);
  return record;
}

/**
 * Evaluate pending paper signals whose 5-minute evaluation window has elapsed.
 */
export function evaluatePendingPaperSignals(
  symbolPrices: Map<string, number | { price: number; timestamp?: string }>
): number {
  const nowMs = Date.now();
  lastEvaluationTimestamp = new Date().toISOString();
  let evaluatedCount = 0;

  for (const record of paperSignalStore.values()) {
    if (record.status !== 'unresolved') continue;

    const dueMs = new Date(record.evaluationDueAt).getTime();
    if (nowMs >= dueMs) {
      const entryVal = symbolPrices.get(record.symbol.toUpperCase());
      if (entryVal === undefined || entryVal === null) continue;

      let exitPrice = 0;
      let exitPriceTime = new Date().toISOString();

      if (typeof entryVal === 'number') {
        exitPrice = entryVal;
      } else {
        exitPrice = entryVal.price;
        if (entryVal.timestamp) {
          exitPriceTime = entryVal.timestamp;
          const ageMs = nowMs - new Date(entryVal.timestamp).getTime();
          if (ageMs > 120000) {
            // Stale market ticker (>120s old) - reject resolution
            addLog('warn', 'system', `[PaperTradingEngine] Rejected resolution for ${record.signalId}: Market ticker timestamp is stale (${Math.round(ageMs / 1000)}s old)`);
            continue;
          }
        }
      }

      if (!exitPrice || exitPrice <= 0) {
        // Missing valid price data — do not count as completed
        continue;
      }

      const rawPriceChangePct = ((exitPrice - record.entryPriceUsd) / record.entryPriceUsd) * 100;
      const grossReturnPercent = Number(
        (record.direction === 'buy' ? rawPriceChangePct : -rawPriceChangePct).toFixed(4)
      );
      const netReturnPercent = Number((grossReturnPercent - record.assumedCosts.combinedCostPercent).toFixed(4));

      let outcome: PaperOutcomeType = 'neutral';
      if (grossReturnPercent > paperConfig.neutralThresholdPercent) {
        outcome = 'favorable';
      } else if (grossReturnPercent < -paperConfig.neutralThresholdPercent) {
        outcome = 'unfavorable';
      } else {
        outcome = 'neutral';
      }

      const timingValid = verifySignalTiming(record);

      record.status = 'completed';
      record.completedAt = new Date().toISOString();
      record.exitPriceUsd = exitPrice;
      record.exitPriceTimestamp = exitPriceTime;
      record.grossReturnPercent = grossReturnPercent;
      record.netReturnPercent = netReturnPercent;
      record.outcome = outcome;
      record.isTimingValid = timingValid;
      record.timingWindowMs = new Date(record.evaluationDueAt).getTime() - new Date(record.timestamp).getTime();
      if (!timingValid) {
        record.flaggedReason = `Observation window ${record.timingWindowMs}ms does not match required 300,000ms (+/-1000ms)`;
      }

      evaluatedCount++;
      addLog('info', 'system', `[PaperTradingEngine] Signal ${record.signalId} completed: Gross ${grossReturnPercent}%, Net ${netReturnPercent}%, Outcome ${outcome.toUpperCase()}, TimingValid=${timingValid}`);
    }
  }

  if (evaluatedCount > 0) {
    saveStoreToDisk();
  }

  return evaluatedCount;
}

/**
 * Helper function to compute paper trading summary for a specific subset of signal records
 */
export function calculateSubSummary(records: PaperSignalRecord[]): PaperSubSummary {
  const completedRecords = records.filter(r => r.status === 'completed');
  const validCompletedRecords = completedRecords.filter(r => verifySignalTiming(r));
  const invalidTimingRecords = completedRecords.filter(r => !verifySignalTiming(r));
  const unresolvedRecords = records.filter(r => r.status === 'unresolved');

  let winCount = 0;
  let lossCount = 0;
  let neutralCount = 0;
  let cumulativeGrossReturnPercent = 0;
  let cumulativeNetReturnPercent = 0;

  const buyRecords = validCompletedRecords.filter(r => r.direction === 'buy');
  const sellRecords = validCompletedRecords.filter(r => r.direction === 'sell');

  function computeDirectionalStats(directionalRecords: PaperSignalRecord[], isSampleSizeSufficient: boolean): DirectionalStats {
    let wins = 0;
    let losses = 0;
    let neutrals = 0;
    for (const r of directionalRecords) {
      if (r.outcome === 'favorable') wins++;
      else if (r.outcome === 'unfavorable') losses++;
      else neutrals++;
    }
    const winRate = isSampleSizeSufficient
      ? Number(((wins / (wins + losses || 1)) * 100).toFixed(2))
      : null;
    return {
      totalCount: directionalRecords.length,
      winCount: wins,
      lossCount: losses,
      neutralCount: neutrals,
      winRatePercent: winRate,
    };
  }

  // Track drawdown curve chronologically using ONLY timing-valid completed records
  const sortedCompleted = [...validCompletedRecords].sort(
    (a, b) => new Date(a.completedAt || 0).getTime() - new Date(b.completedAt || 0).getTime()
  );

  let runningNetReturn = 0;
  let peakNetReturnPercent = 0;
  let maxDrawdownPercent = 0;
  let compoundedFactor = 1.0;

  for (const rec of sortedCompleted) {
    if (rec.outcome === 'favorable') winCount++;
    else if (rec.outcome === 'unfavorable') lossCount++;
    else neutralCount++;

    const gross = rec.grossReturnPercent || 0;
    const net = rec.netReturnPercent || 0;

    cumulativeGrossReturnPercent += gross;
    cumulativeNetReturnPercent += net;

    compoundedFactor *= (1 + net / 100);

    runningNetReturn += net;
    if (runningNetReturn > peakNetReturnPercent) {
      peakNetReturnPercent = runningNetReturn;
    }
    const currentDrawdown = peakNetReturnPercent - runningNetReturn;
    if (currentDrawdown > maxDrawdownPercent) {
      maxDrawdownPercent = currentDrawdown;
    }
  }

  const compoundedNetReturnPercent = Number(((compoundedFactor - 1) * 100).toFixed(4));
  const sampleSizeSufficient = validCompletedRecords.length >= paperConfig.minSampleSizeForAggregatePerformance;
  const winRatePercent = sampleSizeSufficient
    ? Number(((winCount / (winCount + lossCount || 1)) * 100).toFixed(2))
    : null;

  return {
    totalSignalsRecorded: records.length,
    completedSignalsCount: completedRecords.length,
    validCompletedCount: validCompletedRecords.length,
    invalidTimingCount: invalidTimingRecords.length,
    unresolvedSignalsCount: unresolvedRecords.length,
    winCount,
    lossCount,
    neutralCount,
    winRatePercent,
    sampleSizeSufficient,
    cumulativeGrossReturnPercent: Number(cumulativeGrossReturnPercent.toFixed(4)),
    cumulativeNetReturnPercent: Number(cumulativeNetReturnPercent.toFixed(4)),
    compoundedNetReturnPercent,
    peakNetReturnPercent: Number(peakNetReturnPercent.toFixed(4)),
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(4)),
    buyStats: computeDirectionalStats(buyRecords, sampleSizeSufficient),
    sellStats: computeDirectionalStats(sellRecords, sampleSizeSufficient),
  };
}

/**
 * Compute paper trading summary statistics and risk metrics
 */
export function getPaperTradingSummary(): PaperTradingSummary {
  const allRecords = Array.from(paperSignalStore.values());

  const liveRecords = allRecords.filter(r => r.source !== 'simulation_script');
  const simRecords = allRecords.filter(r => r.source === 'simulation_script');

  const combinedSummary = calculateSubSummary(allRecords);
  const liveTelemetrySummary = calculateSubSummary(liveRecords);
  const simulationScriptSummary = calculateSubSummary(simRecords);

  return {
    config: paperConfig,
    ...combinedSummary,
    liveTelemetrySummary,
    simulationScriptSummary,
    liveTelemetrySignalCount: liveRecords.length,
    simulationScriptSignalCount: simRecords.length,
    dataOutagePaused,
    dataOutageReason,
    storageBackend: 'Persistent JSON File (/server/data/paper_signals.json)',
    dataFreshnessTimestamp: lastEvaluationTimestamp,
    watermark: 'PAPER / HYPOTHETICAL SIMULATION ONLY',
  };
}

export function listPaperSignals(limit = 100): PaperSignalRecord[] {
  const list = Array.from(paperSignalStore.values());
  return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit);
}

export function loadPersistedSignals(): PaperSignalRecord[] {
  const persistFile = path.join(DATA_DIR, 'paper_signals.json');
  if (fs.existsSync(persistFile)) {
    try {
      const raw = fs.readFileSync(persistFile, 'utf-8');
      return JSON.parse(raw);
    } catch {
      // Fallback
    }
  }
  return Array.from(paperSignalStore.values());
}

export function resetPaperTradingStoreForTest() {
  isTestStoreActive = true;
  paperSignalStore.clear();
  dataOutagePaused = false;
  dataOutageReason = null;
  lastEvaluationTimestamp = new Date().toISOString();
  saveStoreToDisk();
}

