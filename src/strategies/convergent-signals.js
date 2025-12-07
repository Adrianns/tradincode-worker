/**
 * Convergent Signals Strategy
 * Combines multiple indicators to generate high-confidence signals
 *
 * Strategy Logic:
 * - BUY: When N or more indicators give BUY signals simultaneously
 * - SELL: When N or more indicators give SELL signals simultaneously
 * - Configurable minimum convergence requirement (default: 2)
 */

import { calculateAllSignals, getSignalsSummary } from '../indicators/index.js';

/**
 * Calculate convergent signal strength
 *
 * @param {Object} signals - All indicator signals
 * @param {Object} config - Strategy configuration
 * @returns {Object} Convergence analysis
 */
function calculateConvergence(signals, config = {}) {
  const {
    requiredConvergence = 2,
    weights = {
      heikinAshi: 1.0,
      tlSignals: 1.0,
      koncorde: 1.0,
      lupown: 1.2, // Higher weight for Lupown (Sommi diamonds are strong)
      whales: 0.8, // Lower weight (more confirmation than standalone)
      divergences: 1.0,
      orderBlocks: 1.1 // Slightly higher weight (institutional activity)
    }
  } = config;

  let buyScore = 0;
  let sellScore = 0;
  let buyIndicators = [];
  let sellIndicators = [];

  // Heikin Ashi
  if (signals.heikinAshi?.signal === 'BUY') {
    buyScore += weights.heikinAshi;
    buyIndicators.push('Heikin Ashi');
  } else if (signals.heikinAshi?.signal === 'SELL') {
    sellScore += weights.heikinAshi;
    sellIndicators.push('Heikin Ashi');
  }

  // TL Signals
  if (signals.tlSignals?.signal === 'BUY') {
    buyScore += weights.tlSignals;
    buyIndicators.push('TL Signals');
  } else if (signals.tlSignals?.signal === 'SELL') {
    sellScore += weights.tlSignals;
    sellIndicators.push('TL Signals');
  }

  // Koncorde
  if (signals.koncorde?.signal === 'BUY') {
    buyScore += weights.koncorde;
    buyIndicators.push('Koncorde');
  } else if (signals.koncorde?.signal === 'SELL') {
    sellScore += weights.koncorde;
    sellIndicators.push('Koncorde');
  }

  // Lupown
  if (signals.lupown?.signal === 'BUY') {
    buyScore += weights.lupown;
    buyIndicators.push('Lupown');
    // Extra weight for diamond signals
    if (signals.lupown.diamond === 'BULLISH') {
      buyScore += 0.5;
      buyIndicators.push('Lupown Diamond');
    }
  } else if (signals.lupown?.signal === 'SELL') {
    sellScore += weights.lupown;
    sellIndicators.push('Lupown');
    if (signals.lupown.diamond === 'BEARISH') {
      sellScore += 0.5;
      sellIndicators.push('Lupown Diamond');
    }
  }

  // Whale Detector
  if (signals.whales?.signal === 'BUY') {
    buyScore += weights.whales;
    buyIndicators.push('Whale Detector');
  } else if (signals.whales?.signal === 'SELL') {
    sellScore += weights.whales;
    sellIndicators.push('Whale Detector');
  }

  // Divergences
  if (signals.divergences?.signal === 'BUY') {
    buyScore += weights.divergences;
    buyIndicators.push('Divergences');
    // Extra weight for regular bullish divergences (stronger signal)
    if (signals.divergences.regularBullish) {
      buyScore += 0.3;
    }
  } else if (signals.divergences?.signal === 'SELL') {
    sellScore += weights.divergences;
    sellIndicators.push('Divergences');
    if (signals.divergences.regularBearish) {
      sellScore += 0.3;
    }
  }

  // Order Blocks
  if (signals.orderBlocks?.signal === 'BUY') {
    buyScore += weights.orderBlocks;
    buyIndicators.push('Order Blocks');
  } else if (signals.orderBlocks?.signal === 'SELL') {
    sellScore += weights.orderBlocks;
    sellIndicators.push('Order Blocks');
  }

  return {
    buyScore,
    sellScore,
    buyIndicators,
    sellIndicators,
    buyCount: buyIndicators.length,
    sellCount: sellIndicators.length,
    convergenceThreshold: requiredConvergence
  };
}

/**
 * Check for conflicting signals (filters)
 *
 * @param {Object} signals - All indicator signals
 * @returns {Object} Conflict analysis
 */
function checkConflicts(signals) {
  const conflicts = {
    hasConflicts: false,
    conflictingIndicators: [],
    warnings: []
  };

  // Bearish order block while other indicators are bullish
  if (
    signals.orderBlocks?.signal === 'SELL' &&
    (signals.heikinAshi?.signal === 'BUY' ||
      signals.tlSignals?.signal === 'BUY' ||
      signals.lupown?.signal === 'BUY')
  ) {
    conflicts.hasConflicts = true;
    conflicts.warnings.push('Bearish order block overhead - resistance expected');
  }

  // Bullish order block while other indicators are bearish
  if (
    signals.orderBlocks?.signal === 'BUY' &&
    (signals.heikinAshi?.signal === 'SELL' ||
      signals.tlSignals?.signal === 'SELL' ||
      signals.lupown?.signal === 'SELL')
  ) {
    conflicts.hasConflicts = true;
    conflicts.warnings.push('Bullish order block below - support expected');
  }

  // Whale distribution while trying to buy
  if (signals.whales?.whaleType === 'DISTRIBUTION' && signals.heikinAshi?.signal === 'BUY') {
    conflicts.hasConflicts = true;
    conflicts.warnings.push('Whale distribution detected - institutional selling');
  }

  // Whale accumulation while trying to sell
  if (signals.whales?.whaleType === 'ACCUMULATION' && signals.heikinAshi?.signal === 'SELL') {
    conflicts.hasConflicts = true;
    conflicts.warnings.push('Whale accumulation detected - institutional buying');
  }

  return conflicts;
}

/**
 * Calculate convergent strategy signal
 *
 * @param {Array} candles - Array of OHLCV candles
 * @param {Object} config - Strategy configuration
 * @returns {Object} Convergent signal with full analysis
 */
export async function calculateConvergentSignal(candles, config = {}) {
  const {
    requiredConvergence = 2,
    useWeights = true,
    checkConflictsEnabled = true,
    indicatorConfigs = {}
  } = config;

  try {
    // Calculate all indicator signals
    const signals = await calculateAllSignals(candles, {
      useHeikinAshi: true,
      useTLSignals: true,
      useKoncorde: true,
      useLupown: true,
      useWhaleDetector: true,
      useDivergences: true,
      useOrderBlocks: true,
      ...indicatorConfigs
    });

    // Get basic summary
    const summary = getSignalsSummary(signals);

    // Calculate convergence
    const convergence = calculateConvergence(signals, {
      requiredConvergence,
      ...config
    });

    // Check for conflicts
    const conflicts = checkConflictsEnabled ? checkConflicts(signals) : { hasConflicts: false };

    // Determine final signal
    let signal = null;
    let confidence = 0;
    let reason = '';

    if (useWeights) {
      // Use weighted scoring
      const minScore = requiredConvergence;

      if (convergence.buyScore >= minScore && convergence.buyScore > convergence.sellScore) {
        signal = 'BUY';
        confidence = Math.min(100, (convergence.buyScore / 7) * 100); // Max 7 indicators
        reason = `${convergence.buyCount} bullish signals (score: ${convergence.buyScore.toFixed(2)})`;
      } else if (
        convergence.sellScore >= minScore &&
        convergence.sellScore > convergence.buyScore
      ) {
        signal = 'SELL';
        confidence = Math.min(100, (convergence.sellScore / 7) * 100);
        reason = `${convergence.sellCount} bearish signals (score: ${convergence.sellScore.toFixed(2)})`;
      }
    } else {
      // Use simple count-based convergence
      if (
        convergence.buyCount >= requiredConvergence &&
        convergence.buyCount > convergence.sellCount
      ) {
        signal = 'BUY';
        confidence = (convergence.buyCount / 7) * 100;
        reason = `${convergence.buyCount}/${7} indicators bullish`;
      } else if (
        convergence.sellCount >= requiredConvergence &&
        convergence.sellCount > convergence.buyCount
      ) {
        signal = 'SELL';
        confidence = (convergence.sellCount / 7) * 100;
        reason = `${convergence.sellCount}/${7} indicators bearish`;
      }
    }

    // Reduce confidence if there are conflicts
    if (conflicts.hasConflicts && signal) {
      confidence *= 0.8; // 20% reduction for conflicts
    }

    return {
      signal,
      confidence,
      reason,
      convergence,
      conflicts,
      summary,
      individualSignals: signals,
      timestamp: candles[candles.length - 1].timestamp
    };
  } catch (error) {
    console.error('Error calculating convergent signal:', error);
    return null;
  }
}

/**
 * Check if convergent strategy should trigger a buy
 *
 * @param {Array} candles - Array of OHLCV candles
 * @param {Object} config - Strategy configuration
 * @returns {boolean} True if buy signal with sufficient convergence
 */
export async function shouldBuyConvergent(candles, config = {}) {
  const result = await calculateConvergentSignal(candles, config);
  return result && result.signal === 'BUY';
}

/**
 * Check if convergent strategy should trigger a sell
 *
 * @param {Array} candles - Array of OHLCV candles
 * @param {Object} config - Strategy configuration
 * @returns {boolean} True if sell signal with sufficient convergence
 */
export async function shouldSellConvergent(candles, config = {}) {
  const result = await calculateConvergentSignal(candles, config);
  return result && result.signal === 'SELL';
}

/**
 * Get detailed convergence report for analysis
 *
 * @param {Object} convergentSignal - Result from calculateConvergentSignal
 * @returns {string} Human-readable report
 */
export function getConvergenceReport(convergentSignal) {
  if (!convergentSignal) {
    return 'No convergent signal data available';
  }

  const lines = [];
  lines.push('=== CONVERGENT SIGNAL ANALYSIS ===\n');

  // Overall signal
  if (convergentSignal.signal) {
    lines.push(`Signal: ${convergentSignal.signal}`);
    lines.push(`Confidence: ${convergentSignal.confidence.toFixed(1)}%`);
    lines.push(`Reason: ${convergentSignal.reason}\n`);
  } else {
    lines.push('Signal: NONE (insufficient convergence)\n');
  }

  // Bullish indicators
  if (convergentSignal.convergence.buyIndicators.length > 0) {
    lines.push('Bullish Indicators:');
    convergentSignal.convergence.buyIndicators.forEach(ind => {
      lines.push(`  ✓ ${ind}`);
    });
    lines.push('');
  }

  // Bearish indicators
  if (convergentSignal.convergence.sellIndicators.length > 0) {
    lines.push('Bearish Indicators:');
    convergentSignal.convergence.sellIndicators.forEach(ind => {
      lines.push(`  ✗ ${ind}`);
    });
    lines.push('');
  }

  // Conflicts/Warnings
  if (convergentSignal.conflicts.hasConflicts) {
    lines.push('⚠️  Warnings:');
    convergentSignal.conflicts.warnings.forEach(warning => {
      lines.push(`  - ${warning}`);
    });
    lines.push('');
  }

  // Summary
  lines.push('Summary:');
  lines.push(`  Buy Signals: ${convergentSignal.summary.buyCount}`);
  lines.push(`  Sell Signals: ${convergentSignal.summary.sellCount}`);
  lines.push(`  Neutral: ${convergentSignal.summary.neutralCount}`);

  return lines.join('\n');
}
