const mongoose = require('mongoose');
const {
  resolveAppEnv,
  deriveMongodbUri,
  validateNonprodMongo,
  parseBool,
  redactMongodbUri,
  mongoDatabaseName,
} = require('./envSafety');

const connectDB = async () => {
  const appEnv = resolveAppEnv();
  const uri = deriveMongodbUri(appEnv, process.env.MONGODB_URI);
  process.env.MONGODB_URI = uri;

  try {
    validateNonprodMongo(
      appEnv,
      uri,
      parseBool(process.env.ALLOW_PROD_DB_IN_NONPROD, false)
    );
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  if (!uri) {
    console.error('❌ MONGODB_URI is not set');
    return false;
  }
  try {
    mongoose.set('bufferCommands', false);
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host} db=${mongoDatabaseName(uri)}`);
    console.log(`   URI (redacted): ${redactMongodbUri(uri)}`);
    return true;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    console.log('⚠️ Running without database connection (Mock mode)');
    return false;
  }
};

module.exports = connectDB;
