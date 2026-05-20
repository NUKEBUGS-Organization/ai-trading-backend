const express = require('express');
const Subscription = require('../models/Subscription');
const { protect, adminOnly } = require('../middleware/auth');
const router = express.Router();

// @route   GET /api/subscriptions/plans
// @desc    Get available plans
// @access  Public
router.get('/plans', (req, res) => {
  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      interval: 'monthly',
      features: {
        maxAccounts: 1,
        aiSignals: false,
        riskManagement: false,
        telegramAlerts: false,
        prioritySupport: false,
        customStrategies: false
      },
      description: 'Basic access to the platform'
    },
    {
      id: 'starter',
      name: 'Starter',
      price: 49,
      interval: 'monthly',
      features: {
        maxAccounts: 2,
        aiSignals: true,
        riskManagement: false,
        telegramAlerts: true,
        prioritySupport: false,
        customStrategies: false
      },
      description: 'AI signals & Telegram alerts'
    },
    {
      id: 'professional',
      name: 'Professional',
      price: 149,
      interval: 'monthly',
      features: {
        maxAccounts: 5,
        aiSignals: true,
        riskManagement: true,
        telegramAlerts: true,
        prioritySupport: true,
        customStrategies: false
      },
      description: 'Full risk management suite'
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 499,
      interval: 'monthly',
      features: {
        maxAccounts: 999,
        aiSignals: true,
        riskManagement: true,
        telegramAlerts: true,
        prioritySupport: true,
        customStrategies: true
      },
      description: 'Unlimited accounts & custom strategies'
    }
  ];

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

    const subscription = await Subscription.findOne({ user: mongoUserId, status: 'active' });
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
