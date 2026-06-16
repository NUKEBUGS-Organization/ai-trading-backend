const License = require('../models/License');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { findProduct } = require('../config/products');

const SUBSCRIPTION_FEATURES = {
  discovery: {
    maxAccounts: 1,
    aiSignals: true,
    riskManagement: false,
    telegramAlerts: true,
    prioritySupport: false,
    customStrategies: false,
    backtesting: false,
  },
  pro: {
    maxAccounts: 3,
    aiSignals: true,
    riskManagement: true,
    telegramAlerts: true,
    prioritySupport: true,
    customStrategies: false,
    backtesting: false,
  },
  elite: {
    maxAccounts: 5,
    aiSignals: true,
    riskManagement: true,
    telegramAlerts: true,
    prioritySupport: true,
    customStrategies: true,
    backtesting: true,
  },
};

const LICENSE_FEATURES = {
  personal: {
    aiSignals: true,
    riskManagement: true,
    telegramAlerts: true,
    prioritySupport: false,
    customStrategies: false,
    backtesting: false,
  },
  professional: {
    aiSignals: true,
    riskManagement: true,
    telegramAlerts: true,
    prioritySupport: true,
    customStrategies: false,
    backtesting: true,
  },
  elite_license: {
    aiSignals: true,
    riskManagement: true,
    telegramAlerts: true,
    prioritySupport: true,
    customStrategies: true,
    backtesting: true,
  },
};

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function getSubscriptionExpiry(billingInterval) {
  if (billingInterval === 'yearly' || billingInterval === 'annual') {
    return addMonths(new Date(), 12);
  }
  return addMonths(new Date(), 1);
}

function getLicenseExpiry() {
  return addMonths(new Date(), 6);
}

async function fulfillOrder(order) {
  if (!order?.user || order.status !== 'paid') {
    throw new Error('Order is not eligible for fulfillment');
  }

  const userId = order.user._id || order.user;
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const results = [];

  for (const line of order.lines) {
    const product = findProduct(line.productId);
    if (!product) continue;

    if (line.productType === 'subscription') {
      const plan = product.tier || line.productId;
      const expiresAt = getSubscriptionExpiry(line.billingInterval);
      const licenseKey = License.generateKey(plan);
      const features = SUBSCRIPTION_FEATURES[plan] || SUBSCRIPTION_FEATURES.discovery;

      await Subscription.create({
        user: userId,
        plan,
        licenseKey,
        status: plan === 'discovery' ? 'trialing' : 'active',
        features,
        billing: {
          amount: line.lineTotal,
          currency: order.currency,
          interval: line.billingInterval === 'yearly' ? 'yearly' : 'monthly',
          nextBillingDate: expiresAt,
        },
        expiresAt,
        trialStartedAt: plan === 'discovery' ? new Date() : null,
        trialEndsAt: plan === 'discovery' ? addMonths(new Date(), 0) : null, // trial handled separately
      });

      user.subscription = {
        ...(user.subscription || {}),
        plan,
        status: plan === 'discovery' ? 'trialing' : 'active',
        expiresAt,
        trialStartedAt: plan === 'discovery' ? new Date() : null,
        trialEndsAt: plan === 'discovery' ? new Date(Date.now() + 5 * 86400000) : null,
      };
      await user.save();

      results.push({ type: 'subscription', plan, expiresAt });
    }

    if (line.productType === 'license') {
      const plan = product.licensePlan || line.productId;
      const expiresAt = getLicenseExpiry();
      const licenseKey = License.generateKey(plan);
      const features = LICENSE_FEATURES[plan] || LICENSE_FEATURES.personal;

      await License.create({
        user: userId,
        licenseKey,
        plan,
        status: 'active',
        expiresAt,
        maxAccounts: plan === 'elite_license' ? 10 : plan === 'professional' ? 5 : 2,
        features,
      });

      results.push({ type: 'license', plan, licenseKey, expiresAt });
    }
  }

  order.fulfilledAt = new Date();
  await order.save();

  return results;
}

module.exports = { fulfillOrder };
