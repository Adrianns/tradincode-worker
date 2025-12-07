/**
 * Koncorde Indicator
 * Based on PVI (Positive Volume Index), NVI (Negative Volume Index),
 * MFI (Money Flow Index), and Bollinger Oscillator
 *
 * Signal Logic:
 * - BUY: PVI crossing above NVI + MFI oversold + Bollinger oscillator bullish
 * - SELL: NVI crossing above PVI + MFI overbought + Bollinger oscillator bearish
 */

import {
  calculateEMA,
  calculateMFI,
  calculateBollingerBands,
  typicalPrice
} from './utils.js';

/**
 * Calculate Positive Volume Index (PVI)
 */
function calculatePVI(candles) {
  const pvi = [1000]; // Start with base value of 1000

  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close;
    const currentClose = candles[i].close;
    const prevVolume = candles[i - 1].volume;
    const currentVolume = candles[i].volume;

    if (currentVolume > prevVolume) {
      // Volume increased - update PVI
      const priceChange = (currentClose - prevClose) / prevClose;
      pvi.push(pvi[i - 1] + (pvi[i - 1] * priceChange));
    } else {
      // Volume decreased or same - PVI stays unchanged
      pvi.push(pvi[i - 1]);
    }
  }

  return pvi;
}

/**
 * Calculate Negative Volume Index (NVI)
 */
function calculateNVI(candles) {
  const nvi = [1000]; // Start with base value of 1000

  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close;
    const currentClose = candles[i].close;
    const prevVolume = candles[i - 1].volume;
    const currentVolume = candles[i].volume;

    if (currentVolume < prevVolume) {
      // Volume decreased - update NVI
      const priceChange = (currentClose - prevClose) / prevClose;
      nvi.push(nvi[i - 1] + (nvi[i - 1] * priceChange));
    } else {
      // Volume increased or same - NVI stays unchanged
      nvi.push(nvi[i - 1]);
    }
  }

  return nvi;
}

/**
 * Calculate Bollinger Oscillator
 * Shows where price is relative to Bollinger Bands
 */
function calculateBollingerOscillator(candles, period = 20, stdDevMultiplier = 2) {
  const closes = candles.map(c => c.close);
  const { upper, middle, lower } = calculateBollingerBands(closes, period, stdDevMultiplier);

  const oscillator = [];

  for (let i = 0; i < candles.length; i++) {
    if (upper[i] === null || lower[i] === null) {
      oscillator.push(null);
    } else {
      const bandwidth = upper[i] - lower[i];
      if (bandwidth === 0) {
        oscillator.push(0);
      } else {
        // Normalize to -100 to +100 range
        const position = (closes[i] - middle[i]) / (bandwidth / 2);
        oscillator.push(position * 100);
      }
    }
  }

  return oscillator;
}

/**
 * Calculate market strength based on volume indicators
 */
function calculateMarketStrength(pvi, nvi, pviEMA, nviEMA) {
  const strength = [];

  for (let i = 0; i < pvi.length; i++) {
    if (pviEMA[i] === null || nviEMA[i] === null) {
      strength.push(null);
    } else {
      // Calculate strength as difference between PVI and NVI
      const pviStrength = pvi[i] - pviEMA[i];
      const nviStrength = nvi[i] - nviEMA[i];
      const totalStrength = pviStrength - nviStrength;

      strength.push(totalStrength);
    }
  }

  return strength;
}

/**
 * Calculate Koncorde signals
 *
 * @param {Array} candles - Array of OHLCV candles
 * @param {Object} config - Configuration parameters
 * @returns {Object} Signal data
 */
export function calculateKoncordeSignals(candles, config = {}) {
  const {
    pviPeriod = 255,
    nviPeriod = 255,
    mfiPeriod = 14,
    mfiOverbought = 80,
    mfiOversold = 20,
    bbPeriod = 20,
    bbStdDev = 2
  } = config;

  const minRequired = Math.max(pviPeriod, nviPeriod, mfiPeriod, bbPeriod) + 10;

  if (candles.length < minRequired) {
    return null;
  }

  try {
    // Calculate PVI and NVI
    const pvi = calculatePVI(candles);
    const nvi = calculateNVI(candles);

    // Calculate EMAs of PVI and NVI
    const pviEMA = calculateEMA(pvi, pviPeriod);
    const nviEMA = calculateEMA(nvi, nviPeriod);

    // Calculate MFI
    const mfi = calculateMFI(candles, mfiPeriod);

    // Calculate Bollinger Oscillator
    const bbOscillator = calculateBollingerOscillator(candles, bbPeriod, bbStdDev);

    // Calculate market strength
    const strength = calculateMarketStrength(pvi, nvi, pviEMA, nviEMA);

    // Get current values
    const lastIdx = candles.length - 1;
    const prevIdx = lastIdx - 1;

    const currentPVI = pvi[lastIdx];
    const currentNVI = nvi[lastIdx];
    const prevPVI = pvi[prevIdx];
    const prevNVI = nvi[prevIdx];

    const currentMFI = mfi[lastIdx];
    const currentBBOsc = bbOscillator[lastIdx];
    const currentStrength = strength[lastIdx];

    if (
      currentPVI === null ||
      currentNVI === null ||
      currentMFI === null ||
      currentBBOsc === null ||
      currentStrength === null
    ) {
      return null;
    }

    // Determine signal
    let signal = null;

    // Bullish conditions
    const pviCrossAboveNVI = currentPVI > currentNVI && prevPVI <= prevNVI;
    const mfiOversoldCondition = currentMFI < mfiOversold;
    const bbOscillatorBullish = currentBBOsc < -50; // Price near lower band
    const positiveStrength = currentStrength > 0;

    // Bearish conditions
    const nviCrossAbovePVI = currentNVI > currentPVI && prevNVI <= prevPVI;
    const mfiOverboughtCondition = currentMFI > mfiOverbought;
    const bbOscillatorBearish = currentBBOsc > 50; // Price near upper band
    const negativeStrength = currentStrength < 0;

    // BUY signal: PVI strength + oversold + bullish oscillator
    if ((pviCrossAboveNVI || positiveStrength) && mfiOversoldCondition && bbOscillatorBullish) {
      signal = 'BUY';
    }
    // SELL signal: NVI strength + overbought + bearish oscillator
    else if (
      (nviCrossAbovePVI || negativeStrength) &&
      mfiOverboughtCondition &&
      bbOscillatorBearish
    ) {
      signal = 'SELL';
    }

    return {
      signal,
      pvi: currentPVI,
      nvi: currentNVI,
      mfi: currentMFI,
      bbOscillator: currentBBOsc,
      strength: currentStrength,
      pviAboveNVI: currentPVI > currentNVI,
      mfiCondition: currentMFI < mfiOversold ? 'oversold' : currentMFI > mfiOverbought ? 'overbought' : 'neutral',
      timestamp: candles[lastIdx].timestamp
    };
  } catch (error) {
    console.error('Error calculating Koncorde signals:', error);
    return null;
  }
}

/**
 * Check if Koncorde strategy should trigger a buy
 */
export function shouldBuyKoncorde(candles, config = {}) {
  const result = calculateKoncordeSignals(candles, config);
  return result && result.signal === 'BUY';
}

/**
 * Check if Koncorde strategy should trigger a sell
 */
export function shouldSellKoncorde(candles, config = {}) {
  const result = calculateKoncordeSignals(candles, config);
  return result && result.signal === 'SELL';
}
