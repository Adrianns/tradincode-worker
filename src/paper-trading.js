import {
  getPaperConfig,
  executeBuyTrade,
  executeSellTrade,
  getAveragePurchasePrice
} from './paper-trading-db.js';
import { calculateEMA } from './indicators.js';

/**
 * Trend Shield Strategy (Tendencia Blindada)
 *
 * Conservative spot trading strategy combining EMA 200 + SuperTrend
 *
 * Entry: Price > EMA 200 AND SuperTrend turns GREEN
 * Exit: SuperTrend turns RED (regardless of EMA)
 *
 * Timeframe: Daily (1D)
 */

/**
 * Calculate Average True Range (ATR)
 * @param {Array} klines - Array of kline objects with high, low, close
 * @param {number} period - ATR period (default 10)
 */
function calculateATR(klines, period = 10) {
  if (klines.length < period + 1) return null;

  const trueRanges = [];

  for (let i = 1; i < klines.length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevClose = klines[i - 1].close;

    // True Range = max(high - low, |high - prevClose|, |low - prevClose|)
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) return null;

  // Use simple average for first ATR value
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Then apply smoothing for subsequent values
  for (let i = period; i < trueRanges.length; i++) {
    atr = ((atr * (period - 1)) + trueRanges[i]) / period;
  }

  return atr;
}

/**
 * Calculate SuperTrend indicator
 * @param {Array} klines - Array of kline objects with high, low, close
 * @param {number} atrPeriod - ATR period (default 10)
 * @param {number} multiplier - ATR multiplier (default 3)
 */
function calculateSuperTrend(klines, atrPeriod = 10, multiplier = 3) {
  if (klines.length < atrPeriod + 2) return null;

  const superTrends = [];

  for (let i = atrPeriod; i < klines.length; i++) {
    const slice = klines.slice(0, i + 1);
    const atr = calculateATR(slice, atrPeriod);

    if (!atr) continue;

    const currentKline = klines[i];
    const hl2 = (currentKline.high + currentKline.low) / 2;

    const basicUpperBand = hl2 + (multiplier * atr);
    const basicLowerBand = hl2 - (multiplier * atr);

    let finalUpperBand = basicUpperBand;
    let finalLowerBand = basicLowerBand;
    let superTrend;
    let direction;

    if (superTrends.length > 0) {
      const prev = superTrends[superTrends.length - 1];
      const prevClose = klines[i - 1].close;

      if (basicUpperBand < prev.finalUpperBand || prevClose > prev.finalUpperBand) {
        finalUpperBand = basicUpperBand;
      } else {
        finalUpperBand = prev.finalUpperBand;
      }

      if (basicLowerBand > prev.finalLowerBand || prevClose < prev.finalLowerBand) {
        finalLowerBand = basicLowerBand;
      } else {
        finalLowerBand = prev.finalLowerBand;
      }

      if (prev.superTrend === prev.finalUpperBand) {
        if (currentKline.close > finalUpperBand) {
          direction = 1;
          superTrend = finalLowerBand;
        } else {
          direction = -1;
          superTrend = finalUpperBand;
        }
      } else {
        if (currentKline.close < finalLowerBand) {
          direction = -1;
          superTrend = finalUpperBand;
        } else {
          direction = 1;
          superTrend = finalLowerBand;
        }
      }
    } else {
      if (currentKline.close > basicUpperBand) {
        direction = 1;
        superTrend = basicLowerBand;
      } else {
        direction = -1;
        superTrend = basicUpperBand;
      }
    }

    superTrends.push({
      timestamp: currentKline.timestamp,
      close: currentKline.close,
      atr,
      finalUpperBand,
      finalLowerBand,
      superTrend,
      direction
    });
  }

  if (superTrends.length < 2) return null;

  return {
    current: superTrends[superTrends.length - 1],
    previous: superTrends[superTrends.length - 2]
  };
}

/**
 * Calculate Trend Shield indicators from market data
 */
function calculateTrendShieldIndicators(marketData) {
  const { dailyKlines, currentPrice } = marketData;

  if (dailyKlines.length < 220) {
    console.warn('   Insufficient data for Trend Shield strategy');
    return null;
  }

  const closePrices = dailyKlines.map(k => k.close);
  const ema200 = calculateEMA(closePrices, 200);
  const superTrendData = calculateSuperTrend(dailyKlines, 10, 3);

  if (!ema200 || !superTrendData) {
    console.warn('   Could not calculate Trend Shield indicators');
    return null;
  }

  const stCurrent = superTrendData.current;
  const stPrevious = superTrendData.previous;

  const priceAboveEMA = currentPrice > ema200;
  const superTrendDirection = stCurrent.direction;
  const prevSuperTrendDirection = stPrevious.direction;

  const superTrendTurnedGreen = superTrendDirection === 1 && prevSuperTrendDirection === -1;
  const superTrendTurnedRed = superTrendDirection === -1 && prevSuperTrendDirection === 1;

  return {
    price: currentPrice,
    ema200,
    priceAboveEMA,
    priceDistanceFromEMA: ((currentPrice - ema200) / ema200) * 100,
    superTrend: {
      value: stCurrent.superTrend,
      direction: superTrendDirection,
      isGreen: superTrendDirection === 1,
      isRed: superTrendDirection === -1,
      justTurnedGreen: superTrendTurnedGreen,
      justTurnedRed: superTrendTurnedRed,
      atr: stCurrent.atr
    }
  };
}

/**
 * Evaluate BUY signal for Trend Shield strategy
 */
function shouldBuy(config, indicators) {
  const reasons = [];

  if (!config.is_active) {
    return { should: false, reasons: ['Paper trading is not active'] };
  }

  if (config.balance_usd <= 0) {
    return { should: false, reasons: ['No USD balance available'] };
  }

  // ENTRY CONDITIONS:
  // 1. Price must be ABOVE EMA 200 (bullish market)
  // 2. SuperTrend just changed from RED to GREEN

  if (!indicators.priceAboveEMA) {
    return {
      should: false,
      reasons: [`Price $${indicators.price.toFixed(0)} BELOW EMA 200 ($${indicators.ema200.toFixed(0)}) - Bearish market`]
    };
  }

  if (!indicators.superTrend.justTurnedGreen) {
    if (indicators.superTrend.isGreen) {
      return {
        should: false,
        reasons: ['SuperTrend already GREEN - Wait for next signal']
      };
    }
    return {
      should: false,
      reasons: ['SuperTrend is RED - No buy signal']
    };
  }

  // BUY SIGNAL!
  reasons.push('Price above EMA 200 - Bullish trend confirmed');
  reasons.push('SuperTrend changed RED to GREEN - Buy signal!');

  const usdToInvest = (parseFloat(config.balance_usd) * config.percentage_per_trade) / 100;

  if (usdToInvest < 10) {
    return {
      should: false,
      reasons: [`Investment amount $${usdToInvest.toFixed(2)} below minimum $10`]
    };
  }

  return {
    should: true,
    reasons,
    usdToInvest
  };
}

/**
 * Evaluate SELL signal for Trend Shield strategy
 */
async function shouldSell(config, indicators) {
  const reasons = [];

  if (!config.is_active) {
    return { should: false, reasons: ['Paper trading is not active'] };
  }

  if (parseFloat(config.balance_btc) <= 0) {
    return { should: false, reasons: ['No BTC balance to sell'] };
  }

  const avgPurchasePrice = await getAveragePurchasePrice();

  if (!avgPurchasePrice) {
    return { should: false, reasons: ['Could not determine average purchase price'] };
  }

  const currentPrice = indicators.price;
  const profitLossPercent = ((currentPrice - avgPurchasePrice) / avgPurchasePrice) * 100;

  // EXIT CONDITION: SuperTrend turns RED
  if (indicators.superTrend.justTurnedRed) {
    reasons.push('SuperTrend changed GREEN to RED - Sell signal!');
    reasons.push(`Protecting capital at ${profitLossPercent >= 0 ? '+' : ''}${profitLossPercent.toFixed(2)}%`);

    return {
      should: true,
      reasons,
      profitLossPercent,
      avgPurchasePrice,
      triggerType: 'supertrend_red'
    };
  }

  // Additional safety: Stop loss
  if (profitLossPercent <= -config.stop_loss_percentage) {
    reasons.push(`Stop loss triggered: ${profitLossPercent.toFixed(2)}% (limit: -${config.stop_loss_percentage}%)`);
    return {
      should: true,
      reasons,
      profitLossPercent,
      avgPurchasePrice,
      triggerType: 'stop_loss'
    };
  }

  const holdReason = indicators.superTrend.isGreen
    ? `SuperTrend GREEN - Holding. P/L: ${profitLossPercent >= 0 ? '+' : ''}${profitLossPercent.toFixed(2)}%`
    : `Waiting for signal. P/L: ${profitLossPercent >= 0 ? '+' : ''}${profitLossPercent.toFixed(2)}%`;

  return {
    should: false,
    reasons: [holdReason]
  };
}

/**
 * Execute paper trading logic using Trend Shield strategy
 * @param {number} score - Score from classic indicators (for display only)
 * @param {Object} indicators - Classic indicators (for display only)
 * @param {Object} marketData - Raw market data for Trend Shield calculation
 */
export async function executePaperTrading(score, indicators, marketData) {
  try {
    const config = await getPaperConfig();

    if (!config) {
      console.log('   Paper trading not configured');
      return null;
    }

    if (!config.is_active) {
      console.log('   Paper trading is inactive');
      return null;
    }

    console.log('\n   Evaluating Trend Shield signals...');
    console.log(`   Strategy: EMA 200 + SuperTrend`);
    console.log(`   Balance: $${parseFloat(config.balance_usd).toLocaleString()} USD + ${parseFloat(config.balance_btc).toFixed(8)} BTC`);

    if (!marketData) {
      console.log('   No market data available');
      return null;
    }

    const trendIndicators = calculateTrendShieldIndicators(marketData);

    if (!trendIndicators) {
      return null;
    }

    const currentPrice = trendIndicators.price;

    console.log(`   EMA 200: $${trendIndicators.ema200.toFixed(0)} | Price: $${currentPrice.toFixed(0)} (${trendIndicators.priceDistanceFromEMA.toFixed(2)}%)`);
    console.log(`   SuperTrend: ${trendIndicators.superTrend.isGreen ? 'GREEN' : 'RED'} (value: $${trendIndicators.superTrend.value.toFixed(0)})`);

    // Check for SELL signal first
    const sellSignal = await shouldSell(config, trendIndicators);

    if (sellSignal.should) {
      console.log('   SELL SIGNAL DETECTED');
      console.log(`   Trigger: ${sellSignal.triggerType}`);
      console.log(`   Reasons: ${sellSignal.reasons.join(', ')}`);

      const btcToSell = parseFloat(config.balance_btc);
      const usdReceived = btcToSell * currentPrice;
      const newBalanceUsd = parseFloat(config.balance_usd) + usdReceived;
      const newBalanceBtc = 0;

      const profitLossUsd = (currentPrice - sellSignal.avgPurchasePrice) * btcToSell;
      const profitLossPercentage = sellSignal.profitLossPercent;

      const tradeData = {
        btcPrice: currentPrice,
        btcAmount: btcToSell,
        usdAmount: usdReceived,
        balanceUsd: newBalanceUsd,
        balanceBtc: newBalanceBtc,
        score: 0,
        reason: `[TREND_SHIELD] ${sellSignal.reasons.join(' | ')}`,
        profitLossUsd,
        profitLossPercentage
      };

      const trade = await executeSellTrade(tradeData);

      console.log('   SELL EXECUTED');
      console.log(`   BTC sold: ${btcToSell.toFixed(8)} at $${currentPrice.toLocaleString()}`);
      console.log(`   USD received: $${usdReceived.toLocaleString()}`);
      console.log(`   P/L: ${profitLossPercentage > 0 ? '+' : ''}${profitLossPercentage.toFixed(2)}%`);

      return {
        action: 'sell',
        trade,
        profitLossPercentage,
        profitLossUsd
      };
    }

    // Check for BUY signal
    const buySignal = shouldBuy(config, trendIndicators);

    if (buySignal.should) {
      console.log('   BUY SIGNAL DETECTED');
      console.log(`   Reasons: ${buySignal.reasons.join(', ')}`);

      const usdToInvest = buySignal.usdToInvest;
      const btcToBuy = usdToInvest / currentPrice;
      const newBalanceUsd = parseFloat(config.balance_usd) - usdToInvest;
      const newBalanceBtc = parseFloat(config.balance_btc) + btcToBuy;

      const tradeData = {
        btcPrice: currentPrice,
        btcAmount: btcToBuy,
        usdAmount: usdToInvest,
        balanceUsd: newBalanceUsd,
        balanceBtc: newBalanceBtc,
        score: 0,
        reason: `[TREND_SHIELD] ${buySignal.reasons.join(' | ')}`
      };

      const trade = await executeBuyTrade(tradeData);

      console.log('   BUY EXECUTED');
      console.log(`   USD invested: $${usdToInvest.toLocaleString()} (${config.percentage_per_trade}%)`);
      console.log(`   BTC bought: ${btcToBuy.toFixed(8)} at $${currentPrice.toLocaleString()}`);

      return {
        action: 'buy',
        trade
      };
    }

    // No signal
    console.log('   No trading signal - Holding position');
    if (parseFloat(config.balance_btc) > 0) {
      const avgPrice = await getAveragePurchasePrice();
      if (avgPrice) {
        const currentValue = parseFloat(config.balance_btc) * currentPrice;
        const profitLoss = ((currentPrice - avgPrice) / avgPrice) * 100;
        console.log(`   Position: ${parseFloat(config.balance_btc).toFixed(8)} BTC ($${currentValue.toLocaleString()})`);
        console.log(`   Unrealized P/L: ${profitLoss > 0 ? '+' : ''}${profitLoss.toFixed(2)}%`);
      }
    }

    return null;
  } catch (error) {
    console.error('   Error in paper trading:', error);
    return null;
  }
}

export default {
  executePaperTrading,
  shouldBuy,
  shouldSell
};
