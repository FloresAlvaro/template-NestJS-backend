const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Dedicated TEST_DATABASE_URL required');
process.env.DATABASE_URL = url;
const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { AppModule } = require('../dist/src/app.module');
const { configureApp } = require('../dist/src/config/configure-app');
const { PrismaService } = require('../dist/src/database/services/prisma.service');
const { createAdmin } = require('./create-admin.cjs');
let app, db;
const email = `bootstrap-${randomUUID()}@example.test`;
const password = 'bootstrap-test-password-123';

before(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  configureApp(app);
  await app.init();
  db = app.get(PrismaService);
  if (await db.user.count({ where: { role: 'ADMIN' } }))
    throw new Error(
      'Bootstrap integration requires a disposable database without administrators',
    );
});
after(async () => {
  if (db) await db.user.deleteMany({ where: { email } });
  if (app) await app.close();
});

test('rejects malformed administrator credentials without persisting users', async () => {
  const beforeCount = await db.user.count();
  await assert.rejects(
    createAdmin(
      db,
      { name: 'Administrator', email: 'admin@example..com', password },
      password,
    ),
    /Datos inválidos/,
  );
  assert.equal(await db.user.count(), beforeCount);
});

test('creates a normalized administrator who can log in and preserves the existing-admin protection', async () => {
  await createAdmin(
    db,
    { name: ' Administrator ', email: ` ${email.toUpperCase()} `, password },
    password,
  );
  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .set('Origin', 'http://localhost:3000')
    .send({ email, password })
    .expect(200);
  assert.equal(response.body.role, 'ADMIN');
  assert.equal(response.body.email, email);
  assert.equal(Object.hasOwn(response.body, 'passwordHash'), false);
  const cookies = response.headers['set-cookie'];
  assert.ok(cookies.some((cookie) => cookie.includes('HttpOnly')));
  await assert.rejects(
    createAdmin(
      db,
      { name: 'Second admin', email: `second-${email}`, password },
      password,
    ),
    /Ya existe un administrador/,
  );
  assert.equal(await db.user.count({ where: { role: 'ADMIN' } }), 1);
});
