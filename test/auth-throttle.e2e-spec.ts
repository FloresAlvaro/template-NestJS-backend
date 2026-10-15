import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { createHmac, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/services/prisma.service';
import { consumeAuthAttempt } from '../src/auth/security/auth-throttle';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/config/configure-app';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Dedicated TEST_DATABASE_URL required');
process.env.DATABASE_URL = url;
const origin = 'http://localhost:3000';

describe('Authentication throttle routing regressions', () => {
  let app: INestApplication<App>;
  beforeEach(async () => {
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

  it('shares the login counter across mixed case, prefix case and trailing slash variants', async () => {
    const paths = [
      '/api/auth/LOGIN',
      '/API/AUTH/Login/',
      '/api/auth/login/',
      '/api/auth/login',
    ];
    const email = `missing-${randomUUID()}@example.test`;
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post(paths[i % paths.length])
        .set('Origin', origin)
        .send({ email, password: 'incorrect-password' })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/auth/LOGIN/')
      .set('Origin', origin)
      .send({ email, password: 'incorrect-password' })
      .expect(429);
    await request(app.getHttpServer())
      .post('/api/auth/REGISTER')
      .set('Origin', origin)
      .send({})
      .expect(429);
  });

  it('counts registration attempts independently of URL spelling and validates Origin before counting', async () => {
    for (let i = 0; i < 11; i++)
      await request(app.getHttpServer())
        .post('/api/auth/REGISTER')
        .set('Origin', 'https://foreign.example')
        .send({})
        .expect(403);
    const paths = [
      '/api/auth/REGISTER/',
      '/API/AUTH/Register',
      '/api/auth/register',
    ];
    for (let i = 0; i < 10; i++)
      await request(app.getHttpServer())
        .post(paths[i % paths.length])
        .set('Origin', origin)
        .send({})
        .expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({})
      .expect(429);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({})
      .expect(429);
  });
  it('bounds expired-counter cleanup and retains the active counter', async () => {
    const db = app.get(PrismaService);
    await db.authRateLimit.createMany({
      data: Array.from({ length: 150 }, () => ({
        key: randomUUID(),
        attempts: 11,
        expiresAt: new Date(Date.now() - 600000),
      })),
    });
    await consumeAuthAttempt(db, 'cleanup-active');
    expect(await db.authRateLimit.count({ where: { attempts: 11 } })).toBe(50);
    await Promise.all(
      Array.from({ length: 9 }, () => consumeAuthAttempt(db, 'cleanup-active')),
    );
    expect(await db.authRateLimit.count({ where: { attempts: 11 } })).toBe(0);
    await expect(
      consumeAuthAttempt(db, 'cleanup-active'),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('shares atomic limits across instances while keeping signed clients independent', async () => {
    const secret = 'integration-proxy-secret-at-least-32-characters';
    app.get(ConfigService).set('AUTH_PROXY_SECRET', secret);
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const second = module.createNestApplication<INestApplication<App>>();
    second.get(ConfigService).set('AUTH_PROXY_SECRET', secret);
    configureApp(second);
    await second.init();
    const headers = (ip: string) => {
      const at = String(Date.now());
      return {
        Origin: origin,
        'x-tienda-client-ip': ip,
        'x-tienda-client-at': at,
        'x-tienda-client-signature': createHmac('sha256', secret)
          .update(`${at}\n${ip}`)
          .digest('hex'),
      };
    };
    const attempt = (target: INestApplication<App>, ip: string) =>
      request(target.getHttpServer())
        .post('/api/auth/login')
        .set(headers(ip))
        .send({
          email: 'missing@example.test',
          password: 'incorrect-password',
        });
    try {
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          attempt(i % 2 ? second : app, '203.0.113.1'),
        ),
      );
      expect(results.filter((r) => r.status === 401)).toHaveLength(10);
      expect(results.filter((r) => r.status === 429)).toHaveLength(2);
      await attempt(second, '203.0.113.2').expect(401);
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set({ ...headers('203.0.113.1'), 'x-tienda-client-ip': '203.0.113.3' })
        .send({})
        .expect(403);
      await app.get(PrismaService).authRateLimit.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await attempt(app, '203.0.113.1').expect(401);
    } finally {
      await second.close();
    }
  });
});
