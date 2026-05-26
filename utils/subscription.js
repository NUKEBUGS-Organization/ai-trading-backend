const PAID_PLANS = ['starter', 'professional', 'enterprise'];
const DEMO_EMAILS = ['demo@gmail.com', 'demo@aurumx.com'];

/**
 * Active paid subscription: not free, status active, not expired.
 * Admins and seeded demo accounts bypass (dashboard testing).
 */
function hasActiveSubscription(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (DEMO_EMAILS.includes(String(user.email || '').toLowerCase())) return true;

  const sub = user.subscription || {};
  const plan = sub.plan || 'free';
  const status = sub.status || 'inactive';

  if (!PAID_PLANS.includes(plan)) return false;
  if (status !== 'active') return false;

  if (sub.expiresAt && new Date(sub.expiresAt) < new Date()) return false;

  return true;
}

module.exports = { hasActiveSubscription, PAID_PLANS };
