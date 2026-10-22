/**
 * POLYESTER TITAN AI - SDK Capability Inspector
 * Inspects the official Polyester SDK client to determine supported order operations.
 */

import { getSDKClient } from '../polyesterClient.js';

async function main() {
  console.log('--- POLYESTER TITAN AI: SDK CAPABILITY INSPECTION ---');
  
  const client = getSDKClient();
  if (!client) {
    console.error('❌ Failed to initialize SDK client. Check credentials.');
    process.exit(1);
  }

  console.log('Client initialized successfully.');
  
  // Inspect top-level properties
  const rootKeys = Object.keys(client);
  console.log('\nRoot properties:', rootKeys);

  // Inspect 'auth'
  if (client.auth) {
    console.log('\nAuth methods:', Object.keys(Object.getPrototypeOf(client.auth)));
  }

  // Inspect potential order service
  const orderServices = ['orders', 'trading', 'spot', 'futures', 'auth', 'balances'];
  for (const service of orderServices) {
    const serviceObj = (client as any)[service];
    if (serviceObj) {
      console.log(`\n'${service}' service found!`);
      let proto = Object.getPrototypeOf(serviceObj);
      let allMethods: string[] = [];
      while (proto && proto !== Object.prototype) {
        allMethods = allMethods.concat(Object.getOwnPropertyNames(proto));
        proto = Object.getPrototypeOf(proto);
      }
      console.log(`Methods in '${service}':`, allMethods.filter(m => m !== 'constructor'));
    }
  }

  console.log('\n-----------------------------------------------------');
}

main().catch(console.error);
