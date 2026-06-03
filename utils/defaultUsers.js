const User = require('../models/User');

const ADMIN_EMAIL = (process.env.DEFAULT_ADMIN_EMAIL || 'admin@vcl4xengine.com').toLowerCase();
const ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'AdminX@2026!#';
const USER_EMAIL = (process.env.DEFAULT_USER_EMAIL || 'trader@vcl4xengine.com').toLowerCase();
const USER_PASSWORD = process.env.DEFAULT_USER_PASSWORD || 'DemoX@2026!#';
const LEGACY_EMAILS = ['admin@aurumx.com', 'demo@gmail.com', 'demo@aurumx.com'];

async function upsertUser({ email, password, name, role, plan }) {
  let user = await User.findOne({ email }).select('+password');
  if (user) {
    user.name = name;
    user.password = password;
    user.role = role;
    user.isActive = true;
    user.subscription = {
      plan,
      status: 'active',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };
    await user.save();
    return { email, action: 'updated' };
  }
  await User.create({
    name,
    email,
    password,
    role,
    isActive: true,
    subscription: {
      plan,
      status: 'active',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
    mt5Account: {
      accountId: role === 'admin' ? 'MT5-900001' : 'MT5-500042',
      server: 'VCL4X-Live',
      connected: true,
      balance: role === 'admin' ? 125750.5 : 52430.8,
      equity: role === 'admin' ? 128340.25 : 53210.45,
      margin: role === 'admin' ? 4500 : 2100,
      freeMargin: role === 'admin' ? 123840.25 : 51110.45,
    },
  });
  return { email, action: 'created' };
}

async function upsertDefaultUsers() {
  const results = [];
  results.push(await upsertUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    name: 'VCL4X Admin',
    role: 'admin',
    plan: 'enterprise',
  }));
  results.push(await upsertUser({
    email: USER_EMAIL,
    password: USER_PASSWORD,
    name: 'VCL4X Trader',
    role: 'user',
    plan: 'professional',
  }));
  const disabled = await User.updateMany(
    { email: { $in: LEGACY_EMAILS } },
    { $set: { isActive: false } }
  );
  return { results, disabledCount: disabled.modifiedCount };
}

module.exports = {
  upsertDefaultUsers,
  ADMIN_EMAIL,
  USER_EMAIL,
};
