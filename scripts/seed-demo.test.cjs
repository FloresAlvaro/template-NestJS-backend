const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { seedDemo, requestId, markerId } = require('./seed-demo.cjs');
const fixtures = require('./seed-demo-data.cjs');
const purchasingFixtures = require('./seed-purchasing-data.cjs');
const { purchasingMarkerId } = require('./seed-purchasing-demo.cjs');
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error(
    'TEST_DATABASE_URL debe apuntar a una base aislada terminada en _test.',
  );
process.env.DATABASE_URL = url;
const { PrismaClient } = require('../dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const {
  hashPassword,
  verifyPassword,
} = require('../dist/src/auth/security/password');
const {
  saleInclude,
  serializeSale,
} = require('../dist/src/sales/presenters/sales-view');
const {
  reservedQuantities,
} = require('../dist/src/inventory/utils/reservations');
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
  'supplier',
  'purchase',
  'purchaseItem',
  'purchaseOperation',
  'cashRegister',
  'cashShift',
  'cashMovement',
];
const snapshot = async () =>
  JSON.stringify(
    await Promise.all(models.map((model) => db[model].findMany())),
  );
// La suite es destructiva exclusivamente en la base desechable exigida arriba.
async function reset() {
  for (const model of [
    'cashMovement',
    'cashShift',
    'cashRegister',
    'stockMovement',
    'purchaseOperation',
    'purchaseItem',
    'purchase',
    'supplier',
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
  const { configureApp } = require('../dist/src/config/configure-app');
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
  assert.equal(await db.product.count(), 49);
  assert.equal(await db.user.count(), 7);
  assert.equal(await db.customer.count(), 5);
  assert.equal(await db.productImage.count(), 4);
  assert.equal(await db.sale.count(), 15);
  assert.equal(await db.order.count(), 9);
  assert.equal(await db.category.count(), 9);
  assert.equal(await db.subCategory.count(), 16);
  assert.equal(await db.supplier.count(), 3);
  assert.equal(await db.supplier.count({ where: { isActive: false } }), 1);
  assert.equal(await db.purchase.count(), 5);
  assert.equal(await db.purchase.count({ where: { status: 'PENDING' } }), 2);
  assert.equal(await db.purchase.count({ where: { status: 'RECEIVED' } }), 2);
  assert.equal(await db.purchase.count({ where: { status: 'CANCELLED' } }), 1);
  assert.equal(await db.purchaseOperation.count(), 3);
  assert.equal(result.purchasing.purchasesCreated, 5);
  const purchasingProducts = await db.product.findMany({
    where: { sku: { startsWith: 'DEMO-BUY-' } },
    include: { inventory: true },
    orderBy: { sku: 'asc' },
  });
  assert.deepEqual(
    purchasingProducts.map((product) => product.inventory.quantity),
    [20, 50, 15],
  );
  assert.deepEqual(
    purchasingProducts.map((product) => product.cost.toFixed(2)),
    ['2.00', '0.50', '3.10'],
  );
  assert.deepEqual(
    purchasingProducts.map((product) => product.salePrice.toFixed(2)),
    ['4.90', '1.50', '6.90'],
  );
  const purchase = await db.purchase.findUniqueOrThrow({
    where: { requestId: requestId('purchase-received') },
  });
  assert.equal(purchase.total.toFixed(2), '58.50');
  assert.equal(
    await db.stockMovement.count({ where: { purchaseItemId: { not: null } } }),
    3,
  );
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
  const demoAdmin = await login(purchasingFixtures.users[0].email);
  assert.equal(demoAdmin.status, 200);
  for (const path of ['/api/users', '/api/purchases', '/api/suppliers'])
    await request(app.getHttpServer())
      .get(path)
      .set('Cookie', demoAdmin.headers['set-cookie'])
      .expect(200);
  const secondSeller = await login(purchasingFixtures.users[1].email);
  assert.equal(secondSeller.status, 200);
  for (const cookie of [sellerCookie, secondSeller.headers['set-cookie']]) {
    await request(app.getHttpServer())
      .get('/api/purchases')
      .set('Cookie', cookie)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/suppliers')
      .set('Cookie', cookie)
      .expect(403);
  }
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
  await request(app.getHttpServer())
    .get('/api/purchases')
    .set('Cookie', ana.headers['set-cookie'])
    .expect(403);
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
  await db.user.update({
    where: { email: purchasingFixtures.users[0].email },
    data: { passwordHash: changedHash },
  });
  await db.supplier.update({
    where: { document: 'DEMO-SUP-001' },
    data: {
      name: 'Proveedor editado manualmente',
      isActive: false,
      notes: 'No sobrescribir',
    },
  });
  await db.product.update({
    where: { sku: 'DEMO-BUY-001' },
    data: { name: 'Etiquetas editadas', cost: '9.99' },
  });
  const pending = await db.purchase.findUniqueOrThrow({
    where: { requestId: purchasingMarkerId },
  });
  await db.purchase.update({
    where: { purchaseId: pending.purchaseId },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
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

// Reproduce a database seeded by v1, without touching the original demo rows.
async function removePurchasingDemo() {
  await db.cashMovement.deleteMany();
  await db.cashShift.deleteMany();
  await db.cashRegister.deleteMany();
  const purchaseIds = (
    await db.purchase.findMany({
      where: {
        requestId: {
          in: purchasingFixtures.purchases.map((fixture) =>
            requestId(fixture.key),
          ),
        },
      },
    })
  ).map((purchase) => purchase.purchaseId);
  await db.stockMovement.deleteMany({
    where: { product: { sku: { startsWith: 'DEMO-BUY-' } } },
  });
  await db.purchaseOperation.deleteMany({
    where: { purchaseId: { in: purchaseIds } },
  });
  await db.purchaseItem.deleteMany({
    where: { purchaseId: { in: purchaseIds } },
  });
  await db.purchase.deleteMany({ where: { purchaseId: { in: purchaseIds } } });
  await db.supplier.deleteMany({
    where: {
      document: {
        in: purchasingFixtures.suppliers.map((supplier) => supplier.document),
      },
    },
  });
  await db.product.deleteMany({ where: { sku: { startsWith: 'DEMO-BUY-' } } });
  await db.subCategory.deleteMany({
    where: {
      category: {
        normalizedName: purchasingFixtures.categoryName.toLowerCase(),
      },
    },
  });
  await db.category.deleteMany({
    where: { normalizedName: purchasingFixtures.categoryName.toLowerCase() },
  });
  await db.user.deleteMany({
    where: {
      email: { in: purchasingFixtures.users.map((user) => user.email) },
    },
  });
}

test('amplía una demo anterior sin reponer stock ni modificar cuentas, ventas o pedidos existentes', async () => {
  await reset();
  await seedDemo(db, options);
  await removePurchasingDemo();
  const keys = {
    category: 'categoryId',
    subCategory: 'subCategoryId',
    product: 'productId',
    inventory: 'productId',
    productImage: 'productId',
    user: 'userId',
    customer: 'customerId',
    sale: 'saleId',
    saleItem: 'saleItemId',
    saleOperation: 'operationId',
    saleOperationItem: 'operationItemId',
    order: 'orderId',
    orderItem: 'orderItemId',
    orderOperation: 'operationId',
    stockMovement: 'stockMovementId',
    session: 'tokenHash',
    passwordReset: 'tokenHash',
  };
  const previous = new Map(
    await Promise.all(
      Object.entries(keys).map(async ([model, key]) => [
        model,
        await db[model].findMany({ orderBy: { [key]: 'asc' } }),
      ]),
    ),
  );
  const upgraded = await seedDemo(db, options);
  assert.equal(upgraded.alreadyLoaded, true);
  assert.equal(upgraded.purchasing.alreadyLoaded, false);
  assert.equal(upgraded.purchasing.purchasesCreated, 5);
  for (const [model, rows] of previous) {
    const key = keys[model];
    assert.deepEqual(
      await db[model].findMany({
        where: { [key]: { in: rows.map((row) => row[key]) } },
        orderBy: { [key]: 'asc' },
      }),
      rows,
    );
  }
  const complete = await snapshot();
  assert.equal((await seedDemo(db, options)).purchasing.alreadyLoaded, true);
  assert.equal(await snapshot(), complete);
});

test('una colisión al ampliar la demo revierte la ampliación y conserva la cuenta ajena', async () => {
  await reset();
  await seedDemo(db, options);
  await removePurchasingDemo();
  await db.user.create({
    data: {
      ...purchasingFixtures.users[0],
      passwordHash: 'external-account-do-not-change',
    },
  });
  const previous = await snapshot();
  await assert.rejects(
    seedDemo(db, options),
    /identidades reservadas de compras demo/,
  );
  assert.equal(await snapshot(), previous);
});

test('el comando --local crea cuentas con la contraseña fija y conserva el administrador original', async () => {
  await reset();
  const { execFileSync } = require('node:child_process');
  const { resolve } = require('node:path');
  const { LOCAL_DEMO_PASSWORD } = require('./seed-demo-utils.cjs');
  const adminBefore = await db.user.findUniqueOrThrow({
    where: { email: adminEmail },
  });
  const run = () =>
    execFileSync(
      process.execPath,
      [resolve(__dirname, 'seed-demo.cjs'), '--local'],
      {
        env: {
          ...process.env,
          DATABASE_URL: url,
          SEED_ADMIN_EMAIL: '',
          SEED_DEMO_PASSWORD: '',
        },
        encoding: 'utf8',
        timeout: 60000,
      },
    );
  const output = run();
  assert.ok(!output.includes(LOCAL_DEMO_PASSWORD));
  for (const fixture of [...fixtures.users, ...purchasingFixtures.users]) {
    const account = await db.user.findUniqueOrThrow({
      where: { email: fixture.email },
    });
    assert.equal(account.role, fixture.role);
    assert.equal(
      await verifyPassword(LOCAL_DEMO_PASSWORD, account.passwordHash),
      true,
    );
  }
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { email: adminEmail } }))
      .passwordHash,
    adminBefore.passwordHash,
  );
  const before = await snapshot();
  run();
  assert.equal(await snapshot(), before);
});

test('la caja demo incluye arqueos exactos, faltantes, sobrantes y turnos propios abiertos', async () => {
  await reset();
  const loaded = await seedDemo(db, options);
  assert.equal(loaded.cash.registersCreated, 3);
  assert.equal(loaded.cash.shiftsCreated, 5);
  assert.equal(loaded.cash.movementsCreated, 10);
  assert.equal(loaded.cash.closuresCreated, 3);
  const { shifts } = require('./seed-cash-data.cjs');
  const { cashSummary } = require('../dist/src/cash/utils/cash-ledger');
  const cash = await db.cashShift.findMany({
    include: { movements: true, user: true },
    orderBy: { shiftId: 'asc' },
  });
  assert.equal(cash.length, 5);
  for (const fixture of shifts) {
    const shift = cash.find((s) => s.requestId === requestId(fixture.key));
    assert.ok(shift);
    assert.equal(shift.user.email, fixture.email);
    assert.equal(shift.movements.length, 2);
    assert.equal(shift.openingAmount.toFixed(2), fixture.opening);
    assert.ok(
      shift.movements.every(
        (m) => m.method === 'CASH' && m.saleOperationId === null,
      ),
    );
    assert.ok(shift.movements.every((m) => m.createdAt >= shift.openedAt));
    const summary = await db.$transaction((tx) =>
      cashSummary(tx, shift.shiftId, shift.openingAmount),
    );
    if (fixture.counted) {
      assert.ok(shift.closedAt > shift.openedAt);
      assert.equal(shift.countedAmount.toFixed(2), fixture.counted);
      assert.equal(shift.expectedAmount.toFixed(2), summary.expectedAmount);
    } else {
      assert.equal(shift.closedAt, null);
      assert.equal(shift.countedAmount, null);
    }
  }
  assert.deepEqual(
    cash.filter((s) => s.closedAt).map((s) => s.difference.toFixed(2)),
    ['0.00', '-5.00', '2.00'],
  );
  const before = await snapshot();
  const again = await seedDemo(db, options);
  assert.equal(again.cash.alreadyLoaded, true);
  assert.equal(await snapshot(), before);
});

test('amplía una demo sin caja conservando ventas, stock y datos existentes', async () => {
  await reset();
  await seedDemo(db, options);
  await db.cashMovement.deleteMany();
  await db.cashShift.deleteMany();
  await db.cashRegister.deleteMany();
  const legacyModels = models.filter((m) => !m.startsWith('cash'));
  const before = JSON.stringify(
    await Promise.all(legacyModels.map((m) => db[m].findMany())),
  );
  const upgraded = await seedDemo(db, options);
  assert.equal(upgraded.alreadyLoaded, true);
  assert.equal(upgraded.purchasing.alreadyLoaded, true);
  assert.equal(upgraded.cash.alreadyLoaded, false);
  assert.equal(
    JSON.stringify(
      await Promise.all(legacyModels.map((m) => db[m].findMany())),
    ),
    before,
  );
  const original = await db.cashShift.findUniqueOrThrow({
    where: { requestId: requestId('cash-open-seller') },
  });
  const { CashService } = require('../dist/src/cash/services/cash.service');
  const cashService = new CashService({
    catalogWrite: (op) => db.$transaction(op),
  });
  const actor = await db.user.findUniqueOrThrow({
    where: { userId: original.userId },
  });
  await cashService.move(
    original.shiftId,
    {
      requestId: randomUUID(),
      kind: 'CASH_OUT',
      amount: '1.00',
      reason: 'Movimiento posterior de prueba',
    },
    actor,
  );
  const changed = await snapshot();
  await seedDemo(db, options);
  assert.equal(await snapshot(), changed);
});

test('rechaza colisiones y turnos ajenos sin dejar una ampliación parcial de caja', async () => {
  await reset();
  await seedDemo(db, options);
  await db.cashMovement.deleteMany();
  await db.cashShift.deleteMany();
  await db.cashRegister.deleteMany();
  const { registers } = require('./seed-cash-data.cjs');
  const collision = await db.cashRegister.create({
    data: { name: registers[0] },
  });
  let previous = await snapshot();
  await assert.rejects(
    seedDemo(db, options),
    /identidades reservadas de caja demo/,
  );
  assert.equal(await snapshot(), previous);
  await db.cashRegister.delete({ where: { registerId: collision.registerId } });
  const actor = await db.user.findUniqueOrThrow({
    where: { email: 'vendedor@demo.example.com' },
  });
  const register = await db.cashRegister.create({
    data: { name: 'Caja externa conservada' },
  });
  await db.cashShift.create({
    data: {
      registerId: register.registerId,
      userId: actor.userId,
      userName: actor.name,
      requestId: randomUUID(),
      requestHash: 'external',
      openingAmount: '1.00',
    },
  });
  previous = await snapshot();
  await assert.rejects(seedDemo(db, options), /turno abierto ajeno/);
  assert.equal(await snapshot(), previous);
});

test('un fallo durante movimientos de caja revierte toda la carga demo', async () => {
  await reset();
  const previous = await snapshot();
  const failing = {
    $transaction: (operation, settings) =>
      db.$transaction(
        (tx) =>
          operation(
            new Proxy(tx, {
              get(target, property) {
                if (property === 'cashMovement')
                  return new Proxy(target.cashMovement, {
                    get(delegate, method) {
                      if (method === 'create')
                        return (args) => {
                          if (args.data.kind === 'CASH_OUT')
                            throw new Error('Fallo inyectado en caja');
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
  await assert.rejects(seedDemo(failing, options), /Fallo inyectado en caja/);
  assert.equal(await snapshot(), previous);
});
