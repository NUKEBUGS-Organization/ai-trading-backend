const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Referral = require('../models/Referral');
const Subscription = require('../models/Subscription');
const { protect } = require('../middleware/auth');
const { generateToken: createSecureToken, generateOtp, hashToken } = require('../utils/tokens');
const { buildTrialSubscription } = require('../utils/trial');
const {
  isEmailEnabled,
  sendVerificationOtpEmail,
  sendPasswordResetEmail,
} = require('../utils/email');
const router = express.Router();

const OTP_EXPIRE_MS = 10 * 60 * 1000;
const RESET_EXPIRE_MS = 60 * 60 * 1000;

const ADMIN_EMAIL = (process.env.DEFAULT_ADMIN_EMAIL || 'admin@vcl4xengine.com').toLowerCase();
const ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'AdminX@2026!#';
const USER_EMAIL = (process.env.DEFAULT_USER_EMAIL || 'trader@vcl4xengine.com').toLowerCase();
const USER_PASSWORD = process.env.DEFAULT_USER_PASSWORD || 'DemoX@2026!#';

const MOCK_DEMO = {
  [ADMIN_EMAIL]: {
    password: process.env.MOCK_ADMIN_PASSWORD || ADMIN_PASSWORD,
    user: {
      _id: 'admin123',
      name: 'VCL4X Admin',
      email: ADMIN_EMAIL,
      role: 'admin',
      subscription: { plan: 'enterprise', status: 'active', expiresAt: new Date(Date.now() + 365 * 86400000) },
    },
    token: 'mock-admin-token',
  },
  [USER_EMAIL]: {
    password: process.env.MOCK_DEMO_PASSWORD || USER_PASSWORD,
    user: {
      _id: 'user123',
      name: 'VCL4X Trader',
      email: USER_EMAIL,
      role: 'user',
      subscription: { plan: 'professional', status: 'active', expiresAt: new Date(Date.now() + 30 * 86400000) },
    },
    token: 'mock-user-token',
  },
};

const allowMockAuth = () =>
  process.env.ALLOW_MOCK_AUTH === 'true' || process.env.NODE_ENV !== 'production';

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

const isDbReady = () => {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
};

function validateEmail(email) {
  return typeof email === 'string' && /^\S+@\S+\.\S+$/.test(email.trim());
}

async function assignVerificationOtp(user) {
  const otp = generateOtp();
  user.emailVerificationToken = hashToken(otp);
  user.emailVerificationExpire = new Date(Date.now() + OTP_EXPIRE_MS);
  user.emailVerified = false;
  await user.save();
  return otp;
}

function normalizeOtp(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 5 ? digits : null;
}

async function assignResetToken(user) {
  const rawToken = createSecureToken();
  user.resetPasswordToken = hashToken(rawToken);
  user.resetPasswordExpire = new Date(Date.now() + RESET_EXPIRE_MS);
  await user.save();
  return rawToken;
}

function userResponse(user, token) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    subscription: user.subscription,
    ...(token ? { token } : {}),
  };
}

function mockLogin(email, password) {
  if (!allowMockAuth()) return null;
  const entry = MOCK_DEMO[email?.toLowerCase()?.trim()];
  if (!entry || entry.password !== password) return null;
  return { ...entry.user, token: entry.token };
}

// @route   POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, acceptTerms } = req.body;

    if (!name?.trim() || name.trim().length < 2) {
      return res.status(400).json({ message: 'Name is required (min 2 characters)' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Valid email is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    if (!acceptTerms) {
      return res.status(400).json({ message: 'You must accept the Terms and Privacy Policy' });
    }

    if (!isDbReady()) {
      return res.status(503).json({
        message: 'Registration requires database connection. Set ALLOW_MOCK_AUTH=true for demo only.',
      });
    }

    if (!isEmailEnabled() && process.env.NODE_ENV === 'production') {
      return res.status(503).json({
        message: 'Registration is temporarily unavailable. Email verification is required.',
        code: 'EMAIL_NOT_CONFIGURED',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const trial = buildTrialSubscription(new Date());

    let user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      acceptedTermsAt: new Date(),
      emailVerified: false,
      subscription: trial,
      mt5Account: {
        accountId: `MT5-${Math.floor(100000 + Math.random() * 900000)}`,
        server: 'VCL4X-Live',
        connected: false,
        balance: 10000,
        equity: 10000,
        margin: 0,
        freeMargin: 10000,
      },
    });

    // Set 5-day free trial
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 5);

    user = await User.findByIdAndUpdate(
      user._id,
      {
        'subscription.plan': 'trial',
        'subscription.status': 'trialing',
        'subscription.trialEndsAt': trialEndsAt,
        'subscription.trialStartedAt': new Date(),
      },
      { new: true }
    );

    await Subscription.create({
      user: user._id,
      plan: 'trial',
      licenseKey: `TRIAL-${user._id.toString().slice(-8).toUpperCase()}`,
      status: 'trialing',
      features: {
        maxAccounts: 1,
        aiSignals: true,
        riskManagement: true,
        telegramAlerts: true,
        prioritySupport: false,
        customStrategies: false,
      },
      billing: {
        amount: 0,
        currency: 'USD',
        interval: 'monthly',
        nextBillingDate: trial.expiresAt,
      },
      trialStartedAt: user.subscription.trialStartedAt,
      trialEndsAt: user.subscription.trialEndsAt,
      expiresAt: trialEndsAt,
    });

    const refCode = req.body.referralCode || req.query.ref;
    if (refCode) {
      try {
        const referrer = await User.findOne({ referralCode: refCode });
        if (referrer && referrer._id.toString() !== user._id.toString()) {
          await Referral.create({
            referrerId: referrer._id,
            referredUserId: user._id,
            referralCode: refCode,
            referralLink: `${process.env.DASHBOARD_URL || 'https://ai-tradingbot-frontend.vcl4xengine.com'}/register?ref=${refCode}`,
            status: 'registered',
            commissionRate: 25
          });
          await User.findByIdAndUpdate(user._id, { referredBy: referrer._id });
          await User.findByIdAndUpdate(referrer._id, { $inc: { totalReferrals: 1 } });
        }
      } catch (refErr) {
        console.log('Referral tracking error:', refErr.message);
      }
    }

    const otp = await assignVerificationOtp(user);
    let emailSent = false;

    if (isEmailEnabled()) {
      const sendResult = await sendVerificationOtpEmail(user, otp);
      emailSent = Boolean(sendResult.ok);
      if (!sendResult.ok) {
        console.error('[register] OTP email failed:', user.email, sendResult.error || sendResult.reason);
      }
    } else if (process.env.NODE_ENV !== 'production') {
      console.warn(`[register] DEV OTP for ${user.email}: ${otp}`);
      emailSent = false;
    }

    return res.status(201).json({
      ...userResponse(user),
      requiresVerification: true,
      emailSent,
      message: emailSent
        ? 'Account created. Enter the 5-digit code sent to your email.'
        : 'Account created. Enter the verification code (check server logs in development if email is not configured).',
      ...(process.env.NODE_ENV !== 'production' && !emailSent ? { devOtp: otp } : {}),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Valid email is required' });
    }
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!isDbReady()) {
      const mock = mockLogin(normalizedEmail, password);
      if (mock) return res.json(mock);
      return res.status(503).json({ message: 'Database unavailable. Try again later or contact support.' });
    }

    const user = await User.findOne({ email: normalizedEmail })
      .select('+password +emailVerificationExpire');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account has been disabled. Contact admin.' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        message: 'Please verify your email with the 5-digit code before signing in.',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
      });
    }

    const token = generateToken(user._id);

    return res.json(userResponse(user, token));
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  try {
    const { isMongoUserId } = require('../utils/userId');
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    if (!isMongoUserId(userId)) {
      return res.json(req.user);
    }

    if (!isDbReady()) {
      return res.json(req.user);
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(user);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/auth/logout
router.post('/logout', protect, (req, res) => {
  res.json({ message: 'Logged out' });
});

// @route   POST /api/auth/change-password
router.post('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const { isMongoUserId } = require('../utils/userId');
    if (!isMongoUserId(req.user._id)) {
      return res.status(400).json({ message: 'Password change not available in demo mode' });
    }

    if (!isDbReady()) {
      return res.status(503).json({ message: 'Database unavailable' });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!(await user.matchPassword(currentPassword))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    return res.json({ message: 'Password updated successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
  try {
    const { email, otp, token } = req.body;
    if (!isDbReady()) {
      return res.status(503).json({ message: 'Database unavailable' });
    }

    let user;

    if (email && otp) {
      if (!validateEmail(email)) {
        return res.status(400).json({ message: 'Valid email is required' });
      }
      const normalizedOtp = normalizeOtp(otp);
      if (!normalizedOtp) {
        return res.status(400).json({ message: 'A valid 5-digit verification code is required' });
      }

      const normalizedEmail = email.toLowerCase().trim();
      user = await User.findOne({
        email: normalizedEmail,
        emailVerificationToken: hashToken(normalizedOtp),
        emailVerificationExpire: { $gt: Date.now() },
      }).select('+emailVerificationToken +emailVerificationExpire');

      if (!user) {
        return res.status(400).json({ message: 'Invalid or expired verification code' });
      }
    } else if (token) {
      const hashed = hashToken(token);
      user = await User.findOne({
        emailVerificationToken: hashed,
        emailVerificationExpire: { $gt: Date.now() },
      }).select('+emailVerificationToken +emailVerificationExpire');

      if (!user) {
        return res.status(400).json({ message: 'Invalid or expired verification link' });
      }
    } else {
      return res.status(400).json({ message: 'Email and verification code are required' });
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save();

    const jwtToken = generateToken(user._id);
    return res.json({
      ...userResponse(user, jwtToken),
      message: 'Email verified successfully',
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/auth/resend-verification
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Valid email is required' });
    }
    if (!isEmailEnabled() && process.env.NODE_ENV === 'production') {
      return res.status(503).json({ message: 'Email service is not configured' });
    }
    if (!isDbReady()) {
      return res.status(503).json({ message: 'Database unavailable' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (user && !user.emailVerified) {
      const otp = await assignVerificationOtp(user);
      let emailSent = false;

      if (isEmailEnabled()) {
        const sendResult = await sendVerificationOtpEmail(user, otp);
        emailSent = Boolean(sendResult.ok);
        if (!sendResult.ok) {
          console.error('[resend-verification] Failed:', normalizedEmail, sendResult.error || sendResult.reason);
          return res.status(503).json({
            message: 'Could not send verification code. Please try again later or contact support.',
            code: 'EMAIL_DELIVERY_FAILED',
            emailSent: false,
            emailError: sendResult.error || sendResult.reason || null,
          });
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(`[resend-verification] DEV OTP for ${user.email}: ${otp}`);
        return res.json({
          message: 'Development mode: verification code logged on server.',
          emailSent: false,
          devOtp: otp,
        });
      }
    }

    return res.json({
      message: 'If an unverified account exists for that email, a new 5-digit code has been sent.',
      emailSent: true,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Valid email is required' });
    }
    if (!isEmailEnabled()) {
      return res.status(503).json({ message: 'Password reset emails are not configured' });
    }
    if (!isDbReady()) {
      return res.status(503).json({ message: 'Database unavailable' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail, isActive: true });

    if (user) {
      const rawToken = await assignResetToken(user);
      await sendPasswordResetEmail(user, rawToken);
    }

    return res.json({
      message: 'If an account exists for that email, a password reset link has been sent.',
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Reset token is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    if (!isDbReady()) {
      return res.status(503).json({ message: 'Database unavailable' });
    }

    const hashed = hashToken(token);
    const user = await User.findOne({
      resetPasswordToken: hashed,
      resetPasswordExpire: { $gt: Date.now() },
    }).select('+resetPasswordToken +resetPasswordExpire +password');

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset link' });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    const jwtToken = generateToken(user._id);
    return res.json({
      ...userResponse(user, jwtToken),
      message: 'Password reset successfully',
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
