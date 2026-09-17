'use strict';

/**
 * VCL4X APP_ENV + Mongo/Telegram/URL safety for the Node backend.
 *
 * Does not replace NODE_ENV (auth, mock tokens, and Express still use it).
 * APP_ENV is the VCL4X environment label; it defaults from NODE_ENV when unset.
 */

const PRODUCTION_MONGO_DB = 'aurumx_trading';
const TEST_MONGO_DB = 'aurumx_trading_test';
const VALID_APP_ENVS = ['development', 'test', 'staging', 'production'];
const NON_PRODUCTION = new Set(['development', 'test', 'staging']);

function resolveAppEnv(env = process.env) {
  const raw = String(env.APP_ENV || '').trim().toLowerCase();
  if (VALID_APP_ENVS.includes(raw)) return raw;
  const node = String(env.NODE_ENV || '').trim().toLowerCase();
  if (node === 'production') return 'production';
  if (node === 'test') return 'test';
  if (node === 'development') return 'development';
  if (node === 'staging') return 'staging';
  return 'unspecified';
}

function isNonProduction(appEnv) {
  return NON_PRODUCTION.has(appEnv);
}

function mongoDatabaseName(uri) {
  if (!uri) return '';
  try {
    const parsed = new URL(uri);
    return (parsed.pathname || '').replace(/^\//, '').split('?')[0].trim();
  } catch {
    const m = String(uri).match(/\/([^/?]+)(?:\?|$)/);
    return m ? m[1] : '';
  }
}

function redactMongodbUri(uri) {
  if (!uri) return '(unset)';
  try {
    const parsed = new URL(uri);
    const host = parsed.hostname || 'unknown-host';
    const port = parsed.port ? `:${parsed.port}` : '';
    const db = mongoDatabaseName(uri) || '(no-db)';
    return `${parsed.protocol}//${host}${port}/${db}`;
  } catch {
    return '(unparseable-uri)';
  }
}

function deriveMongodbUri(appEnv, uri) {
  if (uri && String(uri).trim()) return String(uri).trim();
  if (isNonProduction(appEnv)) {
    return `mongodb://localhost:27017/${TEST_MONGO_DB}`;
  }
  return `mongodb://localhost:27017/${PRODUCTION_MONGO_DB}`;
}

function parseBool(raw, defaultValue = false) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function getPythonEngineUrls(env = process.env) {
  const appEnv = resolveAppEnv(env);
  const isProd = appEnv === 'production';
  const publicUrl = (
    env.PYTHON_ENGINE_URL ||
    (isProd
      ? 'https://ai-tradingbot-python-engine.vcl4xengine.com'
      : 'http://localhost:8000')
  ).replace(/\/$/, '');
  const internalDefault = isProd
    ? 'http://srv-captain--ai-tradingbot-python-engine:8000'
    : '';
  const internalUrl = (env.PYTHON_ENGINE_INTERNAL_URL || internalDefault).replace(/\/$/, '');
  return { publicUrl, internalUrl, appEnv };
}

function getPythonEngineBases(env = process.env) {
  const { publicUrl, internalUrl, appEnv } = getPythonEngineUrls(env);
  const bases = [];
  const isLocal = (url) => /localhost|127\.0\.0\.1/.test(url || '');
  const nodeEnv = env.NODE_ENV || '';

  if (publicUrl && !(nodeEnv === 'production' && isLocal(publicUrl))) {
    bases.push(publicUrl);
  }
  if (internalUrl && internalUrl !== publicUrl) {
    bases.push(internalUrl);
  }
  if (publicUrl && isLocal(publicUrl) && !bases.includes(publicUrl)) {
    bases.push(publicUrl);
  }
  return { bases: [...new Set(bases.filter(Boolean))], publicUrl, internalUrl, appEnv };
}

function validateNonprodMongo(appEnv, mongodbUri, allowProdDb = false) {
  if (!isNonProduction(appEnv)) return;
  const dbName = mongoDatabaseName(mongodbUri);
  if (dbName === PRODUCTION_MONGO_DB && !allowProdDb) {
    const err = new Error(
      `APP_ENV=${appEnv} must not use production Mongo database "${PRODUCTION_MONGO_DB}". ` +
        `Set MONGODB_URI to a URI whose database is "${TEST_MONGO_DB}". ` +
        `Refusing to start. (${redactMongodbUri(mongodbUri)})`
    );
    err.code = 'PROD_DB_IN_NONPROD';
    throw err;
  }
}

function formatStartupSummary({
  appEnv,
  mongodbUri,
  pythonEngineUrl,
  port,
} = {}) {
  const dbName = mongoDatabaseName(mongodbUri);
  const dbLabel = dbName === PRODUCTION_MONGO_DB ? 'PRODUCTION' : (dbName === TEST_MONGO_DB || isNonProduction(appEnv) ? 'TEST' : 'CUSTOM');
  const envDisplay = appEnv === 'unspecified' ? 'UNSPECIFIED (production defaults)' : appEnv.toUpperCase();
  return [
    'VCL4X Environment',
    '------------------',
    `Environment: ${envDisplay}`,
    `Database: ${dbLabel} (${dbName || 'unknown'})`,
    `Python Engine: ${pythonEngineUrl || '(unset)'}`,
    `Node HTTP: port ${port}`,
  ].join('\n');
}

module.exports = {
  PRODUCTION_MONGO_DB,
  TEST_MONGO_DB,
  resolveAppEnv,
  isNonProduction,
  mongoDatabaseName,
  redactMongodbUri,
  deriveMongodbUri,
  parseBool,
  getPythonEngineUrls,
  getPythonEngineBases,
  validateNonprodMongo,
  formatStartupSummary,
};
