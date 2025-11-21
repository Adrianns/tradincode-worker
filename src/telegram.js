import TelegramBot from 'node-telegram-bot-api';
import { getScoreInterpretation } from './scoring.js';

let bot;

/**
 * Initialize Telegram bot
 */
export function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.warn('TELEGRAM_BOT_TOKEN not set - alerts will be logged only');
    return null;
  }

  bot = new TelegramBot(token, { polling: false });
  console.log('Telegram bot initialized');
  return bot;
}

/**
 * Send a formatted alert message
 */
export async function sendAlert(alert, score, indicators) {
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!bot || !chatId) {
    console.log('Alert (not sent - bot not configured):', alert.message);
    return false;
  }

  try {
    const interpretation = getScoreInterpretation(score);
    let message = '';

    // Build message based on alert type
    switch (alert.type) {
      case 'SCORE_CHANGE':
        message = formatScoreChangeAlert(alert, score, indicators, interpretation);
        break;

      case 'GOLDEN_CROSS':
        message = formatGoldenCrossAlert(alert, score, indicators, interpretation);
        break;

      case 'DEATH_CROSS':
        message = formatDeathCrossAlert(alert, score, indicators, interpretation);
        break;

      case 'MA200_TOUCH':
        message = formatMA200TouchAlert(alert, score, indicators, interpretation);
        break;

      case 'RSI_OVERSOLD':
        message = formatRSIOversoldAlert(alert, score, indicators, interpretation);
        break;

      case 'RSI_OVERBOUGHT':
        message = formatRSIOverboughtAlert(alert, score, indicators, interpretation);
        break;

      case 'OPTIMAL_BUY':
        message = formatOptimalBuyAlert(alert, score, indicators);
        break;

      case 'STRONG_BUY_SIGNAL':
        message = formatStrongBuyAlert(alert, score, indicators);
        break;

      case 'MAXIMUM_CAUTION':
        message = formatMaximumCautionAlert(alert, score, indicators);
        break;

      case 'STRONG_SELL_SIGNAL':
        message = formatStrongSellAlert(alert, score, indicators);
        break;

      case 'OPPORTUNITY_EMERGED':
        message = formatOpportunityEmergedAlert(alert, score, indicators);
        break;

      case 'WARNING_WEAKNESS':
        message = formatWarningWeaknessAlert(alert, score, indicators);
        break;

      default:
        message = formatGenericAlert(alert, score, indicators, interpretation);
    }

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    console.log(`Alert sent: ${alert.type}`);
    return true;
  } catch (error) {
    console.error('Error sending Telegram alert:', error.message);
    return false;
  }
}

/**
 * Format score change alert
 */
function formatScoreChangeAlert(alert, score, indicators, interpretation) {
  const { scoreDiff } = alert.details;
  const emoji = scoreDiff > 0 ? '📈' : '📉';

  return `${emoji} *SCORE CHANGE ALERT*

${interpretation.emoji} Score: *${score}/100* (${scoreDiff > 0 ? '+' : ''}${scoreDiff} points)
Zone: ${interpretation.zone}

💵 BTC Price: $${indicators.price.toLocaleString()}
📊 MA200: $${indicators.ma200?.toLocaleString() || 'N/A'}
📉 RSI Weekly: ${indicators.rsiWeekly?.toFixed(2) || 'N/A'}

💡 ${interpretation.advice}`;
}

/**
 * Format Golden Cross alert
 */
function formatGoldenCrossAlert(alert, score, indicators, interpretation) {
  return `🟢 *GOLDEN CROSS DETECTED!*

MA50 crossed above MA200 - Strong bullish signal for long-term holders

${interpretation.emoji} Score: *${score}/100*

💵 Current Price: $${indicators.price.toLocaleString()}
📊 MA50: $${indicators.ma50?.toLocaleString()}
📊 MA200: $${indicators.ma200?.toLocaleString()}

💡 Historically strong entry signal for DCA strategy`;
}

/**
 * Format Death Cross alert
 */
function formatDeathCrossAlert(alert, score, indicators, interpretation) {
  return `🔴 *DEATH CROSS DETECTED*

MA50 crossed below MA200 - Bearish signal

${interpretation.emoji} Score: *${score}/100*

💵 Current Price: $${indicators.price.toLocaleString()}
📊 MA50: $${indicators.ma50?.toLocaleString()}
📊 MA200: $${indicators.ma200?.toLocaleString()}

⚠️ Exercise caution - wait for reversal signals`;
}

/**
 * Format MA200 touch alert
 */
function formatMA200TouchAlert(alert, score, indicators, interpretation) {
  const aboveMA = indicators.price > indicators.ma200;

  return `${aboveMA ? '🟢' : '🟡'} *PRICE AT MA200 LEVEL*

${interpretation.emoji} Score: *${score}/100*

💵 BTC Price: $${indicators.price.toLocaleString()}
📊 MA200: $${indicators.ma200?.toLocaleString()}

💡 ${aboveMA ? 'MA200 acting as support - good DCA level' : 'Testing MA200 - watch for bounce or breakdown'}`;
}

/**
 * Format RSI oversold alert
 */
function formatRSIOversoldAlert(alert, score, indicators, interpretation) {
  return `🟢 *ACCUMULATION OPPORTUNITY*

RSI Weekly entered oversold zone

${interpretation.emoji} Score: *${score}/100*

💵 BTC Price: $${indicators.price.toLocaleString()}
📉 RSI Weekly: ${indicators.rsiWeekly?.toFixed(2)}
📊 Price vs MA200: ${indicators.price > indicators.ma200 ? 'Above ✅' : 'Below ⚠️'}

💡 Excellent moment for long-term DCA - oversold conditions`;
}

/**
 * Format RSI overbought alert
 */
function formatRSIOverboughtAlert(alert, score, indicators, interpretation) {
  return `🔴 *OVERBOUGHT ALERT*

RSI Weekly entered overbought zone

${interpretation.emoji} Score: *${score}/100*

💵 BTC Price: $${indicators.price.toLocaleString()}
📉 RSI Weekly: ${indicators.rsiWeekly?.toFixed(2)}

⚠️ Not recommended to accumulate - wait for correction`;
}

/**
 * Format optimal buy alert
 */
function formatOptimalBuyAlert(alert, score, indicators) {
  const signals = alert.details.signals.map(s => `  • ${s}`).join('\n');

  return `🚀 *${alert.message}*

Score: *${score}/100*
RSI Weekly: ${alert.details.rsi.toFixed(1)}

🎯 SEÑALES ALINEADAS:
${signals}

💵 BTC Price: $${indicators.price.toLocaleString()}
📊 MA50: $${indicators.ma50?.toLocaleString()}
📊 MA200: $${indicators.ma200?.toLocaleString()}

${alert.details.strategy}`;
}

/**
 * Format strong buy alert
 */
function formatStrongBuyAlert(alert, score, indicators) {
  const signals = alert.details.signals.map(s => `  • ${s}`).join('\n');

  return `🟢 *${alert.message}*

Score: *${score}/100*
${alert.details.rsi ? `RSI Weekly: ${alert.details.rsi.toFixed(1)}` : ''}

📊 SEÑALES:
${signals}

💵 BTC Price: $${indicators.price.toLocaleString()}

${alert.details.strategy}`;
}

/**
 * Format maximum caution alert
 */
function formatMaximumCautionAlert(alert, score, indicators) {
  const signals = alert.details.signals.map(s => `  • ${s}`).join('\n');

  return `🔴 *${alert.message}*

Score: *${score}/100*
RSI Weekly: ${alert.details.rsi.toFixed(1)}

⚠️ SEÑALES DE ALERTA:
${signals}

💵 BTC Price: $${indicators.price.toLocaleString()}
📊 MA50: $${indicators.ma50?.toLocaleString()}
📊 MA200: $${indicators.ma200?.toLocaleString()}

${alert.details.strategy}`;
}

/**
 * Format strong sell alert
 */
function formatStrongSellAlert(alert, score, indicators) {
  const signals = alert.details.signals.map(s => `  • ${s}`).join('\n');

  return `🔴 *${alert.message}*

Score: *${score}/100*
${alert.details.rsi ? `RSI Weekly: ${alert.details.rsi.toFixed(1)}` : ''}

⚠️ SEÑALES:
${signals}

💵 BTC Price: $${indicators.price.toLocaleString()}

${alert.details.strategy}`;
}

/**
 * Format opportunity emerged alert
 */
function formatOpportunityEmergedAlert(alert, score, indicators) {
  const signals = alert.details.signals.map(s => `  • ${s}`).join('\n');

  return `📈 *${alert.message}*

Score: *${alert.details.previousScore}/100* → *${score}/100* (+${alert.details.scoreDiff} points)

🎯 CAMBIO SIGNIFICATIVO:
${signals}

💵 BTC Price: $${indicators.price.toLocaleString()}

${alert.details.strategy}`;
}

/**
 * Format warning weakness alert
 */
function formatWarningWeaknessAlert(alert, score, indicators) {
  const signals = alert.details.signals.map(s => `  • ${s}`).join('\n');

  return `📉 *${alert.message}*

Score: *${alert.details.previousScore}/100* → *${score}/100* (${alert.details.scoreDiff} points)

⚠️ CAMBIO SIGNIFICATIVO:
${signals}

💵 BTC Price: $${indicators.price.toLocaleString()}

${alert.details.strategy}`;
}

/**
 * Format generic alert
 */
function formatGenericAlert(alert, score, indicators, interpretation) {
  return `${interpretation.emoji} *ALERT*

${alert.message}

Score: *${score}/100*
Price: $${indicators.price.toLocaleString()}

${interpretation.advice}`;
}

/**
 * Send test message
 */
export async function sendTestMessage() {
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!bot || !chatId) {
    console.log('Test message not sent - bot not configured');
    return false;
  }

  try {
    await bot.sendMessage(
      chatId,
      '✅ *Tradincode Bot Active*\n\nBitcoin monitoring system is running.\nYou will receive alerts for investment opportunities.',
      { parse_mode: 'Markdown' }
    );
    console.log('Test message sent successfully');
    return true;
  } catch (error) {
    console.error('Error sending test message:', error.message);
    return false;
  }
}

/**
 * Send paper trading BUY notification
 */
export async function sendPaperTradingBuy(trade, config, indicators) {
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!bot || !chatId) {
    console.log('Paper Trading BUY alert (not sent - bot not configured)');
    return false;
  }

  try {
    const percentageInvested = config.percentage_per_trade;
    const btcAmount = parseFloat(trade.btc_amount);
    const usdAmount = parseFloat(trade.usd_amount);
    const btcPrice = parseFloat(trade.btc_price);
    const balanceUsd = parseFloat(trade.balance_usd);
    const balanceBtc = parseFloat(trade.balance_btc);
    const score = trade.score_at_trade;

    const message = `📊 *PAPER TRADING - COMPRA*

💵 Invertido: $${usdAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${percentageInvested}% del balance)
₿ BTC comprado: ${btcAmount.toFixed(8)} a $${btcPrice.toLocaleString()}
📈 Score: ${score}/100

💰 Balance: $${balanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD + ${balanceBtc.toFixed(8)} BTC

📝 Razón: ${trade.reason}`;

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    console.log('✅ Paper Trading BUY alert sent to Telegram');
    return true;
  } catch (error) {
    console.error('Error sending Paper Trading BUY alert:', error.message);
    return false;
  }
}

/**
 * Send paper trading SELL notification
 */
export async function sendPaperTradingSell(trade, profitLossUsd, profitLossPercentage) {
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!bot || !chatId) {
    console.log('Paper Trading SELL alert (not sent - bot not configured)');
    return false;
  }

  try {
    const btcAmount = parseFloat(trade.btc_amount);
    const usdAmount = parseFloat(trade.usd_amount);
    const btcPrice = parseFloat(trade.btc_price);
    const balanceUsd = parseFloat(trade.balance_usd);
    const score = trade.score_at_trade;

    const profitEmoji = profitLossUsd > 0 ? '🟢' : '🔴';
    const profitSign = profitLossUsd > 0 ? '+' : '';

    const message = `📊 *PAPER TRADING - VENTA*

₿ BTC vendido: ${btcAmount.toFixed(8)} a $${btcPrice.toLocaleString()}
💵 Recibido: $${usdAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
📉 Score: ${score}/100

💰 Balance: $${balanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD

${profitEmoji} P&L: ${profitSign}${profitLossPercentage.toFixed(2)}% (${profitSign}$${Math.abs(profitLossUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})

📝 Razón: ${trade.reason}`;

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    console.log('✅ Paper Trading SELL alert sent to Telegram');
    return true;
  } catch (error) {
    console.error('Error sending Paper Trading SELL alert:', error.message);
    return false;
  }
}

export default {
  initTelegramBot,
  sendAlert,
  sendTestMessage,
  sendPaperTradingBuy,
  sendPaperTradingSell
};
