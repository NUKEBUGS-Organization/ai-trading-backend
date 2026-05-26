const express = require('express');
const Signal = require('../models/Signal');
const { protect } = require('../middleware/auth');
const { requireSubscription } = require('../middleware/subscription');
const { alignSignalsList } = require('../utils/alignSignalPrices');
const { REAL_SIGNAL_QUERY } = require('../utils/realSignals');
const router = express.Router();

// @route   GET /api/signals
// @desc    Get active signals from the AI engine only (no seed/demo rows)
// @access  Private
router.get('/', protect, requireSubscription, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }
    const signals = await Signal.find({ status: 'active', ...REAL_SIGNAL_QUERY })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(alignSignalsList(signals));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/signals/history
// @desc    Get signal history (engine-generated only)
// @access  Private
router.get('/history', protect, requireSubscription, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }
    const signals = await Signal.find(REAL_SIGNAL_QUERY)
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(alignSignalsList(signals));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/signals/market-analysis
// @desc    Get current market analysis from latest real engine signal
// @access  Private
router.get('/market-analysis', protect, requireSubscription, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        marketBias: 'neutral',
        volatility: 'medium',
        session: 'london',
        overallConfidence: 0,
        qualityScore: 0,
        indicators: { rsi: 50, macd: 'neutral', ema: 'neutral', atr: 0, volume: 'normal' },
        activeBuySignals: 0,
        activeSellSignals: 0,
        totalExecuted: 0,
        successRate: null,
      });
    }

    const latestSignal = await Signal.findOne({ status: 'active', ...REAL_SIGNAL_QUERY }).sort({
      createdAt: -1,
    });

    const activeBuySignals = await Signal.countDocuments({
      status: 'active',
      direction: 'BUY',
      ...REAL_SIGNAL_QUERY,
    });
    const activeSellSignals = await Signal.countDocuments({
      status: 'active',
      direction: 'SELL',
      ...REAL_SIGNAL_QUERY,
    });
    const totalExecuted = await Signal.countDocuments({
      status: { $in: ['executed', 'hit_tp', 'hit_sl', 'closed'] },
      ...REAL_SIGNAL_QUERY,
    });
    const closedWins = await Signal.countDocuments({
      status: { $in: ['hit_tp', 'executed'] },
      ...REAL_SIGNAL_QUERY,
    });
    const closedTotal = await Signal.countDocuments({
      status: { $in: ['hit_tp', 'hit_sl', 'executed', 'closed', 'expired'] },
      ...REAL_SIGNAL_QUERY,
    });

    const successRate =
      closedTotal > 0 ? Math.round((closedWins / closedTotal) * 1000) / 10 : null;

    const analysis = {
      marketBias: latestSignal?.marketBias || 'neutral',
      volatility: latestSignal?.volatility || 'medium',
      session: latestSignal?.session || 'london',
      overallConfidence: latestSignal?.confidence || 0,
      qualityScore: latestSignal?.qualityScore || 0,
      indicators: latestSignal?.indicators || {
        rsi: 50,
        macd: 'neutral',
        ema: 'neutral',
        atr: 0,
        volume: 'normal',
      },
      activeBuySignals,
      activeSellSignals,
      totalExecuted,
      successRate,
    };

    res.json(analysis);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
