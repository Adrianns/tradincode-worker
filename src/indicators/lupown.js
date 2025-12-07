/**
 * Lupown (Sommi) Indicator
 * Based on WaveTrend oscillator with RSI/MFI confirmation
 *
 * Signal Logic:
 * - Sommi Flag: WaveTrend oversold/overbought with RSI confirmation
 * - Sommi Diamond: Strong divergence signals
 */

import { calculateEMA, calculateRSI, calculateMFI, hlc3 } from './utils.js';

/**
 * Calculate WaveTrend oscillator
 */
function calculateWaveTrend(candles, n1 = 10, n2 = 21) {
  const hlc3Values = candles.map(c => hlc3(c));

  // Calculate ESA (Exponential Average of hlc3)
  const esa = calculateEMA(hlc3Values, n1);

  // Calculate absolute difference
  const absDiff = hlc3Values.map((v, i) =>
    esa[i] !== null ? Math.abs(v - esa[i]) : null
  );

  // Calculate D (EMA of absolute difference)
  const d = calculateEMA(absDiff.filter(v => v !== null), n1);

  // Pad D to match original length
  const dPadded = [];
  let dIndex = 0;
  for (let i = 0; i < hlc3Values.length; i++) {
    if (absDiff[i] === null) {
      dPadded.push(null);
    } else {
      dPadded.push(d[dIndex] || null);
      if (d[dIndex] !== undefined) dIndex++;
    }
  }

  // Calculate CI (Custom Index)
  const ci = hlc3Values.map((v, i) => {
    if (esa[i] === null || dPadded[i] === null || dPadded[i] === 0) {
      return null;
    }
    return (v - esa[i]) / (0.015 * dPadded[i]);
  });

  // Calculate TCI (Smoothed CI)
  const tci = calculateEMA(ci.filter(v => v !== null), n2);

  // Pad TCI to match original length
  const tciPadded = [];
  let tciIndex = 0;
  for (let i = 0; i < hlc3Values.length; i++) {
    if (ci[i] === null) {
      tciPadded.push(null);
    } else {
      tciPadded.push(tci[tciIndex] || null);
      if (tci[tciIndex] !== undefined) tciIndex++;
    }
  }

  // Calculate WaveTrend1 (WT1)
  const wt1 = tciPadded;

  // Calculate WaveTrend2 (WT2) - EMA of WT1
  const wt2 = calculateEMA(wt1.filter(v => v !== null), 4);

  // Pad WT2 to match original length
  const wt2Padded = [];
  let wt2Index = 0;
  for (let i = 0; i < hlc3Values.length; i++) {
    if (wt1[i] === null) {
      wt2Padded.push(null);
    } else {
      wt2Padded.push(wt2[wt2Index] || null);
      if (wt2[wt2Index] !== undefined) wt2Index++;
    }
  }

  return { wt1, wt2: wt2Padded };
}

/**
 * Detect Sommi Flag signals
 * Flag appears when WaveTrend is oversold/overbought with RSI confirmation
 */
function detectSommiFlag(wt1, wt2, rsi, mfi, config) {
  const {
    wtOverbought = 53,
    wtOversold = -53,
    rsiOverbought = 70,
    rsiOversold = 30,
    mfiOverbought = 80,
    mfiOversold = 20
  } = config;

  const flags = [];

  for (let i = 0; i < wt1.length; i++) {
    if (wt1[i] === null || wt2[i] === null || rsi[i] === null || mfi[i] === null) {
      flags.push(null);
      continue;
    }

    // Bullish flag: WT oversold + RSI oversold + MFI oversold
    const bullishFlag =
      wt1[i] < wtOversold && wt2[i] < wtOversold && rsi[i] < rsiOversold && mfi[i] < mfiOversold;

    // Bearish flag: WT overbought + RSI overbought + MFI overbought
    const bearishFlag =
      wt1[i] > wtOverbought &&
      wt2[i] > wtOverbought &&
      rsi[i] > rsiOverbought &&
      mfi[i] > mfiOverbought;

    if (bullishFlag) {
      flags.push('BULLISH');
    } else if (bearishFlag) {
      flags.push('BEARISH');
    } else {
      flags.push(null);
    }
  }

  return flags;
}

/**
 * Detect Sommi Diamond signals
 * Diamond appears on strong reversal conditions with WT crossover
 */
function detectSommiDiamond(wt1, wt2, rsi, candles) {
  const diamonds = [];

  for (let i = 1; i < wt1.length; i++) {
    if (
      wt1[i] === null ||
      wt2[i] === null ||
      wt1[i - 1] === null ||
      wt2[i - 1] === null ||
      rsi[i] === null
    ) {
      diamonds.push(null);
      continue;
    }

    // Bullish diamond: WT1 crosses above WT2 in oversold region
    const bullishCross = wt1[i] > wt2[i] && wt1[i - 1] <= wt2[i - 1];
    const inOversold = wt1[i] < -40;
    const rsiOversold = rsi[i] < 40;
    const bullishDiamond = bullishCross && inOversold && rsiOversold;

    // Bearish diamond: WT1 crosses below WT2 in overbought region
    const bearishCross = wt1[i] < wt2[i] && wt1[i - 1] >= wt2[i - 1];
    const inOverbought = wt1[i] > 40;
    const rsiOverbought = rsi[i] > 60;
    const bearishDiamond = bearishCross && inOverbought && rsiOverbought;

    if (bullishDiamond) {
      diamonds.push('BULLISH');
    } else if (bearishDiamond) {
      diamonds.push('BEARISH');
    } else {
      diamonds.push(null);
    }
  }

  // First candle has no previous candle to compare
  diamonds.unshift(null);

  return diamonds;
}

/**
 * Calculate Lupown (Sommi) signals
 *
 * @param {Array} candles - Array of OHLCV candles
 * @param {Object} config - Configuration parameters
 * @returns {Object} Signal data
 */
export function calculateLupownSignals(candles, config = {}) {
  const {
    wtChannelLen = 10,
    wtAverageLen = 21,
    rsiPeriod = 14,
    mfiPeriod = 14,
    wtOverbought = 53,
    wtOversold = -53
  } = config;

  const minRequired = Math.max(wtChannelLen, wtAverageLen, rsiPeriod, mfiPeriod) + 30;

  if (candles.length < minRequired) {
    return null;
  }

  try {
    // Calculate WaveTrend
    const { wt1, wt2 } = calculateWaveTrend(candles, wtChannelLen, wtAverageLen);

    // Calculate RSI and MFI
    const closes = candles.map(c => c.close);
    const rsi = calculateRSI(closes, rsiPeriod);
    const mfi = calculateMFI(candles, mfiPeriod);

    // Detect Sommi signals
    const flags = detectSommiFlag(wt1, wt2, rsi, mfi, config);
    const diamonds = detectSommiDiamond(wt1, wt2, rsi, candles);

    // Get current values
    const lastIdx = candles.length - 1;
    const currentWT1 = wt1[lastIdx];
    const currentWT2 = wt2[lastIdx];
    const currentRSI = rsi[lastIdx];
    const currentMFI = mfi[lastIdx];
    const currentFlag = flags[lastIdx];
    const currentDiamond = diamonds[lastIdx];

    if (currentWT1 === null || currentWT2 === null || currentRSI === null || currentMFI === null) {
      return null;
    }

    // Determine overall signal
    let signal = null;

    // Strong BUY: Bullish diamond (most reliable)
    if (currentDiamond === 'BULLISH') {
      signal = 'BUY';
    }
    // Medium BUY: Bullish flag
    else if (currentFlag === 'BULLISH') {
      signal = 'BUY';
    }
    // Strong SELL: Bearish diamond
    else if (currentDiamond === 'BEARISH') {
      signal = 'SELL';
    }
    // Medium SELL: Bearish flag
    else if (currentFlag === 'BEARISH') {
      signal = 'SELL';
    }

    return {
      signal,
      wt1: currentWT1,
      wt2: currentWT2,
      rsi: currentRSI,
      mfi: currentMFI,
      flag: currentFlag,
      diamond: currentDiamond,
      wtCondition:
        currentWT1 > wtOverbought
          ? 'overbought'
          : currentWT1 < wtOversold
            ? 'oversold'
            : 'neutral',
      timestamp: candles[lastIdx].timestamp
    };
  } catch (error) {
    console.error('Error calculating Lupown signals:', error);
    return null;
  }
}

/**
 * Check if Lupown strategy should trigger a buy
 */
export function shouldBuyLupown(candles, config = {}) {
  const result = calculateLupownSignals(candles, config);
  return result && result.signal === 'BUY';
}

/**
 * Check if Lupown strategy should trigger a sell
 */
export function shouldSellLupown(candles, config = {}) {
  const result = calculateLupownSignals(candles, config);
  return result && result.signal === 'SELL';
}
