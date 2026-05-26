/**
 * Filter MongoDB signals to only those created by the Python AI engine
 * (posted via POST /api/engine/signal or Telegram broadcast), not seed/demo rows.
 */

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
    { strategy: 'AMD AI Engine' },
    { engineSignalId: { $exists: true, $ne: '' } },
  ],
};

function isRealEngineSignal(doc) {
  if (!doc) return false;
  const strategy = doc.strategy || '';
  if (strategy === 'AMD AI Engine') return true;
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
  REAL_SIGNAL_QUERY,
  PURGE_SEED_QUERY,
  SEED_DEMO_STRATEGIES,
  isRealEngineSignal,
};
