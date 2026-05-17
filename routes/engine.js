const express = require('express');
const AITrade = require('../models/AITrade');
const Signal = require('../models/Signal');
const { protect, adminOnly } = require('../middleware/auth');
const router = express.Router();

// Store engine status in memory (updated by Python engine)
let engineStatus = {
  connected: false,
  lastUpdate: null,
  status: {}
};

// @route   POST /api/engine/status
// @desc    Receive status update from Python engine
// @access  Internal
router.post('/status', async (req, res) => {
  try {
    engineStatus = {
      connected: true,
      lastUpdate: new Date().toISOString(),
      status: req.body
    };
    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/engine/status
// @desc    Get engine status for dashboard
// @access  Private
router.get('/status', protect, async (req, res) => {
  try {
    // Check if engine is connected (last update within 60 seconds)
    const isConnected = engineStatus.lastUpdate && 
      (Date.now() - new Date(engineStatus.lastUpdate).getTime()) < 60000;
    
    res.json({
      connected: isConnected,
      ...engineStatus.status,
      lastUpdate: engineStatus.lastUpdate
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/engine/signal
// @desc    Receive signal from Python engine
// @access  Internal
router.post('/signal', async (req, res) => {
  try {
    const signalData = req.body;
    
    // Save to Signal collection
    const signal = await Signal.create({
      symbol: signalData.symbol,
      direction: signalData.direction,
      confidence: signalData.confidence,
      entryPrice: signalData.entry,
      stopLoss: signalData.sl,
      takeProfit: signalData.tp,
      marketBias: signalData.h4_bias || 'neutral',
      session: signalData.session || 'london',
      qualityScore: signalData.confidence / 10,
      strategy: 'AMD AI Engine',
      status: 'active'
    });
    
    res.json({ received: true, signalId: signal._id });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/engine/trade
// @desc    Receive trade execution from Python engine
// @access  Internal
router.post('/trade', async (req, res) => {
  try {
    const trade = await AITrade.create(req.body);
    res.json({ received: true, tradeId: trade._id });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/engine/trades
// @desc    Get AI engine trades
// @access  Private
router.get('/trades', protect, async (req, res) => {
  try {
    const trades = await AITrade.find().sort({ createdAt: -1 }).limit(50);
    res.json(trades);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/engine/risk/:userId
// @desc    Get risk settings for user (used by Python engine)
// @access  Internal
router.get('/risk/:userId', async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user.riskSettings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
