/**
 * Remove demo/seed signals from MongoDB (Trend Follower, AI Momentum, etc.).
 * Run once against production Atlas:
 *   MONGODB_URI="mongodb+srv://..." node scripts/purge-seed-signals.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Signal = require('../models/Signal');
const { PURGE_SEED_QUERY } = require('../utils/realSignals');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const result = await Signal.deleteMany(PURGE_SEED_QUERY);
  const remaining = await Signal.countDocuments();
  console.log(`Deleted ${result.deletedCount} seed/demo signal(s). ${remaining} signal(s) remain in DB.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
