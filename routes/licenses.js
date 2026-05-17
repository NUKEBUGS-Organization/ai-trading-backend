const express = require('express');
const License = require('../models/License');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const router = express.Router();

// @route   POST /api/licenses/generate
// @desc    Generate a new license key
// @access  Admin
router.post('/generate', protect, adminOnly, async (req, res) => {
  try {
    const { userId, plan, durationDays = 30 } = req.body;
    
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    const licenseKey = License.generateKey(plan);
    const features = {
      aiSignals: plan !== 'free',
      riskManagement: ['professional', 'enterprise'].includes(plan),
      telegramAlerts: plan !== 'free',
      prioritySupport: ['professional', 'enterprise'].includes(plan),
      customStrategies: plan === 'enterprise',
      backtesting: ['professional', 'enterprise'].includes(plan)
    };
    
    const license = await License.create({
      user: userId,
      licenseKey,
      plan,
      status: 'active',
      expiresAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
      maxAccounts: plan === 'enterprise' ? 999 : plan === 'professional' ? 5 : plan === 'starter' ? 2 : 1,
      features
    });
    
    // Update user subscription
    user.subscription.plan = plan;
    user.subscription.status = 'active';
    user.subscription.expiresAt = license.expiresAt;
    await user.save();
    
    res.status(201).json({ license, message: 'License generated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/licenses/validate
// @desc    Validate a license key
// @access  Public
router.post('/validate', async (req, res) => {
  try {
    const { licenseKey, hwid } = req.body;
    
    const license = await License.findOne({ licenseKey }).populate('user', 'name email');
    if (!license) return res.status(404).json({ valid: false, message: 'License key not found' });
    
    // Check status
    if (license.status !== 'active') {
      return res.json({ valid: false, message: `License is ${license.status}` });
    }
    
    // Check expiry
    if (license.expiresAt < new Date()) {
      license.status = 'expired';
      await license.save();
      return res.json({ valid: false, message: 'License has expired' });
    }
    
    // Hardware ID lock
    if (license.hwid && hwid && license.hwid !== hwid) {
      return res.json({ valid: false, message: 'License is locked to another device' });
    }
    
    // Lock to hardware if first validation
    if (!license.hwid && hwid) {
      license.hwid = hwid;
    }
    
    license.lastValidated = new Date();
    license.validationCount += 1;
    await license.save();
    
    res.json({
      valid: true,
      plan: license.plan,
      features: license.features,
      expiresAt: license.expiresAt,
      user: license.user
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/licenses/user/:userId
// @desc    Get licenses for a user
// @access  Private
router.get('/user/:userId', protect, async (req, res) => {
  try {
    const licenses = await License.find({ user: req.params.userId }).sort({ createdAt: -1 });
    res.json(licenses);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/licenses
// @desc    Get all licenses (admin)
// @access  Admin
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const licenses = await License.find().populate('user', 'name email').sort({ createdAt: -1 });
    res.json(licenses);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/licenses/:id/revoke
// @desc    Revoke a license
// @access  Admin
router.put('/:id/revoke', protect, adminOnly, async (req, res) => {
  try {
    const license = await License.findById(req.params.id);
    if (!license) return res.status(404).json({ message: 'License not found' });
    
    license.status = 'revoked';
    await license.save();
    
    res.json({ message: 'License revoked', license });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
