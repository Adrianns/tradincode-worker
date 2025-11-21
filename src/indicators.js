/**
 * Calculate Simple Moving Average
 * @param {Array} data - Array of price values
 * @param {number} period - MA period
 */
export function calculateSMA(data, period) {
  if (data.length < period) return null;

  const slice = data.slice(-period);
  const sum = slice.reduce((acc, val) => acc + val, 0);
  return sum / period;
}

/**
 * Calculate Exponential Moving Average
 * @param {Array} data - Array of price values
 * @param {number} period - EMA period
 */
export function calculateEMA(data, period) {
  if (data.length < period) return null;

  const multiplier = 2 / (period + 1);
  let ema = calculateSMA(data.slice(0, period), period);

  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Calculate Relative Strength Index
 * @param {Array} prices - Array of closing prices
 * @param {number} period - RSI period (default 14)
 */
export function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;

  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  let gains = 0;
  let losses = 0;

  // Calculate initial average gain and loss
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      gains += changes[i];
    } else {
      losses += Math.abs(changes[i]);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Calculate RSI using smoothed averages
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return rsi;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * @param {Array} prices - Array of closing prices
 * @param {number} fastPeriod - Fast EMA period (default 12)
 * @param {number} slowPeriod - Slow EMA period (default 26)
 * @param {number} signalPeriod - Signal line period (default 9)
 */
export function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (prices.length < slowPeriod + signalPeriod) return null;

  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);

  if (!fastEMA || !slowEMA) return null;

  const macdLine = fastEMA - slowEMA;

  // Calculate signal line (EMA of MACD line)
  const macdValues = [];
  for (let i = slowPeriod - 1; i < prices.length; i++) {
    const slice = prices.slice(0, i + 1);
    const fast = calculateEMA(slice, fastPeriod);
    const slow = calculateEMA(slice, slowPeriod);
    if (fast && slow) {
      macdValues.push(fast - slow);
    }
  }

  const signal = calculateEMA(macdValues, signalPeriod);

  return {
    macd: macdLine,
    signal: signal,
    histogram: signal ? macdLine - signal : null
  };
}

/**
 * Calculate Bollinger Bands
 * @param {Array} prices - Array of closing prices
 * @param {number} period - Period for SMA (default 20)
 * @param {number} stdDev - Number of standard deviations (default 2)
 */
export function calculateBollingerBands(prices, period = 20, stdDev = 2) {
  if (prices.length < period) return null;

  const slice = prices.slice(-period);
  const sma = calculateSMA(slice, period);

  if (!sma) return null;

  // Calculate standard deviation
  const squaredDiffs = slice.map(price => Math.pow(price - sma, 2));
  const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / period;
  const standardDeviation = Math.sqrt(variance);

  return {
    upper: sma + (standardDeviation * stdDev),
    middle: sma,
    lower: sma - (standardDeviation * stdDev)
  };
}

/**
 * Calculate all indicators for Bitcoin analysis
 * @param {Object} marketData - Market data from Binance
 */
export function calculateAllIndicators(marketData) {
  const { dailyKlines, weeklyKlines, currentPrice } = marketData;

  const dailyClosePrices = dailyKlines.map(k => k.close);
  const weeklyClosePrices = weeklyKlines.map(k => k.close);

  // Calculate Moving Averages (using daily data)
  const ma50 = calculateSMA(dailyClosePrices, 50);
  const ma200 = calculateSMA(dailyClosePrices, 200);

  // Calculate RSI on weekly data
  const rsiWeekly = calculateRSI(weeklyClosePrices, 14);

  // Calculate MACD on weekly data
  const macdWeekly = calculateMACD(weeklyClosePrices, 12, 26, 9);

  // Calculate Bollinger Bands on weekly data
  const bbWeekly = calculateBollingerBands(weeklyClosePrices, 20, 2);

  // Calculate volume trend (last 7 days vs previous 7 days)
  const recentVolume = dailyKlines.slice(-7).reduce((sum, k) => sum + k.volume, 0) / 7;
  const previousVolume = dailyKlines.slice(-14, -7).reduce((sum, k) => sum + k.volume, 0) / 7;
  const volumeIncreasing = recentVolume > previousVolume;
  const volumeChangePercent = ((recentVolume - previousVolume) / previousVolume) * 100;

  return {
    price: currentPrice,
    ma50,
    ma200,
    rsiWeekly,
    macdWeekly: macdWeekly?.macd || null,
    macdSignal: macdWeekly?.signal || null,
    macdHistogram: macdWeekly?.histogram || null,
    bbUpper: bbWeekly?.upper || null,
    bbMiddle: bbWeekly?.middle || null,
    bbLower: bbWeekly?.lower || null,
    volumeIncreasing,
    volumeChangePercent
  };
}

/**
 * Detect Golden Cross (MA50 crosses above MA200)
 * @param {number} currentMA50 - Current 50-day MA
 * @param {number} currentMA200 - Current 200-day MA
 * @param {number} previousMA50 - Previous 50-day MA
 * @param {number} previousMA200 - Previous 200-day MA
 */
export function detectGoldenCross(currentMA50, currentMA200, previousMA50, previousMA200) {
  if (!currentMA50 || !currentMA200 || !previousMA50 || !previousMA200) return false;

  return previousMA50 <= previousMA200 && currentMA50 > currentMA200;
}

/**
 * Detect Death Cross (MA50 crosses below MA200)
 */
export function detectDeathCross(currentMA50, currentMA200, previousMA50, previousMA200) {
  if (!currentMA50 || !currentMA200 || !previousMA50 || !previousMA200) return false;

  return previousMA50 >= previousMA200 && currentMA50 < currentMA200;
}

export default {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateAllIndicators,
  detectGoldenCross,
  detectDeathCross
};
