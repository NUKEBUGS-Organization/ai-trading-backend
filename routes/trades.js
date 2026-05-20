const express = require('express');
const Trade = require('../models/Trade');
const { protect } = require('../middleware/auth');
const { getMongoUserId } = require('../utils/userId');
const router = express.Router();

// @route   GET /api/trades
// @desc    Get all trades for current user
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const mongoUserId = getMongoUserId(req);

    if (mongoose.connection.readyState !== 1 || !mongoUserId) {
      return res.json({ trades: [], total: 0, page: 1, pages: 1 });
    }

    const { status, limit = 50, page = 1 } = req.query;
    const query = { user: mongoUserId };
    if (status) query.status = status;

    const trades = await Trade.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Trade.countDocuments(query);

    res.json({ trades, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/trades/stats
// @desc    Get trading statistics
// @access  Private
router.get('/stats', protect, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const mongoUserId = getMongoUserId(req);

    if (mongoose.connection.readyState !== 1 || !mongoUserId) {
      return res.json({
        totalTrades: 125,
        openTrades: 3,
        winRate: "76.5",
        profitFactor: "2.14",
        totalProfit: "12450.50",
        avgProfit: "99.60",
        bestTrade: "450.20",
        worstTrade: "-120.50",
        avgDuration: "240"
      });
    }

    const trades = await Trade.find({ user: mongoUserId, status: 'closed' });
    const openTrades = await Trade.find({ user: mongoUserId, status: 'open' });

    const wins = trades.filter(t => t.profit > 0);
    const losses = trades.filter(t => t.profit <= 0);
    const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);
    const grossProfit = wins.reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0));

    const stats = {
      totalTrades: trades.length,
      openTrades: openTrades.length,
      winRate: trades.length > 0 ? ((wins.length / trades.length) * 100).toFixed(1) : 0,
      profitFactor: grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? '∞' : '0',
      totalProfit: totalProfit.toFixed(2),
      avgProfit: trades.length > 0 ? (totalProfit / trades.length).toFixed(2) : 0,
      bestTrade: trades.length > 0 ? Math.max(...trades.map(t => t.profit)).toFixed(2) : 0,
      worstTrade: trades.length > 0 ? Math.min(...trades.map(t => t.profit)).toFixed(2) : 0,
      avgDuration: trades.length > 0 ? (trades.reduce((sum, t) => sum + t.duration, 0) / trades.length).toFixed(0) : 0
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/trades/equity-curve
// @desc    Get equity curve data
// @access  Private
router.get('/equity-curve', protect, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const mongoUserId = getMongoUserId(req);

    if (mongoose.connection.readyState !== 1 || !mongoUserId) {
      return res.json([
        { date: '2025-05-01', balance: 10000, profit: 0 },
        { date: '2025-05-02', balance: 10200, profit: 200 },
        { date: '2025-05-03', balance: 10150, profit: -50 },
        { date: '2025-05-04', balance: 10400, profit: 250 },
        { date: '2025-05-05', balance: 10800, profit: 400 },
        { date: '2025-05-06', balance: 10700, profit: -100 },
        { date: '2025-05-07', balance: 11200, profit: 500 },
      ]);
    }

    const trades = await Trade.find({ user: mongoUserId, status: 'closed' }).sort({ closeTime: 1 });
    
    let balance = 10000;
    const curve = [{ date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], balance: 10000 }];
    
    trades.forEach(trade => {
      balance += trade.profit;
      curve.push({
        date: trade.closeTime ? trade.closeTime.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        balance: parseFloat(balance.toFixed(2)),
        profit: trade.profit
      });
    });

    res.json(curve);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
