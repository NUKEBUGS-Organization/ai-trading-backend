const PAID_PLANS = ['starter', 'professional', 'enterprise'];
const DEMO_EMAILS = ['demo@gmail.com', 'demo@aurumx.com'];

function getSubscription(user) {
  return user?.subscription || {};
}

function isExpired(sub) {
  return Boolean(sub.expiresAt && new Date(sub.expiresAt) < new Date());
}

function isTrialSubscription(user) {
  const sub = getSubscription(user);
  return PAID_PLANS.includes(sub.plan || 'free') && sub.status === 'trialing';
}

function hasFullSignalAccess(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (DEMO_EMAILS.includes(String(user.email || '').toLowerCase())) return true;

  const sub = getSubscription(user);
  if (!PAID_PLANS.includes(sub.plan || 'free')) return false;
  if (sub.status !== 'active') return false;
  if (isExpired(sub)) return false;
  return true;
}

function hasSignalPreviewAccess(user) {
  if (hasFullSignalAccess(user)) return true;
  if (!user) return false;

  const sub = getSubscription(user);
  if (!PAID_PLANS.includes(sub.plan || 'free')) return false;
  return ['trialing', 'expired', 'inactive'].includes(sub.status || 'inactive');
}

function getSignalAccess(user) {
  if (hasFullSignalAccess(user)) {
    return { level: 'full', masked: false };
  }

  const sub = getSubscription(user);
  const trialEndsAt = sub.trialEndsAt || sub.expiresAt || null;
  const trialExpired = Boolean(trialEndsAt && new Date(trialEndsAt) < new Date());

  return {
    level: 'preview',
    masked: true,
    trial: isTrialSubscription(user),
    trialEndsAt,
    trialExpired,
  };
}

/**
 * Active app access: paid active subscription or unexpired trial.
 * Admins and seeded demo accounts bypass (dashboard testing).
 */
function hasActiveSubscription(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (DEMO_EMAILS.includes(String(user.email || '').toLowerCase())) return true;

  const sub = getSubscription(user);
  const plan = sub.plan || 'free';
  const status = sub.status || 'inactive';

  if (!PAID_PLANS.includes(plan)) return false;
  if (!['active', 'trialing'].includes(status)) return false;

  if (isExpired(sub)) return false;

  return true;
}

function maskSignal(signal) {
  if (!signal) return signal;
  return {
    ...signal,
    entry: null,
    entryPrice: null,
    sl: null,
    stopLoss: null,
    tp: null,
    takeProfit: null,
    confidence: null,
    grade: '',
    riskLevel: '',
    risk_level: '',
    reason: 'Upgrade to unlock full entry, stop loss, take profit, confidence, and risk details.',
    masked: true,
    accessLevel: 'preview',
  };
}

function maskSignalsForAccess(data, access) {
  if (!access?.masked) return data;
  if (Array.isArray(data)) return data.map(maskSignal);
  if (data?.signals && Array.isArray(data.signals)) {
    return { ...data, signals: data.signals.map(maskSignal), access };
  }
  if (data?.history && Array.isArray(data.history)) {
    return { ...data, history: data.history.map(maskSignal), access };
  }
  if (data?.signal) {
    return { ...data, signal: maskSignal(data.signal), public_signal: maskSignal(data.public_signal), access };
  }
  return data;
}

module.exports = {
  DEMO_EMAILS,
  PAID_PLANS,
  getSignalAccess,
  hasActiveSubscription,
  hasFullSignalAccess,
  hasSignalPreviewAccess,
  maskSignal,
  maskSignalsForAccess,
};
