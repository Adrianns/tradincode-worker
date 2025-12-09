/**
 * Multi-Account Trading
 * Executes trading for multiple accounts in parallel
 */

import {
  getActiveAccounts,
  updateAccountBalance,
  updateAccountMetrics,
  saveAccountSnapshot,
  getAccountActivePosition
} from './account-manager.js';
import { createStrategy } from './strategy-factory.js';
import { calculateAllSignals } from './indicators/index.js';
import { initDatabase } from './database.js';
import { getKlines, getCurrentPrice } from './binance.js';

const pool = initDatabase();

/**
 * Execute trading for all active accounts in parallel
 * Each account can operate on its own timeframe
 */
export async function executeMultiAccountTrading(marketData) {
  console.log('\n💼 Executing multi-account paper trading...');

  try {
    // Get all active accounts
    const accounts = await getActiveAccounts();

    if (accounts.length === 0) {
      console.log('No active accounts found');
      return [];
    }

    console.log(`Found ${accounts.length} active account(s)`);

    // Group accounts by timeframe to optimize data fetching
    const accountsByTimeframe = {};
    for (const account of accounts) {
      const tf = account.timeframe || '1d';
      if (!accountsByTimeframe[tf]) {
        accountsByTimeframe[tf] = [];
      }
      accountsByTimeframe[tf].push(account);
    }

    console.log(`Accounts grouped by timeframe: ${Object.keys(accountsByTimeframe).join(', ')}`);

    // Fetch market data and calculate signals for each timeframe
    const signalsByTimeframe = {};
    for (const [timeframe, tfAccounts] of Object.entries(accountsByTimeframe)) {
      console.log(`\nFetching ${timeframe} candles for ${tfAccounts.length} account(s)...`);

      // Fetch candles for this timeframe
      const klines = await getKlines(timeframe, 500);
      const candles = klines.map(k => ({
        timestamp: k.timestamp,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume
      }));

      console.log(`Calculating signals for ${timeframe}...`);
      signalsByTimeframe[timeframe] = await calculateAllSignals(candles, {
        useHeikinAshi: true,
        useTLSignals: true,
        useKoncorde: true,
        useLupown: true,
        useWhaleDetector: true,
        useDivergences: true,
        useOrderBlocks: true
      });
      console.log(`✓ Signals calculated for ${timeframe}`);
    }

    // Get current price
    const currentPrice = await getCurrentPrice();

    // Execute each account in parallel
    const results = await Promise.all(
      accounts.map(account =>
        executeAccountTrading(
          account,
          { currentPrice },
          signalsByTimeframe[account.timeframe || '1d']
        )
      )
    );

    // Save snapshots for all accounts
    console.log('\nSaving account snapshots...');
    await Promise.all(
      accounts.map(account =>
        saveAccountSnapshot(account.id, currentPrice)
      )
    );
    console.log('✓ Snapshots saved');

    console.log('✓ Multi-account trading execution completed\n');

    return results;
  } catch (error) {
    console.error('✗ Error in multi-account trading:', error);
    throw error;
  }
}

/**
 * Execute trading for a single account
 */
async function executeAccountTrading(account, marketData, allIndicatorSignals) {
  console.log(`\n  [${account.account_name}] Strategy: ${account.strategy}`);

  try {
    // Create strategy instance
    const strategy = createStrategy(account);

    // Calculate strategy signals
    const signals = await strategy.calculateSignals(marketData, allIndicatorSignals);

    // Get active position for this account
    const activePosition = await getAccountActivePosition(account.id);

    // Check if should buy or sell
    const shouldBuy = await strategy.shouldBuy(marketData, signals, activePosition);
    const shouldSell = await strategy.shouldSell(marketData, signals, activePosition);

    let action = null;
    let trade = null;

    if (shouldSell && activePosition) {
      // Execute SELL
      trade = await executeAccountSell(account, marketData, activePosition, signals);
      action = 'sell';
      console.log(`  ✓ SELL executed at $${marketData.currentPrice.toFixed(2)}`);
    } else if (shouldBuy && !activePosition) {
      // Execute BUY
      trade = await executeAccountBuy(account, marketData, signals);
      action = 'buy';
      console.log(`  ✓ BUY executed at $${marketData.currentPrice.toFixed(2)}`);
    } else {
      console.log(`  - No action (${activePosition ? 'holding position' : 'waiting for signal'})`);
    }

    return {
      account,
      action,
      trade,
      signals
    };

  } catch (error) {
    console.error(`  ✗ Error executing account ${account.account_name}:`, error.message);
    return {
      account,
      error: error.message
    };
  }
}

/**
 * Execute BUY for account
 */
async function executeAccountBuy(account, marketData, signals) {
  const price = marketData.currentPrice;
  const posSize = account.balance_usd * account.position_size_percent;
  const btcAmount = posSize / price;

  const newBalanceUsd = account.balance_usd - posSize;
  const newBalanceBtc = account.balance_btc + btcAmount;

  // Calculate stop loss
  let stopLossPrice = price * (1 - account.stop_loss_percent);

  // For Trend Shield, use ATR-based stop loss if available
  if (account.strategy === 'trend_shield' && signals.atr14) {
    const atrMultiplier = 1.5;
    stopLossPrice = price - (signals.atr14 * atrMultiplier);
  }

  // Save trade
  const trade = await saveAccountTrade({
    account_id: account.id,
    trade_type: 'buy',
    btc_price: price,
    btc_amount: btcAmount,
    usd_amount: posSize,
    balance_usd: newBalanceUsd,
    balance_btc: newBalanceBtc,
    stop_loss_price: stopLossPrice,
    reason: `${account.strategy} BUY signal`
  });

  // Update account balance
  await updateAccountBalance(account.id, newBalanceUsd, newBalanceBtc);

  // Refresh account object
  account.balance_usd = newBalanceUsd;
  account.balance_btc = newBalanceBtc;

  return trade;
}

/**
 * Execute SELL for account
 */
async function executeAccountSell(account, marketData, activePosition, signals) {
  const price = marketData.currentPrice;
  const btcAmount = activePosition.btc_amount;
  const usdAmount = btcAmount * price;

  const newBalanceUsd = account.balance_usd + usdAmount;
  const newBalanceBtc = 0;

  // Calculate profit/loss
  const profitLossUsd = usdAmount - activePosition.usd_amount;
  const profitLossPercent = (profitLossUsd / activePosition.usd_amount) * 100;

  // Save trade
  const trade = await saveAccountTrade({
    account_id: account.id,
    trade_type: 'sell',
    btc_price: price,
    btc_amount: btcAmount,
    usd_amount: usdAmount,
    balance_usd: newBalanceUsd,
    balance_btc: newBalanceBtc,
    profit_loss_usd: profitLossUsd,
    profit_loss_percentage: profitLossPercent,
    reason: `${account.strategy} SELL signal`
  });

  // Update account balance
  await updateAccountBalance(account.id, newBalanceUsd, newBalanceBtc);

  // Update account metrics
  await updateAccountMetrics(account.id, {
    total_trades: account.total_trades + 1,
    winning_trades: profitLossUsd > 0 ? account.winning_trades + 1 : account.winning_trades,
    losing_trades: profitLossUsd <= 0 ? account.losing_trades + 1 : account.losing_trades,
    total_profit_loss: account.total_profit_loss + profitLossUsd
  });

  // Refresh account object
  account.balance_usd = newBalanceUsd;
  account.balance_btc = newBalanceBtc;

  return trade;
}

/**
 * Save trade to database
 */
async function saveAccountTrade(data) {
  const {
    account_id,
    trade_type,
    btc_price,
    btc_amount,
    usd_amount,
    balance_usd,
    balance_btc,
    stop_loss_price = null,
    take_profit_price = null,
    profit_loss_usd = null,
    profit_loss_percentage = null,
    reason = ''
  } = data;

  const client = await pool.connect();
  try {
    const result = await client.query(`
      INSERT INTO paper_trades (
        account_id, trade_type, btc_price, btc_amount, usd_amount,
        balance_usd, balance_btc, stop_loss_price, take_profit_price,
        profit_loss_usd, profit_loss_percentage, reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      account_id,
      trade_type,
      btc_price,
      btc_amount,
      usd_amount,
      balance_usd,
      balance_btc,
      stop_loss_price,
      take_profit_price,
      profit_loss_usd,
      profit_loss_percentage,
      reason
    ]);

    return result.rows[0];
  } finally {
    client.release();
  }
}
