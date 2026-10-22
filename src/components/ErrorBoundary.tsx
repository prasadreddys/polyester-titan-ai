import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

/**
 * Redacts any potential API keys, private keys, or credentials from error traces.
 */
function sanitizeTrace(input: string): string {
  if (!input) return '';
  return input
    .replace(/(?:api_?key|private_?key|secret|token|authorization)[":=\s]+([a-zA-Z0-9_\-\.\/]{8,})/gi, '***REDACTED***')
    .replace(/(?:0x)?[a-fA-F0-9]{64}/g, '***REDACTED_KEY***');
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    retryCount: 0,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const safeMessage = sanitizeTrace(error?.message || 'Unknown error');
    const safeStack = sanitizeTrace(error?.stack || '');
    const safeComponentStack = sanitizeTrace(errorInfo?.componentStack || '');

    // Log safe diagnostic details without leaking credentials
    console.error('[POLYESTER TITAN AI] UI Boundary Caught Error:', {
      name: error?.name,
      message: safeMessage,
      stack: safeStack,
      componentStack: safeComponentStack,
      timestamp: new Date().toISOString(),
    });

    this.setState({ errorInfo });
  }

  // Recovery Action 1: Reset view state without full page reload
  public handleSoftReset = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  // Recovery Action 2: Clean reload with loop protection
  public handleHardReload = () => {
    try {
      sessionStorage.removeItem('polyester_active_tab');
    } catch (_) {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const isLooping = this.state.retryCount >= 2;
      const safeDisplayMessage = sanitizeTrace(
        this.state.error?.message || 'An unexpected rendering error occurred in the terminal.'
      );

      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 selection:bg-slate-800">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Terminal Interface Error</h2>
                <p className="text-xs text-slate-400">
                  {isLooping
                    ? 'Repeated recovery failures detected. Use safe reload below.'
                    : 'The interface encountered an unexpected component error.'}
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded font-mono text-xs space-y-1">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider block">
                Diagnostic Details (Sanitized)
              </span>
              <p className="text-slate-300 break-words leading-relaxed">{safeDisplayMessage}</p>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Safe mode active. No credentials or keys are exposed in this error state.</span>
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                Retries: {this.state.retryCount}
              </span>

              <div className="flex items-center gap-2">
                {!isLooping && (
                  <button
                    onClick={this.handleSoftReset}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Try View Again</span>
                  </button>
                )}
                <button
                  onClick={this.handleHardReload}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-rose-950 hover:bg-rose-900 border border-rose-800 rounded transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reload Terminal</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
