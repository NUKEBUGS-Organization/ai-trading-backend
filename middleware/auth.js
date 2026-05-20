const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
    
    // Mock Mode Support
    if (token === 'mock-admin-token') {
      req.user = { _id: 'admin123', name: 'Admin', email: 'admin@aurumx.com', role: 'admin' };
      return next();
    }
    if (token === 'mock-user-token') {
      req.user = { _id: 'user123', name: 'Demo User', email: 'demo@aurumx.com', role: 'user' };
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const mongoose = require('mongoose');

      if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ message: 'Database unavailable' });
      }

      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }
      req.user = user;
      return next();
    } catch (error) {
      console.error('Token verification failed:', error.message);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

// Admin-only middleware
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Admin only.' });
  }
};

module.exports = { protect, adminOnly };
