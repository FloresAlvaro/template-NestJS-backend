import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/config/configure-app';
import { PrismaService } from '../src/database/services/prisma.service';
import { tokenHash } from '../src/auth/security/password';
import { Prisma } from '../generated/prisma/client';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Dedicated TEST_DATABASE_URL required');
process.env.DATABASE_URL = url;
type Actor = 'ADMIN' | 'SELLER' | 'CUSTOMER' | 'OTHER';
type Shift = {
  shiftId: number;
  closedAt: string | null;
  difference: string | null;
  requestHash?: string;
  summary: {
    expectedAmount: string;
    lastMovementId: number;
    netPayments: { CASH: string; CARD: string; TRANSFER: string };
  };
};
type Alerts = {
  data: {
    productId: number;
    availableQuantity: number;
    reservedQuantity: number;
    severity: string;
    suggestedQuantity: number;
    cost?: string;
  }[];
  total: number;
  summary: { total: number; outOfStock: number; lowStock: number };
};

describe('Cash shifts, settlement ledger and available-stock alerts', () => {
  let app: INestApplication<App>, db: PrismaService;
  let categoryId: number,
    subCategoryId: number,
    productId: number,
    customerId: number,
    registerId: number;
  const marker = 'cash-' + randomUUID();
  const users = {} as Record<Actor, number>,
    cookies = {} as Record<Actor, string>;
  const get = (path: string, actor: Actor = 'SELLER') =>
    request(app.getHttpServer()).get(path).set('Cookie', cookies[actor]);
  const post = (path: string, actor: Actor = 'SELLER') =>
    request(app.getHttpServer())
      .post(path)
      .set('Cookie', cookies[actor])
      .set('Origin', 'http://localhost:3000');
  const openBody = () => ({
    requestId: randomUUID(),
    registerId,
    openingAmount: '10.00',
  });
  const open = async (actor: Actor = 'SELLER') =>
    (await post('/api/cash/shifts', actor).send(openBody()).expect(201))
      .body as Shift;
  const details = async (id: number, actor: Actor = 'SELLER') =>
    (await get('/api/cash/shifts/' + id, actor).expect(200)).body as Shift;
  const movement = (kind = 'CASH_IN', amount = '0.10') => ({
    requestId: randomUUID(),
    kind,
    amount,
    reason: 'Movimiento de prueba',
  });
  const closeBody = (last = 0) => ({
    requestId: randomUUID(),
    countedAmount: '10.00',
    expectedLastMovementId: last,
    reason: 'Cierre de prueba',
  });
  const sale = async () =>
    (
      (
        await post('/api/sales')
          .send({
            requestId: randomUUID(),
            customerId,
            items: [{ productId, quantity: 10, expectedUnitPrice: '1.00' }],
          })
          .expect(201)
      ).body as { saleId: number }
    ).saleId;
  const settlement = (amount: string, method = 'CASH') => ({
    requestId: randomUUID(),
    reason: 'Cobro de prueba',
    amount,
    method,
  });
  const alerts = async (query = '') =>
    (
      await get(
        '/api/inventory/alerts?search=' + encodeURIComponent(marker) + query,
      ).expect(200)
    ).body as Alerts;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    for (const actor of ['ADMIN', 'SELLER', 'CUSTOMER', 'OTHER'] as const) {
      const user = await db.user.create({
        data: {
          name: actor,
          email: marker + '-' + actor + '@example.test',
          passwordHash: 'unused-fixture',
          role: actor === 'OTHER' ? 'SELLER' : actor,
        },
      });
      users[actor] = user.userId;
      const token = randomBytes(32).toString('hex');
      cookies[actor] = 'tienda_session=' + token;
      await db.session.create({
        data: {
          tokenHash: tokenHash(token),
          userId: user.userId,
          expiresAt: new Date(Date.now() + 600000),
        },
      });
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
    productId = (
      await db.product.create({
        data: {
          name: marker + ' product',
          sku: marker.toUpperCase(),
          subCategoryId,
          cost: '0.50',
          salePrice: '1.00',
          inventory: { create: { quantity: 20, minStock: 5 } },
        },
      })
    ).productId;
    customerId = (
      await db.customer.create({
        data: { name: 'Fixture', userId: users.CUSTOMER },
      })
    ).customerId;
    registerId = (await db.cashRegister.create({ data: { name: marker } }))
      .registerId;
  });
  async function clear() {
    await db.cashMovement.deleteMany({
      where: { userId: { in: Object.values(users) } },
    });
    await db.cashShift.deleteMany({
      where: { userId: { in: Object.values(users) } },
    });
    await db.stockMovement.deleteMany({ where: { productId } });
    await db.orderOperation.deleteMany({ where: { order: { customerId } } });
    await db.orderItem.deleteMany({ where: { productId } });
    await db.order.deleteMany({ where: { customerId } });
    await db.saleOperationItem.deleteMany({
      where: { saleItem: { productId } },
    });
    await db.saleOperation.deleteMany({ where: { sale: { customerId } } });
    await db.saleItem.deleteMany({ where: { productId } });
    await db.sale.deleteMany({ where: { customerId } });
  }
  beforeEach(async () => {
    await clear();
    await db.inventory.update({
      where: { productId },
      data: { quantity: 20, minStock: 5 },
    });
    await db.category.update({
      where: { categoryId },
      data: { isActive: true },
    });
  });
  afterAll(async () => {
    if (!db) return;
    await clear();
    await db.cashRegister.delete({ where: { registerId } });
    await db.product.delete({ where: { productId } });
    await db.subCategory.delete({ where: { subCategoryId } });
    await db.category.delete({ where: { categoryId } });
    await db.customer.delete({ where: { customerId } });
    await db.user.deleteMany({
      where: { userId: { in: Object.values(users) } },
    });
    await app.close();
  });

  it('requires sessions, staff roles, trusted Origin and ADMIN register management', async () => {
    await request(app.getHttpServer()).get('/api/cash/registers').expect(401);
    for (const path of [
      '/api/cash/registers',
      '/api/cash/shifts',
      '/api/cash/shifts/current',
      '/api/inventory/alerts',
    ])
      await get(path, 'CUSTOMER').expect(403);
    await post('/api/cash/shifts', 'CUSTOMER').send(openBody()).expect(403);
    await post('/api/cash/registers').send({ name: 'Denied' }).expect(403);
    await request(app.getHttpServer())
      .post('/api/cash/shifts')
      .set('Cookie', cookies.SELLER)
      .send(openBody())
      .expect(403);
    await post('/api/cash/shifts')
      .send({ ...openBody(), userId: users.ADMIN })
      .expect(400);
    await post('/api/cash/registers', 'ADMIN')
      .send({ name: 'Invalid register', isActive: null })
      .expect(400);
    const id = await sale();
    await post('/api/sales/' + id + '/payments')
      .send({ ...settlement('1.00'), cashShiftId: null })
      .expect(400);
  });
  it('opens once under concurrent retries and rejects another open shift', async () => {
    const body = openBody();
    const replies = await Promise.all([
      post('/api/cash/shifts').send(body),
      post('/api/cash/shifts').send(body),
    ]);
    expect(replies.map((r) => r.status)).toEqual([201, 201]);
    const first = replies[0].body as Shift;
    expect((replies[1].body as Shift).shiftId).toBe(first.shiftId);
    expect(first.requestHash).toBeUndefined();
    await post('/api/cash/shifts')
      .send({ ...body, openingAmount: '11.00' })
      .expect(409);
    await post('/api/cash/shifts', 'OTHER').send(openBody()).expect(409);
    await post('/api/cash/shifts').send(openBody()).expect(409);
    await request(app.getHttpServer())
      .patch('/api/cash/registers/' + registerId)
      .set('Cookie', cookies.ADMIN)
      .set('Origin', 'http://localhost:3000')
      .send({ name: marker, isActive: false })
      .expect(409);
  });
  it('restricts seller reads to own shifts and all writes to the responsible cashier', async () => {
    const shift = await open();
    await get('/api/cash/shifts/' + shift.shiftId, 'OTHER').expect(403);
    await get('/api/cash/shifts/' + shift.shiftId, 'ADMIN').expect(200);
    const page = (await get('/api/cash/shifts', 'OTHER').expect(200)).body as {
      total: number;
    };
    expect(page.total).toBe(0);
    await post('/api/cash/shifts/' + shift.shiftId + '/movements', 'ADMIN')
      .send(movement())
      .expect(403);
    await post('/api/cash/shifts/' + shift.shiftId + '/close', 'ADMIN')
      .send(closeBody())
      .expect(403);
  });
  it('registers cash entries and withdrawals exactly once and prevents overdrafts', async () => {
    const shift = await open();
    const body = movement();
    await Promise.all([
      post('/api/cash/shifts/' + shift.shiftId + '/movements')
        .send(body)
        .expect(201),
      post('/api/cash/shifts/' + shift.shiftId + '/movements')
        .send(body)
        .expect(201),
    ]);
    await post('/api/cash/shifts/' + shift.shiftId + '/movements')
      .send(movement('CASH_IN', '0.20'))
      .expect(201);
    expect((await details(shift.shiftId)).summary.expectedAmount).toBe('10.30');
    await post('/api/cash/shifts/' + shift.shiftId + '/movements')
      .send(movement('CASH_OUT', '10.31'))
      .expect(409);
    await post('/api/cash/shifts/' + shift.shiftId + '/movements')
      .send(movement('CASH_OUT', '0.30'))
      .expect(201);
    await post('/api/cash/shifts/' + shift.shiftId + '/movements')
      .send({ ...body, amount: '0.11' })
      .expect(409);
    expect((await details(shift.shiftId)).summary.expectedAmount).toBe('10.00');
  });
  it('attaches settlements atomically while card and transfer do not increase cash', async () => {
    const shift = await open();
    const id = await sale();
    const cash = settlement('0.10');
    await post('/api/sales/' + id + '/payments')
      .send(cash)
      .expect(201);
    await post('/api/sales/' + id + '/payments')
      .send(cash)
      .expect(201);
    await post('/api/sales/' + id + '/payments')
      .send({ ...settlement('0.20', 'CARD'), cashShiftId: shift.shiftId })
      .expect(201);
    await post('/api/sales/' + id + '/payments')
      .send(settlement('0.30', 'TRANSFER'))
      .expect(201);
    const summary = (await details(shift.shiftId)).summary;
    expect(summary.expectedAmount).toBe('10.10');
    expect(summary.netPayments).toEqual({
      CASH: '0.10',
      CARD: '0.20',
      TRANSFER: '0.30',
    });
    expect(
      await db.cashMovement.count({ where: { shiftId: shift.shiftId } }),
    ).toBe(3);
    const response = (await get('/api/sales/' + id)).body as {
      operations: { cashMovement: { shiftId: number } | null }[];
    };
    expect(
      response.operations.every(
        (op) => op.cashMovement?.shiftId === shift.shiftId,
      ),
    ).toBe(true);
    await post('/api/sales/' + id + '/payments', 'OTHER')
      .send({ ...settlement('0.10'), cashShiftId: shift.shiftId })
      .expect(409);
  });
  it('rolls back a sale settlement when ledger persistence fails', async () => {
    const shift = await open();
    const id = await sale();
    const body = settlement('1.00');
    const original = db.catalogWrite.bind(db) as PrismaService['catalogWrite'];
    const spy = jest
      .spyOn(db, 'catalogWrite')
      .mockImplementationOnce(
        (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          original(async (tx) => {
            tx.cashMovement.create = () => {
              throw new Error('Simulated ledger failure');
            };
            return operation(tx);
          }),
      );
    try {
      await post('/api/sales/' + id + '/payments')
        .send(body)
        .expect(500);
    } finally {
      spy.mockRestore();
    }
    expect(await db.saleOperation.count({ where: { saleId: id } })).toBe(0);
    expect(
      await db.cashMovement.count({ where: { shiftId: shift.shiftId } }),
    ).toBe(0);
    await post('/api/sales/' + id + '/payments')
      .send(body)
      .expect(201);
  });
  it('refunds from the ADMIN shift and rolls back when cash is insufficient', async () => {
    const id = await sale();
    await post('/api/sales/' + id + '/payments')
      .send(settlement('10.00'))
      .expect(201);
    await post('/api/sales/' + id + '/cancel', 'ADMIN')
      .send({ requestId: randomUUID(), reason: 'Anulación de prueba' })
      .expect(201);
    const adminBody = { ...openBody(), openingAmount: '0.00' };
    const shift = (
      await post('/api/cash/shifts', 'ADMIN').send(adminBody).expect(201)
    ).body as Shift;
    const refund = { ...settlement('10.00'), cashShiftId: shift.shiftId };
    await post('/api/sales/' + id + '/refunds', 'ADMIN')
      .send(refund)
      .expect(409);
    expect(
      await db.saleOperation.count({ where: { saleId: id, kind: 'REFUND' } }),
    ).toBe(0);
    await post('/api/cash/shifts/' + shift.shiftId + '/movements', 'ADMIN')
      .send(movement('CASH_IN', '10.00'))
      .expect(201);
    await post('/api/sales/' + id + '/refunds', 'ADMIN')
      .send(refund)
      .expect(201);
    expect((await details(shift.shiftId, 'ADMIN')).summary.expectedAmount).toBe(
      '0.00',
    );
  });
  it('rejects stale closures, stores negative differences and preserves retries after closing', async () => {
    const shift = await open();
    const move = movement();
    await post('/api/cash/shifts/' + shift.shiftId + '/movements')
      .send(move)
      .expect(201);
    const close = closeBody();
    await post('/api/cash/shifts/' + shift.shiftId + '/close')
      .send(close)
      .expect(409);
    close.expectedLastMovementId = (
      await details(shift.shiftId)
    ).summary.lastMovementId;
    const closed = (
      await post('/api/cash/shifts/' + shift.shiftId + '/close')
        .send(close)
        .expect(201)
    ).body as Shift;
    expect(closed.difference).toBe('-0.10');
    expect(closed.closedAt).toBeTruthy();
    await post('/api/cash/shifts/' + shift.shiftId + '/close')
      .send(close)
      .expect(201);
    await post('/api/cash/shifts/' + shift.shiftId + '/movements')
      .send(move)
      .expect(201);
    await post('/api/cash/shifts/' + shift.shiftId + '/movements')
      .send(movement())
      .expect(409);
    const id = await sale();
    await post('/api/sales/' + id + '/payments')
      .send({ ...settlement('1.00'), cashShiftId: shift.shiftId })
      .expect(409);
    expect(await db.saleOperation.count({ where: { saleId: id } })).toBe(0);
  });
  it('prevents cash overflow and invalid amounts', async () => {
    const shift = (
      await post('/api/cash/shifts')
        .send({ ...openBody(), openingAmount: '9999999999999999.99' })
        .expect(201)
    ).body as Shift;
    await post('/api/cash/shifts/' + shift.shiftId + '/movements')
      .send(movement())
      .expect(409);
    await post('/api/cash/shifts/' + shift.shiftId + '/movements')
      .send(movement('CASH_IN', '0.00'))
      .expect(409);
    await post('/api/cash/shifts/' + shift.shiftId + '/movements')
      .send(movement('PAYMENT'))
      .expect(400);
  });
  it('alerts on available stock, releases expired reservations and omits internal costs', async () => {
    const order = await db.order.create({
      data: {
        requestId: randomUUID(),
        requestHash: 'fixture',
        userId: users.CUSTOMER,
        customerId,
        customerName: 'Fixture',
        total: '20.00',
        expiresAt: new Date(Date.now() + 60000),
        items: {
          create: {
            productId,
            productName: marker,
            sku: marker,
            quantity: 20,
            unitPrice: '1.00',
            subtotal: '20.00',
          },
        },
      },
    });
    const result = await alerts();
    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      productId,
      availableQuantity: 0,
      reservedQuantity: 20,
      severity: 'OUT_OF_STOCK',
      suggestedQuantity: 6,
    });
    expect(result.data[0].cost).toBeUndefined();
    expect((await alerts('&severity=LOW_STOCK')).total).toBe(0);
    await db.order.update({
      where: { orderId: order.orderId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await alerts()).total).toBe(0);
  });
  it('counts low stock at the threshold, updates after replenishment, and excludes inactive parents', async () => {
    await db.inventory.update({ where: { productId }, data: { quantity: 5 } });
    expect((await alerts('&severity=LOW_STOCK')).data[0]).toMatchObject({
      severity: 'LOW_STOCK',
      suggestedQuantity: 1,
    });
    await db.category.update({
      where: { categoryId },
      data: { isActive: false },
    });
    expect((await alerts()).total).toBe(0);
    await db.category.update({
      where: { categoryId },
      data: { isActive: true },
    });
    await post('/api/products/' + productId + '/inventory/movements', 'ADMIN')
      .send({ type: 'ENTRY', quantity: 1, reason: 'Reposición de prueba' })
      .expect(201);
    expect((await alerts()).total).toBe(0);
  });
  it('paginates alerts and rejects invalid filters without interpreting wildcard search', async () => {
    await db.inventory.update({ where: { productId }, data: { quantity: 0 } });
    expect((await alerts('&page=2&limit=1')).data).toEqual([]);
    expect((await alerts('&page=2&limit=1')).total).toBe(1);
    const literal = (await get('/api/inventory/alerts?search=%25').expect(200))
      .body as Alerts;
    expect(literal.total).toBe(0);
    await get('/api/inventory/alerts?severity=UNKNOWN').expect(400);
    await get('/api/inventory/alerts?limit=101').expect(400);
    await expect(
      db.cashShift.create({
        data: {
          registerId,
          userId: users.SELLER,
          userName: 'SELLER',
          requestId: randomUUID(),
          requestHash: 'invalid',
          openingAmount: new Prisma.Decimal('-0.01'),
        },
      }),
    ).rejects.toThrow();
  });
});
