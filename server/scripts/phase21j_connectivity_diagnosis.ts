/**
 * Phase 21J: Polyester Testnet Connectivity Diagnosis Script
 * Safe, read-only diagnostic probe to analyze Cloudflare Managed Challenge (HTTP 403)
 * across REST endpoints and SDK methods without leaking secrets or placing trades.
 */

import { config, getPolyesterCredentials, sanitizeLog } from '../config.js';
import { getSDKClient } from '../polyesterClient.js';
import { POLYESTER_TESTNET_ENVIRONMENT } from '@polyester/sdk';

async function runDiagnosis() {
  console.log('=== PHASE 21J: POLYESTER TESTNET CONNECTIVITY DIAGNOSIS ===\n');
  const timestamp = new Date().toISOString();
  console.log(`Diagnostic Run Timestamp: ${timestamp}`);
  console.log(`Configured API Host: ${config.polyesterApiHost}`);
  console.log(`SDK Environment Target URL: ${POLYESTER_TESTNET_ENVIRONMENT.apiUrl}`);
  console.log(`SDK Package Version: @polyester/sdk v0.31.0`);

  const creds = getPolyesterCredentials();
  console.log(`Credentials Configured:`);
  console.log(`  - Key ID Present: ${Boolean(creds.apiKeyId)}`);
  console.log(`  - Key ID Masked: ${creds.apiKeyId ? `${creds.apiKeyId.slice(0, 4)}***${creds.apiKeyId.slice(-4)}` : 'N/A'}`);
  console.log(`  - Secret Present: ${Boolean(creds.apiSecretHex)}`);
  console.log(`  - Account ID Present: ${Boolean(creds.accountId)}`);
  console.log(`  - Account ID Masked: ${creds.accountId ? `${creds.accountId.slice(0, 4)}***${creds.accountId.slice(-2)}` : 'N/A'}\n`);

  // 1. Direct REST Probes
  console.log('--- 1. Direct REST Endpoint Probes ---');

  const restEndpoints = [
    { name: 'Frontend Health Check', url: `https://testnet.polyester.com/v1/health`, method: 'GET' },
    { name: 'Official API Base Health Check', url: `https://api.testnet.polyester.com/v1/health`, method: 'GET' },
    { name: 'Official API Spot Config', url: `https://api.testnet.polyester.com/v1/spot/config`, method: 'GET' },
  ];

  for (const ep of restEndpoints) {
    try {
      const startTime = Date.now();
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'PolyesterTitanAI/2.0 (Diagnostic Probe)',
        },
      });
      const durationMs = Date.now() - startTime;
      const text = await res.text();
      
      const cfRay = res.headers.get('cf-ray');
      const server = res.headers.get('server');
      const contentType = res.headers.get('content-type');
      
      console.log(`[REST] ${ep.name} (${ep.method} ${ep.url}):`);
      console.log(`  - Status: ${res.status} ${res.statusText}`);
      console.log(`  - Latency: ${durationMs}ms`);
      console.log(`  - Content-Type: ${contentType}`);
      console.log(`  - Server Header: ${server}`);
      console.log(`  - CF-Ray Header: ${cfRay || 'None'}`);
      console.log(`  - Body Length: ${text.length} bytes`);
      if (text.includes('Just a moment...') || text.includes('challenges.cloudflare.com')) {
        console.log(`  - Cloudflare Flag: DETECTED (Managed Challenge / Bot Protection)`);
        const titleMatch = text.match(/<title>(.*?)<\/title>/i);
        console.log(`  - HTML Title: "${titleMatch ? titleMatch[1] : 'Unknown'}"`);
      } else {
        console.log(`  - Sample Body: ${text.slice(0, 150)}`);
      }
      console.log('');
    } catch (err: any) {
      console.log(`[REST] ${ep.name} ERROR: ${err.message}\n`);
    }
  }

  // 2. SDK Method Probes
  console.log('--- 2. Official SDK Method Probes ---');
  const client = getSDKClient();

  if (!client) {
    console.log('SDK Client: Uninitialized (Missing credentials)');
  } else {
    // 2a. Auth / Identity
    console.log('[SDK] Probing client.auth.me():');
    try {
      const me = await client.auth.me();
      console.log(`  - Status: SUCCESS`);
      console.log(`  - Account ID: ${me.accountId}`);
    } catch (err: any) {
      console.log(`  - Status: FAILED`);
      console.log(`  - Error Message: ${sanitizeLog(err.message || String(err))}`);
    }

    // 2b. Market Data
    console.log('\n[SDK] Probing client.marketData.getSpotConfig():');
    try {
      const spotConfig = await client.marketData.getSpotConfig();
      console.log(`  - Status: SUCCESS`);
      console.log(`  - Pairs Count: ${spotConfig.pairs?.length || 0}`);
      console.log(`  - Assets Count: ${spotConfig.assets?.length || 0}`);
    } catch (err: any) {
      console.log(`  - Status: FAILED`);
      console.log(`  - Error Message: ${sanitizeLog(err.message || String(err))}`);
    }

    // 2c. Balances
    console.log('\n[SDK] Probing client.balances.list():');
    try {
      const balances = await client.balances.list();
      console.log(`  - Status: SUCCESS`);
      console.log(`  - Balances Count: ${balances.length}`);
    } catch (err: any) {
      console.log(`  - Status: FAILED`);
      console.log(`  - Error Message: ${sanitizeLog(err.message || String(err))}`);
    }

    // 2d. Order Preview (Read-only Dry-Run)
    console.log('\n[SDK] Probing client.orders.preview():');
    try {
      const preview = await client.orders.preview({
        symbolId: 1,
        side: 'buy',
        qty: '0.00006355',
        execution: {
          type: 'limit_gtc',
          price: '78678.76',
          postOnly: false,
        },
      });
      console.log(`  - Status: SUCCESS`);
      console.log(`  - Admissible: ${preview.admissible}`);
    } catch (err: any) {
      console.log(`  - Status: FAILED`);
      console.log(`  - Error Message: ${sanitizeLog(err.message || String(err))}`);
    }
  }

  console.log('\n=== DIAGNOSIS SUMMARY ===');
}

runDiagnosis().catch(err => {
  console.error('Diagnostic error:', err);
});
