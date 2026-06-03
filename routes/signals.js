const express = require('express');
const Signal = require('../models/Signal');
const { protect } = require('../middleware/auth');
const { requireSubscription } = require('../middleware/subscription');
const { alignSignalsList } = require('../utils/alignSignalPrices');
const { REAL_SIGNAL_QUERY, PRODUCT_STRATEGY_NAME } = require('../utils/realSignals');
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
function mapEngineSignalToRow(raw) {
  const confidence = Number(raw.confidence) || 0;
  return {
    _id: raw.id || raw.engineSignalId || `${raw.symbol}-${raw.timestamp || Date.now()}`,
    symbol: raw.symbol,
    direction: raw.direction || raw.type,
    confidence,
    entryPrice: raw.entry ?? raw.entryPrice,
    stopLoss: raw.sl ?? raw.stopLoss,
    takeProfit: raw.tp ?? raw.takeProfit,
    grade: raw.grade || '',
    amdPhase: raw.amd_phase || raw.amdPhase || '',
    marketBias: raw.h4_bias || raw.h4Bias || 'neutral',
    h4Bias: raw.h4_bias || raw.h4Bias,
    session: raw.session || 'london',
    riskLevel: raw.risk_level || raw.riskLevel || '',
    strategy:
      raw.strategy === 'AMD AI Engine' || !raw.strategy
        ? PRODUCT_STRATEGY_NAME
        : raw.strategy,
    reason: raw.reason || 'Signal generated',
    engineSignalId: raw.id || raw.engineSignalId || '',
    status: 'active',
    createdAt: raw.timestamp || new Date().toISOString(),
    priceSource: raw.price_source || raw.priceSource,
  };
}

function mergeActiveSignals(dbSignals, engineSignals) {
  const bySymbol = new Map();
  const add = (row) => {
    if (!row?.symbol || !row?.direction) return;
    const sym = String(row.symbol).toUpperCase();
    const existing = bySymbol.get(sym);
    const rowTime = new Date(row.createdAt || 0).getTime();
    const existingTime = existing ? new Date(existing.createdAt || 0).getTime() : 0;
    if (!existing || rowTime >= existingTime) {
      bySymbol.set(sym, row);
    }
  };
  for (const s of engineSignals) add(mapEngineSignalToRow(s));
  for (const s of dbSignals) add(s.toObject ? s.toObject() : s);
  return [...bySymbol.values()].sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );
}

router.get('/', protect, requireSubscription, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      const engineOnly = await proxyGetToPython('/api/engine/signals/active');
      if (engineOnly?.ok && engineOnly.data?.signals?.length) {
        return res.json(alignSignalsList(engineOnly.data.signals.map(mapEngineSignalToRow)));
      }
      return res.json([]);
    }
    const dbSignals = await Signal.find({ status: 'active', ...REAL_SIGNAL_QUERY })
      .sort({ createdAt: -1 })
      .limit(50);
    const engineResult = await proxyGetToPython('/api/engine/signals/active');
    const engineSignals = engineResult?.ok ? engineResult.data?.signals || [] : [];
    const merged = mergeActiveSignals(dbSignals, engineSignals);
    res.json(alignSignalsList(merged));
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
