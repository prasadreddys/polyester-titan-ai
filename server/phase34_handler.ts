/**
 * Phase 34: Performance & Endpoint Verification Handler
 */

import { runPhase34PerformanceVerification, Phase34AuditReport } from './scripts/phase34_performance_verification.js';
import fs from 'fs';
import path from 'path';

export async function getPhase34AuditReport(): Promise<Phase34AuditReport> {
  const reportPath = path.join(process.cwd(), 'server', 'data', 'phase34_audit_report.json');
  if (fs.existsSync(reportPath)) {
    try {
      const raw = fs.readFileSync(reportPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      // Fallback
    }
  }
  const report = await runPhase34PerformanceVerification();
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  } catch {
    // Non-fatal
  }
  return report;
}

export async function executePhase34PerformanceVerification(): Promise<Phase34AuditReport> {
  const report = await runPhase34PerformanceVerification();
  const reportPath = path.join(process.cwd(), 'server', 'data', 'phase34_audit_report.json');
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  } catch {
    // Non-fatal
  }
  return report;
}
