import React, { useState, useEffect } from 'react';
import { LogEntry } from '../types.js';
import { Terminal, RefreshCw, Filter, ShieldCheck } from 'lucide-react';

export const SystemLogsTab: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const url = filterLevel === 'all' ? '/api/logs' : `/api/logs?level=${filterLevel}`;
      const res = await fetch(url);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filterLevel]);

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-900/40 border border-slate-800 rounded-lg">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-sky-400" />
            <span>Structured Server Audit Logs</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time audit events with automated credential redaction and zero private key leakage
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Level Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800 text-xs font-mono">
            {['all', 'info', 'warn', 'error'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                className={`px-2 py-0.5 rounded uppercase text-[11px] font-medium transition-colors ${
                  filterLevel === lvl
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <button
            onClick={fetchLogs}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Log Feed Display */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden font-mono text-xs">
        <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-slate-400 text-[11px]">
          <span>Server In-Memory Ring Buffer ({logs.length} entries)</span>
          <div className="flex items-center gap-1.5 text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Sanitizer Active: Credentials Masked</span>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No audit logs recorded for filter level [{filterLevel}].
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60 max-h-[500px] overflow-y-auto">
            {logs.map((log) => {
              const levelColor =
                log.level === 'error'
                  ? 'text-rose-400'
                  : log.level === 'warn'
                  ? 'text-amber-400'
                  : 'text-sky-400';

              return (
                <div key={log.id} className="p-3 hover:bg-slate-900/40 transition-colors space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-slate-500 tabular-nums">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`uppercase font-bold ${levelColor}`}>
                      [{log.level}]
                    </span>
                    <span className="text-slate-400">[{log.category}]</span>
                  </div>
                  <div className="text-slate-200 leading-relaxed break-all">
                    {log.message}
                  </div>
                  {log.details && Object.keys(log.details).length > 0 && (
                    <pre className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800/80 overflow-x-auto mt-1">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
