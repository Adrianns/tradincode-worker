import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * Database migration script
 * Creates all necessary tables for the application
 */
async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Starting database migration...');

    // Create klines table for historical price data
    await client.query(`
      CREATE TABLE IF NOT EXISTS klines (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP UNIQUE NOT NULL,
        open DECIMAL(20, 8) NOT NULL,
        high DECIMAL(20, 8) NOT NULL,
        low DECIMAL(20, 8) NOT NULL,
        close DECIMAL(20, 8) NOT NULL,
        volume DECIMAL(20, 8) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Created klines table');

    // Create analyses table for storing analysis results
    await client.query(`
      CREATE TABLE IF NOT EXISTS analyses (
        id SERIAL PRIMARY KEY,
        price DECIMAL(20, 8) NOT NULL,
        ma_50 DECIMAL(20, 8),
        ma_200 DECIMAL(20, 8),
        rsi_weekly DECIMAL(10, 2),
        macd_weekly DECIMAL(20, 8),
        macd_signal DECIMAL(20, 8),
        bb_upper DECIMAL(20, 8),
        bb_middle DECIMAL(20, 8),
        bb_lower DECIMAL(20, 8),
        volume_24h DECIMAL(20, 8),
        score INTEGER NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Created analyses table');

    // Create alerts table for tracking sent alerts
    await client.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        score INTEGER,
        details JSONB,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Created alerts table');

    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_klines_timestamp ON klines(timestamp DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_analyses_timestamp ON analyses(timestamp DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC)
    `);
    console.log('✓ Created indexes');

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
