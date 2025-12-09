/**
 * Migration script for indicator signals tracking
 * Creates paper_signals table to store all generated signals
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
    console.log('Starting indicator signals migration...');

    // Create paper_signals table
    await client.query(`
      CREATE TABLE IF NOT EXISTS paper_signals (
        id SERIAL PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        indicator VARCHAR(50) NOT NULL,
        signal VARCHAR(10),
        price DECIMAL(20,8) NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('✓ Created paper_signals table');

    // Create indexes for better query performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_paper_signals_timestamp
      ON paper_signals(timestamp DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_paper_signals_symbol_indicator
      ON paper_signals(symbol, indicator);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_paper_signals_signal
      ON paper_signals(signal) WHERE signal IS NOT NULL;
    `);

    console.log('✓ Created indexes');

    console.log('✓ Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
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
