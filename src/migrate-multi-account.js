/**
 * Multi-Account Paper Trading Migration
 * Creates tables for multiple trading accounts with different strategies
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Starting multi-account paper trading migration...');

    // Create trading_accounts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS trading_accounts (
        id SERIAL PRIMARY KEY,
        account_name VARCHAR(100) NOT NULL UNIQUE,
        strategy VARCHAR(50) NOT NULL,
        is_active BOOLEAN DEFAULT false,
        initial_balance DECIMAL(20, 8) DEFAULT 1000,
        balance_usd DECIMAL(20, 8) DEFAULT 1000,
        balance_btc DECIMAL(20, 8) DEFAULT 0,

        stop_loss_percent DECIMAL(5,4) DEFAULT 0.005,
        take_profit_percent DECIMAL(5,4),
        trailing_stop BOOLEAN DEFAULT false,
        trailing_stop_percent DECIMAL(5,4),
        position_size_percent DECIMAL(3,2) DEFAULT 0.95,

        required_convergence INTEGER DEFAULT 2,

        total_trades INTEGER DEFAULT 0,
        winning_trades INTEGER DEFAULT 0,
        losing_trades INTEGER DEFAULT 0,
        total_profit_loss DECIMAL(20, 8) DEFAULT 0,

        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created trading_accounts table');

    // Create indexes for trading_accounts
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_trading_accounts_active
      ON trading_accounts(is_active);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_trading_accounts_strategy
      ON trading_accounts(strategy);
    `);
    console.log('✓ Created indexes on trading_accounts');

    // Add account_id column to paper_trades if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'paper_trades' AND column_name = 'account_id'
        ) THEN
          ALTER TABLE paper_trades
          ADD COLUMN account_id INTEGER REFERENCES trading_accounts(id);
        END IF;
      END $$;
    `);
    console.log('✓ Added account_id column to paper_trades');

    // Create index for paper_trades account_id
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_paper_trades_account_id
      ON paper_trades(account_id, created_at DESC);
    `);
    console.log('✓ Created index on paper_trades(account_id)');

    // Create account_snapshots table
    await client.query(`
      CREATE TABLE IF NOT EXISTS account_snapshots (
        id SERIAL PRIMARY KEY,
        account_id INTEGER REFERENCES trading_accounts(id) ON DELETE CASCADE,
        balance_usd DECIMAL(20, 8),
        balance_btc DECIMAL(20, 8),
        total_value_usd DECIMAL(20, 8),
        btc_price DECIMAL(20, 8),
        roi_percent DECIMAL(10, 4),
        timestamp TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created account_snapshots table');

    // Create index for account_snapshots
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_account_snapshots_account_time
      ON account_snapshots(account_id, timestamp DESC);
    `);
    console.log('✓ Created index on account_snapshots');

    // Create strategy_rankings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS strategy_rankings (
        id SERIAL PRIMARY KEY,
        rank INTEGER NOT NULL,
        account_id INTEGER REFERENCES trading_accounts(id) ON DELETE CASCADE,
        account_name VARCHAR(100),
        strategy VARCHAR(50),
        roi_percent DECIMAL(10, 4),
        win_rate DECIMAL(5, 2),
        total_trades INTEGER,
        balance_usd DECIMAL(20, 8),
        timestamp TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created strategy_rankings table');

    // Create index for strategy_rankings
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_strategy_rankings_timestamp
      ON strategy_rankings(timestamp DESC);
    `);
    console.log('✓ Created index on strategy_rankings');

    console.log('\n✓ Migration completed successfully');
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate()
  .then(() => {
    console.log('Done');
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
