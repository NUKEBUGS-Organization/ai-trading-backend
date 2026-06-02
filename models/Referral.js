const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  referrerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  referredUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  referralCode: {
    type: String,
    required: true
  },
  referralLink: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'registered', 'subscribed', 'paid'],
    default: 'pending'
  },
  commissionRate: {
    type: Number,
    default: 20
  },
  commissionAmount: {
    type: Number,
    default: 0
  },
  commissionStatus: {
    type: String,
    enum: ['pending', 'approved', 'paid', 'rejected'],
    default: 'pending'
  },
  subscriptionPlan: {
    type: String,
    default: null
  },
  subscriptionAmount: {
    type: Number,
    default: 0
  },
  paidAt: {
    type: Date,
    default: null
  },
  notes: {
    type: String,
    default: ''
  }
}, { timestamps: true });

referralSchema.index({ referralCode: 1 });
referralSchema.index({ referrerId: 1 });
referralSchema.index({ referredUserId: 1 });

module.exports = mongoose.model('Referral', referralSchema);
