/**
 * Divergence Detector
 * Detects regular and hidden divergences between price and RSI
 *
 * Divergence Types:
 * - Regular Bullish: Price makes lower low, RSI makes higher low (reversal signal)
 * - Regular Bearish: Price makes higher high, RSI makes lower high (reversal signal)
 * - Hidden Bullish: Price makes higher low, RSI makes lower low (continuation signal)
 * - Hidden Bearish: Price makes lower high, RSI makes higher high (continuation signal)
 */

import { calculateRSI } from './utils.js';

/**
 * Find pivot highs in an array
 */
function findPivotHighs(values, leftBars = 5, rightBars = 5) {
  const pivots = [];

  for (let i = 0; i < values.length; i++) {
    if (i < leftBars || i >= values.length - rightBars) {
      pivots.push(null);
      continue;
    }

    let isPivot = true;
    const currentValue = values[i];

    // Check left and right bars
    for (let j = i - leftBars; j < i + rightBars + 1; j++) {
      if (j !== i && values[j] >= currentValue) {
        isPivot = false;
        break;
      }
    }

    pivots.push(isPivot ? { index: i, value: currentValue } : null);
  }

  return pivots;
}

/**
 * Find pivot lows in an array
 */
function findPivotLows(values, leftBars = 5, rightBars = 5) {
  const pivots = [];

  for (let i = 0; i < values.length; i++) {
    if (i < leftBars || i >= values.length - rightBars) {
      pivots.push(null);
      continue;
    }

    let isPivot = true;
    const currentValue = values[i];

    // Check left and right bars
    for (let j = i - leftBars; j < i + rightBars + 1; j++) {
      if (j !== i && values[j] <= currentValue) {
        isPivot = false;
        break;
      }
    }

    pivots.push(isPivot ? { index: i, value: currentValue } : null);
  }

  return pivots;
}

/**
 * Detect regular bullish divergence
 * Price makes lower low, but RSI makes higher low
 */
function detectRegularBullishDivergence(priceLows, rsiLows, minBars = 5) {
  const divergences = [];

  // Get all non-null pivot lows
  const pricePivots = priceLows
    .map((p, i) => (p ? { ...p, originalIndex: i } : null))
    .filter(p => p !== null);
  const rsiPivots = rsiLows
    .map((p, i) => (p ? { ...p, originalIndex: i } : null))
    .filter(p => p !== null);

  for (let i = 1; i < pricePivots.length; i++) {
    const currentPrice = pricePivots[i];
    const prevPrice = pricePivots[i - 1];

    // Find corresponding RSI pivots
    const currentRSI = rsiPivots.find(r => Math.abs(r.originalIndex - currentPrice.originalIndex) <= 2);
    const prevRSI = rsiPivots.find(r => Math.abs(r.originalIndex - prevPrice.originalIndex) <= 2);

    if (!currentRSI || !prevRSI) continue;

    // Check if enough bars between pivots
    if (currentPrice.originalIndex - prevPrice.originalIndex < minBars) continue;

    // Regular bullish divergence: price lower low + RSI higher low
    if (currentPrice.value < prevPrice.value && currentRSI.value > prevRSI.value) {
      divergences.push({
        type: 'REGULAR_BULLISH',
        priceIndex: currentPrice.originalIndex,
        priceValue: currentPrice.value,
        rsiValue: currentRSI.value
      });
    }
  }

  return divergences;
}

/**
 * Detect regular bearish divergence
 * Price makes higher high, but RSI makes lower high
 */
function detectRegularBearishDivergence(priceHighs, rsiHighs, minBars = 5) {
  const divergences = [];

  // Get all non-null pivot highs
  const pricePivots = priceHighs
    .map((p, i) => (p ? { ...p, originalIndex: i } : null))
    .filter(p => p !== null);
  const rsiPivots = rsiHighs
    .map((p, i) => (p ? { ...p, originalIndex: i } : null))
    .filter(p => p !== null);

  for (let i = 1; i < pricePivots.length; i++) {
    const currentPrice = pricePivots[i];
    const prevPrice = pricePivots[i - 1];

    // Find corresponding RSI pivots
    const currentRSI = rsiPivots.find(r => Math.abs(r.originalIndex - currentPrice.originalIndex) <= 2);
    const prevRSI = rsiPivots.find(r => Math.abs(r.originalIndex - prevPrice.originalIndex) <= 2);

    if (!currentRSI || !prevRSI) continue;

    // Check if enough bars between pivots
    if (currentPrice.originalIndex - prevPrice.originalIndex < minBars) continue;

    // Regular bearish divergence: price higher high + RSI lower high
    if (currentPrice.value > prevPrice.value && currentRSI.value < prevRSI.value) {
      divergences.push({
        type: 'REGULAR_BEARISH',
        priceIndex: currentPrice.originalIndex,
        priceValue: currentPrice.value,
        rsiValue: currentRSI.value
      });
    }
  }

  return divergences;
}

/**
 * Detect hidden bullish divergence
 * Price makes higher low, but RSI makes lower low (trend continuation)
 */
function detectHiddenBullishDivergence(priceLows, rsiLows, minBars = 5) {
  const divergences = [];

  const pricePivots = priceLows
    .map((p, i) => (p ? { ...p, originalIndex: i } : null))
    .filter(p => p !== null);
  const rsiPivots = rsiLows
    .map((p, i) => (p ? { ...p, originalIndex: i } : null))
    .filter(p => p !== null);

  for (let i = 1; i < pricePivots.length; i++) {
    const currentPrice = pricePivots[i];
    const prevPrice = pricePivots[i - 1];

    const currentRSI = rsiPivots.find(r => Math.abs(r.originalIndex - currentPrice.originalIndex) <= 2);
    const prevRSI = rsiPivots.find(r => Math.abs(r.originalIndex - prevPrice.originalIndex) <= 2);

    if (!currentRSI || !prevRSI) continue;
    if (currentPrice.originalIndex - prevPrice.originalIndex < minBars) continue;

    // Hidden bullish: price higher low + RSI lower low
    if (currentPrice.value > prevPrice.value && currentRSI.value < prevRSI.value) {
      divergences.push({
        type: 'HIDDEN_BULLISH',
        priceIndex: currentPrice.originalIndex,
        priceValue: currentPrice.value,
        rsiValue: currentRSI.value
      });
    }
  }

  return divergences;
}

/**
 * Detect hidden bearish divergence
 * Price makes lower high, but RSI makes higher high (trend continuation)
 */
function detectHiddenBearishDivergence(priceHighs, rsiHighs, minBars = 5) {
  const divergences = [];

  const pricePivots = priceHighs
    .map((p, i) => (p ? { ...p, originalIndex: i } : null))
    .filter(p => p !== null);
  const rsiPivots = rsiHighs
    .map((p, i) => (p ? { ...p, originalIndex: i } : null))
    .filter(p => p !== null);

  for (let i = 1; i < pricePivots.length; i++) {
    const currentPrice = pricePivots[i];
    const prevPrice = pricePivots[i - 1];

    const currentRSI = rsiPivots.find(r => Math.abs(r.originalIndex - currentPrice.originalIndex) <= 2);
    const prevRSI = rsiPivots.find(r => Math.abs(r.originalIndex - prevPrice.originalIndex) <= 2);

    if (!currentRSI || !prevRSI) continue;
    if (currentPrice.originalIndex - prevPrice.originalIndex < minBars) continue;

    // Hidden bearish: price lower high + RSI higher high
    if (currentPrice.value < prevPrice.value && currentRSI.value > prevRSI.value) {
      divergences.push({
        type: 'HIDDEN_BEARISH',
        priceIndex: currentPrice.originalIndex,
        priceValue: currentPrice.value,
        rsiValue: currentRSI.value
      });
    }
  }

  return divergences;
}

/**
 * Detect divergences between price and RSI
 *
 * @param {Array} candles - Array of OHLCV candles
 * @param {Object} config - Configuration parameters
 * @returns {Object} Divergence signals
 */
export function detectDivergences(candles, config = {}) {
  const {
    rsiPeriod = 14,
    pivotLeftBars = 5,
    pivotRightBars = 5,
    minPivotDistance = 5,
    lookbackPeriod = 60
  } = config;

  const minRequired = rsiPeriod + pivotLeftBars + pivotRightBars + 10;

  if (candles.length < minRequired) {
    return null;
  }

  try {
    // Calculate RSI
    const closes = candles.map(c => c.close);
    const lows = candles.map(c => c.low);
    const highs = candles.map(c => c.high);
    const rsi = calculateRSI(closes, rsiPeriod);

    // Find pivot points in price
    const pricePivotLows = findPivotLows(lows, pivotLeftBars, pivotRightBars);
    const pricePivotHighs = findPivotHighs(highs, pivotLeftBars, pivotRightBars);

    // Find pivot points in RSI
    const rsiPivotLows = findPivotLows(rsi, pivotLeftBars, pivotRightBars);
    const rsiPivotHighs = findPivotHighs(rsi, pivotLeftBars, pivotRightBars);

    // Detect different types of divergences
    const regularBullish = detectRegularBullishDivergence(
      pricePivotLows,
      rsiPivotLows,
      minPivotDistance
    );
    const regularBearish = detectRegularBearishDivergence(
      pricePivotHighs,
      rsiPivotHighs,
      minPivotDistance
    );
    const hiddenBullish = detectHiddenBullishDivergence(
      pricePivotLows,
      rsiPivotLows,
      minPivotDistance
    );
    const hiddenBearish = detectHiddenBearishDivergence(
      pricePivotHighs,
      rsiPivotHighs,
      minPivotDistance
    );

    // Check for recent divergences (within lookback period)
    const lastIdx = candles.length - 1;
    const lookbackStart = Math.max(0, lastIdx - lookbackPeriod);

    const recentRegularBullish = regularBullish.filter(d => d.priceIndex >= lookbackStart);
    const recentRegularBearish = regularBearish.filter(d => d.priceIndex >= lookbackStart);
    const recentHiddenBullish = hiddenBullish.filter(d => d.priceIndex >= lookbackStart);
    const recentHiddenBearish = hiddenBearish.filter(d => d.priceIndex >= lookbackStart);

    // Determine signal based on most recent divergences
    let signal = null;

    if (recentRegularBullish.length > 0) {
      signal = 'BUY';
    } else if (recentRegularBearish.length > 0) {
      signal = 'SELL';
    }

    return {
      signal,
      regularBullish: recentRegularBullish.length > 0,
      regularBearish: recentRegularBearish.length > 0,
      hiddenBullish: recentHiddenBullish.length > 0,
      hiddenBearish: recentHiddenBearish.length > 0,
      divergences: {
        regularBullish: recentRegularBullish,
        regularBearish: recentRegularBearish,
        hiddenBullish: recentHiddenBullish,
        hiddenBearish: recentHiddenBearish
      },
      currentRSI: rsi[lastIdx],
      timestamp: candles[lastIdx].timestamp
    };
  } catch (error) {
    console.error('Error detecting divergences:', error);
    return null;
  }
}

/**
 * Check if there's a bullish divergence
 */
export function hasBullishDivergence(candles, config = {}) {
  const result = detectDivergences(candles, config);
  return result && (result.regularBullish || result.hiddenBullish);
}

/**
 * Check if there's a bearish divergence
 */
export function hasBearishDivergence(candles, config = {}) {
  const result = detectDivergences(candles, config);
  return result && (result.regularBearish || result.hiddenBearish);
}
