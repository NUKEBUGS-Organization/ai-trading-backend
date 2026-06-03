/**
 * Create or update default admin + trader accounts (does not wipe other data).
 * Run: npm run upsert-users
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { upsertDefaultUsers, ADMIN_EMAIL, USER_EMAIL } = require('../utils/defaultUsers');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
  }

  mongoose.set('bufferCommands', false);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    console.error('');
    console.error('If using MongoDB Atlas from your PC:');
    console.error('  1. Atlas → Network Access → add your IP (or 0.0.0.0/0 for testing)');
    console.error('  2. Check MONGODB_URI username/password in .env');
    console.error('  3. Or run upsert on CapRover: set AUTO_UPSERT_DEFAULT_USERS=true and redeploy backend');
    process.exit(1);
  }

  const { results, disabledCount } = await upsertDefaultUsers();
  console.log('Default users upserted:');
  results.forEach((r) => console.log(`  ${r.action}: ${r.email}`));
  console.log(`Legacy demo accounts disabled: ${disabledCount}`);
  console.log('');
  console.log('Login with:');
  console.log(`  Admin:  ${ADMIN_EMAIL}`);
  console.log(`  Trader: ${USER_EMAIL}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
