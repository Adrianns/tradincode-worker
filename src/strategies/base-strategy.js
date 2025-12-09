/**
 * Base Strategy
 * Abstract class for all trading strategies
 */

export class BaseStrategy {
  constructor(account) {
    this.account = account;
  }

  /**
   * Calculate signals for this strategy
   * @param {Object} marketData - Market data from Binance
   * @param {Object} allIndicatorSignals - Pre-calculated signals from all indicators
   * @returns {Object} { signal: 'BUY' | 'SELL' | null, metadata: {...} }
   */
  async calculateSignals(marketData, allIndicatorSignals) {
    throw new Error('calculateSignals() must be implemented by subclass');
  }

  /**
   * Check if should buy
   * @param {Object} marketData - Market data
   * @param {Object} signals - Signals from calculateSignals()
   * @param {Object} activePosition - Current active position (null if none)
   * @returns {boolean} True if should buy
   */
  async shouldBuy(marketData, signals, activePosition) {
    throw new Error('shouldBuy() must be implemented by subclass');
  }

  /**
   * Check if should sell
   * @param {Object} marketData - Market data
   * @param {Object} signals - Signals from calculateSignals()
   * @param {Object} activePosition - Current active position
   * @returns {boolean} True if should sell
   */
  async shouldSell(marketData, signals, activePosition) {
    throw new Error('shouldSell() must be implemented by subclass');
  }

  /**
   * Get strategy metadata
   * @returns {Object} { name, description, suggestedBalance }
   */
  getMetadata() {
    return {
      name: this.constructor.name,
      description: 'Base strategy',
      suggestedBalance: 1000
    };
  }
}
