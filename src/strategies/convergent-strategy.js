/**
 * Convergent Signals Strategy
 * Combines multiple indicators with weighted scoring
 */

import { BaseStrategy } from './base-strategy.js';
import { calculateConvergentSignal } from './convergent-signals.js';

export class ConvergentStrategy extends BaseStrategy {
  getMetadata() {
    return {
      name: 'Convergent Signals',
      description: 'Combines 7 indicators with weighted scoring',
      suggestedBalance: 1500
    };
  }

  async calculateSignals(marketData, allIndicatorSignals) {
    const candles = marketData.dailyKlines.map(k => ({
      timestamp: k.openTime,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume
    }));

    try {
      const result = await calculateConvergentSignal(candles, {
        requiredConvergence: this.account.required_convergence || 2,
        useWeights: true
      });

      return result;
    } catch (error) {
      console.error('Error calculating convergent signals:', error);
      return {
        signal: null,
        reason: 'Error calculating convergent signals'
      };
    }
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
