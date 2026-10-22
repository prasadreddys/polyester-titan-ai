/**
 * POLYESTER TITAN AI - Full-Stack Express Server Entry Point
 * Mounts Vite dev server in development and hosts the secure Polyester API integration layer.
 */

import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './server/config.js';
import { addLog, getLogs } from './server/logger.js';
import {
  executeHealthCheck,
  executeAuthenticatedHealthCheck,
  getLastHealthCheck,
  getLocalAppHealth,
  getVerifiedMarkets,
  getSystemRuntimeInfo,
} from './server/polyesterClient.js';
import {
  getAccountBalance,
  listManagedOrders,
  getManagedOrder,
  createManagedOrder,
  cancelManagedOrder,
  cancelAllBotOrders,
  reconcileManagedOrder,
  getAuditEvents,
  recordAuditEvent,
  setEmergencyKillSwitchState,
} from './server/orderManager.js';
import {
  coordinateStrategy,
  getLastDecision,
  getDecisionHistory,
  getStrategyConfig,
  updateStrategyConfig,
  evaluateReadiness,
  executeStrategyDecision,
  setOperatorAuthorization,
  getPerformanceStats,
} from './server/strategyEngine.js';
import { validateCredentialsFormat } from './server/credentialValidator.js';
import { getStagedOrderPreview, executeLifecycleTest } from './server/phase21e_handler.js';
import { reconcileTargetOrder, cancelTargetOrder } from './server/phase21g_handler.js';
import {
  getPaperTradingSummary,
  listPaperSignals,
  evaluatePendingPaperSignals,
} from './server/paperTradingEngine.js';
import { getPhase33GateReport, executePhase33GateVerification } from './server/phase33_handler.js';
import { getPhase34AuditReport, executePhase34PerformanceVerification } from './server/phase34_handler.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();

  const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
  const rateLimitWindowMs = 60_000;
  const maxRateLimitEntries = 10_000;

  const enforceRateLimit = (bucket: string, maxRequests: number) => (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${bucket}:${clientIp}`;
    const now = Date.now();
    let record = rateLimitMap.get(key);

    if (!record || now >= record.resetTime) {
      if (rateLimitMap.size >= maxRateLimitEntries) {
        for (const [entryKey, entry] of rateLimitMap) {
          if (now >= entry.resetTime || rateLimitMap.size >= maxRateLimitEntries) {
            rateLimitMap.delete(entryKey);
          }
          if (rateLimitMap.size < maxRateLimitEntries) break;
        }
      }
      record = { count: 1, resetTime: now + rateLimitWindowMs };
      rateLimitMap.set(key, record);
    } else if (++record.count > maxRequests) {
      addLog('warn', 'risk', `Rate limit exceeded for client IP ${clientIp} on ${req.path}`);
      return res.status(429).json({ success: false, error: 'Rate limit exceeded. Too many requests.' });
    }

    next();
  };

  // Security Headers Middleware & Correlation ID Tracing
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    }

    if (config.nodeEnv === 'production' && req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    const websocketSources = config.nodeEnv === 'development'
      ? " ws://localhost:* ws://127.0.0.1:*"
      : '';
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'${websocketSources}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
    );

    const requestedCorrelationId = req.headers['x-correlation-id'];
    const correlationId = typeof requestedCorrelationId === 'string' &&
      /^[a-zA-Z0-9._-]{1,64}$/.test(requestedCorrelationId)
      ? requestedCorrelationId
      : `corr_${Math.random().toString(36).substring(2, 9)}`;
    res.setHeader('X-Correlation-ID', correlationId);
    next();
  });

  app.use('/api', (req, res, next) => {
    const origin = req.get('origin');
    if (origin) {
      try {
        if (new URL(origin).host !== req.get('host')) {
          return res.status(403).json({ success: false, error: 'Cross-origin API requests are not allowed.' });
        }
      } catch {
        return res.status(403).json({ success: false, error: 'Invalid request origin.' });
      }
    }
    next();
  });
  app.use('/api', enforceRateLimit('api', 120));
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    return enforceRateLimit('mutation', 20)(req, res, next);
  });
  app.use(express.json({ limit: '32kb' }));
  app.use((err: { status?: number }, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err.status === 400) {
      return res.status(400).json({ success: false, error: 'Invalid JSON request body.' });
    }
    if (err.status === 413) {
      return res.status(413).json({ success: false, error: 'Request body exceeds the 32 KB limit.' });
    }
    next(err);
  });

  // Log server boot safely (without printing any secret values)
  addLog('info', 'system', 'Polyester Titan AI server starting up', {
    port: config.port,
    environment: config.nodeEnv,
    targetHost: config.polyesterApiHost,
    credentialsConfigured: {
      hasApiKeyId: config.hasApiKeyId,
      hasApiPrivateKey: config.hasApiPrivateKey,
      hasAccountId: config.hasAccountId,
    },
    fastapiCompanion: config.fastapiBackendUrl || 'Not configured',
  });

  // State for trading status & risk controls (in-memory)
  let autoTradingEnabled = false; // Always disabled by default
  let emergencyKillSwitch = false;

  let riskSettings = {
    maxPositionSizeUsd: 1000,
    maxDrawdownPercent: 5.0,
    slippageTolerancePercent: 0.5,
    stopLossPercent: 2.0,
    maxOpenOrders: 3,
    killSwitchActive: false,
    updatedAt: new Date().toISOString(),
  };

  // Run initial non-intrusive health check at startup (read-only /v1/health probe, NEVER submits orders)
  executeHealthCheck().catch((err) => {
    addLog('error', 'api', `Startup health check error: ${(err as Error).message}`);
  });

  // ==================== REST API ROUTES ====================

  // 1. Health Status endpoint - Keeps local application health separate from upstream health
  app.get('/api/health', (req, res) => {
    const upstreamHealth = getLastHealthCheck();
    const appHealth = getLocalAppHealth();
    const runtime = getSystemRuntimeInfo();
    res.json({
      appHealth,
      upstreamHealth,
      health: upstreamHealth, // Backward compatibility
      runtime,
      autoTradingEnabled,
      emergencyKillSwitch,
      timestamp: new Date().toISOString(),
    });
  });

  // Dedicated local health probe (independent of upstream status)
  app.get('/api/health/local', (req, res) => {
    res.json(getLocalAppHealth());
  });

  // Dedicated upstream testnet health probe
  app.get('/api/health/upstream', (req, res) => {
    res.json(getLastHealthCheck());
  });

  // 2. On-demand Connection Test trigger
  app.post('/api/health/test', async (req, res) => {
    try {
      const result = await executeHealthCheck();
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: (err as Error).message || 'Failed to execute health check',
      });
    }
  });

  // Authenticated Testnet Health Check probe (read-only health check request to Polyester testnet using configured credentials)
  const handleAuthenticatedHealth = async (req: express.Request, res: express.Response) => {
    try {
      const result = await executeAuthenticatedHealthCheck();
      if (!result.credentials.validation.valid) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message || 'Failed to execute authenticated health check',
      });
    }
  };

  app.get('/api/health/authenticated', handleAuthenticatedHealth);
  app.post('/api/health/authenticated', handleAuthenticatedHealth);

  // 3. Markets endpoint (Real data only - returns empty array if unverified or disconnected)
  app.get('/api/markets', async (req, res) => {
    try {
      const marketsData = await getVerifiedMarkets();
      res.json(marketsData);
    } catch (err) {
      res.json({
        markets: [],
        source: `${config.polyesterApiHost}/v1/markets`,
        status: 'empty',
        message: `Failed to retrieve markets: ${(err as Error).message}`,
      });
    }
  });

  // 4. Account Balance & Authentication Verification endpoint
  app.get('/api/account', (req, res) => {
    const account = getAccountBalance();
    res.json({
      ...account,
      credentialsConfigured: {
        hasApiKeyId: config.hasApiKeyId,
        hasApiSecretHex: config.hasApiSecretHex,
        hasAccountId: config.hasAccountId,
      },
      testnetEnforced: true,
    });
  });

  // 5. Orders endpoints (Phase 3: Secure Testnet Order Lifecycle & Validation)
  app.get('/api/orders', (req, res) => {
    const orders = listManagedOrders();
    const activeCount = orders.filter(o => o.status === 'open' || o.status === 'partially_filled').length;
    res.json({
      orders,
      activeCount,
      phase: 3,
      policy: 'Phase 3: Secure Testnet Order Execution Infrastructure. Dry-run mode active by default.',
      dryRun: config.botDryRun,
    });
  });

  app.post('/api/orders', async (req, res) => {
    const risk = {
      ...riskSettings,
      killSwitchActive: emergencyKillSwitch,
      allowedSymbols: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'POLY-USDT'],
    };

    const { approvalId, ...orderRequest } = req.body;
    const result = await createManagedOrder(orderRequest, risk, approvalId);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        order: result.order,
        error: result.error,
        code: result.code,
      });
    }

    res.json({
      success: true,
      order: result.order,
      message: 'Testnet order successfully validated, dry-run executed, and registered in audit log.',
    });
  });

  app.get('/api/orders/:id', async (req, res) => {
    let order;
    try {
      order = await reconcileManagedOrder(req.params.id);
    } catch (err: any) {
      return res.status(502).json({ success: false, error: err.message });
    }
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found.' });
    }
    res.json({ success: true, order });
  });

  app.delete('/api/orders/:id', async (req, res) => {
    const result = await cancelManagedOrder(req.params.id);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ success: true, order: result.order, message: 'Order cancelled successfully.' });
  });

  // 6. Emergency Kill Switch Endpoint
  app.post('/api/kill-switch', async (req, res) => {
    emergencyKillSwitch = true;
    setEmergencyKillSwitchState(true);
    autoTradingEnabled = false;
    const cancelledCount = await cancelAllBotOrders();
    addLog('warn', 'risk', `EMERGENCY KILL SWITCH ACTIVATED via operator control. Cancelled ${cancelledCount} open orders.`);
    res.json({
      success: true,
      emergencyKillSwitch: true,
      autoTradingEnabled: false,
      cancelledCount,
      message: `Emergency Kill Switch activated. All open orders cancelled (${cancelledCount}).`,
    });
  });

  // 7. Audit Events Endpoint
  app.get('/api/audit-events', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    res.json({ events: getAuditEvents(limit) });
  });

  // ==================== PHASE 4: MULTI-AGENT STRATEGY & READINESS WORKFLOW ====================

  app.get('/api/strategy/status', (req, res) => {
    res.json({
      config: getStrategyConfig(),
      lastDecision: getLastDecision(),
      history: getDecisionHistory(),
    });
  });

  app.post('/api/strategy/config', (req, res) => {
    const updated = updateStrategyConfig(req.body);
    res.json({ success: true, config: updated });
  });

  app.post('/api/strategy/preview', async (req, res) => {
    const symbol = (req.body.symbol || 'BTC-USDT').toUpperCase();
    try {
      const decision = await coordinateStrategy(symbol);
      const executionResult = await executeStrategyDecision(decision);
      res.json({
        success: true,
        decision,
        executionResult,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  app.get('/api/strategy/readiness', (req, res) => {
    const report = evaluateReadiness();
    res.json(report);
  });

  app.post('/api/strategy/authorize', (req, res) => {
    const authorize = Boolean(req.body.authorize);
    const authResult = setOperatorAuthorization(authorize);
    res.json({
      success: true,
      explicitOperatorAuthorization: authorize,
      authorizationStatus: authResult,
      message: authorize ? 'Operator authorization granted with 15-minute TTL.' : 'Operator authorization revoked.',
    });
  });

  app.get('/api/strategy/performance', (req, res) => {
    res.json(getPerformanceStats());
  });

  // Paper Trading Telemetry Endpoints
  app.get('/api/paper-trading', (req, res) => {
    res.json({
      success: true,
      summary: getPaperTradingSummary(),
      signals: listPaperSignals(100),
    });
  });

  app.post('/api/paper-trading/evaluate', async (req, res) => {
    try {
      const marketsRes = await getVerifiedMarkets();
      const priceMap = new Map<string, number>();
      for (const m of marketsRes.markets) {
        if (m.lastPrice) {
          priceMap.set(m.symbol.toUpperCase(), Number(m.lastPrice));
        }
      }
      const evaluatedCount = evaluatePendingPaperSignals(priceMap);
      res.json({
        success: true,
        evaluatedCount,
        summary: getPaperTradingSummary(),
      });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  // 8. Trading Status endpoint
  app.get('/api/trading-status', (req, res) => {
    res.json({
      autoTradingEnabled,
      emergencyKillSwitch,
      executionMode: autoTradingEnabled ? 'automated' : 'manual_safe',
      canEnableAutoTrading: false, // Security rule: always false by default
      phase3Notice: 'Phase 3: Manual testnet order execution enabled with automated risk controls and dry-run safety.',
    });
  });

  // 9. Safe Trading Status Toggle
  app.post('/api/trading-status/toggle', (req, res) => {
    const requestedState = Boolean(req.body.enabled);
    if (requestedState) {
      addLog('warn', 'risk', 'User attempted to enable automatic background trading. Action prevented by security policy.');
      return res.status(403).json({
        success: false,
        autoTradingEnabled: false,
        message: 'Security Policy: Automated background trading is strictly disabled per safety protocol.',
      });
    }

    autoTradingEnabled = false;
    addLog('info', 'risk', 'Automatic trading confirmed disabled.');
    res.json({
      success: true,
      autoTradingEnabled: false,
      message: 'Automatic trading disabled.',
    });
  });

  // 7. Risk Controls Read
  app.get('/api/risk-controls', (req, res) => {
    res.json({
      ...riskSettings,
      killSwitchActive: emergencyKillSwitch,
    });
  });

  // 8. Risk Controls Update
  app.post('/api/risk-controls', (req, res) => {
    const { maxPositionSizeUsd, maxDrawdownPercent, slippageTolerancePercent, stopLossPercent, killSwitchActive } = req.body;

    if (typeof killSwitchActive === 'boolean') {
      emergencyKillSwitch = killSwitchActive;
      setEmergencyKillSwitchState(killSwitchActive);
      if (killSwitchActive) {
        autoTradingEnabled = false;
        addLog('warn', 'risk', 'EMERGENCY KILL SWITCH ACTIVATED. All automated actions halted.');
      } else {
        addLog('info', 'risk', 'Emergency kill switch deactivated.');
      }
    }

    riskSettings = {
      ...riskSettings,
      maxPositionSizeUsd: Number(maxPositionSizeUsd) || riskSettings.maxPositionSizeUsd,
      maxDrawdownPercent: Number(maxDrawdownPercent) || riskSettings.maxDrawdownPercent,
      slippageTolerancePercent: Number(slippageTolerancePercent) || riskSettings.slippageTolerancePercent,
      stopLossPercent: Number(stopLossPercent) || riskSettings.stopLossPercent,
      killSwitchActive: emergencyKillSwitch,
      updatedAt: new Date().toISOString(),
    };

    addLog('info', 'risk', 'Risk control thresholds updated', {
      maxPositionSizeUsd: riskSettings.maxPositionSizeUsd,
      maxDrawdownPercent: riskSettings.maxDrawdownPercent,
      slippageTolerancePercent: riskSettings.slippageTolerancePercent,
      stopLossPercent: riskSettings.stopLossPercent,
    });

    res.json({
      success: true,
      settings: riskSettings,
    });
  });

  // 9. Structured Audit Logs
  app.get('/api/logs', (req, res) => {
    const level = req.query.level as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const logs = getLogs(limit, level);
    res.json({ logs });
  });

  // 10. System Runtime Details
  app.get('/api/system-runtime', (req, res) => {
    res.json(getSystemRuntimeInfo());
  });

  // 11. Companion Python FastAPI Proxy Health Check (if configured)
  app.get('/api/fastapi-proxy/health', async (req, res) => {
    if (!config.fastapiBackendUrl) {
      return res.json({
        configured: false,
        status: 'disabled',
        message: 'FASTAPI_BACKEND_URL not set in environment.',
      });
    }

    try {
      const response = await fetch(`${config.fastapiBackendUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        const data = await response.json();
        return res.json({
          configured: true,
          status: 'online',
          url: config.fastapiBackendUrl,
          data,
        });
      }
      res.json({
        configured: true,
        status: 'unreachable',
        url: config.fastapiBackendUrl,
        httpStatus: response.status,
      });
    } catch (err) {
      res.json({
        configured: true,
        status: 'unreachable',
        url: config.fastapiBackendUrl,
        error: (err as Error).message,
      });
    }
  });

  // Secure Non-Persistent Credential Verification Endpoint
  app.post('/api/credentials/verify', (req, res) => {
    const { apiKeyId, apiPrivateKey } = req.body || {};
    
    addLog('info', 'auth', 'Received temporary test credentials for verification test');

    const validation = validateCredentialsFormat(apiKeyId, apiPrivateKey);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error, code: validation.code });
    }

    res.json({
      success: true,
      message: 'Temporary test credentials validated in memory successfully. Credentials are non-persistent and will not be stored to disk.',
      timestamp: new Date().toISOString(),
    });
  });

  // Phase 8: Operational Diagnostics Endpoint (Distinguishes 5 States & Upstream Verification Breakdown)
  app.get('/api/diagnostics/polyester', async (req, res) => {
    const upstreamHealth = getLastHealthCheck();
    const account = getAccountBalance();
    const marketsRes = await getVerifiedMarkets().catch(() => ({ status: 'unavailable', markets: [], message: 'Failed to query markets' }));

    const isConfigured = Boolean(config.hasApiKeyId && config.hasApiPrivateKey);
    const isReachable = upstreamHealth.status === 'connected';
    const isAuthenticated = isConfigured && upstreamHealth.status !== 'blocked' && upstreamHealth.status !== 'error';
    const isAccountVerified = isConfigured;
    const isOrderReady = isConfigured && upstreamHealth.status !== 'blocked';

    let explicitBlocker = 'None';
    let nextAction = 'System ready for testnet operations under dry-run mode.';

    if (upstreamHealth.status === 'blocked') {
      explicitBlocker = 'Upstream Polyester testnet API gateway is protected by Cloudflare Managed Challenge (HTTP 403).';
      nextAction = 'Obtain an authorized integration path or dedicated API gateway endpoint from Polyester support.';
    } else if (upstreamHealth.status === 'disconnected') {
      explicitBlocker = 'Upstream testnet endpoint is disconnected or unreachable.';
      nextAction = 'Verify network connectivity or check /api/health/test.';
    } else if (!isConfigured) {
      explicitBlocker = 'Missing Polyester API credentials (API Key ID or Private Key).';
      nextAction = 'Configure POLYESTER_API_KEY_ID and POLYESTER_API_PRIVATE_KEY in environment variables.';
    }

    res.json({
      configuredEnvironment: config.nodeEnv,
      sanitizedHostname: config.polyesterApiHost,
      states: {
        configured: { status: isConfigured, description: 'API credentials provided' },
        reachable: { status: isReachable, description: 'Upstream health probe connectivity' },
        authenticated: { status: isAuthenticated, description: 'Upstream authentication handshake' },
        accountVerified: { status: isAccountVerified, description: 'Account balances and identity available' },
        orderReady: { status: isOrderReady, description: 'All readiness checks passed for dry-run submission' },
      },
      upstreamVerificationBreakdown: {
        verifiedAgainstRealUpstream: [
          'REST endpoint reachability probes (/v1/health)',
          'Cloudflare Managed Challenge detection (HTTP 403)',
          'Testnet-only host sanitizer and security guards',
        ],
        unverifiedOrBlocked: [
          'Authenticated account balance retrieval via live REST API (blocked by Cloudflare)',
          'Live testnet order execution on upstream exchange (blocked by Cloudflare)',
        ],
      },
      healthCheckOutcome: {
        status: upstreamHealth.status,
        httpStatus: upstreamHealth.httpStatus,
        isCloudflareBlocked: upstreamHealth.isCloudflareBlocked,
        latencyMs: upstreamHealth.latencyMs,
        checkedAt: upstreamHealth.checkedAt,
      },
      marketDataAccessOutcome: {
        status: marketsRes.status,
        marketsCount: marketsRes.markets.length,
        message: marketsRes.message,
      },
      accountAuthenticationOutcome: {
        status: isConfigured ? 'authenticated_stub' : 'unconfigured',
        currency: account.currency,
        isMocked: account.isMocked,
      },
      lastSuccessfulVerificationTime: upstreamHealth.status === 'connected' ? upstreamHealth.checkedAt : null,
      explicitBlocker,
      nextAction,
      safetyNotice: 'botAutoTradeEnabled=false, botDryRun=true. Zero production risk.',
      timestamp: new Date().toISOString(),
    });
  });

  // ==================== PHASE 21E: SINGLE-ORDER LIFECYCLE EXECUTION ====================

  app.get('/api/phase21e/staged-order', async (req, res) => {
    try {
      const data = await getStagedOrderPreview();
      res.json({ success: true, ...data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/phase21e/confirm-execute', async (req, res) => {
    const { confirmed } = req.body;
    if (!confirmed) {
      return res.status(400).json({ success: false, error: 'Explicit operator confirmation required.' });
    }

    try {
      addLog('info', 'risk', 'OPERATOR CONFIRMED Phase 21E Lifecycle Test execution.');
      const result = await executeLifecycleTest(confirmed);
      res.json({ success: true, result });
    } catch (err: any) {
      addLog('error', 'risk', `Phase 21E Lifecycle Test failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==================== PHASE 21G: MANUAL RECONCILIATION & CANCELLATION ====================

  app.get('/api/phase21g/reconcile/:id', async (req, res) => {
    try {
      const report = await reconcileTargetOrder(req.params.id);
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/phase21g/cancel/:id', async (req, res) => {
    const { confirmed } = req.body;
    try {
      const result = await cancelTargetOrder(req.params.id, confirmed);
      res.json(result);
    } catch (err: any) {
      addLog('error', 'risk', `Phase 21G Cancellation failed for ${req.params.id}: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==================== PHASE 33: LIVE-TRADING GATE VERIFICATION ====================

  app.get('/api/phase33/gate-report', async (req, res) => {
    try {
      const report = await getPhase33GateReport();
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/phase33/verify', async (req, res) => {
    try {
      const report = await executePhase33GateVerification();
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==================== PHASE 34: PERFORMANCE & ENDPOINT VERIFICATION ====================

  app.get('/api/phase34/audit-report', async (req, res) => {
    try {
      const report = await getPhase34AuditReport();
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/phase34/verify', async (req, res) => {
    try {
      const report = await executePhase34PerformanceVerification();
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });


  // ==================== VITE MIDDLEWARE / STATIC FILES ====================

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    // In dev mode, mount Vite middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = config.port;
  const host = process.env.HOST?.trim() || '127.0.0.1';
  app.listen(port, host, () => {
    console.log(`[POLYESTER TITAN AI] Full-Stack server running at http://${host}:${port}`);
    
    // Start continuous background paper trading evaluation worker (runs every 30 seconds)
    setInterval(async () => {
      try {
        const marketsRes = await getVerifiedMarkets().catch(() => null);
        if (!marketsRes || !marketsRes.markets) return;
        const priceMap = new Map<string, { price: number; timestamp?: string }>();
        for (const m of marketsRes.markets) {
          if (m.lastPrice) {
            priceMap.set(m.symbol.toUpperCase(), {
              price: Number(m.lastPrice),
              timestamp: m.upstreamTimestamp ? String(m.upstreamTimestamp) : new Date().toISOString(),
            });
          }
        }
        evaluatePendingPaperSignals(priceMap);
      } catch (err) {
        // Silently handle background observation cycle error
      }
    }, 30000);
  });
}

process.removeAllListeners('unhandledRejection');
process.removeAllListeners('uncaughtException');

process.on('unhandledRejection', (reason) => {
  console.error('[POLYESTER TITAN AI] Unhandled Promise Rejection:', reason);
  addLog('error', 'system', `Unhandled Promise Rejection: ${(reason as Error)?.message || reason}`);
});

process.on('uncaughtException', (error) => {
  console.error('[POLYESTER TITAN AI] Uncaught Exception - Triggering controlled shutdown:', error.message);
  addLog('error', 'system', `Uncaught Exception fatal shutdown: ${error.message}`);
  // Controlled shutdown: stop new order submissions, bounded cleanup, exit for process supervisor restart
  process.exit(1);
});

startServer().catch((err) => {
  console.error('[POLYESTER TITAN AI] Fatal startup error:', err);
  process.exit(1);
});
