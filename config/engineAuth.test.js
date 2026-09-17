'use strict';

const assert = require('assert');
const { mockAuthAllowed, engineAuthHeaders, getCorsOrigins } = require('./pythonEngineClient');
const { requireEngineSecret } = require('../middleware/engineAuth');
const { adminOnly } = require('../middleware/auth');

function test(name, fn) {
  fn();
  console.log(`ok  ${name}`);
}

function mockRes() {
  const r = { statusCode: 200, body: null, ended: false };
  r.status = (c) => {
    r.statusCode = c;
    return r;
  };
  r.json = (b) => {
    r.body = b;
    r.ended = true;
    return r;
  };
  return r;
}

test('mock tokens rejected in production even if ALLOW_MOCK_AUTH=true', () => {
  assert.strictEqual(
    mockAuthAllowed({ NODE_ENV: 'production', APP_ENV: 'production', ALLOW_MOCK_AUTH: 'true' }),
    false
  );
  assert.strictEqual(
    mockAuthAllowed({ NODE_ENV: 'production', ALLOW_MOCK_AUTH: 'true' }),
    false
  );
});

test('mock tokens allowed only in development/test with ALLOW_MOCK_AUTH=true', () => {
  assert.strictEqual(
    mockAuthAllowed({ NODE_ENV: 'development', APP_ENV: 'development', ALLOW_MOCK_AUTH: 'true' }),
    true
  );
  assert.strictEqual(
    mockAuthAllowed({ NODE_ENV: 'development', APP_ENV: 'development', ALLOW_MOCK_AUTH: 'false' }),
    false
  );
  assert.strictEqual(
    mockAuthAllowed({ NODE_ENV: 'test', APP_ENV: 'test', ALLOW_MOCK_AUTH: 'true' }),
    true
  );
});

test('engine headers never include secret when unset', () => {
  const headers = engineAuthHeaders({ ENGINE_SHARED_SECRET: '' }, { 'Content-Type': 'application/json' });
  assert.strictEqual(headers['X-VCL4X-Engine-Key'], undefined);
});

test('engine headers attach secret server-side only', () => {
  const headers = engineAuthHeaders({ ENGINE_SHARED_SECRET: 'abc' });
  assert.strictEqual(headers['X-VCL4X-Engine-Key'], 'abc');
});

test('CORS origins are explicit, not wildcard', () => {
  const origins = getCorsOrigins({});
  assert.ok(Array.isArray(origins));
  assert.ok(!origins.includes('*'));
  assert.ok(origins.includes('https://ai-tradingbot-frontend.vcl4xengine.com'));
});

test('POST ingest without secret → 401/503 and next() not called', () => {
  const prev = process.env.ENGINE_SHARED_SECRET;
  process.env.ENGINE_SHARED_SECRET = 'correct-secret';
  try {
    let nextCalled = false;
    const req = { headers: {}, method: 'POST', originalUrl: '/api/engine/signal' };
    const res = mockRes();
    requireEngineSecret(req, res, () => {
      nextCalled = true;
    });
    assert.strictEqual(nextCalled, false);
    assert.ok(res.statusCode === 401 || res.statusCode === 503);
  } finally {
    process.env.ENGINE_SHARED_SECRET = prev;
  }
});

test('POST ingest wrong secret → 401 next() not called (no Mongo write)', () => {
  const prev = process.env.ENGINE_SHARED_SECRET;
  process.env.ENGINE_SHARED_SECRET = 'correct-secret';
  try {
    let nextCalled = false;
    const req = {
      headers: { 'x-vcl4x-engine-key': 'wrong' },
      method: 'POST',
      originalUrl: '/api/engine/signal',
    };
    const res = mockRes();
    requireEngineSecret(req, res, () => {
      nextCalled = true;
    });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
  } finally {
    process.env.ENGINE_SHARED_SECRET = prev;
  }
});

test('POST ingest correct secret → next() (handler may run)', () => {
  const prev = process.env.ENGINE_SHARED_SECRET;
  process.env.ENGINE_SHARED_SECRET = 'correct-secret';
  try {
    let nextCalled = false;
    const req = {
      headers: { 'x-vcl4x-engine-key': 'correct-secret' },
      method: 'POST',
      originalUrl: '/api/engine/signal',
    };
    const res = mockRes();
    requireEngineSecret(req, res, () => {
      nextCalled = true;
    });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(res.statusCode, 200);
  } finally {
    process.env.ENGINE_SHARED_SECRET = prev;
  }
});

test('subscriber cannot pass adminOnly; admin can', () => {
  let nextCalled = false;
  const res = mockRes();
  adminOnly({ user: { role: 'user', email: 'trader@vcl4xengine.com' } }, res, () => {
    nextCalled = true;
  });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);

  nextCalled = false;
  const res2 = mockRes();
  adminOnly({ user: { role: 'admin', email: 'admin@vcl4xengine.com' } }, res2, () => {
    nextCalled = true;
  });
  assert.strictEqual(nextCalled, true);
});

console.log('\nconfig/pythonEngineClient + engineAuth + adminOnly OK');
