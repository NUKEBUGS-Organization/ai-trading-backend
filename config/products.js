/**
 * Canonical VCL4X product catalog — subscriptions + auto-trading licenses.
 * Used by checkout, cart validation, and merchant review.
 */

const SUBSCRIPTION_PLANS = [
  {
    id: 'discovery',
    type: 'subscription',
    name: 'VCL4X DISCOVERY',
    description: 'Learn How the AI Thinks Before You Risk More Capital',
    badge: '5-Day Free Trial',
    pricing: {
      monthly: { amount: 99, label: '$99/mo' },
      annual: { amount: 948, perMonth: 79, label: '$948/yr ($79/mo)' },
    },
    tier: 'discovery',
    features: ['AI Signal Feed', 'Telegram Access', 'Signal History', 'Market Intelligence Dashboard'],
  },
  {
    id: 'pro',
    type: 'subscription',
    name: 'VCL4X PRO',
    description: 'Everything You Need To Trade With Confidence',
    badge: 'Most Popular',
    pricing: {
      monthly: { amount: 149, label: '$149/mo' },
      annual: { amount: 1428, perMonth: 119, label: '$1,428/yr ($119/mo)' },
    },
    tier: 'pro',
    features: ['Everything in Discovery', 'Advanced AI Analysis', 'Risk Profile Selection', 'Performance Analytics', 'Referral Program'],
  },
  {
    id: 'elite',
    type: 'subscription',
    name: 'VCL4X ELITE',
    description: 'Built For Traders Who Want Every Possible Advantage',
    badge: 'Professional',
    pricing: {
      monthly: { amount: 199, label: '$199/mo' },
      annual: { amount: 1908, perMonth: 159, label: '$1,908/yr ($159/mo)' },
    },
    tier: 'elite',
    features: ['Everything in PRO', 'Advanced Backtesting', 'Drawdown Analytics', 'VIP Support', 'Priority Signal Delivery'],
  },
];

const AUTO_TRADING_LICENSES = [
  {
    id: 'personal',
    type: 'license',
    name: 'PERSONAL AUTO-TRADING LICENSE',
    description: 'AI auto execution for individual traders',
    interval: '6 months',
    pricing: {
      standard: { amount: 2300, label: '$2,300 / 6 mo' },
      renewal: { amount: 1725, label: '$1,725 / 6 mo (25% off)' },
    },
    licensePlan: 'personal',
    features: ['AI Auto Execution', 'Signal Synchronization', 'Dynamic Risk Controls', 'VPS Compatible'],
  },
  {
    id: 'professional',
    type: 'license',
    name: 'PROFESSIONAL AUTO-TRADING LICENSE',
    description: 'Expanded coverage and institutional risk controls',
    interval: '6 months',
    pricing: {
      standard: { amount: 2999, label: '$2,999 / 6 mo' },
      renewal: { amount: 2249, label: '$2,249 / 6 mo (25% off)' },
    },
    licensePlan: 'professional',
    features: ['Everything in Personal', 'Expanded Market Coverage', 'Institutional Risk Management', 'Priority Support'],
  },
  {
    id: 'elite_license',
    type: 'license',
    name: 'ELITE AUTO-TRADING LICENSE',
    description: 'Built for serious traders and teams',
    interval: '6 months',
    pricing: {
      standard: { amount: 3699, label: '$3,699 / 6 mo' },
      renewal: { amount: 2774, label: '$2,774 / 6 mo (25% off)' },
    },
    licensePlan: 'elite_license',
    features: ['Everything in Professional', 'AI Trade Quality Scoring', 'Premium AI Features', 'Team Management', 'VIP Support'],
  },
];

const ALL_PRODUCTS = [...SUBSCRIPTION_PLANS, ...AUTO_TRADING_LICENSES];

function findProduct(productId) {
  return ALL_PRODUCTS.find((p) => p.id === productId) || null;
}

function resolveLineItem({ productId, billingInterval = 'monthly', quantity = 1 }) {
  const product = findProduct(productId);
  if (!product) return null;

  let unitAmount = 0;
  let intervalLabel = billingInterval;

  if (product.type === 'subscription') {
    const tier = product.pricing[billingInterval];
    if (!tier) return null;
    unitAmount = tier.amount;
    intervalLabel = billingInterval === 'annual' ? 'yearly' : 'monthly';
  } else if (product.type === 'license') {
    const tier = product.pricing[billingInterval === 'renewal' ? 'renewal' : 'standard'];
    if (!tier) return null;
    unitAmount = tier.amount;
    intervalLabel = billingInterval === 'renewal' ? 'renewal' : 'standard';
  }

  const qty = Math.max(1, Math.min(quantity, 1)); // one per cart line for now

  return {
    productId: product.id,
    productType: product.type,
    name: product.name,
    description: product.description,
    billingInterval: intervalLabel,
    unitAmount,
    quantity: qty,
    lineTotal: unitAmount * qty,
    currency: 'USD',
    tier: product.tier || product.licensePlan,
  };
}

function buildCartSummary(items) {
  const lines = [];
  let subtotal = 0;

  for (const item of items) {
    const line = resolveLineItem(item);
    if (!line) {
      return { error: `Invalid product or billing interval: ${item.productId}` };
    }
    lines.push(line);
    subtotal += line.lineTotal;
  }

  return {
    lines,
    subtotal,
    tax: 0,
    total: subtotal,
    currency: 'USD',
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
  };
}

function getPublicCatalog() {
  return {
    subscriptions: SUBSCRIPTION_PLANS,
    licenses: AUTO_TRADING_LICENSES,
    currency: 'USD',
    paymentProvider: 'PaymentCloud',
  };
}

module.exports = {
  SUBSCRIPTION_PLANS,
  AUTO_TRADING_LICENSES,
  ALL_PRODUCTS,
  findProduct,
  resolveLineItem,
  buildCartSummary,
  getPublicCatalog,
};
