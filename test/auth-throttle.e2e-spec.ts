import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
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
});
