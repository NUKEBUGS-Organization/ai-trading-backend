/**
 * PaymentCloud hosted checkout adapter.
 * Configure via env vars once merchant credentials are approved.
 *
 * PAYMENTCLOUD_CHECKOUT_URL  — hosted payment page base URL
 * PAYMENTCLOUD_MERCHANT_ID   — merchant / gateway ID
 * PAYMENTCLOUD_API_KEY       — API or security key (server-side only)
 * PAYMENTCLOUD_MODE          — review | live  (review = visible flow for merchant approval)
 * DASHBOARD_URL              — return URLs for success/cancel
 */

function getPaymentConfig() {
  const checkoutUrl = (process.env.PAYMENTCLOUD_CHECKOUT_URL || '').trim();
  const merchantId = (process.env.PAYMENTCLOUD_MERCHANT_ID || '').trim();
  const apiKey = (process.env.PAYMENTCLOUD_API_KEY || '').trim();
  const mode = (process.env.PAYMENTCLOUD_MODE || 'review').toLowerCase();
  const dashboardUrl = (process.env.DASHBOARD_URL || 'http://localhost:5173').replace(/\/$/, '');

  return {
    checkoutUrl,
    merchantId,
    apiKey,
    mode,
    dashboardUrl,
    isLive: mode === 'live' && Boolean(checkoutUrl && merchantId),
    isReview: mode !== 'live' || !checkoutUrl,
  };
}

/**
 * Build hosted checkout session for PaymentCloud / NMI-style gateways.
 * Returns redirect URL + optional POST form fields for hosted payment page.
 */
function buildCheckoutSession(order, user) {
  const config = getPaymentConfig();
  const successUrl = `${config.dashboardUrl}/checkout/success?order=${order.orderNumber}`;
  const cancelUrl = `${config.dashboardUrl}/checkout/cancel?order=${order.orderNumber}`;

  const description = order.lines.map((l) => l.name).join(', ').slice(0, 240);

  const formFields = {
    merchant_id: config.merchantId,
    order_id: order.orderNumber,
    amount: order.total.toFixed(2),
    currency: order.currency || 'USD',
    description,
    customer_email: user?.email || order.customer?.email || '',
    customer_name: user?.name || order.customer?.name || '',
    return_url: successUrl,
    cancel_url: cancelUrl,
    webhook_url: `${process.env.API_PUBLIC_URL || ''}/api/checkout/webhook`.replace(/\/$/, ''),
  };

  if (config.apiKey) {
    formFields.security_key = config.apiKey;
  }

  let checkoutUrl = config.checkoutUrl;

  if (config.isLive && checkoutUrl) {
    const params = new URLSearchParams({
      amount: formFields.amount,
      order_id: formFields.order_id,
      currency: formFields.currency,
      merchant_id: formFields.merchant_id,
      return_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: formFields.customer_email,
    });
    checkoutUrl = `${checkoutUrl}${checkoutUrl.includes('?') ? '&' : '?'}${params.toString()}`;
  } else {
    checkoutUrl = `${config.dashboardUrl}/checkout/pay?order=${order.orderNumber}`;
  }

  return {
    provider: 'paymentcloud',
    mode: config.isLive ? 'live' : 'review',
    orderNumber: order.orderNumber,
    checkoutUrl,
    formMethod: 'POST',
    formFields: config.isLive ? formFields : {
      ...formFields,
      note: 'Merchant review mode — PaymentCloud credentials pending approval',
    },
    successUrl,
    cancelUrl,
    expiresAt: order.expiresAt,
  };
}

function verifyWebhookSignature(req) {
  const secret = (process.env.PAYMENTCLOUD_WEBHOOK_SECRET || '').trim();
  if (!secret) return true; // accept in review until secret configured
  const header = req.headers['x-paymentcloud-signature'] || req.headers['x-webhook-signature'] || '';
  return Boolean(header && header === secret);
}

module.exports = {
  getPaymentConfig,
  buildCheckoutSession,
  verifyWebhookSignature,
};
