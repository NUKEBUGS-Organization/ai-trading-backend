const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: 50
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    select: false
  },
  emailVerificationExpire: {
    type: Date,
    select: false
  },
  resetPasswordToken: {
    type: String,
    select: false
  },
  resetPasswordExpire: {
    type: Date,
    select: false
  },
  acceptedTermsAt: {
    type: Date,
    default: null,
  },
  subscription: {
    plan: { type: String, enum: ['free', 'starter', 'professional', 'enterprise'], default: 'free' },
    status: { type: String, enum: ['active', 'inactive', 'expired'], default: 'active' },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
  },
  mt5Account: {
    accountId: { type: String, default: '' },
    server: { type: String, default: '' },
    connected: { type: Boolean, default: false },
    balance: { type: Number, default: 10000 },
    equity: { type: Number, default: 10000 },
    margin: { type: Number, default: 0 },
    freeMargin: { type: Number, default: 10000 }
  },
  telegram: {
    chatId: { type: String, default: '' },
    connected: { type: Boolean, default: false },
    notifications: { type: Boolean, default: true }
  },
  riskSettings: {
    maxDailyDrawdown: { type: Number, default: 5 },
    maxRiskPerTrade: { type: Number, default: 2 },
    maxOpenPositions: { type: Number, default: 5 },
    dynamicLotSizing: { type: Boolean, default: true },
    spreadProtection: { type: Boolean, default: true },
    newsFilter: { type: Boolean, default: true }
  },
  stats: {
    totalTrades: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 },
    profitFactor: { type: Number, default: 0 },
    dailyPnl: { type: Number, default: 0 },
    weeklyPnl: { type: Number, default: 0 },
    monthlyPnl: { type: Number, default: 0 },
    maxDrawdown: { type: Number, default: 0 }
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  totalReferrals: {
    type: Number,
    default: 0
  },
  totalCommissionEarned: {
    type: Number,
    default: 0
  },
  pendingCommission: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
