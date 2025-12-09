/**
 * Accounts API Routes
 * CRUD operations for trading accounts
 */

import express from 'express';
import {
  getAllAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  toggleAccount,
  deleteAccount,
  getAccountTrades,
  getAccountSnapshots
} from '../../account-manager.js';

const router = express.Router();

// GET /api/accounts - List all accounts
router.get('/', async (req, res) => {
  try {
    const accounts = await getAllAccounts();
    res.json(accounts);
  } catch (error) {
    console.error('Error getting accounts:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/accounts - Create account
router.post('/', async (req, res) => {
  try {
    const account = await createAccount(req.body);
    res.status(201).json(account);
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(400).json({ error: error.message });
  }
});

// GET /api/accounts/:id - Get account details
router.get('/:id', async (req, res) => {
  try {
    const account = await getAccountById(parseInt(req.params.id));
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json(account);
  } catch (error) {
    console.error('Error getting account:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/accounts/:id - Update account
router.put('/:id', async (req, res) => {
  try {
    const account = await updateAccount(parseInt(req.params.id), req.body);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json(account);
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/accounts/:id - Delete account
router.delete('/:id', async (req, res) => {
  try {
    await deleteAccount(parseInt(req.params.id));
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/accounts/:id/toggle - Toggle active status
router.post('/:id/toggle', async (req, res) => {
  try {
    const account = await getAccountById(parseInt(req.params.id));
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    const updated = await toggleAccount(parseInt(req.params.id), !account.is_active);
    res.json(updated);
  } catch (error) {
    console.error('Error toggling account:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/accounts/:id/trades - Get account trades
router.get('/:id/trades', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const trades = await getAccountTrades(parseInt(req.params.id), limit);
    res.json(trades);
  } catch (error) {
    console.error('Error getting account trades:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/accounts/:id/snapshots - Get balance snapshots
router.get('/:id/snapshots', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const snapshots = await getAccountSnapshots(parseInt(req.params.id), limit);
    res.json(snapshots);
  } catch (error) {
    console.error('Error getting account snapshots:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
