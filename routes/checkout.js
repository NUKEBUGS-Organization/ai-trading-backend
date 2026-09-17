const express = require('express');
const Order = require('../models/Order');
const { protect } = require('../middleware/auth');
const { getMongoUserId } = require('../utils/userId');
const { buildCartSummary, getPublicCatalog } = require('../config/products');
const {
  buildCheckoutSession,
  verifyWebhookSignature,
  getPaymentConfig,
  getActiveProvider,
  allowsManualComplete,
  nowPayments,
} = require('../utils/payments');
const { fulfillOrder } = require('../utils/fulfillOrder');

const router = express.Router();

async function markOrderPaid(order, transactionId, mode) {
  if (order.status === 'paid') {
    return { alreadyPaid: true };
  }

  order.status = 'paid';
  order.payment.paidAt = new Date();
  order.payment.transactionId = transactionId || '';
  if (mode) order.payment.mode = mode;
  await order.save();

  const fulfillment = await fulfillOrder(order);
  return { alreadyPaid: false, fulfillment };
}

// @route   GET /api/checkout/catalog
// @desc    Public product catalog for cart / merchant review
// @access  Public
router.get('/catalog', (req, res) => {
  res.json(getPublicCatalog());
});

// @route   GET /api/checkout/config
// @desc    Active payment provider info (no secrets)
// @access  Public
router.get('/config', (req, res) => {
  const cfg = getPaymentConfig();
  res.json({
    provider: cfg.provider,
    mode: cfg.mode,
    isLive: cfg.isLive,
    publicKey: cfg.publicKey || undefined,
  });
});

// @route   POST /api/checkout/cart
// @desc    Validate cart items and return priced summary
// @access  Private
router.post('/cart', protect, (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) {
    return res.status(400).json({ message: 'Cart is empty' });
  }

  const summary = buildCartSummary(items);
  if (summary.error) {
    return res.status(400).json({ message: summary.error });
  }

  res.json(summary);
});

// @route   POST /api/checkout/session
// @desc    Create order and NOWPayments checkout session
// @access  Private
router.post('/session', protect, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const referralCode = req.body?.referralCode || '';

    if (!items.length) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    const summary = buildCartSummary(items);
    if (summary.error) {
      return res.status(400).json({ message: summary.error });
    }

    const mongoUserId = getMongoUserId(req);
    const orderNumber = Order.generateOrderNumber();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const paymentCfg = getPaymentConfig();

    const orderPayload = {
      user: mongoUserId || req.user._id,
      orderNumber,
      status: 'checkout',
      lines: summary.lines,
      subtotal: summary.subtotal,
      tax: summary.tax,
      total: summary.total,
      currency: summary.currency,
      customer: {
        email: req.user.email || '',
        name: req.user.name || '',
      },
      referralCode,
      expiresAt,
      payment: {
        provider: paymentCfg.provider,
        mode: paymentCfg.isLive ? paymentCfg.mode : 'review',
      },
    };

    let order;
    if (mongoose.connection.readyState === 1 && mongoUserId) {
      order = await Order.create(orderPayload);
    } else {
      order = { ...orderPayload, _id: orderNumber };
    }

    const session = await buildCheckoutSession(order, req.user);

    if (order._id && order.save) {
      order.payment.checkoutUrl = session.checkoutUrl || '';
      order.payment.invoiceId = session.invoiceId || '';
      await order.save();
    }

    res.json({
      orderNumber: order.orderNumber,
      total: order.total,
      currency: order.currency,
      lines: order.lines,
      session,
    });
  } catch (error) {
    res.status(500).json({ message: 'Checkout failed', error: error.message });
  }
});

// @route   GET /api/checkout/order/:orderNumber
// @desc    Get order status
// @access  Private
router.get('/order/:orderNumber', protect, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        orderNumber: req.params.orderNumber,
        status: 'checkout',
        mode: getPaymentConfig().mode,
      });
    }

    const order = await Order.findOne({ orderNumber: req.params.orderNumber }).lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });

    res.json({
      orderNumber: order.orderNumber,
      status: order.status,
      total: order.total,
      currency: order.currency,
      lines: order.lines,
      payment: order.payment,
      fulfilledAt: order.fulfilledAt,
      createdAt: order.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/checkout/complete
// @desc    Mark order paid (review mode only) and fulfill
// @access  Private
router.post('/complete', protect, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { orderNumber, transactionId } = req.body || {};
    if (!orderNumber) return res.status(400).json({ message: 'orderNumber required' });

    if (!allowsManualComplete()) {
      return res.status(400).json({
        message: 'Payment confirmation is handled by NOWPayments. Please complete payment on the checkout page.',
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.json({
        success: true,
        mode: 'review',
        message: 'Review mode — order recorded for demo',
        orderNumber,
      });
    }

    const order = await Order.findOne({ orderNumber });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.status === 'paid') {
      return res.json({ success: true, orderNumber, status: 'paid', alreadyFulfilled: Boolean(order.fulfilledAt) });
    }

    order.payment.mode = 'review';
    const result = await markOrderPaid(order, transactionId || `review-${Date.now()}`, 'review');

    res.json({
      success: true,
      orderNumber,
      status: 'paid',
      fulfillment: result.fulfillment,
    });
  } catch (error) {
    res.status(500).json({ message: 'Fulfillment failed', error: error.message });
  }
});

async function handleNowPaymentsWebhook(req, res) {
  if (!verifyWebhookSignature(req, 'nowpayments')) {
    return res.status(401).json({ message: 'Invalid IPN signature' });
  }

  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) {
    return res.json({ received: true, mode: 'review' });
  }

  const orderNumber = nowPayments.extractOrderNumber(req.body);
  if (!orderNumber) return res.status(400).json({ message: 'order_id required' });

  const order = await Order.findOne({ orderNumber });
  if (!order) return res.status(404).json({ message: 'Order not found' });

  const ipnStatus = nowPayments.parseIpnStatus(req.body);
  const transactionId = nowPayments.extractTransactionId(req.body);

  if (ipnStatus === 'failed') {
    order.status = 'failed';
    await order.save();
    return res.json({ received: true, status: 'failed' });
  }

  if (ipnStatus !== 'paid') {
    return res.json({ received: true, status: 'pending' });
  }

  await markOrderPaid(order, transactionId, getPaymentConfig().mode);
  return res.json({ received: true, status: 'paid' });
}

// @route   POST /api/checkout/webhook/nowpayments
// @desc    NOWPayments IPN webhook
// @access  Public (signed)
router.post('/webhook/nowpayments', async (req, res) => {
  try {
    await handleNowPaymentsWebhook(req, res);
  } catch (error) {
    res.status(500).json({ message: 'Webhook error', error: error.message });
  }
});

// @route   POST /api/checkout/webhook
// @desc    Payment webhook — NOWPayments (default) or PaymentCloud (legacy)
// @access  Public (signed)
router.post('/webhook', async (req, res) => {
  try {
    if (getActiveProvider() === 'nowpayments' || req.headers['x-nowpayments-sig']) {
      return handleNowPaymentsWebhook(req, res);
    }

    if (!verifyWebhookSignature(req, 'paymentcloud')) {
      return res.status(401).json({ message: 'Invalid webhook signature' });
    }

    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.json({ received: true, mode: 'review' });
    }

    const { order_id: orderNumber, transaction_id: transactionId, status } = req.body || {};
    if (!orderNumber) return res.status(400).json({ message: 'order_id required' });

    const order = await Order.findOne({ orderNumber });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const paid = ['approved', 'paid', 'success', 'completed'].includes(String(status || '').toLowerCase());
    if (!paid) {
      order.status = 'failed';
      await order.save();
      return res.json({ received: true, status: 'failed' });
    }

    await markOrderPaid(order, transactionId || '', getPaymentConfig().mode);
    res.json({ received: true, status: 'paid' });
  } catch (error) {
    res.status(500).json({ message: 'Webhook error', error: error.message });
  }
});

module.exports = router;
