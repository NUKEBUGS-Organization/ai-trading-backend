const express = require('express');
const AITrade = require('../models/AITrade');
const Signal = require('../models/Signal');
const { PRODUCT_STRATEGY_NAME, LEGACY_STRATEGY_NAMES } = require('../utils/realSignals');
const { protect, adminOnly } = require('../middleware/auth');
const { requireSubscription } = require('../middleware/subscription');
const router = express.Router();
const wsHub = require('../wsHub');

const PYTHON_ENGINE_INTERNAL_URL =
  process.env.PYTHON_ENGINE_INTERNAL_URL ||
  'http://srv-captain--ai-tradingbot-python-engine:8000';

const PYTHON_ENGINE_URL =
  process.env.PYTHON_ENGINE_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://ai-tradingbot-python-engine.vcl4xengine.com'
    : 'http://localhost:8000');

/** CapRover: try public HTTPS first, then internal DNS; avoid localhost in production. */
function getPythonEngineBases() {
  const bases = [];
  const publicUrl = (PYTHON_ENGINE_URL || '').replace(/\/$/, '');
  const internalUrl = (PYTHON_ENGINE_INTERNAL_URL || '').replace(/\/$/, '');
  const isLocal = (url) => /localhost|127\.0\.0\.1/.test(url);

  if (publicUrl && !(process.env.NODE_ENV === 'production' && isLocal(publicUrl))) {
    bases.push(publicUrl);
  }
  if (internalUrl && internalUrl !== publicUrl) {
    bases.push(internalUrl);
  }
  if (publicUrl && isLocal(publicUrl)) {
    bases.push(publicUrl);
  }
  return [...new Set(bases.filter(Boolean))];
}

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
    wsHub.broadcastMt5PricesFromPayload(req.body);
    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/engine/prices
// @desc    Receive live MT5 quotes from Python engine → WebSocket tickers
// @access  Internal
router.post('/prices', async (req, res) => {
  try {
    wsHub.broadcastMt5PricesFromPayload(req.body);
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
  const bases = getPythonEngineBases();

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i];
    const isLast = i === bases.length - 1;
    try {
      const response = await fetchEngineStatus(base);
      if (response.ok) {
        const data = await response.json();
        wsHub.broadcastMt5AccountFromPayload(data);
        wsHub.broadcastMt5PricesFromPayload(data);
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
    const grade = signalData.grade || '';
    const confidence = Number(signalData.confidence) || 0;

    await Signal.updateMany(
      {
        symbol: signalData.symbol,
        status: 'active',
        strategy: {
          $in: [signalData.strategy || PRODUCT_STRATEGY_NAME, ...LEGACY_STRATEGY_NAMES],
        },
      },
      { $set: { status: 'expired' } }
    );

    const signal = await Signal.create({
      symbol: signalData.symbol,
      direction: signalData.direction,
      confidence,
      entryPrice: signalData.entry ?? signalData.entryPrice,
      stopLoss: signalData.sl ?? signalData.stopLoss ?? null,
      takeProfit: signalData.tp ?? signalData.takeProfit ?? null,
      marketBias: signalData.h4_bias || signalData.h4Bias || signalData.marketBias || 'neutral',
      session: signalData.session || 'london',
      qualityScore: signalData.qualityScore ?? (confidence / 10),
      strategy: signalData.strategy || PRODUCT_STRATEGY_NAME,
      grade,
      amdPhase: signalData.amdPhase || signalData.amd_phase || '',
      reason: signalData.reason || '',
      engineSignalId: signalData.signalId || signalData.engineSignalId || '',
      riskLevel: signalData.riskLevel || signalData.risk_level || '',
      status: signalData.status || 'active',
      ...(signalData.priceSource ? { priceSource: signalData.priceSource } : {}),
    });

    wsHub.broadcastSignalAlert(signal.toObject());

    res.json({ received: true, signalId: signal._id, engineSignalId: signal.engineSignalId });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/engine/signal/result
// @desc    Update signal when trade closes (TP/SL/manual)
// @access  Internal
router.post('/signal/result', async (req, res) => {
  try {
    const {
      signalId,
      engineSignalId,
      ticket,
      symbol,
      status,
      closeReason,
      close_reason,
      profit,
      resultProfit,
    } = req.body;

    const query = {};
    if (signalId) query._id = signalId;
    else if (engineSignalId) query.engineSignalId = String(engineSignalId);
    else if (ticket) query.mt5Ticket = Number(ticket);
    else if (symbol) {
      const doc = await Signal.findOne({ symbol, status: 'active' }).sort({ createdAt: -1 });
      if (!doc) return res.status(404).json({ message: 'Active signal not found' });
      Object.assign(query, { _id: doc._id });
    } else {
      return res.status(400).json({ message: 'signalId, engineSignalId, ticket, or symbol required' });
    }

    const reasonText = String(closeReason || close_reason || '').toLowerCase();
    let resolvedStatus = status;
    if (!resolvedStatus) {
      if (reasonText.includes('tp') || reasonText.includes('take profit')) resolvedStatus = 'hit_tp';
      else if (reasonText.includes('sl') || reasonText.includes('stop loss')) resolvedStatus = 'hit_sl';
      else resolvedStatus = 'closed';
    }

    const signal = await Signal.findOneAndUpdate(
      query,
      {
        status: resolvedStatus,
        closeReason: closeReason || close_reason || '',
        resultProfit: resultProfit ?? profit ?? null,
        mt5Ticket: ticket ? Number(ticket) : undefined,
        closedAt: new Date(),
      },
      { new: true }
    );

    if (!signal) return res.status(404).json({ message: 'Signal not found' });

    wsHub.broadcastSignalAlert({ ...signal.toObject(), status: signal.status });

    res.json({ updated: true, signalId: signal._id, status: signal.status });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/engine/trade
// @desc    Receive trade execution from Python engine
// @access  Internal
router.post('/trade', async (req, res) => {
  try {
    const body = req.body || {};
    const trade = await AITrade.create({
      symbol: body.symbol || 'UNKNOWN',
      type: body.type || body.action || 'UNKNOWN',
      entry: body.entry ?? body.price ?? 0,
      sl: body.sl ?? body.stopLoss,
      tp: body.tp ?? body.takeProfit,
      lotSize: body.lot_size ?? body.lotSize,
      confidence: body.confidence || 0,
      status: body.status || 'executed',
      profit: body.profit || 0,
      ticket: body.ticket,
      session: body.session,
      amdPhase: body.amdPhase ?? body.amd_phase,
      h4Bias: body.h4Bias ?? body.h4_bias,
    });
    res.json({ received: true, tradeId: trade._id });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

const DEFAULT_BALANCE = Number(process.env.DEFAULT_BALANCE || 10000);

function mapEngineTradeStatusQuery(statusParam) {
  const s = String(statusParam || '').toLowerCase();
  if (s === 'open') {
    return { status: { $in: ['pending', 'executed'] } };
  }
  if (s === 'closed') {
    return { status: 'closed' };
  }
  return {};
}

// @route   GET /api/engine/trades
// @desc    Get AI engine trades (global — not user-scoped)
// @access  Private
router.get('/trades', protect, requireSubscription, async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    const query = mapEngineTradeStatusQuery(status);
    const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    const trades = await AITrade.find(query).sort({ createdAt: -1 }).limit(cap);
    res.json({ trades, total: trades.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/engine/trades/stats
// @desc    Trading stats from AITrade collection
// @access  Private
router.get('/trades/stats', protect, requireSubscription, async (req, res) => {
  try {
    const closed = await AITrade.find({
      status: { $in: ['closed', 'executed'] },
    }).lean();

    const openTrades = await AITrade.countDocuments({
      status: { $in: ['pending', 'executed'] },
    });

    const wins = closed.filter((t) => (t.profit ?? 0) > 0);
    const losses = closed.filter((t) => (t.profit ?? 0) <= 0);
    const totalProfit = closed.reduce((sum, t) => sum + (t.profit ?? 0), 0);
    const grossProfit = wins.reduce((sum, t) => sum + (t.profit ?? 0), 0);
    const grossLoss = Math.abs(
      losses.reduce((sum, t) => sum + (t.profit ?? 0), 0)
    );

    res.json({
      totalTrades: closed.length,
      openTrades,
      winRate: closed.length ? ((wins.length / closed.length) * 100).toFixed(1) : '0',
      profitFactor:
        grossLoss > 0
          ? (grossProfit / grossLoss).toFixed(2)
          : grossProfit > 0
            ? '∞'
            : '0',
      totalProfit: totalProfit.toFixed(2),
      startBalance: DEFAULT_BALANCE,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/engine/trades/equity-curve
// @desc    Equity curve from closed AITrade P&L
// @access  Private
router.get('/trades/equity-curve', protect, requireSubscription, async (req, res) => {
  try {
    const closed = await AITrade.find({ status: 'closed' })
      .sort({ createdAt: 1 })
      .lean();

    let balance = DEFAULT_BALANCE;
    const curve = [
      {
        date: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
        balance: parseFloat(balance.toFixed(2)),
        profit: 0,
      },
    ];

    closed.forEach((trade) => {
      balance += trade.profit ?? 0;
      const date = trade.closedAt
        ? new Date(trade.closedAt).toISOString().split('T')[0]
        : new Date(trade.createdAt).toISOString().split('T')[0];
      curve.push({
        date,
        balance: parseFloat(balance.toFixed(2)),
        profit: trade.profit ?? 0,
      });
    });

    res.json({
      startBalance: DEFAULT_BALANCE,
      curve,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/engine/analyze
// @desc    Run AI market analysis (proxies to Python engine)
// @access  Private
async function proxyGetToPython(path) {
  const bases = getPythonEngineBases();
  let lastStatus = 502;
  let lastData = { message: 'Python engine unreachable' };
  for (const base of bases) {
    try {
      const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000) });
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
      lastStatus = response.status;
      lastData = data;
    } catch (e) {
      lastData = { message: e.message };
      continue;
    }
  }
  return { ok: false, status: lastStatus, data: lastData };
}

async function proxyPostToPython(path, body, timeoutMs = 60000) {
  const bases = getPythonEngineBases();
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

// @route   GET /api/engine/candles/:symbol
// @desc    OHLC series for dashboard chart (proxied from Python engine)
// @access  Private
router.get('/candles/:symbol', protect, requireSubscription, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = 'M15', limit = '150' } = req.query;
    const qs = new URLSearchParams({ timeframe, limit }).toString();
    const result = await proxyGetToPython(`/api/engine/candles/${encodeURIComponent(symbol)}?${qs}`);
    if (result.ok) return res.json(result.data);
    return res.status(result.status || 404).json(
      result.data || { message: `No candle data for ${symbol}` }
    );
  } catch (error) {
    return res.status(503).json({
      message: 'Python engine not connected',
      error: error.message,
    });
  }
});

router.post('/analyze', protect, requireSubscription, async (req, res) => {
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

// @route   POST /api/engine/admin/broadcast-signal
// @desc    Admin-only: run analysis and broadcast to Telegram if confidence threshold met
// @access  Private + Admin only
router.post('/admin/broadcast-signal', protect, adminOnly, async (req, res) => {
  try {
    const { symbol, min_confidence, is_test } = req.body;
    const result = await proxyPostToPython('/api/engine/admin/broadcast-signal', {
      symbol: symbol || 'XAUUSD',
      min_confidence: min_confidence || 75.0,
      is_test: is_test || false
    });
    if (result.ok) return res.json(result.data);
    return res.status(502).json({ message: 'Engine not available' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/engine/backtest
// @desc    Run backtest (proxies to Python engine)
// @access  Private
router.post('/backtest', protect, requireSubscription, async (req, res) => {
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

router.get('/risk/admin', async (req, res) => {
  try {
    const User = require('../models/User');
    const admin = await User.findOne({ role: 'admin' });
    if (admin) {
      return res.json({
        preset: admin.riskSettings?.preset || 'moderate',
        settings: admin.riskSettings,
      });
    }
    res.json({ preset: 'moderate' });
  } catch (error) {
    res.status(500).json({ preset: 'moderate' });
  }
});

// @route   POST /api/engine/risk/preset
// @desc    Change risk preset (proxies to Python engine)
// @access  Private
router.post('/risk/preset', protect, requireSubscription, async (req, res) => {
  try {
    const { preset, userId } = req.body;
    if (!preset || !['conservative', 'moderate', 'aggressive'].includes(preset)) {
      return res.status(400).json({ message: 'Invalid preset. Use conservative, moderate, or aggressive' });
    }

    // Update Python engine preset
    const result = await proxyPostToPython('/api/engine/risk/preset', { preset });

    // Also save to user's MongoDB profile
    if (userId || req.user?._id) {
      const User = require('../models/User');
      const presetSettings = {
        conservative: { maxRiskPerTrade: 1, maxDailyDrawdown: 3, maxOpenPositions: 3 },
        moderate: { maxRiskPerTrade: 2, maxDailyDrawdown: 5, maxOpenPositions: 5 },
        aggressive: { maxRiskPerTrade: 5, maxDailyDrawdown: 10, maxOpenPositions: 10 },
      };
      await User.findByIdAndUpdate(
        userId || req.user._id,
        {
          'riskSettings.preset': preset,
          riskSettings: {
            ...presetSettings[preset],
            preset,
            dynamicLotSizing: true,
            spreadProtection: true,
            newsFilter: true,
          },
        }
      );
    }

    if (result.ok) return res.json({ success: true, preset, ...result.data });
    return res.status(502).json({ message: 'Failed to update Python engine preset' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/analysis/latest', protect, async (req, res) => {
  try {
    const result = await proxyGetToPython('/api/engine/analysis/latest');
    if (result.ok) return res.json(result.data);
    res.status(502).json({ message: 'Engine not available' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/analysis/history', protect, async (req, res) => {
  try {
    const result = await proxyGetToPython('/api/engine/analysis/history');
    if (result.ok) return res.json(result.data);
    res.status(502).json({ message: 'Engine not available' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/signals/active', protect, requireSubscription, async (req, res) => {
  const result = await proxyGetToPython('/api/engine/signals/active');
  if (result.ok) return res.json(result.data);
  return res.status(result.status || 502).json(result.data || { message: 'Engine not available' });
});

router.get('/auto-trade/status', protect, requireSubscription, async (req, res) => {
  const result = await proxyGetToPython('/api/engine/auto-trade/status');
  if (result.ok) return res.json(result.data);
  res.status(502).json({ message: 'Engine not available' });
});

router.post('/test-fire-trade', protect, requireSubscription, async (req, res) => {
  const { symbol, direction } = req.body;
  const result = await proxyPostToPython('/api/engine/test-fire-trade', {
    symbol: symbol || 'XAUUSD',
    direction: direction || 'BUY',
  });
  if (result.ok) return res.json(result.data);
  return res.status(result.status || 502).json(result.data || { message: 'Engine not available' });
});

router.post('/auto-trade/toggle', protect, requireSubscription, async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ message: 'enabled (boolean) is required' });
  }
  const result = await proxyPostToPython('/api/engine/auto-trade/toggle', { enabled });
  if (result.ok) return res.json(result.data);
  return res.status(result.status || 502).json(result.data || { message: 'Engine not available' });
});

module.exports = router;
