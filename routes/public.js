const express = require('express');
const Signal = require('../models/Signal');
const { alignSignalsList } = require('../utils/alignSignalPrices');

const router = express.Router();

const PYTHON_ENGINE_URL = process.env.PYTHON_ENGINE_URL || 'http://localhost:8000';
const PYTHON_ENGINE_INTERNAL_URL =
  process.env.PYTHON_ENGINE_INTERNAL_URL ||
  'http://srv-captain--ai-tradingbot-python-engine:8000';

const DEMO_STRATEGIES = new Set(['Trend Follower', 'Grid Recovery', 'AI Scalper', 'AI Momentum']);

async function proxyGetToPython(path) {
  const bases = [...new Set([PYTHON_ENGINE_URL, PYTHON_ENGINE_INTERNAL_URL])];
  for (const base of bases) {
    try {
      const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) continue;
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    } catch {
      continue;
    }
  }
  return null;
}

function formatPrice(symbol, value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const digits = String(symbol).toUpperCase() === 'XAUUSD' ? 2 : 5;
  return Number(Number(value).toFixed(digits));
}

function sanitizePublicSignal(raw) {
  const symbol = String(raw.symbol || 'XAUUSD').toUpperCase();
  const direction = String(raw.direction || raw.type || 'BUY').toUpperCase();
  const confidence = Math.round(Number(raw.confidence) || 0);
  const grade =
    raw.grade ||
    (confidence >= 90 ? 'A+' : confidence >= 85 ? 'A' : confidence >= 75 ? 'B' : 'C');

  return {
    id: raw.id || String(raw._id || ''),
    symbol,
    direction,
    entry: formatPrice(symbol, raw.entry ?? raw.entryPrice),
    stopLoss: formatPrice(symbol, raw.sl ?? raw.stopLoss),
    takeProfit: formatPrice(symbol, raw.tp ?? raw.takeProfit),
    confidence,
    grade,
    session: raw.session || 'london',
    strategy: raw.strategy || 'AMD AI Engine',
    amdPhase: raw.amd_phase || raw.amdPhase || null,
    h4Bias: raw.h4_bias || raw.h4Bias || raw.marketBias || null,
    priceSource: raw.priceSource || 'stored',
    timestamp: raw.timestamp || raw.createdAt || new Date().toISOString(),
  };
}

function isShowcaseSignal(signal) {
  if (!signal?.symbol || !signal?.direction) return false;
  if (signal.direction === 'NEUTRAL') return false;
  if (signal.confidence < 70) return false;
  if (DEMO_STRATEGIES.has(signal.strategy)) return false;
  return Number.isFinite(signal.entry);
}

// @route   GET /api/public/signals
// @desc    Public showcase of active AI signals (no auth)
// @access  Public
router.get('/signals', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=15');

    const engineData = await proxyGetToPython('/api/engine/signals/active');
    let signals = [];
    let stats = null;
    let source = 'engine';

    if (engineData?.signals?.length) {
      signals = engineData.signals.map(sanitizePublicSignal).filter(isShowcaseSignal);
      stats = engineData.stats || null;
    }

    if (!signals.length) {
      source = 'database';
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1) {
        const docs = await Signal.find({ status: 'active', direction: { $ne: 'NEUTRAL' } })
          .sort({ createdAt: -1 })
          .limit(12);
        const aligned = alignSignalsList(docs);
        signals = aligned
          .map(sanitizePublicSignal)
          .filter(isShowcaseSignal)
          .filter((s) => !DEMO_STRATEGIES.has(s.strategy));
      }
    }

    signals = signals.slice(0, 6);

    res.json({
      signals,
      stats: stats
        ? {
            total: stats.total ?? 0,
            winRate: stats.win_rate ?? stats.winRate ?? null,
            pending: stats.pending ?? signals.length,
          }
        : { total: signals.length, winRate: null, pending: signals.length },
      source,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load signals', error: error.message });
  }
});

module.exports = router;
