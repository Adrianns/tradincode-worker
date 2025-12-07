/**
 * Order Blocks Detector
 * Identifies institutional order blocks (bullish and bearish)
 *
 * Order blocks are areas where institutions have placed large orders,
 * typically identified by:
 * - Strong directional move following the block
 * - High volume on the block candle
 * - Price returns to test the block later
 *
 * Signal Logic:
 * - Bullish OB: Last bearish candle before strong bullish move
 * - Bearish OB: Last bullish candle before strong bearish move
 */

import { calculateATR } from './utils.js';

/**
 * Detect swing highs and lows
 */
function detectSwings(candles, period = 5) {
  const swingHighs = [];
  const swingLows = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period || i >= candles.length - period) {
      swingHighs.push(null);
      swingLows.push(null);
      continue;
    }

    let isSwingHigh = true;
    let isSwingLow = true;

    // Check if current candle is a swing high/low
    for (let j = i - period; j <= i + period; j++) {
      if (j !== i) {
        if (candles[j].high >= candles[i].high) {
          isSwingHigh = false;
        }
        if (candles[j].low <= candles[i].low) {
          isSwingLow = false;
        }
      }
    }

    swingHighs.push(isSwingHigh ? candles[i].high : null);
    swingLows.push(isSwingLow ? candles[i].low : null);
  }

  return { swingHighs, swingLows };
}

/**
 * Detect strong directional moves
 */
function detectStrongMoves(candles, atr, config) {
  const { minMoveMultiplier = 2, minConsecutiveBars = 3 } = config;

  const strongMoves = [];

  for (let i = minConsecutiveBars; i < candles.length; i++) {
    if (atr[i] === null) {
      strongMoves.push(null);
      continue;
    }

    // Check for consecutive bullish candles
    let bullishStreak = 0;
    let totalBullishMove = 0;

    for (let j = i - minConsecutiveBars + 1; j <= i; j++) {
      if (candles[j].close > candles[j].open) {
        bullishStreak++;
        totalBullishMove += candles[j].close - candles[j].open;
      }
    }

    // Check for consecutive bearish candles
    let bearishStreak = 0;
    let totalBearishMove = 0;

    for (let j = i - minConsecutiveBars + 1; j <= i; j++) {
      if (candles[j].close < candles[j].open) {
        bearishStreak++;
        totalBearishMove += candles[j].open - candles[j].close;
      }
    }

    // Strong bullish move
    if (bullishStreak >= minConsecutiveBars && totalBullishMove > atr[i] * minMoveMultiplier) {
      strongMoves.push({ type: 'BULLISH', strength: totalBullishMove / atr[i] });
    }
    // Strong bearish move
    else if (bearishStreak >= minConsecutiveBars && totalBearishMove > atr[i] * minMoveMultiplier) {
      strongMoves.push({ type: 'BEARISH', strength: totalBearishMove / atr[i] });
    } else {
      strongMoves.push(null);
    }
  }

  // Pad beginning with nulls
  for (let i = 0; i < minConsecutiveBars; i++) {
    strongMoves.unshift(null);
  }

  return strongMoves;
}

/**
 * Identify bullish order blocks
 * Last bearish candle before strong bullish move
 */
function identifyBullishOrderBlocks(candles, strongMoves, volumes, config) {
  const { minVolumeRatio = 1.2, lookbackPeriod = 20 } = config;

  const orderBlocks = [];

  for (let i = 1; i < candles.length; i++) {
    if (!strongMoves[i] || strongMoves[i].type !== 'BULLISH') {
      orderBlocks.push(null);
      continue;
    }

    // Look for the last bearish candle before this bullish move
    let orderBlockIndex = null;
    for (let j = i - 1; j >= Math.max(0, i - lookbackPeriod); j--) {
      if (candles[j].close < candles[j].open) {
        orderBlockIndex = j;
        break;
      }
    }

    if (orderBlockIndex === null) {
      orderBlocks.push(null);
      continue;
    }

    // Check if order block has above average volume
    const avgVolume =
      volumes.slice(Math.max(0, orderBlockIndex - 20), orderBlockIndex).reduce((a, b) => a + b, 0) / 20;

    const highVolume = volumes[orderBlockIndex] > avgVolume * minVolumeRatio;

    if (highVolume) {
      orderBlocks.push({
        type: 'BULLISH',
        index: orderBlockIndex,
        high: candles[orderBlockIndex].high,
        low: candles[orderBlockIndex].low,
        open: candles[orderBlockIndex].open,
        close: candles[orderBlockIndex].close,
        volume: volumes[orderBlockIndex],
        strength: strongMoves[i].strength
      });
    } else {
      orderBlocks.push(null);
    }
  }

  return orderBlocks;
}

/**
 * Identify bearish order blocks
 * Last bullish candle before strong bearish move
 */
function identifyBearishOrderBlocks(candles, strongMoves, volumes, config) {
  const { minVolumeRatio = 1.2, lookbackPeriod = 20 } = config;

  const orderBlocks = [];

  for (let i = 1; i < candles.length; i++) {
    if (!strongMoves[i] || strongMoves[i].type !== 'BEARISH') {
      orderBlocks.push(null);
      continue;
    }

    // Look for the last bullish candle before this bearish move
    let orderBlockIndex = null;
    for (let j = i - 1; j >= Math.max(0, i - lookbackPeriod); j--) {
      if (candles[j].close > candles[j].open) {
        orderBlockIndex = j;
        break;
      }
    }

    if (orderBlockIndex === null) {
      orderBlocks.push(null);
      continue;
    }

    // Check if order block has above average volume
    const avgVolume =
      volumes.slice(Math.max(0, orderBlockIndex - 20), orderBlockIndex).reduce((a, b) => a + b, 0) / 20;

    const highVolume = volumes[orderBlockIndex] > avgVolume * minVolumeRatio;

    if (highVolume) {
      orderBlocks.push({
        type: 'BEARISH',
        index: orderBlockIndex,
        high: candles[orderBlockIndex].high,
        low: candles[orderBlockIndex].low,
        open: candles[orderBlockIndex].open,
        close: candles[orderBlockIndex].close,
        volume: volumes[orderBlockIndex],
        strength: strongMoves[i].strength
      });
    } else {
      orderBlocks.push(null);
    }
  }

  return orderBlocks;
}

/**
 * Check if price is testing an order block
 */
function checkOrderBlockTest(candles, orderBlock, currentIndex, config) {
  const { testThreshold = 0.002 } = config; // 0.2% threshold

  if (!orderBlock) return false;

  const currentPrice = candles[currentIndex].close;
  const blockHigh = orderBlock.high;
  const blockLow = orderBlock.low;

  // For bullish OB, check if price is testing the low
  if (orderBlock.type === 'BULLISH') {
    const distance = Math.abs(currentPrice - blockLow);
    const threshold = blockLow * testThreshold;
    return distance <= threshold && currentPrice >= blockLow;
  }

  // For bearish OB, check if price is testing the high
  if (orderBlock.type === 'BEARISH') {
    const distance = Math.abs(currentPrice - blockHigh);
    const threshold = blockHigh * testThreshold;
    return distance <= threshold && currentPrice <= blockHigh;
  }

  return false;
}

/**
 * Detect Order Blocks
 *
 * @param {Array} candles - Array of OHLCV candles
 * @param {Object} config - Configuration parameters
 * @returns {Object} Order block signals
 */
export function detectOrderBlocks(candles, config = {}) {
  const {
    atrPeriod = 14,
    minMoveMultiplier = 2,
    minConsecutiveBars = 3,
    minVolumeRatio = 1.2,
    lookbackPeriod = 20,
    testThreshold = 0.002,
    maxOrderBlockAge = 100 // Maximum bars to keep an OB active
  } = config;

  const minRequired = Math.max(atrPeriod, lookbackPeriod, minConsecutiveBars) + 10;

  if (candles.length < minRequired) {
    return null;
  }

  try {
    // Calculate ATR for volatility measurement
    const atr = calculateATR(candles, atrPeriod);

    // Detect strong directional moves
    const strongMoves = detectStrongMoves(candles, atr, {
      minMoveMultiplier,
      minConsecutiveBars
    });

    // Get volumes
    const volumes = candles.map(c => c.volume);

    // Identify order blocks
    const bullishOBs = identifyBullishOrderBlocks(candles, strongMoves, volumes, {
      minVolumeRatio,
      lookbackPeriod
    });

    const bearishOBs = identifyBearishOrderBlocks(candles, strongMoves, volumes, {
      minVolumeRatio,
      lookbackPeriod
    });

    // Find active order blocks (recent and not too old)
    const lastIdx = candles.length - 1;
    const activeBullishOBs = [];
    const activeBearishOBs = [];

    for (let i = Math.max(0, lastIdx - maxOrderBlockAge); i < bullishOBs.length; i++) {
      if (bullishOBs[i]) {
        activeBullishOBs.push(bullishOBs[i]);
      }
    }

    for (let i = Math.max(0, lastIdx - maxOrderBlockAge); i < bearishOBs.length; i++) {
      if (bearishOBs[i]) {
        activeBearishOBs.push(bearishOBs[i]);
      }
    }

    // Check if current price is testing any active order block
    let signal = null;
    let testedBullishOB = null;
    let testedBearishOB = null;

    for (const ob of activeBullishOBs) {
      if (checkOrderBlockTest(candles, ob, lastIdx, { testThreshold })) {
        signal = 'BUY';
        testedBullishOB = ob;
        break;
      }
    }

    for (const ob of activeBearishOBs) {
      if (checkOrderBlockTest(candles, ob, lastIdx, { testThreshold })) {
        signal = 'SELL';
        testedBearishOB = ob;
        break;
      }
    }

    return {
      signal,
      bullishOB: testedBullishOB,
      bearishOB: testedBearishOB,
      activeBullishOBs: activeBullishOBs.length,
      activeBearishOBs: activeBearishOBs.length,
      allBullishOBs: activeBullishOBs,
      allBearishOBs: activeBearishOBs,
      timestamp: candles[lastIdx].timestamp
    };
  } catch (error) {
    console.error('Error detecting order blocks:', error);
    return null;
  }
}

/**
 * Check if there's a bullish order block being tested
 */
export function isBullishOrderBlock(candles, config = {}) {
  const result = detectOrderBlocks(candles, config);
  return result && result.signal === 'BUY';
}

/**
 * Check if there's a bearish order block being tested
 */
export function isBearishOrderBlock(candles, config = {}) {
  const result = detectOrderBlocks(candles, config);
  return result && result.signal === 'SELL';
}
