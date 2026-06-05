const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const Referral = require('../models/Referral');
const { protect, adminOnly } = require('../middleware/auth');

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://ai-tradingbot-frontend.vcl4xengine.com';
const DEFAULT_COMMISSION_RATE = 25;

function generateReferralCode(userId) {
  const hash = crypto.createHash('md5').update(userId.toString()).digest('hex');
  return ('VCL' + hash.substring(0, 7)).toUpperCase();
}

router.get('/my', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.referralCode) {
      user.referralCode = generateReferralCode(user._id.toString());
      await user.save();
    }

    const referralLink = `${DASHBOARD_URL}/register?ref=${user.referralCode}`;

    const referrals = await Referral.find({ referrerId: req.user._id })
      .populate('referredUserId', 'name email createdAt')
      .sort({ createdAt: -1 });

    const stats = {
      totalReferrals: referrals.length,
      registered: referrals.filter(r => r.status !== 'pending').length,
      subscribed: referrals.filter(r => ['subscribed', 'paid'].includes(r.status)).length,
      totalEarned: referrals.reduce((sum, r) => sum + (r.commissionAmount || 0), 0),
      pendingCommission: referrals
        .filter(r => r.commissionStatus === 'pending' && r.commissionAmount > 0)
        .reduce((sum, r) => sum + r.commissionAmount, 0),
      paidCommission: referrals
        .filter(r => r.commissionStatus === 'paid')
        .reduce((sum, r) => sum + r.commissionAmount, 0),
    };

    res.json({
      referralCode: user.referralCode,
      referralLink,
      commissionRate: DEFAULT_COMMISSION_RATE,
      stats,
      referrals: referrals.map(r => ({
        id: r._id,
        status: r.status,
        commissionStatus: r.commissionStatus,
        commissionAmount: r.commissionAmount,
        subscriptionPlan: r.subscriptionPlan,
        subscriptionAmount: r.subscriptionAmount,
        referredUser: r.referredUserId ? {
          name: r.referredUserId.name,
          email: r.referredUserId.email,
          joinedAt: r.referredUserId.createdAt
        } : null,
        createdAt: r.createdAt,
        paidAt: r.paidAt
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/generate', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.referralCode = generateReferralCode(user._id.toString() + Date.now());
    await user.save();

    const referralLink = `${DASHBOARD_URL}/register?ref=${user.referralCode}`;
    res.json({ referralCode: user.referralCode, referralLink });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

const getClientIp = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.connection?.remoteAddress
    || req.socket?.remoteAddress
    || null;
};

router.post('/track', async (req, res) => {
  try {
    const { referralCode, newUserId } = req.body;
    if (!referralCode || !newUserId) {
      return res.status(400).json({ message: 'referralCode and newUserId required' });
    }

    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      return res.status(404).json({ message: 'Invalid referral code' });
    }

    const existing = await Referral.findOne({ referredUserId: newUserId });
    if (existing) {
      return res.json({ message: 'Already tracked' });
    }

    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || null;

    // Fraud Check 1: Self-referral
    if (referrer._id.toString() === newUserId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Self-referrals are not permitted.'
      });
    }

    let flagged = false;
    let flagReason = null;

    // Fraud Check 2: Same IP as referrer's registration
    if (clientIp) {
      const referrerIpMatch = await Referral.findOne({
        referredUserId: referrer._id,
        referredUserIp: clientIp
      });
      if (referrerIpMatch) {
        flagged = true;
        flagReason = 'Same IP as referrer registration';
      }
    }

    // Fraud Check 3: IP already used for another referral in last 30 days
    if (clientIp) {
      const recentIpReferral = await Referral.findOne({
        referredUserIp: clientIp,
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      });
      if (recentIpReferral) {
        flagged = true;
        flagReason = flagReason
          ? flagReason + ' + Duplicate IP within 30 days'
          : 'Duplicate IP within 30 days';
      }
    }

    // Fraud Check 4: Circular referral (new user already referred the referrer)
    const circularCheck = await Referral.findOne({
      referrerId: newUserId,
      referredUserId: referrer._id
    });
    if (circularCheck) {
      return res.status(400).json({
        success: false,
        message: 'Circular referrals are not permitted.'
      });
    }

    const status = flagged ? 'flagged' : 'registered';

    const referral = await Referral.create({
      referrerId: referrer._id,
      referredUserId: newUserId,
      referralCode,
      referralLink: `${DASHBOARD_URL}/register?ref=${referralCode}`,
      status,
      commissionRate: DEFAULT_COMMISSION_RATE,
      referredUserIp: clientIp,
      referredUserAgent: userAgent,
      flagged,
      flagReason
    });

    await User.findByIdAndUpdate(newUserId, { referredBy: referrer._id });

    await User.findByIdAndUpdate(referrer._id, {
      $inc: { totalReferrals: 1 }
    });

    res.json({ success: true, referralId: referral._id, flagged });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/validate/:code', async (req, res) => {
  try {
    const user = await User.findOne({ referralCode: req.params.code });
    if (!user) {
      return res.status(404).json({ valid: false, message: 'Invalid referral code' });
    }
    res.json({ valid: true, referrerName: user.name });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/admin/all', protect, adminOnly, async (req, res) => {
  try {
    const referrals = await Referral.find()
      .populate('referrerId', 'name email')
      .populate('referredUserId', 'name email')
      .sort({ createdAt: -1 });

    const totalCommissionPending = referrals
      .filter(r => r.commissionStatus === 'pending' && r.commissionAmount > 0)
      .reduce((sum, r) => sum + r.commissionAmount, 0);

    const totalCommissionPaid = referrals
      .filter(r => r.commissionStatus === 'paid')
      .reduce((sum, r) => sum + r.commissionAmount, 0);

    res.json({
      referrals,
      stats: {
        total: referrals.length,
        registered: referrals.filter(r => r.status !== 'pending').length,
        subscribed: referrals.filter(r => ['subscribed', 'paid'].includes(r.status)).length,
        flagged: referrals.filter(r => r.flagged).length,
        totalCommissionPending,
        totalCommissionPaid
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/admin/:id/commission', protect, adminOnly, async (req, res) => {
  try {
    const { commissionStatus, commissionAmount, notes } = req.body;

    const referral = await Referral.findById(req.params.id);
    if (!referral) return res.status(404).json({ message: 'Referral not found' });

    referral.commissionStatus = commissionStatus || referral.commissionStatus;
    if (commissionAmount !== undefined) referral.commissionAmount = commissionAmount;
    if (notes) referral.notes = notes;
    if (commissionStatus === 'paid') referral.paidAt = new Date();

    await referral.save();

    if (commissionStatus === 'paid') {
      await User.findByIdAndUpdate(referral.referrerId, {
        $inc: {
          totalCommissionEarned: referral.commissionAmount,
          pendingCommission: -referral.commissionAmount
        }
      });
    }

    res.json({ success: true, referral });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/admin/:id/flag', protect, adminOnly, async (req, res) => {
  try {
    const { flagged, flagReason } = req.body;
    const referral = await Referral.findByIdAndUpdate(
      req.params.id,
      { flagged, flagReason: flagReason || 'Manually flagged by admin' },
      { new: true }
    );
    if (!referral) return res.status(404).json({ message: 'Referral not found' });
    res.json({ success: true, referral });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
