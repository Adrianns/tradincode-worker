/**
 * Test Heikin Ashi Strategy
 * Tests the Heikin Ashi buy/sell signals on historical data
 */

import axios from 'axios';
import { calculateHeikinAshiSignals } from './src/heikin-ashi-strategy.js';

/**
 * Fetch historical candles from Binance
 */
async function fetchCandles(symbol = 'BTCUSDT', interval = '1h', limit = 500) {
  console.log(`Fetching ${limit} ${interval} candles for ${symbol}...`);

  try {
    const response = await axios.get('https://api.binance.com/api/v3/klines', {
      params: {
        symbol,
        interval,
        limit
      }
    });

    const candles = response.data.map(k => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));

    console.log(`✓ Fetched ${candles.length} candles\n`);
    return candles;
  } catch (error) {
    console.error('Error fetching candles:', error.message);
    throw error;
  }
}

/**
 * Simulate paper trading based on signals
 */
function simulatePaperTrading(candles, signals, config = {}) {
  const {
    stopLossPercent = 0.02, // 2% stop loss by default
    useStopLoss = true
  } = config;

  let balance = 10000; // Starting balance in USDT
  const initialBalance = balance;
  let position = null;
  const trades = [];
  let wins = 0;
  let losses = 0;
  let stopLossHits = 0;

  console.log('=== Simulating Paper Trading ===\n');
  console.log(`Initial Balance: ${balance.toFixed(2)} USDT`);
  if (useStopLoss) {
    console.log(`Stop Loss: ${(stopLossPercent * 100).toFixed(1)}%\n`);
  } else {
    console.log('Stop Loss: DISABLED\n');
  }

  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    const candle = candles[i];
    const price = candle.close;
    const date = new Date(candle.timestamp).toISOString().substring(0, 16);

    // Check stop loss if position is open
    if (position && useStopLoss) {
      const currentPnlPercent = ((price - position.entryPrice) / position.entryPrice) * 100;

      // For long positions, check if price dropped below stop loss
      if (position.side === 'BUY' && currentPnlPercent <= -stopLossPercent * 100) {
        const exitValue = position.quantity * price;
        const pnl = exitValue - position.positionSize;
        const pnlPercent = (pnl / position.positionSize) * 100;

        balance += exitValue;
        stopLossHits++;

        console.log(`[STOP] ${date} - STOP LOSS HIT`);
        console.log(`       Entry: ${position.entryPrice.toFixed(2)} USDT`);
        console.log(`       Exit: ${price.toFixed(2)} USDT`);
        console.log(`       Stop Loss: ${position.stopLoss.toFixed(2)} USDT`);
        console.log(
          `       P&L: ${pnl.toFixed(2)} USDT (${pnlPercent.toFixed(2)}%)`
        );
        console.log(`       New Balance: ${balance.toFixed(2)} USDT\n`);

        trades.push({
          entry: position.entryPrice,
          exit: price,
          pnl,
          pnlPercent,
          entryDate: position.entryDate,
          exitDate: date,
          closeReason: 'STOP_LOSS'
        });

        if (pnl < 0) losses++;

        position = null;
        continue;
      }
    }

    if (!signal || !signal.signal) continue;

    if (signal.signal === 'BUY' && !position) {
      // Open long position
      const positionSize = balance * 0.95; // Use 95% of balance
      const quantity = positionSize / price;
      const stopLoss = price * (1 - stopLossPercent);

      position = {
        side: 'BUY',
        entryPrice: price,
        quantity,
        positionSize,
        stopLoss,
        entryDate: date
      };

      balance -= positionSize;

      console.log(`[BUY]  ${date}`);
      console.log(`       Price: ${price.toFixed(2)} USDT`);
      console.log(`       Quantity: ${quantity.toFixed(6)} BTC`);
      console.log(`       Position Size: ${positionSize.toFixed(2)} USDT`);
      if (useStopLoss) {
        console.log(`       Stop Loss: ${stopLoss.toFixed(2)} USDT (-${(stopLossPercent * 100).toFixed(1)}%)`);
      }
      console.log();
    } else if (signal.signal === 'SELL' && position && position.side === 'BUY') {
      // Close long position
      const exitValue = position.quantity * price;
      const pnl = exitValue - position.positionSize;
      const pnlPercent = (pnl / position.positionSize) * 100;

      balance += exitValue;

      console.log(`[SELL] ${date}`);
      console.log(`       Entry: ${position.entryPrice.toFixed(2)} USDT`);
      console.log(`       Exit: ${price.toFixed(2)} USDT`);
      console.log(
        `       P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT (${pnl >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`
      );
      console.log(`       New Balance: ${balance.toFixed(2)} USDT\n`);

      trades.push({
        entry: position.entryPrice,
        exit: price,
        pnl,
        pnlPercent,
        entryDate: position.entryDate,
        exitDate: date,
        closeReason: 'SIGNAL'
      });

      if (pnl > 0) wins++;
      else if (pnl < 0) losses++;

      position = null;
    }
  }

  // Close any open position at the end
  if (position) {
    const lastPrice = candles[candles.length - 1].close;
    const exitValue = position.quantity * lastPrice;
    const pnl = exitValue - position.positionSize;
    const pnlPercent = (pnl / position.positionSize) * 100;

    balance += exitValue;

    console.log('[CLOSE] End of backtest - closing position');
    console.log(`        Entry: ${position.entryPrice.toFixed(2)} USDT`);
    console.log(`        Exit: ${lastPrice.toFixed(2)} USDT`);
    console.log(
      `        P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT (${pnl >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)\n`
    );

    trades.push({
      entry: position.entryPrice,
      exit: lastPrice,
      pnl,
      pnlPercent,
      closeReason: 'END_OF_TEST'
    });

    if (pnl > 0) wins++;
    else if (pnl < 0) losses++;
  }

  const totalReturn = balance - initialBalance;
  const totalReturnPercent = (totalReturn / initialBalance) * 100;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  const avgPnl = trades.length > 0 ? trades.reduce((sum, t) => sum + t.pnl, 0) / trades.length : 0;

  // Count trades by close reason
  const signalExits = trades.filter(t => t.closeReason === 'SIGNAL').length;
  const stopLossExits = trades.filter(t => t.closeReason === 'STOP_LOSS').length;

  return {
    initialBalance,
    finalBalance: balance,
    totalReturn,
    totalReturnPercent,
    trades,
    totalTrades: trades.length,
    wins,
    losses,
    winRate,
    avgPnl,
    stopLossHits,
    signalExits,
    stopLossExits
  };
}

/**
 * Main test function
 */
async function runTest() {
  console.log('=== Heikin Ashi Strategy Backte st ===\n');

  try {
    // Fetch historical data
    const candles = await fetchCandles('BTCUSDT', '1h', 1000);

    // Calculate signals for all candles
    console.log('Calculating Heikin Ashi signals...\n');

    const signals = [];
    // Start from candle 330 (minimum required)
    for (let i = 330; i < candles.length; i++) {
      const slice = candles.slice(0, i + 1);
      const signal = calculateHeikinAshiSignals(slice);
      signals.push(signal);
    }

    const buyCount = signals.filter(s => s && s.signal === 'BUY').length;
    const sellCount = signals.filter(s => s && s.signal === 'SELL').length;

    console.log(`✓ Calculated ${signals.length} data points`);
    console.log(`  - BUY signals: ${buyCount}`);
    console.log(`  - SELL signals: ${sellCount}\n`);

    // Show recent signals
    console.log('Recent signals:');
    const recentSignals = signals
      .map((s, i) => ({ signal: s, index: i + 330, candle: candles[i + 330] }))
      .filter(s => s.signal && s.signal.signal)
      .slice(-10);

    recentSignals.forEach(s => {
      const date = new Date(s.candle.timestamp).toISOString().substring(0, 16);
      console.log(
        `  ${s.signal.signal.padEnd(4)} @ ${s.candle.close.toFixed(2)} USDT - ${date}`
      );
    });
    console.log();

    // Simulate paper trading
    const candlesForTrading = candles.slice(330);
    const results = simulatePaperTrading(candlesForTrading, signals);

    // Display results
    console.log('\n=== BACKTEST RESULTS ===\n');
    console.log(`Initial Balance:  ${results.initialBalance.toFixed(2)} USDT`);
    console.log(`Final Balance:    ${results.finalBalance.toFixed(2)} USDT`);
    console.log(
      `Total Return:     ${results.totalReturn >= 0 ? '+' : ''}${results.totalReturn.toFixed(2)} USDT (${results.totalReturn >= 0 ? '+' : ''}${results.totalReturnPercent.toFixed(2)}%)`
    );
    console.log();
    console.log(`Total Trades:     ${results.totalTrades}`);
    console.log(`Winning Trades:   ${results.wins}`);
    console.log(`Losing Trades:    ${results.losses}`);
    console.log(`Win Rate:         ${results.winRate.toFixed(2)}%`);
    console.log(`Average P&L:      ${results.avgPnl.toFixed(2)} USDT`);
    console.log();
    console.log(`Exit Reasons:`);
    console.log(`  Signal Exits:   ${results.signalExits}`);
    console.log(`  Stop Loss Hits: ${results.stopLossExits}`);
    console.log();

    if (results.trades.length > 0) {
      const maxWin = Math.max(...results.trades.map(t => t.pnl));
      const maxLoss = Math.min(...results.trades.map(t => t.pnl));
      const avgWin =
        results.wins > 0
          ? results.trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) /
            results.wins
          : 0;
      const avgLoss =
        results.losses > 0
          ? results.trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0) /
            results.losses
          : 0;

      console.log(`Max Win:          +${maxWin.toFixed(2)} USDT`);
      console.log(`Max Loss:         ${maxLoss.toFixed(2)} USDT`);
      console.log(`Avg Win:          +${avgWin.toFixed(2)} USDT`);
      console.log(`Avg Loss:         ${avgLoss.toFixed(2)} USDT`);
      console.log(
        `Profit Factor:    ${avgLoss !== 0 ? (Math.abs(avgWin) / Math.abs(avgLoss)).toFixed(2) : 'N/A'}`
      );
    }

    console.log('\n=== Test Completed ===');
  } catch (error) {
    console.error('\n✗ Test failed:', error);
    throw error;
  }
}

// Run the test
runTest()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
