/**
 * Structured In-Memory Ring Buffer Logger
 * Safe logging system that redacts all credentials and provides audit history to the terminal.
 */

import { sanitizeLog } from './config.js';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  category: 'system' | 'api' | 'auth' | 'risk' | 'fastapi';
  message: string;
  details?: Record<string, unknown> | null;
}

const MAX_LOGS = 150;
const logsRingBuffer: LogEntry[] = [];
let logCounter = 0;

export function addLog(
  level: 'info' | 'warn' | 'error',
  category: 'system' | 'api' | 'auth' | 'risk' | 'fastapi',
  message: string,
  rawDetails?: Record<string, unknown>
): LogEntry {
  logCounter += 1;
  const id = `log_${Date.now()}_${logCounter}`;
  const timestamp = new Date().toISOString();

  let sanitizedDetails: Record<string, unknown> | null = null;
  if (rawDetails) {
    try {
      sanitizedDetails = JSON.parse(sanitizeLog(rawDetails));
    } catch {
      sanitizedDetails = { error: 'Failed to serialize log details' };
    }
  }

  const safeMessage = sanitizeLog(message);
  const entry: LogEntry = {
    id,
    timestamp,
    level,
    category,
    message: safeMessage,
    details: sanitizedDetails,
  };

  logsRingBuffer.push(entry);
  if (logsRingBuffer.length > MAX_LOGS) {
    logsRingBuffer.shift();
  }

  // Also print to server stdout for standard node logging (safe)
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${category}]`;
  if (level === 'error') {
    console.error(`${prefix} ${safeMessage}`, sanitizedDetails ? sanitizedDetails : '');
  } else if (level === 'warn') {
    console.warn(`${prefix} ${safeMessage}`, sanitizedDetails ? sanitizedDetails : '');
  } else {
    console.log(`${prefix} ${safeMessage}`, sanitizedDetails ? sanitizedDetails : '');
  }

  return entry;
}

export function getLogs(limit = 100, level?: string): LogEntry[] {
  let filtered = [...logsRingBuffer].reverse();
  if (level && level !== 'all') {
    filtered = filtered.filter((log) => log.level === level);
  }
  return filtered.slice(0, limit);
}
