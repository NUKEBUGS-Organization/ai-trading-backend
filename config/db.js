const mongoose = require('mongoose');

const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set');
    return false;
  }
  try {
    mongoose.set('bufferCommands', false);
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    console.log('⚠️ Running without database connection (Mock mode)');
    return false;
  }
};

module.exports = connectDB;
