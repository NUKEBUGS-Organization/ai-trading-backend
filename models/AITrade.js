const mongoose = require('mongoose');

const aiTradeSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  entry: { type: Number, required: true },
  sl: { type: Number },
  tp: { type: Number },
  lotSize: { type: Number },
  confidence: { type: Number, min: 0, max: 100 },
  grade: { type: String },
  riskPercent: { type: Number },
  riskAmount: { type: Number },
  session: { type: String },
  amdPhase: { type: String },
  h4Bias: { type: String },
  status: { type: String, enum: ['pending', 'executed', 'closed', 'cancelled'], default: 'pending' },
  profit: { type: Number, default: 0 },
  ticket: { type: Number },
  closedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('AITrade', aiTradeSchema);
