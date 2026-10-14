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
const prefix = `chart-${randomUUID()}`;
const period = '?from=2002-01-31T00:00:00-04:00&to=2002-02-03T00:00:00-04:00';
type SaleResponse = {
  saleId: number;
  items: { saleItemId: number; productId: number }[];
};
type SeriesResponse = {
  items: { date: string; saleCount: number; adjustedTotal: string }[];
};
type SellersResponse = {
  total: number;
  items: {
    userId: number;
    sellerName: string;
    saleCount: number;
    adjustedTotal: string;
  }[];
};
type MethodsResponse = {
  items: { method: string; paymentCount: number; amount: string }[];
};

describe('Report charts (real HTTP and PostgreSQL)', () => {
  let app: INestApplication<App>, db: PrismaService;
  let categoryId: number,
    subCategoryId: number,
    cheapId: number,
    expensiveId: number,
    customerId: number;
  const cookies = {} as Record<Role, string>;
  const users = {} as Record<Role, number>;
  const sales: SaleResponse[] = [];
  const get = (path: string, role: Role = Role.ADMIN) =>
    request(app.getHttpServer())
      .get(`/api/reports/${path}`)
      .set('Cookie', cookies[role]);
  const post = (path: string, role: Role = Role.SELLER) =>
    request(app.getHttpServer())
      .post(`/api/${path}`)
      .set('Cookie', cookies[role])
      .set('Origin', origin);
  const makeSale = async (
    items: { productId: number; quantity: number; expectedUnitPrice: string }[],
    date: string,
  ) => {
    const response = await post('sales')
      .send({ requestId: randomUUID(), customerId, items })
      .expect(201);
    const sale = response.body as SaleResponse;
    sales.push(sale);
    await db.sale.update({
      where: { saleId: sale.saleId },
      data: { createdAt: new Date(date) },
    });
    return sale;
  };
  const payment = async (
    sale: SaleResponse,
    amount: string,
    method: string,
    date: string,
  ) => {
    const requestId = randomUUID();
    await post(`sales/${sale.saleId}/payments`)
      .send({ requestId, reason: 'Chart test payment', amount, method })
      .expect(201);
    await db.saleOperation.update({
      where: { requestId },
      data: { createdAt: new Date(date) },
    });
  };
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
          name: role === Role.SELLER ? 'Vendedor anterior' : role,
          email: `${prefix}-${role}@example.test`,
          passwordHash: 'unused-session-fixture',
          role,
        },
      });
      users[role] = user.userId;
      const token = randomBytes(32).toString('hex');
      await db.session.create({
        data: {
          userId: user.userId,
          tokenHash: tokenHash(token),
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
    cheapId = (
      await db.product.create({
        data: {
          name: 'Producto barato',
          sku: `${prefix}-CHEAP`.toUpperCase(),
          subCategoryId,
          cost: '0.01',
          salePrice: '0.10',
          inventory: { create: { quantity: 30, minStock: 5 } },
        },
      })
    ).productId;
    expensiveId = (
      await db.product.create({
        data: {
          name: 'Producto de mayor importe',
          sku: `${prefix}-VALUE`.toUpperCase(),
          subCategoryId,
          cost: '1.00',
          salePrice: '10.00',
          inventory: { create: { quantity: 30, minStock: 5 } },
        },
      })
    ).productId;
    customerId = (
      await db.customer.create({
        data: { name: prefix, userId: users.CUSTOMER },
      })
    ).customerId;
    const a = await makeSale(
      [{ productId: cheapId, quantity: 2, expectedUnitPrice: '0.10' }],
      '2002-01-31T23:59:59-04:00',
    );
    await payment(a, '0.10', 'CASH', '2002-01-31T23:59:59-04:00');
    await payment(a, '0.10', 'CASH', '2002-02-01T00:00:00-04:00');
    await db.user.update({
      where: { userId: users.SELLER },
      data: { name: 'Vendedor actualizado' },
    });
    const b = await makeSale(
      [
        { productId: cheapId, quantity: 1, expectedUnitPrice: '0.10' },
        { productId: expensiveId, quantity: 1, expectedUnitPrice: '10.00' },
      ],
      '2002-02-01T00:00:00-04:00',
    );
    await payment(b, '10.10', 'CARD', '2002-02-01T12:00:00-04:00');
    const cheapLine = b.items.find((item) => item.productId === cheapId);
    if (!cheapLine) throw new Error('Missing cheap sale item in fixture');
    await post(`sales/${b.saleId}/returns`, Role.ADMIN)
      .send({
        requestId: randomUUID(),
        reason: 'Later return changes historical net sales',
        items: [{ saleItemId: cheapLine.saleItemId, quantity: 1 }],
      })
      .expect(201);
    const c = await makeSale(
      [{ productId: cheapId, quantity: 3, expectedUnitPrice: '0.10' }],
      '2002-02-02T10:00:00-04:00',
    );
    await payment(c, '0.30', 'TRANSFER', '2002-02-02T23:59:59-04:00');
    await post(`sales/${c.saleId}/cancel`, Role.ADMIN)
      .send({ requestId: randomUUID(), reason: 'Later cancellation' })
      .expect(201);
    await post(`sales/${c.saleId}/refunds`, Role.ADMIN)
      .send({
        requestId: randomUUID(),
        reason: 'Later refund',
        amount: '0.30',
        method: 'CASH',
      })
      .expect(201);
    const excluded = await makeSale(
      [{ productId: expensiveId, quantity: 1, expectedUnitPrice: '10.00' }],
      '2002-02-03T00:00:00-04:00',
    );
    await payment(excluded, '10.00', 'TRANSFER', '2002-02-03T00:00:00-04:00');
  });
  afterAll(async () => {
    if (!db) return;
    const saleIds = sales.map((sale) => sale.saleId);
    await db.stockMovement.deleteMany({
      where: { product: { subCategoryId } },
    });
    await db.orderItem.deleteMany({ where: { order: { customerId } } });
    await db.order.deleteMany({ where: { customerId } });
    await db.saleOperationItem.deleteMany({
      where: { operation: { saleId: { in: saleIds } } },
    });
    await db.saleOperation.deleteMany({ where: { saleId: { in: saleIds } } });
    await db.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
    await db.sale.deleteMany({ where: { saleId: { in: saleIds } } });
    await db.product.deleteMany({ where: { subCategoryId } });
    await db.subCategory.delete({ where: { subCategoryId } });
    await db.category.delete({ where: { categoryId } });
    await db.customer.delete({ where: { customerId } });
    await db.user.deleteMany({
      where: { userId: { in: Object.values(users) } },
    });
    await app.close();
  });
  it('protects every new report with persisted sessions and ADMIN permissions', async () => {
    for (const path of [
      `sales-series${period}`,
      `sellers${period}`,
      `payment-methods${period}`,
    ]) {
      await request(app.getHttpServer())
        .get(`/api/reports/${path}`)
        .expect(401);
      await get(path, Role.SELLER).expect(403);
      await get(path, Role.CUSTOMER).expect(403);
      await get(path).expect(200);
    }
  });
  it('groups daily sales at Bolivia midnight, excludes the upper bound and incorporates later reversals', async () => {
    const body = (await get(`sales-series${period}`).expect(200))
      .body as SeriesResponse;
    expect(body.items).toEqual([
      {
        date: '2002-01-31',
        saleCount: 1,
        originalTotal: '0.20',
        adjustedTotal: '0.20',
      },
      {
        date: '2002-02-01',
        saleCount: 1,
        originalTotal: '10.10',
        adjustedTotal: '10.00',
      },
      {
        date: '2002-02-02',
        saleCount: 1,
        originalTotal: '0.30',
        adjustedTotal: '0.00',
      },
    ]);
    const summary = (await get(`sales${period}`)).body as {
      adjustedTotal: string;
    };
    expect(summary.adjustedTotal).toBe('10.20');
  });
  it('groups months by local sale date rather than UTC date', async () => {
    const body = (await get(`sales-series${period}&group=MONTH`).expect(200))
      .body as SeriesResponse;
    expect(
      body.items.map((item) => [item.date, item.saleCount, item.adjustedTotal]),
    ).toEqual([
      ['2002-01-01', 1, '0.20'],
      ['2002-02-01', 2, '10.00'],
    ]);
  });
  it('fills days without sales with exact zero values and accepts an empty report', async () => {
    const body = (
      await get(
        'sales-series?from=2003-01-01T00:00:00-04:00&to=2003-01-04T00:00:00-04:00',
      ).expect(200)
    ).body as SeriesResponse;
    expect(body.items).toHaveLength(3);
    expect(
      body.items.every(
        (item) => item.saleCount === 0 && item.adjustedTotal === '0.00',
      ),
    ).toBe(true);
    const emptySellers = (
      await get('sellers?from=2003-01-01T00:00:00Z&to=2003-01-02T00:00:00Z')
    ).body as SellersResponse;
    expect(emptySellers.items).toEqual([]);
    const methods = (
      await get(
        'payment-methods?from=2003-01-01T00:00:00Z&to=2003-01-02T00:00:00Z',
      )
    ).body as MethodsResponse;
    expect(methods.items).toHaveLength(3);
    expect(
      methods.items.every(
        (item) => item.amount === '0.00' && item.paymentCount === 0,
      ),
    ).toBe(true);
  });
  it('ranks products globally by the requested metric, subtracting returns and cancellations', async () => {
    const units = (await get(`top-products${period}`).expect(200)).body as {
      items: { productId: number; quantity: string; netTotal: string }[];
    };
    expect(units.items.map((item) => item.productId)).toEqual([
      cheapId,
      expensiveId,
    ]);
    expect(units.items[0]).toMatchObject({ quantity: '2', netTotal: '0.20' });
    const amount = (
      await get(`top-products${period}&metric=AMOUNT`).expect(200)
    ).body as typeof units;
    expect(amount.items.map((item) => item.productId)).toEqual([
      expensiveId,
      cheapId,
    ]);
    expect(amount.items[0].netTotal).toBe('10.00');
  });
  it('groups sellers by identity after a rename and uses the latest historical name', async () => {
    const body = (await get(`sellers${period}`).expect(200))
      .body as SellersResponse;
    expect(body.total).toBe(1);
    expect(body.items).toEqual([
      {
        userId: users.SELLER,
        sellerName: 'Vendedor actualizado',
        saleCount: 3,
        originalTotal: '10.60',
        adjustedTotal: '10.20',
      },
    ]);
  });
  it('counts gross receipts by operation date, including an older sale and excluding refunds', async () => {
    const body = (
      await get(
        'payment-methods?from=2002-02-01T00:00:00-04:00&to=2002-02-03T00:00:00-04:00',
      ).expect(200)
    ).body as MethodsResponse;
    expect(body.items).toEqual([
      { method: 'CARD', paymentCount: 1, amount: '10.10' },
      { method: 'CASH', paymentCount: 1, amount: '0.10' },
      { method: 'TRANSFER', paymentCount: 1, amount: '0.30' },
    ]);
  });
  it('rejects invalid grouping, ranking, impossible dates, excess periods and unexpected fields', async () => {
    await get(`sales-series${period}&group=YEAR`).expect(400);
    await get(`top-products${period}&metric=COST`).expect(400);
    await get(`sellers${period}&group=DAY`).expect(400);
    for (const endpoint of ['sales-series', 'sellers', 'payment-methods']) {
      await get(
        `${endpoint}?from=2026-02-30T00:00:00Z&to=2026-03-03T00:00:00Z`,
      ).expect(400);
      await get(
        `${endpoint}?from=2024-01-01T00:00:00Z&to=2026-01-01T00:00:00Z`,
      ).expect(400);
      await get(`${endpoint}?from=2002-01-01&to=2002-01-02`).expect(400);
    }
  });
  it('preserves exact cents beyond the JavaScript safe integer range', async () => {
    const huge = await db.product.create({
      data: {
        name: prefix,
        sku: `${prefix}-HUGE`.toUpperCase(),
        subCategoryId,
        cost: '1.00',
        salePrice: '90071992547409.93',
        inventory: { create: { quantity: 2 } },
      },
    });
    const largeSale = await makeSale(
      [
        {
          productId: huge.productId,
          quantity: 1,
          expectedUnitPrice: '90071992547409.93',
        },
      ],
      '2004-01-01T12:00:00-04:00',
    );
    await payment(
      largeSale,
      '90071992547409.93',
      'CASH',
      '2004-01-01T12:00:00-04:00',
    );
    const query =
      '?from=2004-01-01T00:00:00-04:00&to=2004-01-02T00:00:00-04:00';
    const largeSeries = (await get(`sales-series${query}`).expect(200))
      .body as SeriesResponse;
    const largeSellers = (await get(`sellers${query}`).expect(200))
      .body as SellersResponse;
    expect(largeSeries.items[0].adjustedTotal).toBe('90071992547409.93');
    expect(largeSellers.items[0].adjustedTotal).toBe('90071992547409.93');
    const receipts = (await get(`payment-methods${query}`).expect(200))
      .body as MethodsResponse;
    expect(receipts.items.find((item) => item.method === 'CASH')?.amount).toBe(
      '90071992547409.93',
    );
  });
  it('reports only current pending unexpired reservations without mutating business data', async () => {
    await db.inventory.update({
      where: { productId: cheapId },
      data: { quantity: 2, minStock: 5 },
    });
    for (const expired of [false, true])
      await db.order.create({
        data: {
          userId: users.CUSTOMER,
          customerId,
          customerName: prefix,
          requestId: randomUUID(),
          requestHash: 'read-only-reservation-fixture',
          total: '0.10',
          expiresAt: new Date(Date.now() + (expired ? -60000 : 600000)),
          items: {
            create: {
              productId: cheapId,
              productName: 'Cheap',
              sku: prefix,
              quantity: 1,
              unitPrice: '0.10',
              subtotal: '0.10',
            },
          },
        },
      });
    const snapshot = async () =>
      JSON.stringify(
        await Promise.all([
          db.inventory.findMany({
            where: { product: { subCategoryId } },
            orderBy: { productId: 'asc' },
          }),
          db.stockMovement.count(),
          db.saleOperation.count(),
        ]),
      );
    const before = await snapshot();
    const body = (await get('low-stock?limit=100').expect(200)).body as {
      items: {
        productId: number;
        reservedQuantity: number;
        availableQuantity: number;
      }[];
    };
    expect(body.items.find((item) => item.productId === cheapId)).toMatchObject(
      { reservedQuantity: 1, availableQuantity: 1 },
    );
    for (const endpoint of ['sales-series', 'sellers', 'payment-methods'])
      await get(`${endpoint}${period}`).expect(200);
    expect(await snapshot()).toBe(before);
  });
});
