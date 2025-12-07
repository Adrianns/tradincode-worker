/**
 * Compare All Indicators
 * Tests all indicators against historical data and compares performance
 */

import axios from 'axios';
import {
  calculateHeikinAshiSignals,
  calculateTLSignals,
  calculateKoncordeSignals,
  calculateLupownSignals,
  detectWhales,
  detectDivergences,
  detectOrderBlocks
} from './src/indicators/index.js';
import { calculateConvergentSignal } from './src/strategies/convergent-signals.js';

/**
 * Fetch historical candles from Binance
 */
async function fetchCandles(symbol = 'BTCUSDT', interval = '1d', limit = 500) {
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
 * Simulate paper trading with a specific indicator
 */
function simulatePaperTrading(candles, signals, config = {}) {
  const { stopLossPercent = 0.005, positionSize = 0.95, name = 'Strategy' } = config;

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
    if (position && stopLossPercent > 0) {
      const currentPnlPercent = ((price - position.entryPrice) / position.entryPrice) * 100;

      if (position.side === 'BUY' && currentPnlPercent <= -stopLossPercent * 100) {
        const exitValue = position.quantity * price;
        const pnl = exitValue - position.positionSize;

        balance += exitValue;
        stopLossHits++;
        trades.push({ pnl, closeReason: 'STOP_LOSS' });
        losses++;
        position = null;
        continue;
      }
    }

    if (!signal || !signal.signal) continue;

    if (signal.signal === 'BUY' && !position) {
      const posSize = balance * positionSize;
      const quantity = posSize / price;

      position = {
        side: 'BUY',
        entryPrice: price,
        quantity,
        positionSize: posSize,
        stopLoss: price * (1 - stopLossPercent)
      };

      balance -= posSize;
    } else if (signal.signal === 'SELL' && position && position.side === 'BUY') {
      const exitValue = position.quantity * price;
      const pnl = exitValue - position.positionSize;

      balance += exitValue;
      trades.push({ pnl, closeReason: 'SIGNAL' });

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
  const maxDrawdown = trades.length > 0 ? Math.min(...trades.map(t => t.pnl)) : 0;

  return {
    name,
    finalBalance: balance,
    totalReturn,
    totalReturnPercent,
    totalTrades: trades.length,
    wins,
    losses,
    winRate,
    stopLossHits,
    maxDrawdown
  };
}

/**
 * Test a single indicator
 */
async function testIndicator(candles, indicatorName, calculateFunction, config = {}) {
  console.log(`\nTesting ${indicatorName}...`);

  const signals = [];
  const minCandles = config.minCandles || 330;

  // Calculate signals for each candle
  for (let i = minCandles; i < candles.length; i++) {
    const slice = candles.slice(0, i + 1);
    const signal = await calculateFunction(slice, config);
    signals.push(signal);
  }

  const candlesForTrading = candles.slice(minCandles);

  // Count signals
  const buyCount = signals.filter(s => s && s.signal === 'BUY').length;
  const sellCount = signals.filter(s => s && s.signal === 'SELL').length;

  console.log(`  Signals: ${buyCount} BUY, ${sellCount} SELL`);

  // Simulate trading
  const results = simulatePaperTrading(candlesForTrading, signals, {
    stopLossPercent: 0.005,
    name: indicatorName
  });

  return results;
}

/**
 * Main comparison function
 */
async function runComparison() {
  console.log('=== INDICATOR COMPARISON - All Strategies ===\n');

  // Fetch data
  console.log('Fetching 500 daily candles for BTCUSDT...');
  const candles = await fetchCandles('BTCUSDT', '1d', 500);
  console.log(`✓ Fetched ${candles.length} candles`);

  const results = [];

  // Test each indicator
  try {
    // 1. Heikin Ashi
    const heikinResult = await testIndicator(candles, 'Heikin Ashi', calculateHeikinAshiSignals, {
      minCandles: 330
    });
    results.push(heikinResult);

    // 2. TL Signals
    const tlResult = await testIndicator(candles, 'TL Signals', calculateTLSignals, {
      minCandles: 50
    });
    results.push(tlResult);

    // 3. Koncorde
    const koncordeResult = await testIndicator(candles, 'Koncorde', calculateKoncordeSignals, {
      minCandles: 260
    });
    results.push(koncordeResult);

    // 4. Lupown
    const lupownResult = await testIndicator(candles, 'Lupown', calculateLupownSignals, {
      minCandles: 60
    });
    results.push(lupownResult);

    // 5. Whale Detector
    const whaleResult = await testIndicator(candles, 'Whale Detector', detectWhales, {
      minCandles: 30
    });
    results.push(whaleResult);

    // 6. Divergences
    const divResult = await testIndicator(candles, 'Divergences', detectDivergences, {
      minCandles: 80
    });
    results.push(divResult);

    // 7. Order Blocks
    const obResult = await testIndicator(candles, 'Order Blocks', detectOrderBlocks, {
      minCandles: 50
    });
    results.push(obResult);

    // 8. Convergent (2 of N)
    console.log('\nTesting Convergent Strategy (2 of 7)...');
    const convergentSignals = [];
    for (let i = 330; i < candles.length; i++) {
      const slice = candles.slice(0, i + 1);
      const signal = await calculateConvergentSignal(slice, {
        requiredConvergence: 2,
        useWeights: true
      });
      convergentSignals.push(signal);
    }
    const convergentResult = simulatePaperTrading(
      candles.slice(330),
      convergentSignals,
      {
        stopLossPercent: 0.005,
        name: 'Convergent (2/7)'
      }
    );
    results.push(convergentResult);

    // Display results
    console.log('\n' + '='.repeat(120));
    console.log('=== RESULTS ===\n');
    console.log('─'.repeat(120));
    console.log(
      '│ Indicator         │ Return       │ Trades │ Win Rate │ SL Hits │ Max DD    │ Final Balance │'
    );
    console.log('─'.repeat(120));

    for (const result of results) {
      const name = result.name.padEnd(17);
      const returnText = `${result.totalReturn >= 0 ? '+' : ''}${result.totalReturn.toFixed(2)} (${result.totalReturn >= 0 ? '+' : ''}${result.totalReturnPercent.toFixed(2)}%)`.padEnd(12);
      const trades = result.totalTrades.toString().padEnd(6);
      const winRate = `${result.winRate.toFixed(1)}%`.padEnd(8);
      const slHits = result.stopLossHits.toString().padEnd(7);
      const maxDD = result.maxDrawdown.toFixed(2).padEnd(9);
      const balance = `${result.finalBalance.toFixed(2)} USDT`.padEnd(13);

      console.log(
        `│ ${name} │ ${returnText} │ ${trades} │ ${winRate} │ ${slHits} │ ${maxDD} │ ${balance} │`
      );
    }
    console.log('─'.repeat(120));

    // Find best strategies
    const bestByReturn = results.reduce((best, curr) =>
      curr.totalReturn > best.totalReturn ? curr : best
    );
    const bestByWinRate = results.reduce((best, curr) =>
      curr.winRate > best.winRate ? curr : best
    );
    const bestByTrades = results.reduce((best, curr) =>
      curr.totalTrades > best.totalTrades ? curr : best
    );

    console.log('\n=== ANALYSIS ===\n');
    console.log(`Best Return:      ${bestByReturn.name} - ${bestByReturn.totalReturn >= 0 ? '+' : ''}${bestByReturn.totalReturn.toFixed(2)} USDT (${bestByReturn.totalReturn >= 0 ? '+' : ''}${bestByReturn.totalReturnPercent.toFixed(2)}%)`);
    console.log(`Best Win Rate:    ${bestByWinRate.name} - ${bestByWinRate.winRate.toFixed(1)}% (${bestByWinRate.wins}/${bestByWinRate.totalTrades})`);
    console.log(`Most Active:      ${bestByTrades.name} - ${bestByTrades.totalTrades} trades`);

    console.log('\n=== RECOMMENDATIONS ===\n');

    if (bestByReturn.name === 'Convergent (2/7)') {
      console.log('✓ Convergent strategy performs best!');
      console.log('  Using multiple indicators reduces false signals.');
      console.log('  Recommended: Use convergent strategy with 2-3 required confirmations.');
    } else {
      console.log(`✓ Best single indicator: ${bestByReturn.name}`);
      console.log('  Consider using this as primary strategy.');
      console.log('  Add convergent signals for confirmation on high-risk trades.');
    }

    console.log('\n=== Test Configuration ===');
    console.log(`Symbol: BTCUSDT`);
    console.log(`Timeframe: 1 day`);
    console.log(`Period: ${candles.length} candles`);
    console.log(`Stop Loss: 0.5%`);
    console.log(`Position Size: 95%`);
    console.log(`Initial Balance: 10,000 USDT`);

    console.log('\n=== Test Completed ===');
  } catch (error) {
    console.error('\n✗ Comparison failed:', error);
    throw error;
  }
}

// Run comparison
runComparison()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
