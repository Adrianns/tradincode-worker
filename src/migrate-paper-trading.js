import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * Database migration for Paper Trading functionality
 * Creates tables for tracking simulated trades and configuration
 */
async function migratePaperTrading() {
  const client = await pool.connect();

  try {
    console.log('Starting Paper Trading migration...');

    // Create paper_config table
    await client.query(`
      CREATE TABLE IF NOT EXISTS paper_config (
        id SERIAL PRIMARY KEY,
        is_active BOOLEAN DEFAULT false,
        initial_balance DECIMAL(20, 8) DEFAULT 10000.00,
        balance_usd DECIMAL(20, 8) DEFAULT 10000.00,
        balance_btc DECIMAL(20, 8) DEFAULT 0.00,
        started_at TIMESTAMP,
        percentage_per_trade INTEGER DEFAULT 20,
        buy_threshold INTEGER DEFAULT 70,
        sell_threshold INTEGER DEFAULT 35,
        take_profit_percentage INTEGER DEFAULT 15,
        stop_loss_percentage INTEGER DEFAULT 20,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Created paper_config table');

    // Create paper_trades table
    await client.query(`
      CREATE TABLE IF NOT EXISTS paper_trades (
        id SERIAL PRIMARY KEY,
        trade_type VARCHAR(10) NOT NULL CHECK (trade_type IN ('buy', 'sell')),
        btc_price DECIMAL(20, 8) NOT NULL,
        btc_amount DECIMAL(20, 8) NOT NULL,
        usd_amount DECIMAL(20, 8) NOT NULL,
        balance_usd DECIMAL(20, 8) NOT NULL,
        balance_btc DECIMAL(20, 8) NOT NULL,
        score_at_trade INTEGER NOT NULL,
        reason TEXT NOT NULL,
        profit_loss_usd DECIMAL(20, 8),
        profit_loss_percentage DECIMAL(10, 4),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Created paper_trades table');

    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_paper_trades_created_at
      ON paper_trades(created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_paper_trades_type
      ON paper_trades(trade_type)
    `);
    console.log('✓ Created indexes');

    // Add ATR-based Stop Loss / Take Profit columns (migration for existing tables)
    try {
      await client.query(`
        ALTER TABLE paper_trades
        ADD COLUMN IF NOT EXISTS stop_loss_price DECIMAL(20, 8),
        ADD COLUMN IF NOT EXISTS take_profit_price DECIMAL(20, 8),
        ADD COLUMN IF NOT EXISTS entry_atr DECIMAL(20, 8)
      `);
      console.log('✓ Added stop_loss_price, take_profit_price, entry_atr columns');
    } catch (alterError) {
      // Columns might already exist
      console.log('Note: SL/TP columns may already exist or could not be added');
    }

    // Insert default config if none exists
    const configCheck = await client.query('SELECT COUNT(*) FROM paper_config');
    if (parseInt(configCheck.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO paper_config (is_active, initial_balance, balance_usd, balance_btc)
        VALUES (false, 10000.00, 10000.00, 0.00)
      `);
      console.log('✓ Inserted default paper trading configuration');
    }

    console.log('Paper Trading migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migratePaperTrading().catch(console.error);
