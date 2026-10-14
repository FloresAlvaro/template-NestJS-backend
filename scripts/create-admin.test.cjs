const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { LoginDto } = require('../dist/src/auth/dto/auth.dto');
const { createAdmin, validateAdminInput } = require('./create-admin.cjs');
const password = 'administrator-test-password';
const valid = { name: 'Administrator', email: 'admin@example.test', password };

for (const email of [
  'admin@example..com',
  'admin@example.c',
  'admin@example.1',
  'invalid',
  '',
]) {
  test(`rejects unloginable administrator email ${JSON.stringify(email)}`, () => {
    assert.throws(
      () => validateAdminInput({ ...valid, email }, password),
      /Datos inválidos/,
    );
  });
}
test('normalizes credentials using the account DTO and accepts them in LoginDto', () => {
  const result = validateAdminInput(
    { ...valid, name: ' Administrator ', email: ' ADMIN@EXAMPLE.TEST ' },
    password,
  );
  assert.equal(result.name, 'Administrator');
  assert.equal(result.email, 'admin@example.test');
  assert.equal(
    validateSync(plainToInstance(LoginDto, { email: result.email, password }))
      .length,
    0,
  );
});
test('rejects invalid names, password limits, nulls, role injection and a mismatched confirmation', () => {
  for (const change of [
    { name: ' ' },
    { name: null },
    { password: 'short' },
    { password: 'x'.repeat(129) },
    { email: null },
    { role: 'ADMIN' },
  ]) {
    assert.throws(
      () =>
        validateAdminInput(
          { ...valid, ...change },
          change.password ?? password,
        ),
      /Datos inválidos/,
    );
  }
  assert.throws(
    () => validateAdminInput(valid, 'different-password'),
    /contraseñas diferentes/,
  );
});
test('rejects invalid credentials before opening the database transaction', async () => {
  let transactions = 0;
  const db = {
    $transaction() {
      transactions++;
      throw new Error('Database must not be called');
    },
  };
  await assert.rejects(
    createAdmin(db, { ...valid, email: 'admin@example..com' }, password),
    /Datos inválidos/,
  );
  assert.equal(transactions, 0);
});
