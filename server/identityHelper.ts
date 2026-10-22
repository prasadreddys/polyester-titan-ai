/**
 * POLYESTER TITAN AI - Authenticated Identity Helper
 * Performs a strictly read-only identity verification using the official Polyester SDK.
 */

import { evmHexToBytes, PolyesterClient, POLYESTER_TESTNET_ENVIRONMENT } from '@polyester/sdk';
import { getPolyesterCredentials, sanitizeLog } from './config.js';
import { addLog } from './logger.js';

/**
 * Result of the identity check.
 * Redacts sensitive fields for safe logging.
 */
export interface IdentityCheckResult {
  success: boolean;
  accountId?: string;
  username?: string;
  error?: string;
  failureType?: 'MISSING_CONFIG' | 'MALFORMED_KEY' | 'SDK_INIT_ERROR' | 'UPSTREAM_AUTH_FAILURE';
  timestamp: string;
  redactedDetails: string;
}

/**
 * Performs an authenticated 'me' request using the official SDK.
 * This is a read-only operation that verifies API credentials.
 */
export async function performIdentityCheck(): Promise<IdentityCheckResult> {
  const creds = getPolyesterCredentials();
  const timestamp = new Date().toISOString();

  // 1. Missing Config
  if (!creds.apiKeyId || !creds.apiSecretHex) {
    return {
      success: false,
      failureType: 'MISSING_CONFIG',
      error: 'Missing API Key ID or Secret Key in environment.',
      timestamp,
      redactedDetails: 'Check POLYESTER_API_KEY_ID and POLYESTER_API_SECRET_HEX.',
    };
  }

  // 2. Malformed Local Key
  let secretBytes: Uint8Array;
  try {
    const hex = creds.apiSecretHex.replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error('Secret key must be a 64-character hex string (32 bytes).');
    }
    secretBytes = evmHexToBytes(`0x${hex}`);
  } catch (err: any) {
    return {
      success: false,
      failureType: 'MALFORMED_KEY',
      error: `Malformed local key: ${err.message}`,
      timestamp,
      redactedDetails: 'The provided secret hex string is invalid or not the correct length for Ed25519.',
    };
  }

  // 3. SDK Initialization
  let client: PolyesterClient;
  try {
    client = new PolyesterClient({
      environment: POLYESTER_TESTNET_ENVIRONMENT,
      auth: {
        kind: 'api-key-ed25519',
        getKeyId: () => creds.apiKeyId!,
        getSecretKey: () => secretBytes,
      },
    });
  } catch (err: any) {
    return {
      success: false,
      failureType: 'SDK_INIT_ERROR',
      error: `SDK Initialization Error: ${err.message}`,
      timestamp,
      redactedDetails: 'Failed to initialize the Polyester SDK client.',
    };
  }

  // 4. Upstream Auth Failure
  try {
    // Strictly read-only call to get authenticated user context
    const identity = await client.auth.me();
    
    addLog('info', 'auth', 'Identity check succeeded via official SDK');

    return {
      success: true,
      accountId: identity.accountId,
      username: identity.username,
      timestamp,
      redactedDetails: 'Verified successfully via Polyester Testnet.',
    };
  } catch (err: any) {
    const errorMessage = err.message || String(err);
    addLog('error', 'auth', `Identity check failed: ${sanitizeLog(errorMessage)}`);
    
    return {
      success: false,
      failureType: 'UPSTREAM_AUTH_FAILURE',
      error: sanitizeLog(errorMessage),
      timestamp,
      redactedDetails: 'Verification failed at the upstream API. Ensure your credentials are active and registered.',
    };
  }
}
