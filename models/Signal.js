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
  strategy: {
    type: String,
    default: 'AI Momentum'
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
    enum: ['active', 'executed', 'expired', 'cancelled'],
    default: 'active'
  },
  priceSource: {
    type: String,
    enum: ['mt5_live', 'mt5_candle', 'stored', 'simulated'],
    default: 'stored',
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 4 * 60 * 60 * 1000)
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Signal', signalSchema);
