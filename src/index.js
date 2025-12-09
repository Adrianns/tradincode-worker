import cron from 'node-cron';
import dotenv from 'dotenv';
import { getMarketData } from './binance.js';
import { calculateAllIndicators } from './indicators.js';
import { calculateScore, shouldSendAlert } from './scoring.js';
import { initTelegramBot, sendAlert, sendTestMessage, sendPaperTradingBuy, sendPaperTradingSell } from './telegram.js';
import {
  initDatabase,
  saveAnalysis,
  saveAlert,
  getLatestAnalysis,
  saveKlineData
} from './database.js';
import { executePaperTrading } from './paper-trading.js';
import { getPaperConfig, savePaperSignal } from './paper-trading-db.js';
import { calculateAllSignals } from './indicators/index.js';

dotenv.config();

// Configuration
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 */4 * * *'; // Every 4 hours by default
const RUN_ON_START = process.env.RUN_ON_START !== 'false'; // Run immediately on start unless disabled

/**
 * Main analysis function
 */
async function runAnalysis() {
  console.log('\n========================================');
  console.log('Starting Bitcoin analysis...');
  console.log('Timestamp:', new Date().toISOString());
  console.log('========================================\n');

  try {
    // 1. Fetch market data from Binance
    console.log('📊 Fetching market data from Binance...');
    const marketData = await getMarketData();
    console.log(`✓ Current BTC price: $${marketData.currentPrice.toLocaleString()}`);
    console.log(`✓ 24h volume: ${marketData.volume24h.toLocaleString()} BTC`);

    // Save daily klines for historical record
    console.log('\n💾 Saving kline data...');
    for (const kline of marketData.dailyKlines.slice(-30)) {
      await saveKlineData(kline);
    }
    console.log('✓ Kline data saved');

    // 2. Calculate all technical indicators
    console.log('\n📈 Calculating technical indicators...');
    const indicators = calculateAllIndicators(marketData);

    console.log(`✓ MA50: $${indicators.ma50?.toLocaleString() || 'N/A'}`);
    console.log(`✓ MA200: $${indicators.ma200?.toLocaleString() || 'N/A'}`);
    console.log(`✓ RSI Weekly: ${indicators.rsiWeekly?.toFixed(2) || 'N/A'}`);
    console.log(`✓ MACD Weekly: ${indicators.macdWeekly?.toFixed(2) || 'N/A'}`);
    console.log(`✓ Volume trend: ${indicators.volumeIncreasing ? 'Increasing ↑' : 'Decreasing ↓'} (${indicators.volumeChangePercent?.toFixed(2)}%)`);

    // 3. Get previous analysis for comparison
    const previousAnalysis = await getLatestAnalysis();
    const previousScore = previousAnalysis?.score || null;
    const previousIndicators = previousAnalysis ? {
      price: parseFloat(previousAnalysis.price),
      ma50: parseFloat(previousAnalysis.ma_50),
      ma200: parseFloat(previousAnalysis.ma_200),
      rsiWeekly: parseFloat(previousAnalysis.rsi_weekly)
    } : null;

    // 4. Calculate investment score
    console.log('\n🎯 Calculating investment score...');
    const { score, details } = calculateScore(indicators, previousAnalysis);

    console.log(`✓ Score: ${score}/100`);
    console.log('\nScore breakdown:');
    Object.entries(details).forEach(([key, value]) => {
      console.log(`  - ${key}: ${value}`);
    });

    // 5. Save analysis to database
    console.log('\n💾 Saving analysis to database...');
    const analysisData = {
      price: indicators.price,
      ma50: indicators.ma50,
      ma200: indicators.ma200,
      rsiWeekly: indicators.rsiWeekly,
      macdWeekly: indicators.macdWeekly,
      macdSignal: indicators.macdSignal,
      bbUpper: indicators.bbUpper,
      bbMiddle: indicators.bbMiddle,
      bbLower: indicators.bbLower,
      volume24h: marketData.volume24h,
      score: score
    };
    await saveAnalysis(analysisData);
    console.log('✓ Analysis saved');

    // 6. Check if alerts should be sent
    console.log('\n🔔 Checking for alert conditions...');
    const alerts = shouldSendAlert(score, previousScore, indicators, previousIndicators);

    if (alerts.length > 0) {
      console.log(`✓ ${alerts.length} alert(s) detected:`);

      for (const alert of alerts) {
        console.log(`\n  Alert type: ${alert.type}`);
        console.log(`  Severity: ${alert.severity}`);
        console.log(`  Message: ${alert.message}`);

        // Send Telegram alert
        const sent = await sendAlert(alert, score, indicators);

        // Save alert to database
        await saveAlert(alert.type, alert.message, score, alert.details);

        if (sent) {
          console.log('  ✓ Alert sent to Telegram');
        }
      }
    } else {
      console.log('✓ No alerts triggered - conditions stable');
    }

    // 7. Execute Paper Trading logic
    const paperTradingResult = await executePaperTrading(score, indicators, marketData);

    if (paperTradingResult) {
      const config = await getPaperConfig();

      if (paperTradingResult.action === 'buy') {
        await sendPaperTradingBuy(paperTradingResult.trade, config, indicators);
      } else if (paperTradingResult.action === 'sell') {
        await sendPaperTradingSell(
          paperTradingResult.trade,
          paperTradingResult.profitLossUsd,
          paperTradingResult.profitLossPercentage
        );
      }
    }

    // 8. Calculate all indicator signals
    console.log('\n📊 Calculating all indicator signals...');
    try {
      const candles = marketData.dailyKlines.map(k => ({
        timestamp: k.openTime,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume
      }));

      const allSignals = await calculateAllSignals(candles, {
        useHeikinAshi: true,
        useTLSignals: true,
        useKoncorde: true,
        useLupown: true,
        useWhaleDetector: true,
        useDivergences: true,
        useOrderBlocks: true
      });

      console.log('✓ All indicator signals calculated');
      console.log('\nSignals summary:');

      // Save each indicator signal to database
      const timestamp = Date.now();
      const symbol = 'BTCUSDT';
      const price = marketData.currentPrice;

      const indicatorNames = [
        { key: 'heikinAshi', name: 'Heikin Ashi' },
        { key: 'tlSignals', name: 'TL Signals' },
        { key: 'koncorde', name: 'Koncorde' },
        { key: 'lupown', name: 'Lupown' },
        { key: 'whales', name: 'Whale Detector' },
        { key: 'divergences', name: 'Divergences' },
        { key: 'orderBlocks', name: 'Order Blocks' }
      ];

      for (const { key, name } of indicatorNames) {
        const signalData = allSignals[key];

        if (signalData) {
          const signal = signalData.signal || null;
          console.log(`  - ${name}: ${signal || 'NONE'}`);

          await savePaperSignal({
            timestamp,
            symbol,
            indicator: name,
            signal,
            price,
            metadata: signalData
          });
        }
      }

      console.log('✓ Signals saved to database');
    } catch (error) {
      console.error('✗ Error calculating/saving indicator signals:', error);
    }

    console.log('\n========================================');
    console.log('Analysis completed successfully');
    console.log('Next run:', getNextRunTime());
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ Error during analysis:');
    console.error(error);
    console.error('\nStack trace:');
    console.error(error.stack);
    console.log('\n========================================\n');
  }
}

/**
 * Get next scheduled run time
 */
function getNextRunTime() {
  try {
    const task = cron.schedule(CRON_SCHEDULE, () => {});
    const next = task.nextDate();
    task.stop();
    return next ? next.toLocaleString() : 'Unknown';
  } catch {
    return 'Unknown';
  }
}

/**
 * Main startup function
 */
async function main() {
  console.log('\n🚀 Tradincode Worker Starting...\n');

  // Initialize database
  console.log('Initializing database connection...');
  initDatabase();
  console.log('✓ Database connected\n');

  // Initialize Telegram bot
  console.log('Initializing Telegram bot...');
  initTelegramBot();
  console.log('✓ Telegram bot ready\n');

  // Send test message
  if (process.env.SEND_TEST_MESSAGE === 'true') {
    await sendTestMessage();
  }

  // Schedule cron job
  console.log(`Scheduling cron job: ${CRON_SCHEDULE}`);
  cron.schedule(CRON_SCHEDULE, async () => {
    await runAnalysis();
  });
  console.log('✓ Cron job scheduled\n');

  console.log('Next scheduled run:', getNextRunTime());

  // Run immediately on start if enabled
  if (RUN_ON_START) {
    console.log('\nRunning initial analysis...\n');
    await runAnalysis();
  }

  console.log('\n✅ Worker is running and monitoring Bitcoin...');
  console.log('Press Ctrl+C to stop\n');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nShutting down gracefully...');
  process.exit(0);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the application
main().catch(error => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
