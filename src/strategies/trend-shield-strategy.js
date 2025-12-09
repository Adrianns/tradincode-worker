/**
 * Trend Shield Strategy
 * Conservative spot trading combining EMA 200 + SuperTrend
 */

import { BaseStrategy } from './base-strategy.js';
import { calculateEMA } from '../indicators.js';

// Risk management constants
const ATR_PERIOD_RISK = 14;
const ATR_MULTIPLIER = 1.5;
const RISK_REWARD_RATIO = 1.5;

export class TrendShieldStrategy extends BaseStrategy {
  getMetadata() {
    return {
      name: 'Trend Shield',
      description: 'EMA 200 + SuperTrend + ATR Risk Management',
      suggestedBalance: 1000
    };
  }

  /**
   * Calculate Average True Range (ATR)
   */
  calculateATR(klines, period = 10) {
    if (klines.length < period + 1) return null;

    const trueRanges = [];

    for (let i = 1; i < klines.length; i++) {
      const high = klines[i].high;
      const low = klines[i].low;
      const prevClose = klines[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    if (trueRanges.length < period) return null;

    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < trueRanges.length; i++) {
      atr = ((atr * (period - 1)) + trueRanges[i]) / period;
    }

    return atr;
  }

  /**
   * Calculate SuperTrend indicator
   */
  calculateSuperTrend(klines, atrPeriod = 10, multiplier = 3) {
    if (klines.length < atrPeriod + 2) return null;

    const superTrends = [];

    for (let i = atrPeriod; i < klines.length; i++) {
      const slice = klines.slice(0, i + 1);
      const atr = this.calculateATR(slice, atrPeriod);

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

  async calculateSignals(marketData, allIndicatorSignals) {
    const { dailyKlines, currentPrice } = marketData;

    if (dailyKlines.length < 220) {
      return { signal: null, reason: 'Insufficient data for Trend Shield' };
    }

    const closePrices = dailyKlines.map(k => k.close);
    const ema200 = calculateEMA(closePrices, 200);
    const superTrendData = this.calculateSuperTrend(dailyKlines, 10, 3);
    const atr14 = this.calculateATR(dailyKlines, ATR_PERIOD_RISK);

    if (!ema200 || !superTrendData || !atr14) {
      return { signal: null, reason: 'Could not calculate indicators' };
    }

    const stCurrent = superTrendData.current;
    const stPrevious = superTrendData.previous;

    const priceAboveEMA = currentPrice > ema200;
    const superTrendDirection = stCurrent.direction;
    const prevSuperTrendDirection = stPrevious.direction;

    const superTrendTurnedGreen = superTrendDirection === 1 && prevSuperTrendDirection === -1;
    const superTrendTurnedRed = superTrendDirection === -1 && prevSuperTrendDirection === 1;

    let signal = null;

    if (priceAboveEMA && superTrendTurnedGreen) {
      signal = 'BUY';
    } else if (superTrendTurnedRed) {
      signal = 'SELL';
    }

    return {
      signal,
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
      },
      atr14
    };
  }

  async shouldBuy(marketData, signals, activePosition) {
    if (activePosition) {
      return false;
    }

    if (!signals || signals.signal !== 'BUY') {
      return false;
    }

    if (!signals.priceAboveEMA) {
      return false;
    }

    if (!signals.superTrend.justTurnedGreen) {
      return false;
    }

    return true;
  }

  async shouldSell(marketData, signals, activePosition) {
    if (!activePosition) {
      return false;
    }

    if (!signals) {
      return false;
    }

    const currentPrice = marketData.currentPrice;

    // Check SuperTrend turned RED
    if (signals.superTrend.justTurnedRed) {
      return true;
    }

    // Check Stop Loss
    if (activePosition.stop_loss_price && currentPrice <= activePosition.stop_loss_price) {
      return true;
    }

    // Check Take Profit
    if (activePosition.take_profit_price && currentPrice >= activePosition.take_profit_price) {
      return true;
    }

    return false;
  }

  /**
   * Calculate stop loss and take profit prices
   */
  calculateStopLossTakeProfit(entryPrice, atr14) {
    const slDistance = atr14 * ATR_MULTIPLIER;
    const stopLossPrice = entryPrice - slDistance;
    const takeProfitPrice = entryPrice + (slDistance * RISK_REWARD_RATIO);

    return { stopLossPrice, takeProfitPrice };
  }
}
