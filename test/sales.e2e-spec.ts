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
type SaleResponse = {
  saleId: number;
  total: string;
  userId: number;
  customerName: string;
  items: {
    saleItemId: number;
    productId: number;
    productName: string;
    unitPrice: string;
    subtotal: string;
    quantity: number;
  }[];
};

describe('Customers and sales with transactional stock (PostgreSQL)', () => {
  let app: INestApplication<App>;
  let db: PrismaService;
  let categoryId: number, subCategoryId: number, customerId: number;
  const prefix = `sales-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const cookies = {} as Record<Role, string>;
  const ids = {} as Record<Role, number>;
  const customers: number[] = [];
  let seq = 0;
  const postSale = (body: Record<string, unknown>, role: Role = Role.SELLER) =>
    request(app.getHttpServer())
      .post('/api/sales')
      .set('Origin', origin)
      .set('Cookie', cookies[role])
      .send(body);
  const payload = (productId: number, quantity = 1, price = '12.35') => ({
    requestId: randomUUID(),
    customerId,
    items: [{ productId, quantity, expectedUnitPrice: price }],
  });
  const product = (stock = 10, salePrice = '12.35') =>
    db.product.create({
      data: {
        name: `Producto ${prefix}`,
        sku: `${prefix}-${++seq}`.toUpperCase(),
        subCategoryId,
        cost: '5.10',
        salePrice,
        inventory: { create: { quantity: stock } },
      },
    });
  const quantity = async (productId: number) =>
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
          name: `Usuario ${role}`,
          email: `${prefix}-${role}@example.test`,
          passwordHash: 'unused-session-only-fixture',
          role,
          ...(role === Role.CUSTOMER
            ? { customer: { create: { name: `Registrado ${prefix}` } } }
            : {}),
        },
      });
      ids[role] = user.userId;
      const token = randomBytes(32).toString('hex');
      await db.session.create({
        data: {
          tokenHash: tokenHash(token),
          userId: user.userId,
          expiresAt: new Date(Date.now() + 600000),
        },
      });
      cookies[role] = `tienda_session=${token}`;
      if (role === Role.CUSTOMER)
        customers.push(
          (
            await db.customer.findUniqueOrThrow({
              where: { userId: user.userId },
            })
          ).customerId,
        );
    }
    categoryId = (
      await db.category.create({
        data: { name: prefix, normalizedName: prefix },
      })
    ).categoryId;
    subCategoryId = (
      await db.subCategory.create({
        data: { categoryId, name: prefix, normalizedName: prefix },
      })
    ).subCategoryId;
    const customer = await request(app.getHttpServer())
      .post('/api/customers')
      .set('Origin', origin)
      .set('Cookie', cookies.SELLER)
      .send({
        name: `Cliente ${prefix}`,
        document: `${prefix}-DOC`,
        phone: '70000000',
      })
      .expect(201);
    customerId = (customer.body as { customerId: number }).customerId;
    customers.push(customerId);
  });
  afterAll(async () => {
    if (!db) return;
    await db.stockMovement.deleteMany({
      where: { product: { subCategoryId } },
    });
    await db.saleOperationItem.deleteMany({
      where: { operation: { sale: { userId: { in: Object.values(ids) } } } },
    });
    await db.saleOperation.deleteMany({
      where: { sale: { userId: { in: Object.values(ids) } } },
    });
    await db.saleItem.deleteMany({
      where: { sale: { userId: { in: Object.values(ids) } } },
    });
    await db.sale.deleteMany({ where: { userId: { in: Object.values(ids) } } });
    await db.product.deleteMany({ where: { subCategoryId } });
    await db.subCategory.delete({ where: { subCategoryId } });
    await db.category.delete({ where: { categoryId } });
    await db.customer.deleteMany({ where: { customerId: { in: customers } } });
    await db.user.deleteMany({ where: { userId: { in: Object.values(ids) } } });
    await app.close();
  });
  it('supports customers without accounts, searches registered customers, enforces customer management roles', async () => {
    const found = await request(app.getHttpServer())
      .get('/api/customers')
      .query({ search: `${prefix}-DOC` })
      .set('Cookie', cookies.SELLER)
      .expect(200);
    expect(found.body).toMatchObject({
      total: 1,
      items: [{ customerId, userId: null }],
    });
    const registered = await request(app.getHttpServer())
      .get('/api/customers')
      .query({ search: `Registrado ${prefix}` })
      .set('Cookie', cookies.ADMIN)
      .expect(200);
    expect(registered.body).toMatchObject({
      total: 1,
      items: [{ userId: ids.CUSTOMER }],
    });
    await request(app.getHttpServer()).get('/api/customers').expect(401);
    await request(app.getHttpServer())
      .get('/api/customers')
      .set('Cookie', cookies.CUSTOMER)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/customers')
      .set('Origin', origin)
      .set('Cookie', cookies.CUSTOMER)
      .send({ name: 'Sin permiso' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/customers/${customerId}`)
      .set('Origin', origin)
      .set('Cookie', cookies.SELLER)
      .send({ isActive: false })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/customers/${customerId}`)
      .set('Origin', origin)
      .set('Cookie', cookies.ADMIN)
      .send({ phone: null })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/customers')
      .set('Origin', origin)
      .set('Cookie', cookies.ADMIN)
      .send({ name: 'Invalid', userId: ids.ADMIN })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/customers/${customerId}`)
      .set('Origin', origin)
      .set('Cookie', cookies.ADMIN)
      .send({ name: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/customers/${customerId}`)
      .set('Origin', origin)
      .set('Cookie', cookies.ADMIN)
      .send({ isActive: null })
      .expect(400);
  });
  it('registers exact totals, snapshots and stock movements atomically as a seller', async () => {
    const first = await product(10),
      second = await product(10, '0.10');
    const input = payload(first.productId, 3);
    input.items.push({
      productId: second.productId,
      quantity: 3,
      expectedUnitPrice: '0.10',
    });
    const response = await postSale(input).expect(201);
    const sale = response.body as SaleResponse;
    expect(sale.total).toBe('37.35');
    expect(sale.userId).toBe(ids.SELLER);
    expect(sale.items[0].subtotal).toBe('37.05');
    expect(response.body).not.toHaveProperty('requestHash');
    expect(response.body).not.toHaveProperty('cost');
    expect(await quantity(first.productId)).toBe(7);
    expect(await quantity(second.productId)).toBe(7);
    const movements = await db.stockMovement.findMany({
      where: { saleItemId: { in: sale.items.map((item) => item.saleItemId) } },
    });
    expect(movements).toHaveLength(2);
    expect(movements[0]).toMatchObject({
      userId: ids.SELLER,
      type: 'EXIT',
      quantity: -3,
      previousQuantity: 10,
      resultingQuantity: 7,
    });
    await db.product.update({
      where: { productId: first.productId },
      data: { name: 'Nombre modificado', salePrice: '99.00' },
    });
    await db.customer.update({
      where: { customerId },
      data: { name: 'Cliente modificado' },
    });
    const detail = await request(app.getHttpServer())
      .get(`/api/sales/${sale.saleId}`)
      .set('Cookie', cookies.ADMIN)
      .expect(200);
    expect(detail.body).toMatchObject({
      total: '37.35',
      customerName: `Cliente ${prefix}`,
      items: [
        { productName: `Producto ${prefix}`, unitPrice: '12.35' },
        { unitPrice: '0.10' },
      ],
    });
  });
  it('deduplicates concurrent retries and rejects reuse with a different payload or seller', async () => {
    const item = await product(5);
    const input = payload(item.productId, 2);
    const responses = await Promise.all([postSale(input), postSale(input)]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect((responses[0].body as SaleResponse).saleId).toBe(
      (responses[1].body as SaleResponse).saleId,
    );
    expect(await quantity(item.productId)).toBe(3);
    expect(
      await db.stockMovement.count({ where: { productId: item.productId } }),
    ).toBe(1);
    await postSale({
      ...input,
      items: [
        { productId: item.productId, quantity: 3, expectedUnitPrice: '12.35' },
      ],
    }).expect(409);
    await postSale(input, Role.ADMIN).expect(409);
    await db.customer.update({
      where: { customerId },
      data: { isActive: false },
    });
    await postSale(input).expect(201); // Retry still returns its original recorded sale.
    await db.customer.update({
      where: { customerId },
      data: { isActive: true },
    });
  });
  it('prevents competing sales from overselling', async () => {
    const item = await product(5);
    const results = await Promise.all([
      postSale(payload(item.productId, 4)),
      postSale(payload(item.productId, 4)),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await quantity(item.productId)).toBe(1);
    expect(
      await db.stockMovement.count({ where: { productId: item.productId } }),
    ).toBe(1);
  });
  it('rejects inactive customers/products/parents, stale prices and insufficient stock without partial writes', async () => {
    const first = await product(10),
      second = await product(1);
    const input = payload(first.productId, 3);
    input.items.push({
      productId: second.productId,
      quantity: 2,
      expectedUnitPrice: '12.35',
    });
    await postSale(input).expect(409);
    expect(await quantity(first.productId)).toBe(10);
    expect(await db.sale.count({ where: { requestId: input.requestId } })).toBe(
      0,
    );
    expect(
      await db.stockMovement.count({ where: { productId: first.productId } }),
    ).toBe(0);
    await postSale(payload(first.productId, 1, '12.34')).expect(409);
    await db.customer.update({
      where: { customerId },
      data: { isActive: false },
    });
    await postSale(payload(first.productId)).expect(409);
    await db.customer.update({
      where: { customerId },
      data: { isActive: true },
    });
    await db.product.update({
      where: { productId: first.productId },
      data: { isActive: false },
    });
    await postSale(payload(first.productId)).expect(409);
    await db.product.update({
      where: { productId: first.productId },
      data: { isActive: true },
    });
    await db.category.update({
      where: { categoryId },
      data: { isActive: false },
    });
    await postSale(payload(first.productId)).expect(409);
    await db.category.update({
      where: { categoryId },
      data: { isActive: true },
    });
    expect(await quantity(first.productId)).toBe(10);
  });
  it('rejects invalid/duplicate lines, forged prices and total overflow', async () => {
    const item = await product(10);
    const input = payload(item.productId);
    await postSale({ ...input, items: [] }).expect(400);
    await postSale({
      ...input,
      items: [input.items[0], input.items[0]],
    }).expect(400);
    await postSale({
      ...input,
      items: [{ ...input.items[0], quantity: 0 }],
    }).expect(400);
    await postSale({
      ...input,
      items: [{ ...input.items[0], quantity: 1.5 }],
    }).expect(400);
    await postSale({
      ...input,
      items: [{ ...input.items[0], unitPrice: '0.01' }],
    }).expect(400);
    await postSale({ ...input, total: '0.01' }).expect(400);
    await postSale({ ...input, userId: ids.ADMIN }).expect(400);
    await postSale({ ...input, requestId: 'invalid' }).expect(400);
    const costly = await product(2, '9999999999999999.99');
    await postSale(payload(costly.productId, 2, '9999999999999999.99')).expect(
      400,
    );
    expect(await quantity(costly.productId)).toBe(2);
  });
  it('allows admin sales, filters/paginates recorded snapshots and blocks customer access and mutations', async () => {
    const item = await product(10);
    const response = await postSale(payload(item.productId), Role.ADMIN).expect(
      201,
    );
    const sale = response.body as SaleResponse;
    const listed = await request(app.getHttpServer())
      .get('/api/sales')
      .query({ customerId, search: item.sku.toLowerCase(), limit: 1 })
      .set('Cookie', cookies.SELLER)
      .expect(200);
    expect(listed.body).toMatchObject({
      total: 1,
      items: [{ saleId: sale.saleId }],
    });
    await request(app.getHttpServer()).get('/api/sales').expect(401);
    await request(app.getHttpServer())
      .get('/api/sales')
      .set('Cookie', cookies.CUSTOMER)
      .expect(403);
    await postSale(payload(item.productId), Role.CUSTOMER).expect(403);
    await request(app.getHttpServer())
      .post('/api/sales')
      .set('Cookie', cookies.SELLER)
      .send(payload(item.productId))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/sales/${sale.saleId}`)
      .set('Origin', origin)
      .set('Cookie', cookies.ADMIN)
      .send({ total: '0.00' })
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/sales/2147483647')
      .set('Cookie', cookies.SELLER)
      .expect(404);
  });

  const operation = (
    saleId: number,
    path: string,
    body: Record<string, unknown>,
    role: Role = Role.ADMIN,
  ) =>
    request(app.getHttpServer())
      .post('/api/sales/' + saleId + '/' + path)
      .set('Origin', origin)
      .set('Cookie', cookies[role])
      .send(body);
  const payment = (amount: string) => ({
    requestId: randomUUID(),
    amount,
    method: 'CASH',
    reason: 'Pago en caja',
  });
  it('collects exact partial payments, deduplicates concurrent retries and prevents overpayment', async () => {
    const item = await product();
    const sale = (await postSale(payload(item.productId, 3)).expect(201))
      .body as SaleResponse;
    const input = payment('0.10');
    const responses = await Promise.all([
      operation(sale.saleId, 'payments', input, Role.SELLER),
      operation(sale.saleId, 'payments', input, Role.SELLER),
    ]);
    expect(responses.map((res) => res.status)).toEqual([201, 201]);
    expect(responses[1].body).toMatchObject({
      paid: '0.10',
      balanceDue: '36.95',
      operations: [{ amount: '0.10', kind: 'PAYMENT' }],
    });
    expect(
      (responses[1].body as { operations: unknown[] }).operations[0],
    ).not.toHaveProperty('requestHash');
    await operation(
      sale.saleId,
      'payments',
      { ...input, amount: '0.20' },
      Role.SELLER,
    ).expect(409);
    await operation(sale.saleId, 'payments', input).expect(409);
    const attempts = await Promise.all([
      operation(sale.saleId, 'payments', payment('36.95')),
      operation(sale.saleId, 'payments', payment('36.95')),
    ]);
    expect(attempts.map((res) => res.status).sort()).toEqual([201, 409]);
    await operation(sale.saleId, 'payments', payment('0.01')).expect(409);
    expect(await quantity(item.productId)).toBe(7);
  });
  it('returns products at original prices, restores stock once and records refunds separately', async () => {
    const item = await product();
    const sale = (await postSale(payload(item.productId, 3)).expect(201))
      .body as SaleResponse;
    await operation(
      sale.saleId,
      'payments',
      payment('37.05'),
      Role.SELLER,
    ).expect(201);
    await db.product.update({
      where: { productId: item.productId },
      data: { salePrice: '99.00', isActive: false },
    });
    const input = {
      requestId: randomUUID(),
      reason: 'Devolución de una unidad',
      items: [{ saleItemId: sale.items[0].saleItemId, quantity: 1 }],
    };
    const responses = await Promise.all([
      operation(sale.saleId, 'returns', input),
      operation(sale.saleId, 'returns', input),
    ]);
    expect(responses.map((res) => res.status)).toEqual([201, 201]);
    expect(responses[1].body).toMatchObject({
      status: 'PARTIALLY_RETURNED',
      total: '37.05',
      adjustedTotal: '24.70',
      refundDue: '12.35',
      items: [{ returnedQuantity: 1 }],
    });
    expect(await quantity(item.productId)).toBe(8);
    expect(
      await db.stockMovement.count({
        where: { productId: item.productId, type: 'ENTRY' },
      }),
    ).toBe(1);
    await operation(sale.saleId, 'refunds', payment('12.36')).expect(409);
    const refund = payment('12.35');
    await operation(sale.saleId, 'refunds', refund)
      .expect(201)
      .expect((res) => {
        expect(res.body).toMatchObject({
          refunded: '12.35',
          refundDue: '0.00',
          balanceDue: '0.00',
        });
      });
    await operation(sale.saleId, 'refunds', refund).expect(201);
    await operation(sale.saleId, 'refunds', payment('0.01')).expect(409);
  });
  it('cancels remaining quantities after a partial return, leaves refunds due and rejects repeated new cancellations', async () => {
    const item = await product();
    const sale = (await postSale(payload(item.productId, 3)).expect(201))
      .body as SaleResponse;
    await operation(sale.saleId, 'payments', payment('30.00')).expect(201);
    await operation(sale.saleId, 'returns', {
      requestId: randomUUID(),
      reason: 'Unidad devuelta',
      items: [{ saleItemId: sale.items[0].saleItemId, quantity: 1 }],
    }).expect(201);
    const input = { requestId: randomUUID(), reason: 'Anulación solicitada' };
    const responses = await Promise.all([
      operation(sale.saleId, 'cancel', input),
      operation(sale.saleId, 'cancel', input),
    ]);
    expect(responses.map((res) => res.status)).toEqual([201, 201]);
    expect(responses[1].body).toMatchObject({
      status: 'CANCELLED',
      total: '37.05',
      adjustedTotal: '0.00',
      balanceDue: '0.00',
      refundDue: '30.00',
      items: [{ returnedQuantity: 3 }],
    });
    expect(await quantity(item.productId)).toBe(10);
    await operation(sale.saleId, 'cancel', {
      ...input,
      requestId: randomUUID(),
    }).expect(409);
    await operation(sale.saleId, 'payments', payment('1.00')).expect(409);
    await operation(sale.saleId, 'returns', {
      requestId: randomUUID(),
      reason: 'Más unidades',
      items: [{ saleItemId: sale.items[0].saleItemId, quantity: 1 }],
    }).expect(409);
    await operation(sale.saleId, 'refunds', payment('30.00'))
      .expect(201)
      .expect((res) => {
        expect((res.body as { refundDue: string }).refundDue).toBe('0.00');
      });
  });
  it('prevents concurrent overreturns and rolls back a request containing another sale item', async () => {
    const item = await product();
    const sale = (await postSale(payload(item.productId, 3)).expect(201))
      .body as SaleResponse;
    const other = (await postSale(payload(item.productId, 1)).expect(201))
      .body as SaleResponse;
    await operation(sale.saleId, 'returns', {
      requestId: randomUUID(),
      reason: 'Solicitud inválida',
      items: [
        { saleItemId: sale.items[0].saleItemId, quantity: 1 },
        { saleItemId: other.items[0].saleItemId, quantity: 1 },
      ],
    }).expect(409);
    expect(await quantity(item.productId)).toBe(6);
    const makeReturn = () => ({
      requestId: randomUUID(),
      reason: 'Devolver dos unidades',
      items: [{ saleItemId: sale.items[0].saleItemId, quantity: 2 }],
    });
    const responses = await Promise.all([
      operation(sale.saleId, 'returns', makeReturn()),
      operation(sale.saleId, 'returns', makeReturn()),
    ]);
    expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(await quantity(item.productId)).toBe(8);
    await operation(sale.saleId, 'returns', {
      requestId: randomUUID(),
      reason: 'Última unidad',
      items: [{ saleItemId: sale.items[0].saleItemId, quantity: 1 }],
    })
      .expect(201)
      .expect((res) => {
        expect(res.body).toMatchObject({
          status: 'RETURNED',
          adjustedTotal: '0.00',
          balanceDue: '0.00',
          refundDue: '0.00',
        });
      });
    await operation(sale.saleId, 'payments', payment('1.00')).expect(409);
  });
  it('enforces operation roles, positive money and validated return quantities', async () => {
    const item = await product();
    const sale = (await postSale(payload(item.productId)).expect(201))
      .body as SaleResponse;
    for (const path of ['payments', 'refunds', 'returns', 'cancel']) {
      await operation(sale.saleId, path, payment('1.00'), Role.CUSTOMER).expect(
        403,
      );
      if (path !== 'payments')
        await operation(sale.saleId, path, payment('1.00'), Role.SELLER).expect(
          403,
        );
    }
    for (const amount of ['0.00', '-1.00', '1.001', '1e2'])
      await operation(sale.saleId, 'payments', payment(amount)).expect(400);
    await operation(sale.saleId, 'payments', {
      ...payment('1.00'),
      method: 'UNKNOWN',
    }).expect(400);
    await operation(sale.saleId, 'payments', {
      ...payment('1.00'),
      userId: ids.ADMIN,
    }).expect(400);
    const line = { saleItemId: sale.items[0].saleItemId, quantity: 1 };
    const body = {
      requestId: randomUUID(),
      reason: 'Datos inválidos',
      items: [line, line],
    };
    await operation(sale.saleId, 'returns', body).expect(400);
    await operation(sale.saleId, 'returns', {
      ...body,
      items: [{ ...line, quantity: 0 }],
    }).expect(400);
    await operation(sale.saleId, 'returns', { ...body, items: [] }).expect(400);
    await operation(sale.saleId, 'refunds', payment('1.00')).expect(409);
    await operation(2147483647, 'cancel', {
      requestId: randomUUID(),
      reason: 'No existe',
    }).expect(404);
  });
  it('rolls back stock overflow and permits zero-value product returns', async () => {
    const item = await product(1);
    const sale = (await postSale(payload(item.productId)).expect(201))
      .body as SaleResponse;
    await db.inventory.update({
      where: { productId: item.productId },
      data: { quantity: 2147483647 },
    });
    await operation(sale.saleId, 'cancel', {
      requestId: randomUUID(),
      reason: 'Excede capacidad',
    }).expect(409);
    expect(
      await db.saleOperation.count({ where: { saleId: sale.saleId } }),
    ).toBe(0);
    const free = await product(2, '0.00');
    const freeSale = (
      await postSale(payload(free.productId, 2, '0.00')).expect(201)
    ).body as SaleResponse;
    await operation(freeSale.saleId, 'returns', {
      requestId: randomUUID(),
      reason: 'Devolución sin importe',
      items: [{ saleItemId: freeSale.items[0].saleItemId, quantity: 2 }],
    })
      .expect(201)
      .expect((res) => {
        expect(res.body).toMatchObject({
          status: 'RETURNED',
          adjustedTotal: '0.00',
        });
      });
    expect(await quantity(free.productId)).toBe(2);
  });
});
