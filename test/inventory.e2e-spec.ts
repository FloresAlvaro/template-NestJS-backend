import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { tokenHash } from '../src/auth/password';
import { Role } from '../generated/prisma/client';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Dedicated TEST_DATABASE_URL required');
process.env.DATABASE_URL = url;
const origin = 'http://localhost:3000';

describe('Inventory and immutable stock audit (PostgreSQL)', () => {
  let app: INestApplication<App>;
  let db: PrismaService;
  let productId: number;
  let subCategoryId: number;
  let categoryId: number;
  const cookies = {} as Record<Role, string>;
  const users: number[] = [];
  const prefix = `inventory-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const base = () => `/api/products/${productId}/inventory`;
  const move = (body: Record<string, unknown>, role: Role = Role.ADMIN) =>
    request(app.getHttpServer())
      .post(`${base()}/movements`)
      .set('Origin', origin)
      .set('Cookie', cookies[role])
      .send(body);
  const count = async () =>
    (await db.inventory.findUniqueOrThrow({ where: { productId } })).quantity;

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
          passwordHash: 'unused-session-only-fixture',
          role,
        },
      });
      users.push(user.userId);
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
    const created = await request(app.getHttpServer())
      .post('/api/products')
      .set('Origin', origin)
      .set('Cookie', cookies.ADMIN)
      .send({
        name: 'Producto inventariado',
        sku: prefix,
        subCategoryId,
        cost: '10.00',
        salePrice: '20.00',
      })
      .expect(201);
    productId = (created.body as { productId: number }).productId;
  });
  afterAll(async () => {
    if (!db) return;
    await db.stockMovement.deleteMany({ where: { productId } });
    await db.product.deleteMany({ where: { subCategoryId } });
    await db.subCategory.delete({ where: { subCategoryId } });
    await db.category.delete({ where: { categoryId } });
    await db.user.deleteMany({ where: { userId: { in: users } } });
    await app.close();
  });

  it('starts at zero and enforces staff reads, admin writes, sessions and Origin', async () => {
    expect(await count()).toBe(0);
    await request(app.getHttpServer()).get(base()).expect(401);
    const result = await request(app.getHttpServer())
      .get(base())
      .set('Cookie', cookies.SELLER)
      .expect(200);
    expect(result.body).toMatchObject({
      productId,
      quantity: 0,
      minStock: 0,
      stockStatus: 'OUT_OF_STOCK',
    });
    await request(app.getHttpServer())
      .get(base())
      .set('Cookie', cookies.CUSTOMER)
      .expect(403);
    await move(
      { type: 'ENTRY', quantity: 5, reason: 'Recepción' },
      Role.SELLER,
    ).expect(403);
    await move(
      { type: 'ENTRY', quantity: 5, reason: 'Recepción' },
      Role.CUSTOMER,
    ).expect(403);
    await request(app.getHttpServer())
      .patch(base())
      .set('Origin', origin)
      .set('Cookie', cookies.SELLER)
      .send({ minStock: 5 })
      .expect(403);
    await request(app.getHttpServer())
      .post(`${base()}/movements`)
      .set('Cookie', cookies.ADMIN)
      .send({ type: 'ENTRY', quantity: 5, reason: 'Recepción' })
      .expect(403);
  });
  it('records entry, exit, actor and stock thresholds', async () => {
    await request(app.getHttpServer())
      .patch(base())
      .set('Origin', origin)
      .set('Cookie', cookies.ADMIN)
      .send({ minStock: 4 })
      .expect(200);
    const entry = await move({
      type: 'ENTRY',
      quantity: 10,
      reason: 'Stock inicial',
    }).expect(201);
    expect(entry.body).toMatchObject({
      previousQuantity: 0,
      resultingQuantity: 10,
      quantity: 10,
      userId: users[0],
      reason: 'Stock inicial',
    });
    await move({
      type: 'EXIT',
      quantity: 6,
      reason: 'Mercadería dañada',
    }).expect(201);
    expect(await count()).toBe(4);
    const product = await request(app.getHttpServer())
      .get(`/api/products/${productId}`)
      .set('Cookie', cookies.SELLER)
      .expect(200);
    expect(product.body).toMatchObject({
      quantity: 4,
      minStock: 4,
      stockStatus: 'LOW_STOCK',
    });
    expect(product.body).not.toHaveProperty('cost');
    const shop = await request(app.getHttpServer())
      .get(`/api/shop/products/${productId}`)
      .expect(200);
    expect(shop.body).toMatchObject({ quantity: 4 });
    expect(shop.body).not.toHaveProperty('cost');
  });
  it('rejects invalid movements, insufficient stock, overflow and stale adjustments atomically', async () => {
    const before = await db.stockMovement.count({ where: { productId } });
    await move({ type: 'ENTRY', quantity: 0, reason: 'Inválido' }).expect(400);
    await move({ type: 'EXIT', quantity: -1, reason: 'Inválido' }).expect(400);
    await move({ type: 'ENTRY', quantity: 1.5, reason: 'Inválido' }).expect(
      400,
    );
    await move({ type: 'ENTRY', quantity: 1, reason: '  ' }).expect(400);
    await move({
      type: 'ENTRY',
      quantity: 1,
      reason: 'Inválido',
      userId: users[1],
    }).expect(400);
    await move({ type: 'EXIT', quantity: 5, reason: 'Sin stock' }).expect(409);
    await move({
      type: 'ENTRY',
      quantity: 2147483647,
      reason: 'Desbordamiento',
    }).expect(400);
    await move({ type: 'ADJUSTMENT', quantity: 0, reason: 'Conteo' }).expect(
      400,
    );
    await move({
      type: 'ADJUSTMENT',
      quantity: 0,
      expectedQuantity: 10,
      reason: 'Conteo',
    }).expect(409);
    await move({
      type: 'ADJUSTMENT',
      quantity: 4,
      expectedQuantity: 4,
      reason: 'Sin cambio',
    }).expect(400);
    expect(await count()).toBe(4);
    expect(await db.stockMovement.count({ where: { productId } })).toBe(before);
  });
  it('allows counted adjustments to zero and handles competing exits without overselling', async () => {
    const adjustment = await move({
      type: 'ADJUSTMENT',
      quantity: 0,
      expectedQuantity: 4,
      reason: 'Conteo físico',
    }).expect(201);
    expect(adjustment.body).toMatchObject({
      quantity: -4,
      previousQuantity: 4,
      resultingQuantity: 0,
    });
    await move({ type: 'ENTRY', quantity: 5, reason: 'Reposición' }).expect(
      201,
    );
    const exits = await Promise.all([
      move({ type: 'EXIT', quantity: 4, reason: 'Salida uno' }),
      move({ type: 'EXIT', quantity: 4, reason: 'Salida dos' }),
    ]);
    expect(exits.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await count()).toBe(1);
  });
  it('keeps the audit paginated, readable by staff and immutable', async () => {
    const history = await request(app.getHttpServer())
      .get(`${base()}/movements?limit=2`)
      .set('Cookie', cookies.SELLER)
      .expect(200);
    const body = history.body as {
      items: { stockMovementId: number; user: Record<string, unknown> }[];
      total: number;
    };
    expect(body.total).toBe(5);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].stockMovementId).toBeGreaterThan(
      body.items[1].stockMovementId,
    );
    expect(Object.keys(body.items[0].user).sort()).toEqual(['name', 'userId']);
    await request(app.getHttpServer())
      .delete(`${base()}/movements/${body.items[0].stockMovementId}`)
      .set('Origin', origin)
      .set('Cookie', cookies.ADMIN)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${base()}/movements`)
      .set('Cookie', cookies.CUSTOMER)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/products/2147483647/inventory')
      .set('Cookie', cookies.ADMIN)
      .expect(404);
  });
  it('preserves inventory when a product is deactivated', async () => {
    await request(app.getHttpServer())
      .delete(`/api/products/${productId}`)
      .set('Origin', origin)
      .set('Cookie', cookies.ADMIN)
      .expect(200);
    expect(await count()).toBe(1);
    await request(app.getHttpServer())
      .get(base())
      .set('Cookie', cookies.SELLER)
      .expect(200);
  });
});
