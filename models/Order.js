const mongoose = require('mongoose');

const orderLineSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  productType: { type: String, enum: ['subscription', 'license'], required: true },
  name: { type: String, required: true },
  billingInterval: { type: String, required: true },
  unitAmount: { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  lineTotal: { type: Number, required: true },
  tier: { type: String, default: '' },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderNumber: { type: String, unique: true, required: true },
  status: {
    type: String,
    enum: ['pending', 'checkout', 'paid', 'failed', 'cancelled', 'refunded'],
    default: 'pending',
  },
  lines: [orderLineSchema],
  subtotal: { type: Number, required: true },
  tax: { type: Number, default: 0 },
  total: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  payment: {
    provider: { type: String, default: 'paymentcloud' },
    mode: { type: String, default: 'review' },
    transactionId: { type: String, default: '' },
    checkoutUrl: { type: String, default: '' },
    paidAt: { type: Date, default: null },
  },
  customer: {
    email: { type: String, default: '' },
    name: { type: String, default: '' },
  },
  referralCode: { type: String, default: '' },
  expiresAt: { type: Date, required: true },
  fulfilledAt: { type: Date, default: null },
}, { timestamps: true });

orderSchema.statics.generateOrderNumber = function generateOrderNumber() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VCL-${ts}-${rand}`;
};

module.exports = mongoose.model('Order', orderSchema);
