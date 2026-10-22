import React from 'react';
import { TabType, HealthCheckResult } from '../types.js';
import { RefreshCw, ShieldAlert, WifiOff, CheckCircle2 } from 'lucide-react';

interface TopNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  health: HealthCheckResult | null;
  isTestingConnection: boolean;
  onRunTest: () => void;
  onOpenSecretsGuide: () => void;
  onOpenApiCredentialModal: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  onTabChange,
  health,
  isTestingConnection,
  onRunTest,
  onOpenSecretsGuide,
  onOpenApiCredentialModal,
}) => {
  const getStatusDisplay = () => {
    if (!health) {
      return {
        label: 'Disconnected',
        color: 'text-rose-400',
        bg: 'bg-rose-950/40 border-rose-800/50',
        icon: <WifiOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
      };
    }
    if (health.status === 'connected') {
      return {
        label: 'Connected (Testnet)',
        color: 'text-emerald-400',
        bg: 'bg-emerald-950/40 border-emerald-800/50',
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
      };
    }
    if (health.status === 'blocked' || health.isCloudflareBlocked) {
      return {
        label: 'Gateway Blocked (CF 403)',
        color: 'text-amber-400',
        bg: 'bg-amber-950/40 border-amber-800/50',
        icon: <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
      };
    }
    if (health.status === 'rate_limited' || health.isRateLimited) {
      return {
        label: 'Rate Limited (429)',
        color: 'text-amber-400',
        bg: 'bg-amber-950/40 border-amber-800/50',
        icon: <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
      };
    }
    return {
      label: 'Disconnected',
      color: 'text-rose-400',
      bg: 'bg-rose-950/40 border-rose-800/50',
      icon: <WifiOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
    };
  };

  const status = getStatusDisplay();

  const navItems: { id: TabType; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'markets', label: 'Markets' },
    { id: 'orders', label: 'Orders' },
    { id: 'risk', label: 'Risk Controls' },
    { id: 'strategy', label: 'Agent Strategy' },
    { id: 'paper-trading', label: 'Paper Trading' },
    { id: 'logs', label: 'System Logs' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onTabChange('overview')}
            className="text-left font-bold tracking-tight text-slate-100 hover:text-white transition-colors whitespace-nowrap text-base"
          >
            POLYESTER TITAN AI
          </button>
        </div>

        {/* Zone 2: Navigation links */}
        <nav className="hidden md:flex items-center gap-1 overflow-x-auto py-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-slate-800 text-slate-100 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Connection status & Primary test action */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono tabular-nums rounded border ${status.bg} ${status.color}`}
            title={`Checked: ${health?.checkedAt || 'Pending'}`}
          >
            {status.icon}
            <span>{status.label}</span>
          </div>

          <button
            onClick={onOpenSecretsGuide}
            className="hidden lg:inline-flex text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-900 transition-colors whitespace-nowrap"
          >
            Secrets Config
          </button>

          <button
            onClick={onOpenApiCredentialModal}
            className="hidden lg:inline-flex text-xs text-amber-400 hover:text-amber-300 px-2.5 py-1 rounded bg-amber-950/40 border border-amber-800/50 transition-colors whitespace-nowrap"
          >
            Test API Key
          </button>

          <button
            onClick={onRunTest}
            disabled={isTestingConnection}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700/80 rounded transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTestingConnection ? 'animate-spin' : ''}`} />
            <span>{isTestingConnection ? 'Probing...' : 'Test Connection'}</span>
          </button>
        </div>
      </div>

      {/* Mobile navigation row */}
      <div className="md:hidden border-t border-slate-800/60 px-4 py-1.5 flex items-center gap-1 overflow-x-auto bg-slate-950">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
                isActive ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </header>
  );
};
