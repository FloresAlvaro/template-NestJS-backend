import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/config/configure-app';
import { PrismaService } from '../src/database/services/prisma.service';
import { tokenHash } from '../src/auth/security/password';
import { Role } from '../generated/prisma/client';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Dedicated TEST_DATABASE_URL required');
process.env.DATABASE_URL = url;
const origin = 'http://localhost:3000';

describe('Reports and product images', () => {
  let app: INestApplication<App>;
  let db: PrismaService;
  let categoryId: number,
    subCategoryId: number,
    productId: number,
    customerId: number,
    saleId: number,
    saleItemId: number;
  const prefix = `reports-images-${randomUUID()}`;
  const cookies = {} as Record<Role, string>;
  const period = '?from=2001-01-01T00:00:00Z&to=2001-02-01T00:00:00Z';
  const get = (path: string, role: Role = Role.ADMIN) =>
    request(app.getHttpServer()).get(path).set('Cookie', cookies[role]);
  const operation = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/sales/${saleId}/${path}`)
      .set('Cookie', cookies.ADMIN)
      .set('Origin', origin)
      .send({
        requestId: randomUUID(),
        reason: 'Report fixture operation',
        ...body,
      });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    for (const role of Object.values(Role)) {
      const user = await db.user.create({
        data: {
          name: role,
          email: `${prefix}-${role}@example.test`,
          passwordHash: 'unused-fixture',
          role,
        },
      });
      const token = randomBytes(32).toString('hex');
      await db.session.create({
        data: {
          tokenHash: tokenHash(token),
          userId: user.userId,
          expiresAt: new Date(Date.now() + 600000),
        },
      });
      cookies[role] = `tienda_session=${token}`;
    }
    categoryId = (
      await db.category.create({
        data: { name: prefix, normalizedName: prefix },
      })
    ).categoryId;
    subCategoryId = (
      await db.subCategory.create({
        data: { name: prefix, normalizedName: prefix, categoryId },
      })
    ).subCategoryId;
    productId = (
      await db.product.create({
        data: {
          name: prefix,
          sku: prefix.toUpperCase(),
          subCategoryId,
          cost: '0.01',
          salePrice: '0.10',
          inventory: { create: { quantity: 3, minStock: 2 } },
        },
      })
    ).productId;
    customerId = (await db.customer.create({ data: { name: prefix } }))
      .customerId;
    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Cookie', cookies.SELLER)
      .set('Origin', origin)
      .send({
        requestId: randomUUID(),
        customerId,
        items: [{ productId, quantity: 3, expectedUnitPrice: '0.10' }],
      })
      .expect(201);
    const body = sale.body as {
      saleId: number;
      items: { saleItemId: number }[];
    };
    saleId = body.saleId;
    saleItemId = body.items[0].saleItemId;
    await db.sale.update({
      where: { saleId },
      data: { createdAt: new Date('2001-01-02T00:00:00Z') },
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.stockMovement.deleteMany({ where: { productId } });
    await db.saleOperationItem.deleteMany({ where: { operation: { saleId } } });
    await db.saleOperation.deleteMany({ where: { saleId } });
    await db.saleItem.deleteMany({ where: { saleId } });
    await db.sale.deleteMany({ where: { saleId } });
    await db.product.deleteMany({ where: { subCategoryId } });
    await db.subCategory.delete({ where: { subCategoryId } });
    await db.category.delete({ where: { categoryId } });
    await db.customer.delete({ where: { customerId } });
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await app.close();
  });

  it('restricts every report to administrators and validates dates and pagination', async () => {
    for (const path of [
      `sales${period}`,
      `top-products${period}`,
      'inventory',
      'low-stock',
    ]) {
      await request(app.getHttpServer())
        .get(`/api/reports/${path}`)
        .expect(401);
      for (const role of [Role.SELLER, Role.CUSTOMER])
        await get(`/api/reports/${path}`, role).expect(403);
    }
    for (const query of [
      '?from=invalid&to=invalid',
      '?from=2001-01-01&to=2001-02-01',
      '?from=2001-02-01T00:00:00Z&to=2001-01-01T00:00:00Z',
      '?from=2001-01-01T00:00:00Z&to=2003-01-01T00:00:00Z',
      `${period}&extra=x`,
    ])
      await get(`/api/reports/sales${query}`).expect(400);
    await get('/api/reports/low-stock?limit=101').expect(400);
  });

  it('calculates precise current cohort balances and net ranking after returns and cancellation', async () => {
    let response = await get(`/api/reports/sales${period}`).expect(200);
    expect(response.body).toMatchObject({
      saleCount: 1,
      originalTotal: '0.30',
      adjustedTotal: '0.30',
      balanceDue: '0.30',
      paid: '0.00',
    });
    await operation('payments', { amount: '0.30', method: 'CASH' }).expect(201);
    await operation('returns', { items: [{ saleItemId, quantity: 1 }] }).expect(
      201,
    );
    response = await get(`/api/reports/sales${period}`).expect(200);
    expect(response.body).toMatchObject({
      adjustedTotal: '0.20',
      balanceDue: '0.00',
      refundDue: '0.10',
      paid: '0.30',
    });
    const ranking = await get(`/api/reports/top-products${period}`).expect(200);
    expect(ranking.body).toMatchObject({
      items: [{ productId, quantity: '2', netTotal: '0.20' }],
    });
    await operation('refunds', { amount: '0.10', method: 'CASH' }).expect(201);
    await operation('cancel', {}).expect(201);
    response = await get(`/api/reports/sales${period}`).expect(200);
    expect(response.body).toMatchObject({
      originalTotal: '0.30',
      adjustedTotal: '0.00',
      paid: '0.30',
      refunded: '0.10',
      refundDue: '0.20',
    });
    expect(
      (await get(`/api/reports/top-products${period}`).expect(200)).body,
    ).toMatchObject({ items: [] });
    const empty = await get(
      '/api/reports/sales?from=2001-02-01T00:00:00Z&to=2001-03-01T00:00:00Z',
    ).expect(200);
    expect(empty.body).toMatchObject({
      saleCount: 0,
      originalTotal: '0.00',
      balanceDue: '0.00',
    });
  });

  it('reports current stock, including missing inventory and excluding inactive parents', async () => {
    await db.inventory.update({ where: { productId }, data: { quantity: 2 } });
    let page = await get('/api/reports/low-stock?limit=100').expect(200);
    expect(
      (page.body as { items: { productId: number }[] }).items.some(
        (p) => p.productId === productId,
      ),
    ).toBe(true);
    const summary = await get('/api/reports/inventory').expect(200);
    const stock = summary.body as { productCount: number; quantity: string };
    expect(stock.productCount).toBeGreaterThanOrEqual(1);
    expect(stock.quantity).toMatch(/^\d+$/);
    await db.inventory.delete({ where: { productId } });
    page = await get('/api/reports/low-stock?limit=100').expect(200);
    expect(
      (page.body as { items: { productId: number }[] }).items.some(
        (p) => p.productId === productId,
      ),
    ).toBe(true);
    await db.category.update({
      where: { categoryId },
      data: { isActive: false },
    });
    page = await get('/api/reports/low-stock?limit=100').expect(200);
    expect(
      (page.body as { items: { productId: number }[] }).items.some(
        (p) => p.productId === productId,
      ),
    ).toBe(false);
    await db.category.update({
      where: { categoryId },
      data: { isActive: true },
    });
  });

  it('validates images, enforces write roles and serves only active public images', async () => {
    const path = `/api/products/${productId}/image`;
    const image = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    for (const role of [Role.SELLER, Role.CUSTOMER]) {
      await request(app.getHttpServer())
        .post(path)
        .set('Cookie', cookies[role])
        .set('Origin', origin)
        .attach('file', image, 'test.png')
        .expect(403);
      await request(app.getHttpServer())
        .delete(path)
        .set('Cookie', cookies[role])
        .set('Origin', origin)
        .expect(403);
    }
    await request(app.getHttpServer())
      .post(path)
      .set('Cookie', cookies.ADMIN)
      .set('Origin', origin)
      .attach('file', Buffer.from('<svg></svg>'), 'fake.png')
      .expect(400);
    await request(app.getHttpServer())
      .post(path)
      .set('Cookie', cookies.ADMIN)
      .set('Origin', origin)
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png')
      .expect(413);
    await request(app.getHttpServer())
      .post(path)
      .set('Cookie', cookies.ADMIN)
      .attach('file', image, 'test.png')
      .expect(403);
    await request(app.getHttpServer())
      .post(path)
      .set('Cookie', cookies.ADMIN)
      .set('Origin', origin)
      .attach('file', image, 'test.png')
      .expect(201);
    const stored = await db.productImage.findUniqueOrThrow({
      where: { productId },
    });
    await request(app.getHttpServer())
      .post(path)
      .set('Cookie', cookies.ADMIN)
      .set('Origin', origin)
      .attach('file', Buffer.from('corrupt replacement'), 'image.webp')
      .expect(400);
    expect(
      Buffer.from(
        (await db.productImage.findUniqueOrThrow({ where: { productId } }))
          .content,
      ),
    ).toEqual(Buffer.from(stored.content));
    expect((await sharp(Buffer.from(stored.content)).metadata()).format).toBe(
      'webp',
    );
    await get(path, Role.SELLER)
      .expect(200)
      .expect('Content-Type', 'image/webp');
    await get(path, Role.CUSTOMER).expect(403);
    await request(app.getHttpServer())
      .get(`/api/shop/products/${productId}/image`)
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/shop/products/${productId}`)
          .expect(200)
      ).body,
    ).toHaveProperty('imageUrl', `/api/shop/products/${productId}/image`);
    expect(
      (await get(`/api/products/${productId}`).expect(200)).body,
    ).toHaveProperty('imageUrl', path);
    await db.product.update({
      where: { productId },
      data: { isActive: false },
    });
    await request(app.getHttpServer())
      .get(`/api/shop/products/${productId}/image`)
      .expect(404);
    await get(path).expect(200);
    await db.product.update({ where: { productId }, data: { isActive: true } });
    await db.category.update({
      where: { categoryId },
      data: { isActive: false },
    });
    await request(app.getHttpServer())
      .get(`/api/shop/products/${productId}/image`)
      .expect(404);
    await db.category.update({
      where: { categoryId },
      data: { isActive: true },
    });
    await request(app.getHttpServer())
      .delete(path)
      .set('Cookie', cookies.ADMIN)
      .set('Origin', origin)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/shop/products/${productId}/image`)
      .expect(404);
  });
});
