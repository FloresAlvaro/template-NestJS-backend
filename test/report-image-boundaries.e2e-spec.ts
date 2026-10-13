import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { tokenHash } from '../src/auth/password';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Dedicated TEST_DATABASE_URL required');
process.env.DATABASE_URL = url;
const origin = 'http://localhost:3000';
const period = '?from=2002-01-01T00:00:00-04:00&to=2002-01-02T00:00:00-04:00';
type CreatedSale = { saleId: number; items: { saleItemId: number }[] };
type Ranking = {
  items: {
    productId: number;
    productName: string;
    sku: string;
    quantity: string;
    netTotal: string;
  }[];
};
type StockPage = {
  total: number;
  items: {
    productId: number;
    inventory: { quantity: number; minStock: number } | null;
  }[];
};

describe('Report and image boundary regressions (PostgreSQL)', () => {
  let app: INestApplication<App>, db: PrismaService;
  let categoryId: number,
    subCategoryId: number,
    productId: number,
    customerId: number;
  let adminCookie: string;
  let casePrefix: string;
  const prefix = `boundaries-${randomUUID()}`;
  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('Cookie', adminCookie);
  const post = (path: string) =>
    request(app.getHttpServer())
      .post(path)
      .set('Cookie', adminCookie)
      .set('Origin', origin);
  const createSale = async (quantity = 1, date = '2002-01-01T04:00:00Z') => {
    const response = await post('/api/sales')
      .send({
        requestId: randomUUID(),
        customerId,
        items: [{ productId, quantity, expectedUnitPrice: '0.10' }],
      })
      .expect(201);
    const sale = response.body as CreatedSale;
    await db.sale.update({
      where: { saleId: sale.saleId },
      data: { createdAt: new Date(date) },
    });
    return sale;
  };
  const operation = (
    saleId: number,
    path: string,
    body: Record<string, unknown>,
  ) =>
    post(`/api/sales/${saleId}/${path}`).send({
      requestId: randomUUID(),
      reason: 'Boundary regression test',
      ...body,
    });
  const upload = (image: Buffer, filename = 'test.png') =>
    post(`/api/products/${productId}/image`).attach('file', image, filename);
  const image = (color = '#ff0000', width = 20, height = 10) =>
    sharp({ create: { width, height, channels: 3, background: color } })
      .png()
      .toBuffer();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    const user = await db.user.create({
      data: {
        name: 'Boundary admin',
        email: `${prefix}@example.test`,
        role: 'ADMIN',
        passwordHash: 'unused-session-fixture',
      },
    });
    const token = randomBytes(32).toString('hex');
    await db.session.create({
      data: {
        tokenHash: tokenHash(token),
        userId: user.userId,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    adminCookie = `tienda_session=${token}`;
  });
  beforeEach(async () => {
    casePrefix = `case-${randomUUID()}`;
    categoryId = (
      await db.category.create({
        data: { name: casePrefix, normalizedName: casePrefix },
      })
    ).categoryId;
    subCategoryId = (
      await db.subCategory.create({
        data: { categoryId, name: casePrefix, normalizedName: casePrefix },
      })
    ).subCategoryId;
    productId = (
      await db.product.create({
        data: {
          subCategoryId,
          name: 'Original product',
          sku: casePrefix.toUpperCase(),
          cost: '0.01',
          salePrice: '0.10',
          inventory: { create: { quantity: 10, minStock: 2 } },
        },
      })
    ).productId;
    customerId = (await db.customer.create({ data: { name: casePrefix } }))
      .customerId;
  });
  afterEach(async () => {
    await db.stockMovement.deleteMany({
      where: { product: { subCategoryId } },
    });
    await db.saleOperationItem.deleteMany({
      where: { operation: { sale: { customerId } } },
    });
    await db.saleOperation.deleteMany({ where: { sale: { customerId } } });
    await db.saleItem.deleteMany({ where: { sale: { customerId } } });
    await db.sale.deleteMany({ where: { customerId } });
    await db.product.deleteMany({ where: { subCategoryId } });
    await db.subCategory.delete({ where: { subCategoryId } });
    await db.category.delete({ where: { categoryId } });
    await db.customer.delete({ where: { customerId } });
  });
  afterAll(async () => {
    await db.user.deleteMany({ where: { email: `${prefix}@example.test` } });
    await app.close();
  });

  it('includes the start instant, excludes the end instant and honors timezone offsets', async () => {
    await createSale(1, '2002-01-01T03:59:59.999Z');
    await createSale(1, '2002-01-01T04:00:00Z');
    await createSale(1, '2002-01-02T04:00:00Z');
    const summary = await get(`/api/reports/sales${period}`).expect(200);
    expect(summary.body).toMatchObject({
      saleCount: 1,
      originalTotal: '0.10',
      balanceDue: '0.10',
    });
    const ranking = await get(`/api/reports/top-products${period}`).expect(200);
    expect((ranking.body as Ranking).items).toEqual([
      {
        productId,
        productName: 'Original product',
        sku: casePrefix.toUpperCase(),
        quantity: '1',
        netTotal: '0.10',
      },
    ]);
    await get(
      '/api/reports/sales?from=2026-02-30T00:00:00Z&to=2026-03-02T00:00:00Z',
    ).expect(400);
  });

  it('does not offset one sale debt against another sale refund and includes subsequent operations', async () => {
    const paid = await createSale();
    await createSale();
    await operation(paid.saleId, 'payments', {
      amount: '0.10',
      method: 'CASH',
    }).expect(201);
    await operation(paid.saleId, 'returns', {
      items: [{ saleItemId: paid.items[0].saleItemId, quantity: 1 }],
    }).expect(201);
    const response = await get(`/api/reports/sales${period}`).expect(200);
    expect(response.body).toMatchObject({
      saleCount: 2,
      originalTotal: '0.20',
      adjustedTotal: '0.10',
      paid: '0.10',
      balanceDue: '0.10',
      refundDue: '0.10',
    });
  });

  it('keeps historical names and SKU in rankings after product edits and deactivation', async () => {
    await createSale(2);
    await request(app.getHttpServer())
      .patch(`/api/products/${productId}`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ name: 'Renamed product', sku: `${casePrefix}-new` })
      .expect(200);
    await createSale();
    await request(app.getHttpServer())
      .delete(`/api/products/${productId}`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .expect(200);
    const response = await get(`/api/reports/top-products${period}`).expect(
      200,
    );
    const rows = (response.body as Ranking).items;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      productId,
      productName: 'Original product',
      quantity: '2',
      netTotal: '0.20',
    });
    expect(rows[1]).toMatchObject({
      productId,
      productName: 'Renamed product',
      quantity: '1',
      netTotal: '0.10',
    });
  });

  it('paginates low-stock alerts stably, including zero stock and absent inventory', async () => {
    const create = (sku: string, quantity?: number) =>
      db.product.create({
        data: {
          subCategoryId,
          name: sku,
          sku: `${casePrefix}-${sku}`.toUpperCase(),
          cost: '0.01',
          salePrice: '0.10',
          ...(quantity === undefined
            ? {}
            : { inventory: { create: { quantity, minStock: 1 } } }),
        },
      });
    const zero = await create('zero', 0);
    const boundary = await create('boundary', 1);
    const missing = await create('missing');
    await create('available', 2);
    const all = (await get('/api/reports/low-stock?limit=100').expect(200))
      .body as StockPage;
    const own = all.items.filter((p) =>
      [zero.productId, boundary.productId, missing.productId].includes(
        p.productId,
      ),
    );
    expect(own.map((p) => p.productId)).toEqual([
      zero.productId,
      boundary.productId,
      missing.productId,
    ]);
    expect(own[2].inventory).toBeNull();
    const first = (
      await get('/api/reports/low-stock?limit=1&page=1').expect(200)
    ).body as StockPage;
    const second = (
      await get('/api/reports/low-stock?limit=1&page=2').expect(200)
    ).body as StockPage;
    expect(first.total).toBe(all.total);
    expect(second.total).toBe(all.total);
    expect(first.items[0].productId).toBe(all.items[0].productId);
    expect(second.items[0].productId).toBe(all.items[1].productId);
    expect(first.items[0].productId).not.toBe(second.items[0].productId);
  });

  it.each(['jpeg', 'png', 'webp'] as const)(
    'accepts real %s bytes independently of the claimed filename and MIME',
    async (format) => {
      const bytes = await sharp(await image())
        .toFormat(format)
        .toBuffer();
      await post(`/api/products/${productId}/image`)
        .attach('file', bytes, {
          filename: 'misleading.svg',
          contentType: 'application/octet-stream',
        })
        .expect(201);
      const stored = await db.productImage.findUniqueOrThrow({
        where: { productId },
      });
      const metadata = await sharp(Buffer.from(stored.content)).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(20);
      expect(metadata.height).toBe(10);
    },
  );

  it('rejects oversized decoded dimensions without replacing the existing image', async () => {
    await upload(await image()).expect(201);
    const previous = await db.productImage.findUniqueOrThrow({
      where: { productId },
    });
    await upload(await image('#00ff00', 4001, 4000)).expect(400);
    const after = await db.productImage.findUniqueOrThrow({
      where: { productId },
    });
    expect(Buffer.from(after.content)).toEqual(Buffer.from(previous.content));
    expect(after.updatedAt).toEqual(previous.updatedAt);
  });

  it('rejects missing, extra and duplicate multipart fields without creating an image', async () => {
    const bytes = await image();
    await post(`/api/products/${productId}/image`).expect(400);
    await post(`/api/products/${productId}/image`)
      .field('other', 'value')
      .attach('file', bytes, 'test.png')
      .expect(400);
    await post(`/api/products/${productId}/image`)
      .attach('wrong-field', bytes, 'test.png')
      .expect(400);
    await post(`/api/products/${productId}/image`)
      .attach('file', bytes, 'one.png')
      .attach('file', bytes, 'two.png')
      .expect(400);
    await post('/api/products/0/image')
      .attach('file', bytes, 'test.png')
      .expect(400);
    await post('/api/products/2147483647/image')
      .attach('file', bytes, 'test.png')
      .expect(404);
    expect(await db.productImage.count({ where: { productId } })).toBe(0);
  });

  it('atomically replaces concurrent image uploads without changing stock or the product', async () => {
    const first = await image('#ff0000');
    const second = await image('#00ff00');
    const results = await Promise.all([upload(first), upload(second)]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(await db.productImage.count({ where: { productId } })).toBe(1);
    const stored = Buffer.from(
      (await db.productImage.findUniqueOrThrow({ where: { productId } }))
        .content,
    );
    const pixels = await sharp(stored).stats();
    const red = pixels.channels[0].mean;
    const green = pixels.channels[1].mean;
    expect((red > 200 && green < 50) || (green > 200 && red < 50)).toBe(true);
    expect(
      (await db.inventory.findUniqueOrThrow({ where: { productId } })).quantity,
    ).toBe(10);
    expect(await db.stockMovement.count({ where: { productId } })).toBe(0);
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { productId } })
      ).salePrice.toFixed(2),
    ).toBe('0.10');
    for (let i = 0; i < 2; i++)
      await request(app.getHttpServer())
        .delete(`/api/products/${productId}/image`)
        .set('Cookie', adminCookie)
        .set('Origin', origin)
        .expect(200);
    expect(await db.productImage.count({ where: { productId } })).toBe(0);
  });

  it('hides images when a subcategory is deactivated while retaining management access', async () => {
    await upload(await image()).expect(201);
    await db.subCategory.update({
      where: { subCategoryId },
      data: { isActive: false },
    });
    await request(app.getHttpServer())
      .get(`/api/shop/products/${productId}/image`)
      .expect(404);
    await get(`/api/products/${productId}/image`).expect(200);
    await db.subCategory.update({
      where: { subCategoryId },
      data: { isActive: true },
    });
    await request(app.getHttpServer())
      .get(`/api/shop/products/${productId}/image`)
      .expect(200);
  });
});
