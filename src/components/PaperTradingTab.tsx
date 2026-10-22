/**
 * POLYESTER TITAN AI — Paper Trading Dashboard Component (Phase 24)
 * Displays research parameters, observation metrics, completed signals,
 * unresolved signals, gross/net returns, max drawdown, and assumed costs.
 * Strictly labeled: PAPER / HYPOTHETICAL SIMULATION ONLY
 */

import React, { useState, useEffect } from 'react';

export interface PaperConfig {
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

export interface PaperSignal {
  signalId: string;
  symbol: string;
  timestamp: string;
  evaluationDueAt: string;
  direction: 'buy' | 'sell';
  entryPriceUsd: number;
  compositeScore: number;
  status: 'unresolved' | 'completed' | 'invalidated';
  completedAt?: string;
  exitPriceUsd?: number;
  grossReturnPercent?: number;
  netReturnPercent?: number;
  outcome?: 'favorable' | 'unfavorable' | 'neutral' | 'unresolved';
  assumedCosts: {
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

export interface PaperSummary {
  config: PaperConfig;
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
  watermark: string;
}

export function PaperTradingTab() {
  const [summary, setSummary] = useState<PaperSummary | null>(null);
  const [signals, setSignals] = useState<PaperSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);

  const fetchPaperData = async () => {
    try {
      const res = await fetch('/api/paper-trading');
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setSignals(data.signals || []);
      }
    } catch (err) {
      console.error('Failed to load paper trading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerEvaluation = async () => {
    setEvaluating(true);
    try {
      await fetch('/api/paper-trading/evaluate', { method: 'POST' });
      await fetchPaperData();
    } catch (err) {
      console.error('Evaluation trigger error:', err);
    } finally {
      setEvaluating(false);
    }
  };

  useEffect(() => {
    fetchPaperData();
    const timer = setInterval(fetchPaperData, 10000); // 10s polling
    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent mb-4"></div>
        <p className="text-sm font-mono">Loading Paper Trading Telemetry...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Prominent Paper / Hypothetical Disclaimer Banner */}
      <div className="bg-amber-950/60 border border-amber-500/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-amber-500 text-slate-950 font-bold text-xs rounded-full uppercase tracking-wider">
            PAPER / HYPOTHETICAL
          </span>
          <div>
            <h3 className="text-sm font-semibold text-amber-200">
              Multi-Agent Signal Validation & Research Mode (Phase 26)
            </h3>
            <p className="text-xs text-amber-300/80 mt-0.5">
              Zero exchange orders submitted. Results reflect paper evaluation over 5-minute observation windows with assumed fees & slippage.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {summary?.dataOutagePaused ? (
            <span className="px-2.5 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-lg text-xs font-mono font-bold animate-pulse">
              Outage: Signal Pause Active
            </span>
          ) : (
            <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-mono font-bold">
              Data Feed: Verified Live Testnet
            </span>
          )}
          <button
            onClick={handleTriggerEvaluation}
            disabled={evaluating}
            className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 rounded-lg text-xs font-mono transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {evaluating ? 'Evaluating Outcomes...' : 'Trigger Outcomes Evaluation'}
          </button>
        </div>
      </div>

      {/* Persistence & Outage Notice */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-2 text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Storage: <strong className="text-slate-100">{summary?.storageBackend || 'Persistent JSON Disk File'}</strong></span>
        </div>
        <div className="text-slate-400">
          Watermark: <span className="text-amber-400 font-bold">{summary?.watermark}</span>
        </div>
      </div>

      {/* Live Telemetry Observation Progress & Gate Status (Phase 28) */}
      <div className="bg-slate-900 border border-cyan-500/40 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-3">
          <div>
            <h4 className="text-sm font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
              Verified Live-Telemetry Observation Stream
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Calculated exclusively from verified live testnet observations. Simulation script records are strictly isolated.
            </p>
          </div>
          <div className="text-right font-mono text-xs">
            <div className="text-slate-300 font-bold">
              Live Signals Recorded: {summary?.liveTelemetrySummary?.totalSignalsRecorded || 0}
            </div>
            <div className="text-slate-400">
              Live Completed: {summary?.liveTelemetrySummary?.completedSignalsCount || 0} / 100
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 text-xs font-mono">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="text-slate-400 uppercase text-[10px]">Live Sample Gate</div>
            <div className="text-slate-200 font-bold mt-1">
              {summary?.liveTelemetrySummary?.sampleSizeSufficient ? (
                <span className="text-emerald-400">PASSED (N &ge; 100)</span>
              ) : (
                <span className="text-amber-400">INSUFFICIENT SAMPLE (N &lt; 100)</span>
              )}
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="text-slate-400 uppercase text-[10px]">Live Win Rate</div>
            <div className="text-slate-200 font-bold mt-1">
              {summary?.liveTelemetrySummary?.winRatePercent !== null && summary?.liveTelemetrySummary?.winRatePercent !== undefined ? (
                <span className="text-emerald-400">{summary.liveTelemetrySummary.winRatePercent}%</span>
              ) : (
                <span className="text-slate-500">SUPPRESSED (Need 100 Live Signals)</span>
              )}
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="text-slate-400 uppercase text-[10px]">Live Net Return</div>
            <div className="text-slate-200 font-bold mt-1">
              {(summary?.liveTelemetrySummary?.cumulativeNetReturnPercent || 0) >= 0 ? '+' : ''}
              {(summary?.liveTelemetrySummary?.cumulativeNetReturnPercent || 0).toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sample Progress */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Total Sample Progress (N = 100)
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100 mt-2">
            {summary?.completedSignalsCount || 0} / 100
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-emerald-500 h-full transition-all duration-500"
              style={{ width: `${Math.min(100, ((summary?.completedSignalsCount || 0) / 100) * 100)}%` }}
            ></div>
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            {summary?.sampleSizeSufficient
              ? `Win Rate: ${summary?.winRatePercent}% (Sample N >= 100)`
              : 'N < 100: Aggregate win-rate suppressed.'}
          </div>
        </div>

        {/* Unresolved Signals */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Unresolved Signals (5m Window)
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-400 mt-2">
            {summary?.unresolvedSignalsCount || 0}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Total Recorded: <span className="text-slate-200">{summary?.totalSignalsRecorded || 0}</span>
          </div>
        </div>

        {/* Cumulative Returns */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Cumulative Returns
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <div className="text-xl font-bold font-mono text-emerald-400">
              Net: {(summary?.cumulativeNetReturnPercent || 0) >= 0 ? '+' : ''}
              {summary?.cumulativeNetReturnPercent?.toFixed(2)}%
            </div>
            <div className="text-xs font-mono text-slate-400">
              Gross: {(summary?.cumulativeGrossReturnPercent || 0) >= 0 ? '+' : ''}
              {summary?.cumulativeGrossReturnPercent?.toFixed(2)}%
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            After 0.20% fees + 0.10% slippage costs.
          </div>
        </div>

        {/* Max Drawdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Peak-to-Trough Drawdown
          </div>
          <div className="text-2xl font-bold font-mono text-rose-400 mt-2">
            -{summary?.maxDrawdownPercent?.toFixed(2)}%
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Peak Net Return: +{summary?.peakNetReturnPercent?.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Directional BUY vs SELL Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* BUY Signals Breakdown */}
        <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              BUY Signals Performance
            </span>
            <span className="text-xs font-mono text-slate-400">
              Completed: {summary?.buyStats?.totalCount || 0}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
            <div className="bg-slate-950 p-2 rounded border border-slate-800">
              <div className="text-slate-400 text-[10px]">Favorable (Wins)</div>
              <div className="text-emerald-400 font-bold mt-0.5">{summary?.buyStats?.winCount || 0}</div>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800">
              <div className="text-slate-400 text-[10px]">Unfavorable (Loss)</div>
              <div className="text-rose-400 font-bold mt-0.5">{summary?.buyStats?.lossCount || 0}</div>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800">
              <div className="text-slate-400 text-[10px]">BUY Win Rate</div>
              <div className="text-slate-200 font-bold mt-0.5">
                {summary?.buyStats?.winRatePercent !== null && summary?.buyStats?.winRatePercent !== undefined
                  ? `${summary.buyStats.winRatePercent}%`
                  : 'N < 100'}
              </div>
            </div>
          </div>
        </div>

        {/* SELL Signals Breakdown */}
        <div className="bg-slate-900 border border-rose-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              SELL Signals Performance
            </span>
            <span className="text-xs font-mono text-slate-400">
              Completed: {summary?.sellStats?.totalCount || 0}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
            <div className="bg-slate-950 p-2 rounded border border-slate-800">
              <div className="text-slate-400 text-[10px]">Favorable (Wins)</div>
              <div className="text-emerald-400 font-bold mt-0.5">{summary?.sellStats?.winCount || 0}</div>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800">
              <div className="text-slate-400 text-[10px]">Unfavorable (Loss)</div>
              <div className="text-rose-400 font-bold mt-0.5">{summary?.sellStats?.lossCount || 0}</div>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800">
              <div className="text-slate-400 text-[10px]">SELL Win Rate</div>
              <div className="text-slate-200 font-bold mt-0.5">
                {summary?.sellStats?.winRatePercent !== null && summary?.sellStats?.winRatePercent !== undefined
                  ? `${summary.sellStats.winRatePercent}%`
                  : 'N < 100'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Configurable Research Parameters & Cost Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
          <span>Configurable Research Parameters & Assumed Costs</span>
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="text-slate-400">Evaluation Window</div>
            <div className="text-slate-200 font-mono font-bold mt-1">
              {summary?.config.evaluationWindowMinutes} Minutes
            </div>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="text-slate-400">Neutral Movement Threshold</div>
            <div className="text-slate-200 font-mono font-bold mt-1">
              ±{summary?.config.neutralThresholdPercent}%
            </div>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="text-slate-400">Assumed Execution Fees</div>
            <div className="text-slate-200 font-mono font-bold mt-1">
              {(summary?.config.entryFeePercent || 0.1) + (summary?.config.exitFeePercent || 0.1)}% (0.10% / side)
            </div>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="text-slate-400">Assumed Slippage</div>
            <div className="text-slate-200 font-mono font-bold mt-1">
              {(summary?.config.entrySlippagePercent || 0.05) + (summary?.config.exitSlippagePercent || 0.05)}% (0.05% / side)
            </div>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mt-3 italic">
          Note: These parameters are configurable research benchmarks, not proven optimal values. Order book depth is currently unavailable via REST endpoint mode.
        </p>
      </div>

      {/* Paper Signal Records Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            Paper Signal Observations Log ({signals.length})
          </h4>
          <span className="text-xs font-mono text-slate-400">
            Freshness: {summary?.dataFreshnessTimestamp ? new Date(summary.dataFreshnessTimestamp).toLocaleTimeString() : 'N/A'}
          </span>
        </div>

        {signals.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs font-mono">
            No paper signals recorded yet. Signal coordinator automatically records eligible multi-agent decisions.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="p-3">Signal ID</th>
                  <th className="p-3">Symbol</th>
                  <th className="p-3">Direction</th>
                  <th className="p-3">Entry Price</th>
                  <th className="p-3">Exit Price (5m)</th>
                  <th className="p-3">Gross %</th>
                  <th className="p-3">Net %</th>
                  <th className="p-3">Outcome</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {signals.map(s => (
                  <tr key={s.signalId} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3 text-slate-400 text-[11px]">{s.signalId.slice(0, 16)}</td>
                    <td className="p-3 font-bold text-slate-200">{s.symbol}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${s.direction === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                        {s.direction}
                      </span>
                    </td>
                    <td className="p-3 text-slate-200">${s.entryPriceUsd.toFixed(2)}</td>
                    <td className="p-3 text-slate-200">{s.exitPriceUsd ? `$${s.exitPriceUsd.toFixed(2)}` : 'Pending...'}</td>
                    <td className="p-3 font-semibold">
                      {s.grossReturnPercent !== undefined ? (
                        <span className={s.grossReturnPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {s.grossReturnPercent >= 0 ? '+' : ''}{s.grossReturnPercent.toFixed(2)}%
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-3 font-semibold">
                      {s.netReturnPercent !== undefined ? (
                        <span className={s.netReturnPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {s.netReturnPercent >= 0 ? '+' : ''}{s.netReturnPercent.toFixed(2)}%
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-3">
                      {s.outcome ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                          s.outcome === 'favorable' ? 'bg-emerald-500/20 text-emerald-300' :
                          s.outcome === 'unfavorable' ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-700 text-slate-300'
                        }`}>
                          {s.outcome}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-3">
                      <span className={`text-[10px] font-bold uppercase ${s.status === 'completed' ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

