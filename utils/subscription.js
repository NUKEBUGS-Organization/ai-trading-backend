const PAID_PLANS = ['starter', 'professional', 'enterprise'];

/**
 * Active paid subscription: not free, status active, not expired.
 * Admins always pass.
 */
function hasActiveSubscription(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;

  const sub = user.subscription || {};
  const plan = sub.plan || 'free';
  const status = sub.status || 'inactive';

  if (!PAID_PLANS.includes(plan)) return false;
  if (status !== 'active') return false;

  if (sub.expiresAt && new Date(sub.expiresAt) < new Date()) return false;

  return true;
}

module.exports = { hasActiveSubscription, PAID_PLANS };
