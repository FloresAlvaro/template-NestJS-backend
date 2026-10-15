const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

test('homelab initialization protects secrets, emits a valid TLS chain and refuses overwrite', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tienda-homelab-test-'));
  try {
    const script = path.join(dir, 'init.sh');
    fs.copyFileSync(path.join(__dirname, '../deploy/homelab/init.sh'), script);
    const run = host => spawnSync('sh', [script, host], { encoding: 'utf8' });
    assert.equal(run('bad/name').status, 1);
    assert.equal(fs.existsSync(path.join(dir, 'private')), false);
    assert.equal(run('tienda.example.test').status, 0);
    const privateDir = path.join(dir, 'private');
    const env = fs.readFileSync(path.join(privateDir, 'homelab.env'), 'utf8');
    assert.ok(/^POSTGRES_PASSWORD=[a-f0-9]{64}$/m.test(env));
    assert.ok(/^AUTH_PROXY_SECRET=[a-f0-9]{64}$/m.test(env));
    assert.equal(fs.statSync(privateDir).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(privateDir, 'homelab.env')).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.join(privateDir, 'ca.key')).mode & 0o777, 0o600);
    assert.equal(spawnSync('openssl', ['verify', '-CAfile', path.join(privateDir, 'ca.crt'),
      '-verify_hostname', 'tienda.example.test', path.join(privateDir, 'tls/server.crt')]).status, 0);
    const digest = value => createHash('sha256').update(value).digest('hex');
    assert.equal(run('different.example.test').status, 1);
    assert.equal(digest(fs.readFileSync(path.join(privateDir, 'homelab.env'))), digest(env));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
