const fixtures = require('./seed-purchasing-data.cjs');
const { seed, validateCatalog } = require('./seed.cjs');
const { requestId, validate } = require('./seed-demo-utils.cjs');
const purchasingMarkerId = requestId('purchase-pending');

function purchasingCatalog() {
  return [
    {
      name: fixtures.categoryName,
      description:
        'Catálogo ficticio separado para probar abastecimiento sin cambiar productos gestionados.',
      subCategories: [
        {
          name: 'Material de empaque demo',
          products: fixtures.products.map((product) => ({
            ...product,
            description:
              'Producto exclusivo de la demo de proveedores y compras.',
          })),
        },
      ],
    },
  ];
}
function validatePurchasingFixtures(password) {
  const { CreateUserDto } = require('../dist/src/users/dto/users.dto');
  const {
    CreateSupplierDto,
  } = require('../dist/src/suppliers/dto/suppliers.dto');
  for (const { isActive, ...user } of fixtures.users)
    validate(CreateUserDto, { ...user, password });
  for (const { inactive, ...supplier } of fixtures.suppliers)
    validate(CreateSupplierDto, supplier);
  validateCatalog(purchasingCatalog());
}

// Called under the outer demo transaction and its catalog advisory lock.
async function seedPurchasingDemo(tx, { adminEmail, passwordHash }) {
  const marker = await tx.purchase.findUnique({
    where: { requestId: purchasingMarkerId },
    include: { items: true },
  });
  if (marker) {
    if (
      marker.supplierDocument !== fixtures.suppliers[0].document ||
      marker.reference !== 'DEMO-COMPRA-005' ||
      marker.items.length !== 1 ||
      marker.items[0].sku !== 'DEMO-BUY-003' ||
      marker.userName !== fixtures.users[0].name
    )
      throw new Error(
        'El identificador reservado de compras demo pertenece a otra operación.',
      );
    return {
      alreadyLoaded: true,
      usersCreated: 0,
      suppliersCreated: 0,
      productsCreated: 0,
      purchasesCreated: 0,
    };
  }
  const collisions = [
    await tx.user.count({
      where: { email: { in: fixtures.users.map((user) => user.email) } },
    }),
    await tx.category.count({
      where: { normalizedName: fixtures.categoryName.toLowerCase() },
    }),
    await tx.product.count({ where: { sku: { startsWith: 'DEMO-BUY-' } } }),
    await tx.supplier.count({
      where: {
        OR: [
          {
            document: {
              in: fixtures.suppliers.map((supplier) => supplier.document),
            },
          },
          {
            normalizedName: {
              in: fixtures.suppliers.map((supplier) =>
                supplier.name.toLowerCase(),
              ),
            },
          },
        ],
      },
    }),
    await tx.purchase.count({
      where: {
        requestId: {
          in: fixtures.purchases.map((purchase) => requestId(purchase.key)),
        },
      },
    }),
    await tx.purchaseOperation.count({
      where: {
        requestId: {
          in: fixtures.purchases.map((purchase) =>
            requestId(`${purchase.key}-operation`),
          ),
        },
      },
    }),
  ];
  if (collisions.some(Boolean))
    throw new Error(
      'Existen identidades reservadas de compras demo sin una carga completa. No se reemplazaron registros.',
    );
  const createdUsers = [];
  for (const user of fixtures.users)
    createdUsers.push(
      await tx.user.create({ data: { ...user, passwordHash } }),
    );
  const client = { $transaction: (operation) => operation(tx) };
  const catalog = await seed(client, purchasingCatalog(), { adminEmail });
  const db = new Proxy(tx, {
    get(target, property) {
      if (property === 'catalogWrite') return (operation) => operation(db);
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const {
    SuppliersService,
  } = require('../dist/src/suppliers/services/suppliers.service');
  const {
    PurchasesService,
  } = require('../dist/src/purchases/services/purchases.service');
  const {
    CreateSupplierDto,
    UpdateSupplierDto,
  } = require('../dist/src/suppliers/dto/suppliers.dto');
  const {
    CreatePurchaseDto,
    ReceivePurchaseDto,
    PurchaseOperationDto,
  } = require('../dist/src/purchases/dto/purchases.dto');
  const suppliersService = new SuppliersService(db),
    purchasesService = new PurchasesService(db);
  const suppliers = [];
  for (const { inactive, ...supplier } of fixtures.suppliers) {
    const created = await suppliersService.create(
      validate(CreateSupplierDto, supplier),
    );
    if (inactive)
      await suppliersService.update(
        created.supplierId,
        validate(UpdateSupplierDto, { isActive: false }),
      );
    suppliers.push(created);
  }
  const products = await tx.product.findMany({
    where: { sku: { in: fixtures.products.map((product) => product.sku) } },
  });
  const productIds = new Map(
    products.map((product) => [product.sku, product.productId]),
  );
  const purchases = [];
  for (const fixture of fixtures.purchases) {
    let purchase = await purchasesService.create(
      validate(CreatePurchaseDto, {
        requestId: requestId(fixture.key),
        supplierId: suppliers[fixture.supplier].supplierId,
        reference: fixture.reference,
        notes: `Compra ficticia de demostración: ${fixture.state}. No representa un pago real.`,
        items: fixture.items.map(([index, quantity, unitCost]) => ({
          productId: productIds.get(fixtures.products[index].sku),
          quantity,
          unitCost,
        })),
      }),
      createdUsers[0].userId,
    );
    if (fixture.state === 'RECEIVED')
      purchase = await purchasesService.transition(
        purchase.purchaseId,
        'RECEIVE',
        validate(ReceivePurchaseDto, {
          requestId: requestId(`${fixture.key}-operation`),
          reason: 'Demo de tienda: mercadería recibida y revisada',
          updateCost: fixture.updateCost,
        }),
        createdUsers[0].userId,
      );
    if (fixture.state === 'CANCELLED')
      purchase = await purchasesService.transition(
        purchase.purchaseId,
        'CANCEL',
        validate(PurchaseOperationDto, {
          requestId: requestId(`${fixture.key}-operation`),
          reason: 'Demo de tienda: compra cancelada antes de recibir',
        }),
        createdUsers[0].userId,
      );
    purchases.push({
      scenario: fixture.key,
      purchaseId: purchase.purchaseId,
      status: purchase.status,
      total: purchase.total,
    });
  }
  return {
    alreadyLoaded: false,
    usersCreated: createdUsers.length,
    suppliersCreated: suppliers.length,
    productsCreated: catalog.productsCreated,
    purchasesCreated: purchases.length,
    purchases,
  };
}
module.exports = {
  seedPurchasingDemo,
  validatePurchasingFixtures,
  purchasingMarkerId,
};
