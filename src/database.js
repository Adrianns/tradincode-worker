import pg from 'pg';
const { Pool } = pg;

let pool;

/**
 * Initialize database connection pool
 */
export function initDatabase() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    pool.on('error', (err) => {
      console.error('Unexpected database error:', err);
    });
  }
  return pool;
}

/**
 * Save price and indicators data
 */
export async function saveAnalysis(data) {
  const client = await pool.connect();
  try {
    const query = `
      INSERT INTO analyses (
        price, ma_50, ma_200, rsi_weekly, macd_weekly, macd_signal,
        bb_upper, bb_middle, bb_lower, volume_24h, score, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `;
    const values = [
      data.price,
      data.ma50,
      data.ma200,
      data.rsiWeekly,
      data.macdWeekly,
      data.macdSignal,
      data.bbUpper,
      data.bbMiddle,
      data.bbLower,
      data.volume24h,
      data.score,
      new Date()
    ];
    const result = await client.query(query, values);
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

/**
 * Save alert to database
 */
export async function saveAlert(type, message, score, details) {
  const client = await pool.connect();
  try {
    const query = `
      INSERT INTO alerts (type, message, score, details, timestamp)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    const values = [type, message, score, JSON.stringify(details), new Date()];
    const result = await client.query(query, values);
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

/**
 * Get latest analysis
 */
export async function getLatestAnalysis() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM analyses ORDER BY timestamp DESC LIMIT 1'
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Get historical analyses for indicators calculation
 */
export async function getHistoricalAnalyses(limit = 200) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM analyses ORDER BY timestamp DESC LIMIT $1',
      [limit]
    );
    return result.rows.reverse(); // Return oldest first
  } finally {
    client.release();
  }
}

/**
 * Get recent alerts
 */
export async function getRecentAlerts(limit = 20) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM alerts ORDER BY timestamp DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get analyses for dashboard (last 30 days)
 */
export async function getAnalysesForDashboard() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM analyses
      WHERE timestamp > NOW() - INTERVAL '30 days'
      ORDER BY timestamp ASC
    `);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Save historical kline data for MA calculation
 */
export async function saveKlineData(data) {
  const client = await pool.connect();
  try {
    const query = `
      INSERT INTO klines (timestamp, open, high, low, close, volume)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (timestamp) DO UPDATE
      SET open = $2, high = $3, low = $4, close = $5, volume = $6
    `;
    const values = [
      new Date(data.timestamp),
      data.open,
      data.high,
      data.low,
      data.close,
      data.volume
    ];
    await client.query(query, values);
  } finally {
    client.release();
  }
}

/**
 * Get klines for calculation
 */
export async function getKlines(limit = 250) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM klines ORDER BY timestamp DESC LIMIT $1',
      [limit]
    );
    return result.rows.reverse(); // Return oldest first
  } finally {
    client.release();
  }
}

export default {
  initDatabase,
  saveAnalysis,
  saveAlert,
  getLatestAnalysis,
  getHistoricalAnalyses,
  getRecentAlerts,
  getAnalysesForDashboard,
  saveKlineData,
  getKlines
};
