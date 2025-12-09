import { initDatabase } from './database.js';

const pool = initDatabase();

/**
 * Get paper trading configuration
 */
export async function getPaperConfig() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM paper_config ORDER BY id DESC LIMIT 1'
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Update paper trading configuration
 */
export async function updatePaperConfig(updates) {
  const client = await pool.connect();
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    fields.push('updated_at = NOW()');

    const query = `
      UPDATE paper_config
      SET ${fields.join(', ')}
      WHERE id = (SELECT id FROM paper_config ORDER BY id DESC LIMIT 1)
      RETURNING *
    `;

    const result = await client.query(query, values);
    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Execute a buy trade
 */
export async function executeBuyTrade(data) {
  const {
    btcPrice,
    btcAmount,
    usdAmount,
    balanceUsd,
    balanceBtc,
    score,
    reason,
    stopLossPrice,
    takeProfitPrice,
    entryAtr
  } = data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert trade with optional SL/TP columns
    const tradeResult = await client.query(`
      INSERT INTO paper_trades (
        trade_type, btc_price, btc_amount, usd_amount,
        balance_usd, balance_btc, score_at_trade, reason,
        stop_loss_price, take_profit_price, entry_atr
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      'buy',
      btcPrice,
      btcAmount,
      usdAmount,
      balanceUsd,
      balanceBtc,
      score,
      reason,
      stopLossPrice || null,
      takeProfitPrice || null,
      entryAtr || null
    ]);

    // Update config balances
    await client.query(`
      UPDATE paper_config
      SET balance_usd = $1, balance_btc = $2, updated_at = NOW()
      WHERE id = (SELECT id FROM paper_config ORDER BY id DESC LIMIT 1)
    `, [balanceUsd, balanceBtc]);

    await client.query('COMMIT');
    return tradeResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute a sell trade
 */
export async function executeSellTrade(data) {
  const {
    btcPrice,
    btcAmount,
    usdAmount,
    balanceUsd,
    balanceBtc,
    score,
    reason,
    profitLossUsd,
    profitLossPercentage
  } = data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert trade
    const tradeResult = await client.query(`
      INSERT INTO paper_trades (
        trade_type, btc_price, btc_amount, usd_amount,
        balance_usd, balance_btc, score_at_trade, reason,
        profit_loss_usd, profit_loss_percentage
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      'sell',
      btcPrice,
      btcAmount,
      usdAmount,
      balanceUsd,
      balanceBtc,
      score,
      reason,
      profitLossUsd,
      profitLossPercentage
    ]);

    // Update config balances
    await client.query(`
      UPDATE paper_config
      SET balance_usd = $1, balance_btc = $2, updated_at = NOW()
      WHERE id = (SELECT id FROM paper_config ORDER BY id DESC LIMIT 1)
    `, [balanceUsd, balanceBtc]);

    await client.query('COMMIT');
    return tradeResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all trades with pagination
 */
export async function getPaperTrades(page = 1, limit = 20) {
  const client = await pool.connect();
  try {
    const offset = (page - 1) * limit;

    const result = await client.query(`
      SELECT * FROM paper_trades
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countResult = await client.query('SELECT COUNT(*) FROM paper_trades');
    const totalCount = parseInt(countResult.rows[0].count);

    return {
      trades: result.rows,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit)
    };
  } finally {
    client.release();
  }
}

/**
 * Get trades by type (buy or sell)
 */
export async function getTradesByType(type) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM paper_trades WHERE trade_type = $1 ORDER BY created_at DESC',
      [type]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Calculate average purchase price
 */
export async function getAveragePurchasePrice() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        SUM(btc_price * btc_amount) / NULLIF(SUM(btc_amount), 0) as avg_price
      FROM paper_trades
      WHERE trade_type = 'buy'
        AND created_at > (
          SELECT COALESCE(MAX(created_at), '1970-01-01')
          FROM paper_trades
          WHERE trade_type = 'sell'
        )
    `);

    return result.rows[0]?.avg_price ? parseFloat(result.rows[0].avg_price) : null;
  } finally {
    client.release();
  }
}

/**
 * Get active position (latest buy since last sell) with SL/TP
 */
export async function getActivePosition() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT *
      FROM paper_trades
      WHERE trade_type = 'buy'
        AND created_at > (
          SELECT COALESCE(MAX(created_at), '1970-01-01')
          FROM paper_trades
          WHERE trade_type = 'sell'
        )
      ORDER BY created_at DESC
      LIMIT 1
    `);

    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Get trading metrics
 */
export async function getTradingMetrics() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE trade_type = 'buy') as total_buys,
        COUNT(*) FILTER (WHERE trade_type = 'sell') as total_sells,
        COUNT(*) FILTER (WHERE trade_type = 'sell' AND profit_loss_usd > 0) as winning_trades,
        COUNT(*) FILTER (WHERE trade_type = 'sell' AND profit_loss_usd <= 0) as losing_trades,
        AVG(profit_loss_usd) FILTER (WHERE trade_type = 'sell' AND profit_loss_usd > 0) as avg_win,
        AVG(profit_loss_usd) FILTER (WHERE trade_type = 'sell' AND profit_loss_usd <= 0) as avg_loss,
        SUM(profit_loss_usd) FILTER (WHERE trade_type = 'sell') as total_profit_loss
      FROM paper_trades
    `);

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Reset paper trading (delete all trades and reset config)
 */
export async function resetPaperTrading() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM paper_trades');

    await client.query(`
      UPDATE paper_config
      SET
        balance_usd = initial_balance,
        balance_btc = 0.00,
        is_active = false,
        started_at = NULL,
        updated_at = NOW()
      WHERE id = (SELECT id FROM paper_config ORDER BY id DESC LIMIT 1)
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Start paper trading
 */
export async function startPaperTrading() {
  return updatePaperConfig({
    is_active: true,
    started_at: new Date()
  });
}

/**
 * Stop paper trading
 */
export async function stopPaperTrading() {
  return updatePaperConfig({
    is_active: false
  });
}

/**
 * Save indicator signal to database
 */
export async function savePaperSignal(data) {
  const { timestamp, symbol, indicator, signal, price, metadata } = data;

  const client = await pool.connect();
  try {
    const result = await client.query(`
      INSERT INTO paper_signals (
        timestamp, symbol, indicator, signal, price, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      timestamp,
      symbol,
      indicator,
      signal || null,
      price,
      metadata ? JSON.stringify(metadata) : null
    ]);

    return result.rows[0];
  } finally {
    client.release();
  }
}

export default {
  getPaperConfig,
  updatePaperConfig,
  executeBuyTrade,
  executeSellTrade,
  getPaperTrades,
  getTradesByType,
  getAveragePurchasePrice,
  getActivePosition,
  getTradingMetrics,
  resetPaperTrading,
  startPaperTrading,
  stopPaperTrading,
  savePaperSignal
};
