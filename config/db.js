const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    mongoose.set('bufferCommands', false);
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 3000
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    console.log('⚠️ Running without database connection (Mock mode)');
  }
};

module.exports = connectDB;
