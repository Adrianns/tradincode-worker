/**
 * Heikin Ashi Buy/Sell Strategy
 * Based on "Multiple indicators + TL Alerts [LUPOWN]" TradingView indicator
 *
 * Signal Type: Heikin Ashi crossover strategy
 * Timeframe: 1 hour (recommended)
 *
 * This implementation focuses on the Heikin Ashi signals from the full indicator.
 * All other signals (TL, Koncorde, Lupown, Whales, etc.) are documented in:
 * /docs/MULTI_INDICATOR_REFERENCE.md
 */

/**
 * Calculate OHLC4 (average of open, high, low, close)
 */
function ohlc4(candle) {
  return (candle.open + candle.high + candle.low + candle.close) / 4;
}

/**
 * Calculate HLC3 (average of high, low, close)
 */
function hlc3(candle) {
  return (candle.high + candle.low + candle.close) / 3;
}

/**
 * Calculate EMA array (full array of EMA values)
 */
function calculateEMAArray(data, period) {
  if (data.length < period) return [];

  const multiplier = 2 / (period + 1);
  const emaArray = [];

  // Calculate initial SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  let ema = sum / period;
  emaArray.push(ema);

  // Calculate EMA for remaining data points
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
    emaArray.push(ema);
  }

  return emaArray;
}

/**
 * Calculate Triple EMA (TEMA-like calculation)
 * Used in the Heikin Ashi strategy
 */
function calculateTripleEMA(values, period) {
  if (values.length < period * 3) {
    return null;
  }

  // First EMA
  const ema1 = calculateEMAArray(values, period);
  if (ema1.length === 0) return null;

  // Second EMA
  const ema2 = calculateEMAArray(ema1, period);
  if (ema2.length === 0) return null;

  // Third EMA
  const ema3 = calculateEMAArray(ema2, period);
  if (ema3.length === 0) return null;

  // Calculate TMA: 3 * EMA1 - 3 * EMA2 + EMA3
  const tma = [];
  const minLength = Math.min(ema1.length, ema2.length, ema3.length);

  // Need to offset indices since each EMA reduces the array length
  const offset1 = values.length - ema1.length;
  const offset2 = values.length - ema2.length;
  const offset3 = values.length - ema3.length;

  for (let i = 0; i < values.length; i++) {
    const idx1 = i - offset1;
    const idx2 = i - offset2;
    const idx3 = i - offset3;

    if (idx1 >= 0 && idx2 >= 0 && idx3 >= 0) {
      tma.push(3 * ema1[idx1] - 3 * ema2[idx2] + ema3[idx3]);
    } else {
      tma.push(null);
    }
  }

  return tma;
}

/**
 * Calculate Heikin Ashi values
 */
function calculateHeikinAshi(candles) {
  const haCandles = [];
  let prevHaOpen = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const src = ohlc4(candle);

    // Heikin Ashi Open
    const haOpen = prevHaOpen === null ? src : (src + prevHaOpen) / 2;

    // Heikin Ashi Close
    const maxVal = Math.max(candle.high, haOpen);
    const minVal = Math.min(candle.low, haOpen);
    const haClose = (ohlc4(candle) + haOpen + maxVal + minVal) / 4;

    haCandles.push({
      timestamp: candle.timestamp,
      haOpen,
      haClose
    });

    prevHaOpen = haOpen;
  }

  return haCandles;
}

/**
 * Calculate Heikin Ashi Buy/Sell signals
 *
 * @param {Array} candles - Array of OHLCV candles
 * @param {number} emaLength - EMA period (default 55)
 * @returns {Object} Signal data with buy/sell indicators
 */
export function calculateHeikinAshiSignals(candles, emaLength = 55) {
  if (candles.length < emaLength * 6) {
    console.log(
      `Not enough candles for Heikin Ashi calculation. Need at least ${emaLength * 6}, got ${candles.length}`
    );
    return null;
  }

  try {
    // Calculate Heikin Ashi values
    const haCandles = calculateHeikinAshi(candles);
    const haCloses = haCandles.map(ha => ha.haClose);

    // Calculate first set of EMAs (for YASIN)
    const tma1 = calculateTripleEMA(haCloses, emaLength);
    if (!tma1) return null;

    // Second level triple EMA
    const tma2 = calculateTripleEMA(tma1, emaLength);
    if (!tma2) return null;

    // Calculate YASIN (mavi/kirmizi line)
    const yasin = [];
    const minLength = Math.min(tma1.length, tma2.length);

    for (let i = 0; i < minLength; i++) {
      if (tma1[i] !== null && tma2[i] !== null) {
        const ipek = tma1[i] - tma2[i];
        yasin.push(tma1[i] + ipek);
      } else {
        yasin.push(null);
      }
    }

    // Calculate second set for HLC3
    const hlc3Values = candles.map(c => hlc3(c));
    const tma3 = calculateTripleEMA(hlc3Values, emaLength);
    if (!tma3) return null;

    const tma4 = calculateTripleEMA(tma3, emaLength);
    if (!tma4) return null;

    // Calculate YASIN1
    const yasin1 = [];
    const minLength2 = Math.min(tma3.length, tma4.length);

    for (let i = 0; i < minLength2; i++) {
      if (tma3[i] !== null && tma4[i] !== null) {
        const ipek1 = tma3[i] - tma4[i];
        yasin1.push(tma3[i] + ipek1);
      } else {
        yasin1.push(null);
      }
    }

    // Determine final signal
    const currentIdx = Math.min(yasin.length, yasin1.length) - 1;
    const prevIdx = currentIdx - 1;

    if (currentIdx < 1) return null;

    const mavi = yasin1[currentIdx]; // Blue line
    const kirmizi = yasin[currentIdx]; // Red line
    const prevMavi = yasin1[prevIdx];
    const prevKirmizi = yasin[prevIdx];

    if (
      mavi === null ||
      kirmizi === null ||
      prevMavi === null ||
      prevKirmizi === null
    ) {
      return null;
    }

    // Check for crossovers
    const longCond = mavi > kirmizi && prevMavi <= prevKirmizi;
    const shortCond = mavi < kirmizi && prevMavi >= prevKirmizi;

    let signal = null;
    if (longCond) {
      signal = 'BUY';
    } else if (shortCond) {
      signal = 'SELL';
    }

    return {
      signal,
      mavi,
      kirmizi,
      longCondition: longCond,
      shortCondition: shortCond,
      timestamp: candles[candles.length - 1].timestamp
    };
  } catch (error) {
    console.error('Error calculating Heikin Ashi signals:', error);
    return null;
  }
}

/**
 * Check if Heikin Ashi strategy should trigger a buy
 *
 * @param {Array} candles - Historical candles
 * @param {number} emaLength - EMA period
 * @returns {boolean} True if buy signal detected
 */
export function shouldBuyHeikinAshi(candles, emaLength = 55) {
  const result = calculateHeikinAshiSignals(candles, emaLength);
  return result && result.signal === 'BUY';
}

/**
 * Check if Heikin Ashi strategy should trigger a sell
 *
 * @param {Array} candles - Historical candles
 * @param {number} emaLength - EMA period
 * @returns {boolean} True if sell signal detected
 */
export function shouldSellHeikinAshi(candles, emaLength = 55) {
  const result = calculateHeikinAshiSignals(candles, emaLength);
  return result && result.signal === 'SELL';
}
