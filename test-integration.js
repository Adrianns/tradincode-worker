/**
 * Integration test for all indicators
 * Tests indicator calculation with real Binance data
 */

import dotenv from 'dotenv';
import { getMarketData } from './src/binance.js';
import { calculateAllSignals } from './src/indicators/index.js';
import { savePaperSignal } from './src/paper-trading-db.js';
import { initDatabase } from './src/database.js';

dotenv.config();

async function testIntegration() {
  console.log('\n=== INTEGRATION TEST: All Indicators ===\n');

  try {
    // Initialize database
    console.log('1. Initializing database...');
    initDatabase();
    console.log('✓ Database connected\n');

    // Fetch market data
    console.log('2. Fetching market data from Binance...');
    const marketData = await getMarketData();
    console.log(`✓ Current BTC price: $${marketData.currentPrice.toLocaleString()}`);
    console.log(`✓ Fetched ${marketData.dailyKlines.length} daily candles\n`);

    // Convert to indicator format
    console.log('3. Converting candles for indicators...');
    const candles = marketData.dailyKlines.map(k => ({
      timestamp: k.openTime,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume
    }));
    console.log(`✓ Prepared ${candles.length} candles\n`);

    // Calculate all indicators
    console.log('4. Calculating all indicator signals...');
    const allSignals = await calculateAllSignals(candles, {
      useHeikinAshi: true,
      useTLSignals: true,
      useKoncorde: true,
      useLupown: true,
      useWhaleDetector: true,
      useDivergences: true,
      useOrderBlocks: true
    });
    console.log('✓ All signals calculated\n');

    // Display results
    console.log('5. Signal Results:\n');
    console.log('─'.repeat(60));

    const indicators = [
      { key: 'heikinAshi', name: 'Heikin Ashi' },
      { key: 'tlSignals', name: 'TL Signals' },
      { key: 'koncorde', name: 'Koncorde' },
      { key: 'lupown', name: 'Lupown' },
      { key: 'whales', name: 'Whale Detector' },
      { key: 'divergences', name: 'Divergences' },
      { key: 'orderBlocks', name: 'Order Blocks' }
    ];

    let buyCount = 0;
    let sellCount = 0;

    for (const { key, name } of indicators) {
      const signalData = allSignals[key];

      if (signalData) {
        const signal = signalData.signal || 'NONE';
        const icon = signal === 'BUY' ? '🟢' : signal === 'SELL' ? '🔴' : '⚪';

        console.log(`${icon} ${name.padEnd(20)} : ${signal}`);

        if (signal === 'BUY') buyCount++;
        if (signal === 'SELL') sellCount++;
      } else {
        console.log(`⚪ ${name.padEnd(20)} : ERROR (no data)`);
      }
    }

    console.log('─'.repeat(60));
    console.log(`\nSummary: ${buyCount} BUY signals, ${sellCount} SELL signals\n`);

    // Test saving to database
    console.log('6. Testing database save...');
    const timestamp = Date.now();
    const symbol = 'BTCUSDT';
    const price = marketData.currentPrice;

    let savedCount = 0;
    for (const { key, name } of indicators) {
      const signalData = allSignals[key];

      if (signalData) {
        try {
          await savePaperSignal({
            timestamp,
            symbol,
            indicator: name,
            signal: signalData.signal || null,
            price,
            metadata: signalData
          });
          savedCount++;
        } catch (error) {
          console.error(`✗ Failed to save ${name}:`, error.message);
        }
      }
    }

    console.log(`✓ Saved ${savedCount}/${indicators.length} signals to database\n`);

    console.log('=== TEST COMPLETED SUCCESSFULLY ===\n');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ TEST FAILED:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

testIntegration();
