/**
 * Add timeframe field to trading_accounts table
 * Allows accounts to operate on different chart intervals (1d, 1w, 4h, etc.)
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
    console.log('Starting timeframe migration...');

    // Add timeframe column to trading_accounts
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'trading_accounts' AND column_name = 'timeframe'
        ) THEN
          ALTER TABLE trading_accounts
          ADD COLUMN timeframe VARCHAR(10) DEFAULT '1d';
        END IF;
      END $$;
    `);
    console.log('✓ Added timeframe column to trading_accounts');

    // Update existing accounts to have default timeframe
    await client.query(`
      UPDATE trading_accounts
      SET timeframe = '1d'
      WHERE timeframe IS NULL;
    `);
    console.log('✓ Updated existing accounts with default timeframe');

    // Create index for timeframe
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_trading_accounts_timeframe
      ON trading_accounts(timeframe);
    `);
    console.log('✓ Created index on trading_accounts(timeframe)');

    console.log('\n✓ Timeframe migration completed successfully');
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
