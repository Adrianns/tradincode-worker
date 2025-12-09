/**
 * Test Account Manager
 * Tests CRUD operations for trading accounts
 */

import dotenv from 'dotenv';
import {
  createAccount,
  getActiveAccounts,
  getAllAccounts,
  getAccountById,
  updateAccount,
  toggleAccount,
  deleteAccount,
  updateAccountBalance,
  saveAccountSnapshot
} from './src/account-manager.js';

dotenv.config();

async function testAccountManager() {
  console.log('\n=== TESTING ACCOUNT MANAGER ===\n');

  try {
    // 1. Create test accounts
    console.log('1. Creating test accounts...');

    const account1 = await createAccount({
      account_name: 'Test Trend Shield',
      strategy: 'trend_shield',
      initial_balance: 1000,
      is_active: true
    });
    console.log(`✓ Created account: ${account1.account_name} (ID: ${account1.id})`);

    const account2 = await createAccount({
      account_name: 'Test Convergent',
      strategy: 'convergent',
      initial_balance: 1500,
      is_active: true,
      required_convergence: 3
    });
    console.log(`✓ Created account: ${account2.account_name} (ID: ${account2.id})`);

    const account3 = await createAccount({
      account_name: 'Test Whale Detector',
      strategy: 'whale_detector',
      initial_balance: 2000,
      is_active: false
    });
    console.log(`✓ Created account: ${account3.account_name} (ID: ${account3.id})`);

    // 2. Get all accounts
    console.log('\n2. Getting all accounts...');
    const allAccounts = await getAllAccounts();
    console.log(`✓ Total accounts: ${allAccounts.length}`);

    // 3. Get active accounts
    console.log('\n3. Getting active accounts...');
    const activeAccounts = await getActiveAccounts();
    console.log(`✓ Active accounts: ${activeAccounts.length}`);
    activeAccounts.forEach(acc => {
      console.log(`   - ${acc.account_name} (${acc.strategy})`);
    });

    // 4. Get account by ID
    console.log('\n4. Getting account by ID...');
    const foundAccount = await getAccountById(account1.id);
    console.log(`✓ Found: ${foundAccount.account_name}`);

    // 5. Update account
    console.log('\n5. Updating account...');
    const updated = await updateAccount(account1.id, {
      stop_loss_percent: 0.01
    });
    console.log(`✓ Updated stop loss to ${updated.stop_loss_percent * 100}%`);

    // 6. Toggle account
    console.log('\n6. Toggling account activation...');
    await toggleAccount(account3.id, true);
    const toggledAccount = await getAccountById(account3.id);
    console.log(`✓ Account ${account3.account_name} is now ${toggledAccount.is_active ? 'active' : 'inactive'}`);

    // 7. Update balance
    console.log('\n7. Updating account balance...');
    await updateAccountBalance(account1.id, 950, 0.001);
    const balanceUpdated = await getAccountById(account1.id);
    console.log(`✓ New balance: $${balanceUpdated.balance_usd} USD + ${balanceUpdated.balance_btc} BTC`);

    // 8. Save snapshot
    console.log('\n8. Saving account snapshot...');
    const btcPrice = 94000;
    const snapshot = await saveAccountSnapshot(account1.id, btcPrice);
    console.log(`✓ Snapshot saved: ROI ${snapshot.roi_percent.toFixed(2)}%`);

    // 9. Delete test accounts
    console.log('\n9. Cleaning up test accounts...');
    await deleteAccount(account1.id);
    console.log(`✓ Deleted: ${account1.account_name}`);

    await deleteAccount(account2.id);
    console.log(`✓ Deleted: ${account2.account_name}`);

    await deleteAccount(account3.id);
    console.log(`✓ Deleted: ${account3.account_name}`);

    // Verify deletion
    const remainingAccounts = await getAllAccounts();
    console.log(`✓ Remaining accounts: ${remainingAccounts.length}`);

    console.log('\n=== ALL TESTS PASSED ===\n');
    process.exit(0);

  } catch (error) {
    console.error('\n✗ TEST FAILED:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

testAccountManager();
