const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  plan: {
    type: String,
    enum: ['free', 'starter', 'professional', 'enterprise'],
    required: true,
    default: 'free'
  },
  licenseKey: {
    type: String,
    unique: true,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'expired', 'suspended'],
    default: 'active'
  },
  features: {
    maxAccounts: { type: Number, default: 1 },
    aiSignals: { type: Boolean, default: false },
    riskManagement: { type: Boolean, default: false },
    telegramAlerts: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false },
    customStrategies: { type: Boolean, default: false }
  },
  billing: {
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    interval: { type: String, enum: ['monthly', 'yearly', 'lifetime'], default: 'monthly' },
    nextBillingDate: { type: Date }
  },
  activatedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Subscription', subscriptionSchema);
