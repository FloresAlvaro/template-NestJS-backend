import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';

type ProductResponse = {
  productId: number;
  sku: string;
  barcode: string | null;
  cost: string;
  salePrice: string;
  isActive: boolean;
  subCategoryId: number;
};
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('TEST_DATABASE_URL must point to a dedicated _test database');
process.env.DATABASE_URL = url;

describe('Products API (PostgreSQL)', () => {
  let app: INestApplication<App>;
  let db: PrismaService;
  const categoryIds: number[] = [];
  const prefix = `products-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let seq = 0;
  let subCategoryId: number;
  const payload = () => ({
    name: 'Teclado USB',
    sku: `${prefix}-${++seq}`,
    subCategoryId,
    cost: '80.00',
    salePrice: '120.50',
  });
  async function parent() {
    const category = await db.category.create({
      data: { name: `${prefix}-${++seq}`, normalizedName: `${prefix}-${seq}` },
    });
    categoryIds.push(category.categoryId);
    return db.subCategory.create({
      data: {
        categoryId: category.categoryId,
        name: 'Accesorios',
        normalizedName: 'accesorios',
      },
    });
  }
  async function create(extra: Record<string, unknown> = {}) {
    const response = await request(app.getHttpServer())
      .post('/api/products')
      .send({ ...payload(), ...extra })
      .expect(201);
    return response.body as ProductResponse;
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    subCategoryId = (await parent()).subCategoryId;
  });
  afterAll(async () => {
    if (!app) return;
    await db.product.deleteMany({
      where: { subCategory: { categoryId: { in: categoryIds } } },
    });
    await db.subCategory.deleteMany({
      where: { categoryId: { in: categoryIds } },
    });
    await db.category.deleteMany({
      where: { categoryId: { in: categoryIds } },
    });
    await app.close();
  });

  it('creates, trims and reads products with exact decimal strings', async () => {
    const product = await create({
      name: '  Teclado USB  ',
      cost: '9999999999999999.99',
      salePrice: '0.10',
    });
    expect(product.cost).toBe('9999999999999999.99');
    expect(product.salePrice).toBe('0.10');
    expect(product.sku).toBe(product.sku.toUpperCase());
    const response = await request(app.getHttpServer())
      .get(`/api/products/${product.productId}`)
      .expect(200);
    expect(response.body).toEqual(product);
    expect(response.body).toMatchObject({ name: 'Teclado USB', barcode: null });
  });
  it('reserves SKUs ignoring case, including after deactivation', async () => {
    const product = await create();
    await request(app.getHttpServer())
      .delete(`/api/products/${product.productId}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/products')
      .send({ ...payload(), sku: ` ${product.sku.toLowerCase()} ` })
      .expect(409);
  });
  it('enforces unique barcode and allows clearing it', async () => {
    const barcode = `${Date.now()}${++seq}`;
    const product = await create({ barcode });
    await request(app.getHttpServer())
      .post('/api/products')
      .send({ ...payload(), barcode })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/products/${product.productId}`)
      .send({ barcode: null })
      .expect(200);
    await create({ barcode });
  });
  it.each([-1, 1.23, '1.234', '10000000000000000', 'NaN', null, '1e2'])(
    'rejects invalid money %p',
    async (cost) => {
      await request(app.getHttpServer())
        .post('/api/products')
        .send({ ...payload(), cost })
        .expect(400);
    },
  );
  it.each(['sku', 'name', 'subCategoryId', 'cost', 'salePrice'])(
    'rejects null PATCH %s',
    async (field) => {
      const product = await create();
      await request(app.getHttpServer())
        .patch(`/api/products/${product.productId}`)
        .send({ [field]: null })
        .expect(400);
    },
  );
  it('rejects stock and isActive as unknown fields', async () => {
    await request(app.getHttpServer())
      .post('/api/products')
      .send({ ...payload(), stock: 1 })
      .expect(400);
    const product = await create();
    await request(app.getHttpServer())
      .patch(`/api/products/${product.productId}`)
      .send({ isActive: false })
      .expect(400);
  });
  it('does not mutate fields when moving to a missing parent fails', async () => {
    const product = await create();
    await request(app.getHttpServer())
      .patch(`/api/products/${product.productId}`)
      .send({ name: 'Changed', subCategoryId: 2147483647 })
      .expect(404);
    const response = await request(app.getHttpServer())
      .get(`/api/products/${product.productId}`)
      .expect(200);
    expect(response.body).toEqual(product);
  });
  it('does not mutate fields on duplicate identifiers', async () => {
    const first = await create();
    const second = await create();
    await request(app.getHttpServer())
      .patch(`/api/products/${second.productId}`)
      .send({ sku: first.sku, salePrice: '9.99' })
      .expect(409);
    const response = await request(app.getHttpServer())
      .get(`/api/products/${second.productId}`)
      .expect(200);
    expect(response.body).toEqual(second);
  });
  it('enforces subcategory lifecycle and permits moving to an active parent', async () => {
    const origin = await parent();
    const target = await parent();
    const product = await create({ subCategoryId: origin.subCategoryId });
    await request(app.getHttpServer())
      .delete(`/api/sub-categories/${origin.subCategoryId}`)
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/api/products/${product.productId}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/sub-categories/${origin.subCategoryId}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/products/${product.productId}/activate`)
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/products')
      .send({ ...payload(), subCategoryId: origin.subCategoryId })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/products/${product.productId}`)
      .send({ subCategoryId: target.subCategoryId })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/products/${product.productId}/activate`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/products/${product.productId}/activate`)
      .expect(409);
  });
  it('paginates and filters by state and parent', async () => {
    const isolated = await parent();
    const one = await create({ subCategoryId: isolated.subCategoryId });
    await create({ subCategoryId: isolated.subCategoryId });
    await request(app.getHttpServer())
      .delete(`/api/products/${one.productId}`)
      .expect(200);
    const response = await request(app.getHttpServer())
      .get('/api/products')
      .query({
        subCategoryId: isolated.subCategoryId,
        status: 'active',
        limit: 1,
        page: 1,
      })
      .expect(200);
    expect(response.body).toMatchObject({ total: 1, page: 1, limit: 1 });
    expect((response.body as { items: unknown[] }).items).toHaveLength(1);
    const second = await request(app.getHttpServer())
      .get('/api/products')
      .query({ subCategoryId: isolated.subCategoryId, page: 2, limit: 1 })
      .expect(200);
    expect(second.body).toMatchObject({ total: 2, page: 2 });
    await request(app.getHttpServer())
      .get('/api/products?limit=101')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/products?status=invalid')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/products?subCategoryId=1.5')
      .expect(400);
  });
  it('serializes concurrent duplicate creation', async () => {
    const data = payload();
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer()).post('/api/products').send(data),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  it('handles missing and invalid identifiers', async () => {
    await request(app.getHttpServer())
      .get('/api/products/2147483647')
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/products/2147483648')
      .expect(400);
    await request(app.getHttpServer()).get('/api/products/0').expect(400);
  });
  it('updates decimal prices and clears optional fields', async () => {
    const product = await create({ description: 'Old description' });
    const response = await request(app.getHttpServer())
      .patch(`/api/products/${product.productId}`)
      .send({
        cost: '0.01',
        salePrice: '123.45',
        name: '  Nuevo teclado  ',
        description: null,
      })
      .expect(200);
    expect(response.body).toMatchObject({
      cost: '0.01',
      salePrice: '123.45',
      name: 'Nuevo teclado',
      description: null,
    });
  });

  it('enforces nonnegative money at the database level', async () => {
    const product = await create();
    await expect(
      db.product.update({
        where: { productId: product.productId },
        data: { cost: '-0.01' },
      }),
    ).rejects.toThrow();
    const stored = await db.product.findUniqueOrThrow({
      where: { productId: product.productId },
    });
    expect(stored.cost.toFixed(2)).toBe(product.cost);
  });

  it('documents product response and pagination in Swagger', async () => {
    const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger');
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(document.paths['/api/products']).toBeDefined();
    expect(document.components?.schemas?.ProductEntity).toBeDefined();
    expect(document.components?.schemas?.ProductPageEntity).toBeDefined();
  });

  it('retains products after a fresh application starts', async () => {
    const product = await create();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const fresh = module.createNestApplication<INestApplication<App>>();
    configureApp(fresh);
    try {
      await fresh.init();
      const response = await request(fresh.getHttpServer())
        .get(`/api/products/${product.productId}`)
        .expect(200);
      expect(response.body).toEqual(product);
    } finally {
      await fresh.close();
    }
  });
});
