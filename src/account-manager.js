/**
 * Account Manager
 * Manages CRUD operations for trading accounts
 */

import { initDatabase } from './database.js';

const pool = initDatabase();

/**
 * Get all active accounts
 */
export async function getActiveAccounts() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM trading_accounts WHERE is_active = true ORDER BY id'
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get all accounts (including inactive)
 */
export async function getAllAccounts() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM trading_accounts ORDER BY id'
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get account by ID
 */
export async function getAccountById(accountId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM trading_accounts WHERE id = $1',
      [accountId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Create new trading account
 */
export async function createAccount(data) {
  const {
    account_name,
    strategy,
    initial_balance = 1000,
    is_active = false,
    stop_loss_percent = 0.005,
    take_profit_percent = null,
    trailing_stop = false,
    trailing_stop_percent = null,
    position_size_percent = 0.95,
    required_convergence = 2,
    timeframe = '1d'
  } = data;

  const client = await pool.connect();
  try {
    const result = await client.query(`
      INSERT INTO trading_accounts (
        account_name, strategy, initial_balance, balance_usd, is_active,
        stop_loss_percent, take_profit_percent, trailing_stop,
        trailing_stop_percent, position_size_percent, required_convergence,
        timeframe
      ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      account_name,
      strategy,
      initial_balance,
      is_active,
      stop_loss_percent,
      take_profit_percent,
      trailing_stop,
      trailing_stop_percent,
      position_size_percent,
      required_convergence,
      timeframe
    ]);

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Update account config
 */
export async function updateAccount(accountId, updates) {
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
    values.push(accountId);

    const query = `
      UPDATE trading_accounts
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await client.query(query, values);
    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Activate/Deactivate account
 */
export async function toggleAccount(accountId, isActive) {
  return updateAccount(accountId, { is_active: isActive });
}

/**
 * Delete account (and all its trades)
 */
export async function deleteAccount(accountId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete trades
    await client.query(
      'DELETE FROM paper_trades WHERE account_id = $1',
      [accountId]
    );

    // Delete snapshots
    await client.query(
      'DELETE FROM account_snapshots WHERE account_id = $1',
      [accountId]
    );

    // Delete account
    await client.query(
      'DELETE FROM trading_accounts WHERE id = $1',
      [accountId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get account balance
 */
export async function getAccountBalance(accountId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT balance_usd, balance_btc FROM trading_accounts WHERE id = $1',
      [accountId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Update account balance
 */
export async function updateAccountBalance(accountId, balanceUsd, balanceBtc) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      UPDATE trading_accounts
      SET balance_usd = $1, balance_btc = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [balanceUsd, balanceBtc, accountId]);

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Update account performance metrics
 */
export async function updateAccountMetrics(accountId, metrics) {
  const {
    total_trades,
    winning_trades,
    losing_trades,
    total_profit_loss
  } = metrics;

  const client = await pool.connect();
  try {
    const result = await client.query(`
      UPDATE trading_accounts
      SET
        total_trades = $1,
        winning_trades = $2,
        losing_trades = $3,
        total_profit_loss = $4,
        updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [
      total_trades,
      winning_trades,
      losing_trades,
      total_profit_loss,
      accountId
    ]);

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Get account trades
 */
export async function getAccountTrades(accountId, limit = 50) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM paper_trades
      WHERE account_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [accountId, limit]);

    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Save account snapshot (for historical tracking)
 */
export async function saveAccountSnapshot(accountId, btcPrice) {
  const client = await pool.connect();
  try {
    // Get current balance
    const account = await getAccountById(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    const totalValueUsd = account.balance_usd + (account.balance_btc * btcPrice);
    const roiPercent = ((totalValueUsd - account.initial_balance) / account.initial_balance) * 100;

    const result = await client.query(`
      INSERT INTO account_snapshots (
        account_id, balance_usd, balance_btc, total_value_usd,
        btc_price, roi_percent
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      accountId,
      account.balance_usd,
      account.balance_btc,
      totalValueUsd,
      btcPrice,
      roiPercent
    ]);

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Get account snapshots (for charts)
 */
export async function getAccountSnapshots(accountId, limit = 100) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM account_snapshots
      WHERE account_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `, [accountId, limit]);

    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get account active position
 */
export async function getAccountActivePosition(accountId) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM paper_trades
      WHERE account_id = $1 AND trade_type = 'buy'
      AND created_at > (
        SELECT COALESCE(MAX(created_at), '1970-01-01')
        FROM paper_trades
        WHERE account_id = $1 AND trade_type = 'sell'
      )
      ORDER BY created_at DESC
      LIMIT 1
    `, [accountId]);

    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

export default {
  getActiveAccounts,
  getAllAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  toggleAccount,
  deleteAccount,
  getAccountBalance,
  updateAccountBalance,
  updateAccountMetrics,
  getAccountTrades,
  saveAccountSnapshot,
  getAccountSnapshots,
  getAccountActivePosition
};
