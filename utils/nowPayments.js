/**
 * NOWPayments crypto checkout adapter.
 *
 * NOWPAYMENTS_API_KEY       — API key from NOWPayments dashboard (server-side only)
 * NOWPAYMENTS_PUBLIC_KEY    — Public key (optional, for client widgets)
 * NOWPAYMENTS_IPN_SECRET    — IPN secret for webhook HMAC verification
 * NOWPAYMENTS_MODE          — live | sandbox
 * API_PUBLIC_URL            — Public backend URL for IPN callbacks
 * DASHBOARD_URL             — Frontend return URLs
 */

const crypto = require('crypto');

const PAID_STATUSES = new Set(['finished', 'confirmed']);
const FAILED_STATUSES = new Set(['failed', 'expired', 'refunded']);

function getNowPaymentsConfig() {
  const apiKey = (process.env.NOWPAYMENTS_API_KEY || '').trim();
  const publicKey = (process.env.NOWPAYMENTS_PUBLIC_KEY || '').trim();
  const ipnSecret = (process.env.NOWPAYMENTS_IPN_SECRET || '').trim();
  const mode = (process.env.NOWPAYMENTS_MODE || 'live').toLowerCase();
  const dashboardUrl = (process.env.DASHBOARD_URL || 'http://localhost:5173').replace(/\/$/, '');
  const apiPublicUrl = (process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
  const apiBase =
    mode === 'sandbox'
      ? 'https://api-sandbox.nowpayments.io/v1'
      : 'https://api.nowpayments.io/v1';

  return {
    apiKey,
    publicKey,
    ipnSecret,
    mode,
    dashboardUrl,
    apiPublicUrl,
    apiBase,
    isConfigured: Boolean(apiKey),
    isLive: Boolean(apiKey) && mode === 'live',
    isReview: !apiKey,
  };
}

async function createInvoice(order, user) {
  const config = getNowPaymentsConfig();
  if (!config.isConfigured) {
    throw new Error('NOWPayments API key not configured');
  }

  const successUrl = `${config.dashboardUrl}/checkout/success?order=${order.orderNumber}`;
  const cancelUrl = `${config.dashboardUrl}/checkout/cancel?order=${order.orderNumber}`;
  const ipnUrl = `${config.apiPublicUrl}/api/checkout/webhook/nowpayments`;
  const description = order.lines.map((l) => l.name).join(', ').slice(0, 240);

  const body = {
    price_amount: Number(Number(order.total).toFixed(2)),
    price_currency: String(order.currency || 'USD').toLowerCase(),
    order_id: order.orderNumber,
    order_description: description || `VCL4X Order ${order.orderNumber}`,
    ipn_callback_url: ipnUrl,
    success_url: successUrl,
    cancel_url: cancelUrl,
    is_fixed_rate: true,
    is_fee_paid_by_user: false,
  };

  const res = await fetch(`${config.apiBase}/invoice`, {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error || JSON.stringify(data);
    throw new Error(`NOWPayments invoice failed: ${msg}`);
  }

  if (!data.invoice_url) {
    throw new Error('NOWPayments did not return an invoice URL');
  }

  return data;
}

async function buildCheckoutSession(order, user) {
  const config = getNowPaymentsConfig();
  const successUrl = `${config.dashboardUrl}/checkout/success?order=${order.orderNumber}`;
  const cancelUrl = `${config.dashboardUrl}/checkout/cancel?order=${order.orderNumber}`;

  if (!config.isConfigured) {
    return {
      provider: 'nowpayments',
      mode: 'review',
      orderNumber: order.orderNumber,
      checkoutUrl: `${config.dashboardUrl}/checkout/pay?order=${order.orderNumber}`,
      successUrl,
      cancelUrl,
      expiresAt: order.expiresAt,
      note: 'NOWPayments API key not configured — review mode',
    };
  }

  const invoice = await createInvoice(order, user);

  return {
    provider: 'nowpayments',
    mode: config.mode,
    orderNumber: order.orderNumber,
    checkoutUrl: invoice.invoice_url,
    invoiceId: String(invoice.id || invoice.invoice_id || ''),
    paymentId: String(invoice.payment_id || ''),
    successUrl,
    cancelUrl,
    expiresAt: order.expiresAt,
  };
}

function verifyIpnSignature(req) {
  const { ipnSecret } = getNowPaymentsConfig();
  if (!ipnSecret) return true;

  const signature = req.headers['x-nowpayments-sig'];
  if (!signature || !req.body || typeof req.body !== 'object') return false;

  const sorted = {};
  Object.keys(req.body)
    .sort()
    .forEach((key) => {
      sorted[key] = req.body[key];
    });

  const payload = JSON.stringify(sorted);
  const hash = crypto.createHmac('sha512', ipnSecret).update(payload).digest('hex');
  return hash === signature;
}

function parseIpnStatus(body) {
  const status = String(body?.payment_status || '').toLowerCase();
  if (PAID_STATUSES.has(status)) return 'paid';
  if (FAILED_STATUSES.has(status)) return 'failed';
  return 'pending';
}

function extractOrderNumber(body) {
  return body?.order_id || body?.order_number || '';
}

function extractTransactionId(body) {
  return String(body?.payment_id || body?.invoice_id || body?.purchase_id || '');
}

module.exports = {
  getNowPaymentsConfig,
  buildCheckoutSession,
  verifyIpnSignature,
  parseIpnStatus,
  extractOrderNumber,
  extractTransactionId,
};
