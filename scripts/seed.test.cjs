const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { seed: runSeed, validateCatalog } = require('./seed.cjs');
const catalog = require('./seed-data.cjs');
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error(
    'TEST_DATABASE_URL debe apuntar a una base aislada terminada en _test.',
  );
const { PrismaClient } = require('../dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});
const adminEmail = `seed-${Date.now()}@example.test`;
before(() =>
  db.user.create({
    data: {
      name: 'Seed test',
      email: adminEmail,
      role: 'ADMIN',
      passwordHash: 'unused-session-only-fixture',
    },
  }),
);
const seed = (client, input = catalog) =>
  runSeed(client, input, { adminEmail });
after(async () => {
  await db.stockMovement.deleteMany();
  await db.user.delete({ where: { email: adminEmail } });
  await db.$disconnect();
});
const reset = async () => {
  await db.stockMovement.deleteMany();
  await db.product.deleteMany();
  await db.subCategory.deleteMany();
  await db.category.deleteMany();
};
const snapshot = async () =>
  JSON.stringify(
    await Promise.all([
      db.category.findMany({ orderBy: { categoryId: 'asc' } }),
      db.subCategory.findMany({ orderBy: { subCategoryId: 'asc' } }),
      db.product.findMany({ orderBy: { productId: 'asc' } }),
      db.inventory.findMany({ orderBy: { productId: 'asc' } }),
      db.stockMovement.findMany({ orderBy: { stockMovementId: 'asc' } }),
    ]),
  );

test('carga 36 productos y conserva todos los registros al repetir', async () => {
  await reset();
  const stats = await seed(db);
  assert.equal(stats.categoriesCreated, 6);
  assert.equal(stats.subCategoriesCreated, 12);
  assert.equal(stats.productsCreated, 36);
  assert.equal(stats.inventoriesInitialized, 36);
  assert.equal(stats.movementsCreated, 30);
  assert.equal(await db.inventory.count({ where: { quantity: 0 } }), 6);
  const initial = await db.stockMovement.findFirst({
    where: { product: { sku: 'AUD-001' } },
    include: { user: true },
  });
  assert.equal(initial.quantity, 20);
  assert.equal(initial.previousQuantity, 0);
  assert.equal(initial.resultingQuantity, 20);
  assert.equal(initial.user.email, adminEmail);
  await db.inventory.update({
    where: {
      productId: (
        await db.product.findUniqueOrThrow({ where: { sku: 'AUD-001' } })
      ).productId,
    },
    data: { quantity: 7, minStock: 2 },
  });
  await db.product.update({
    where: { sku: 'AUD-001' },
    data: { name: 'Nombre personalizado', salePrice: '99.00', isActive: false },
  });
  const before = await snapshot();
  assert.equal((await seed(db)).productsCreated, 0);
  assert.equal(await snapshot(), before);
  assert.equal(
    (await db.inventory.findFirst({ where: { product: { sku: 'AUD-001' } } }))
      .quantity,
    7,
  );
});
test('omite categorías y subcategorías inactivas', async () => {
  await reset();
  await db.category.create({
    data: {
      name: 'Electrónica',
      normalizedName: 'electrónica',
      isActive: false,
    },
  });
  assert.equal((await seed(db)).productsCreated, 30);
  const sub = await db.subCategory.findFirst();
  await db.stockMovement.deleteMany({
    where: { product: { subCategoryId: sub.subCategoryId } },
  });
  await db.product.deleteMany({ where: { subCategoryId: sub.subCategoryId } });
  await db.subCategory.update({
    where: { subCategoryId: sub.subCategoryId },
    data: { isActive: false },
  });
  assert.equal((await seed(db)).productsCreated, 0);
});
test('un conflicto de código de barras revierte toda la carga', async () => {
  await reset();
  await seed(db);
  await db.product.update({
    where: { sku: 'AUD-001' },
    data: { sku: 'SKU-PERSONALIZADO' },
  });
  const before = await snapshot();
  const input = structuredClone(catalog);
  input.unshift({ name: 'Categoría temporal', subCategories: [] });
  await assert.rejects(
    seed(db, input),
    /ya pertenece al SKU SKU-PERSONALIZADO/,
  );
  assert.equal(await snapshot(), before);
});
test('rechaza datos inválidos y SKU duplicados antes de escribir', () => {
  const input = structuredClone(catalog);
  input[0].subCategories[0].products[0].cost = '-1.00';
  assert.throws(() => validateCatalog(input), /cost/);
  input[0].subCategories[0].products[0].cost = '1.00';
  input[0].subCategories[0].products[1].sku = 'aud-001';
  assert.throws(() => validateCatalog(input), /duplicado/);
});

test('requiere un administrador activo y revierte toda la carga sin él', async () => {
  await reset();
  const before = await snapshot();
  await assert.rejects(runSeed(db), /SEED_ADMIN_EMAIL/);
  assert.equal(await snapshot(), before);
  await assert.rejects(
    runSeed(db, catalog, { adminEmail: 'inexistente@example.test' }),
    /SEED_ADMIN_EMAIL/,
  );
  assert.equal(await snapshot(), before);
});

test('inicializa inventario existente vacío y conserva productos con movimientos previos', async () => {
  await reset();
  const empty = structuredClone(catalog);
  for (const category of empty)
    for (const sub of category.subCategories)
      for (const product of sub.products) {
        product.quantity = 0;
        product.minStock = 0;
      }
  await seed(db, empty);
  assert.equal((await seed(db)).inventoriesInitialized, 36);
  const product = await db.product.findUniqueOrThrow({
    where: { sku: 'AUD-001' },
  });
  const admin = await db.user.findUniqueOrThrow({
    where: { email: adminEmail },
  });
  await db.stockMovement.create({
    data: {
      productId: product.productId,
      userId: admin.userId,
      type: 'EXIT',
      quantity: -20,
      previousQuantity: 20,
      resultingQuantity: 0,
      reason: 'Salida completa',
    },
  });
  await db.inventory.update({
    where: { productId: product.productId },
    data: { quantity: 0, minStock: 0 },
  });
  const before = await snapshot();
  await seed(db);
  assert.equal(await snapshot(), before);
});

test('valida las cantidades y mínimos del inventario', () => {
  for (const field of ['quantity', 'minStock'])
    for (const value of [-1, 1.5, 2147483648, '5', null]) {
      const input = structuredClone(catalog);
      input[0].subCategories[0].products[0][field] = value;
      assert.throws(() => validateCatalog(input));
    }
});
