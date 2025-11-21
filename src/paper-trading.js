import {
  getPaperConfig,
  executeBuyTrade,
  executeSellTrade,
  getAveragePurchasePrice
} from './paper-trading-db.js';

/**
 * Evaluate if conditions are met for a BUY signal
 */
function shouldBuy(config, score, indicators) {
  const reasons = [];

  // Check if paper trading is active
  if (!config.is_active) {
    return { should: false, reasons: ['Paper trading is not active'] };
  }

  // Check if we have USD balance
  if (config.balance_usd <= 0) {
    return { should: false, reasons: ['No USD balance available'] };
  }

  // Check if score meets threshold
  if (score < config.buy_threshold) {
    return {
      should: false,
      reasons: [`Score ${score} below buy threshold ${config.buy_threshold}`]
    };
  }

  // Calculate investment amount
  const usdToInvest = (config.balance_usd * config.percentage_per_trade) / 100;

  // Minimum investment check
  if (usdToInvest < 10) {
    return {
      should: false,
      reasons: [`Investment amount $${usdToInvest.toFixed(2)} below minimum $10`]
    };
  }

  // Build reason string
  reasons.push(`Score ${score}/${config.buy_threshold} - Buy threshold met`);

  if (indicators.rsiWeekly && indicators.rsiWeekly >= 30 && indicators.rsiWeekly <= 50) {
    reasons.push(`RSI weekly at ${indicators.rsiWeekly.toFixed(2)} (accumulation zone)`);
  }

  if (indicators.ma200 && indicators.price < indicators.ma200) {
    const distancePercent = ((indicators.price - indicators.ma200) / indicators.ma200) * 100;
    reasons.push(`Price ${distancePercent.toFixed(2)}% below MA200 (correction)`);
  }

  if (indicators.bbLower && indicators.price < indicators.bbMiddle) {
    reasons.push('Price near lower Bollinger Band (oversold)');
  }

  if (indicators.volumeIncreasing) {
    reasons.push('Volume increasing (trend confirmation)');
  }

  return {
    should: true,
    reasons,
    usdToInvest
  };
}

/**
 * Evaluate if conditions are met for a SELL signal
 */
async function shouldSell(config, score, indicators) {
  const reasons = [];

  // Check if paper trading is active
  if (!config.is_active) {
    return { should: false, reasons: ['Paper trading is not active'] };
  }

  // Check if we have BTC to sell
  if (config.balance_btc <= 0) {
    return { should: false, reasons: ['No BTC balance to sell'] };
  }

  // Get average purchase price
  const avgPurchasePrice = await getAveragePurchasePrice();

  if (!avgPurchasePrice) {
    return { should: false, reasons: ['Could not determine average purchase price'] };
  }

  const currentPrice = indicators.price;
  const profitLossPercent = ((currentPrice - avgPurchasePrice) / avgPurchasePrice) * 100;

  // Check SELL conditions (ANY of these can trigger a sell)

  // 1. Score below sell threshold
  if (score <= config.sell_threshold) {
    reasons.push(`Score ${score}/${config.sell_threshold} - Sell threshold reached`);
    return {
      should: true,
      reasons,
      profitLossPercent,
      avgPurchasePrice,
      triggerType: 'score_threshold'
    };
  }

  // 2. Take profit reached
  if (profitLossPercent >= config.take_profit_percentage) {
    reasons.push(
      `Take profit triggered: +${profitLossPercent.toFixed(2)}% (target: ${config.take_profit_percentage}%)`
    );
    return {
      should: true,
      reasons,
      profitLossPercent,
      avgPurchasePrice,
      triggerType: 'take_profit'
    };
  }

  // 3. Stop loss reached
  if (profitLossPercent <= -config.stop_loss_percentage) {
    reasons.push(
      `Stop loss triggered: ${profitLossPercent.toFixed(2)}% (limit: -${config.stop_loss_percentage}%)`
    );
    return {
      should: true,
      reasons,
      profitLossPercent,
      avgPurchasePrice,
      triggerType: 'stop_loss'
    };
  }

  // No sell signal
  return {
    should: false,
    reasons: [
      `Holding - Score: ${score}, P/L: ${profitLossPercent > 0 ? '+' : ''}${profitLossPercent.toFixed(2)}%`
    ]
  };
}

/**
 * Execute paper trading logic
 * Called from the main analysis worker
 */
export async function executePaperTrading(score, indicators) {
  try {
    // Get current configuration
    const config = await getPaperConfig();

    if (!config) {
      console.log('⚠️  Paper trading not configured');
      return null;
    }

    if (!config.is_active) {
      console.log('📊 Paper trading is inactive');
      return null;
    }

    console.log('\n💼 Evaluating paper trading signals...');
    console.log(`   Balance: $${parseFloat(config.balance_usd).toLocaleString()} USD + ${parseFloat(config.balance_btc).toFixed(8)} BTC`);
    console.log(`   Score: ${score}/100`);

    const currentPrice = indicators.price;

    // Check for SELL signal first (priority over buy)
    const sellSignal = await shouldSell(config, score, indicators);

    if (sellSignal.should) {
      console.log('📉 SELL SIGNAL DETECTED');
      console.log(`   Trigger: ${sellSignal.triggerType}`);
      console.log(`   Reasons: ${sellSignal.reasons.join(', ')}`);

      // Execute sell
      const btcToSell = parseFloat(config.balance_btc);
      const usdReceived = btcToSell * currentPrice;
      const newBalanceUsd = parseFloat(config.balance_usd) + usdReceived;
      const newBalanceBtc = 0;

      // Calculate P/L
      const avgPurchasePrice = sellSignal.avgPurchasePrice;
      const profitLossUsd = (currentPrice - avgPurchasePrice) * btcToSell;
      const profitLossPercentage = sellSignal.profitLossPercent;

      const tradeData = {
        btcPrice: currentPrice,
        btcAmount: btcToSell,
        usdAmount: usdReceived,
        balanceUsd: newBalanceUsd,
        balanceBtc: newBalanceBtc,
        score,
        reason: sellSignal.reasons.join(' | '),
        profitLossUsd,
        profitLossPercentage
      };

      const trade = await executeSellTrade(tradeData);

      console.log('✅ SELL EXECUTED');
      console.log(`   BTC sold: ${btcToSell.toFixed(8)} at $${currentPrice.toLocaleString()}`);
      console.log(`   USD received: $${usdReceived.toLocaleString()}`);
      console.log(`   P/L: ${profitLossPercentage > 0 ? '+' : ''}${profitLossPercentage.toFixed(2)}% ($${profitLossUsd > 0 ? '+' : ''}${profitLossUsd.toLocaleString()})`);
      console.log(`   New balance: $${newBalanceUsd.toLocaleString()} USD`);

      return {
        action: 'sell',
        trade,
        profitLossPercentage,
        profitLossUsd
      };
    }

    // Check for BUY signal
    const buySignal = shouldBuy(config, score, indicators);

    if (buySignal.should) {
      console.log('📈 BUY SIGNAL DETECTED');
      console.log(`   Reasons: ${buySignal.reasons.join(', ')}`);

      // Execute buy
      const usdToInvest = buySignal.usdToInvest;
      const btcToBuy = usdToInvest / currentPrice;
      const newBalanceUsd = parseFloat(config.balance_usd) - usdToInvest;
      const newBalanceBtc = parseFloat(config.balance_btc) + btcToBuy;

      const tradeData = {
        btcPrice: currentPrice,
        btcAmount: btcToBuy,
        usdAmount: usdToInvest,
        balanceUsd: newBalanceUsd,
        balanceBtc: newBalanceBtc,
        score,
        reason: buySignal.reasons.join(' | ')
      };

      const trade = await executeBuyTrade(tradeData);

      console.log('✅ BUY EXECUTED');
      console.log(`   USD invested: $${usdToInvest.toLocaleString()} (${config.percentage_per_trade}% of balance)`);
      console.log(`   BTC bought: ${btcToBuy.toFixed(8)} at $${currentPrice.toLocaleString()}`);
      console.log(`   New balance: $${newBalanceUsd.toLocaleString()} USD + ${newBalanceBtc.toFixed(8)} BTC`);

      return {
        action: 'buy',
        trade
      };
    }

    // No signal
    console.log('⏸️  No trading signal - Holding position');
    if (config.balance_btc > 0) {
      const avgPrice = await getAveragePurchasePrice();
      if (avgPrice) {
        const currentValue = parseFloat(config.balance_btc) * currentPrice;
        const profitLoss = ((currentPrice - avgPrice) / avgPrice) * 100;
        console.log(`   Current position: ${parseFloat(config.balance_btc).toFixed(8)} BTC ($${currentValue.toLocaleString()})`);
        console.log(`   Unrealized P/L: ${profitLoss > 0 ? '+' : ''}${profitLoss.toFixed(2)}%`);
      }
    }

    return null;
  } catch (error) {
    console.error('❌ Error in paper trading execution:', error);
    return null;
  }
}

export default {
  executePaperTrading,
  shouldBuy,
  shouldSell
};
