import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { hashPassword, tokenHash } from '../src/auth/password';
import { Role } from '../generated/prisma/client';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Dedicated TEST_DATABASE_URL required');
process.env.DATABASE_URL = url;
const origin = 'http://localhost:3000';
describe('Authentication and permissions', () => {
  let app: INestApplication<App>;
  let db: PrismaService;
  const prefix = `auth-${Date.now()}`;
  const password = 'testing-password-123';
  const cookies: Partial<Record<Role, string>> = {};
  const ids: Partial<Record<Role, number>> = {};
  let categoryId: number;
  let subCategoryId: number;
  let productId: number;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    const passwordHash = await hashPassword(password);
    for (const role of Object.values(Role)) {
      const user = await db.user.create({
        data: {
          name: role,
          email: `${prefix}-${role.toLowerCase()}@example.test`,
          passwordHash,
          role,
          ...(role === Role.CUSTOMER
            ? { customer: { create: { name: role } } }
            : {}),
        },
      });
      ids[role] = user.userId;
      const token = randomBytes(32).toString('hex');
      await db.session.create({
        data: {
          tokenHash: tokenHash(token),
          userId: user.userId,
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      cookies[role] = `tienda_session=${token}`;
    }
    const category = await db.category.create({
      data: { name: prefix, normalizedName: prefix },
    });
    categoryId = category.categoryId;
    const sub = await db.subCategory.create({
      data: { name: prefix, normalizedName: prefix, categoryId },
    });
    subCategoryId = sub.subCategoryId;
    const product = await db.product.create({
      data: {
        name: 'Test product',
        sku: prefix.toUpperCase(),
        subCategoryId,
        cost: '10',
        salePrice: '20',
      },
    });
    productId = product.productId;
  });
  afterAll(async () => {
    if (!db) return;
    await db.product.deleteMany({ where: { subCategoryId } });
    await db.subCategory.delete({ where: { subCategoryId } });
    await db.category.delete({ where: { categoryId } });
    await db.customer.deleteMany({
      where: { user: { email: { startsWith: prefix } } },
    });
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await app.close();
  });
  it('requires a session and restricts customer management access', async () => {
    await request(app.getHttpServer()).get('/api/products').expect(401);
    await request(app.getHttpServer())
      .get('/api/products')
      .set('Cookie', cookies.CUSTOMER!)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/users')
      .set('Cookie', cookies.SELLER!)
      .expect(403);
  });
  it('protects costs and mutations from sellers', async () => {
    const seller = await request(app.getHttpServer())
      .get(`/api/products/${productId}`)
      .set('Cookie', cookies.SELLER!)
      .expect(200);
    expect(seller.body).not.toHaveProperty('cost');
    const admin = await request(app.getHttpServer())
      .get(`/api/products/${productId}`)
      .set('Cookie', cookies.ADMIN!)
      .expect(200);
    expect(admin.body).toHaveProperty('cost', '10.00');
    await request(app.getHttpServer())
      .delete(`/api/products/${productId}`)
      .set('Cookie', cookies.SELLER!)
      .set('Origin', origin)
      .expect(403);
  });
  it('publishes only active products without private data', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/shop/products/${productId}`)
      .expect(200);
    expect(response.body).not.toHaveProperty('cost');
    await db.category.update({
      where: { categoryId },
      data: { isActive: false },
    });
    await request(app.getHttpServer())
      .get(`/api/shop/products/${productId}`)
      .expect(404);
    await db.category.update({
      where: { categoryId },
      data: { isActive: true },
    });
  });
  it('rejects cross-origin writes and self demotion', async () => {
    await request(app.getHttpServer())
      .patch(`/api/users/${ids.ADMIN}`)
      .set('Cookie', cookies.ADMIN!)
      .set('Origin', 'https://untrusted.test')
      .send({ name: 'Changed' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/users/${ids.ADMIN}`)
      .set('Cookie', cookies.ADMIN!)
      .set('Origin', origin)
      .send({ role: 'SELLER' })
      .expect(409);
  });
  it('registers only customers with a linked profile and rejects role injection', async () => {
    const payload = {
      name: 'New customer',
      email: `${prefix}-new@example.test`,
      password,
    };
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ ...payload, role: 'ADMIN' })
      .expect(400);
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', origin)
      .send(payload)
      .expect(201);
    expect(response.body).toHaveProperty('role', 'CUSTOMER');
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(
      await db.customer.findUnique({
        where: { userId: (response.body as { userId: number }).userId },
      }),
    ).toBeTruthy();
  });
  it('logs in with an HttpOnly cookie and revokes it on logout', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: `${prefix}-ADMIN@example.test`, password: 'wrong' })
      .expect(401);
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: `${prefix}-ADMIN@example.test`, password })
      .expect(200);
    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(response.body).not.toHaveProperty('passwordHash');
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  });
  it('edits only the authenticated customer profile', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/auth/customer')
      .set('Cookie', cookies.CUSTOMER!)
      .set('Origin', origin)
      .send({ phone: '70000000' })
      .expect(200);
    expect(response.body).toHaveProperty('userId', ids.CUSTOMER);
    await request(app.getHttpServer())
      .patch('/api/auth/customer')
      .set('Cookie', cookies.CUSTOMER!)
      .set('Origin', origin)
      .send({ userId: ids.ADMIN })
      .expect(400);
  });
  it('revokes sessions on password changes and account deactivation', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/password')
      .set('Cookie', cookies.CUSTOMER!)
      .set('Origin', origin)
      .send({
        currentPassword: password,
        newPassword: 'new-testing-password-456',
      })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookies.CUSTOMER!)
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/users/${ids.SELLER}`)
      .set('Cookie', cookies.ADMIN!)
      .set('Origin', origin)
      .send({ isActive: false })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookies.SELLER!)
      .expect(401);
  });
  it('uses the same account creation rules for administrator-created users', async () => {
    const email = `${prefix}-staff@example.test`;
    const response = await request(app.getHttpServer())
      .post('/api/users')
      .set('Cookie', cookies.ADMIN!)
      .set('Origin', origin)
      .send({ name: 'New seller', email, password, role: 'SELLER' })
      .expect(201);
    const user = response.body as { userId: number; role: string };
    expect(user.role).toBe('SELLER');
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(
      await db.customer.findUnique({ where: { userId: user.userId } }),
    ).toBeNull();
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Cookie', cookies.ADMIN!)
      .set('Origin', origin)
      .send({ name: 'Duplicate', email, password, role: 'CUSTOMER' })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/users/${user.userId}`)
      .set('Cookie', cookies.ADMIN!)
      .set('Origin', origin)
      .send({ role: 'CUSTOMER' })
      .expect(200);
    expect(
      await db.customer.findUnique({ where: { userId: user.userId } }),
    ).toBeTruthy();
  });
  it('rejects expired sessions', async () => {
    const token = randomBytes(32).toString('hex');
    await db.session.create({
      data: {
        tokenHash: tokenHash(token),
        userId: ids.ADMIN!,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `tienda_session=${token}`)
      .expect(401);
  });
  it('limits repeated login attempts, including trailing slash routes', async () => {
    let status = 0;
    for (let i = 0; i < 11; i++) {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login/')
        .set('Origin', origin)
        .send({ email: `${prefix}-missing@example.test`, password: 'wrong' });
      status = response.status;
      expect([401, 429]).toContain(status);
    }
    expect(status).toBe(429);
  });
});
