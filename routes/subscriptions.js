const express = require('express');
const Subscription = require('../models/Subscription');
const { protect, adminOnly } = require('../middleware/auth');
const router = express.Router();

const { getPublicCatalog } = require('../config/products');

// @route   GET /api/subscriptions/plans
// @desc    Get available plans (VCL4X Discovery / Pro / Elite)
// @access  Public
router.get('/plans', (req, res) => {
  const catalog = getPublicCatalog();
  const plans = catalog.subscriptions.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    badge: p.badge,
    pricing: p.pricing,
    features: p.features,
    type: 'subscription',
  }));
  res.json(plans);
});

// @route   GET /api/subscriptions/my
// @desc    Get current user's subscription
// @access  Private
router.get('/my', protect, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { getMongoUserId } = require('../utils/userId');
    const mongoUserId = getMongoUserId(req);

    if (mongoose.connection.readyState !== 1 || !mongoUserId) {
      return res.json({ plan: 'professional', status: 'active', licenseKey: 'AX-A1B2-C3D4-E5F6', billing: { nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
    }

    const subscription = await Subscription.findOne({
      user: mongoUserId,
      status: { $in: ['active', 'trialing'] },
    }).sort({ createdAt: -1 });
    res.json(subscription || { plan: 'free', status: 'active' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/subscriptions/all
// @desc    Get all subscriptions (Admin)
// @access  Admin
router.get('/all', protect, adminOnly, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }

    const subscriptions = await Subscription.find().populate('user', 'name email').sort({ createdAt: -1 });
    res.json(subscriptions);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
