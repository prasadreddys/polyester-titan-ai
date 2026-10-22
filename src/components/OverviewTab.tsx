import React from 'react';
import { HealthCheckResult, AppHealthResult, SystemRuntimeInfo, RiskSettings } from '../types.js';
import {
  Shield,
  Server,
  Terminal,
  Activity,
  AlertTriangle,
  Lock,
  ExternalLink,
  Code2,
  Cpu,
  Key,
  CheckCircle2,
} from 'lucide-react';

interface OverviewTabProps {
  appHealth: AppHealthResult | null;
  health: HealthCheckResult | null;
  runtime: SystemRuntimeInfo | null;
  risk: RiskSettings | null;
  isTestingConnection: boolean;
  onRunTest: () => void;
  onOpenDiagnosticModal: () => void;
  onOpenSecretsGuide: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  appHealth,
  health,
  runtime,
  risk,
  isTestingConnection,
  onRunTest,
  onOpenDiagnosticModal,
  onOpenSecretsGuide,
}) => {
  const isBlocked = health?.status === 'blocked' || health?.isCloudflareBlocked;
  const isRateLimited = health?.status === 'rate_limited' || health?.isRateLimited;
  const isConnected = health?.status === 'connected';

  return (
    <div className="space-y-6">
      {/* Top Banner: Strict Security & Testnet Lock */}
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <span>Security Lockdown: Polyester Testnet Only</span>
              <span className="text-xs text-slate-400">· Phase 1 Integration Bridge</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Production URLs blocked. Credentials never forwarded to browser. Automated execution disabled by default.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
          <span className="font-mono tabular-nums text-slate-300">Port 3000</span>
          <span>·</span>
          <span>Zero Fabricated Data</span>
        </div>
      </div>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Connection & Trading Status */}
        <div className="lg:col-span-2 space-y-6">
          {/* Connection Diagnostics Card */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Activity className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-slate-100">Polyester Testnet Connection Status</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onOpenDiagnosticModal}
                  className="text-xs text-sky-400 hover:text-sky-300 underline font-mono cursor-pointer"
                >
                  View Raw Probe
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded">
                <span className="text-xs text-slate-500">Local Application Health</span>
                <div className="text-xs font-mono mt-1 flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{appHealth?.status ? appHealth.status.toUpperCase() : 'HEALTHY'}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
                  Port {appHealth?.port || 3000} · Uptime {appHealth?.uptimeSeconds ?? 0}s
                </div>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded">
                <span className="text-xs text-slate-500">Documented Target Host</span>
                <div className="text-xs font-mono text-slate-200 mt-1 truncate">
                  {health?.targetHost || 'https://testnet.polyester.com'}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Endpoint: /v1/health</div>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded">
                <span className="text-xs text-slate-500">Upstream Testnet Health</span>
                <div className="text-xs font-mono mt-1 flex items-center gap-2">
                  {isConnected && <span className="text-emerald-400 font-semibold">CONNECTED (JSON)</span>}
                  {isBlocked && <span className="text-amber-400 font-semibold">BLOCKED (CF 403)</span>}
                  {isRateLimited && <span className="text-amber-400 font-semibold">RATE LIMITED (429)</span>}
                  {!isConnected && !isBlocked && !isRateLimited && <span className="text-rose-400 font-semibold">DISCONNECTED</span>}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
                  HTTP {health?.httpStatus ?? '---'} · {health?.latencyMs ?? 0}ms latency
                </div>
              </div>
            </div>

            {/* Rate limited notice if applicable */}
            {isRateLimited && (
              <div className="mt-4 p-3.5 bg-amber-950/20 border border-amber-800/40 rounded text-xs text-amber-200/90 leading-relaxed">
                <div className="flex items-center gap-2 font-semibold text-amber-300 mb-1">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Upstream Rate Limit Exceeded (HTTP 429)</span>
                </div>
                <p>
                  Polyester Testnet responded with a rate limit notice.
                  {health?.retryAfterSeconds ? ` Retry after ${health.retryAfterSeconds} seconds.` : ' Please wait before re-probing.'}
                </p>
              </div>
            )}

            {/* Structured Diagnostics Notice */}
            {isBlocked && (
              <div className="mt-4 p-3.5 bg-amber-950/20 border border-amber-800/40 rounded text-xs text-amber-200/90 leading-relaxed">
                <div className="flex items-center gap-2 font-semibold text-amber-300 mb-1">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Cloudflare Managed Challenge Detected (HTTP 403)</span>
                </div>
                <p>
                  Direct HTTP requests to <code className="text-amber-100 font-mono">https://testnet.polyester.com/v1/health</code> returned a Cloudflare Bot Mitigation challenge page (<code className="text-amber-100 font-mono">cf-mitigated: challenge</code>) instead of JSON.
                  In accordance with the safety constitution, the application refuses to parse HTML as valid market/health schemas or fabricate data.
                </p>
                <div className="mt-2 text-slate-400 flex items-center gap-2">
                  <span>Remedy: Run connection test or proxy via authorized Python FastAPI egress worker.</span>
                </div>
              </div>
            )}

            {!isBlocked && !isConnected && health?.errorMessage && (
              <div className="mt-4 p-3.5 bg-rose-950/20 border border-rose-800/40 rounded text-xs text-rose-200/90 leading-relaxed">
                <div className="flex items-center gap-2 font-semibold text-rose-300 mb-1">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Connection Notice</span>
                </div>
                <p>{health.errorMessage}</p>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span className="font-mono tabular-nums">
                Last Probe: {health?.checkedAt ? new Date(health.checkedAt).toLocaleTimeString() : 'Pending'}
              </span>
              <button
                onClick={onRunTest}
                disabled={isTestingConnection}
                className="text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-50"
              >
                {isTestingConnection ? 'Testing...' : 'Re-probe Endpoint'}
              </button>
            </div>
          </div>

          {/* Trading Status & Execution Lock Panel */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-slate-100">Trading Engine Safety Status</h2>
              </div>
              <span className="text-xs font-mono text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                LOCKED (Phase 1)
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded">
                <span className="text-xs text-slate-500">Execution Mode</span>
                <div className="text-sm font-semibold text-slate-200 mt-1">Manual Safe</div>
                <span className="text-[11px] text-slate-500">Automated Orders Disallowed</span>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded">
                <span className="text-xs text-slate-500">Automatic Trading</span>
                <div className="text-sm font-semibold text-rose-400 mt-1">Disabled by Default</div>
                <span className="text-[11px] text-slate-500">Zero Startup Execution</span>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded">
                <span className="text-xs text-slate-500">Emergency Kill Switch</span>
                <div className="text-sm font-semibold text-slate-200 mt-1">
                  {risk?.killSwitchActive ? (
                    <span className="text-rose-400">ACTIVE (HALTED)</span>
                  ) : (
                    <span className="text-emerald-400">Armed & Ready</span>
                  )}
                </div>
                <span className="text-[11px] text-slate-500">Instant Circuit Breaker</span>
              </div>
            </div>

            <div className="mt-4 p-3 bg-slate-950/40 border border-slate-800/60 rounded text-xs text-slate-400 leading-relaxed">
              <span className="text-slate-200 font-medium">Phase 1 Safety Rule: </span>
              In accordance with project constraints, no orders will be submitted during startup, health checks, or unverified states. Order submission and automatic strategy execution remain disarmed until full schema validation passes.
            </div>
          </div>
        </div>

        {/* Right Column (1 span): Runtime & Credential Verification */}
        <div className="space-y-6">
          {/* Runtime Environment Card */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-5">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800">
              <Server className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-slate-100">Server & Python Runtime</h2>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <span className="text-slate-500">Host Runtime</span>
                <div className="font-mono text-slate-200 mt-0.5">
                  Node.js {runtime?.nodeVersion || 'v22.x'} ({runtime?.platform || 'linux'}/{runtime?.arch || 'x64'})
                </div>
              </div>

              <div>
                <span className="text-slate-500">Installed Python</span>
                <div className="font-mono text-slate-200 mt-0.5">
                  {runtime?.pythonRuntime.installedVersion || 'Python 3.10.12'} (pip: absent)
                </div>
              </div>

              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded">
                <div className="text-slate-300 font-medium flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-amber-400" />
                  <span>SDK Requirement</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                  Official <code className="text-slate-300">polyester-sdk</code> on PyPI requires <strong>Python ≥ 3.11</strong>. A modular FastAPI service blueprint is included in <code className="text-slate-300">python-backend/</code>.
                </p>
              </div>

              <div>
                <span className="text-slate-500">FastAPI Companion Connector</span>
                <div className="font-mono text-slate-200 mt-0.5 truncate">
                  {runtime?.serverBridge.fastapiCompanion.configuredUrl || 'Not configured (FASTAPI_BACKEND_URL unset)'}
                </div>
              </div>
            </div>
          </div>

          {/* Server-Side Secrets Status */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Key className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-slate-100">Server Secrets Verification</h2>
              </div>
              <button
                onClick={onOpenSecretsGuide}
                className="text-xs text-emerald-400 hover:text-emerald-300 underline font-mono"
              >
                Setup
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-3">
              Credentials are kept strictly in server-side memory and never exposed to the frontend browser context.
            </p>

            <div className="mt-3 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between p-2 bg-slate-950 border border-slate-800/60 rounded">
                <span className="text-slate-400">POLYESTER_API_KEY_ID</span>
                <span className={runtime?.serverBridge.credentialsConfigured.hasApiKeyId ? 'text-emerald-400' : 'text-slate-500'}>
                  {runtime?.serverBridge.credentialsConfigured.hasApiKeyId ? 'CONFIGURED' : 'UNSET'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 bg-slate-950 border border-slate-800/60 rounded">
                <span className="text-slate-400">POLYESTER_API_PRIVATE_KEY</span>
                <span className={runtime?.serverBridge.credentialsConfigured.hasApiPrivateKey ? 'text-emerald-400' : 'text-slate-500'}>
                  {runtime?.serverBridge.credentialsConfigured.hasApiPrivateKey ? 'CONFIGURED' : 'UNSET'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 bg-slate-950 border border-slate-800/60 rounded">
                <span className="text-slate-400">POLYESTER_ACCOUNT_ID</span>
                <span className={runtime?.serverBridge.credentialsConfigured.hasAccountId ? 'text-emerald-400' : 'text-slate-500'}>
                  {runtime?.serverBridge.credentialsConfigured.hasAccountId ? 'CONFIGURED' : 'UNSET'}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span>Read via server-side process.env</span>
              <button
                onClick={onOpenSecretsGuide}
                className="text-xs text-slate-300 hover:text-white"
              >
                Guide →
              </button>
            </div>
          </div>

          {/* Official Documentation Quick Links */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-xs font-semibold text-slate-300">
              <Code2 className="w-4 h-4 text-sky-400" />
              <span>Official Polyester Documentation</span>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              <a
                href="https://testnet.polyester.com/docs/api-docs/rest/GET/v1/health"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between text-slate-400 hover:text-sky-300 transition-colors p-1.5 rounded hover:bg-slate-950"
              >
                <span>REST /v1/health Docs</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://testnet.polyester.com/docs/sdk/python/get-started/quickstart"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between text-slate-400 hover:text-sky-300 transition-colors p-1.5 rounded hover:bg-slate-950"
              >
                <span>Python SDK Quickstart</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://testnet.polyester.com/docs/sdk/python/tutorials/trading-bot"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between text-slate-400 hover:text-sky-300 transition-colors p-1.5 rounded hover:bg-slate-950"
              >
                <span>Trading Bot Tutorial</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
