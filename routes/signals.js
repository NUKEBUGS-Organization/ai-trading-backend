const express = require('express');
const Signal = require('../models/Signal');
const { protect } = require('../middleware/auth');
const { requireSubscription } = require('../middleware/subscription');
const { alignSignalsList } = require('../utils/alignSignalPrices');
const { REAL_SIGNAL_QUERY } = require('../utils/realSignals');
const router = express.Router();

const PYTHON_ENGINE_URL = process.env.PYTHON_ENGINE_URL || 'http://localhost:8000';
const PYTHON_ENGINE_INTERNAL_URL =
  process.env.PYTHON_ENGINE_INTERNAL_URL || 'http://srv-captain--ai-tradingbot-python-engine:8000';

async function proxyGetToPython(path) {
  const bases = [...new Set([PYTHON_ENGINE_URL, PYTHON_ENGINE_INTERNAL_URL])];
  for (const base of bases) {
    try {
      const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return { ok: true, data: await response.json() };
    } catch (e) {
      continue;
    }
  }
  return { ok: false };
}

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
// @desc    Get current market analysis (Python engine latest, else DB fallback)
// @access  Private
router.get('/market-analysis', protect, requireSubscription, async (req, res) => {
  try {
    const mongoose = require('mongoose');

    const engineResult = await proxyGetToPython('/api/engine/analysis/latest').catch(() => null);

    if (engineResult?.ok && engineResult.data && !engineResult.data.message) {
      const analysis = engineResult.data;
      const score = analysis.analysis?.score || {};
      const h4 = analysis.analysis?.h4_bias || {};
      const filters = analysis.filters || {};

      return res.json({
        marketBias: h4.bias || 'neutral',
        volatility: filters.volatility?.volatility_level || 'medium',
        session: filters.session?.session || 'unknown',
        overallConfidence: score.total_score || 0,
        qualityScore: score.total_score ? score.total_score / 10 : 0,
        indicators: {
          rsi: analysis.analysis?.m15_structure?.rsi || 50,
          macd: h4.bias === 'bullish' ? 'bullish' : h4.bias === 'bearish' ? 'bearish' : 'neutral',
          ema: h4.bias || 'neutral',
          atr: filters.volatility?.atr || 0,
          volume: 'normal',
        },
        activeBuySignals: 0,
        activeSellSignals: 0,
        totalExecuted: await Signal.countDocuments({ status: 'executed' }).catch(() => 0),
        successRate: null,
        amdPhase: analysis.analysis?.amd?.current_phase || 'unknown',
        h4Bias: h4.bias || 'neutral',
        h4Strength: h4.strength || 0,
        lastAnalysis: analysis.timestamp,
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.json({
        marketBias: 'neutral',
        volatility: 'medium',
        session: 'unknown',
        overallConfidence: 0,
        qualityScore: 0,
        indicators: { rsi: 50, macd: 'neutral', ema: 'neutral', atr: 0, volume: 'normal' },
        activeBuySignals: 0,
        activeSellSignals: 0,
        totalExecuted: 0,
        successRate: null,
      });
    }

    const latestSignal = await Signal.findOne({ status: 'active' }).sort({ createdAt: -1 });
    return res.json({
      marketBias: latestSignal?.marketBias || 'neutral',
      volatility: latestSignal?.volatility || 'medium',
      session: latestSignal?.session || 'unknown',
      overallConfidence: latestSignal?.confidence || 0,
      qualityScore: latestSignal?.qualityScore || 0,
      indicators: latestSignal?.indicators || {
        rsi: 50,
        macd: 'neutral',
        ema: 'neutral',
        atr: 0,
        volume: 'normal',
      },
      activeBuySignals: await Signal.countDocuments({ status: 'active', direction: 'BUY' }),
      activeSellSignals: await Signal.countDocuments({ status: 'active', direction: 'SELL' }),
      totalExecuted: await Signal.countDocuments({ status: 'executed' }),
      successRate: null,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
