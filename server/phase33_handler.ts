/**
 * Phase 33: Live-Trading Gate Verification Handler
 * Provides a dedicated handler to execute and query Phase 33 gate verification.
 */

import { runPhase33GateVerification, Phase33GateReport } from './scripts/phase33_gate_verification.js';
import fs from 'fs';
import path from 'path';

export async function getPhase33GateReport(): Promise<Phase33GateReport> {
  const reportPath = path.join(process.cwd(), 'server', 'data', 'phase33_gate_report.json');
  if (fs.existsSync(reportPath)) {
    try {
      const raw = fs.readFileSync(reportPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      // Fallback to live run
    }
  }
  const report = await runPhase33GateVerification();
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  } catch {
    // Non-fatal if filesystem write fails
  }
  return report;
}

export async function executePhase33GateVerification(): Promise<Phase33GateReport> {
  const report = await runPhase33GateVerification();
  const reportPath = path.join(process.cwd(), 'server', 'data', 'phase33_gate_report.json');
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  } catch {
    // Non-fatal
  }
  return report;
}
