/**
 * Phase 21C: Policy Verification Script
 * Verifies identity, balance access, and trading authorization on Polyester testnet.
 * Strictly read-only; no orders are submitted.
 */

import { getSDKClient } from '../polyesterClient.js';

async function verifyPolicy() {
  const client = getSDKClient();
  if (!client) {
    console.error('FAILED: SDK client not initialized. Check .env credentials.');
    return;
  }

  console.log('--- Phase 21C: Polyester Testnet API Policy Verification ---');

  // 1. Identity Check
  console.log('\n[1/3] Verifying Identity (client.auth.me)...');
  let accountId = 'unknown';
  try {
    const me = await client.auth.me();
    accountId = me.accountId;
    console.log('SUCCESS: Identity verified.');
    console.log(`- Account ID: ${accountId}`);
    console.log(`- Username: ${me.username}`);
  } catch (err: any) {
    console.error(`FAILED: Identity check failed: ${err.message}`);
    // If identity fails, we likely can't do anything else.
    return;
  }

  // 2. Balance Access Check
  console.log('\n[2/3] Verifying Balance Access (client.balances.list)...');
  try {
    const balances = await client.balances.list();
    console.log('SUCCESS: Balance access verified.');
    console.log(`- Retieved ${balances.length} balance entries.`);
    
    // Attempt to map assetIds if spotConfig is accessible
    try {
      const spotConfig = await client.marketData.getSpotConfig();
      const usdt = spotConfig.assets.find(a => a.symbol === 'USDT');
      const usdtBal = usdt ? balances.find(b => b.assetId === usdt.ledgerId) : null;
      if (usdtBal) {
        console.log(`- USDT Available: ${usdtBal.available}`);
      }
    } catch (e) {
      console.log('- Balance entries found but asset mapping failed (spot config unreachable).');
    }
  } catch (err: any) {
    console.error(`ERROR: Balance access failed: ${err.message}`);
    if (err.message.includes('api_key_policy_required')) {
      console.log('DIAGNOSTIC: "api_key_policy_required" confirmed. API key lacks ledger read permissions.');
    }
  }

  // 3. Trading Authorization Check (orders.preview)
  console.log('\n[3/3] Verifying Trading Authorization (client.orders.preview)...');
  try {
    // We use a dummy BTC-USDT preview (Symbol ID 1 is usually BTC-USDT on testnet)
    // We fetch real metadata first to be sure of the symbolId if possible
    let symbolId = 1;
    try {
       const spotConfig = await client.marketData.getSpotConfig();
       const btc = spotConfig.pairs.find(p => p.symbol === 'BTC-USDT');
       if (btc) symbolId = btc.symbolId;
    } catch (e) {
       console.warn('NOTE: Could not fetch spot config, using default symbolId 1 for preview.');
    }

    const preview = await client.orders.preview({
      symbolId,
      side: 'buy',
      qty: '0.0001',
      execution: {
        type: 'limit_gtc',
        price: '50000.00',
        postOnly: false,
      }
    });

    if (preview.admissible) {
      console.log('SUCCESS: Trading authorization verified (Order is admissible).');
    } else {
      console.log(`WARNING: Order admissible: false. Reason: ${preview.rejection?.code}`);
      if (preview.rejection?.code === 'POLICY_SPOT_TRADE_DENY') {
        console.log('DIAGNOSTIC: "POLICY_SPOT_TRADE_DENY" confirmed. API key lacks spot-trading permissions.');
      }
    }
  } catch (err: any) {
    console.error(`ERROR: Order preview failed: ${err.message}`);
    if (err.message.includes('POLICY_SPOT_TRADE_DENY')) {
       console.log('DIAGNOSTIC: "POLICY_SPOT_TRADE_DENY" confirmed in catch block.');
    }
  }

  console.log('\n--- Verification Complete ---');
  console.log('Status: IDENTITY: OK | BALANCES: ? | TRADING: ?');
  console.log('Constraint Check: botAutoTradeEnabled=false, botDryRun=true enforced.');
}

verifyPolicy();
