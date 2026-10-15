const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertLocalDemoTarget, requestId } = require('./seed-demo-utils.cjs');
test('local demo accepts loopback and the local Compose configuration only', () => {
  assert.doesNotThrow(() =>
    assertLocalDemoTarget('postgresql://local:local@127.0.0.1:5432/tienda'),
  );
  assert.doesNotThrow(() =>
    assertLocalDemoTarget('postgresql://local:local@localhost:5432/tienda'),
  );
  assert.doesNotThrow(() =>
    assertLocalDemoTarget('postgresql://local:local@db:5432/tienda', {
      COOKIE_SECURE: 'false',
      TRUSTED_ORIGINS: 'http://localhost:3000,http://localhost:3001',
    }),
  );
  for (const [url, env] of [
    ['postgresql://local:local@production.example.com/tienda', {}],
    ['postgresql://local:local@db/tienda', {}],
    [
      'postgresql://local:local@db/tienda',
      { COOKIE_SECURE: 'true', TRUSTED_ORIGINS: 'http://localhost:3000' },
    ],
    [
      'postgresql://local:local@db/tienda',
      { COOKIE_SECURE: 'false', TRUSTED_ORIGINS: 'https://shop.example.com' },
    ],
  ])
    assert.throws(() => assertLocalDemoTarget(url, env), /--local/);
});
test('stable request identifiers keep the existing demo namespace', () => {
  assert.equal(
    requestId('sale-unpaid'),
    '9fe60cdb-0458-4f65-a4f2-e065cd071c2a',
  );
});
