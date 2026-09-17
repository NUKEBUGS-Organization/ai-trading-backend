'use strict';

const {
  getEngineSharedSecret,
  secretsMatch,
  providedEngineKey,
} = require('../config/pythonEngineClient');

function requireEngineSecret(req, res, next) {
  const expected = getEngineSharedSecret();
  if (!expected) {
    console.warn('Internal API Auth: ENGINE_SHARED_SECRET missing — fail closed');
    return res.status(503).json({ message: 'Engine authentication is not configured' });
  }
  const provided = providedEngineKey(req);
  if (!secretsMatch(provided, expected)) {
    console.info(`Internal API Auth: rejected ${req.method} ${req.originalUrl || req.path}`);
    return res.status(401).json({ message: 'Unauthorized' });
  }
  req.engineInternal = true;
  return next();
}

function requireEngineSecretOrJwt(protect) {
  return (req, res, next) => {
    const expected = getEngineSharedSecret();
    const provided = providedEngineKey(req);
    if (expected && secretsMatch(provided, expected)) {
      req.engineInternal = true;
      return next();
    }
    return protect(req, res, next);
  };
}

module.exports = { requireEngineSecret, requireEngineSecretOrJwt };
