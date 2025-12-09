/**
 * Strategy Factory
 * Creates strategy instances based on account configuration
 */

import { TrendShieldStrategy } from './strategies/trend-shield-strategy.js';
import { ConvergentStrategy } from './strategies/convergent-strategy.js';
import { IndicatorStrategy } from './strategies/indicator-strategy.js';

/**
 * Create strategy instance for an account
 */
export function createStrategy(account) {
  switch (account.strategy) {
    case 'trend_shield':
      return new TrendShieldStrategy(account);

    case 'convergent':
      return new ConvergentStrategy(account);

    case 'heikin_ashi':
    case 'tl_signals':
    case 'koncorde':
    case 'lupown':
    case 'whale_detector':
    case 'divergences':
    case 'order_blocks':
      return new IndicatorStrategy(account);

    default:
      throw new Error(`Unknown strategy: ${account.strategy}`);
  }
}

/**
 * Get list of available strategies
 */
export function getAvailableStrategies() {
  return [
    {
      value: 'trend_shield',
      label: 'Trend Shield',
      description: 'EMA 200 + SuperTrend + ATR',
      suggestedBalance: 1000
    },
    {
      value: 'convergent',
      label: 'Convergent Signals',
      description: '2+ indicators agreement',
      suggestedBalance: 1500
    },
    {
      value: 'heikin_ashi',
      label: 'Heikin Ashi',
      description: 'Double Triple EMA with YASIN',
      suggestedBalance: 1000
    },
    {
      value: 'tl_signals',
      label: 'TL Signals',
      description: 'ADX + Momentum pivots',
      suggestedBalance: 800
    },
    {
      value: 'koncorde',
      label: 'Koncorde',
      description: 'PVI/NVI/MFI/Bollinger',
      suggestedBalance: 1200
    },
    {
      value: 'lupown',
      label: 'Lupown (Sommi)',
      description: 'WaveTrend + Sommi diamonds',
      suggestedBalance: 1000
    },
    {
      value: 'whale_detector',
      label: 'Whale Detector',
      description: 'Volume spike + VWAP',
      suggestedBalance: 2000
    },
    {
      value: 'divergences',
      label: 'Divergences',
      description: 'Regular + Hidden divergences',
      suggestedBalance: 1000
    },
    {
      value: 'order_blocks',
      label: 'Order Blocks',
      description: 'Institutional activity zones',
      suggestedBalance: 1500
    }
  ];
}

/**
 * Get list of available timeframes
 */
export function getAvailableTimeframes() {
  return [
    { value: '15m', label: '15 Minutes', description: 'Very short-term (high frequency)' },
    { value: '1h', label: '1 Hour', description: 'Short-term intraday' },
    { value: '4h', label: '4 Hours', description: 'Medium-term intraday' },
    { value: '1d', label: '1 Day', description: 'Daily (default)' },
    { value: '1w', label: '1 Week', description: 'Weekly (swing trading)' }
  ];
}
