/**
 * Phase 21B Audit Script
 * Fetches live market metadata and proposes a single testnet order.
 */

import { getSDKClient } from '../polyesterClient.js';
import { addLog } from '../logger.js';

async function runAudit() {
  const client = getSDKClient();
  if (!client) {
    console.error('FAILED: SDK client not initialized. Check .env credentials.');
    return;
  }

  console.log('--- Phase 21B: Live Testnet Audit ---');

  try {
    // 1. Fetch Spot Config (Metadata)
    console.log('Fetching live spot market catalog...');
    const spotConfig = await client.marketData.getSpotConfig();
    
    // 2. Identify BTC market
    // We prefer BTC-USDT or BTC-USDC for this test.
    const btcPair = spotConfig.pairs.find(p => 
      (p.symbol === 'BTC-USDT' || p.symbol === 'BTC-USDC') && p.status === 'enabled'
    );

    if (!btcPair) {
      console.error('FAILED: No enabled BTC spot market found (tried BTC-USDT, BTC-USDC).');
      console.log('Available pairs:', spotConfig.pairs.filter(p => p.status === 'enabled').map(p => p.symbol).join(', '));
      return;
    }

    console.log(`Verified Market: ${btcPair.symbol} (ID: ${btcPair.symbolId})`);
    console.log(`- Status: ${btcPair.status}`);
    console.log(`- Tick Size: ${btcPair.tickSize}`);
    console.log(`- Step Size: ${btcPair.stepSize}`);
    console.log(`- Min Qty: ${btcPair.minQtyBase} ${btcPair.baseAsset}`);
    console.log(`- Min Notional: ${btcPair.minNotionalQuote} ${btcPair.quoteAsset}`);

    // 3. Fetch Market Data (Prices)
    console.log('Fetching current market data...');
    const overviewRes = await client.marketOverview.list({ symbolIds: [btcPair.symbolId] });
    const btcStats = overviewRes.markets.find(m => m.symbolId === btcPair.symbolId);

    if (!btcStats || !btcStats.lastPrice) {
      console.error('FAILED: Could not fetch last price for BTC.');
      return;
    }

    const lastPrice = parseFloat(btcStats.lastPrice);
    console.log(`- Last Price: ${lastPrice} ${btcPair.quoteAsset}`);
    
    // 4. Check Account Permissions & Balance
    console.log('Checking account state...');
    try {
      const balances = await client.balances.list();
      const quoteAsset = spotConfig.assets.find(a => a.symbol === btcPair.quoteAsset);
      const quoteBalance = quoteAsset ? balances.find(b => b.assetId === quoteAsset.ledgerId) : null;
      console.log(`- Account ID: ${client.auth.me ? (await client.auth.me()).accountId : 'unknown'}`);
      console.log(`- ${btcPair.quoteAsset} Balance: ${quoteBalance ? quoteBalance.available : 0}`);
    } catch (err: any) {
      console.warn(`WARNING: Could not fetch balances: ${err.message}`);
    }

    // 5. Propose Order Parameters
    // Price: 5% below market
    const tickSize = parseFloat(btcPair.tickSize);
    const proposedPrice = Math.floor((lastPrice * 0.95) / tickSize) * tickSize;
    
    // User wants max 1 USDC equivalent. 
    // BUT min notional is 5 USDT.
    console.log(`\nChecking constraints for 1 ${btcPair.quoteAsset} target:`);
    const targetNotional = 1.0;
    const stepSize = parseFloat(btcPair.stepSize);
    const targetQty = Math.ceil((targetNotional / proposedPrice) / stepSize) * stepSize;
    
    console.log(`- Target Notional: ${targetNotional}`);
    console.log(`- Min Notional required by market: ${btcPair.minNotionalQuote}`);
    
    if (targetNotional < parseFloat(btcPair.minNotionalQuote)) {
      console.log('BLOCKER: Proposed 1 USDC notional is below market minimum of 5 USDT.');
    }

    // Propose an order that at least meets the minimums for the sake of the preview test
    const minQty = parseFloat(btcPair.minQtyBase);
    const minNotional = parseFloat(btcPair.minNotionalQuote);
    
    let proposedQty = Math.ceil((minNotional / proposedPrice) / stepSize) * stepSize;
    if (proposedQty < minQty) proposedQty = minQty;
    const finalNotional = proposedPrice * proposedQty;

    console.log('\n--- Proposed Test Order (Adjusted to meet Market Minimums) ---');
    console.log(`- Symbol: ${btcPair.symbol}`);
    console.log(`- Side: buy`);
    console.log(`- Type: limit`);
    console.log(`- Price: ${proposedPrice.toFixed(8)}`);
    console.log(`- Quantity: ${proposedQty.toFixed(8)}`);
    console.log(`- Notional: ${finalNotional.toFixed(4)} ${btcPair.quoteAsset}`);

    // 6. Preview Order
    console.log('\nExecuting orders.preview()...');
    try {
      const preview = await client.orders.preview({
        symbolId: btcPair.symbolId,
        side: 'buy',
        qty: proposedQty.toFixed(8),
        execution: {
          type: 'limit_gtc',
          price: proposedPrice.toFixed(8),
          postOnly: false,
        }
      });
      console.log('Preview Result: SUCCESS');
      console.log(JSON.stringify(preview, null, 2));
    } catch (err: any) {
      console.error(`FAILED: orders.preview() rejected: ${err.message}`);
    }

  } catch (err: any) {
    console.error(`AUDIT FAILED: ${err.message}`);
  }
}

runAudit();
