const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const router = express.Router();

const MOCK_DEMO = {
  'admin@aurumx.com': {
    password: process.env.MOCK_ADMIN_PASSWORD || 'admin123',
    user: {
      _id: 'admin123',
      name: 'Admin',
      email: 'admin@aurumx.com',
      role: 'admin',
      subscription: { plan: 'enterprise', status: 'active', expiresAt: new Date(Date.now() + 365 * 86400000) },
    },
    token: 'mock-admin-token',
  },
  'demo@gmail.com': {
    password: process.env.MOCK_DEMO_PASSWORD || 'demo123',
    user: {
      _id: 'user123',
      name: 'Demo Trader',
      email: 'demo@gmail.com',
      role: 'user',
      subscription: { plan: 'professional', status: 'active', expiresAt: new Date(Date.now() + 30 * 86400000) },
    },
    token: 'mock-user-token',
  },
  'demo@aurumx.com': {
    password: process.env.MOCK_DEMO_PASSWORD || 'demo123',
    user: {
      _id: 'user123',
      name: 'Demo Trader',
      email: 'demo@gmail.com',
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

    const normalizedEmail = email.toLowerCase().trim();
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      acceptedTermsAt: new Date(),
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

    const token = generateToken(user._id);

    return res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token,
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
      return res.status(503).json({ message: 'Database unavailable. Demo: demo@gmail.com / demo123 or admin@aurumx.com / admin123' });
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+password');
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

    const token = generateToken(user._id);

    return res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token,
    });
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

module.exports = router;
