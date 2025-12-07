/**
 * TL Buy/Sell Signals Indicator
 * Based on ADX (Average Directional Index) and Momentum Pivots
 *
 * Signal Logic:
 * - BUY: Strong trend (ADX > threshold) + bullish momentum + pivot low
 * - SELL: Strong trend (ADX > threshold) + bearish momentum + pivot high
 */

import { calculateEMA, calculateSMA } from './utils.js';

/**
 * Calculate True Range (TR)
 */
function calculateTrueRange(candles) {
  const tr = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
    } else {
      const highLow = candles[i].high - candles[i].low;
      const highClose = Math.abs(candles[i].high - candles[i - 1].close);
      const lowClose = Math.abs(candles[i].low - candles[i - 1].close);
      tr.push(Math.max(highLow, highClose, lowClose));
    }
  }

  return tr;
}

/**
 * Calculate +DM and -DM (Directional Movement)
 */
function calculateDirectionalMovement(candles) {
  const plusDM = [];
  const minusDM = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      plusDM.push(0);
      minusDM.push(0);
    } else {
      const upMove = candles[i].high - candles[i - 1].high;
      const downMove = candles[i - 1].low - candles[i].low;

      if (upMove > downMove && upMove > 0) {
        plusDM.push(upMove);
        minusDM.push(0);
      } else if (downMove > upMove && downMove > 0) {
        plusDM.push(0);
        minusDM.push(downMove);
      } else {
        plusDM.push(0);
        minusDM.push(0);
      }
    }
  }

  return { plusDM, minusDM };
}

/**
 * Calculate Smoothed Indicator (Wilder's Smoothing)
 */
function wilderSmoothing(values, period) {
  const smoothed = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      smoothed.push(null);
    } else if (i === period - 1) {
      // First smoothed value is simple sum
      const sum = values.slice(0, period).reduce((a, b) => a + b, 0);
      smoothed.push(sum);
    } else {
      // Subsequent values use Wilder's formula
      const prev = smoothed[i - 1];
      smoothed.push(prev - (prev / period) + values[i]);
    }
  }

  return smoothed;
}

/**
 * Calculate ADX (Average Directional Index)
 */
function calculateADX(candles, period = 14) {
  // Calculate True Range
  const tr = calculateTrueRange(candles);

  // Calculate Directional Movement
  const { plusDM, minusDM } = calculateDirectionalMovement(candles);

  // Smooth TR, +DM, -DM using Wilder's method
  const smoothedTR = wilderSmoothing(tr, period);
  const smoothedPlusDM = wilderSmoothing(plusDM, period);
  const smoothedMinusDM = wilderSmoothing(minusDM, period);

  // Calculate +DI and -DI
  const plusDI = [];
  const minusDI = [];

  for (let i = 0; i < candles.length; i++) {
    if (smoothedTR[i] === null || smoothedTR[i] === 0) {
      plusDI.push(null);
      minusDI.push(null);
    } else {
      plusDI.push((smoothedPlusDM[i] / smoothedTR[i]) * 100);
      minusDI.push((smoothedMinusDM[i] / smoothedTR[i]) * 100);
    }
  }

  // Calculate DX (Directional Index)
  const dx = [];

  for (let i = 0; i < candles.length; i++) {
    if (plusDI[i] === null || minusDI[i] === null) {
      dx.push(null);
    } else {
      const sum = plusDI[i] + minusDI[i];
      if (sum === 0) {
        dx.push(0);
      } else {
        dx.push((Math.abs(plusDI[i] - minusDI[i]) / sum) * 100);
      }
    }
  }

  // Smooth DX to get ADX
  const adx = [];
  let adxSum = 0;
  let adxCount = 0;

  for (let i = 0; i < candles.length; i++) {
    if (dx[i] === null) {
      adx.push(null);
    } else if (adxCount < period) {
      adxSum += dx[i];
      adxCount++;
      if (adxCount === period) {
        adx.push(adxSum / period);
      } else {
        adx.push(null);
      }
    } else {
      const newAdx = (adx[i - 1] * (period - 1) + dx[i]) / period;
      adx.push(newAdx);
    }
  }

  return { adx, plusDI, minusDI };
}

/**
 * Detect pivot highs and lows
 */
function detectPivots(candles, leftBars = 5, rightBars = 5) {
  const pivotHighs = [];
  const pivotLows = [];

  for (let i = 0; i < candles.length; i++) {
    let isPivotHigh = true;
    let isPivotLow = true;

    // Check if we have enough bars on both sides
    if (i < leftBars || i >= candles.length - rightBars) {
      pivotHighs.push(null);
      pivotLows.push(null);
      continue;
    }

    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;

    // Check left and right bars for pivot high
    for (let j = i - leftBars; j < i + rightBars + 1; j++) {
      if (j !== i && candles[j].high >= currentHigh) {
        isPivotHigh = false;
      }
    }

    // Check left and right bars for pivot low
    for (let j = i - leftBars; j < i + rightBars + 1; j++) {
      if (j !== i && candles[j].low <= currentLow) {
        isPivotLow = false;
      }
    }

    pivotHighs.push(isPivotHigh ? currentHigh : null);
    pivotLows.push(isPivotLow ? currentLow : null);
  }

  return { pivotHighs, pivotLows };
}

/**
 * Calculate momentum using rate of change
 */
function calculateMomentum(candles, period = 10) {
  const closes = candles.map(c => c.close);
  const momentum = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      momentum.push(null);
    } else {
      const change = closes[i] - closes[i - period];
      const percentChange = (change / closes[i - period]) * 100;
      momentum.push(percentChange);
    }
  }

  return momentum;
}

/**
 * Calculate TL Buy/Sell signals
 *
 * @param {Array} candles - Array of OHLCV candles
 * @param {Object} config - Configuration parameters
 * @returns {Object} Signal data
 */
export function calculateTLSignals(candles, config = {}) {
  const {
    adxLength = 14,
    adxThreshold = 25,
    momentumPeriod = 10,
    pivotLeftBars = 5,
    pivotRightBars = 5
  } = config;

  if (candles.length < adxLength + momentumPeriod + pivotLeftBars + pivotRightBars) {
    return null;
  }

  try {
    // Calculate ADX and Directional Indicators
    const { adx, plusDI, minusDI } = calculateADX(candles, adxLength);

    // Calculate Momentum
    const momentum = calculateMomentum(candles, momentumPeriod);

    // Detect pivot points
    const { pivotHighs, pivotLows } = detectPivots(candles, pivotLeftBars, pivotRightBars);

    // Determine signal at the last candle
    const lastIdx = candles.length - 1;
    const currentADX = adx[lastIdx];
    const currentPlusDI = plusDI[lastIdx];
    const currentMinusDI = minusDI[lastIdx];
    const currentMomentum = momentum[lastIdx];
    const isPivotHigh = pivotHighs[lastIdx] !== null;
    const isPivotLow = pivotLows[lastIdx] !== null;

    if (currentADX === null || currentMomentum === null) {
      return null;
    }

    // Signal conditions
    const strongTrend = currentADX > adxThreshold;
    const bullishDI = currentPlusDI > currentMinusDI;
    const bearishDI = currentMinusDI > currentPlusDI;
    const bullishMomentum = currentMomentum > 0;
    const bearishMomentum = currentMomentum < 0;

    let signal = null;

    // BUY signal: Strong trend + bullish DI + positive momentum + pivot low
    if (strongTrend && bullishDI && bullishMomentum && isPivotLow) {
      signal = 'BUY';
    }
    // SELL signal: Strong trend + bearish DI + negative momentum + pivot high
    else if (strongTrend && bearishDI && bearishMomentum && isPivotHigh) {
      signal = 'SELL';
    }

    return {
      signal,
      adx: currentADX,
      plusDI: currentPlusDI,
      minusDI: currentMinusDI,
      momentum: currentMomentum,
      isPivotHigh,
      isPivotLow,
      timestamp: candles[lastIdx].timestamp
    };
  } catch (error) {
    console.error('Error calculating TL signals:', error);
    return null;
  }
}

/**
 * Check if TL strategy should trigger a buy
 */
export function shouldBuyTL(candles, config = {}) {
  const result = calculateTLSignals(candles, config);
  return result && result.signal === 'BUY';
}

/**
 * Check if TL strategy should trigger a sell
 */
export function shouldSellTL(candles, config = {}) {
  const result = calculateTLSignals(candles, config);
  return result && result.signal === 'SELL';
}
