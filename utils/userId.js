/** True when id is a 24-char hex MongoDB ObjectId (not mock tokens like user123). */
function isMongoUserId(id) {
  return /^[a-f0-9]{24}$/i.test(String(id || ''));
}

/** Returns ObjectId string for DB queries, or null for mock/session users. */
function getMongoUserId(req) {
  const id = req.user?._id;
  return isMongoUserId(id) ? id : null;
}

module.exports = { isMongoUserId, getMongoUserId };
