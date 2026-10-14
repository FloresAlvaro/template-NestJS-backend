const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { seedDemo, requestId, markerId } = require('./seed-demo.cjs');
const fixtures = require('./seed-demo-data.cjs');
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error(
    'TEST_DATABASE_URL debe apuntar a una base aislada terminada en _test.',
  );
process.env.DATABASE_URL = url;
const { PrismaClient } = require('../dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { hashPassword, verifyPassword } = require('../dist/src/auth/password');
const { saleInclude, serializeSale } = require('../dist/src/sales/sales-view');
const { reservedQuantities } = require('../dist/src/inventory/reservations');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});
const password = randomBytes(24).toString('hex');
const adminEmail = 'seed-demo-admin@example.com';
let admin, app;
const options = { adminEmail, password };
const models = [
  'category',
  'subCategory',
  'product',
  'inventory',
  'productImage',
  'user',
  'customer',
  'sale',
  'saleItem',
  'saleOperation',
  'saleOperationItem',
  'order',
  'orderItem',
  'orderOperation',
  'stockMovement',
  'session',
  'passwordReset',
];
const snapshot = async () =>
  JSON.stringify(
    await Promise.all(models.map((model) => db[model].findMany())),
  );
// La suite es destructiva exclusivamente en la base desechable exigida arriba.
async function reset() {
  for (const model of [
    'stockMovement',
    'orderOperation',
    'orderItem',
    'order',
    'saleOperationItem',
    'saleOperation',
    'saleItem',
    'sale',
    'productImage',
    'inventory',
    'product',
    'subCategory',
    'category',
    'customer',
    'session',
    'passwordReset',
  ])
    await db[model].deleteMany();
  await db.user.deleteMany({ where: { email: { not: adminEmail } } });
}
before(async () => {
  await reset();
  admin = await db.user.create({
    data: {
      email: adminEmail,
      name: 'Demo seed test admin',
      role: 'ADMIN',
      passwordHash: await hashPassword(password),
    },
  });
  const { Test } = require('@nestjs/testing');
  const { AppModule } = require('../dist/src/app.module');
  const { configureApp } = require('../dist/src/configure-app');
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  configureApp(app);
  await app.init();
});
after(async () => {
  if (app) await app.close();
  await reset();
  await db.user.deleteMany({ where: { email: adminEmail } });
  await db.$disconnect();
});
const sale = async (key) =>
  serializeSale(
    await db.sale.findUniqueOrThrow({
      where: { requestId: requestId(key) },
      include: saleInclude,
    }),
  );

test('la demo genera todos los flujos con stock, importes e historial coherentes', async () => {
  const result = await seedDemo(db, options);
  assert.equal(result.alreadyLoaded, false);
  assert.equal(await db.product.count(), 46);
  assert.equal(await db.user.count(), 5);
  assert.equal(await db.customer.count(), 5);
  assert.equal(await db.productImage.count(), 4);
  assert.equal(await db.sale.count(), 15);
  assert.equal(await db.order.count(), 9);
  assert.equal(await db.category.count(), 8);
  assert.equal(await db.subCategory.count(), 15);
  assert.equal((await sale('sale-unpaid')).balanceDue, '20.00');
  assert.equal((await sale('partial-payment')).balanceDue, '20.00');
  assert.equal((await sale('paid')).balanceDue, '0.00');
  const split = await sale('split-payment');
  assert.deepEqual(
    split.operations.map((operation) => operation.method),
    ['CASH', 'CARD', 'TRANSFER'],
  );
  assert.equal(split.paid, '30.00');
  const returned = await sale('partial-return');
  assert.equal(returned.status, 'PARTIALLY_RETURNED');
  assert.equal(returned.refundDue, '10.00');
  assert.equal((await sale('refunded-return')).refundDue, '0.00');
  const full = await sale('full-return');
  assert.equal(full.status, 'RETURNED');
  assert.equal(full.adjustedTotal, '0.00');
  assert.equal(full.refunded, '30.00');
  assert.equal((await sale('cancel-unpaid')).status, 'CANCELLED');
  assert.equal((await sale('cancel-paid')).refundDue, '30.00');
  assert.equal((await sale('cancel-refunded')).refundDue, '0.00');
  const orders = await db.order.findMany({
    orderBy: { orderId: 'asc' },
    include: { sale: { include: saleInclude } },
  });
  assert.deepEqual(
    orders.map((order) => order.status),
    [
      'PENDING',
      'PENDING',
      'CONFIRMED',
      'READY',
      'READY',
      'COMPLETED',
      'CANCELLED',
      'EXPIRED',
      'CANCELLED',
    ],
  );
  assert.equal(serializeSale(orders[3].sale).balanceDue, '25.50');
  assert.equal(serializeSale(orders[4].sale).balanceDue, '0.00');
  assert.equal(serializeSale(orders[5].sale).balanceDue, '0.00');
  assert.equal(serializeSale(orders[8].sale).refundDue, '15.00');
  const reserved = await db.product.findUniqueOrThrow({
    where: { sku: 'DEMO-FLOW-007' },
    include: { inventory: true },
  });
  assert.equal(reserved.inventory.quantity, 4);
  assert.equal(
    (await reservedQuantities(db, [reserved.productId])).get(
      reserved.productId,
    ),
    4,
  );
  const image = await db.productImage.findFirst();
  const metadata = await require('sharp')(
    Buffer.from(image.content),
  ).metadata();
  assert.equal(metadata.format, 'webp');
  const products = await db.product.findMany({
    where: { sku: { startsWith: 'DEMO-FLOW-' } },
    include: { inventory: true },
  });
  for (const product of products) {
    const moves = await db.stockMovement.findMany({
      where: { productId: product.productId },
      orderBy: { stockMovementId: 'asc' },
    });
    let quantity = 0;
    let date = new Date(0);
    for (const move of moves) {
      assert.equal(move.previousQuantity, quantity);
      quantity += move.quantity;
      assert.equal(move.resultingQuantity, quantity);
      assert.ok(move.createdAt >= date);
      date = move.createdAt;
    }
    assert.equal(product.inventory.quantity, quantity);
  }
  assert.ok(
    (await db.sale.findMany()).some(
      (record) => record.createdAt < new Date(Date.now() - 86400000),
    ),
  );
});

test('las cuentas demo inician sesión con permisos reales y clientes aislados', async () => {
  const request = require('supertest');
  const origin = 'http://localhost:3000';
  const login = async (email) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email, password });
  const seller = await login(fixtures.users[0].email);
  assert.equal(seller.status, 200);
  const sellerCookie = seller.headers['set-cookie'];
  await request(app.getHttpServer())
    .get('/api/users')
    .set('Cookie', sellerCookie)
    .expect(403);
  await request(app.getHttpServer())
    .get('/api/sales')
    .set('Cookie', sellerCookie)
    .expect(200);
  const ana = await login(fixtures.users[1].email);
  const bruno = await login(fixtures.users[2].email);
  assert.equal(ana.status, 200);
  assert.equal(bruno.status, 200);
  const order = await db.order.findUniqueOrThrow({
    where: { requestId: requestId('order-pending') },
  });
  await request(app.getHttpServer())
    .get(`/api/orders/${order.orderId}`)
    .set('Cookie', ana.headers['set-cookie'])
    .expect(200);
  await request(app.getHttpServer())
    .get(`/api/orders/${order.orderId}`)
    .set('Cookie', bruno.headers['set-cookie'])
    .expect(404);
  await request(app.getHttpServer())
    .get('/api/sales')
    .set('Cookie', ana.headers['set-cookie'])
    .expect(403);
  assert.equal((await login(fixtures.users[3].email)).status, 401);
  const shop = await request(app.getHttpServer())
    .get('/api/shop/products?limit=100')
    .expect(200);
  assert.ok(shop.body.items.some((product) => product.imageUrl));
  assert.ok(
    !shop.body.items.some((product) =>
      ['DEMO-FLOW-008', 'DEMO-FLOW-009', 'DEMO-FLOW-010'].includes(product.sku),
    ),
  );
});

test('repetir la carga conserva operaciones, contraseñas, fotos y cambios manuales', async () => {
  await db.product.update({
    where: { sku: 'DEMO-FLOW-005' },
    data: { name: 'Producto editado manualmente', isActive: false },
  });
  const changedHash = await hashPassword(randomBytes(24).toString('hex'));
  await db.user.update({
    where: { email: fixtures.users[0].email },
    data: { passwordHash: changedHash },
  });
  const previous = await snapshot();
  assert.equal(
    (
      await seedDemo(db, {
        ...options,
        password: randomBytes(24).toString('hex'),
      })
    ).alreadyLoaded,
    true,
  );
  assert.equal(await snapshot(), previous);
  assert.equal(await verifyPassword(password, changedHash), false);
});

test('password inválido, administrador inexistente y colisión no escriben datos', async () => {
  await reset();
  let previous = await snapshot();
  await assert.rejects(
    seedDemo(db, { ...options, password: 'short' }),
    /contraseña/,
  );
  assert.equal(await snapshot(), previous);
  await assert.rejects(
    seedDemo(db, { ...options, adminEmail: 'missing@example.com' }),
    /administrador activo/,
  );
  assert.equal(await snapshot(), previous);
  await db.user.create({
    data: {
      ...fixtures.users[0],
      passwordHash: 'external-account-do-not-change',
    },
  });
  previous = await snapshot();
  await assert.rejects(seedDemo(db, options), /identidades reservadas/);
  assert.equal(await snapshot(), previous);
});

test('un fallo al final revierte catálogo, cuentas, imágenes, ventas, stock y pedidos', async () => {
  await reset();
  const previous = await snapshot();
  const failing = {
    $transaction: (operation, settings) =>
      db.$transaction(
        (tx) =>
          operation(
            new Proxy(tx, {
              get(target, property) {
                if (property === 'sale')
                  return new Proxy(target.sale, {
                    get(delegate, method) {
                      if (method === 'create')
                        return (args) => {
                          if (args.data.requestId === markerId)
                            throw new Error(
                              'Fallo inyectado al final de la demo',
                            );
                          return delegate.create(args);
                        };
                      const value = delegate[method];
                      return typeof value === 'function'
                        ? value.bind(delegate)
                        : value;
                    },
                  });
                const value = target[property];
                return typeof value === 'function' ? value.bind(target) : value;
              },
            }),
          ),
        settings,
      ),
  };
  await assert.rejects(seedDemo(failing, options), /Fallo inyectado/);
  assert.equal(await snapshot(), previous);
});

test('la demo preserva pedidos vencidos y registros ajenos al namespace demo', async () => {
  await reset();
  const customer = await db.customer.create({
    data: { name: 'Cliente real de prueba' },
  });
  const order = await db.order.create({
    data: {
      customerId: customer.customerId,
      userId: admin.userId,
      customerName: customer.name,
      total: '0.00',
      requestId: randomUUID(),
      requestHash: 'unrelated-history',
      expiresAt: new Date(Date.now() - 60000),
    },
  });
  const before = JSON.stringify(order);
  await seedDemo(db, options);
  assert.equal(
    JSON.stringify(
      await db.order.findUnique({ where: { orderId: order.orderId } }),
    ),
    before,
  );
  assert.equal(
    (
      await db.customer.findUnique({
        where: { customerId: customer.customerId },
      })
    ).name,
    customer.name,
  );
});
