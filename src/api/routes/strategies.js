/**
 * Strategies API Routes
 * Get available trading strategies
 */

import express from 'express';
import { getAvailableStrategies } from '../../strategy-factory.js';

const router = express.Router();

// GET /api/strategies - List available strategies
router.get('/', async (req, res) => {
  try {
    const strategies = getAvailableStrategies();
    res.json(strategies);
  } catch (error) {
    console.error('Error getting strategies:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
