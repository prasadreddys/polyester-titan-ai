import React, { useState } from 'react';
import { HealthCheckResult, AuthenticatedHealthCheckResult } from '../types.js';
import { X, Activity, RefreshCw, AlertTriangle, CheckCircle2, ShieldAlert, Key, Lock, ShieldCheck } from 'lucide-react';

interface HealthProbeModalProps {
  isOpen: boolean;
  onClose: () => void;
  health: HealthCheckResult | null;
  isTesting: boolean;
  onRunTest: () => void;
}

export const HealthProbeModal: React.FC<HealthProbeModalProps> = ({
  isOpen,
  onClose,
  health,
  isTesting,
  onRunTest,
}) => {
  const [activeView, setActiveView] = useState<'standard' | 'authenticated'>('standard');
  const [authProbe, setAuthProbe] = useState<AuthenticatedHealthCheckResult | null>(null);
  const [isAuthTesting, setIsAuthTesting] = useState(false);

  if (!isOpen) return null;

  const handleRunAuthProbe = async () => {
    setIsAuthTesting(true);
    try {
      const res = await fetch('/api/health/authenticated', { method: 'POST' });
      const data = await res.json();
      setAuthProbe(data);
    } catch (err) {
      console.error('Authenticated probe error:', err);
    } finally {
      setIsAuthTesting(false);
    }
  };

  const isBlocked = health?.status === 'blocked' || health?.isCloudflareBlocked;
  const isRateLimited = health?.status === 'rate_limited' || health?.isRateLimited;
  const isConnected = health?.status === 'connected';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Polyester Testnet Health Probe Inspector
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 text-xs px-4">
          <button
            onClick={() => setActiveView('standard')}
            className={`py-2.5 px-3 font-medium border-b-2 transition-colors ${
              activeView === 'standard'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Public Gateway Probe (/v1/health)
          </button>
          <button
            onClick={() => {
              setActiveView('authenticated');
              if (!authProbe && !isAuthTesting) {
                handleRunAuthProbe();
              }
            }}
            className={`py-2.5 px-3 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeView === 'authenticated'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-3 h-3" />
            <span>Authenticated Probe (/api/health/authenticated)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono">
          {activeView === 'standard' ? (
            <>
              {/* Status summary */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Overall Probe State</span>
                  <span
                    className={`font-semibold ${
                      isConnected
                        ? 'text-emerald-400'
                        : isBlocked
                        ? 'text-amber-400'
                        : isRateLimited
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {isConnected
                      ? 'CONNECTED'
                      : isBlocked
                      ? 'BLOCKED BY CLOUDFLARE (HTTP 403)'
                      : isRateLimited
                      ? `RATE LIMITED (HTTP 429)${health?.retryAfterSeconds ? ` - RETRY AFTER ${health.retryAfterSeconds}s` : ''}`
                      : 'DISCONNECTED'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">Documented Endpoint</span>
                  <span className="text-slate-200">
                    {health?.targetHost}
                    {health?.targetEndpoint}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">HTTP Status</span>
                  <span className="text-slate-200">
                    {health?.httpStatus !== null ? `${health?.httpStatus} ${health?.statusText || ''}` : '---'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">Content-Type Header</span>
                  <span className="text-slate-200 truncate max-w-[280px]">
                    {health?.contentType || 'None received'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">Round-Trip Latency</span>
                  <span className="text-slate-200 tabular-nums">{health?.latencyMs ?? 0} ms</span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">JSON Schema Validated</span>
                  <span className={health?.schemaValid ? 'text-emerald-400' : 'text-slate-500'}>
                    {health?.schemaValid ? 'True' : 'False'}
                  </span>
                </div>
              </div>

              {/* Technical Diagnostics */}
              {isBlocked && (
                <div className="p-4 bg-amber-950/30 border border-amber-800/60 rounded space-y-2 font-sans">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span>Cloudflare WAF / Managed Challenge Detected</span>
                  </div>
                  <p className="text-xs text-amber-200/90 leading-relaxed">
                    The documented endpoint <code className="text-amber-100 font-mono">https://testnet.polyester.com/v1/health</code> is protected by Cloudflare Bot Management. When accessed from cloud hosting IPs, Cloudflare responds with an HTML challenge page requiring JavaScript/Turnstile verification.
                  </p>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Headers returned: server: cloudflare, cf-mitigated: challenge
                  </div>
                </div>
              )}

              {/* Raw Response Excerpt */}
              <div>
                <span className="text-slate-400 font-sans font-semibold block mb-1">
                  Raw Response Sample (First 300 characters)
                </span>
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded text-slate-300 text-[11px] overflow-x-auto whitespace-pre-wrap break-all">
                  {health?.rawSample || health?.errorMessage || 'No data received.'}
                </pre>
              </div>

              {/* Parsed JSON schema if connected */}
              {health?.parsedData && (
                <div>
                  <span className="text-emerald-400 font-sans font-semibold block mb-1">
                    Verified JSON Health Schema
                  </span>
                  <pre className="p-3 bg-slate-950 border border-slate-800 rounded text-emerald-300 text-[11px] overflow-x-auto">
                    {JSON.stringify(health.parsedData, null, 2)}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Authenticated Probe View */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Authentication Verification</span>
                  <span className={`font-semibold ${authProbe?.authenticated ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {authProbe?.authenticated ? 'VERIFIED (Official SDK)' : 'UNVERIFIED (Fail-Closed Security)'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">Official Signing Specification</span>
                  <span className="text-slate-200">
                    Ed25519 (Official SDK Implementation)
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">Credentials Sent Over Wire</span>
                  <span className={`${authProbe?.credentialsSent ? 'text-amber-400' : 'text-emerald-400'} font-semibold`}>
                    {authProbe?.credentialsSent ? 'YES (Signed RPC Payload)' : 'NO (Credentials Withheld)'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">Actual Upstream HTTP Status</span>
                  <span className="text-slate-200">
                    {authProbe?.httpStatus !== null && authProbe?.httpStatus !== undefined
                      ? `${authProbe.httpStatus} ${authProbe.statusText || ''}`
                      : '---'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">Target Endpoint</span>
                  <span className="text-slate-200">
                    {authProbe?.targetHost || 'https://api.testnet.polyester.com'}{authProbe?.targetEndpoint || '/v1/me'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">Round-Trip Latency</span>
                  <span className="text-slate-200 tabular-nums">{authProbe?.latencyMs ?? 0} ms</span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">Server & CF-Ray</span>
                  <span className="text-slate-200">
                    {authProbe?.headers?.server || '---'} · {authProbe?.headers?.cfRay || 'None'}
                  </span>
                </div>
              </div>

              {/* Verified Identity Information */}
              {authProbe?.identity && (
                <div className="p-4 bg-emerald-950/20 border border-emerald-800/40 rounded space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs font-sans">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Verified Identity Details (From client.auth.me)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                    <div>
                      <span className="text-slate-500 block">Account ID:</span>
                      <span className="font-mono">{authProbe.identity.accountId}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Status:</span>
                      <span className="font-mono text-emerald-400">{authProbe.identity.status}</span>
                    </div>
                    {Object.entries(authProbe.identity).map(([key, value]) => {
                      if (['accountId', 'id', 'status'].includes(key)) return null;
                      if (typeof value === 'object') return null;
                      return (
                        <div key={key}>
                          <span className="text-slate-500 block capitalize">{key}:</span>
                          <span className="font-mono">{String(value)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Authoritative Audit Note */}
              {authProbe?.authSchemeNote && (
                <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded text-amber-200/90 text-[11px] leading-relaxed">
                  <span className="text-amber-400 font-sans font-semibold block mb-1">Authoritative Documentation Audit:</span>
                  {authProbe.authSchemeNote}
                </div>
              )}

              {/* Redacted Credentials Verification */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded space-y-2">
                <div className="flex items-center gap-2 text-slate-300 font-semibold text-xs font-sans">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Configured Credentials Sanitization & Redaction Guard</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 mt-2">
                  <div>
                    <span className="text-slate-500 block">API Key ID:</span>
                    <span className="text-slate-200 font-mono">{authProbe?.credentials?.keyIdMasked || 'Configured & Redacted'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Account ID:</span>
                    <span className="text-slate-200 font-mono">{authProbe?.credentials?.accountIdMasked || 'Configured & Redacted'}</span>
                  </div>
                  <div className="col-span-2 flex items-center gap-1.5 text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Private Key: Securely stored in server memory (Never serialized or logged)</span>
                  </div>
                </div>
              </div>

              {/* Phase 19: Local Cryptographic Audit */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded space-y-2">
                <div className="flex items-center gap-2 text-slate-300 font-semibold text-xs font-sans">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                  <span>Phase 19: Local Ed25519 Cryptographic Audit</span>
                </div>
                
                {authProbe?.credentials?.localCryptographicVerification ? (
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Signing Status:</span>
                      <span className={authProbe.credentials.localCryptographicVerification.success ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {authProbe.credentials.localCryptographicVerification.success ? 'VERIFIED (Local)' : 'FAILED'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      {authProbe.credentials.localCryptographicVerification.message}
                    </p>
                    {authProbe.credentials.localCryptographicVerification.details && (
                      <div className="bg-slate-900/50 p-2 rounded text-[9px] font-mono text-slate-500 space-y-1 overflow-x-auto">
                        <div><span className="text-slate-600">Canonical:</span> {authProbe.credentials.localCryptographicVerification.details.signingCanonical}</div>
                        <div><span className="text-slate-600">Timestamp:</span> {authProbe.credentials.localCryptographicVerification.details.timestamp}</div>
                        <div><span className="text-slate-600">Signature:</span> {authProbe.credentials.localCryptographicVerification.details.signatureHex}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-500 mt-1 italic">
                    Local verification data unavailable.
                  </div>
                )}
              </div>

              {/* Status Message */}
              {authProbe?.message && (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded text-slate-300 text-[11px] leading-relaxed">
                  <span className="text-slate-500 font-sans block mb-1">Diagnostic Message:</span>
                  {authProbe.message}
                </div>
              )}

              {/* Raw Response Sample */}
              {authProbe?.rawSample && (
                <div>
                  <span className="text-slate-400 font-sans font-semibold block mb-1">
                    Raw Upstream Sample (Sanitized & Redacted)
                  </span>
                  <pre className="p-3 bg-slate-950 border border-slate-800 rounded text-slate-300 text-[11px] overflow-x-auto whitespace-pre-wrap break-all">
                    {authProbe.rawSample}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/60">
          <span className="text-xs text-slate-500 font-sans">
            Safety Invariant: Pure authentic data only
          </span>
          <div className="flex items-center gap-2">
            {activeView === 'standard' ? (
              <button
                onClick={onRunTest}
                disabled={isTesting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>{isTesting ? 'Probing...' : 'Re-run Health Probe'}</span>
              </button>
            ) : (
              <button
                onClick={handleRunAuthProbe}
                disabled={isAuthTesting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isAuthTesting ? 'animate-spin' : ''}`} />
                <span>{isAuthTesting ? 'Probing...' : 'Run Authenticated Probe'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
