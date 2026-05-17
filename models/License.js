const mongoose = require('mongoose');

const licenseSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  licenseKey: { type: String, unique: true, required: true },
  plan: { type: String, enum: ['free', 'starter', 'professional', 'enterprise'], required: true },
  status: { type: String, enum: ['active', 'inactive', 'expired', 'revoked'], default: 'active' },
  activatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  maxAccounts: { type: Number, default: 1 },
  features: {
    aiSignals: { type: Boolean, default: false },
    riskManagement: { type: Boolean, default: false },
    telegramAlerts: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false },
    customStrategies: { type: Boolean, default: false },
    backtesting: { type: Boolean, default: false }
  },
  hwid: { type: String, default: '' },  // Hardware ID for locking
  lastValidated: { type: Date },
  validationCount: { type: Number, default: 0 }
}, { timestamps: true });

// Generate license key
licenseSchema.statics.generateKey = function(plan) {
  const prefix = { free: 'AX-F', starter: 'AX-S', professional: 'AX-P', enterprise: 'AX-E' };
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = (prefix[plan] || 'AX-X') + '-';
  for (let i = 0; i < 3; i++) {
    if (i > 0) key += '-';
    for (let j = 0; j < 4; j++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
};

module.exports = mongoose.model('License', licenseSchema);
