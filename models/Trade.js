const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ticket: {
    type: Number,
    required: true,
    unique: true
  },
  symbol: {
    type: String,
    required: true,
    default: 'XAUUSD'
  },
  type: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: true
  },
  lotSize: {
    type: Number,
    required: true
  },
  openPrice: {
    type: Number,
    required: true
  },
  closePrice: {
    type: Number,
    default: null
  },
  stopLoss: {
    type: Number,
    default: null
  },
  takeProfit: {
    type: Number,
    default: null
  },
  profit: {
    type: Number,
    default: 0
  },
  commission: {
    type: Number,
    default: -0.07
  },
  swap: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['open', 'closed', 'pending'],
    default: 'open'
  },
  signal: {
    source: { type: String, enum: ['AI', 'manual', 'grid', 'scalp'], default: 'AI' },
    confidence: { type: Number, default: 0 },
    strategy: { type: String, default: '' }
  },
  openTime: {
    type: Date,
    default: Date.now
  },
  closeTime: {
    type: Date,
    default: null
  },
  duration: {
    type: Number, // in minutes
    default: 0
  },
  pips: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Trade', tradeSchema);
