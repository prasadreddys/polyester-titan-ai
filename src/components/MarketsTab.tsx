import React, { useEffect, useState } from 'react';
import { HealthCheckResult, MarketItem, MarketsResponse } from '../types.js';
import { BarChart3, AlertCircle, RefreshCw, ShieldAlert, Clock, AlertTriangle } from 'lucide-react';

interface MarketsTabProps {
  health: HealthCheckResult | null;
  onRunTest: () => void;
  isTestingConnection: boolean;
}

export const MarketsTab: React.FC<MarketsTabProps> = ({
  health,
  onRunTest,
  isTestingConnection,
}) => {
  const [markets, setMarkets] = useState<MarketItem[]>([]);
  const [feedStatus, setFeedStatus] = useState<MarketsResponse['status']>('empty');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [upstreamTimestamp, setUpstreamTimestamp] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchMarkets = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/markets');
      const data: MarketsResponse = await res.json();
      setMarkets(data.markets || []);
      setFeedStatus(data.status || 'empty');
      setStatusMessage(data.message || '');
      setUpstreamTimestamp(data.upstreamTimestamp || null);
    } catch {
      setMarkets([]);
      setFeedStatus('unavailable');
      setStatusMessage('Failed to query backend markets endpoint');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMarkets();
  }, [health]);

  const isConnected = health?.status === 'connected' && health?.schemaValid;
  const isBlocked = feedStatus === 'blocked' || health?.status === 'blocked' || health?.isCloudflareBlocked;
  const isRateLimited = feedStatus === 'rate_limited' || health?.status === 'rate_limited';

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-900/40 border border-slate-800 rounded-lg">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-sky-400" />
            <span>Polyester Testnet Market Catalog</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real data only · Displaying authentic symbol, identifier, status, and prices when returned
          </p>
        </div>

        <div className="flex items-center gap-3">
          {upstreamTimestamp && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Upstream: {new Date(upstreamTimestamp).toLocaleTimeString()}</span>
            </div>
          )}
          <div className="text-xs font-mono tabular-nums text-slate-400">
            Active Verified Markets: <span className="text-slate-100 font-semibold">{markets.length}</span>
          </div>
          <button
            onClick={() => {
              fetchMarkets();
              onRunTest();
            }}
            disabled={isLoading || isTestingConnection}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isTestingConnection ? 'animate-spin' : ''}`} />
            <span>Refresh Feed</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {markets.length === 0 ? (
        <div className="bg-slate-900/30 border border-slate-800 rounded-lg p-10 text-center max-w-2xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
            {isBlocked ? (
              <ShieldAlert className="w-6 h-6 text-amber-400" />
            ) : isRateLimited ? (
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            ) : isConnected ? (
              <BarChart3 className="w-6 h-6 text-sky-400" />
            ) : (
              <AlertCircle className="w-6 h-6 text-rose-400" />
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              {isBlocked
                ? 'Market Feed Inactive: Cloudflare Managed Challenge'
                : isRateLimited
                ? 'Market Feed Rate Limited (HTTP 429)'
                : isConnected
                ? 'Empty Market Catalog: No Active Pairs'
                : 'Market Feed Unavailable / Disconnected'}
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
              {statusMessage ||
                'In compliance with strict security requirements, this table remains completely empty until authentic market data is retrieved and schema-verified from Polyester Testnet.'}
            </p>
          </div>

          {/* Verification checklist */}
          <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded text-left text-xs space-y-2 max-w-md mx-auto">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Verification Pre-conditions
            </div>
            <div className="flex items-center justify-between text-slate-300 font-mono">
              <span>Polyester Gateway Check:</span>
              <span className={isConnected ? 'text-emerald-400' : isBlocked ? 'text-amber-400' : isRateLimited ? 'text-amber-400' : 'text-rose-400'}>
                {isConnected ? 'Passed (200 OK)' : isBlocked ? 'Challenged (403)' : isRateLimited ? 'Rate Limited (429)' : 'Disconnected'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300 font-mono">
              <span>JSON Response Schema:</span>
              <span className={health?.schemaValid ? 'text-emerald-400' : 'text-slate-500'}>
                {health?.schemaValid ? 'Valid Schema' : 'Awaiting Validation'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300 font-mono">
              <span>Fabricated Data Suppression:</span>
              <span className="text-emerald-400">Enforced (0 Mock Entries)</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                onRunTest();
                fetchMarkets();
              }}
              disabled={isTestingConnection}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors"
            >
              {isTestingConnection ? 'Testing Connection...' : 'Re-verify Endpoint'}
            </button>
          </div>
        </div>
      ) : (
        /* Real verified market pairs table */
        <div className="bg-slate-900/40 border border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Market Symbol</th>
                  <th className="py-2.5 px-4 font-medium">Identifier</th>
                  <th className="py-2.5 px-4 font-medium text-right">Last Price</th>
                  <th className="py-2.5 px-4 font-medium text-right">Index Price</th>
                  <th className="py-2.5 px-4 font-medium text-right">Tick Size</th>
                  <th className="py-2.5 px-4 font-medium text-right">Status</th>
                  <th className="py-2.5 px-4 font-medium text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums text-slate-300">
                {markets.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-4 font-semibold text-slate-100">{item.symbol}</td>
                    <td className="py-2.5 px-4 text-slate-400 truncate max-w-[120px]">{item.marketId || '---'}</td>
                    <td className="py-2.5 px-4 text-right text-slate-200">
                      {item.lastPrice !== null && item.lastPrice !== undefined ? String(item.lastPrice) : '---'}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-400">
                      {item.indexPrice !== null && item.indexPrice !== undefined ? String(item.indexPrice) : '---'}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-400">
                      {item.priceTickSize !== null && item.priceTickSize !== undefined ? String(item.priceTickSize) : '---'}
                    </td>
                    <td className="py-2.5 px-4 text-right text-emerald-400">
                      {item.status || 'Verified'}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-500">
                      {item.upstreamTimestamp ? new Date(item.upstreamTimestamp).toLocaleTimeString() : '---'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
