'use strict';

const assert = require('assert');
const {
  PRODUCTION_MONGO_DB,
  TEST_MONGO_DB,
  resolveAppEnv,
  isNonProduction,
  mongoDatabaseName,
  deriveMongodbUri,
  getPythonEngineUrls,
  getPythonEngineBases,
  validateNonprodMongo,
  redactMongodbUri,
  formatStartupSummary,
} = require('./envSafety');

function test(name, fn) {
  fn();
  console.log(`ok  ${name}`);
}

test('A. APP_ENV=test resolves to test configuration', () => {
  assert.strictEqual(resolveAppEnv({ APP_ENV: 'test' }), 'test');
  assert.strictEqual(resolveAppEnv({ NODE_ENV: 'development' }), 'development');
  assert.strictEqual(resolveAppEnv({ NODE_ENV: 'production' }), 'production');
  assert.ok(isNonProduction('test'));
  assert.ok(!isNonProduction('production'));
});

test('B. Test environment does not select production Mongo DB', () => {
  const derived = deriveMongodbUri('test', undefined);
  assert.strictEqual(mongoDatabaseName(derived), TEST_MONGO_DB);
  assert.notStrictEqual(mongoDatabaseName(derived), PRODUCTION_MONGO_DB);
  assert.throws(
    () => validateNonprodMongo('test', 'mongodb://localhost:27017/aurumx_trading'),
    /aurumx_trading/
  );
  validateNonprodMongo('test', `mongodb://localhost:27017/${TEST_MONGO_DB}`);
});

test('C/E. Node/Python URLs resolve from configuration (no CapRover default in test)', () => {
  const testUrls = getPythonEngineUrls({
    APP_ENV: 'test',
    PYTHON_ENGINE_URL: 'http://localhost:8000',
  });
  assert.strictEqual(testUrls.publicUrl, 'http://localhost:8000');
  assert.strictEqual(testUrls.internalUrl, '');
  const { bases } = getPythonEngineBases({ APP_ENV: 'test' });
  assert.deepStrictEqual(bases, ['http://localhost:8000']);
  assert.ok(!bases.some((u) => u.includes('vcl4xengine.com')));
  assert.ok(!bases.some((u) => u.includes('srv-captain')));
});

test('E. Production URL defaults preserved when APP_ENV=production', () => {
  const prod = getPythonEngineUrls({ APP_ENV: 'production' });
  assert.strictEqual(prod.publicUrl, 'https://ai-tradingbot-python-engine.vcl4xengine.com');
  assert.ok(prod.internalUrl.includes('srv-captain--ai-tradingbot-python-engine'));
  const prodDb = deriveMongodbUri('production', undefined);
  assert.strictEqual(mongoDatabaseName(prodDb), PRODUCTION_MONGO_DB);
});

test('D. Startup summary identifies test mode without secrets', () => {
  const text = formatStartupSummary({
    appEnv: 'test',
    mongodbUri: `mongodb://user:secret@localhost:27017/${TEST_MONGO_DB}`,
    pythonEngineUrl: 'http://localhost:8000',
    port: 5001,
  });
  assert.ok(text.includes('Environment: TEST'));
  assert.ok(text.includes('Database: TEST'));
  assert.ok(!text.includes('secret'));
  const redacted = redactMongodbUri(`mongodb://user:secret@localhost:27017/${TEST_MONGO_DB}`);
  assert.ok(!redacted.includes('secret'));
  assert.ok(!redacted.includes('user'));
});

test('F. Imports remain valid', () => {
  assert.strictEqual(typeof resolveAppEnv, 'function');
  assert.strictEqual(typeof getPythonEngineBases, 'function');
});

test('G. No production CapRover URL leaked into development bases', () => {
  const { bases } = getPythonEngineBases({ NODE_ENV: 'development' });
  assert.ok(bases.every((u) => /localhost|127\.0\.0\.1/.test(u)));
});

console.log('\nconfig/envSafety.test.js OK');
