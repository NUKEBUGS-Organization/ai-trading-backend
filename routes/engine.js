const express = require('express');
const AITrade = require('../models/AITrade');
const Signal = require('../models/Signal');
const { protect, adminOnly } = require('../middleware/auth');
const router = express.Router();
const wsHub = require('../wsHub');

const PYTHON_ENGINE_URL = process.env.PYTHON_ENGINE_URL || 'http://localhost:8000';
const PYTHON_ENGINE_INTERNAL_URL =
  process.env.PYTHON_ENGINE_INTERNAL_URL ||
  'http://srv-captain--ai-tradingbot-python-engine:8000';

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
    wsHub.broadcastMt5AccountFromPayload(req.body);
    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/engine/status
// @desc    Get engine status for dashboard (proxied from Python engine)
// @access  Private
async function fetchEngineStatus(baseUrl) {
  return fetch(`${baseUrl}/api/engine/status`, { signal: AbortSignal.timeout(5000) });
}

router.get('/status', protect, async (req, res) => {
  const bases = [...new Set([PYTHON_ENGINE_URL, PYTHON_ENGINE_INTERNAL_URL])];

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i];
    const isLast = i === bases.length - 1;
    try {
      const response = await fetchEngineStatus(base);
      if (response.ok) {
        const data = await response.json();
        wsHub.broadcastMt5AccountFromPayload(data);
        return res.json({ connected: true, ...data });
      }
      console.error('Python engine responded with:', response.status, `(${base})`);
      if (isLast) {
        return res.json({ connected: false, lastUpdate: null, reason: `Engine returned ${response.status}` });
      }
    } catch (error) {
      console.error('Python engine fetch error:', error.message, `(${base})`);
      if (isLast) {
        return res.json({ connected: false, lastUpdate: null, error: error.message });
      }
    }
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

// @route   POST /api/engine/analyze
// @desc    Run AI market analysis (proxies to Python engine)
// @access  Private
async function proxyPostToPython(path, body, timeoutMs = 60000) {
  const bases = [...new Set([PYTHON_ENGINE_URL, PYTHON_ENGINE_INTERNAL_URL])];
  let lastError = null;

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i];
    const isLast = i === bases.length - 1;
    try {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: text };
        }
      }
      if (response.ok) return { ok: true, data };
      if (isLast) return { ok: false, status: response.status, data };
    } catch (error) {
      lastError = error;
      if (isLast) throw error;
    }
  }
  throw lastError || new Error('Python engine unreachable');
}

router.post('/analyze', protect, async (req, res) => {
  try {
    const { symbol } = req.body;
    if (!symbol) {
      return res.status(400).json({ message: 'symbol is required' });
    }
    const result = await proxyPostToPython('/api/engine/analyze', { symbol });
    if (result.ok) return res.json(result.data);
    return res.status(result.status || 502).json(result.data);
  } catch (error) {
    return res.status(503).json({
      action: 'OFFLINE',
      reason: 'Python engine not connected',
      error: error.message,
    });
  }
});

// @route   POST /api/engine/backtest
// @desc    Run backtest (proxies to Python engine)
// @access  Private
router.post('/backtest', protect, async (req, res) => {
  try {
    const { symbol, initial_balance, preset, spread_pips } = req.body;
    if (!symbol) {
      return res.status(400).json({ message: 'symbol is required' });
    }
    const result = await proxyPostToPython(
      '/api/engine/backtest',
      {
        symbol,
        initial_balance: initial_balance ?? 10000,
        preset: preset ?? 'moderate',
        spread_pips: spread_pips ?? 3.0,
      },
      120000
    );
    if (result.ok) return res.json(result.data);
    return res.status(result.status || 502).json(result.data);
  } catch (error) {
    return res.status(503).json({
      error: 'Python engine not connected',
      message: error.message,
    });
  }
});

// @route   GET /api/engine/risk/:userId
// @desc    Get risk settings for user (used by Python engine)
// @access  Internal
router.get('/risk/:userId', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { userId } = req.params;

    if (!/^[a-f0-9]{24}$/i.test(String(userId))) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.json({
        maxDailyDrawdown: 5,
        maxRiskPerTrade: 2,
        maxOpenPositions: 5,
        dynamicLotSizing: true,
        spreadProtection: true,
        newsFilter: true,
      });
    }

    const User = require('../models/User');
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user.riskSettings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
