/**
 * Compare Different Stop Loss Levels
 * Tests Heikin Ashi strategy with various stop loss percentages
 */

import axios from 'axios';
import { calculateHeikinAshiSignals } from './src/heikin-ashi-strategy.js';

/**
 * Fetch historical candles from Binance
 */
async function fetchCandles(symbol = 'BTCUSDT', interval = '1h', limit = 1000) {
  const response = await axios.get('https://api.binance.com/api/v3/klines', {
    params: { symbol, interval, limit }
  });

  return response.data.map(k => ({
    timestamp: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5])
  }));
}

/**
 * Simulate paper trading with configurable stop loss
 */
function simulatePaperTrading(candles, signals, stopLossPercent) {
  const useStopLoss = stopLossPercent > 0;
  let balance = 10000;
  const initialBalance = balance;
  let position = null;
  const trades = [];
  let wins = 0;
  let losses = 0;
  let stopLossHits = 0;

  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    const candle = candles[i];
    const price = candle.close;

    // Check stop loss
    if (position && useStopLoss) {
      const currentPnlPercent =
        ((price - position.entryPrice) / position.entryPrice) * 100;

      if (position.side === 'BUY' && currentPnlPercent <= -stopLossPercent * 100) {
        const exitValue = position.quantity * price;
        const pnl = exitValue - position.positionSize;

        balance += exitValue;
        stopLossHits++;

        trades.push({
          pnl,
          closeReason: 'STOP_LOSS'
        });

        losses++;
        position = null;
        continue;
      }
    }

    if (!signal || !signal.signal) continue;

    if (signal.signal === 'BUY' && !position) {
      const positionSize = balance * 0.95;
      const quantity = positionSize / price;
      const stopLoss = price * (1 - stopLossPercent);

      position = {
        side: 'BUY',
        entryPrice: price,
        quantity,
        positionSize,
        stopLoss
      };

      balance -= positionSize;
    } else if (signal.signal === 'SELL' && position && position.side === 'BUY') {
      const exitValue = position.quantity * price;
      const pnl = exitValue - position.positionSize;

      balance += exitValue;

      trades.push({
        pnl,
        closeReason: 'SIGNAL'
      });

      if (pnl > 0) wins++;
      else losses++;

      position = null;
    }
  }

  // Close open position
  if (position) {
    const lastPrice = candles[candles.length - 1].close;
    const exitValue = position.quantity * lastPrice;
    const pnl = exitValue - position.positionSize;

    balance += exitValue;

    trades.push({ pnl, closeReason: 'END_OF_TEST' });

    if (pnl > 0) wins++;
    else losses++;
  }

  const totalReturn = balance - initialBalance;
  const totalReturnPercent = (totalReturn / initialBalance) * 100;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

  return {
    finalBalance: balance,
    totalReturn,
    totalReturnPercent,
    totalTrades: trades.length,
    wins,
    losses,
    winRate,
    stopLossHits,
    maxDrawdown: Math.min(...trades.map(t => t.pnl))
  };
}

/**
 * Main comparison function
 */
async function runComparison() {
  console.log('=== Stop Loss Comparison - Heikin Ashi Strategy ===\n');

  // Fetch data
  console.log('Fetching 1000 1h candles for BTCUSDT...');
  const candles = await fetchCandles('BTCUSDT', '1h', 1000);
  console.log(`✓ Fetched ${candles.length} candles\n`);

  // Calculate signals
  console.log('Calculating Heikin Ashi signals...');
  const signals = [];
  for (let i = 330; i < candles.length; i++) {
    const slice = candles.slice(0, i + 1);
    const signal = calculateHeikinAshiSignals(slice);
    signals.push(signal);
  }
  console.log(`✓ Calculated ${signals.length} data points\n`);

  const candlesForTrading = candles.slice(330);

  // Test different stop loss levels
  const stopLossLevels = [
    0, // No stop loss
    0.005, // 0.5%
    0.01, // 1%
    0.015, // 1.5%
    0.02, // 2%
    0.025, // 2.5%
    0.03, // 3%
    0.04, // 4%
    0.05 // 5%
  ];

  console.log('Testing different stop loss levels...\n');
  console.log('─'.repeat(110));
  console.log(
    '│ Stop Loss │ Final Balance │ Return    │ Trades │ Win Rate │ SL Hits │ Max DD    │'
  );
  console.log('─'.repeat(110));

  const results = [];

  for (const sl of stopLossLevels) {
    const result = simulatePaperTrading(candlesForTrading, signals, sl);

    const slText = sl === 0 ? 'NONE' : `${(sl * 100).toFixed(1)}%`;
    const balanceText = `${result.finalBalance.toFixed(2)} USDT`;
    const returnText = `${result.totalReturn >= 0 ? '+' : ''}${result.totalReturn.toFixed(2)} (${result.totalReturn >= 0 ? '+' : ''}${result.totalReturnPercent.toFixed(2)}%)`;
    const tradesText = `${result.totalTrades}`;
    const winRateText = `${result.winRate.toFixed(1)}%`;
    const slHitsText = `${result.stopLossHits}`;
    const maxDDText = `${result.maxDrawdown.toFixed(2)}`;

    console.log(
      `│ ${slText.padEnd(9)} │ ${balanceText.padEnd(13)} │ ${returnText.padEnd(9)} │ ${tradesText.padEnd(6)} │ ${winRateText.padEnd(8)} │ ${slHitsText.padEnd(7)} │ ${maxDDText.padEnd(9)} │`
    );

    results.push({
      stopLoss: sl,
      ...result
    });
  }

  console.log('─'.repeat(110));

  // Find best result
  const bestByReturn = results.reduce((best, curr) =>
    curr.totalReturn > best.totalReturn ? curr : best
  );
  const bestByWinRate = results.reduce((best, curr) =>
    curr.winRate > best.winRate ? curr : best
  );
  const bestByDrawdown = results.reduce((best, curr) =>
    curr.maxDrawdown > best.maxDrawdown ? curr : best
  );

  console.log('\n=== ANALYSIS ===\n');
  console.log(
    `Best Return:      ${bestByReturn.stopLoss === 0 ? 'NO SL' : (bestByReturn.stopLoss * 100).toFixed(1) + '%'} SL - ${bestByReturn.totalReturn >= 0 ? '+' : ''}${bestByReturn.totalReturn.toFixed(2)} USDT (${bestByReturn.totalReturn >= 0 ? '+' : ''}${bestByReturn.totalReturnPercent.toFixed(2)}%)`
  );
  console.log(
    `Best Win Rate:    ${bestByWinRate.stopLoss === 0 ? 'NO SL' : (bestByWinRate.stopLoss * 100).toFixed(1) + '%'} SL - ${bestByWinRate.winRate.toFixed(1)}% (${bestByWinRate.wins}/${bestByWinRate.totalTrades})`
  );
  console.log(
    `Smallest Drawdown: ${bestByDrawdown.stopLoss === 0 ? 'NO SL' : (bestByDrawdown.stopLoss * 100).toFixed(1) + '%'} SL - ${bestByDrawdown.maxDrawdown.toFixed(2)} USDT`
  );

  console.log('\n=== RECOMMENDATIONS ===\n');

  if (bestByReturn.stopLoss === 0) {
    console.log('⚠️  No stop loss performed best for returns.');
    console.log(
      '   However, this is risky. Consider using at least 2-3% SL for risk management.'
    );
  } else {
    console.log(
      `✓ Optimal Stop Loss: ${(bestByReturn.stopLoss * 100).toFixed(1)}%`
    );
    console.log(`  - Maximizes returns`);
    console.log(`  - ${bestByReturn.stopLossHits} stop loss hits`);
    console.log(`  - Win rate: ${bestByReturn.winRate.toFixed(1)}%`);
  }

  console.log('\n=== Test Completed ===');
}

// Run comparison
runComparison()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Comparison failed:', error);
    process.exit(1);
  });
