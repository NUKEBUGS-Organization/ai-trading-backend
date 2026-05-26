require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Trade = require('../models/Trade');
const Signal = require('../models/Signal');
const Subscription = require('../models/Subscription');

const connectDB = require('../config/db');

const symbols = ['XAUUSD', 'XAUUSD', 'XAUUSD', 'EURUSD', 'GBPUSD'];
const strategies = ['AI Momentum', 'AI Scalper', 'Grid Recovery', 'Trend Follower', 'Mean Reversion'];
const sessions = ['asian', 'london', 'newyork', 'overlap'];

function randomBetween(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

function randomDate(daysBack) {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysBack));
  date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
  return date;
}

function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = 'AX-';
  for (let i = 0; i < 4; i++) {
    if (i > 0) key += '-';
    for (let j = 0; j < 4; j++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return key;
}

const seedData = async () => {
  try {
    await connectDB();
    console.log('🗑️  Clearing existing data...');
    await User.deleteMany({});
    await Trade.deleteMany({});
    await Signal.deleteMany({});
    await Subscription.deleteMany({});
    // Signals are created only by the Python engine (POST /api/engine/signal), not in seed.

    // Create Admin User
    console.log('👤 Creating users...');
    const admin = await User.create({
      name: 'Admin',
      email: 'admin@aurumx.com',
      password: 'admin123',
      role: 'admin',
      isActive: true,
      subscription: { plan: 'enterprise', status: 'active', expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
      mt5Account: {
        accountId: 'MT5-900001',
        server: 'VCL4X-Live',
        connected: true,
        balance: 125750.50,
        equity: 128340.25,
        margin: 4500,
        freeMargin: 123840.25
      },
      telegram: { chatId: '123456789', connected: true, notifications: true },
      stats: {
        totalTrades: 847,
        winRate: 73.5,
        profitFactor: 2.14,
        dailyPnl: 1250.75,
        weeklyPnl: 5840.30,
        monthlyPnl: 18750.50,
        maxDrawdown: 4.2
      }
    });

    // Create Demo User
    const demoUser = await User.create({
      name: 'Demo Trader',
      email: 'demo@gmail.com',
      password: 'demo123',
      role: 'user',
      isActive: true,
      subscription: { plan: 'professional', status: 'active', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      mt5Account: {
        accountId: 'MT5-500042',
        server: 'VCL4X-Live',
        connected: true,
        balance: 52430.80,
        equity: 53210.45,
        margin: 2100,
        freeMargin: 51110.45
      },
      telegram: { chatId: '987654321', connected: true, notifications: true },
      stats: {
        totalTrades: 312,
        winRate: 68.2,
        profitFactor: 1.87,
        dailyPnl: 580.25,
        weeklyPnl: 2340.60,
        monthlyPnl: 8920.15,
        maxDrawdown: 6.1
      }
    });

    // Create additional users
    const users = [];
    const names = ['Sarah Chen', 'Marcus Williams', 'Elena Petrova', 'James Mitchell', 'Aisha Khan', 'Roberto Silva', 'Yuki Tanaka', 'David Okonkwo'];
    const plans = ['free', 'starter', 'professional', 'enterprise', 'starter', 'professional', 'free', 'starter'];
    
    for (let i = 0; i < names.length; i++) {
      const user = await User.create({
        name: names[i],
        email: `${names[i].split(' ')[0].toLowerCase()}@example.com`,
        password: 'password123',
        role: 'user',
        isActive: i !== 6,
        subscription: { plan: plans[i], status: i === 6 ? 'expired' : 'active', expiresAt: new Date(Date.now() + (i === 6 ? -1 : 30) * 24 * 60 * 60 * 1000) },
        mt5Account: {
          accountId: `MT5-${600000 + i}`,
          server: 'VCL4X-Live',
          connected: i !== 6,
          balance: randomBetween(5000, 100000),
          equity: randomBetween(5000, 100000),
          margin: randomBetween(0, 3000),
          freeMargin: randomBetween(5000, 97000)
        },
        stats: {
          totalTrades: Math.floor(randomBetween(50, 500)),
          winRate: randomBetween(55, 80),
          profitFactor: randomBetween(1.2, 3.0),
          dailyPnl: randomBetween(-500, 2000),
          weeklyPnl: randomBetween(-1000, 8000),
          monthlyPnl: randomBetween(-2000, 25000),
          maxDrawdown: randomBetween(2, 12)
        }
      });
      users.push(user);
    }

    // Create Subscriptions
    console.log('📋 Creating subscriptions...');
    const allUsers = [admin, demoUser, ...users];
    for (const user of allUsers) {
      await Subscription.create({
        user: user._id,
        plan: user.subscription.plan,
        licenseKey: generateLicenseKey(),
        status: user.subscription.status,
        features: {
          maxAccounts: user.subscription.plan === 'enterprise' ? 999 : user.subscription.plan === 'professional' ? 5 : user.subscription.plan === 'starter' ? 2 : 1,
          aiSignals: user.subscription.plan !== 'free',
          riskManagement: ['professional', 'enterprise'].includes(user.subscription.plan),
          telegramAlerts: user.subscription.plan !== 'free',
          prioritySupport: ['professional', 'enterprise'].includes(user.subscription.plan),
          customStrategies: user.subscription.plan === 'enterprise'
        },
        billing: {
          amount: user.subscription.plan === 'enterprise' ? 499 : user.subscription.plan === 'professional' ? 149 : user.subscription.plan === 'starter' ? 49 : 0,
          currency: 'USD',
          interval: 'monthly',
          nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        activatedAt: new Date(Date.now() - Math.floor(Math.random() * 90) * 24 * 60 * 60 * 1000),
        expiresAt: user.subscription.expiresAt
      });
    }

    // Create Trades for admin and demo user
    console.log('📊 Creating trades...');
    let ticketCounter = 10000001;
    
    for (const user of [admin, demoUser]) {
      // Closed trades
      for (let i = 0; i < 60; i++) {
        const type = Math.random() > 0.5 ? 'BUY' : 'SELL';
        const symbol = symbols[Math.floor(Math.random() * symbols.length)];
        const isGold = symbol === 'XAUUSD';
        const openPrice = isGold ? randomBetween(2280, 2420) : randomBetween(1.05, 1.30);
        const pips = randomBetween(-150, 350);
        const pipValue = isGold ? 0.01 : 0.0001;
        const closePrice = type === 'BUY' ? openPrice + (pips * pipValue) : openPrice - (pips * pipValue);
        const lotSize = randomBetween(0.01, 0.50);
        const profit = isGold ? pips * lotSize * 1 : pips * lotSize * 10;
        const openTime = randomDate(30);
        const duration = Math.floor(randomBetween(5, 480));
        const closeTime = new Date(openTime.getTime() + duration * 60 * 1000);

        await Trade.create({
          user: user._id,
          ticket: ticketCounter++,
          symbol,
          type,
          lotSize: parseFloat(lotSize.toFixed(2)),
          openPrice: parseFloat(openPrice.toFixed(isGold ? 2 : 5)),
          closePrice: parseFloat(closePrice.toFixed(isGold ? 2 : 5)),
          stopLoss: type === 'BUY' ? parseFloat((openPrice - (isGold ? 15 : 0.0050)).toFixed(isGold ? 2 : 5)) : parseFloat((openPrice + (isGold ? 15 : 0.0050)).toFixed(isGold ? 2 : 5)),
          takeProfit: type === 'BUY' ? parseFloat((openPrice + (isGold ? 25 : 0.0080)).toFixed(isGold ? 2 : 5)) : parseFloat((openPrice - (isGold ? 25 : 0.0080)).toFixed(isGold ? 2 : 5)),
          profit: parseFloat(profit.toFixed(2)),
          status: 'closed',
          signal: {
            source: ['AI', 'AI', 'AI', 'manual', 'grid'][Math.floor(Math.random() * 5)],
            confidence: Math.floor(randomBetween(55, 95)),
            strategy: strategies[Math.floor(Math.random() * strategies.length)]
          },
          openTime,
          closeTime,
          duration,
          pips: Math.floor(pips)
        });
      }

      // Open trades
      for (let i = 0; i < 4; i++) {
        const type = Math.random() > 0.5 ? 'BUY' : 'SELL';
        const openPrice = randomBetween(2340, 2380);
        const lotSize = randomBetween(0.05, 0.30);
        const unrealizedPips = randomBetween(-80, 200);
        const profit = unrealizedPips * lotSize * 1;

        await Trade.create({
          user: user._id,
          ticket: ticketCounter++,
          symbol: 'XAUUSD',
          type,
          lotSize: parseFloat(lotSize.toFixed(2)),
          openPrice: parseFloat(openPrice.toFixed(2)),
          stopLoss: type === 'BUY' ? parseFloat((openPrice - 12).toFixed(2)) : parseFloat((openPrice + 12).toFixed(2)),
          takeProfit: type === 'BUY' ? parseFloat((openPrice + 20).toFixed(2)) : parseFloat((openPrice - 20).toFixed(2)),
          profit: parseFloat(profit.toFixed(2)),
          status: 'open',
          signal: {
            source: 'AI',
            confidence: Math.floor(randomBetween(70, 95)),
            strategy: strategies[Math.floor(Math.random() * strategies.length)]
          },
          openTime: randomDate(1),
          pips: Math.floor(unrealizedPips)
        });
      }
    }

    console.log('\n✅ Seed data created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Admin Login:  admin@aurumx.com / admin123');
    console.log('📧 Demo Login:   demo@gmail.com / demo123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

seedData();
