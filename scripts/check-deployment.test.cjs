const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkDeployment } = require('./check-deployment.cjs');

function fixture() {
  const secret = 'isolated-preflight-test-secret-32-characters';
  return {
    backend: { AUTH_PROXY_SECRET: secret, DATABASE_URL: 'postgresql://fixture:fixture@localhost/fixture_test', TRUSTED_ORIGINS: 'http://localhost:3000', COOKIE_SECURE: 'false' },
    frontend: { NUXT_AUTH_PROXY_SECRET: secret, NUXT_BACKEND_API_BASE: 'http://localhost:3001/api' },
  };
}
test('local configuration is read-only and accepts matching private secrets', () => {
  const { backend, frontend } = fixture();
  const before = JSON.stringify({ backend, frontend });
  assert.deepEqual(checkDeployment(backend, frontend), []);
  assert.equal(JSON.stringify({ backend, frontend }), before);
});
test('missing or mismatched secrets fail without disclosing them', () => {
  const { backend, frontend } = fixture();
  frontend.NUXT_AUTH_PROXY_SECRET += '-different';
  assert.ok(checkDeployment(backend, frontend).length);
  assert.ok(!JSON.stringify(checkDeployment(backend, frontend)).includes(backend.AUTH_PROXY_SECRET));
  backend.AUTH_PROXY_SECRET = 'short';
  assert.ok(checkDeployment(backend, frontend).some(error => error.includes('32')));
});
test('production requires explicit HTTPS origins and secure cookies', () => {
  const { backend, frontend } = fixture();
  assert.ok(checkDeployment(backend, frontend, { production: true }).length);
  backend.TRUSTED_ORIGINS = 'https://shop.example.test';
  backend.COOKIE_SECURE = 'true';
  assert.deepEqual(checkDeployment(backend, frontend, { production: true }), []);
});
test('invalid database, origins and API destinations fail', () => {
  for (const override of [{ DATABASE_URL: 'mysql://localhost/store' }, { TRUSTED_ORIGINS: '' }, { TRUSTED_ORIGINS: 'https://shop.example.test/path' }]) {
    const { backend, frontend } = fixture();
    assert.ok(checkDeployment({ ...backend, ...override }, frontend).length);
  }
  for (const url of ['http://localhost:3001', 'https://user:password@api.example.test/api', 'https://api.example.test/api?token=value']) {
    const { backend, frontend } = fixture();
    frontend.NUXT_BACKEND_API_BASE = url;
    assert.ok(checkDeployment(backend, frontend).length);
  }
});
