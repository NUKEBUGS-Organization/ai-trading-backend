const { hasActiveSubscription } = require('../utils/subscription');

/**
 * Blocks API access for users without an active paid subscription.
 * Admins bypass. Use after protect middleware.
 */
const requireSubscription = (req, res, next) => {
  if (hasActiveSubscription(req.user)) {
    return next();
  }
  return res.status(403).json({
    code: 'SUBSCRIPTION_REQUIRED',
    message: 'An active subscription is required. Please upgrade your plan to access this feature.',
  });
};

module.exports = { requireSubscription };
