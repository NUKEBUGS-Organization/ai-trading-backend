const mongoose = require('mongoose');

const signalSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    default: 'XAUUSD'
  },
  direction: {
    type: String,
    enum: ['BUY', 'SELL', 'NEUTRAL'],
    required: true
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  entryPrice: {
    type: Number,
    required: true
  },
  stopLoss: {
    type: Number,
    default: null
  },
  takeProfit: {
    type: Number,
    default: null
  },
  marketBias: {
    type: String,
    enum: ['bullish', 'bearish', 'neutral', 'ranging'],
    default: 'neutral'
  },
  volatility: {
    type: String,
    enum: ['low', 'medium', 'high', 'extreme'],
    default: 'medium'
  },
  session: {
    type: String,
    enum: ['asian', 'london', 'newyork', 'overlap'],
    default: 'london'
  },
  qualityScore: {
    type: Number,
    min: 0,
    max: 10,
    default: 5
  },
  grade: {
    type: String,
    default: ''
  },
  amdPhase: {
    type: String,
    default: ''
  },
  reason: {
    type: String,
    default: ''
  },
  engineSignalId: {
    type: String,
    default: '',
    index: true
  },
  riskLevel: {
    type: String,
    default: ''
  },
  strategy: {
    type: String,
    default: 'AI Market Insights System'
  },
  indicators: {
    rsi: { type: Number, default: 50 },
    macd: { type: String, default: 'neutral' },
    ema: { type: String, default: 'neutral' },
    atr: { type: Number, default: 0 },
    volume: { type: String, default: 'normal' }
  },
  status: {
    type: String,
    enum: ['active', 'executed', 'closed', 'hit_tp', 'hit_sl', 'expired', 'cancelled'],
    default: 'active'
  },
  closeReason: {
    type: String,
    default: ''
  },
  resultProfit: {
    type: Number,
    default: null
  },
  mt5Ticket: {
    type: Number,
    default: null
  },
  priceSource: {
    type: String,
    enum: ['mt5_live', 'mt5_candle', 'stored', 'simulated'],
    default: 'stored',
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 4 * 60 * 60 * 1000)
  },
  closedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Signal', signalSchema);
