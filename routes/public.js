const express = require('express');
const Signal = require('../models/Signal');
const { alignSignalsList } = require('../utils/alignSignalPrices');
const { maskSignal } = require('../utils/subscription');

const { PRODUCT_STRATEGY_NAME } = require('../utils/realSignals');

const router = express.Router();

const PYTHON_ENGINE_URL = process.env.PYTHON_ENGINE_URL || 'http://localhost:8000';
const PYTHON_ENGINE_INTERNAL_URL =
  process.env.PYTHON_ENGINE_INTERNAL_URL ||
  'http://srv-captain--ai-tradingbot-python-engine:8000';

const DEMO_STRATEGIES = new Set(['Trend Follower', 'Grid Recovery', 'AI Scalper', 'AI Momentum']);

async function proxyGetToPython(path, timeoutMs = 5000) {
  const bases = [...new Set([PYTHON_ENGINE_URL, PYTHON_ENGINE_INTERNAL_URL])];
  for (const base of bases) {
    try {
      const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
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
  const sym = String(symbol).toUpperCase();
  const digits = sym === 'XAUUSD' ? 2 : (sym === 'USDJPY' || sym === 'GBPJPY' ? 3 : 5);
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
    id: raw.id || String(raw._id || raw.engineSignalId || ''),
    symbol,
    direction,
    entry: formatPrice(symbol, raw.entry ?? raw.entryPrice),
    stopLoss: formatPrice(symbol, raw.sl ?? raw.stopLoss),
    takeProfit: formatPrice(symbol, raw.tp ?? raw.takeProfit),
    confidence,
    grade,
    session: raw.session || 'london',
    strategy:
      raw.strategy === 'AMD AI Engine' || !raw.strategy
        ? PRODUCT_STRATEGY_NAME
        : raw.strategy,
    amdPhase: raw.amd_phase || raw.amdPhase || null,
    h4Bias: raw.h4_bias || raw.h4Bias || raw.marketBias || null,
    status: raw.status || 'active',
    closeReason: raw.closeReason || raw.close_reason || null,
    resultProfit: raw.resultProfit ?? raw.profit ?? null,
    reason: raw.reason || null,
    priceSource: raw.priceSource || 'stored',
    timestamp: raw.timestamp || raw.createdAt || new Date().toISOString(),
    closedAt: raw.closedAt || null,
  };
}

function isShowcaseSignal(signal) {
  if (!signal?.symbol || !signal?.direction) return false;
  if (signal.direction === 'NEUTRAL') return false;
  if (signal.confidence < 70) return false;
  if (DEMO_STRATEGIES.has(signal.strategy)) return false;
  return Number.isFinite(signal.entry);
}

function maskPublicSignal(signal) {
  const masked = maskSignal(signal);
  return {
    ...masked,
    id: signal.id,
    symbol: signal.symbol,
    direction: signal.direction,
    session: signal.session,
    amdPhase: signal.amdPhase,
    h4Bias: signal.h4Bias,
    marketBias: signal.h4Bias || signal.marketBias,
    status: signal.status,
    timestamp: signal.timestamp,
    closeReason: signal.closeReason || null,
  };
}

async function loadSignalsFromDb(filter = {}) {
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) return [];
  const docs = await Signal.find(filter).sort({ createdAt: -1 }).limit(24);
  return alignSignalsList(docs).map(sanitizePublicSignal);
}

// @route   GET /api/public/signals
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
      signals = (await loadSignalsFromDb({ status: 'active', direction: { $ne: 'NEUTRAL' } }))
        .filter(isShowcaseSignal)
        .filter((s) => !DEMO_STRATEGIES.has(s.strategy));
    }

    signals = signals.slice(0, 6).map(maskPublicSignal);

    res.json({
      signals,
      stats: { total: signals.length, winRate: null, pending: signals.length },
      source,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load signals', error: error.message });
  }
});

// @route   GET /api/public/signals/history
router.get('/signals/history', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=30');
    const limit = Math.min(parseInt(req.query.limit, 10) || 12, 24);

    let history = await loadSignalsFromDb({
      status: { $in: ['closed', 'hit_tp', 'hit_sl', 'executed', 'expired', 'cancelled'] },
    });

    if (!history.length) {
      history = (await loadSignalsFromDb({ status: { $ne: 'active' } })).slice(0, limit);
    }

    history = history.slice(0, limit).map(maskPublicSignal);

    res.json({
      history,
      stats: { total: history.length, winRate: null, wins: null },
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load signal history', error: error.message });
  }
});

// @route   GET /api/public/prices
// @desc    Live market prices for landing page (TwelveData / MT5 via Python engine)
// @access  Public
router.get('/prices', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=10');

    const engineData = await proxyGetToPython('/api/engine/prices', 8000);
    if (engineData?.prices && Object.keys(engineData.prices).length) {
      return res.json({
        success: true,
        prices: engineData.prices,
        source: engineData.source || 'twelvedata',
        updatedAt: engineData.timestamp || new Date().toISOString(),
      });
    }

    const statusData = await proxyGetToPython('/api/engine/status');
    const prices = statusData?.mt5_prices || {};
    if (Object.keys(prices).length) {
      return res.json({
        success: true,
        prices,
        source: statusData?.price_source || 'twelvedata',
        updatedAt: statusData?.timestamp || new Date().toISOString(),
      });
    }

    const cached = require('../wsHub').getCachedMt5Prices?.() || null;
    if (cached && Object.keys(cached).length) {
      return res.json({
        success: true,
        prices: cached,
        source: 'cache',
        updatedAt: new Date().toISOString(),
      });
    }

    return res.json({
      success: false,
      prices: {},
      source: null,
      message: 'Prices unavailable',
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load prices', error: error.message });
  }
});

module.exports = router;
