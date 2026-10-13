import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { App } from 'supertest/types';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { PasswordRecoveryService } from '../src/auth/password-recovery.service';
import { hashPassword, tokenHash, verifyPassword } from '../src/auth/password';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Dedicated TEST_DATABASE_URL required');
const mailApi = process.env.TEST_MAILPIT_URL;
if (!mailApi || !process.env.TEST_SMTP_PORT)
  throw new Error('Dedicated TEST_MAILPIT_URL and TEST_SMTP_PORT required');
process.env.DATABASE_URL = url;
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = process.env.TEST_SMTP_PORT;
process.env.SMTP_REQUIRE_TLS = 'false';
process.env.SMTP_SECURE = 'false';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
process.env.MAIL_FROM = 'no-reply@tienda.local';
process.env.PASSWORD_RESET_URL =
  'http://localhost:3001/api/auth/reset-password';
const origin = 'http://localhost:3000';

describe('Password recovery with PostgreSQL and captured SMTP', () => {
  let app: INestApplication<App>;
  let db: PrismaService;
  let userId: number;
  const email = `recovery-${randomUUID()}@example.test`;
  const original = 'original-password-123';
  const replacement = 'replacement-password-456';
  const forgot = (address = email) =>
    request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .set('Origin', origin)
      .send({ email: address });
  const reset = (token: string, newPassword = replacement) =>
    request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .set('Origin', origin)
      .send({ token, newPassword });
  const issue = async () => {
    await app.get(PasswordRecoveryService).request(email);
    const row = await db.passwordReset.findUniqueOrThrow({ where: { userId } });
    const response = await fetch(`${mailApi}/api/v1/messages`);
    if (!response.ok) throw new Error('Mailpit unavailable');
    const list = (await response.json()) as {
      messages: { ID: string; To: { Address: string }[] }[];
    };
    for (const item of list.messages.filter((item) =>
      item.To.some((to) => to.Address === email),
    )) {
      const detail = await fetch(`${mailApi}/api/v1/message/${item.ID}`);
      const mail = (await detail.json()) as { Text: string };
      const token = mail.Text.match(/#token=([a-f0-9]{64})/)?.[1];
      if (token && tokenHash(token) === row.tokenHash) return token;
    }
    throw new Error('Recovery email missing');
  };

  beforeAll(async () => {
    db = new PrismaService(new ConfigService({ DATABASE_URL: url }));
    await db.$connect();
    userId = (
      await db.user.create({
        data: {
          name: 'Recovery fixture',
          email,
          passwordHash: await hashPassword(original),
          role: 'SELLER',
        },
      })
    ).userId;
  });
  beforeEach(async () => {
    await db.user.update({
      where: { userId },
      data: { isActive: true, passwordHash: await hashPassword(original) },
    });
    await db.passwordReset.deleteMany({ where: { userId } });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
  });
  afterAll(async () => {
    await db.user.delete({ where: { userId } });
    await db.$disconnect();
  });

  it('provides a standalone form and enforces Origin and DTO validation', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/reset-password')
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect('Content-Type', /text\/html/)
      .expect('Content-Security-Policy', /script-src 'sha256-/);
    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .set('Origin', origin)
      .send({ email, role: 'ADMIN' })
      .expect(400);
    await reset('bad').expect(400);
  });

  it('returns identical responses for known, unknown and inactive accounts', async () => {
    const known = await forgot(`  ${email.toUpperCase()}  `).expect(200);
    const unknown = await forgot(`unknown-${email}`).expect(200);
    await db.user.update({ where: { userId }, data: { isActive: false } });
    const inactive = await forgot().expect(200);
    expect(known.body).toEqual(unknown.body);
    expect(known.body).toEqual(inactive.body);
    expect(known.body).not.toHaveProperty('token');
  });

  it('sends an actual SMTP message, stores only the hash and consumes the token once', async () => {
    const rawSession = randomBytes(32).toString('hex');
    await db.session.create({
      data: {
        userId,
        tokenHash: tokenHash(rawSession),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const token = await issue();
    const saved = await db.passwordReset.findUniqueOrThrow({
      where: { userId },
    });
    expect(saved.tokenHash).not.toBe(token);
    expect(
      saved.expiresAt.getTime() - saved.createdAt.getTime(),
    ).toBeLessThanOrEqual(15 * 60000 + 1000);
    await reset(token, 'short').expect(400);
    expect(await db.passwordReset.count({ where: { userId } })).toBe(1);
    await reset(token).expect(200);
    expect(await db.passwordReset.count({ where: { userId } })).toBe(0);
    expect(await db.session.count({ where: { userId } })).toBe(0);
    const user = await db.user.findUniqueOrThrow({ where: { userId } });
    expect(await verifyPassword(replacement, user.passwordHash)).toBe(true);
    expect(await verifyPassword(original, user.passwordHash)).toBe(false);
    await reset(token).expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email, password: replacement })
      .expect(200);
  });

  it('invalidates previous links and rejects expired links without changing the password', async () => {
    const old = await issue();
    const current = await issue();
    await reset(old).expect(400);
    await db.passwordReset.update({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await reset(current).expect(400);
    expect(
      await verifyPassword(
        original,
        (await db.user.findUniqueOrThrow({ where: { userId } })).passwordHash,
      ),
    ).toBe(true);
  });

  it('allows only one concurrent reset and revokes pending links on password replacement', async () => {
    const token = await issue();
    const responses = await Promise.all([
      reset(token),
      reset(token, 'another-password-789'),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    const next = await issue();
    await app.get(AuthService).replacePassword(userId, original);
    await reset(next).expect(400);
  });

  it('rejects tokens for disabled accounts and handles SMTP downtime uniformly', async () => {
    const token = await issue();
    await db.user.update({ where: { userId }, data: { isActive: false } });
    await reset(token).expect(400);
    const smtpPort = process.env.SMTP_PORT;
    process.env.SMTP_PORT = '1';
    try {
      const known = await forgot().expect(503);
      const unknown = await forgot(`unknown-${email}`).expect(503);
      expect(known.body).toEqual(unknown.body);
    } finally {
      process.env.SMTP_PORT = smtpPort;
    }
  });

  it('limits recovery attempts independently of login, including trailing slash paths', async () => {
    for (let i = 0; i < 10; i++)
      await request(app.getHttpServer())
        .post('/api/auth/reset-password/')
        .set('Origin', origin)
        .send({ token: 'bad', newPassword: replacement })
        .expect(400);
    await forgot().expect(429);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email, password: original })
      .expect(200);
  });
});
