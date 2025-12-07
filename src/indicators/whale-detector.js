/**
 * Whale Detector Indicator
 * Detects unusual volume spikes that may indicate whale (large trader) activity
 *
 * Signal Logic:
 * - Whale Buy: Large volume spike + price increase + above average volume
 * - Whale Sell: Large volume spike + price decrease + above average volume
 */

import { calculateSMA, calculateStdDev } from './utils.js';

/**
 * Calculate volume-weighted average price (VWAP)
 */
function calculateVWAP(candles, period = 14) {
  const vwap = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      vwap.push(null);
    } else {
      let totalTPV = 0; // Total Typical Price * Volume
      let totalVolume = 0;

      for (let j = i - period + 1; j <= i; j++) {
        const typicalPrice = (candles[j].high + candles[j].low + candles[j].close) / 3;
        totalTPV += typicalPrice * candles[j].volume;
        totalVolume += candles[j].volume;
      }

      vwap.push(totalVolume > 0 ? totalTPV / totalVolume : null);
    }
  }

  return vwap;
}

/**
 * Detect volume anomalies
 */
function detectVolumeAnomalies(candles, volumeSMA, volumeStdDev, config) {
  const { volumeMultiplier = 2.5, minVolumeThreshold = 1.5 } = config;

  const anomalies = [];

  for (let i = 0; i < candles.length; i++) {
    if (volumeSMA[i] === null || volumeStdDev[i] === null) {
      anomalies.push(null);
      continue;
    }

    const currentVolume = candles[i].volume;
    const avgVolume = volumeSMA[i];
    const threshold = avgVolume + volumeMultiplier * volumeStdDev[i];

    // Check if volume is significantly above average
    const isAnomaly =
      currentVolume > threshold && currentVolume > avgVolume * minVolumeThreshold;

    anomalies.push(isAnomaly ? currentVolume / avgVolume : null);
  }

  return anomalies;
}

/**
 * Analyze price action with volume
 */
function analyzePriceAction(candles, vwap) {
  const priceAction = [];

  for (let i = 1; i < candles.length; i++) {
    if (vwap[i] === null) {
      priceAction.push(null);
      continue;
    }

    const prevClose = candles[i - 1].close;
    const currentClose = candles[i].close;
    const priceChange = currentClose - prevClose;
    const priceChangePercent = (priceChange / prevClose) * 100;

    // Check position relative to VWAP
    const aboveVWAP = currentClose > vwap[i];
    const belowVWAP = currentClose < vwap[i];

    // Calculate candle body strength
    const bodySize = Math.abs(candles[i].close - candles[i].open);
    const totalRange = candles[i].high - candles[i].low;
    const bodyStrength = totalRange > 0 ? bodySize / totalRange : 0;

    priceAction.push({
      priceChange,
      priceChangePercent,
      aboveVWAP,
      belowVWAP,
      bodyStrength,
      bullishCandle: candles[i].close > candles[i].open,
      bearishCandle: candles[i].close < candles[i].open
    });
  }

  // First candle has no previous price to compare
  priceAction.unshift(null);

  return priceAction;
}

/**
 * Calculate Whale Detector signals
 *
 * @param {Array} candles - Array of OHLCV candles
 * @param {Object} config - Configuration parameters
 * @returns {Object} Whale detection data
 */
export function detectWhales(candles, config = {}) {
  const {
    volumePeriod = 20,
    volumeMultiplier = 2.5,
    minVolumeThreshold = 1.5,
    vwapPeriod = 14,
    minPriceChange = 0.5, // Minimum 0.5% price change
    minBodyStrength = 0.6 // Minimum 60% body strength
  } = config;

  const minRequired = Math.max(volumePeriod, vwapPeriod) + 5;

  if (candles.length < minRequired) {
    return null;
  }

  try {
    // Calculate volume statistics
    const volumes = candles.map(c => c.volume);
    const volumeSMA = calculateSMA(volumes, volumePeriod);
    const volumeStdDev = calculateStdDev(volumes, volumePeriod);

    // Detect volume anomalies
    const anomalies = detectVolumeAnomalies(candles, volumeSMA, volumeStdDev, {
      volumeMultiplier,
      minVolumeThreshold
    });

    // Calculate VWAP
    const vwap = calculateVWAP(candles, vwapPeriod);

    // Analyze price action
    const priceAction = analyzePriceAction(candles, vwap);

    // Get current values
    const lastIdx = candles.length - 1;
    const volumeAnomaly = anomalies[lastIdx];
    const currentPriceAction = priceAction[lastIdx];
    const currentVWAP = vwap[lastIdx];

    if (volumeAnomaly === null || currentPriceAction === null || currentVWAP === null) {
      return null;
    }

    // Detect whale signals
    let signal = null;
    let whaleType = null;

    if (volumeAnomaly !== null) {
      // Large volume detected
      const significantPriceMove = Math.abs(currentPriceAction.priceChangePercent) >= minPriceChange;
      const strongBody = currentPriceAction.bodyStrength >= minBodyStrength;

      if (significantPriceMove && strongBody) {
        // Bullish whale: Large volume + strong bullish candle + above VWAP
        if (
          currentPriceAction.bullishCandle &&
          currentPriceAction.priceChangePercent > 0 &&
          currentPriceAction.aboveVWAP
        ) {
          signal = 'BUY';
          whaleType = 'ACCUMULATION';
        }
        // Bearish whale: Large volume + strong bearish candle + below VWAP
        else if (
          currentPriceAction.bearishCandle &&
          currentPriceAction.priceChangePercent < 0 &&
          currentPriceAction.belowVWAP
        ) {
          signal = 'SELL';
          whaleType = 'DISTRIBUTION';
        }
      }
    }

    return {
      signal,
      whaleDetected: volumeAnomaly !== null,
      whaleType,
      volumeRatio: volumeAnomaly,
      priceChange: currentPriceAction.priceChangePercent,
      vwap: currentVWAP,
      aboveVWAP: currentPriceAction.aboveVWAP,
      bodyStrength: currentPriceAction.bodyStrength,
      timestamp: candles[lastIdx].timestamp
    };
  } catch (error) {
    console.error('Error detecting whales:', error);
    return null;
  }
}

/**
 * Check if whale detector indicates bullish activity
 */
export function isBullishWhaleActivity(candles, config = {}) {
  const result = detectWhales(candles, config);
  return result && result.signal === 'BUY';
}

/**
 * Check if whale detector indicates bearish activity
 */
export function isBearishWhaleActivity(candles, config = {}) {
  const result = detectWhales(candles, config);
  return result && result.signal === 'SELL';
}
