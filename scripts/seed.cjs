require('dotenv/config');
require('reflect-metadata');
const catalog = require('./seed-data.cjs');

function validateCatalog(input) {
  const { plainToInstance } = require('class-transformer');
  const { validateSync } = require('class-validator');
  const {
    CreateCategoryDto,
  } = require('../dist/src/categories/dto/create-category.dto');
  const {
    CreateSubCategoryDto,
  } = require('../dist/src/sub-categories/dto/create-sub-category.dto');
  const {
    CreateProductDto,
  } = require('../dist/src/products/dto/create-product.dto');
  const {
    InventorySettingsDto,
  } = require('../dist/src/inventory/dto/inventory.dto');
  const validate = (Dto, value) => {
    const result = plainToInstance(Dto, value);
    const errors = validateSync(result, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length)
      throw new Error(
        `Datos inválidos en ${value.name}: ${errors.map((e) => e.property).join(', ')}`,
      );
    return { ...result };
  };
  const categories = new Set(),
    skus = new Set(),
    barcodes = new Set();
  const unique = (set, value) => {
    if (set.has(value))
      throw new Error(
        `Identificador duplicado en los datos de ejemplo: ${value}`,
      );
    set.add(value);
  };
  return input.map(({ subCategories, ...category }) => {
    const data = validate(CreateCategoryDto, category);
    unique(categories, data.name.toLowerCase());
    const subs = new Set();
    return {
      ...data,
      subCategories: subCategories.map(({ products, ...sub }) => {
        const { categoryId, ...subData } = validate(CreateSubCategoryDto, {
          ...sub,
          categoryId: 1,
        });
        unique(subs, subData.name.toLowerCase());
        return {
          ...subData,
          products: products.map(
            ({ quantity = 0, minStock = 0, ...product }) => {
              validate(InventorySettingsDto, { minStock });
              if (
                !Number.isInteger(quantity) ||
                quantity < 0 ||
                quantity > 2147483647
              )
                throw new Error(`Cantidad inválida en ${product.name}`);
              const { subCategoryId, ...productData } = validate(
                CreateProductDto,
                { ...product, subCategoryId: 1 },
              );
              unique(skus, productData.sku);
              if (productData.barcode) unique(barcodes, productData.barcode);
              return { ...productData, quantity, minStock };
            },
          ),
        };
      }),
    };
  });
}

async function seed(prisma, input = catalog, options = {}) {
  const data = validateCatalog(input);
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7140321)`;
      const stats = {
        categoriesCreated: 0,
        subCategoriesCreated: 0,
        productsCreated: 0,
        productsExisting: 0,
        inactiveBranchesSkipped: 0,
        inventoriesInitialized: 0,
        inventoriesPreserved: 0,
        movementsCreated: 0,
      };
      let actor;
      async function initializeInventory(product, quantity, minStock) {
        const inventory = product.inventory;
        if (
          !product.isActive ||
          (inventory &&
            (inventory.quantity !== 0 || inventory.minStock !== 0)) ||
          (await tx.stockMovement.count({
            where: { productId: product.productId },
          }))
        ) {
          stats.inventoriesPreserved++;
          return;
        }
        if (quantity > 0 && !actor) {
          const email = options.adminEmail?.trim().toLowerCase();
          actor = email && (await tx.user.findUnique({ where: { email } }));
          if (!actor || !actor.isActive || actor.role !== 'ADMIN')
            throw new Error(
              'Configura SEED_ADMIN_EMAIL con el correo de un administrador activo existente para registrar el stock inicial. No se aplicaron cambios.',
            );
        }
        if (inventory && quantity === 0 && minStock === 0) return;
        await tx.inventory.upsert({
          where: { productId: product.productId },
          create: { productId: product.productId, quantity, minStock },
          update: { quantity, minStock },
        });
        stats.inventoriesInitialized++;
        if (quantity > 0) {
          await tx.stockMovement.create({
            data: {
              productId: product.productId,
              userId: actor.userId,
              type: 'ENTRY',
              quantity,
              previousQuantity: 0,
              resultingQuantity: quantity,
              reason: 'Stock inicial de ejemplo (seed)',
            },
          });
          stats.movementsCreated++;
        }
      }
      for (const { subCategories, ...categoryData } of data) {
        const normalizedName = categoryData.name.toLowerCase();
        let category = await tx.category.findUnique({
          where: { normalizedName },
        });
        if (!category) {
          category = await tx.category.create({
            data: { ...categoryData, normalizedName },
          });
          stats.categoriesCreated++;
        }
        if (!category.isActive) {
          stats.inactiveBranchesSkipped++;
          continue;
        }
        for (const { products, ...subData } of subCategories) {
          const normalizedName = subData.name.toLowerCase();
          let sub = await tx.subCategory.findUnique({
            where: {
              categoryId_normalizedName: {
                categoryId: category.categoryId,
                normalizedName,
              },
            },
          });
          if (!sub) {
            sub = await tx.subCategory.create({
              data: {
                ...subData,
                normalizedName,
                categoryId: category.categoryId,
              },
            });
            stats.subCategoriesCreated++;
          }
          if (!sub.isActive) {
            stats.inactiveBranchesSkipped++;
            continue;
          }
          for (const { quantity, minStock, ...product } of products) {
            const existing = await tx.product.findUnique({
              where: { sku: product.sku },
              include: { inventory: true },
            });
            if (existing) {
              stats.productsExisting++;
              if (existing.subCategoryId === sub.subCategoryId)
                await initializeInventory(existing, quantity, minStock);
              else stats.inventoriesPreserved++;
              continue;
            }
            if (product.barcode) {
              const owner = await tx.product.findUnique({
                where: { barcode: product.barcode },
              });
              if (owner)
                throw new Error(
                  `El código de barras ${product.barcode} del SKU ${product.sku} ya pertenece al SKU ${owner.sku}. No se aplicaron cambios.`,
                );
            }
            const created = await tx.product.create({
              data: {
                ...product,
                subCategoryId: sub.subCategoryId,
                inventory: { create: {} },
              },
              include: { inventory: true },
            });
            await initializeInventory(created, quantity, minStock);
            stats.productsCreated++;
          }
        }
      }
      return stats;
    },
    { maxWait: 10000, timeout: 60000 },
  );
}

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error('Configura DATABASE_URL antes de cargar los datos.');
  const { existsSync } = require('node:fs');
  const { resolve } = require('node:path');
  if (
    !existsSync(
      resolve(__dirname, '../dist/src/products/dto/create-product.dto.js'),
    )
  )
    throw new Error(
      'Primero ejecuta npm run build para generar el cliente Prisma y los validadores.',
    );
  const { PrismaClient } = require('../dist/generated/prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    console.log(
      'Carga completada:',
      await seed(prisma, catalog, { adminEmail: process.env.SEED_ADMIN_EMAIL }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { seed, validateCatalog };
if (require.main === module) {
  const run = process.argv.includes('--demo')
    ? require('./seed-demo.cjs').main
    : main;
  run().catch((error) => {
    console.error('No se pudieron cargar los datos de ejemplo:', error.message);
    process.exitCode = 1;
  });
}
