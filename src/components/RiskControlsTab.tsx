import React, { useState } from 'react';
import { RiskSettings } from '../types.js';
import { ShieldAlert, Save, AlertTriangle, CheckCircle2, Power } from 'lucide-react';

interface RiskControlsTabProps {
  risk: RiskSettings | null;
  onUpdateRisk: (updated: Partial<RiskSettings>) => Promise<void>;
}

export const RiskControlsTab: React.FC<RiskControlsTabProps> = ({ risk, onUpdateRisk }) => {
  const [positionSize, setPositionSize] = useState<number>(risk?.maxPositionSizeUsd ?? 1000);
  const [drawdown, setDrawdown] = useState<number>(risk?.maxDrawdownPercent ?? 5.0);
  const [slippage, setSlippage] = useState<number>(risk?.slippageTolerancePercent ?? 0.5);
  const [stopLoss, setStopLoss] = useState<number>(risk?.stopLossPercent ?? 2.0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onUpdateRisk({
        maxPositionSizeUsd: positionSize,
        maxDrawdownPercent: drawdown,
        slippageTolerancePercent: slippage,
        stopLossPercent: stopLoss,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.warn('Error saving risk settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleKillSwitch = async () => {
    setIsSaving(true);
    try {
      await onUpdateRisk({
        killSwitchActive: !risk?.killSwitchActive,
      });
    } catch (err) {
      console.warn('Error toggling kill switch:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-emerald-400" />
            <span>Risk Management & Execution Safeguards</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Strict risk boundaries applied to any future order execution and strategy automation
          </p>
        </div>

        <button
          onClick={toggleKillSwitch}
          disabled={isSaving}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded border transition-colors ${
            risk?.killSwitchActive
              ? 'bg-rose-900/60 border-rose-700 text-rose-200 hover:bg-rose-800'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-rose-400 hover:border-rose-800'
          }`}
        >
          <Power className="w-3.5 h-3.5" />
          <span>
            {risk?.killSwitchActive ? 'KILL SWITCH ENGAGED' : 'Engage Emergency Kill Switch'}
          </span>
        </button>
      </div>

      {/* Kill Switch Alert if active */}
      {risk?.killSwitchActive && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-lg flex items-start gap-3 text-rose-200 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-rose-300">Emergency Circuit Breaker is Active</div>
            <p className="mt-0.5 text-rose-300/80">
              All trading activity is completely halted. No strategy routines or orders will be processed by either the Node.js bridge or companion Python service.
            </p>
          </div>
        </div>
      )}

      {/* Risk Parameters Form */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-6 max-w-3xl">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-slate-300">
                Max Position Size (USD)
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5">Maximum notional value per trade</p>
              <div className="mt-2 relative">
                <input
                  type="number"
                  min="1"
                  max="100000"
                  step="10"
                  value={positionSize}
                  onChange={(e) => setPositionSize(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-xs font-mono tabular-nums text-slate-200 focus:outline-none focus:border-sky-500"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-500 font-mono">USD</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">
                Max Portfolio Drawdown (%)
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5">Triggers auto-halt if portfolio drops</p>
              <div className="mt-2 relative">
                <input
                  type="number"
                  min="0.5"
                  max="50"
                  step="0.5"
                  value={drawdown}
                  onChange={(e) => setDrawdown(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-xs font-mono tabular-nums text-slate-200 focus:outline-none focus:border-sky-500"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-500 font-mono">%</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">
                Slippage Tolerance (%)
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5">Max allowed price difference from quote</p>
              <div className="mt-2 relative">
                <input
                  type="number"
                  min="0.1"
                  max="5"
                  step="0.1"
                  value={slippage}
                  onChange={(e) => setSlippage(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-xs font-mono tabular-nums text-slate-200 focus:outline-none focus:border-sky-500"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-500 font-mono">%</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">
                Stop-Loss Threshold (%)
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5">Auto-exit threshold for open positions</p>
              <div className="mt-2 relative">
                <input
                  type="number"
                  min="0.5"
                  max="20"
                  step="0.5"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-xs font-mono tabular-nums text-slate-200 focus:outline-none focus:border-sky-500"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-500 font-mono">%</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              Last Updated: {risk?.updatedAt ? new Date(risk.updatedAt).toLocaleTimeString() : 'Default'}
            </span>

            <div className="flex items-center gap-3">
              {saveSuccess && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Risk parameters saved</span>
                </div>
              )}
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Parameters'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
