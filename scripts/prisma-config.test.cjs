const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { loadConfigFromFile } = require('@prisma/config');

test('the actual Prisma dependency merges recursive configuration without stack exhaustion', () => {
  const dependency = createRequire(require.resolve('@prisma/config')).resolve('deepmerge-ts');
  const child = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const {deepmerge} = require(${JSON.stringify(dependency)});
    const a = {schema: 'schema.prisma'}, b = {migrations: {path: 'migrations'}};
    a.self = a; b.self = b;
    const result = deepmerge(a, b);
    assert.equal(result.self, result);
    assert.equal(result.schema, 'schema.prisma');
    assert.equal(result.migrations.path, 'migrations');
  `], { timeout: 5000, encoding: 'utf8' });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
});

test('Prisma loads the real project configuration with the patched merger', async () => {
  const result = await loadConfigFromFile({ configRoot: process.cwd() });
  assert.equal(result.error, undefined);
  assert.match(result.config.schema, /prisma[/\\]schema\.prisma$/);
  assert.match(result.config.migrations.path, /prisma[/\\]migrations$/);
});
