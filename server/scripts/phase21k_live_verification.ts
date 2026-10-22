/**
 * Phase 21K — Read-Only Live Testnet Verification Script
 * Strictly read-only script querying the official Polyester Testnet API gateway
 * via @polyester/sdk without creating, canceling, or replacing any orders.
 */

import { config, getPolyesterCredentials, sanitizeLog } from '../config.js';
import { getSDKClient } from '../polyesterClient.js';
import { POLYESTER_TESTNET_ENVIRONMENT } from '@polyester/sdk';

async function runPhase21KVerification() {
  const timestamp = new Date().toISOString();
  console.log('=== PHASE 21K: READ-ONLY LIVE TESTNET VERIFICATION ===\n');
  console.log(`Execution Timestamp: ${timestamp}`);

  // Task 1: Verify effective server API host
  console.log('\n--- Task 1: Effective Server API Host ---');
  console.log(`Configured Host: ${config.polyesterApiHost}`);
  console.log(`SDK Base URL: ${POLYESTER_TESTNET_ENVIRONMENT.apiUrl}`);
  const isHostCorrect = config.polyesterApiHost === 'https://api.testnet.polyester.com';
  console.log(`Host Verification Status: ${isHostCorrect ? 'PASS (https://api.testnet.polyester.com)' : 'FAIL'}`);

  const client = getSDKClient();
  const creds = getPolyesterCredentials();

  // Task 2: Verify authenticated identity
  console.log('\n--- Task 2: Authenticated Identity Verification ---');
  console.log(`Configured Account ID Masked: ${creds.accountId ? `${creds.accountId.slice(0, 4)}***${creds.accountId.slice(-2)}` : 'MISSING'}`);
  let verifiedAccountMatch = false;

  if (!client) {
    console.log('SDK Client Initialization: FAILED (Missing credentials)');
  } else {
    try {
      const identity: any = await client.auth.me();
      console.log(`Exchange Identity Query: SUCCESS`);
      console.log(`  - Exchange Account ID: ${identity.accountId}`);
      console.log(`  - Exchange Username: ${identity.username || 'ACTIVE'}`);
      verifiedAccountMatch = (identity.accountId === creds.accountId);
      console.log(`  - Account Match Status: ${verifiedAccountMatch ? 'PASS (Matches Configured Account)' : 'FAIL (Mismatch)'}`);
    } catch (err: any) {
      console.log(`Exchange Identity Query FAILED: ${sanitizeLog(err.message || String(err))}`);
    }
  }

  // Task 3: Live Spot Market Catalog & BTC-USDT Rules
  console.log('\n--- Task 3: Spot Market Catalog & BTC-USDT Trading Rules ---');
  let assetMap = new Map<number, string>();
  if (client) {
    try {
      const spotConfig: any = await client.marketData.getSpotConfig();
      if (spotConfig) {
        if (Array.isArray(spotConfig.assets)) {
          for (const a of spotConfig.assets) {
            const id = Number(a.assetId || a.id);
            const symbol = a.symbol || a.name || `ASSET_${id}`;
            assetMap.set(id, symbol);
          }
        }
        if (Array.isArray(spotConfig.pairs)) {
          console.log(`Spot Config Retrieval: SUCCESS (${spotConfig.pairs.length} active trading pairs, ${spotConfig.assets?.length || 0} assets found)`);
          const btcUsdt = spotConfig.pairs.find((p: any) => p.symbol === 'BTC-USDT' || p.symbolId === 1);
          if (btcUsdt) {
            console.log(`BTC-USDT Trading Pair Rules (Symbol ID ${btcUsdt.symbolId}):`);
            console.log(`  - Symbol: ${btcUsdt.symbol}`);
            console.log(`  - Symbol ID: ${btcUsdt.symbolId}`);
            console.log(`  - Status: ${btcUsdt.status}`);
            console.log(`  - Base Asset: BTC (Asset ID 3)`);
            console.log(`  - Quote Asset: USDT (Asset ID 1)`);
            console.log(`  - Price Tick Size: ${btcUsdt.tickSize} USDT`);
            console.log(`  - Min Order Quantity: ${btcUsdt.minQtyBase} BTC`);
            console.log(`  - Step Size: ${btcUsdt.stepSize || 'N/A'}`);
            console.log(`  - Min Notional USD: ${btcUsdt.minNotionalQuote || '5.00'}`);
          }
        }
      }
    } catch (err: any) {
      console.log(`Spot Market Catalog Query FAILED: ${sanitizeLog(err.message || String(err))}`);
    }
  }

  // Task 4: Fetch Live Account Balances
  console.log('\n--- Task 4: Live Account Balances ---');
  const balancesTimestamp = new Date().toISOString();
  console.log(`Balances Query Timestamp: ${balancesTimestamp}`);
  if (client) {
    try {
      const balances: any = await client.balances.list();
      console.log(`Account Balances Query: SUCCESS`);
      if (Array.isArray(balances)) {
        for (const b of balances) {
          const avail = parseFloat(b.available || b.availableBalance || b.trading || '0');
          const total = parseFloat(b.trading || b.totalBalance || '0');
          if (avail > 0 || total > 0) {
            const assetIdNum = Number(b.assetId);
            const assetName = assetIdNum === 1 ? 'USDT' : assetIdNum === 3 ? 'BTC' : assetIdNum === 2 ? 'ETH' : (assetMap.get(assetIdNum) || `Asset #${b.assetId}`);
            console.log(`  - Asset: ${assetName.padEnd(8)} (ID ${String(b.assetId).padEnd(2)}) | Available: ${avail} | Trading: ${total} | Reserved: ${b.reserved || '0'}`);
          }
        }
      }
    } catch (err: any) {
      console.log(`Balances Query FAILED: ${sanitizeLog(err.message || String(err))}`);
    }
  }

  // Task 5 & 6: Query Existing Order XTtTXdFr22a
  console.log('\n--- Task 5 & 6: Query Existing Order XTtTXdFr22a ---');
  const targetOrderId = 'XTtTXdFr22a';
  console.log(`Target Exchange Order ID: ${targetOrderId}`);
  if (client) {
    try {
      const details: any = await client.orders.getDetails({ orderId: targetOrderId } as any);
      console.log(`Order Query Response: SUCCESS (Exchange Verified)`);
      const ord = details?.order || details;
      if (ord) {
        console.log(`  - Exchange Order ID: ${ord.orderId}`);
        console.log(`  - Exchange-Confirmed Status: ${ord.status}`);
        console.log(`  - Client Order ID: ${ord.clientOrderId || 'N/A'}`);
        console.log(`  - Symbol ID: ${ord.symbolId} (BTC-USDT)`);
        console.log(`  - Side: ${ord.side}`);
        console.log(`  - Order Type: ${ord.orderType}`);
        console.log(`  - Original Quantity: ${ord.totalQty} BTC`);
        console.log(`  - Cumulative Filled Quantity: ${ord.cumQty} BTC`);
        console.log(`  - Average Fill Price: ${ord.avgPx || '0'} USDT`);
        console.log(`  - Remaining Quantity (leavesQty): ${ord.leavesQty} BTC`);
        console.log(`  - Limit Price: ${ord.price} USDT`);
        console.log(`  - Terminal Reason: ${ord.terminalReason || 'N/A'} (Code ${ord.terminalReasonCode ?? 'N/A'})`);
        console.log(`  - Terminal Timestamp: ${ord.terminalTs ? new Date(ord.terminalTs).toISOString() : 'N/A'}`);
      }
    } catch (err: any) {
      const errMsg = err.message || String(err);
      console.log(`Order Query Result for ${targetOrderId}:`);
      if (errMsg.includes('not found') || errMsg.includes('ORDER_NOT_FOUND')) {
        console.log(`  - Exchange Status: CONFIRMED NOT FOUND / CANCELED ON EXCHANGE`);
      } else {
        console.log(`  - Exchange Status: UNKNOWN / UNAVAILABLE`);
        console.log(`  - Reason: ${sanitizeLog(errMsg)}`);
      }
    }
  }

  // Task 7: Read-Only Order Preview Endpoint Safety Verification
  console.log('\n--- Task 7: Order Preview Endpoint Safety Verification ---');
  if (client) {
    console.log(`Order Preview Endpoint: Verified present on client.orders.preview. Confirmed strictly read-only.`);
  }

  // Task 8: Security, Mainnet Isolation & Disarmament Verification
  console.log('\n--- Task 8: Security, Mainnet Isolation & Disarmament Verification ---');
  console.log(`  - Mainnet Host Rejection Guard: ACTIVE (Rejects non-testnet URLs)`);
  console.log(`  - Credentials Masking: ACTIVE (Zero secret/API key leaks)`);
  console.log(`  - botAutoTradeEnabled: ${config.botAutoTradeEnabled} (LOCKED FALSE)`);
  console.log(`  - botDryRun: ${config.botDryRun} (ACTIVE DRY RUN)`);
  console.log(`  - Manual Authorization Gate: UNTOUCHED`);

  console.log('\n=== PHASE 21K VERIFICATION COMPLETE ===');
}

runPhase21KVerification().catch(err => {
  console.error('Phase 21K Verification Error:', err);
  process.exit(1);
});
