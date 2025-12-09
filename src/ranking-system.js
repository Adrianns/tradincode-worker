/**
 * Ranking System
 * Calculates rankings for all trading accounts and detects changes
 */

import { initDatabase } from './database.js';
import { getAllAccounts } from './account-manager.js';

const pool = initDatabase();

/**
 * Calculate rankings for all accounts
 */
export async function calculateRankings(currentPrice) {
  try {
    const accounts = await getAllAccounts();

    if (accounts.length === 0) {
      return [];
    }

    const rankings = accounts.map(account => {
      const totalValueUsd = account.balance_usd + (account.balance_btc * currentPrice);
      const roiPercent = ((totalValueUsd - account.initial_balance) / account.initial_balance) * 100;
      const winRate = account.total_trades > 0
        ? (account.winning_trades / account.total_trades) * 100
        : 0;

      return {
        account_id: account.id,
        account_name: account.account_name,
        strategy: account.strategy,
        roi_percent: roiPercent,
        win_rate: winRate,
        total_trades: account.total_trades,
        balance_usd: totalValueUsd,
        is_active: account.is_active
      };
    });

    // Sort by ROI descending
    rankings.sort((a, b) => b.roi_percent - a.roi_percent);

    // Assign ranks
    rankings.forEach((r, index) => {
      r.rank = index + 1;
    });

    // Save to database
    await saveRankings(rankings);

    return rankings;
  } catch (error) {
    console.error('Error calculating rankings:', error);
    throw error;
  }
}

/**
 * Save rankings to database
 */
async function saveRankings(rankings) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const ranking of rankings) {
      await client.query(`
        INSERT INTO strategy_rankings (
          rank, account_id, account_name, strategy,
          roi_percent, win_rate, total_trades, balance_usd
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        ranking.rank,
        ranking.account_id,
        ranking.account_name,
        ranking.strategy,
        ranking.roi_percent,
        ranking.win_rate,
        ranking.total_trades,
        ranking.balance_usd
      ]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get previous rankings (most recent before now)
 */
async function getPreviousRankings() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT ON (account_id) *
      FROM strategy_rankings
      WHERE timestamp < (
        SELECT MAX(timestamp) FROM strategy_rankings
      )
      ORDER BY account_id, timestamp DESC
    `);

    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Check for ranking changes and return alerts
 */
export async function checkRankingAlerts(currentRankings) {
  try {
    const alerts = [];

    if (currentRankings.length === 0) {
      return alerts;
    }

    const previousRankings = await getPreviousRankings();

    if (!previousRankings || previousRankings.length === 0) {
      // First ranking, no alerts
      return alerts;
    }

    // Check if top strategy changed
    const currentTop = currentRankings[0];
    const previousTop = previousRankings.find(r => r.rank === 1);

    if (previousTop && currentTop.account_id !== previousTop.account_id) {
      alerts.push({
        type: 'LEADER_CHANGE',
        message: `🏆 New leader! ${currentTop.account_name} (${currentTop.strategy}) overtook ${previousTop.account_name} with ${currentTop.roi_percent.toFixed(2)}% ROI`
      });
    }

    // Check for significant ROI jumps (>5% difference from previous)
    for (const current of currentRankings) {
      const previous = previousRankings.find(p => p.account_id === current.account_id);
      if (previous) {
        const roiChange = current.roi_percent - previous.roi_percent;
        if (Math.abs(roiChange) >= 5) {
          alerts.push({
            type: 'SIGNIFICANT_CHANGE',
            message: `${roiChange > 0 ? '📈' : '📉'} ${current.account_name}: ${roiChange > 0 ? '+' : ''}${roiChange.toFixed(2)}% ROI change`
          });
        }
      }
    }

    // Check for large rank jumps (3+ positions)
    for (const current of currentRankings) {
      const previous = previousRankings.find(p => p.account_id === current.account_id);
      if (previous) {
        const rankChange = previous.rank - current.rank; // Positive = moved up
        if (Math.abs(rankChange) >= 3) {
          alerts.push({
            type: 'RANK_JUMP',
            message: `${rankChange > 0 ? '⬆️' : '⬇️'} ${current.account_name} moved ${Math.abs(rankChange)} positions (${previous.rank} → ${current.rank})`
          });
        }
      }
    }

    return alerts;
  } catch (error) {
    console.error('Error checking ranking alerts:', error);
    return [];
  }
}

/**
 * Get current rankings from database
 */
export async function getCurrentRankings() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT ON (account_id) *
      FROM strategy_rankings
      ORDER BY account_id, timestamp DESC
    `);

    const rankings = result.rows;
    rankings.sort((a, b) => a.rank - b.rank);

    return rankings;
  } finally {
    client.release();
  }
}

/**
 * Get ranking history for an account
 */
export async function getAccountRankingHistory(accountId, limit = 50) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM strategy_rankings
      WHERE account_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `, [accountId, limit]);

    return result.rows;
  } finally {
    client.release();
  }
}
