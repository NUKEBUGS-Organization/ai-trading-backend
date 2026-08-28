/**
 * Unified payment provider facade — NOWPayments (default) or PaymentCloud (legacy).
 */

const nowPayments = require('./nowPayments');
const paymentCloud = require('./paymentCloud');

function getActiveProvider() {
  const explicit = (process.env.PAYMENT_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'nowpayments') return 'nowpayments';
  if (explicit === 'paymentcloud') return 'paymentcloud';
  if (nowPayments.getNowPaymentsConfig().isConfigured) return 'nowpayments';
  if (paymentCloud.getPaymentConfig().isLive) return 'paymentcloud';
  return 'nowpayments';
}

function getPaymentConfig() {
  const provider = getActiveProvider();
  if (provider === 'nowpayments') {
    const cfg = nowPayments.getNowPaymentsConfig();
    return {
      provider: 'nowpayments',
      mode: cfg.mode,
      isLive: cfg.isConfigured && !cfg.isReview,
      isReview: cfg.isReview,
      publicKey: cfg.publicKey,
    };
  }

  const cfg = paymentCloud.getPaymentConfig();
  return {
    provider: 'paymentcloud',
    mode: cfg.mode,
    isLive: cfg.isLive,
    isReview: cfg.isReview,
    publicKey: '',
  };
}

async function buildCheckoutSession(order, user) {
  if (getActiveProvider() === 'nowpayments') {
    return nowPayments.buildCheckoutSession(order, user);
  }
  return paymentCloud.buildCheckoutSession(order, user);
}

function verifyWebhookSignature(req, provider) {
  const active = provider || getActiveProvider();
  if (active === 'nowpayments') {
    return nowPayments.verifyIpnSignature(req);
  }
  return paymentCloud.verifyWebhookSignature(req);
}

function allowsManualComplete() {
  const cfg = getPaymentConfig();
  return cfg.isReview || !cfg.isLive;
}

module.exports = {
  getActiveProvider,
  getPaymentConfig,
  buildCheckoutSession,
  verifyWebhookSignature,
  allowsManualComplete,
  nowPayments,
  paymentCloud,
};
