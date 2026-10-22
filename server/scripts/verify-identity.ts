/**
 * Standalone Identity Verification Script
 * Run with: npx tsx server/scripts/verify-identity.ts
 */

import { performIdentityCheck } from '../identityHelper.js';

async function main() {
  console.log('--- POLYESTER TITAN AI: IDENTITY VERIFICATION ---');
  console.log('Initiating read-only identity probe via official SDK...');
  
  const result = await performIdentityCheck();
  
  if (result.success) {
    console.log('\n✅ VERIFICATION SUCCESSFUL');
    console.log(`Account ID: ${result.accountId}`);
    console.log(`Username: ${result.username}`);
    console.log(`Verified At: ${result.timestamp}`);
  } else {
    console.log('\n❌ VERIFICATION FAILED');
    console.log(`Error: ${result.error}`);
    console.log(`Diagnostic: ${result.redactedDetails}`);
  }
  
  console.log('\n------------------------------------------------');
}

main().catch(console.error);
