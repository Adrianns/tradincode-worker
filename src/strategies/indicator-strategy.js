/**
 * Indicator Strategy
 * Wrapper for individual indicator strategies
 */

import { BaseStrategy } from './base-strategy.js';

export class IndicatorStrategy extends BaseStrategy {
  constructor(account) {
    super(account);
    this.indicatorName = account.strategy;
  }

  getMetadata() {
    const suggestions = {
      'heikin_ashi': {
        balance: 1000,
        description: 'Double Triple EMA with YASIN crossovers'
      },
      'tl_signals': {
        balance: 800,
        description: 'ADX + Momentum pivots'
      },
      'koncorde': {
        balance: 1200,
        description: 'PVI/NVI/MFI/Bollinger'
      },
      'lupown': {
        balance: 1000,
        description: 'WaveTrend + Sommi diamonds'
      },
      'whale_detector': {
        balance: 2000,
        description: 'Volume spike + VWAP (high risk/reward)'
      },
      'divergences': {
        balance: 1000,
        description: 'Regular + Hidden divergences'
      },
      'order_blocks': {
        balance: 1500,
        description: 'Institutional activity zones'
      }
    };

    const metadata = suggestions[this.indicatorName] || {
      balance: 1000,
      description: 'Indicator strategy'
    };

    return {
      name: this.indicatorName,
      ...metadata
    };
  }

  getIndicatorKey() {
    const mapping = {
      'heikin_ashi': 'heikinAshi',
      'tl_signals': 'tlSignals',
      'koncorde': 'koncorde',
      'lupown': 'lupown',
      'whale_detector': 'whales',
      'divergences': 'divergences',
      'order_blocks': 'orderBlocks'
    };

    return mapping[this.indicatorName] || 'heikinAshi';
  }

  async calculateSignals(marketData, allIndicatorSignals) {
    const indicatorKey = this.getIndicatorKey();
    const signals = allIndicatorSignals[indicatorKey];

    if (!signals) {
      return {
        signal: null,
        reason: `No signals from ${this.indicatorName}`
      };
    }

    return signals;
  }

  async shouldBuy(marketData, signals, activePosition) {
    if (activePosition) {
      return false;
    }

    if (!signals || signals.signal !== 'BUY') {
      return false;
    }

    return true;
  }

  async shouldSell(marketData, signals, activePosition) {
    if (!activePosition) {
      return false;
    }

    if (!signals || signals.signal !== 'SELL') {
      return false;
    }

    return true;
  }
}
