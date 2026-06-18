const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateOtp() {
  return String(crypto.randomInt(0, 100000)).padStart(5, '0');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

module.exports = { generateToken, generateOtp, hashToken };
