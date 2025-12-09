/**
 * Strategies API Routes
 * Get available trading strategies and timeframes
 */

import express from 'express';
import { getAvailableStrategies, getAvailableTimeframes } from '../../strategy-factory.js';

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

// GET /api/strategies/timeframes - List available timeframes
router.get('/timeframes', async (req, res) => {
  try {
    const timeframes = getAvailableTimeframes();
    res.json(timeframes);
  } catch (error) {
    console.error('Error getting timeframes:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
