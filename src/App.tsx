/**
 * POLYESTER TITAN AI - Premium Dark Trading Terminal & Integration Bridge
 * Connects to Polyester Testnet with real health diagnostics, risk telemetry, and Python FastAPI companion.
 */

import React, { useState, useEffect } from 'react';
import { TabType, HealthCheckResult, AppHealthResult, SystemRuntimeInfo, RiskSettings } from './types.js';
import { TopNav } from './components/TopNav.js';
import { OverviewTab } from './components/OverviewTab.js';
import { MarketsTab } from './components/MarketsTab.js';
import { OrdersTab } from './components/OrdersTab.js';
import { RiskControlsTab } from './components/RiskControlsTab.js';
import { AgentStrategyTab } from './components/AgentStrategyTab.js';
import { PaperTradingTab } from './components/PaperTradingTab.js';
import { SystemLogsTab } from './components/SystemLogsTab.js';
import { HealthProbeModal } from './components/HealthProbeModal.js';
import { SecretsGuideModal } from './components/SecretsGuideModal.js';
import { ApiCredentialModal } from './components/ApiCredentialModal.js';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [appHealth, setAppHealth] = useState<AppHealthResult | null>(null);
  const [runtime, setRuntime] = useState<SystemRuntimeInfo | null>(null);
  const [risk, setRisk] = useState<RiskSettings | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isDiagnosticModalOpen, setIsDiagnosticModalOpen] = useState(false);
  const [isSecretsGuideOpen, setIsSecretsGuideOpen] = useState(false);
  const [isApiCredentialModalOpen, setIsApiCredentialModalOpen] = useState(false);

  // Initial data load
  const loadInitialData = async () => {
    try {
      const [healthRes, riskRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/risk-controls'),
      ]);

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setHealth(healthData.upstreamHealth || healthData.health);
        setAppHealth(healthData.appHealth || null);
        setRuntime(healthData.runtime);
      }

      if (riskRes.ok) {
        const riskData = await riskRes.json();
        setRisk(riskData);
      }
    } catch (err) {
      console.error('Failed to load initial terminal state:', err);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // On-demand connection test
  const handleRunHealthTest = async () => {
    setIsTestingConnection(true);
    try {
      const res = await fetch('/api/health/test', { method: 'POST' });
      if (res.ok) {
        const result: HealthCheckResult = await res.json();
        setHealth(result);
      }
    } catch (err) {
      console.error('Connection test error:', err);
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Update risk parameters
  const handleUpdateRisk = async (updated: Partial<RiskSettings>) => {
    try {
      const res = await fetch('/api/risk-controls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        const data = await res.json();
        setRisk(data.settings);
      }
    } catch (err) {
      console.warn('Failed to update risk controls:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-slate-800 selection:text-white">
      {/* Top Bar following Top Bar Contract */}
      <TopNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        health={health}
        isTestingConnection={isTestingConnection}
        onRunTest={handleRunHealthTest}
        onOpenSecretsGuide={() => setIsSecretsGuideOpen(true)}
        onOpenApiCredentialModal={() => setIsApiCredentialModalOpen(true)}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'overview' && (
          <OverviewTab
            appHealth={appHealth}
            health={health}
            runtime={runtime}
            risk={risk}
            isTestingConnection={isTestingConnection}
            onRunTest={handleRunHealthTest}
            onOpenDiagnosticModal={() => setIsDiagnosticModalOpen(true)}
            onOpenSecretsGuide={() => setIsSecretsGuideOpen(true)}
          />
        )}

        {activeTab === 'markets' && (
          <MarketsTab
            health={health}
            onRunTest={handleRunHealthTest}
            isTestingConnection={isTestingConnection}
          />
        )}

        {activeTab === 'orders' && <OrdersTab />}

        {activeTab === 'risk' && (
          <RiskControlsTab risk={risk} onUpdateRisk={handleUpdateRisk} />
        )}
        {activeTab === 'strategy' && <AgentStrategyTab />}

        {activeTab === 'paper-trading' && <PaperTradingTab />}

        {activeTab === 'logs' && <SystemLogsTab />}
      </main>

      {/* Terminal Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">POLYESTER TITAN AI</span>
            <span>·</span>
            <span>Testnet Trading Terminal</span>
            <span>·</span>
            <span className="font-mono tabular-nums">Phase 1 Integration</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsDiagnosticModalOpen(true)}
              className="hover:text-slate-300 transition-colors"
            >
              Health Diagnostics
            </button>
            <button
              onClick={() => setIsSecretsGuideOpen(true)}
              className="hover:text-slate-300 transition-colors"
            >
              Secrets Configuration
            </button>
            <span className="font-mono tabular-nums text-slate-600">v1.0.0-phase1</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <HealthProbeModal
        isOpen={isDiagnosticModalOpen}
        onClose={() => setIsDiagnosticModalOpen(false)}
        health={health}
        isTesting={isTestingConnection}
        onRunTest={handleRunHealthTest}
      />

      <SecretsGuideModal
        isOpen={isSecretsGuideOpen}
        onClose={() => setIsSecretsGuideOpen(false)}
      />

      <ApiCredentialModal
        isOpen={isApiCredentialModalOpen}
        onClose={() => setIsApiCredentialModalOpen(false)}
      />
    </div>
  );
}
