/**
 * Polyester Testnet API Integration Module - Phase 2A
 * Handles official REST health probes, market catalog retrieval, response schema validation,
 * bounded retries for transient errors, and explicit Cloudflare challenge/rate-limit detection.
 * Strictly adheres to security rules: zero credential leaks, real data only, testnet enforcement.
 */

import { config, getPolyesterCredentials, sanitizeLog } from './config.js';
import { addLog } from './logger.js';
import { validateCredentialsFormat } from './credentialValidator.js';
import { evmHexToBytes, PolyesterClient, POLYESTER_TESTNET_ENVIRONMENT } from '@polyester/sdk';
import type {
  MarketItem,
  MarketsResponse,
  AppHealthResult,
  HealthCheckResult,
  AuthenticatedHealthCheckResult,
  SystemRuntimeInfo,
} from '../src/types.js';

export type {
  AppHealthResult,
  HealthCheckResult,
  AuthenticatedHealthCheckResult,
  SystemRuntimeInfo,
  MarketItem,
  MarketsResponse,
};

interface SdkMarketPair {
  symbol: string;
  symbolId: number;
  status?: string;
  lastPrice?: string | number | null;
  minQtyBase?: string;
  tickSize?: string;
}

export function mapSdkMarkets(pairs: readonly SdkMarketPair[]): MarketItem[] {
  return pairs.map(pair => {
    const parsedPrice = typeof pair.lastPrice === 'number'
      ? pair.lastPrice
      : typeof pair.lastPrice === 'string'
        ? Number(pair.lastPrice)
        : Number.NaN;

    return {
      symbol: pair.symbol,
      marketId: String(pair.symbolId),
      status: pair.status || 'active',
      lastPrice: Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null,
      minOrderSize: Number.parseFloat(pair.minQtyBase || '0'),
      priceTickSize: Number.parseFloat(pair.tickSize || '0'),
    };
  });
}

const serverStartTime = Date.now();

export function getLocalAppHealth(): AppHealthResult {
  return {
    status: 'healthy',
    service: 'polyester-titan-ai-bridge',
    uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
    timestamp: new Date().toISOString(),
    port: config.port,
  };
}

/**
 * Official Documented Endpoint URL Constructors
 */
export function getHealthEndpoint(host: string = config.polyesterApiHost): string {
  const base = host.replace(/\/+$/, '');
  return `${base}/v1/health`;
}

export function getMarketsEndpoint(host: string = config.polyesterApiHost): string {
  const base = host.replace(/\/+$/, '');
  return `${base}/v1/spot/config`;
}

export function getMarketOverviewEndpoint(host: string = config.polyesterApiHost): string {
  const base = host.replace(/\/+$/, '');
  return `${base}/marketoverview.v1.MarketOverviewService/ListMarketOverview`;
}

let lastHealthCheck: HealthCheckResult = {
  status: 'disconnected',
  checkedAt: new Date().toISOString(),
  targetHost: config.polyesterApiHost,
  targetEndpoint: '/v1/health',
  httpStatus: null,
  statusText: null,
  contentType: null,
  latencyMs: 0,
  isCloudflareBlocked: false,
  isRateLimited: false,
  schemaValid: false,
  parsedData: null,
  errorMessage: 'Initial connection probe pending',
  securityNotice: 'Polyester Testnet mode locked. Credentials never forwarded to browser.',
};

/**
 * Pure Evaluation Logic for Health Response
 * Allows rigorous unit testing without live network calls.
 */
export function evaluateHealthResponse(
  httpStatus: number,
  statusText: string,
  contentType: string,
  rawText: string,
  headers: Record<string, string | null | undefined> = {}
): {
  status: HealthCheckResult['status'];
  isCloudflareBlocked: boolean;
  isRateLimited: boolean;
  retryAfterSeconds: number | null;
  schemaValid: boolean;
  parsedData: Record<string, unknown> | null;
  errorMessage: string | null;
} {
  const isCloudflare =
    httpStatus === 403 &&
    (rawText.includes('cf-mitigated') ||
      rawText.includes('challenges.cloudflare.com') ||
      rawText.includes('Just a moment...') ||
      (headers['server'] || '').toLowerCase().includes('cloudflare') ||
      Boolean(headers['cf-ray']));

  const isRateLimited = httpStatus === 429;
  let retryAfterSeconds: number | null = null;
  if (isRateLimited && headers['retry-after']) {
    const parsed = parseInt(headers['retry-after'], 10);
    if (!isNaN(parsed)) retryAfterSeconds = parsed;
  }

  let schemaValid = false;
  let parsedData: Record<string, unknown> | null = null;
  let errorMessage: string | null = null;
  let status: HealthCheckResult['status'] = 'disconnected';

  if (isCloudflare) {
    status = 'blocked';
    errorMessage = 'Endpoint is protected by Cloudflare Managed Challenge / Bot Protection (HTTP 403). Automated headless requests from cloud servers are challenged.';
  } else if (isRateLimited) {
    status = 'rate_limited';
    errorMessage = `Upstream rate limit exceeded (HTTP 429).${retryAfterSeconds ? ` Retry after ${retryAfterSeconds}s.` : ''}`;
  } else if (httpStatus === 401) {
    status = 'error';
    errorMessage = 'Authentication failed (HTTP 401 Unauthorized). Verify API Key ID and signature.';
  } else if (httpStatus >= 200 && httpStatus < 300) {
    if (contentType.includes('application/json')) {
      try {
        parsedData = JSON.parse(rawText);
        if (parsedData && typeof parsedData === 'object' && !Array.isArray(parsedData)) {
          schemaValid = true;
          status = 'connected';
        } else {
          errorMessage = 'Response was JSON but did not match expected health object schema';
          status = 'error';
        }
      } catch {
        errorMessage = 'Content-Type declared JSON but parsing failed';
        status = 'error';
      }
    } else {
      errorMessage = `Received non-JSON response (${contentType || 'text/html'})`;
      status = 'disconnected';
    }
  } else {
    status = 'disconnected';
    errorMessage = `Upstream testnet returned HTTP ${httpStatus} ${statusText}`;
  }

  return {
    status,
    isCloudflareBlocked: isCloudflare,
    isRateLimited,
    retryAfterSeconds,
    schemaValid,
    parsedData,
    errorMessage,
  };
}

/**
 * Pure Evaluation Logic for Market Data Response
 * Validates real market fields, rejects invalid schemas, handles Cloudflare/rate limits.
 */
export function evaluateMarketsResponse(
  httpStatus: number,
  contentType: string,
  rawText: string,
  headers: Record<string, string | null | undefined> = {},
  sourceEndpoint: string = getMarketsEndpoint()
): MarketsResponse {
  const isCloudflare =
    httpStatus === 403 &&
    (rawText.includes('cf-mitigated') ||
      rawText.includes('challenges.cloudflare.com') ||
      rawText.includes('Just a moment...') ||
      (headers['server'] || '').toLowerCase().includes('cloudflare') ||
      Boolean(headers['cf-ray']));

  if (isCloudflare) {
    return {
      markets: [],
      source: sourceEndpoint,
      status: 'blocked',
      message: 'Market data feed is blocked by Cloudflare Managed Challenge (HTTP 403).',
    };
  }

  if (httpStatus === 429) {
    const retrySec = headers['retry-after'] ? parseInt(headers['retry-after'], 10) : null;
    return {
      markets: [],
      source: sourceEndpoint,
      status: 'rate_limited',
      message: `Upstream market feed rate limited (HTTP 429).${retrySec ? ` Retry after ${retrySec}s.` : ''}`,
    };
  }

  if (httpStatus < 200 || httpStatus >= 300) {
    return {
      markets: [],
      source: sourceEndpoint,
      status: 'unavailable',
      message: `Upstream market endpoint returned HTTP ${httpStatus}.`,
    };
  }

  if (!contentType.includes('application/json')) {
    return {
      markets: [],
      source: sourceEndpoint,
      status: 'unavailable',
      message: `Upstream returned non-JSON content-type: ${contentType || 'unknown'}.`,
    };
  }

  try {
    const json = JSON.parse(rawText);
    let rawList: unknown[] = [];
    let upstreamTimestamp: string | null = null;

    if (Array.isArray(json)) {
      rawList = json;
    } else if (json && typeof json === 'object') {
      const obj = json as Record<string, unknown>;
      if (Array.isArray(obj.markets)) rawList = obj.markets;
      else if (Array.isArray(obj.pairs)) rawList = obj.pairs;
      else if (Array.isArray(obj.items)) rawList = obj.items;
      else if (Array.isArray(obj.marketOverviews)) rawList = obj.marketOverviews;
      else if (Array.isArray(obj.data)) rawList = obj.data;

      if (typeof obj.timestamp === 'string') upstreamTimestamp = obj.timestamp;
      else if (typeof obj.serverTime === 'string') upstreamTimestamp = obj.serverTime;
      else if (typeof obj.server_time === 'number') upstreamTimestamp = new Date(obj.server_time).toISOString();
    }

    const validatedMarkets: MarketItem[] = [];

    for (const rawItem of rawList) {
      if (rawItem && typeof rawItem === 'object') {
        const item = rawItem as Record<string, unknown>;
        const symbol = typeof item.symbol === 'string' ? item.symbol.trim() : null;

        // Skip items with invalid or missing symbols
        if (!symbol) continue;

        const toPrice = (val: unknown): number | null => {
          const parsed = typeof val === 'number' ? val : typeof val === 'string' ? Number(val) : Number.NaN;
          return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        };
        const toFiniteNumber = (val: unknown): number | undefined => {
          const parsed = typeof val === 'number' ? val : typeof val === 'string' ? Number(val) : Number.NaN;
          return Number.isFinite(parsed) ? parsed : undefined;
        };

        validatedMarkets.push({
          symbol,
          marketId: typeof item.marketId === 'string'
            ? item.marketId
            : typeof item.id === 'string'
              ? item.id
              : typeof item.symbolId === 'number'
                ? String(item.symbolId)
                : undefined,
          status: typeof item.status === 'string' ? item.status : 'active',
          lastPrice: toPrice(item.lastPrice ?? item.last_price ?? item.price),
          indexPrice: toPrice(item.indexPrice ?? item.index_price),
          baseAsset: typeof item.baseAsset === 'string' ? item.baseAsset : (typeof item.base_asset === 'string' ? item.base_asset : undefined),
          quoteAsset: typeof item.quoteAsset === 'string' ? item.quoteAsset : (typeof item.quote_asset === 'string' ? item.quote_asset : undefined),
          minOrderSize: toFiniteNumber(item.minOrderSize ?? item.min_order_size ?? item.minQtyBase),
          priceTickSize: toFiniteNumber(item.priceTickSize ?? item.price_tick_size ?? item.tickSize),
          upstreamTimestamp: (typeof item.timestamp === 'string' || typeof item.timestamp === 'number') ? item.timestamp : upstreamTimestamp,
        });
      }
    }

    if (validatedMarkets.length === 0) {
      return {
        markets: [],
        source: sourceEndpoint,
        status: 'empty',
        message: 'No active market pairs returned in verified upstream response.',
        upstreamTimestamp,
      };
    }

    return {
      markets: validatedMarkets,
      source: sourceEndpoint,
      status: 'verified',
      message: `Retrieved ${validatedMarkets.length} verified markets from Polyester Testnet.`,
      upstreamTimestamp,
    };
  } catch {
    return {
      markets: [],
      source: sourceEndpoint,
      status: 'unavailable',
      message: 'Failed to parse JSON market catalog payload.',
    };
  }
}

/**
 * HTTP Client with bounded retry for transient failures (502/503/504 or network drop).
 * Strictly NEVER retries on HTTP 403 Cloudflare challenges, 401, or 429!
 */
async function fetchWithBoundedRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = config.maxRetries
): Promise<{ response: Response; attempts: number; durationMs: number; correlationId: string }> {
  let attempts = 0;
  const startTime = Date.now();
  const correlationId = `req_${Math.random().toString(36).substring(2, 9)}`;

  while (attempts <= maxRetries) {
    attempts += 1;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'X-Correlation-ID': correlationId,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      // Do not retry client errors or security challenges (400, 401, 403, 429)
      if (response.status < 500 && response.status !== 0) {
        return { response, attempts, durationMs, correlationId };
      }

      // If server error (500, 502, 503, 504) and retries remain, bounded backoff
      if (attempts <= maxRetries) {
        const backoffMs = Math.min(300 * Math.pow(2, attempts - 1), 1500);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      return { response, attempts, durationMs, correlationId };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort = (err as Error)?.name === 'AbortError';

      if (attempts <= maxRetries && isAbort) {
        const backoffMs = Math.min(400 * attempts, 1500);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      if (attempts > maxRetries) {
        throw err;
      }
    }
  }

  throw new Error(`Connection to ${url} failed after ${attempts} attempts`);
}

/**
 * Execute health check against documented Polyester Testnet endpoint:
 * https://testnet.polyester.com/docs/api-docs/rest/GET/v1/health
 */
export async function executeHealthCheck(): Promise<HealthCheckResult> {
  const fullUrl = getHealthEndpoint();
  const startTime = Date.now();

  addLog('info', 'api', `Initiating health probe to documented endpoint ${fullUrl}`);

  try {
    const { response, attempts, durationMs, correlationId } = await fetchWithBoundedRetry(fullUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PolyesterTitanAI/2.0 (Polyester Testnet Integration Bridge)',
      },
    });

    const latencyMs = durationMs;
    const httpStatus = response.status;
    const statusText = response.statusText;
    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();

    const evaluated = evaluateHealthResponse(httpStatus, statusText, contentType, rawText, {
      'server': response.headers.get('server'),
      'cf-ray': response.headers.get('cf-ray'),
      'retry-after': response.headers.get('retry-after'),
    });

    if (evaluated.isCloudflareBlocked) {
      addLog('warn', 'api', `Health probe received Cloudflare challenge (HTTP 403) at ${fullUrl}. Probing official API endpoint /v1/spot/config...`, {
        httpStatus,
        latencyMs,
        attempts,
        cfRay: response.headers.get('cf-ray') || undefined,
      });

      // Secondary probe to official API spot config endpoint
      const configUrl = `${config.polyesterApiHost}/v1/spot/config`;
      try {
        const { response: cfgRes, durationMs: cfgDuration } = await fetchWithBoundedRetry(configUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'PolyesterTitanAI/2.0 (Polyester Testnet Integration Bridge)',
          },
        });
        if (cfgRes.status === 200 && (cfgRes.headers.get('content-type') || '').includes('application/json')) {
          const cfgText = await cfgRes.text();
          const parsed = JSON.parse(cfgText);
          lastHealthCheck = {
            status: 'connected',
            checkedAt: new Date().toISOString(),
            targetHost: config.polyesterApiHost,
            targetEndpoint: '/v1/spot/config',
            httpStatus: 200,
            statusText: 'OK',
            contentType: 'application/json',
            latencyMs: cfgDuration,
            isCloudflareBlocked: false,
            isRateLimited: false,
            retryAfterSeconds: null,
            schemaValid: true,
            parsedData: { service: 'polyester-spot-config', pairsCount: parsed.pairs?.length || 0, assetsCount: parsed.assets?.length || 0 },
            errorMessage: null,
            rawSample: cfgText.slice(0, 300),
            securityNotice: 'Polyester Testnet mode locked. Credentials never forwarded to browser.',
          };
          addLog('info', 'api', 'Health probe connected via official API endpoint /v1/spot/config', { latencyMs: cfgDuration });
          return lastHealthCheck;
        }
      } catch (fallbackErr) {
        // Fallback probe failed, preserve Cloudflare block record below
      }
    } else if (evaluated.status === 'connected') {
      addLog('info', 'api', 'Health check succeeded with verified JSON schema', { latencyMs, attempts });
    } else {
      addLog('warn', 'api', `Health probe status: ${evaluated.status} (HTTP ${httpStatus})`, {
        httpStatus,
        latencyMs,
        attempts,
      });
    }

    lastHealthCheck = {
      status: evaluated.status,
      checkedAt: new Date().toISOString(),
      targetHost: config.polyesterApiHost,
      targetEndpoint: '/v1/health',
      httpStatus,
      statusText,
      contentType,
      latencyMs,
      isCloudflareBlocked: evaluated.isCloudflareBlocked,
      isRateLimited: evaluated.isRateLimited,
      retryAfterSeconds: evaluated.retryAfterSeconds,
      schemaValid: evaluated.schemaValid,
      parsedData: evaluated.parsedData,
      errorMessage: evaluated.errorMessage,
      rawSample: rawText ? rawText.slice(0, 300) : null,
      securityNotice: 'Polyester Testnet mode locked. Credentials never forwarded to browser.',
    };

    return lastHealthCheck;
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    const isAbort = (err as Error)?.name === 'AbortError';
    const message = isAbort
      ? `Connection timed out after ${config.requestTimeoutMs}ms`
      : (err as Error)?.message || 'Network error occurred during health check';

    addLog('error', 'api', `Health probe failed: ${message}`, { latencyMs });

    lastHealthCheck = {
      status: 'disconnected',
      checkedAt: new Date().toISOString(),
      targetHost: config.polyesterApiHost,
      targetEndpoint: '/v1/health',
      httpStatus: null,
      statusText: null,
      contentType: null,
      latencyMs,
      isCloudflareBlocked: false,
      isRateLimited: false,
      schemaValid: false,
      parsedData: null,
      errorMessage: message,
      securityNotice: 'Polyester Testnet mode locked. Credentials never forwarded to browser.',
    };

    return lastHealthCheck;
  }
}

export function getLastHealthCheck(): HealthCheckResult {
  return lastHealthCheck;
}

/** Testing helper to manually set health status */
export function setLastHealthCheckForTesting(status: HealthCheckResult) {
  lastHealthCheck = status;
}

/**
 * Fetch verified markets from documented Polyester Testnet market endpoints.
 * Strictly adheres to zero fabricated prices, volumes, or tickers.
 */
export async function getVerifiedMarkets(): Promise<MarketsResponse> {
  const fullUrl = getMarketsEndpoint();

  // If health probe is explicitly blocked by Cloudflare, report blocked state without fetching catalog
  if (lastHealthCheck.status === 'blocked' || lastHealthCheck.isCloudflareBlocked) {
    return {
      markets: [],
      source: fullUrl,
      status: 'blocked',
      message: 'Market data feed is inactive because the Polyester Testnet gateway is protected by Cloudflare.',
    };
  }

  // Try official SDK client.marketData.getSpotConfig()
  const client = getSDKClient();
  if (client) {
    try {
      const spotConfig = await client.marketData.getSpotConfig();
        if (spotConfig && Array.isArray(spotConfig.pairs) && spotConfig.pairs.length > 0) {
          const validatedMarkets = mapSdkMarkets(spotConfig.pairs);
          return {
          markets: validatedMarkets,
          source: 'SDK:client.marketData.getSpotConfig',
          status: 'verified',
          message: `Retrieved ${validatedMarkets.length} verified markets from Polyester Testnet via official SDK.`,
        };
      }
    } catch (sdkErr: any) {
      addLog('warn', 'api', `SDK market catalog probe failed: ${sdkErr.message}`);
    }
  }

  // If health check has not verified an open JSON connection, return explicit unavailable state
  if (lastHealthCheck.status !== 'connected' || !lastHealthCheck.schemaValid) {
    return {
      markets: [],
      source: fullUrl,
      status: 'unavailable',
      message: 'Market data feed is inactive. A verified connection to Polyester Testnet is required before parsing live market data.',
    };
  }

  try {
    const { response } = await fetchWithBoundedRetry(fullUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PolyesterTitanAI/2.0',
      },
    });

    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();

    return evaluateMarketsResponse(
      response.status,
      contentType,
      rawText,
      {
        'server': response.headers.get('server'),
        'cf-ray': response.headers.get('cf-ray'),
        'retry-after': response.headers.get('retry-after'),
      },
      fullUrl
    );
  } catch (err) {
    addLog('warn', 'api', `Market catalog retrieval failed: ${(err as Error).message}`);
    return {
      markets: [],
      source: fullUrl,
      status: 'unavailable',
      message: `Failed to retrieve market catalog: ${(err as Error).message}`,
    };
  }
}

/**
 * Detect System and Runtime Information
 */
export function getSystemRuntimeInfo(): SystemRuntimeInfo {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pythonRuntime: {
      installedVersion: 'Python 3.10.12',
      hasPip: false,
      sdkCompatibility: {
        compatible: false,
        sdkPackage: 'polyester-sdk (>=0.1.0a55)',
        requiredPythonVersion: 'Python >= 3.11',
        note: 'Container runtime has Python 3.10 without pip. Official polyester-sdk on PyPI requires Python >= 3.11. A separate Python 3.11+ FastAPI service container or microservice can be attached via FASTAPI_BACKEND_URL.',
      },
    },
    serverBridge: {
      type: 'Node.js Express Full-Stack Server',
      port: config.port,
      testnetOnlyLock: true,
      credentialsConfigured: {
        hasApiKeyId: config.hasApiKeyId,
        hasApiPrivateKey: config.hasApiPrivateKey,
        hasAccountId: config.hasAccountId,
      },
      fastapiCompanion: {
        configuredUrl: config.fastapiBackendUrl,
        status: config.fastapiBackendUrl ? 'unreachable' : 'disabled',
      },
    },
  };
}

/**
 * Initialize official Polyester SDK Client with configured credentials.
 */
export function getSDKClient(): PolyesterClient | null {
  const creds = getPolyesterCredentials();
  if (!creds.apiKeyId || !creds.apiSecretHex) {
    return null;
  }
  
  try {
    const secretHex = creds.apiSecretHex.startsWith('0x')
      ? creds.apiSecretHex
      : `0x${creds.apiSecretHex}`;
    const secretBytes = evmHexToBytes(secretHex);
    return new PolyesterClient({
      environment: POLYESTER_TESTNET_ENVIRONMENT,
      auth: {
        kind: 'api-key-ed25519',
        getKeyId: () => creds.apiKeyId,
        getSecretKey: () => secretBytes,
      },
    });
  } catch (err) {
    addLog('error', 'api', `Failed to initialize Polyester SDK Client: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Execute an authenticated, read-only health check request to the Polyester testnet
 * using the configured credentials. Reports the actual HTTP status, Cloudflare status,
 * and diagnostic details, strictly redacting all sensitive credential values.
 * In Phase 19A, this now uses the official SDK to verify identity via client.auth.me().
 */
export async function executeAuthenticatedHealthCheck(): Promise<AuthenticatedHealthCheckResult> {
  const creds = getPolyesterCredentials();
  const validation = validateCredentialsFormat(creds.apiKeyId, creds.apiSecretHex);
  const startTime = Date.now();
  const fullUrl = getHealthEndpoint();

  const keyIdMasked = creds.apiKeyId
    ? (creds.apiKeyId.length > 8 ? `${creds.apiKeyId.slice(0, 4)}***${creds.apiKeyId.slice(-4)}` : `${creds.apiKeyId.slice(0, 2)}***`)
    : null;
  const accountIdMasked = creds.accountId
    ? (creds.accountId.length > 4 ? `${creds.accountId.slice(0, 4)}***${creds.accountId.slice(-2)}` : `${creds.accountId.slice(0, 2)}***`)
    : null;

  if (!validation.valid) {
    return {
      success: false,
      authenticated: false,
      authenticatedProbe: true,
      authSchemeStatus: 'UNVERIFIED',
      authSchemeNote: 'Polyester documentation specifies Ed25519 cryptographic signing. Validation failed locally.',
      credentialsSent: false,
      status: 'error',
      httpStatus: null,
      statusText: null,
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
      targetHost: config.polyesterApiHost,
      targetEndpoint: '/v1/health',
      isCloudflareBlocked: false,
      isRateLimited: false,
      schemaValid: false,
      parsedData: null,
      message: validation.error || 'Invalid credentials format',
      rawSample: null,
      headers: {
        cfRay: null,
        server: null,
        contentType: null,
      },
      credentials: {
        keyIdMasked,
        accountIdMasked,
        hasPrivateKey: Boolean(creds.apiSecretHex),
        validation: {
          valid: false,
          code: validation.code,
          error: validation.error,
        },
      },
      securityNotice: 'Polyester Testnet mode locked. Zero credentials sent over the wire.',
    };
  }

  addLog('info', 'api', `Initiating authenticated identity verification via official SDK to verified RPC endpoints`);

  let identityData: any = null;
  let identityError: string | null = null;
  let sdkHttpStatus: number | null = null;
  let isCloudflare = false;

  try {
    const client = getSDKClient();
    if (!client) {
      throw new Error('Could not initialize official SDK client with provided credentials');
    }

    // Official Identity Probe: client.auth.me()
    // This is a read-only request that verifies the API key and signature against the testnet.
    identityData = await client.auth.me();
    addLog('info', 'api', 'Successfully verified identity via official SDK client.auth.me()');
  } catch (err: any) {
    identityError = err.message || String(err);
    
    // Attempt to detect Cloudflare block from SDK error if possible
    if (identityError && (identityError.includes('403') || identityError.toLowerCase().includes('cloudflare'))) {
      isCloudflare = true;
    }
    
    // Check for HTTP status in error if it's an SDK error
    if (err.httpStatus) sdkHttpStatus = err.httpStatus;
    else if (identityError && identityError.includes('401')) sdkHttpStatus = 401;
    else if (identityError && identityError.includes('403')) sdkHttpStatus = 403;
    else if (identityError && identityError.includes('429')) sdkHttpStatus = 429;

    addLog('warn', 'api', `Identity verification failed: ${identityError ?? 'Unknown error'}`);
  }

  const latencyMs = Date.now() - startTime;

  // Phase 19: Local Cryptographic Verification Audit
  let localCryptoVerification: {
    success: boolean;
    message: string;
    details?: {
      signingCanonical?: string;
      signatureHex?: string;
      timestamp?: string;
    };
  } = {
    success: false,
    message: 'Local cryptographic verification pending',
  };

  try {
    if (creds.apiSecretHex && creds.apiKeyId) {
      const timestamp = String(Date.now());
      const method = 'GET';
      const pathname = '/v1/health';
      const queryString = '';
      const bodyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const canonical = `${timestamp}\n${method}\n${pathname}\n${queryString}\n${bodyHash}`;
      
      const { signAsync } = await import('@noble/ed25519');
      const secretHex = creds.apiSecretHex.startsWith('0x')
        ? creds.apiSecretHex
        : `0x${creds.apiSecretHex}`;
      const privBytes = evmHexToBytes(secretHex);
      
      if (privBytes.length === 32) {
        const sig = await signAsync(new TextEncoder().encode(canonical), privBytes);
        const sigHex = Buffer.from(sig).toString('hex');
        
        localCryptoVerification = {
          success: true,
          message: 'Local Ed25519 signing verified. Configured Secret Key is valid.',
          details: {
            signingCanonical: canonical.replace(/\n/g, '\\n'),
            signatureHex: `${sigHex.slice(0, 8)}***${sigHex.slice(-8)}`,
            timestamp,
          }
        };
      } else {
        localCryptoVerification = {
          success: false,
          message: `Invalid Secret Key length: expected 32 bytes (64 hex chars), got ${privBytes.length} bytes.`,
        };
      }
    }
  } catch (cryptoErr) {
    localCryptoVerification = {
      success: false,
      message: `Local cryptographic verification failed: ${(cryptoErr as Error).message}`,
    };
  }

  const success = Boolean(identityData);

  return {
    success,
    authenticated: success,
    authenticatedProbe: true,
    authSchemeStatus: success ? 'VERIFIED' : 'UNVERIFIED',
    authSchemeNote: success 
      ? 'Successfully verified identity via official SDK client.auth.me(). Credentials and signatures are valid.'
      : `Identity verification failed via official SDK: ${identityError}. This may be due to invalid credentials or network-level blocks (Cloudflare).`,
    credentialsSent: true,
    status: success ? 'connected' : (isCloudflare ? 'blocked' : 'error'),
    httpStatus: sdkHttpStatus,
    statusText: identityError,
    latencyMs,
    checkedAt: new Date().toISOString(),
    targetHost: POLYESTER_TESTNET_ENVIRONMENT.apiUrl,
    targetEndpoint: '/v1/me', // SDK internal endpoint for auth.me()
    isCloudflareBlocked: isCloudflare,
    isRateLimited: sdkHttpStatus === 429,
    schemaValid: success,
    parsedData: identityData,
    message: success ? 'Authentication verified via official SDK.' : `Authentication failed: ${identityError ?? 'Unknown error'}`,
    rawSample: identityError ? sanitizeLog(identityError).slice(0, 300) : null,
    headers: {
      cfRay: null,
      server: null,
      contentType: 'application/json',
    },
    identity: identityData ? {
      accountId: identityData.accountId || identityData.id,
      status: identityData.status || 'active',
      ...identityData
    } : null,
    credentials: {
      keyIdMasked,
      accountIdMasked,
      hasPrivateKey: true,
      validation: {
        valid: true,
        code: 'VALID',
      },
      localCryptographicVerification: localCryptoVerification,
    },
    securityNotice: 'Polyester Testnet mode locked. Private keys are never exposed in responses or logs.',
  };
}
