/**
 * Utility functions for indicator calculations
 */

/**
 * Calculate Simple Moving Average (SMA)
 */
export function calculateSMA(values, period) {
  if (values.length < period) {
    return new Array(values.length).fill(null);
  }

  const sma = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      sma.push(null);
    } else {
      const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
  }

  return sma;
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
export function calculateEMA(values, period) {
  if (values.length < period) {
    return new Array(values.length).fill(null);
  }

  const multiplier = 2 / (period + 1);
  const ema = [];

  // Calculate initial SMA for first EMA value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
    ema.push(null);
  }

  ema[period - 1] = sum / period;

  // Calculate EMA for remaining values
  for (let i = period; i < values.length; i++) {
    const currentEma = (values[i] - ema[i - 1]) * multiplier + ema[i - 1];
    ema.push(currentEma);
  }

  return ema;
}

/**
 * Calculate Weighted Moving Average (WMA)
 */
export function calculateWMA(values, period) {
  if (values.length < period) {
    return new Array(values.length).fill(null);
  }

  const wma = [];
  const weightSum = (period * (period + 1)) / 2;

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      wma.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += values[i - j] * (period - j);
      }
      wma.push(sum / weightSum);
    }
  }

  return wma;
}

/**
 * Calculate OHLC4 (average of open, high, low, close)
 */
export function ohlc4(candle) {
  return (candle.open + candle.high + candle.low + candle.close) / 4;
}

/**
 * Calculate HLC3 (average of high, low, close)
 */
export function hlc3(candle) {
  return (candle.high + candle.low + candle.close) / 3;
}

/**
 * Calculate HL2 (average of high and low)
 */
export function hl2(candle) {
  return (candle.high + candle.low) / 2;
}

/**
 * Calculate typical price (HLC/3)
 */
export function typicalPrice(candle) {
  return hlc3(candle);
}

/**
 * Calculate Relative Strength Index (RSI)
 */
export function calculateRSI(values, period = 14) {
  if (values.length < period + 1) {
    return new Array(values.length).fill(null);
  }

  const rsi = [];
  const gains = [];
  const losses = [];

  // Calculate price changes
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      gains.push(0);
      losses.push(0);
      rsi.push(null);
    } else {
      const change = values[i] - values[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? -change : 0);
      rsi.push(null);
    }
  }

  // Calculate initial average gain and loss
  let avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;

  // Calculate first RSI
  if (avgLoss === 0) {
    rsi[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    rsi[period] = 100 - (100 / (1 + rs));
  }

  // Calculate RSI for remaining values using Wilder's smoothing
  for (let i = period + 1; i < values.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    if (avgLoss === 0) {
      rsi[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i] = 100 - (100 / (1 + rs));
    }
  }

  return rsi;
}

/**
 * Calculate Money Flow Index (MFI)
 */
export function calculateMFI(candles, period = 14) {
  if (candles.length < period + 1) {
    return new Array(candles.length).fill(null);
  }

  const mfi = [];
  const typicalPrices = candles.map(c => typicalPrice(c));
  const rawMoneyFlow = candles.map((c, i) => typicalPrices[i] * c.volume);

  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      mfi.push(null);
    } else {
      let positiveFlow = 0;
      let negativeFlow = 0;

      for (let j = i - period + 1; j <= i; j++) {
        if (typicalPrices[j] > typicalPrices[j - 1]) {
          positiveFlow += rawMoneyFlow[j];
        } else {
          negativeFlow += rawMoneyFlow[j];
        }
      }

      if (negativeFlow === 0) {
        mfi.push(100);
      } else {
        const moneyRatio = positiveFlow / negativeFlow;
        mfi.push(100 - (100 / (1 + moneyRatio)));
      }
    }
  }

  return mfi;
}

/**
 * Calculate Standard Deviation
 */
export function calculateStdDev(values, period, useSMA = true) {
  if (values.length < period) {
    return new Array(values.length).fill(null);
  }

  const stdDev = [];
  const ma = useSMA ? calculateSMA(values, period) : calculateEMA(values, period);

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1 || ma[i] === null) {
      stdDev.push(null);
    } else {
      const slice = values.slice(i - period + 1, i + 1);
      const mean = ma[i];
      const squaredDiffs = slice.map(v => Math.pow(v - mean, 2));
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
      stdDev.push(Math.sqrt(variance));
    }
  }

  return stdDev;
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(values, period = 20, multiplier = 2) {
  const middle = calculateSMA(values, period);
  const stdDev = calculateStdDev(values, period);

  const upper = middle.map((m, i) =>
    m !== null && stdDev[i] !== null ? m + multiplier * stdDev[i] : null
  );
  const lower = middle.map((m, i) =>
    m !== null && stdDev[i] !== null ? m - multiplier * stdDev[i] : null
  );

  return { upper, middle, lower };
}

/**
 * Calculate Average True Range (ATR)
 */
export function calculateATR(candles, period = 14) {
  const tr = [];

  // Calculate True Range
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

  // Calculate ATR using Wilder's smoothing (like EMA with alpha = 1/period)
  const atr = [];
  let sum = 0;

  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) {
      sum += tr[i];
      atr.push(null);
    } else if (i === period - 1) {
      sum += tr[i];
      atr.push(sum / period);
    } else {
      const currentATR = (atr[i - 1] * (period - 1) + tr[i]) / period;
      atr.push(currentATR);
    }
  }

  return atr;
}

/**
 * Find highest value in last N periods
 */
export function highest(values, period) {
  const highs = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      highs.push(null);
    } else {
      const slice = values.slice(i - period + 1, i + 1);
      highs.push(Math.max(...slice));
    }
  }

  return highs;
}

/**
 * Find lowest value in last N periods
 */
export function lowest(values, period) {
  const lows = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      lows.push(null);
    } else {
      const slice = values.slice(i - period + 1, i + 1);
      lows.push(Math.min(...slice));
    }
  }

  return lows;
}
