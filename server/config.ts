/**
 * Server Configuration & Safe Environment Manager
 * Reads server-side environment variables without exposing secrets to the frontend.
 */

import dotenv from 'dotenv';
dotenv.config();

export interface ServerConfig {
  port: number;
  polyesterApiHost: string;
  polyesterTestnetHost: string;
  polyesterMainnetHost: string;
  allowedTestnetHosts: string[];
  allowedMainnetHosts: string[];
  hasApiKeyId: boolean;
  hasApiPrivateKey: boolean;
  hasApiSecretHex: boolean;
  hasAccountId: boolean;
  fastapiBackendUrl: string | null;
  nodeEnv: string;
  botAutoTradeEnabled: boolean; // Must be false in Phase 32
  botDryRun: boolean;          // Must be true in Phase 32
  requestTimeoutMs: number;
  maxRetries: number;
}

export const ALLOWED_TESTNET_HOSTS = [
  'testnet-api.polyester.exchange',
  'api.testnet.polyester.com',
  'testnet.polyester.com',
  'localhost',
  '127.0.0.1',
];

export const ALLOWED_MAINNET_HOSTS = [
  'api.polyester.exchange',
];

/**
 * Checks if a given host URL or hostname is a mainnet host.
 */
export function isMainnetHost(hostInput?: string | null): boolean {
  if (!hostInput) return false;
  try {
    const url = new URL(hostInput.includes('://') ? hostInput : `https://${hostInput}`);
    return ALLOWED_MAINNET_HOSTS.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Validates a target host against official allowlists and environment mode.
 */
export function validateHostAllowlist(hostInput: string, isMainnetRequested: boolean = false): { allowed: boolean; reason?: string } {
  if (!hostInput || !hostInput.trim()) {
    return { allowed: false, reason: 'Target host string is empty.' };
  }
  let url: URL;
  try {
    url = new URL(hostInput);
  } catch {
    return { allowed: false, reason: 'Target host must be an absolute URL.' };
  }

  const cleanHost = url.hostname.toLowerCase();
  const localTestHost = cleanHost === 'localhost' || cleanHost === '127.0.0.1';
  const secureOrigin = url.protocol === 'https:' || (localTestHost && url.protocol === 'http:');
  if (
    !secureOrigin ||
    url.username ||
    url.password ||
    url.port ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    return { allowed: false, reason: 'Target host URL contains an unsupported protocol or URL component.' };
  }

  if (isMainnetRequested) {
    if (ALLOWED_MAINNET_HOSTS.includes(cleanHost)) {
      return { allowed: true };
    }
    return { allowed: false, reason: `Host '${cleanHost}' is not in official Mainnet allowlist: [${ALLOWED_MAINNET_HOSTS.join(', ')}]` };
  }

  if (ALLOWED_TESTNET_HOSTS.includes(cleanHost)) {
    return { allowed: true };
  }
  return { allowed: false, reason: `Host '${cleanHost}' is not in official Testnet allowlist: [${ALLOWED_TESTNET_HOSTS.join(', ')}]` };
}

/**
 * Validates and sanitizes the Polyester API host.
 * Strictly enforces Testnet and rejects any unallowlisted production host.
 */
import { POLYESTER_TESTNET_ENVIRONMENT } from '@polyester/sdk';

export const OFFICIAL_TESTNET_API_URL = POLYESTER_TESTNET_ENVIRONMENT.apiUrl; // 'https://api.testnet.polyester.com'

function configuredTestnetFallback(): string {
  const configuredHost = process.env.POLYESTER_TESTNET_HOST?.trim();
  if (configuredHost && validateHostAllowlist(configuredHost).allowed) {
    return configuredHost.replace(/\/+$/, '');
  }
  return OFFICIAL_TESTNET_API_URL;
}

export function sanitizeApiHost(rawHostInput?: string | null): string {
  const fallback = configuredTestnetFallback();
  if (!rawHostInput || !rawHostInput.trim()) {
    return fallback;
  }
  let host = rawHostInput.trim().replace(/\/+$/, '');

  // Normalize frontend web URL to official API hostname
  if (host === 'https://testnet.polyester.com' || host === 'http://testnet.polyester.com') {
    return fallback;
  }

  const validation = validateHostAllowlist(host);
  if (!validation.allowed) {
    console.warn(`[SECURITY] Unapproved Polyester API host rejected: ${validation.reason} Falling back to the official testnet API.`);
    return fallback;
  }

  return host;
}

const rawHost = process.env.POLYESTER_API_HOST;
const validatedHost = sanitizeApiHost(rawHost);

const testnetHost = sanitizeApiHost(process.env.POLYESTER_TESTNET_HOST);
const configuredMainnetHost = process.env.POLYESTER_MAINNET_HOST?.trim() || 'https://api.polyester.exchange';
const mainnetHost = validateHostAllowlist(configuredMainnetHost, true).allowed
  ? configuredMainnetHost.replace(/\/+$/, '')
  : 'https://api.polyester.exchange';


const timeoutParsed = parseInt(process.env.POLYESTER_REQUEST_TIMEOUT_MS || '7000', 10);
const requestTimeoutMs = isNaN(timeoutParsed) || timeoutParsed < 1000 ? 7000 : Math.min(timeoutParsed, 30000);

const retriesParsed = parseInt(process.env.POLYESTER_MAX_RETRIES || '2', 10);
const maxRetries = isNaN(retriesParsed) || retriesParsed < 0 ? 2 : Math.min(retriesParsed, 3);

export const config: ServerConfig = {
  port: Number(process.env.PORT) || 3000,
  polyesterApiHost: validatedHost,
  polyesterTestnetHost: testnetHost,
  polyesterMainnetHost: mainnetHost,
  allowedTestnetHosts: ALLOWED_TESTNET_HOSTS,
  allowedMainnetHosts: ALLOWED_MAINNET_HOSTS,
  hasApiKeyId: Boolean(process.env.POLYESTER_API_KEY_ID?.trim()),
  hasApiPrivateKey: Boolean(process.env.POLYESTER_API_PRIVATE_KEY?.trim()),
  hasApiSecretHex: Boolean(process.env.POLYESTER_API_SECRET_HEX?.trim() || process.env.POLYESTER_API_PRIVATE_KEY?.trim()),
  hasAccountId: Boolean(process.env.POLYESTER_ACCOUNT_ID?.trim()),
  fastapiBackendUrl: process.env.FASTAPI_BACKEND_URL?.trim() || null,
  nodeEnv: process.env.NODE_ENV || 'development',
  botAutoTradeEnabled: false, // Security constraint: strictly disabled in Phase 32
  botDryRun: true,            // Security constraint: strictly dry-run in Phase 32
  requestTimeoutMs,
  maxRetries,
};

// Safe credential accessors (server-side use only, never serialize directly to JSON response)
export const getPolyesterCredentials = () => {
  const apiKeyId = process.env.POLYESTER_API_KEY_ID?.trim() || null;
  const rawSecret = (process.env.POLYESTER_API_SECRET_HEX || process.env.POLYESTER_API_PRIVATE_KEY || '').trim();
  const apiSecretHex = rawSecret.startsWith('0x') ? rawSecret.slice(2) : rawSecret;
  const accountId = process.env.POLYESTER_ACCOUNT_ID?.trim() || null;

  return {
    apiKeyId,
    apiSecretHex: apiSecretHex || null,
    accountId,
  };
};

/**
 * Sanitizes any log object or string by masking API keys, private keys, and tokens.
 */
export function sanitizeLog(data: unknown): string {
  if (typeof data === 'string') {
    return data
      .replace(/(?:0x)?[a-fA-F0-9]{64}/g, '***REDACTED_KEY***')
      .replace(/(?:api_?key_?(?:id)?|private_?key|secret|token|authorization)[":=\s]+([a-zA-Z0-9_\-\.\/]{8,})/gi, '***REDACTED***');
  }
  try {
    const serialized = JSON.stringify(data, (key, value) => {
      const lower = key.toLowerCase();
      if (lower.includes('key') || lower.includes('secret') || lower.includes('auth') || lower.includes('private')) {
        return '***REDACTED***';
      }
      return value;
    });
    return serialized;
  } catch {
    return '[Unserializable Data]';
  }
}
