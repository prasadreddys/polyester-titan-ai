/**
 * Phase 21F: Order Reconciliation Script
 * Verifies the status and details of a specific exchange order ID.
 */

import { getSDKClient } from '../polyesterClient.js';
import { config } from '../config.js';
import { addLog } from '../logger.js';

async function reconcileOrder(orderId: string) {
  console.log(`--- Phase 21F: Reconciling Order ${orderId} ---\n`);

  const client = getSDKClient();
  if (!client) {
    console.log('FAIL: SDK client not initialized');
    return;
  }

  try {
    console.log(`Step 1: Querying order details for ${orderId}...`);
    const details = await client.orders.getDetails({ orderId });
    
    console.log('DEBUG: Raw order details:', JSON.stringify(details, null, 2));

    if (!details || !details.order) {
      console.log(`FAIL: Order ${orderId} not found on exchange.`);
      return;
    }

    const order = details.order;
    console.log('PASS: Order details retrieved.');
    console.log('-----------------------------------');
    console.log(`ID: ${order.orderId}`);
    console.log(`Status: ${order.status}`);
    console.log(`Symbol ID: ${order.symbolId}`);
    console.log(`Side: ${order.side}`);
    console.log(`Original Qty: ${order.totalQty || 'N/A'}`);
    console.log(`Filled Qty: ${order.cumQty || 0}`);
    console.log(`Average Price: ${order.avgPx || 'N/A'}`);
    
    try {
      if (order.createdTs) {
        console.log(`Created At: ${new Date(Number(order.createdTs)).toISOString()}`);
      }
    } catch (dErr) {
      console.log(`Created Ts: ${order.createdTs} (Raw)`);
    }
    console.log('-----------------------------------');

    // Reconciliation logic
    const closedStates = ['filled', 'canceled', 'rejected', 'expired'];
    const openStates = ['working', 'open', 'partially_filled', 'pending'];
    
    let recStatus = 'UNKNOWN';
    const status = order.status as string;
    if (closedStates.includes(status)) recStatus = 'CLOSED';
    else if (openStates.includes(status)) recStatus = 'OPEN';

    console.log(`Reconciliation Status: ${recStatus}`);
    
    if (status === 'canceled') {
       console.log('Verified: Cancellation confirmed by exchange.');
    } else if (recStatus === 'OPEN') {
       console.log('NOTICE: Order is still OPEN. Per instructions, no automated action taken.');
    }

    // Check balances to see if they match the outcome (optional but good)
    try {
      const balances = await client.balances.list();
      console.log('\nCurrent Balances:');
      balances.forEach(b => {
        if (parseFloat(b.available) > 0) {
          console.log(` - Asset ID ${b.assetId}: Available ${b.available}`);
        }
      });
    } catch (balErr: any) {
      console.log(`Warning: Could not fetch balances for reconciliation (${balErr.message})`);
    }

  } catch (err: any) {
    if (err.message?.includes('timeout') || err.message?.includes('408')) {
      console.log(`FAIL: API Timeout or unknown outcome. Re-query recommended.`);
    } else {
      console.log(`FAIL: Error during reconciliation: ${err.message}`);
    }
  }
}

const targetOrderId = 'XTtTXdFr22a';
reconcileOrder(targetOrderId);
