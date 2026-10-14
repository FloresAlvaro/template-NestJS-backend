require('dotenv/config');
require('reflect-metadata');
const { createHash } = require('node:crypto');
const { seed, validateCatalog } = require('./seed.cjs');
const catalog = require('./seed-data.cjs');
const fixtures = require('./seed-demo-data.cjs');

// UUID v4 estable: identifica la carga completa sin añadir tablas al dominio.
function requestId(key) {
  const hex = createHash('sha256')
    .update(`tienda-demo-v1:${key}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const markerId = requestId('sale-unpaid');
const reason = (text) => `Demo de tienda: ${text}`;

function validate(Dto, input) {
  const { plainToInstance } = require('class-transformer');
  const { validateSync } = require('class-validator');
  const dto = plainToInstance(Dto, input);
  if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length)
    throw new Error(`Datos de demo inválidos para ${Dto.name}.`);
  return dto;
}

function illustration(kind) {
  const shapes = {
    notebook:
      '<rect x="160" y="65" width="190" height="230" rx="16" fill="#7c3aed"/><rect x="175" y="80" width="160" height="200" rx="9" fill="#fff"/><path d="M200 130h105M200 155h105M200 180h75" stroke="#c4b5fd" stroke-width="8"/>',
    bottle:
      '<rect x="222" y="55" width="65" height="35" rx="8" fill="#155e75"/><rect x="207" y="85" width="95" height="215" rx="35" fill="#22d3ee"/><path d="M230 115v130" stroke="#cffafe" stroke-width="9" stroke-linecap="round"/>',
    bag: '<rect x="150" y="135" width="210" height="160" rx="24" fill="#fb923c"/><path d="M205 145v-40a50 50 0 0 1 100 0v40" fill="none" stroke="#9a3412" stroke-width="15"/><path d="M180 175h150" stroke="#fed7aa" stroke-width="8"/>',
    box: '<rect x="155" y="105" width="210" height="170" rx="18" fill="#34d399"/><path d="M155 155h210M220 155v120M300 155v120" stroke="#065f46" stroke-width="8"/><rect x="170" y="85" width="45" height="60" rx="5" fill="#6d28d9"/><rect x="235" y="70" width="40" height="75" rx="5" fill="#fb923c"/>',
  };
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="380"><rect width="520" height="380" rx="24" fill="#f5f3ff"/>${shapes[kind]}<text x="260" y="350" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#6b7280">Ilustración de ejemplo</text></svg>`,
  );
}

// Los servicios usan el mismo TransactionClient. No abren transacciones anidadas;
// el bloqueo, el commit y el rollback pertenecen a la carga completa.
function transactionServices(tx, userIds) {
  const db = new Proxy(tx, {
    get(target, property) {
      if (property === 'catalogWrite') return (operation) => operation(db);
      if (property === 'order')
        return new Proxy(tx.order, {
          get(delegate, method) {
            if (method === 'updateMany')
              return (args) =>
                delegate.updateMany({
                  ...args,
                  where: args.where?.expiresAt
                    ? { ...args.where, userId: { in: userIds } }
                    : args.where,
                });
            const value = delegate[method];
            return typeof value === 'function' ? value.bind(delegate) : value;
          },
        });
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const { SalesService } = require('../dist/src/sales/services/sales.service');
  const {
    SaleOperationsService,
  } = require('../dist/src/sales/services/sale-operations.service');
  const { OrdersService } = require('../dist/src/orders/services/orders.service');
  const {
    InventoryService,
  } = require('../dist/src/inventory/services/inventory.service');
  const {
    ProductImagesService,
  } = require('../dist/src/products/services/product-images.service');
  return {
    sales: new SalesService(db),
    operations: new SaleOperationsService(db),
    orders: new OrdersService(db, { get: (_key, fallback) => fallback }),
    inventory: new InventoryService(db),
    images: new ProductImagesService(db),
  };
}

async function seedDemo(prisma, { adminEmail, password } = {}) {
  const { CreateUserDto } = require('../dist/src/users/dto/users.dto');
  const { hashPassword } = require('../dist/src/auth/security/password');
  if (
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 128
  )
    throw new Error(
      'La contraseña de las cuentas demo debe tener entre 12 y 128 caracteres.',
    );
  for (const { isActive, ...user } of fixtures.users)
    validate(CreateUserDto, { ...user, password });
  const demoCatalog = [
    {
      name: fixtures.categoryName,
      description:
        'Escenarios ficticios para revisar el flujo completo de la interfaz.',
      subCategories: [
        {
          name: 'Productos de demostración',
          products: fixtures.products.map(
            ({ picture, inactive, ...product }) => ({
              ...product,
              description:
                'Dato ficticio de demostración; no es una operación real.',
            }),
          ),
        },
      ],
    },
  ];
  validateCatalog(demoCatalog);
  const passwordHash = await hashPassword(password);
  // Generar imágenes fuera de la transacción; subirlas usa el validador real.
  const sharp = require('sharp');
  const pictures = new Map();
  for (const product of fixtures.products)
    if (product.picture)
      pictures.set(
        product.sku,
        await sharp(illustration(product.picture)).png().toBuffer(),
      );
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7140321)`;
      const admin = await tx.user.findUnique({
        where: { email: adminEmail?.trim().toLowerCase() || '' },
      });
      if (!admin?.isActive || admin.role !== 'ADMIN')
        throw new Error(
          'Configura SEED_ADMIN_EMAIL con un administrador activo existente. No se aplicaron cambios.',
        );
      const marker = await tx.sale.findUnique({
        where: { requestId: markerId },
        include: { items: true },
      });
      if (marker) {
        if (
          marker.sellerName !== fixtures.users[0].name ||
          marker.customerDocument !== 'DEMO-FLOW-C1' ||
          marker.items.length !== 1 ||
          marker.items[0].sku !== 'DEMO-FLOW-001'
        )
          throw new Error(
            'El identificador reservado de la demo pertenece a otra operación.',
          );
        return {
          alreadyLoaded: true,
          message:
            'La demo ya estaba cargada; se conservan sus cambios, estados, contraseñas y existencias.',
        };
      }
      const collisions = [
        await tx.user.count({
          where: { email: { in: fixtures.users.map((user) => user.email) } },
        }),
        await tx.category.count({
          where: { normalizedName: { startsWith: 'demo ·' } },
        }),
        await tx.product.count({
          where: { sku: { startsWith: 'DEMO-FLOW-' } },
        }),
        await tx.customer.count({
          where: { document: { startsWith: 'DEMO-FLOW-' } },
        }),
      ];
      if (collisions.some(Boolean))
        throw new Error(
          'Existen identidades reservadas de demo sin una carga completa. No se reemplazaron registros; revisa el conflicto antes de continuar.',
        );
      const client = { $transaction: (operation) => operation(tx) };
      const catalogStats = await seed(client, catalog, { adminEmail });
      const demoStats = await seed(client, demoCatalog, { adminEmail });
      const at = new Date();
      const daysAgo = (days) => new Date(at.getTime() - days * 86400000);
      const users = {};
      for (const fixture of fixtures.users) {
        users[
          fixture.role === 'CUSTOMER'
            ? fixture.email.split('@')[0]
            : fixture.isActive
              ? 'seller'
              : 'inactive'
        ] = await tx.user.create({
          data: { ...fixture, passwordHash, createdAt: daysAgo(14) },
        });
      }
      const customers = {};
      for (const [index, key] of [
        'ana',
        'bruno',
        'walkin',
        'company',
        'inactive',
      ].entries()) {
        const {
          CreateCustomerDto,
        } = require('../dist/src/customers/dto/customers.dto');
        const data = validate(CreateCustomerDto, {
          name:
            users[key]?.name ||
            {
              walkin: 'Demo · Cliente sin cuenta',
              company: 'Demo · Oficina Central',
              inactive: 'Demo · Cliente inactivo',
            }[key],
          document: `DEMO-FLOW-C${index + 1}`,
          phone: `DEMO-${index + 1}`,
        });
        customers[key] = await tx.customer.create({
          data: {
            ...data,
            userId: users[key]?.role === 'CUSTOMER' ? users[key].userId : null,
            isActive: key !== 'inactive',
            createdAt: daysAgo(14),
          },
        });
      }
      const services = transactionServices(tx, [
        users.ana.userId,
        users.bruno.userId,
      ]);
      const products = await tx.product.findMany({
        where: { sku: { in: fixtures.products.map((product) => product.sku) } },
        orderBy: { sku: 'asc' },
      });
      await tx.stockMovement.updateMany({
        where: {
          productId: { in: products.map((product) => product.productId) },
        },
        data: { createdAt: daysAgo(14) },
      });
      await tx.product.updateMany({
        where: {
          productId: { in: products.map((product) => product.productId) },
        },
        data: { createdAt: daysAgo(14) },
      });
      for (const product of products)
        if (pictures.has(product.sku))
          await services.images.upload(product.productId, {
            buffer: pictures.get(product.sku),
          });
      const product = (index) => products[index].productId;
      const {
        CreateStockMovementDto,
      } = require('../dist/src/inventory/dto/inventory.dto');
      for (const dto of [
        {
          type: 'ENTRY',
          quantity: 5,
          reason: reason('recepción de mercadería'),
        },
        { type: 'EXIT', quantity: 2, reason: reason('salida por uso interno') },
        {
          type: 'ADJUSTMENT',
          quantity: 82,
          expectedQuantity: 83,
          reason: reason('conteo físico'),
        },
      ]) {
        const movement = await services.inventory.move(
          product(0),
          validate(CreateStockMovementDto, dto),
          admin.userId,
        );
        await tx.stockMovement.update({
          where: { stockMovementId: movement.stockMovementId },
          data: { createdAt: daysAgo(13) },
        });
      }
      const {
        CreateSaleDto,
        SalePaymentDto,
        SaleReturnDto,
        SaleOperationDto,
      } = require('../dist/src/sales/dto/sales.dto');
      const {
        CreateOrderDto,
        OrderOperationDto,
      } = require('../dist/src/orders/dto/orders.dto');
      const lines = (entries) =>
        entries.map(([index, quantity]) => ({
          productId: product(index),
          quantity,
          expectedUnitPrice: products[index].salePrice.toFixed(2),
        }));
      const payment = (sale, key, amount, method = 'CASH') =>
        services.operations.execute(
          sale.saleId,
          'PAYMENT',
          validate(SalePaymentDto, {
            requestId: requestId(key),
            reason: reason(key),
            amount,
            method,
          }),
          users.seller.userId,
        );
      const cancel = (sale, key) =>
        services.operations.execute(
          sale.saleId,
          'CANCEL',
          validate(SaleOperationDto, {
            requestId: requestId(key),
            reason: reason(key),
          }),
          admin.userId,
        );
      const refund = (sale, key, amount) =>
        services.operations.execute(
          sale.saleId,
          'REFUND',
          validate(SalePaymentDto, {
            requestId: requestId(key),
            reason: reason(key),
            amount,
            method: 'CASH',
          }),
          admin.userId,
        );
      const giveBack = (sale, key, quantity) =>
        services.operations.execute(
          sale.saleId,
          'RETURN',
          validate(SaleReturnDto, {
            requestId: requestId(key),
            reason: reason(key),
            items: [{ saleItemId: sale.items[0].saleItemId, quantity }],
          }),
          admin.userId,
        );
      const createSale = (key, entries, customer = 'walkin') =>
        services.sales.create(
          validate(CreateSaleDto, {
            requestId: requestId(key),
            customerId: customers[customer].customerId,
            items: lines(entries),
          }),
          users.seller.userId,
        );
      const sales = [];
      for (const [index, key] of [
        'partial-payment',
        'paid',
        'split-payment',
        'partial-return',
        'refunded-return',
        'full-return',
        'cancel-unpaid',
        'cancel-paid',
        'cancel-refunded',
      ].entries()) {
        let sale = await createSale(
          key,
          key === 'paid'
            ? [
                [0, 1],
                [1, 1],
                [2, 1],
              ]
            : [[0, 3]],
          index % 2 ? 'company' : 'walkin',
        );
        if (key === 'partial-payment')
          await payment(sale, `${key}-cash`, '10.00');
        else if (key === 'split-payment') {
          await payment(sale, `${key}-cash`, '10.00');
          await payment(sale, `${key}-card`, '10.00', 'CARD');
          await payment(sale, `${key}-transfer`, '10.00', 'TRANSFER');
        } else if (key !== 'cancel-unpaid')
          await payment(sale, `${key}-cash`, sale.total);
        if (key.includes('return')) {
          sale = await giveBack(
            sale,
            `${key}-return`,
            key === 'full-return' ? 3 : 1,
          );
          if (key !== 'partial-return')
            await refund(sale, `${key}-refund`, sale.refundDue);
        }
        if (key.startsWith('cancel-')) {
          sale = await cancel(sale, `${key}-cancel`);
          if (key === 'cancel-refunded')
            await refund(sale, `${key}-refund`, sale.refundDue);
        }
        const date = daysAgo(10 - index);
        await tx.sale.update({
          where: { saleId: sale.saleId },
          data: { createdAt: date },
        });
        const operations = await tx.saleOperation.findMany({
          where: { saleId: sale.saleId },
          orderBy: { operationId: 'asc' },
        });
        for (const [step, operation] of operations.entries())
          await tx.saleOperation.update({
            where: { operationId: operation.operationId },
            data: { createdAt: new Date(date.getTime() + (step + 1) * 60000) },
          });
        await tx.stockMovement.updateMany({
          where: { saleItem: { saleId: sale.saleId } },
          data: { createdAt: date },
        });
        for (const operation of operations)
          await tx.stockMovement.updateMany({
            where: { operationItem: { operationId: operation.operationId } },
            data: {
              createdAt: new Date(
                date.getTime() + (operations.indexOf(operation) + 1) * 60000,
              ),
            },
          });
        sales.push({ scenario: key, saleId: sale.saleId });
      }
      const orders = [];
      for (const key of [
        'pending',
        'reserved',
        'confirmed',
        'ready-unpaid',
        'ready-paid',
        'completed',
        'cancelled',
        'expired',
      ]) {
        const actor =
          key === 'cancelled' || key === 'completed' ? users.bruno : users.ana;
        let order = await services.orders.create(
          validate(CreateOrderDto, {
            requestId: requestId(`order-${key}`),
            items: lines(key === 'reserved' ? [[6, 4]] : [[1, 1]]),
          }),
          actor.userId,
        );
        const transition = (kind) =>
          services.orders.transition(
            order.orderId,
            kind,
            validate(OrderOperationDto, {
              requestId: requestId(`order-${key}-${kind}`),
              reason: reason(`pedido ${key}: ${kind}`),
            }),
            kind === 'CANCEL' ? actor.userId : users.seller.userId,
          );
        if (
          ['confirmed', 'ready-unpaid', 'ready-paid', 'completed'].includes(key)
        )
          order = await transition('CONFIRM');
        if (['ready-paid', 'completed'].includes(key))
          await payment(
            order.sale,
            `order-${key}-payment`,
            order.total,
            'TRANSFER',
          );
        if (['ready-unpaid', 'ready-paid', 'completed'].includes(key))
          order = await transition('READY');
        if (key === 'completed') order = await transition('COMPLETE');
        if (key === 'cancelled') order = await transition('CANCEL');
        if (key === 'expired') {
          await tx.order.update({
            where: { orderId: order.orderId },
            data: { createdAt: daysAgo(3), expiresAt: daysAgo(2) },
          });
          const {
            expirePendingOrders,
          } = require('../dist/src/orders/services/order-expiry.service');
          await expirePendingOrders(
            {
              order: {
                updateMany: (args) =>
                  tx.order.updateMany({
                    ...args,
                    where: { ...args.where, orderId: order.orderId },
                  }),
              },
            },
            at,
          );
        }
        orders.push({ scenario: key, orderId: order.orderId });
      }
      // Historial de anulación de un pedido confirmado (reposición y saldo a devolver).
      let cancelledOrder = await services.orders.create(
        validate(CreateOrderDto, {
          requestId: requestId('order-sale-cancelled'),
          items: lines([[3, 1]]),
        }),
        users.bruno.userId,
      );
      cancelledOrder = await services.orders.transition(
        cancelledOrder.orderId,
        'CONFIRM',
        validate(OrderOperationDto, {
          requestId: requestId('order-sale-cancelled-confirm'),
          reason: reason('confirmación para anulación'),
        }),
        users.seller.userId,
      );
      await payment(
        cancelledOrder.sale,
        'order-sale-cancelled-pay',
        cancelledOrder.total,
      );
      await cancel(cancelledOrder.sale, 'order-sale-cancelled-cancel');
      orders.push({
        scenario: 'sale-cancelled',
        orderId: cancelledOrder.orderId,
      });
      await tx.product.update({
        where: { productId: product(7) },
        data: { isActive: false },
      });
      const parent = await tx.subCategory.findUniqueOrThrow({
        where: { subCategoryId: products[0].subCategoryId },
      });
      const inactiveSub = await tx.subCategory.create({
        data: {
          categoryId: parent.categoryId,
          name: 'Demo · Subcategoría inactiva',
          normalizedName: 'demo · subcategoría inactiva',
          isActive: false,
        },
      });
      await tx.product.create({
        data: {
          subCategoryId: inactiveSub.subCategoryId,
          name: 'Demo · Oculto por subcategoría',
          sku: 'DEMO-FLOW-009',
          cost: '1.00',
          salePrice: '2.00',
          inventory: { create: {} },
        },
      });
      const inactiveCategory = await tx.category.create({
        data: {
          name: 'Demo · Categoría inactiva',
          normalizedName: 'demo · categoría inactiva',
          isActive: false,
        },
      });
      const hiddenSub = await tx.subCategory.create({
        data: {
          categoryId: inactiveCategory.categoryId,
          name: 'Demo · Rama oculta',
          normalizedName: 'demo · rama oculta',
          isActive: false,
        },
      });
      await tx.product.create({
        data: {
          subCategoryId: hiddenSub.subCategoryId,
          name: 'Demo · Oculto por categoría',
          sku: 'DEMO-FLOW-010',
          cost: '1.00',
          salePrice: '2.00',
          inventory: { create: {} },
        },
      });
      // Este registro es el marcador de commit: nunca se publica una demo parcial.
      const unpaid = await createSale('sale-unpaid', [[0, 2]], 'ana');
      sales.push({ scenario: 'unpaid', saleId: unpaid.saleId });
      return {
        alreadyLoaded: false,
        catalog: catalogStats,
        demoCatalog: demoStats,
        users: fixtures.users.map(({ email, role, isActive }) => ({
          email,
          role,
          isActive,
        })),
        customersCreated: 5,
        demoProductsCreated: 10,
        imagesCreated: pictures.size,
        sales,
        orders,
      };
    },
    { maxWait: 10000, timeout: 90000 },
  );
}

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error('Configura DATABASE_URL antes de cargar los datos.');
  const { existsSync } = require('node:fs');
  const { resolve } = require('node:path');
  if (!existsSync(resolve(__dirname, '../dist/src/sales/services/sales.service.js')))
    throw new Error(
      'Primero ejecuta npm run build para generar Prisma y los servicios.',
    );
  let password = process.env.SEED_DEMO_PASSWORD;
  if (!password) {
    const { Writable } = require('node:stream');
    const readline = require('node:readline/promises');
    if (!process.stdin.isTTY)
      throw new Error(
        'Usa una terminal interactiva o configura SEED_DEMO_PASSWORD.',
      );
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    const rl = readline.createInterface({
      input: process.stdin,
      output,
      terminal: true,
    });
    try {
      process.stdout.write(
        'Contraseña para las cuentas demo (12 a 128 caracteres): ',
      );
      password = await rl.question('');
      process.stdout.write('\nRepite la contraseña: ');
      if (password !== (await rl.question('')))
        throw new Error('Las contraseñas no coinciden.');
      process.stdout.write('\n');
    } finally {
      rl.close();
    }
  }
  const { PrismaClient } = require('../dist/generated/prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    console.log(
      'Demo completada:',
      JSON.stringify(
        await seedDemo(prisma, {
          adminEmail: process.env.SEED_ADMIN_EMAIL,
          password,
        }),
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error('No se pudo cargar la demo:', error.message);
    process.exitCode = 1;
  });
module.exports = { seedDemo, requestId, markerId, main };
