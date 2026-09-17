'use strict';

const crypto = require('crypto');
const { resolveAppEnv, getPythonEngineBases } = require('./envSafety');

const ENGINE_KEY_HEADER = 'X-VCL4X-Engine-Key';

function getEngineSharedSecret(env = process.env) {
  return String(env.ENGINE_SHARED_SECRET || '').trim();
}

function secretsMatch(provided, expected) {
  if (!provided || !expected) return false;
  const left = Buffer.from(String(provided), 'utf8');
  const right = Buffer.from(String(expected), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function engineAuthHeaders(env = process.env, extra = {}) {
  const secret = getEngineSharedSecret(env);
  const headers = { ...extra };
  if (secret) headers[ENGINE_KEY_HEADER] = secret;
  return headers;
}

function assertEngineSecretConfigured(env = process.env) {
  if (getEngineSharedSecret(env)) return;
  const err = new Error('ENGINE_SHARED_SECRET is not configured');
  err.status = 503;
  err.code = 'ENGINE_SECRET_UNCONFIGURED';
  throw err;
}

function providedEngineKey(req) {
  if (!req || !req.headers) return '';
  return (
    req.headers['x-vcl4x-engine-key'] ||
    req.headers['X-VCL4X-Engine-Key'] ||
    ''
  );
}

/**
 * Node → Python fetch with internal secret. Browser never sees the header.
 */
async function fetchPython(path, { method = 'GET', body, timeoutMs = 5000, env = process.env } = {}) {
  assertEngineSecretConfigured(env);
  const { bases } = getPythonEngineBases(env);
  const headers = engineAuthHeaders(
    env,
    body !== undefined ? { 'Content-Type': 'application/json' } : {}
  );
  let lastStatus = 502;
  let lastData = { message: 'Python engine unreachable' };
  let lastError = null;

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i];
    const isLast = i === bases.length - 1;
    try {
      const options = {
        method,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      };
      if (body !== undefined) options.body = JSON.stringify(body);
      const response = await fetch(`${base}${path}`, options);
      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: text };
        }
      }
      if (response.ok) return { ok: true, data, status: response.status };
      lastStatus = response.status;
      lastData = data;
      if (isLast) return { ok: false, status: lastStatus, data: lastData };
    } catch (error) {
      lastError = error;
      lastData = { message: error.message };
      if (isLast && method === 'POST') throw error;
    }
  }
  if (method === 'POST' && lastError) throw lastError;
  return { ok: false, status: lastStatus, data: lastData };
}

function mockAuthAllowed(env = process.env) {
  const appEnv = resolveAppEnv(env);
  const nodeEnv = String(env.NODE_ENV || '').trim().toLowerCase();
  if (appEnv === 'production' || nodeEnv === 'production') return false;
  const inDevOrTest =
    appEnv === 'development' ||
    appEnv === 'test' ||
    nodeEnv === 'development' ||
    nodeEnv === 'test';
  if (!inDevOrTest) return false;
  const raw = String(env.ALLOW_MOCK_AUTH || '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

function getCorsOrigins(env = process.env) {
  const raw = String(env.CORS_ORIGINS || '').trim();
  if (raw) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [
    'https://ai-tradingbot-frontend.vcl4xengine.com',
    'https://vcl4xengine.com',
    'https://www.vcl4xengine.com',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:3001',
  ];
}

module.exports = {
  ENGINE_KEY_HEADER,
  getEngineSharedSecret,
  secretsMatch,
  engineAuthHeaders,
  assertEngineSecretConfigured,
  providedEngineKey,
  fetchPython,
  mockAuthAllowed,
  getCorsOrigins,
};
