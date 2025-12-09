/**
 * Rankings API Routes
 * Get strategy performance rankings
 */

import express from 'express';
import { getCurrentRankings } from '../../ranking-system.js';

const router = express.Router();

// GET /api/rankings - Get current rankings
router.get('/', async (req, res) => {
  try {
    const rankings = await getCurrentRankings();
    res.json(rankings);
  } catch (error) {
    console.error('Error getting rankings:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
