import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
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
type PurchaseResponse = {
  purchaseId: number;
  status: string;
  total: string;
  supplierName: string;
  requestHash?: string;
  items: { unitCost: string; subtotal: string }[];
  operations: { updateCost: boolean; requestHash?: string }[];
};

describe('Suppliers and transactional purchasing (PostgreSQL)', () => {
  let app: INestApplication<App>, db: PrismaService;
  let categoryId: number, subCategoryId: number, supplierId: number;
  const products: number[] = [],
    users: number[] = [];
  const cookies = {} as Record<Role | 'OTHER', string>;
  const marker = `purchasing-${randomUUID()}`;
  const get = (path: string, role: Role | 'OTHER' = Role.ADMIN) =>
    request(app.getHttpServer()).get(path).set('Cookie', cookies[role]);
  const post = (path: string, role: Role | 'OTHER' = Role.ADMIN) =>
    request(app.getHttpServer())
      .post(path)
      .set('Cookie', cookies[role])
      .set('Origin', origin);
  const patch = (path: string, body: object) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Cookie', cookies.ADMIN)
      .set('Origin', origin)
      .send(body);
  const payload = () => ({
    requestId: randomUUID(),
    supplierId,
    reference: 'INV-001',
    items: [{ productId: products[0], quantity: 3, unitCost: '0.10' }],
  });
  const operation = (updateCost = false) => ({
    requestId: randomUUID(),
    reason: 'Recepción de mercadería de prueba',
    updateCost,
  });
  const create = async (body = payload()): Promise<PurchaseResponse> =>
    (await post('/api/purchases').send(body).expect(201))
      .body as PurchaseResponse;
  const receive = (id: number, body = operation()) =>
    post(`/api/purchases/${id}/receive`).send(body);
  const quantity = async (id = products[0]) =>
    (await db.inventory.findUniqueOrThrow({ where: { productId: id } }))
      .quantity;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    for (const role of [...Object.values(Role), 'OTHER' as const]) {
      const user = await db.user.create({
        data: {
          name: role,
          email: `${marker}-${role}@example.test`,
          passwordHash: 'unused-fixture',
          role: role === 'OTHER' ? Role.ADMIN : role,
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
        data: { name: marker, normalizedName: marker },
      })
    ).categoryId;
    subCategoryId = (
      await db.subCategory.create({
        data: { name: marker, normalizedName: marker, categoryId },
      })
    ).subCategoryId;
    for (let i = 0; i < 2; i++)
      products.push(
        (
          await db.product.create({
            data: {
              name: `Producto ${i}`,
              sku: `${marker}-${i}`.toUpperCase(),
              subCategoryId,
              cost: '1.00',
              salePrice: '4.00',
              inventory: { create: { quantity: 5 } },
            },
          })
        ).productId,
      );
    supplierId = (
      (
        await post('/api/suppliers')
          .send({ name: marker, document: marker.slice(0, 50) })
          .expect(201)
      ).body as { supplierId: number }
    ).supplierId;
  });
  beforeEach(async () => {
    await db.stockMovement.deleteMany({
      where: { productId: { in: products } },
    });
    await db.purchaseOperation.deleteMany({ where: { userId: { in: users } } });
    await db.purchaseItem.deleteMany({
      where: { productId: { in: products } },
    });
    await db.purchase.deleteMany({ where: { userId: { in: users } } });
    await db.product.updateMany({
      where: { productId: { in: products } },
      data: { isActive: true, cost: '1.00' },
    });
    await db.inventory.updateMany({
      where: { productId: { in: products } },
      data: { quantity: 5 },
    });
    await db.supplier.update({
      where: { supplierId },
      data: { isActive: true, name: marker, normalizedName: marker },
    });
    await db.subCategory.update({
      where: { subCategoryId },
      data: { isActive: true },
    });
  });
  afterAll(async () => {
    if (!db) return;
    await db.stockMovement.deleteMany({
      where: { productId: { in: products } },
    });
    await db.purchaseOperation.deleteMany({ where: { userId: { in: users } } });
    await db.purchaseItem.deleteMany({
      where: { productId: { in: products } },
    });
    await db.purchase.deleteMany({ where: { userId: { in: users } } });
    await db.supplier.deleteMany({ where: { name: { startsWith: marker } } });
    await db.product.deleteMany({ where: { subCategoryId } });
    await db.subCategory.delete({ where: { subCategoryId } });
    await db.category.delete({ where: { categoryId } });
    await db.user.deleteMany({ where: { userId: { in: users } } });
    await app.close();
  });
  it('requires real sessions, ADMIN and trusted Origin for purchases and suppliers', async () => {
    await request(app.getHttpServer()).get('/api/suppliers').expect(401);
    const purchase = await create();
    for (const role of [Role.SELLER, Role.CUSTOMER]) {
      for (const path of [
        '/api/suppliers',
        `/api/suppliers/${supplierId}`,
        '/api/purchases',
        `/api/purchases/${purchase.purchaseId}`,
      ])
        await get(path, role).expect(403);
      await post('/api/suppliers', role).send({ name: 'Denied' }).expect(403);
      await post('/api/purchases', role).send(payload()).expect(403);
      await post(`/api/purchases/${purchase.purchaseId}/receive`, role)
        .send(operation())
        .expect(403);
      await post(`/api/purchases/${purchase.purchaseId}/cancel`, role)
        .send({ requestId: randomUUID(), reason: 'Denied' })
        .expect(403);
    }
    await request(app.getHttpServer())
      .post('/api/purchases')
      .set('Cookie', cookies.ADMIN)
      .send(payload())
      .expect(403);
    await post('/api/purchases')
      .send({ ...payload(), userId: users[1] })
      .expect(400);
  });
  it('validates suppliers, uniqueness, null semantics, search and logical deactivation', async () => {
    await post('/api/suppliers')
      .send({ name: ` ${marker.toUpperCase()} ` })
      .expect(409);
    await post('/api/suppliers')
      .send({ name: `${marker}-duplicate`, document: marker.slice(0, 50) })
      .expect(409);
    await patch(`/api/suppliers/${supplierId}`, { name: null }).expect(400);
    await patch(`/api/suppliers/${supplierId}`, { email: 'invalid' }).expect(
      400,
    );
    await patch(`/api/suppliers/${supplierId}`, {
      phone: null,
      isActive: null,
    }).expect(400);
    await patch(`/api/suppliers/${supplierId}`, {
      phone: '1234',
      contactName: 'Contacto',
    }).expect(200);
    await patch(`/api/suppliers/${supplierId}`, {
      phone: null,
      isActive: false,
    }).expect(200);
    const filtered = (
      await get(
        `/api/suppliers?search=${marker}&status=inactive&limit=10`,
      ).expect(200)
    ).body as {
      total: number;
      items: { normalizedName?: string; phone: string | null }[];
    };
    expect(filtered.total).toBe(1);
    expect(filtered.items[0].normalizedName).toBeUndefined();
    expect(filtered.items[0].phone).toBeNull();
    expect(
      (
        (await get('/api/suppliers?search=%25').expect(200)).body as {
          total: number;
        }
      ).total,
    ).toBe(0);
    await get('/api/suppliers?limit=101').expect(400);
  });
  it('creates an exact historical pending purchase without stock or cost changes', async () => {
    const purchase = await create();
    expect(purchase.status).toBe('PENDING');
    expect(purchase.total).toBe('0.30');
    expect(purchase.items[0]).toMatchObject({
      unitCost: '0.10',
      subtotal: '0.30',
    });
    expect(purchase.requestHash).toBeUndefined();
    expect(await quantity()).toBe(5);
    expect(
      await db.stockMovement.count({ where: { productId: products[0] } }),
    ).toBe(0);
    await patch(`/api/suppliers/${supplierId}`, {
      name: `${marker}-renamed`,
    }).expect(200);
    expect(
      (
        (await get(`/api/purchases/${purchase.purchaseId}`).expect(200))
          .body as PurchaseResponse
      ).supplierName,
    ).toBe(marker);
    expect(
      (
        (
          await get(
            `/api/purchases?supplierId=${supplierId}&status=PENDING&search=INV-001`,
          ).expect(200)
        ).body as { total: number }
      ).total,
    ).toBe(1);
  });
  it('retries creation without duplicates and rejects changed payload or actor', async () => {
    const body = payload(),
      first = await create(body),
      second = await create(body);
    expect(second.purchaseId).toBe(first.purchaseId);
    await post('/api/purchases')
      .send({ ...body, reference: 'different' })
      .expect(409);
    await post('/api/purchases', 'OTHER').send(body).expect(409);
    expect(await db.purchase.count({ where: { supplierId } })).toBe(1);
  });
  it('rejects invalid lines, duplicates, overflow, inactive suppliers and parents', async () => {
    for (const quantity of [0, -1, 1.2, 2147483648])
      await post('/api/purchases')
        .send({
          ...payload(),
          items: [{ productId: products[0], quantity, unitCost: '0.10' }],
        })
        .expect(400);
    await post('/api/purchases')
      .send({ ...payload(), items: [...payload().items, ...payload().items] })
      .expect(400);
    await post('/api/purchases')
      .send({ ...payload(), items: [] })
      .expect(400);
    await post('/api/purchases')
      .send({
        ...payload(),
        items: [
          {
            productId: products[0],
            quantity: 2,
            unitCost: '9999999999999999.99',
          },
        ],
      })
      .expect(400);
    await post('/api/purchases')
      .send({
        ...payload(),
        items: [{ productId: products[0], quantity: 1, unitCost: '1.001' }],
      })
      .expect(400);
    await post('/api/purchases')
      .send({ ...payload(), supplierId: 2147483647 })
      .expect(404);
    await db.supplier.update({
      where: { supplierId },
      data: { isActive: false },
    });
    await post('/api/purchases').send(payload()).expect(409);
    await db.supplier.update({
      where: { supplierId },
      data: { isActive: true },
    });
    await db.subCategory.update({
      where: { subCategoryId },
      data: { isActive: false },
    });
    await post('/api/purchases').send(payload()).expect(409);
    expect(await db.purchase.count({ where: { supplierId } })).toBe(0);
  });
  it('receives once, audits each entry, preserves sales price and optionally updates cost', async () => {
    const purchase = await create(),
      body = operation(true);
    const responses = await Promise.all([
      receive(purchase.purchaseId, body),
      receive(purchase.purchaseId, body),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(await quantity()).toBe(8);
    const result = responses[0].body as PurchaseResponse;
    expect(result.status).toBe('RECEIVED');
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].requestHash).toBeUndefined();
    const product = await db.product.findUniqueOrThrow({
      where: { productId: products[0] },
    });
    expect(product.cost.toFixed(2)).toBe('0.10');
    expect(product.salePrice.toFixed(2)).toBe('4.00');
    const movements = await db.stockMovement.findMany({
      where: { productId: products[0] },
      include: { purchaseItem: true },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      previousQuantity: 5,
      resultingQuantity: 8,
      quantity: 3,
      type: 'ENTRY',
      userId: users[0],
    });
    expect(movements[0].purchaseItem?.purchaseId).toBe(purchase.purchaseId);
    await receive(purchase.purchaseId).expect(409);
    await post(`/api/purchases/${purchase.purchaseId}/cancel`)
      .send({ requestId: randomUUID(), reason: 'No se permite' })
      .expect(409);
    await receive(purchase.purchaseId, { ...body, updateCost: false }).expect(
      409,
    );
  });
  it('keeps costs by default and serializes concurrent receipts of different purchases', async () => {
    const first = await create(),
      second = await create();
    await Promise.all([
      receive(first.purchaseId).expect(200),
      receive(second.purchaseId).expect(200),
    ]);
    expect(await quantity()).toBe(11);
    expect(
      (
        await db.product.findUniqueOrThrow({
          where: { productId: products[0] },
        })
      ).cost.toFixed(2),
    ).toBe('1.00');
  });
  it('cancels pending purchases idempotently without stock or cost writes', async () => {
    const purchase = await create(),
      body = { requestId: randomUUID(), reason: 'Proveedor no puede entregar' };
    for (let i = 0; i < 2; i++)
      expect(
        (
          (
            await post(`/api/purchases/${purchase.purchaseId}/cancel`)
              .send(body)
              .expect(200)
          ).body as PurchaseResponse
        ).status,
      ).toBe('CANCELLED');
    await receive(purchase.purchaseId).expect(409);
    expect(await quantity()).toBe(5);
    expect(
      await db.stockMovement.count({ where: { productId: products[0] } }),
    ).toBe(0);
  });
  it('blocks receipt after deactivation and stock overflow without changing status', async () => {
    const purchase = await create();
    await db.supplier.update({
      where: { supplierId },
      data: { isActive: false },
    });
    await receive(purchase.purchaseId).expect(409);
    await db.supplier.update({
      where: { supplierId },
      data: { isActive: true },
    });
    await db.product.update({
      where: { productId: products[0] },
      data: { isActive: false },
    });
    await receive(purchase.purchaseId).expect(409);
    await db.product.update({
      where: { productId: products[0] },
      data: { isActive: true },
    });
    await db.inventory.update({
      where: { productId: products[0] },
      data: { quantity: 2147483647 },
    });
    await receive(purchase.purchaseId).expect(409);
    expect(
      (
        await db.purchase.findUniqueOrThrow({
          where: { purchaseId: purchase.purchaseId },
        })
      ).status,
    ).toBe('PENDING');
    expect(await quantity()).toBe(2147483647);
  });
  it('rolls back all entries, costs and status when a later stock write fails, then permits a safe retry', async () => {
    const purchase = await create({
        ...payload(),
        items: products.map((productId) => ({
          productId,
          quantity: 3,
          unitCost: '0.10',
        })),
      }),
      body = operation(true);
    await db.$executeRawUnsafe(
      `ALTER TABLE "StockMovement" ADD CONSTRAINT "purchase_test_rollback" CHECK ("purchaseItemId" IS NULL OR "productId" <> ${products[1]})`,
    );
    try {
      await receive(purchase.purchaseId, body).expect(500);
      expect(await quantity(products[0])).toBe(5);
      expect(await quantity(products[1])).toBe(5);
      expect(
        await db.stockMovement.count({
          where: { productId: { in: products } },
        }),
      ).toBe(0);
      expect(
        (
          await db.product.findUniqueOrThrow({
            where: { productId: products[0] },
          })
        ).cost.toFixed(2),
      ).toBe('1.00');
      expect(
        (
          await db.purchase.findUniqueOrThrow({
            where: { purchaseId: purchase.purchaseId },
          })
        ).status,
      ).toBe('PENDING');
      expect(
        await db.purchaseOperation.count({
          where: { purchaseId: purchase.purchaseId },
        }),
      ).toBe(0);
    } finally {
      await db.$executeRawUnsafe(
        'ALTER TABLE "StockMovement" DROP CONSTRAINT "purchase_test_rollback"',
      );
    }
    await receive(purchase.purchaseId, body).expect(200);
    expect(await quantity()).toBe(8);
  });
});
