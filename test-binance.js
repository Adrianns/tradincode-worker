import { getMarketData } from './src/binance.js';
import { calculateAllIndicators } from './src/indicators.js';
import { calculateScore } from './src/scoring.js';

/**
 * Test script to verify Binance API integration and indicator calculations
 */
async function test() {
  console.log('🧪 Testing Binance API and Indicators...\n');

  try {
    // Test 1: Fetch market data
    console.log('1️⃣ Fetching market data from Binance...');
    const marketData = await getMarketData();
    console.log(`✓ Current BTC price: $${marketData.currentPrice.toLocaleString()}`);
    console.log(`✓ 24h volume: ${marketData.volume24h.toLocaleString()} BTC`);
    console.log(`✓ Daily klines: ${marketData.dailyKlines.length} candles`);
    console.log(`✓ Weekly klines: ${marketData.weeklyKlines.length} candles\n`);

    // Test 2: Calculate indicators
    console.log('2️⃣ Calculating technical indicators...');
    const indicators = calculateAllIndicators(marketData);
    console.log(`✓ MA50: $${indicators.ma50?.toLocaleString() || 'N/A'}`);
    console.log(`✓ MA200: $${indicators.ma200?.toLocaleString() || 'N/A'}`);
    console.log(`✓ RSI Weekly: ${indicators.rsiWeekly?.toFixed(2) || 'N/A'}`);
    console.log(`✓ MACD Weekly: ${indicators.macdWeekly?.toFixed(2) || 'N/A'}`);
    console.log(`✓ MACD Signal: ${indicators.macdSignal?.toFixed(2) || 'N/A'}`);
    console.log(`✓ BB Upper: $${indicators.bbUpper?.toLocaleString() || 'N/A'}`);
    console.log(`✓ BB Middle: $${indicators.bbMiddle?.toLocaleString() || 'N/A'}`);
    console.log(`✓ BB Lower: $${indicators.bbLower?.toLocaleString() || 'N/A'}`);
    console.log(`✓ Volume increasing: ${indicators.volumeIncreasing ? 'Yes ↑' : 'No ↓'}`);
    console.log(`✓ Volume change: ${indicators.volumeChangePercent?.toFixed(2)}%\n`);

    // Test 3: Calculate score
    console.log('3️⃣ Calculating investment score...');
    const { score, details } = calculateScore(indicators);
    console.log(`✓ Score: ${score}/100\n`);
    console.log('Score breakdown:');
    Object.entries(details).forEach(([key, value]) => {
      console.log(`  - ${key}: ${value}`);
    });

    console.log('\n✅ All tests passed!\n');

  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error);
    process.exit(1);
  }
}

test();
