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
import { OrdersService } from '../src/orders/services/orders.service';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Dedicated TEST_DATABASE_URL required');
process.env.DATABASE_URL = url;
const origin = 'http://localhost:3000';
type Actor = 'ADMIN' | 'SELLER' | 'CUSTOMER' | 'OTHER';
type OrderResponse = {
  orderId: number;
  status: string;
  total: string;
  requestId: string;
  sale: {
    saleId: number;
    status: string;
    balanceDue: string;
    refundDue: string;
  } | null;
};

describe('Customer pickup orders and reservations (PostgreSQL)', () => {
  let app: INestApplication<App>, db: PrismaService;
  let categoryId: number, subCategoryId: number, productId: number;
  const prefix = `orders-${randomUUID()}`;
  const cookies = {} as Record<Actor, string>;
  const users = {} as Record<Actor, number>;
  const customers = {} as Record<'CUSTOMER' | 'OTHER', number>;
  const boot = async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
  };
  const get = (path: string, actor: Actor = 'CUSTOMER') =>
    request(app.getHttpServer()).get(path).set('Cookie', cookies[actor]);
  const post = (path: string, actor: Actor = 'CUSTOMER') =>
    request(app.getHttpServer())
      .post(path)
      .set('Cookie', cookies[actor])
      .set('Origin', origin);
  const payload = (quantity = 3) => ({
    requestId: randomUUID(),
    items: [{ productId, quantity, expectedUnitPrice: '0.10' }],
  });
  const create = async (
    quantity = 3,
    actor: Actor = 'CUSTOMER',
  ): Promise<OrderResponse> =>
    (await post('/api/orders', actor).send(payload(quantity)).expect(201))
      .body as OrderResponse;
  const actionBody = () => ({
    requestId: randomUUID(),
    reason: 'Operación de prueba de pedidos',
  });
  const act = (
    orderId: number,
    path: string,
    actor: Actor = 'SELLER',
    body = actionBody(),
  ) => post(`/api/orders/${orderId}/${path}`, actor).send(body);
  const confirm = async (orderId: number): Promise<OrderResponse> =>
    (await act(orderId, 'confirm').expect(200)).body as OrderResponse;
  const inventory = async () =>
    (await get(`/api/products/${productId}/inventory`, 'ADMIN').expect(200))
      .body as {
      quantity: number;
      reservedQuantity: number;
      availableQuantity: number;
    };
  const payment = (saleId: number, amount: string) =>
    post(`/api/sales/${saleId}/payments`, 'SELLER').send({
      ...actionBody(),
      amount,
      method: 'CASH',
    });
  const counterSale = (quantity: number) =>
    post('/api/sales', 'SELLER').send({
      ...payload(quantity),
      customerId: customers.CUSTOMER,
    });

  beforeAll(async () => {
    await boot();
    for (const actor of ['ADMIN', 'SELLER', 'CUSTOMER', 'OTHER'] as const) {
      const role = actor === 'OTHER' ? Role.CUSTOMER : Role[actor];
      const user = await db.user.create({
        data: {
          name: actor,
          email: `${prefix}-${actor}@example.test`,
          passwordHash: 'unused-fixture',
          role,
          ...(role === Role.CUSTOMER
            ? {
                customer: {
                  create: { name: `${actor} original`, document: 'ORIGINAL' },
                },
              }
            : {}),
        },
      });
      users[actor] = user.userId;
      if (actor === 'CUSTOMER' || actor === 'OTHER')
        customers[actor] = (
          await db.customer.findUniqueOrThrow({
            where: { userId: user.userId },
          })
        ).customerId;
      const token = randomBytes(32).toString('hex');
      await db.session.create({
        data: {
          userId: user.userId,
          tokenHash: tokenHash(token),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      cookies[actor] = `tienda_session=${token}`;
    }
  });
  beforeEach(async () => {
    await db.customer.update({
      where: { customerId: customers.CUSTOMER },
      data: { isActive: true, name: 'CUSTOMER original', document: 'ORIGINAL' },
    });
    await db.user.update({
      where: { userId: users.CUSTOMER },
      data: { isActive: true },
    });
    const name = `case-${randomUUID()}`;
    categoryId = (
      await db.category.create({ data: { name, normalizedName: name } })
    ).categoryId;
    subCategoryId = (
      await db.subCategory.create({
        data: { name, normalizedName: name, categoryId },
      })
    ).subCategoryId;
    productId = (
      await db.product.create({
        data: {
          subCategoryId,
          name: 'Original product',
          sku: name.toUpperCase(),
          cost: '0.01',
          salePrice: '0.10',
          inventory: { create: { quantity: 5, minStock: 1 } },
        },
      })
    ).productId;
  });
  afterEach(async () => {
    const orders = await db.order.findMany({
      where: { items: { some: { product: { subCategoryId } } } },
      select: { orderId: true },
    });
    const orderIds = orders.map((o) => o.orderId);
    const sales = await db.sale.findMany({
      where: { items: { some: { product: { subCategoryId } } } },
      select: { saleId: true },
    });
    const saleIds = sales.map((s) => s.saleId);
    await db.stockMovement.deleteMany({
      where: { product: { subCategoryId } },
    });
    await db.orderOperation.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.order.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.saleOperationItem.deleteMany({
      where: { operation: { saleId: { in: saleIds } } },
    });
    await db.saleOperation.deleteMany({ where: { saleId: { in: saleIds } } });
    await db.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
    await db.sale.deleteMany({ where: { saleId: { in: saleIds } } });
    await db.product.deleteMany({ where: { subCategoryId } });
    await db.subCategory.delete({ where: { subCategoryId } });
    await db.category.delete({ where: { categoryId } });
  });
  afterAll(async () => {
    if (!db) return;
    await db.customer.deleteMany({
      where: { userId: { in: Object.values(users) } },
    });
    await db.user.deleteMany({
      where: { userId: { in: Object.values(users) } },
    });
    await app.close();
  });

  it('requires a session, restricts checkout to CUSTOMER and protects staff actions', async () => {
    await request(app.getHttpServer()).get('/api/orders').expect(401);
    for (const actor of ['ADMIN', 'SELLER'] as const)
      await post('/api/orders', actor).send(payload()).expect(403);
    await request(app.getHttpServer())
      .post('/api/orders')
      .set('Cookie', cookies.CUSTOMER)
      .send(payload())
      .expect(403);
    const order = await create();
    for (const path of ['confirm', 'ready', 'complete'])
      await act(order.orderId, path, 'CUSTOMER').expect(403);
    await get(`/api/orders/${order.orderId}`, 'ADMIN').expect(200);
    await get(`/api/orders/${order.orderId}`, 'SELLER').expect(200);
  });

  it('scopes lists, detail and cancellation to the owner without exposing internal data', async () => {
    const own = await create(1);
    await create(1, 'OTHER');
    const list = await get('/api/orders').expect(200);
    expect(list.body).toMatchObject({
      total: 1,
      items: [{ orderId: own.orderId }],
    });
    expect((await get('/api/orders', 'ADMIN').expect(200)).body).toHaveProperty(
      'total',
      2,
    );
    await get(`/api/orders/${own.orderId}`, 'OTHER').expect(404);
    await act(own.orderId, 'cancel', 'OTHER').expect(404);
    const detail = await get(`/api/orders/${own.orderId}`).expect(200);
    for (const field of ['requestHash', 'userId', 'operations', 'items.0.cost'])
      expect(detail.body).not.toHaveProperty(field);
    await get('/api/orders?userId=1').expect(400);
    await get('/api/orders?limit=101').expect(400);
    await get('/api/orders?status=INVALID').expect(400);
  });

  it('reserves stock without changing physical quantity or generating a sale/movement', async () => {
    const order = await create();
    expect(order).toMatchObject({
      status: 'PENDING',
      total: '0.30',
      sale: null,
    });
    expect(await inventory()).toMatchObject({
      quantity: 5,
      reservedQuantity: 3,
      availableQuantity: 2,
    });
    expect(await db.stockMovement.count({ where: { productId } })).toBe(0);
    expect(
      await db.sale.count({ where: { items: { some: { productId } } } }),
    ).toBe(0);
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/shop/products/${productId}`)
          .expect(200)
      ).body,
    ).toMatchObject({ quantity: 5, availableQuantity: 2 });
    const detail = await get('/api/products/' + productId, 'SELLER').expect(
      200,
    );
    expect(detail.body).toMatchObject({
      quantity: 5,
      reservedQuantity: 3,
      availableQuantity: 2,
    });
    const list = await get('/api/products?limit=100', 'SELLER').expect(200);
    expect(
      (
        list.body as {
          items: {
            productId: number;
            reservedQuantity: number;
            availableQuantity: number;
          }[];
        }
      ).items.find((item) => item.productId === productId),
    ).toMatchObject({ reservedQuantity: 3, availableQuantity: 2 });
  });

  it('rejects injected identities, stale prices, duplicate items and unavailable products', async () => {
    for (const extra of [
      { customerId: customers.OTHER },
      { userId: users.OTHER },
      { total: '0.01' },
      { fulfillment: 'DELIVERY' },
    ])
      await post('/api/orders')
        .send({ ...payload(), ...extra })
        .expect(400);
    await post('/api/orders')
      .send({
        ...payload(),
        items: [{ productId, quantity: 1, expectedUnitPrice: '0.11' }],
      })
      .expect(409);
    const duplicate = payload(1);
    duplicate.items.push({ ...duplicate.items[0] });
    await post('/api/orders').send(duplicate).expect(400);
    await post('/api/orders').send(payload(6)).expect(409);
    await post('/api/orders').send(payload(0)).expect(400);
    await post('/api/orders')
      .send({
        ...payload(),
        items: [
          { productId: 2147483647, quantity: 1, expectedUnitPrice: '0.10' },
        ],
      })
      .expect(404);
    expect(
      await db.order.count({ where: { items: { some: { productId } } } }),
    ).toBe(0);
    expect(await inventory()).toMatchObject({
      quantity: 5,
      reservedQuantity: 0,
    });
  });

  it('rolls back a multi-product checkout failure without partial reservations', async () => {
    const missingStock = await db.product.create({
      data: {
        subCategoryId,
        name: 'No stock',
        sku: `EMPTY-${randomUUID()}`.toUpperCase(),
        cost: '0',
        salePrice: '0.10',
        inventory: { create: {} },
      },
    });
    const input = payload();
    input.items.push({
      productId: missingStock.productId,
      quantity: 1,
      expectedUnitPrice: '0.10',
    });
    await post('/api/orders').send(input).expect(409);
    expect(await db.orderItem.count({ where: { productId } })).toBe(0);
    expect(await inventory()).toMatchObject({
      quantity: 5,
      reservedQuantity: 0,
    });
  });

  it('makes concurrent identical checkout retries idempotent and rejects UUID reuse by another user or payload', async () => {
    const input = payload();
    const responses = await Promise.all([
      post('/api/orders').send(input),
      post('/api/orders').send(input),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const first = responses[0].body as OrderResponse;
    expect(responses[1].body).toHaveProperty('orderId', first.orderId);
    await post('/api/orders', 'OTHER').send(input).expect(409);
    await post('/api/orders')
      .send({ ...input, items: [{ ...input.items[0], quantity: 2 }] })
      .expect(409);
    expect(
      await db.order.count({ where: { items: { some: { productId } } } }),
    ).toBe(1);
    expect(await inventory()).toMatchObject({
      quantity: 5,
      reservedQuantity: 3,
    });
  });

  it('serializes competing orders so only one can reserve the last units', async () => {
    const responses = await Promise.all([
      post('/api/orders').send(payload(4)),
      post('/api/orders', 'OTHER').send(payload(4)),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await inventory()).toMatchObject({
      quantity: 5,
      reservedQuantity: 4,
      availableQuantity: 1,
    });
  });

  it('serializes an order racing a counter sale without overselling', async () => {
    const responses = await Promise.all([
      post('/api/orders').send(payload(4)),
      counterSale(4),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await inventory()).availableQuantity).toBe(1);
    const orderCount = await db.order.count({
      where: { items: { some: { productId } } },
    });
    const saleCount = await db.sale.count({
      where: { items: { some: { productId } } },
    });
    expect(orderCount + saleCount).toBe(1);
  });

  it('protects reservations against counter sales, inventory exits and counted adjustments', async () => {
    await create();
    await counterSale(3).expect(409);
    for (const body of [
      { type: 'EXIT', quantity: 3 },
      { type: 'ADJUSTMENT', quantity: 2, expectedQuantity: 5 },
    ])
      await post(`/api/products/${productId}/inventory/movements`, 'ADMIN')
        .send({ ...body, reason: 'Reserva protegida' })
        .expect(409);
    expect(await inventory()).toMatchObject({
      quantity: 5,
      reservedQuantity: 3,
    });
    await counterSale(2).expect(201);
    expect(await inventory()).toMatchObject({
      quantity: 3,
      reservedQuantity: 3,
      availableQuantity: 0,
    });
  });

  it('confirms once at the original price and preserves customer/product snapshots', async () => {
    const order = await create();
    const old = await db.product.findUniqueOrThrow({ where: { productId } });
    await db.product.update({
      where: { productId },
      data: {
        name: 'New name',
        sku: `NEW-${randomUUID()}`.toUpperCase(),
        salePrice: '0.99',
      },
    });
    await db.customer.update({
      where: { customerId: customers.CUSTOMER },
      data: { name: 'New customer', document: 'NEW' },
    });
    const body = actionBody();
    const results = await Promise.all([
      act(order.orderId, 'confirm', 'SELLER', body),
      act(order.orderId, 'confirm', 'SELLER', body),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const confirmed = results[0].body as OrderResponse;
    expect(confirmed).toMatchObject({
      status: 'CONFIRMED',
      total: '0.30',
      sale: { balanceDue: '0.30' },
    });
    expect(results[1].body).toHaveProperty(
      'sale.saleId',
      confirmed.sale!.saleId,
    );
    const sale = await get(
      `/api/sales/${confirmed.sale!.saleId}`,
      'ADMIN',
    ).expect(200);
    expect(sale.body).toMatchObject({
      total: '0.30',
      customerName: 'CUSTOMER original',
      customerDocument: 'ORIGINAL',
      items: [
        {
          productName: 'Original product',
          sku: old.sku,
          unitPrice: '0.10',
          subtotal: '0.30',
        },
      ],
    });
    expect(await db.stockMovement.count({ where: { productId } })).toBe(1);
    expect(
      await db.orderOperation.count({ where: { orderId: order.orderId } }),
    ).toBe(1);
    expect(await inventory()).toMatchObject({
      quantity: 2,
      reservedQuantity: 0,
      availableQuantity: 2,
    });
    await act(order.orderId, 'confirm', 'ADMIN', body).expect(409);
    await act(order.orderId, 'ready', 'SELLER', body).expect(409);
    await act(order.orderId, 'confirm').expect(409);
    await get(`/api/sales/${confirmed.sale!.saleId}`).expect(403);
  });

  it('requires readiness and full manual payment before completing pickup', async () => {
    const order = await create();
    const confirmed = await confirm(order.orderId);
    await act(order.orderId, 'complete').expect(409);
    await act(order.orderId, 'ready').expect(200);
    await act(order.orderId, 'complete').expect(409);
    await payment(confirmed.sale!.saleId, '0.10').expect(201);
    await act(order.orderId, 'complete').expect(409);
    await payment(confirmed.sale!.saleId, '0.20').expect(201);
    const body = actionBody();
    await act(order.orderId, 'complete', 'SELLER', body).expect(200);
    await act(order.orderId, 'complete', 'SELLER', body).expect(200);
    const response = await get(`/api/orders/${order.orderId}`).expect(200);
    expect(response.body).toMatchObject({
      status: 'COMPLETED',
      sale: { balanceDue: '0.00', paid: '0.30' },
    });
    expect(response.body).not.toHaveProperty('operations');
    expect(response.body).not.toHaveProperty('sale.operations');
    expect(
      await db.orderOperation.count({ where: { orderId: order.orderId } }),
    ).toBe(3);
    expect(await inventory()).toMatchObject({
      quantity: 2,
      reservedQuantity: 0,
    });
  });

  it('cancels a pending order idempotently and releases units without inventing stock movements', async () => {
    const order = await create();
    const body = actionBody();
    await act(order.orderId, 'cancel', 'CUSTOMER', body).expect(200);
    await act(order.orderId, 'cancel', 'CUSTOMER', body).expect(200);
    await act(order.orderId, 'confirm').expect(409);
    expect(await inventory()).toMatchObject({
      quantity: 5,
      reservedQuantity: 0,
      availableQuantity: 5,
    });
    expect(await db.stockMovement.count({ where: { productId } })).toBe(0);
    expect(
      (await get('/api/orders?status=CANCELLED').expect(200)).body,
    ).toHaveProperty('total', 1);
  });

  it('releases expired holds immediately even before the expiry worker persists the status', async () => {
    const input = payload();
    const order = (await post('/api/orders').send(input).expect(201))
      .body as OrderResponse;
    await db.order.update({
      where: { orderId: order.orderId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect(await inventory()).toMatchObject({
      quantity: 5,
      reservedQuantity: 0,
      availableQuantity: 5,
    });
    expect(
      (await get(`/api/orders/${order.orderId}`).expect(200)).body,
    ).toHaveProperty('status', 'EXPIRED');
    expect(
      (await get('/api/orders?status=PENDING').expect(200)).body,
    ).toHaveProperty('total', 0);
    expect(
      (await get('/api/orders?status=EXPIRED').expect(200)).body,
    ).toHaveProperty('total', 1);
    await act(order.orderId, 'confirm').expect(409);
    expect(
      (await post('/api/orders').send(input).expect(201)).body,
    ).toHaveProperty('status', 'EXPIRED');
    await create(5, 'OTHER');
    expect(await inventory()).toMatchObject({
      quantity: 5,
      reservedQuantity: 5,
      availableQuantity: 0,
    });
  });

  it('persists expiry on application restart without changing physical stock', async () => {
    const order = await create();
    await db.order.update({
      where: { orderId: order.orderId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await app.close();
    await boot();
    expect(
      (await db.order.findUniqueOrThrow({ where: { orderId: order.orderId } }))
        .status,
    ).toBe('EXPIRED');
    expect(await inventory()).toMatchObject({
      quantity: 5,
      reservedQuantity: 0,
    });
    expect(await db.stockMovement.count({ where: { productId } })).toBe(0);
  });

  it('requires ADMIN sale cancellation after confirmation and does not refund automatically', async () => {
    const order = await create();
    const confirmed = await confirm(order.orderId);
    await payment(confirmed.sale!.saleId, '0.30').expect(201);
    for (const actor of ['CUSTOMER', 'SELLER', 'ADMIN'] as const)
      await act(order.orderId, 'cancel', actor).expect(409);
    await post(`/api/sales/${confirmed.sale!.saleId}/cancel`, 'SELLER')
      .send(actionBody())
      .expect(403);
    await post(`/api/sales/${confirmed.sale!.saleId}/cancel`, 'ADMIN')
      .send(actionBody())
      .expect(201);
    const response = await get(`/api/orders/${order.orderId}`).expect(200);
    expect(response.body).toMatchObject({
      status: 'CANCELLED',
      sale: { status: 'CANCELLED', refundDue: '0.30', refunded: '0.00' },
    });
    expect(await inventory()).toMatchObject({
      quantity: 5,
      reservedQuantity: 0,
    });
  });

  it('rejects confirmation for disabled customer profiles or inactive products without losing the reservation', async () => {
    const order = await create();
    await db.customer.update({
      where: { customerId: customers.CUSTOMER },
      data: { isActive: false },
    });
    await act(order.orderId, 'confirm').expect(409);
    await db.customer.update({
      where: { customerId: customers.CUSTOMER },
      data: { isActive: true },
    });
    await db.product.update({
      where: { productId },
      data: { isActive: false },
    });
    await act(order.orderId, 'confirm').expect(409);
    expect(
      (await get(`/api/orders/${order.orderId}`).expect(200)).body,
    ).toHaveProperty('sale', null);
    expect(await inventory()).toMatchObject({
      quantity: 5,
      reservedQuantity: 3,
    });
    await act(order.orderId, 'cancel', 'ADMIN').expect(200);
    expect(await inventory()).toMatchObject({ reservedQuantity: 0 });
  });

  it('rolls back sale creation, stock and order state if confirmation fails midway', async () => {
    const order = await create();
    // Force the real PostgreSQL stock audit insert to fail after the sale and stock writes.
    await db.$executeRawUnsafe(
      `CREATE FUNCTION orders_test_reject_movement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."productId" = ${productId} THEN RAISE EXCEPTION 'orders rollback fixture'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      'CREATE TRIGGER orders_test_reject_movement BEFORE INSERT ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION orders_test_reject_movement()',
    );
    try {
      await expect(
        app
          .get(OrdersService)
          .transition(order.orderId, 'CONFIRM', actionBody(), users.SELLER),
      ).rejects.toThrow();
      expect(
        (
          await db.order.findUniqueOrThrow({
            where: { orderId: order.orderId },
          })
        ).status,
      ).toBe('PENDING');
      expect(
        await db.sale.count({ where: { items: { some: { productId } } } }),
      ).toBe(0);
      expect(
        await db.orderOperation.count({ where: { orderId: order.orderId } }),
      ).toBe(0);
      expect(await inventory()).toMatchObject({
        quantity: 5,
        reservedQuantity: 3,
      });
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER orders_test_reject_movement ON "StockMovement"',
      );
      await db.$executeRawUnsafe('DROP FUNCTION orders_test_reject_movement()');
    }
    await confirm(order.orderId);
  });

  it('permits pickup of a zero-price order without creating a fictitious payment', async () => {
    await db.product.update({ where: { productId }, data: { salePrice: '0' } });
    const input = payload(1);
    input.items[0].expectedUnitPrice = '0.00';
    const order = (await post('/api/orders').send(input).expect(201))
      .body as OrderResponse;
    const confirmed = await confirm(order.orderId);
    await act(order.orderId, 'ready').expect(200);
    await act(order.orderId, 'complete').expect(200);
    expect(
      await db.saleOperation.count({
        where: { saleId: confirmed.sale!.saleId },
      }),
    ).toBe(0);
  });
});
