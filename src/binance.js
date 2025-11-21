import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const BINANCE_API_BASE = 'https://api.binance.com/api/v3';
const SYMBOL = 'BTCUSDT';

// Proxy configuration (optional - only used if PROXY_URL is set)
const PROXY_URL = process.env.PROXY_URL;
const axiosConfig = PROXY_URL ? {
  httpsAgent: new HttpsProxyAgent(PROXY_URL),
  proxy: false
} : {};

/**
 * Fetch current Bitcoin price
 */
export async function getCurrentPrice() {
  try {
    const response = await axios.get(`${BINANCE_API_BASE}/ticker/price`, {
      params: { symbol: SYMBOL },
      ...axiosConfig
    });
    return parseFloat(response.data.price);
  } catch (error) {
    console.error('Error fetching current price:', error.message);
    throw error;
  }
}

/**
 * Fetch 24h volume
 */
export async function get24hVolume() {
  try {
    const response = await axios.get(`${BINANCE_API_BASE}/ticker/24hr`, {
      params: { symbol: SYMBOL },
      ...axiosConfig
    });
    return parseFloat(response.data.volume);
  } catch (error) {
    console.error('Error fetching 24h volume:', error.message);
    throw error;
  }
}

/**
 * Fetch historical klines (candlestick data)
 * @param {string} interval - Kline interval (1d, 1w, etc.)
 * @param {number} limit - Number of klines to fetch (max 1000)
 */
export async function getKlines(interval = '1d', limit = 250) {
  try {
    const response = await axios.get(`${BINANCE_API_BASE}/klines`, {
      params: {
        symbol: SYMBOL,
        interval: interval,
        limit: limit
      },
      ...axiosConfig
    });

    return response.data.map(kline => ({
      timestamp: kline[0],
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5])
    }));
  } catch (error) {
    console.error(`Error fetching ${interval} klines:`, error.message);
    throw error;
  }
}

/**
 * Fetch daily klines for MA calculation
 */
export async function getDailyKlines(limit = 250) {
  return getKlines('1d', limit);
}

/**
 * Fetch weekly klines for RSI and MACD
 */
export async function getWeeklyKlines(limit = 52) {
  return getKlines('1w', limit);
}

/**
 * Get comprehensive market data
 */
export async function getMarketData() {
  try {
    const [price, volume, dailyKlines, weeklyKlines] = await Promise.all([
      getCurrentPrice(),
      get24hVolume(),
      getDailyKlines(250),
      getWeeklyKlines(52)
    ]);

    return {
      currentPrice: price,
      volume24h: volume,
      dailyKlines,
      weeklyKlines
    };
  } catch (error) {
    console.error('Error fetching market data:', error.message);
    throw error;
  }
}

export default {
  getCurrentPrice,
  get24hVolume,
  getKlines,
  getDailyKlines,
  getWeeklyKlines,
  getMarketData
};
