/**
 * Filter MongoDB signals to only those created by the Python AI engine
 * (posted via POST /api/engine/signal or Telegram broadcast), not seed/demo rows.
 */

const PRODUCT_STRATEGY_NAME = 'AI Market Insights System';
const LEGACY_STRATEGY_NAMES = ['AMD AI Engine'];

const SEED_DEMO_STRATEGIES = [
  'AI Momentum',
  'AI Scalper',
  'Grid Recovery',
  'Trend Follower',
  'Mean Reversion',
];

/** Mongoose query: real engine signals only */
const REAL_SIGNAL_QUERY = {
  $or: [
    { strategy: PRODUCT_STRATEGY_NAME },
    { strategy: { $in: LEGACY_STRATEGY_NAMES } },
    { engineSignalId: { $exists: true, $ne: '' } },
  ],
};

function isRealEngineSignal(doc) {
  if (!doc) return false;
  const strategy = doc.strategy || '';
  if (strategy === PRODUCT_STRATEGY_NAME) return true;
  if (LEGACY_STRATEGY_NAMES.includes(strategy)) return true;
  if (doc.engineSignalId) return true;
  if (SEED_DEMO_STRATEGIES.includes(strategy)) return false;
  return false;
}

/** Query to delete seed/demo rows from Atlas (one-time cleanup) */
const PURGE_SEED_QUERY = {
  strategy: { $in: SEED_DEMO_STRATEGIES },
  $or: [{ engineSignalId: { $exists: false } }, { engineSignalId: '' }],
};

module.exports = {
  PRODUCT_STRATEGY_NAME,
  LEGACY_STRATEGY_NAMES,
  REAL_SIGNAL_QUERY,
  PURGE_SEED_QUERY,
  SEED_DEMO_STRATEGIES,
  isRealEngineSignal,
};
