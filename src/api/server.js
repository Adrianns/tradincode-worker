/**
 * API Server
 * Exposes REST endpoints for multi-account management
 */

import express from 'express';
import cors from 'cors';
import accountsRouter from './routes/accounts.js';
import rankingsRouter from './routes/rankings.js';
import strategiesRouter from './routes/strategies.js';

const app = express();
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/accounts', accountsRouter);
app.use('/api/rankings', rankingsRouter);
app.use('/api/strategies', strategiesRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Start API server
 */
export function startAPIServer() {
  app.listen(PORT, () => {
    console.log(`✓ API Server running on port ${PORT}`);
  });
}

export default app;
