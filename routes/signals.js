const express = require('express');
const Signal = require('../models/Signal');
const { protect } = require('../middleware/auth');
const { alignSignalsList } = require('../utils/alignSignalPrices');
const router = express.Router();

// @route   GET /api/signals
// @desc    Get all active signals
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.json([
        { _id: 's1', symbol: 'XAUUSD', direction: 'BUY', entryPrice: 2365.50, stopLoss: 2355.00, takeProfit: 2380.00, confidence: 85, qualityScore: 8.5, strategy: 'AI Momentum', marketBias: 'bullish', session: 'london' },
        { _id: 's2', symbol: 'EURUSD', direction: 'SELL', entryPrice: 1.08420, stopLoss: 1.08700, takeProfit: 1.08000, confidence: 72, qualityScore: 7.2, strategy: 'AI Scalper', marketBias: 'bearish', session: 'london' }
      ]);
    }
    const signals = await Signal.find({ status: 'active' }).sort({ createdAt: -1 }).limit(20);
    res.json(alignSignalsList(signals));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/signals/history
// @desc    Get signal history
// @access  Private
router.get('/history', protect, async (req, res) => {
  try {
    const signals = await Signal.find().sort({ createdAt: -1 }).limit(50);
    res.json(alignSignalsList(signals));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/signals/market-analysis
// @desc    Get current market analysis
// @access  Private
router.get('/market-analysis', protect, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        marketBias: 'bullish', volatility: 'medium', session: 'london', overallConfidence: 82, qualityScore: 8.4,
        indicators: { rsi: 62.5, macd: 'bullish', ema: 'bullish', atr: 15.2, volume: 'high' },
        activeBuySignals: 4, activeSellSignals: 1, totalExecuted: 150, successRate: 73.5
      });
    }

    const latestSignal = await Signal.findOne({ status: 'active' }).sort({ createdAt: -1 });
    
    const analysis = {
      marketBias: latestSignal?.marketBias || 'neutral',
      volatility: latestSignal?.volatility || 'medium',
      session: latestSignal?.session || 'london',
      overallConfidence: latestSignal?.confidence || 50,
      qualityScore: latestSignal?.qualityScore || 5,
      indicators: latestSignal?.indicators || {
        rsi: 50, macd: 'neutral', ema: 'neutral', atr: 15.5, volume: 'normal'
      },
      activeBuySignals: await Signal.countDocuments({ status: 'active', direction: 'BUY' }),
      activeSellSignals: await Signal.countDocuments({ status: 'active', direction: 'SELL' }),
      totalExecuted: await Signal.countDocuments({ status: 'executed' }),
      successRate: 73.5
    };

    res.json(analysis);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
