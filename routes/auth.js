const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const user = await User.create({
      name,
      email,
      password,
      mt5Account: {
        accountId: 'MT5-' + Math.floor(100000 + Math.random() * 900000),
        server: 'AurumX-Live',
        connected: true,
        balance: 10000,
        equity: 10000,
        margin: 0,
        freeMargin: 10000
      }
    });

    const token = generateToken(user._id);

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/auth/login
// @desc    Login user & return token
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Mock Mode Support
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      if (email === 'admin@aurumx.com') {
        return res.json({
          _id: 'admin123',
          name: 'Admin',
          email: 'admin@aurumx.com',
          role: 'admin',
          token: 'mock-admin-token'
        });
      }
      if (email === 'demo@aurumx.com') {
        return res.json({
          _id: 'user123',
          name: 'Demo User',
          email: 'demo@aurumx.com',
          role: 'user',
          token: 'mock-user-token'
        });
      }
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = await User.findOne({ email }).select('+password');
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

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
const { protect } = require('../middleware/auth');

router.get('/me', protect, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.json(req.user);
    }
    
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
