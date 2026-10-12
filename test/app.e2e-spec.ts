import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';

type CategoryResponse = { categoryId: number; name: string; isActive: boolean };
type SubResponse = {
  subCategoryId: number;
  categoryId: number;
  name: string;
  updatedAt: string;
};

// Explicit opt-in: never use the application's normal DATABASE_URL for tests.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test')) {
  throw new Error(
    'Set TEST_DATABASE_URL to a dedicated PostgreSQL database whose name ends with _test',
  );
}
process.env.DATABASE_URL = testUrl;

describe('Catalog API (PostgreSQL)', () => {
  let app: INestApplication<App>;
  const ids: number[] = [];
  const prefix = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let seq = 0;

  async function openApp() {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const instance = module.createNestApplication<INestApplication<App>>();
    configureApp(instance);
    await instance.init();
    return instance;
  }
  async function category() {
    const response = await request(app.getHttpServer())
      .post('/api/categories')
      .send({ name: `${prefix}-${++seq}` })
      .expect(201);
    const body = response.body as CategoryResponse;
    ids.push(body.categoryId);
    return body;
  }
  async function sub(categoryId: number, name = 'Original') {
    const response = await request(app.getHttpServer())
      .post('/api/sub-categories')
      .send({ categoryId, name })
      .expect(201);
    return response.body as SubResponse;
  }
  beforeAll(async () => {
    app = await openApp();
  });
  afterAll(async () => {
    if (!app) return;
    const db = app.get(PrismaService);
    await db.subCategory.deleteMany({ where: { categoryId: { in: ids } } });
    await db.category.deleteMany({ where: { categoryId: { in: ids } } });
    await app.close();
  });

  it('exposes health under the same prefix used by production', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });
  it('trims names, rejects unknown fields and duplicate category names ignoring case', async () => {
    const cat = await category();
    await request(app.getHttpServer())
      .post('/api/categories')
      .send({ name: `  ${cat.name.toUpperCase()}  ` })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/categories/${cat.categoryId}`)
      .send({ isActive: false })
      .expect(400);
  });
  it.each(['name', 'categoryId'])(
    'rejects null %s in a subcategory PATCH',
    async (field) => {
      const cat = await category();
      const item = await sub(cat.categoryId);
      await request(app.getHttpServer())
        .patch(`/api/sub-categories/${item.subCategoryId}`)
        .send({ [field]: null })
        .expect(400);
      const response = await request(app.getHttpServer())
        .get(`/api/sub-categories/${item.subCategoryId}`)
        .expect(200);
      expect(response.body).toEqual(item);
    },
  );
  it('rejects a null category name', async () => {
    const cat = await category();
    await request(app.getHttpServer())
      .patch(`/api/categories/${cat.categoryId}`)
      .send({ name: null })
      .expect(400);
  });
  it('keeps all fields unchanged when the destination does not exist', async () => {
    const cat = await category();
    const item = await sub(cat.categoryId);
    await request(app.getHttpServer())
      .patch(`/api/sub-categories/${item.subCategoryId}`)
      .send({ name: 'Changed', categoryId: 2147483647 })
      .expect(404);
    const result = await request(app.getHttpServer())
      .get(`/api/sub-categories/${item.subCategoryId}`)
      .expect(200);
    expect(result.body).toEqual(item);
  });
  it('keeps all fields unchanged when the destination is inactive', async () => {
    const origin = await category();
    const destination = await category();
    const item = await sub(origin.categoryId);
    await request(app.getHttpServer())
      .delete(`/api/categories/${destination.categoryId}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/sub-categories/${item.subCategoryId}`)
      .send({ name: 'Changed', categoryId: destination.categoryId })
      .expect(409);
    const result = await request(app.getHttpServer())
      .get(`/api/sub-categories/${item.subCategoryId}`)
      .expect(200);
    expect(result.body).toEqual(item);
  });
  it('rejects a move that duplicates a name even without renaming', async () => {
    const origin = await category();
    const destination = await category();
    const item = await sub(origin.categoryId);
    await sub(destination.categoryId, 'ORIGINAL');
    await request(app.getHttpServer())
      .patch(`/api/sub-categories/${item.subCategoryId}`)
      .send({ categoryId: destination.categoryId })
      .expect(409);
  });
  it('moves and renames together and lists nested subcategories', async () => {
    const origin = await category();
    const destination = await category();
    const item = await sub(origin.categoryId);
    await request(app.getHttpServer())
      .patch(`/api/sub-categories/${item.subCategoryId}`)
      .send({ categoryId: destination.categoryId, name: '  Renamed  ' })
      .expect(200);
    const result = await request(app.getHttpServer())
      .get(`/api/categories/${destination.categoryId}/sub-categories`)
      .expect(200);
    expect(result.body).toMatchObject({
      subCategories: [{ subCategoryId: item.subCategoryId, name: 'Renamed' }],
    });
  });
  it('enforces deactivation and reactivation rules', async () => {
    const cat = await category();
    const item = await sub(cat.categoryId);
    await request(app.getHttpServer())
      .delete(`/api/categories/${cat.categoryId}`)
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/api/sub-categories/${item.subCategoryId}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/categories/${cat.categoryId}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/sub-categories/${item.subCategoryId}/activate`)
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/categories/${cat.categoryId}/activate`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/sub-categories/${item.subCategoryId}/activate`)
      .expect(200);
  });
  it('serializes concurrent duplicate creation', async () => {
    const cat = await category();
    const responses = await Promise.all(
      ['Concurrent', 'CONCURRENT'].map((name) =>
        request(app.getHttpServer())
          .post('/api/sub-categories')
          .send({ categoryId: cat.categoryId, name }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  it('prevents active children under inactive parents during concurrent writes', async () => {
    const cat = await category();
    const responses = await Promise.all([
      request(app.getHttpServer()).delete(`/api/categories/${cat.categoryId}`),
      request(app.getHttpServer())
        .post('/api/sub-categories')
        .send({ categoryId: cat.categoryId, name: 'Concurrent' }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual(
      expect.arrayContaining([409]),
    );
    expect(responses.every((r) => r.status < 500)).toBe(true);
    const db = app.get(PrismaService);
    const parent = await db.category.findUniqueOrThrow({
      where: { categoryId: cat.categoryId },
    });
    const active = await db.subCategory.count({
      where: { categoryId: cat.categoryId, isActive: true },
    });
    expect(parent.isActive || active === 0).toBe(true);
  });
  it('persists records after recreating the application', async () => {
    const cat = await category();
    const item = await sub(cat.categoryId);
    await app.close();
    app = await openApp();
    const result = await request(app.getHttpServer())
      .get(`/api/sub-categories/${item.subCategoryId}`)
      .expect(200);
    expect(result.body).toEqual(item);
  });
});
