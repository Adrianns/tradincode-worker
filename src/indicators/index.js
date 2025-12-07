/**
 * Indicators Index
 * Central export point for all trading indicators
 */

// Import all indicators
import {
  calculateHeikinAshiSignals,
  shouldBuyHeikinAshi,
  shouldSellHeikinAshi
} from './heikin-ashi.js';

import {
  calculateTLSignals,
  shouldBuyTL,
  shouldSellTL
} from './tl-signals.js';

import {
  calculateKoncordeSignals,
  shouldBuyKoncorde,
  shouldSellKoncorde
} from './koncorde.js';

import {
  calculateLupownSignals,
  shouldBuyLupown,
  shouldSellLupown
} from './lupown.js';

import {
  detectWhales,
  isBullishWhaleActivity,
  isBearishWhaleActivity
} from './whale-detector.js';

import {
  detectDivergences,
  hasBullishDivergence,
  hasBearishDivergence
} from './divergences.js';

import {
  detectOrderBlocks,
  isBullishOrderBlock,
  isBearishOrderBlock
} from './order-blocks.js';

// Export individual indicators
export {
  // Heikin Ashi
  calculateHeikinAshiSignals,
  shouldBuyHeikinAshi,
  shouldSellHeikinAshi,

  // TL Signals
  calculateTLSignals,
  shouldBuyTL,
  shouldSellTL,

  // Koncorde
  calculateKoncordeSignals,
  shouldBuyKoncorde,
  shouldSellKoncorde,

  // Lupown
  calculateLupownSignals,
  shouldBuyLupown,
  shouldSellLupown,

  // Whale Detector
  detectWhales,
  isBullishWhaleActivity,
  isBearishWhaleActivity,

  // Divergences
  detectDivergences,
  hasBullishDivergence,
  hasBearishDivergence,

  // Order Blocks
  detectOrderBlocks,
  isBullishOrderBlock,
  isBearishOrderBlock
};

/**
 * Calculate all indicator signals for given candles
 *
 * @param {Array} candles - Array of OHLCV candles
 * @param {Object} options - Configuration for which indicators to calculate
 * @returns {Object} All calculated indicator signals
 */
export async function calculateAllSignals(candles, options = {}) {
  const {
    useHeikinAshi = true,
    useTLSignals = true,
    useKoncorde = true,
    useLupown = true,
    useWhaleDetector = true,
    useDivergences = true,
    useOrderBlocks = true,

    // Individual indicator configs
    heikinAshiConfig = {},
    tlSignalsConfig = {},
    koncordeConfig = {},
    lupownConfig = {},
    whaleConfig = {},
    divergencesConfig = {},
    orderBlocksConfig = {}
  } = options;

  const results = {
    heikinAshi: null,
    tlSignals: null,
    koncorde: null,
    lupown: null,
    whales: null,
    divergences: null,
    orderBlocks: null,
    timestamp: candles[candles.length - 1].timestamp
  };

  try {
    // Calculate each indicator (in parallel where possible)
    const promises = [];

    if (useHeikinAshi) {
      promises.push(
        (async () => {
          results.heikinAshi = calculateHeikinAshiSignals(candles, heikinAshiConfig.emaLength);
        })()
      );
    }

    if (useTLSignals) {
      promises.push(
        (async () => {
          results.tlSignals = calculateTLSignals(candles, tlSignalsConfig);
        })()
      );
    }

    if (useKoncorde) {
      promises.push(
        (async () => {
          results.koncorde = calculateKoncordeSignals(candles, koncordeConfig);
        })()
      );
    }

    if (useLupown) {
      promises.push(
        (async () => {
          results.lupown = calculateLupownSignals(candles, lupownConfig);
        })()
      );
    }

    if (useWhaleDetector) {
      promises.push(
        (async () => {
          results.whales = detectWhales(candles, whaleConfig);
        })()
      );
    }

    if (useDivergences) {
      promises.push(
        (async () => {
          results.divergences = detectDivergences(candles, divergencesConfig);
        })()
      );
    }

    if (useOrderBlocks) {
      promises.push(
        (async () => {
          results.orderBlocks = detectOrderBlocks(candles, orderBlocksConfig);
        })()
      );
    }

    // Wait for all indicators to complete
    await Promise.all(promises);

    return results;
  } catch (error) {
    console.error('Error calculating all signals:', error);
    return results;
  }
}

/**
 * Get a summary of all active signals
 *
 * @param {Object} signals - Results from calculateAllSignals
 * @returns {Object} Summary of all signals
 */
export function getSignalsSummary(signals) {
  const summary = {
    buySignals: [],
    sellSignals: [],
    neutralSignals: [],
    totalSignals: 0,
    buyCount: 0,
    sellCount: 0,
    neutralCount: 0
  };

  const indicators = [
    { name: 'Heikin Ashi', data: signals.heikinAshi },
    { name: 'TL Signals', data: signals.tlSignals },
    { name: 'Koncorde', data: signals.koncorde },
    { name: 'Lupown', data: signals.lupown },
    { name: 'Whales', data: signals.whales },
    { name: 'Divergences', data: signals.divergences },
    { name: 'Order Blocks', data: signals.orderBlocks }
  ];

  for (const indicator of indicators) {
    if (!indicator.data) {
      summary.neutralSignals.push(indicator.name);
      summary.neutralCount++;
      continue;
    }

    const signal = indicator.data.signal;

    if (signal === 'BUY') {
      summary.buySignals.push(indicator.name);
      summary.buyCount++;
    } else if (signal === 'SELL') {
      summary.sellSignals.push(indicator.name);
      summary.sellCount++;
    } else {
      summary.neutralSignals.push(indicator.name);
      summary.neutralCount++;
    }

    summary.totalSignals++;
  }

  return summary;
}

/**
 * Default indicator configurations
 */
export const DEFAULT_CONFIGS = {
  heikinAshi: {
    emaLength: 55
  },
  tlSignals: {
    adxLength: 14,
    adxThreshold: 25,
    momentumPeriod: 10,
    pivotLeftBars: 5,
    pivotRightBars: 5
  },
  koncorde: {
    pviPeriod: 255,
    nviPeriod: 255,
    mfiPeriod: 14,
    mfiOverbought: 80,
    mfiOversold: 20,
    bbPeriod: 20,
    bbStdDev: 2
  },
  lupown: {
    wtChannelLen: 10,
    wtAverageLen: 21,
    rsiPeriod: 14,
    mfiPeriod: 14,
    wtOverbought: 53,
    wtOversold: -53
  },
  whaleDetector: {
    volumePeriod: 20,
    volumeMultiplier: 2.5,
    minVolumeThreshold: 1.5,
    vwapPeriod: 14,
    minPriceChange: 0.5,
    minBodyStrength: 0.6
  },
  divergences: {
    rsiPeriod: 14,
    pivotLeftBars: 5,
    pivotRightBars: 5,
    minPivotDistance: 5,
    lookbackPeriod: 60
  },
  orderBlocks: {
    atrPeriod: 14,
    minMoveMultiplier: 2,
    minConsecutiveBars: 3,
    minVolumeRatio: 1.2,
    lookbackPeriod: 20,
    testThreshold: 0.002,
    maxOrderBlockAge: 100
  }
};
