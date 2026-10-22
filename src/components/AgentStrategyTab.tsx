import React from 'react';
import { Bot, Terminal, Code2, AlertTriangle, ExternalLink, Cpu } from 'lucide-react';

export const AgentStrategyTab: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Bot className="w-4 h-4 text-purple-400" />
            <span>Polyester Python SDK Bot Strategy Architecture</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Technical blueprint based on official Polyester Trading Bot tutorial and Python SDK guides
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-amber-400 bg-amber-950/40 px-2.5 py-1 rounded border border-amber-800/40">
            STRATEGY EXECUTION: DISARMED (Phase 1)
          </span>
        </div>
      </div>

      {/* Python SDK & Environment Compatibility Advisory */}
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Cpu className="w-4 h-4 text-sky-400" />
          <span>Polyester Python SDK Runtime Compatibility Analysis</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Google AI Studio Build containers run <strong>Node.js 22</strong> alongside a minimal system Python (3.10.12) lacking <code className="text-slate-200">pip</code>.
          The official Python SDK on PyPI (<code className="text-slate-200 font-mono">polyester-sdk &gt;= 0.1.0a55</code>) strictly declares <code className="text-slate-200 font-mono">Requires-Python: &gt;=3.11</code>.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-xs">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded">
            <span className="text-slate-400 font-semibold block mb-1">Architecture Solution</span>
            <p className="text-slate-400 leading-normal">
              POLYESTER TITAN AI uses a decoupled microservice architecture:
              the Express Node.js server acts as the primary web and security integration layer, with a modular Python 3.11+ FastAPI service blueprint included in <code className="text-slate-300 font-mono">/python-backend</code> ready to run with <code className="text-slate-300 font-mono">FASTAPI_BACKEND_URL</code>.
            </p>
          </div>
          <div className="p-3 bg-slate-950 border border-slate-800 rounded">
            <span className="text-slate-400 font-semibold block mb-1">Security Guarantees</span>
            <p className="text-slate-400 leading-normal">
              Neither the Node bridge nor the FastAPI service ever expose your API Key ID or Private Key to client-side browser code. All signatures and order payloads remain strictly server-authoritative.
            </p>
          </div>
        </div>
      </div>

      {/* Official Tutorial Strategy Loop Blueprint */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Code2 className="w-4 h-4 text-emerald-400" />
            <span>Polyester SDK Trading Bot Engine Blueprint</span>
          </div>
          <a
            href="https://testnet.polyester.com/docs/sdk/python/tutorials/trading-bot"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 font-mono"
          >
            <span>Official Guide</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          The official Polyester trading bot tutorial dictates a 4-step sequence-checked loop. This architecture is wired into <code className="text-slate-300 font-mono">python-backend/main.py</code>:
        </p>

        <div className="space-y-3 text-xs font-mono">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded">
            <div className="text-emerald-400 font-bold mb-1">1. Sequence-Checked Order Book Synchronization</div>
            <p className="text-slate-400 font-sans text-xs">
              Consumes real-time order book snapshots and verifies sequential sequence IDs to detect missing packets and avoid stale fills.
            </p>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded">
            <div className="text-sky-400 font-bold mb-1">2. Market Constraint & Tick Size Validation</div>
            <p className="text-slate-400 font-sans text-xs">
              Validates minimum notional size, lot size step, and price tick bounds before generating any candidate orders.
            </p>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded">
            <div className="text-purple-400 font-bold mb-1">3. Risk Filter & Circuit Breaker Pass</div>
            <p className="text-slate-400 font-sans text-xs">
              Enforces maximum drawdown, slippage limits, and checks the emergency kill switch before cryptographic signing.
            </p>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded">
            <div className="text-amber-400 font-bold mb-1">4. Ambiguous Outcome Reconciliation</div>
            <p className="text-slate-400 font-sans text-xs">
              Reconciles network dropouts and timeout states against account order history before attempting any retries.
            </p>
          </div>
        </div>

        {/* Phase 1 Status Alert */}
        <div className="p-3.5 bg-amber-950/20 border border-amber-800/40 rounded flex items-start gap-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p>
            Strategy execution is locked in Phase 1. Once the gateway challenge is resolved and real-time order books are verified, Phase 2 will enable paper and testnet order placement under risk guardrails.
          </p>
        </div>
      </div>
    </div>
  );
};
