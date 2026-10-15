import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { App } from 'supertest/types';
import request from 'supertest';
import sharp from 'sharp';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/config/configure-app';
import { PrismaService } from '../src/database/services/prisma.service';
import { tokenHash } from '../src/auth/security/password';
import { NotificationWorkerService } from '../src/notifications/services/notification-worker.service';
import { expirePendingOrders } from '../src/orders/services/order-expiry.service';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Dedicated TEST_DATABASE_URL required');
if (!process.env.TEST_MAILPIT_URL || !process.env.TEST_SMTP_PORT)
  throw new Error('Dedicated test Mailpit required');
process.env.DATABASE_URL = url;
type Actor = 'ADMIN' | 'SELLER' | 'CUSTOMER' | 'OTHER';
type SaleResponse = {
  saleId: number;
  total: string;
  grossTotal: string;
  discountTotal: string;
  adjustedTotal: string;
  promotionSnapshot: { code: string; version: number };
  items: {
    saleItemId: number;
    unitPrice: string;
    listUnitPrice: string;
    unitDiscount: string;
  }[];
};
type PromotionResponse = { promotionId: number; version: number };

describe('Administrative audit, durable order notifications and controlled promotions', () => {
  let app: INestApplication<App>, db: PrismaService;
  let categoryId: number,
    subCategoryId: number,
    productId: number,
    customerId: number;
  const prefix = 'admin-features-' + randomUUID();
  const users = {} as Record<Actor, number>,
    cookies = {} as Record<Actor, string>;
  const get = (path: string, actor: Actor = 'ADMIN') =>
    request(app.getHttpServer()).get(path).set('Cookie', cookies[actor]);
  const post = (path: string, actor: Actor = 'ADMIN') =>
    request(app.getHttpServer())
      .post(path)
      .set('Cookie', cookies[actor])
      .set('Origin', 'http://localhost:3000');
  const patch = (path: string, body: object, actor: Actor = 'ADMIN') =>
    request(app.getHttpServer())
      .patch(path)
      .set('Cookie', cookies[actor])
      .set('Origin', 'http://localhost:3000')
      .send(body);
  const promotionBody = () => ({
    code: 'TEST_' + randomUUID().slice(0, 8).toUpperCase(),
    name: prefix,
    percentBps: 5000,
    startsAt: new Date(Date.now() - 60000).toISOString(),
    endsAt: new Date(Date.now() + 600000).toISOString(),
    isActive: true,
    allowSeller: true,
    minSubtotal: '0.00',
  });
  const promotion = async (body = promotionBody()) =>
    (await post('/api/promotions').send(body).expect(201))
      .body as PromotionResponse;
  const saleBody = (p?: PromotionResponse) => ({
    requestId: randomUUID(),
    customerId,
    items: [{ productId, quantity: 3, expectedUnitPrice: '0.10' }],
    ...(p
      ? {
          promotionId: p.promotionId,
          expectedPromotionVersion: p.version,
          expectedTotal: '0.15',
        }
      : {}),
  });
  const order = async () =>
    (
      (
        await post('/api/orders', 'CUSTOMER')
          .send({
            requestId: randomUUID(),
            items: [{ productId, quantity: 2, expectedUnitPrice: '0.10' }],
          })
          .expect(201)
      ).body as { orderId: number }
    ).orderId;
  const operation = () => ({
    requestId: randomUUID(),
    reason: 'Operación ficticia',
  });
  const mailConfig = (port = process.env.TEST_SMTP_PORT) =>
    new ConfigService({
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: port,
      SMTP_REQUIRE_TLS: 'false',
      SMTP_SECURE: 'false',
      MAIL_FROM: 'qa@tienda.local',
      SMTP_USER: '',
      SMTP_PASSWORD: '',
    });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    for (const actor of ['ADMIN', 'SELLER', 'CUSTOMER', 'OTHER'] as const)
      users[actor] = (
        await db.user.create({
          data: {
            name: actor,
            email: prefix + '-' + actor + '@example.test',
            role: actor === 'OTHER' ? 'ADMIN' : actor,
            passwordHash: 'never-a-real-password',
          },
        })
      ).userId;
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
    productId = (
      await db.product.create({
        data: {
          subCategoryId,
          name: prefix,
          sku: prefix.toUpperCase(),
          cost: '0.05',
          salePrice: '0.10',
          inventory: { create: { quantity: 100 } },
        },
      })
    ).productId;
    customerId = (
      await db.customer.create({
        data: { name: prefix, userId: users.CUSTOMER },
      })
    ).customerId;
  });
  async function clear() {
    await db.stockMovement.deleteMany({ where: { productId } });
    await db.orderOperation.deleteMany({ where: { order: { customerId } } });
    await db.orderItem.deleteMany({ where: { productId } });
    await db.order.deleteMany({ where: { customerId } });
    await db.saleOperationItem.deleteMany({
      where: { saleItem: { productId } },
    });
    await db.saleOperation.deleteMany({ where: { sale: { customerId } } });
    await db.saleItem.deleteMany({ where: { productId } });
    await db.sale.deleteMany({ where: { customerId } });
    await db.promotion.deleteMany({ where: { name: prefix } });
  }
  beforeEach(async () => {
    await clear();
    await db.product.update({
      where: { productId },
      data: { salePrice: '0.10', cost: '0.05' },
    });
    await db.inventory.update({
      where: { productId },
      data: { quantity: 100 },
    });
    for (const actor of ['ADMIN', 'SELLER', 'CUSTOMER', 'OTHER'] as const) {
      await db.user.update({
        where: { userId: users[actor] },
        data: { role: actor === 'OTHER' ? 'ADMIN' : actor },
      });
      await db.session.deleteMany({ where: { userId: users[actor] } });
      const token = randomBytes(32).toString('hex');
      cookies[actor] = 'tienda_session=' + token;
      await db.session.create({
        data: {
          tokenHash: tokenHash(token),
          userId: users[actor],
          expiresAt: new Date(Date.now() + 600000),
        },
      });
    }
  });
  afterAll(async () => {
    if (!db) return;
    await clear();
    await db.product.delete({ where: { productId } });
    await db.subCategory.delete({ where: { subCategoryId } });
    await db.category.delete({ where: { categoryId } });
    await db.customer.delete({ where: { customerId } });
    await db.customer.deleteMany({
      where: { userId: { in: Object.values(users) } },
    });
    await db.user.deleteMany({
      where: { userId: { in: Object.values(users) } },
    });
    await app.close();
  });
  it('requires real sessions, role permissions and trusted Origin', async () => {
    await request(app.getHttpServer()).get('/api/audit').expect(401);
    for (const actor of ['SELLER', 'CUSTOMER'] as const) {
      await get('/api/audit', actor).expect(403);
      await post('/api/promotions', actor).send(promotionBody()).expect(403);
    }
    await get('/api/promotions', 'CUSTOMER').expect(403);
    await get('/api/notifications', 'SELLER').expect(403);
    await request(app.getHttpServer())
      .post('/api/promotions')
      .set('Cookie', cookies.ADMIN)
      .send(promotionBody())
      .expect(403);
  });
  it('records exact previous/new prices and actor without storing credentials', async () => {
    await patch('/api/products/' + productId, {
      cost: '99999999999999.99',
      salePrice: '0.20',
    }).expect(200);
    const row = await db.auditLog.findFirstOrThrow({
      where: { entity: 'Product', entityId: productId, actorId: users.ADMIN },
      orderBy: { auditId: 'desc' },
    });
    expect(row.actorName).toBe('ADMIN');
    expect(row.before).toMatchObject({ cost: '0.05', salePrice: '0.10' });
    expect(row.after).toMatchObject({
      cost: '99999999999999.99',
      salePrice: '0.20',
    });
    await patch('/api/users/' + users.SELLER, { role: 'CUSTOMER' }).expect(200);
    const permission = await db.auditLog.findFirstOrThrow({
      where: { entity: 'User', entityId: users.SELLER, actorId: users.ADMIN },
    });
    expect(permission.before).toMatchObject({ role: 'SELLER' });
    expect(permission.after).toMatchObject({ role: 'CUSTOMER' });
    expect(JSON.stringify(permission)).not.toContain('passwordHash');
    const read = (
      await get(
        '/api/audit?entity=Product&entityId=' +
          productId +
          '&actorId=' +
          users.ADMIN +
          '&limit=1',
      ).expect(200)
    ).body as { total: number; items: unknown[] };
    expect(read.total).toBe(1);
    expect(read.items).toHaveLength(1);
  });
  it('isolates concurrent request actors and makes the audit append-only', async () => {
    const previous = await db.auditLog.count({
      where: { entity: 'Product', entityId: productId, actorId: users.ADMIN },
    });
    await Promise.all([
      patch('/api/products/' + productId, { salePrice: '0.20' }).expect(200),
      patch(
        '/api/categories/' + categoryId,
        { description: 'Cambio concurrente' },
        'OTHER',
      ).expect(200),
    ]);
    expect(
      await db.auditLog.count({
        where: { entity: 'Product', entityId: productId, actorId: users.ADMIN },
      }),
    ).toBe(previous + 1);
    expect(
      await db.auditLog.count({
        where: {
          entity: 'Category',
          entityId: categoryId,
          actorId: users.OTHER,
        },
      }),
    ).toBe(1);
    const row = await db.auditLog.findFirstOrThrow({
      where: { entity: 'Product', entityId: productId },
    });
    await expect(
      db.auditLog.update({
        where: { auditId: row.auditId },
        data: { actorName: 'Tampered' },
      }),
    ).rejects.toThrow();
    await expect(
      db.auditLog.delete({ where: { auditId: row.auditId } }),
    ).rejects.toThrow();
  });
  it('audits image changes with metadata rather than binary content', async () => {
    const image = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    await post('/api/products/' + productId + '/image')
      .attach('file', image, 'example.png')
      .expect(201);
    const record = await db.auditLog.findFirstOrThrow({
      where: {
        entity: 'ProductImage',
        entityId: productId,
        actorId: users.ADMIN,
      },
      orderBy: { auditId: 'desc' },
    });
    expect(record.after).toMatchObject({ hasImage: true });
    expect(JSON.stringify(record.after)).not.toContain('content":');
  });
  it('rolls back a catalog edit if its audit cannot be written', async () => {
    await db.$executeRawUnsafe(
      'ALTER TABLE "AuditLog" ADD CONSTRAINT audit_fixture_failure CHECK (entity <> \'Product\' OR "entityId" <> ' +
        productId +
        ') NOT VALID',
    );
    try {
      await patch('/api/products/' + productId, { salePrice: '0.99' }).expect(
        500,
      );
    } finally {
      await db.$executeRawUnsafe(
        'ALTER TABLE "AuditLog" DROP CONSTRAINT audit_fixture_failure',
      );
    }
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { productId } })
      ).salePrice.toFixed(2),
    ).toBe('0.10');
  });
  it('applies exact unit discounts once and refunds the historical discounted price', async () => {
    const p = await promotion();
    const body = saleBody(p);
    const replies = await Promise.all([
      post('/api/sales', 'SELLER').send(body).expect(201),
      post('/api/sales', 'SELLER').send(body).expect(201),
    ]);
    const sale = replies[0].body as SaleResponse;
    expect((replies[1].body as SaleResponse).saleId).toBe(sale.saleId);
    expect(sale).toMatchObject({
      total: '0.15',
      grossTotal: '0.30',
      discountTotal: '0.15',
    });
    expect(sale.items[0]).toMatchObject({
      listUnitPrice: '0.10',
      unitDiscount: '0.05',
      unitPrice: '0.05',
    });
    await patch('/api/promotions/' + p.promotionId, {
      ...promotionBody(),
      percentBps: 1000,
    }).expect(200);
    const result = (
      await post('/api/sales/' + sale.saleId + '/returns')
        .send({
          ...operation(),
          items: [{ saleItemId: sale.items[0].saleItemId, quantity: 1 }],
        })
        .expect(201)
    ).body as SaleResponse;
    expect(result.adjustedTotal).toBe('0.10');
    expect(result.promotionSnapshot.version).toBe(1);
    expect(
      (await db.inventory.findUniqueOrThrow({ where: { productId } })).quantity,
    ).toBe(98);
  });
  it('checks promotion permission, validity, minimum, expected total and version', async () => {
    const config = promotionBody();
    const p = await promotion({ ...config, allowSeller: false });
    const denied = await post('/api/sales', 'SELLER')
      .send(saleBody(p))
      .expect(403);
    expect(denied.body).toMatchObject({ code: 'PROMOTION_NOT_ALLOWED' });
    await patch('/api/promotions/' + p.promotionId, {
      ...config,
      allowSeller: true,
      minSubtotal: '1.00',
    }).expect(200);
    await post('/api/sales', 'SELLER')
      .send({ ...saleBody(p), expectedPromotionVersion: 2 })
      .expect(409);
    await patch('/api/promotions/' + p.promotionId, config).expect(200);
    await post('/api/sales', 'SELLER').send(saleBody(p)).expect(409);
    await post('/api/sales', 'SELLER')
      .send({
        ...saleBody(p),
        expectedPromotionVersion: 3,
        expectedTotal: '0.01',
      })
      .expect(409);
    await patch('/api/promotions/' + p.promotionId, {
      ...config,
      endsAt: new Date(Date.now() - 1000).toISOString(),
    }).expect(200);
    await post('/api/sales', 'SELLER')
      .send({ ...saleBody(p), expectedPromotionVersion: 4 })
      .expect(409);
    expect(await db.sale.count({ where: { customerId } })).toBe(0);
    expect(
      (await db.inventory.findUniqueOrThrow({ where: { productId } })).quantity,
    ).toBe(100);
  });
  it('rejects missing discount confirmation and invalid promotion configuration', async () => {
    const p = await promotion();
    const body = saleBody(p);
    const { expectedPromotionVersion, ...missing } = body;
    void expectedPromotionVersion;
    await post('/api/sales').send(missing).expect(400);
    await post('/api/promotions')
      .send({ ...promotionBody(), percentBps: 10001 })
      .expect(400);
    await post('/api/promotions')
      .send({
        ...promotionBody(),
        endsAt: new Date(Date.now() - 600000).toISOString(),
      })
      .expect(400);
  });
  it('queues confirmed, ready, cancelled and expired events once with customer isolation', async () => {
    const id = await order();
    const confirm = operation();
    await post('/api/orders/' + id + '/confirm', 'SELLER')
      .send(confirm)
      .expect(200);
    await post('/api/orders/' + id + '/confirm', 'SELLER')
      .send(confirm)
      .expect(200);
    await post('/api/orders/' + id + '/ready', 'SELLER')
      .send(operation())
      .expect(200);
    const cancelled = await order();
    await post('/api/orders/' + cancelled + '/cancel', 'CUSTOMER')
      .send(operation())
      .expect(200);
    const expired = await order();
    await db.order.update({
      where: { orderId: expired },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await db.catalogWrite((tx) => expirePendingOrders(tx));
    const list = (await get('/api/notifications', 'CUSTOMER').expect(200))
      .body as {
      items: { notificationId: number; status: string; userId: number }[];
      unread: number;
    };
    expect(list.items.map((n) => n.status).sort()).toEqual([
      'CANCELLED',
      'CONFIRMED',
      'EXPIRED',
      'READY',
    ]);
    expect(list.unread).toBe(4);
    await patch(
      '/api/notifications/' + list.items[0].notificationId + '/read',
      {},
      'OTHER',
    ).expect(404);
    await patch(
      '/api/notifications/' + list.items[0].notificationId + '/read',
      {},
      'CUSTOMER',
    ).expect(200);
    expect(
      (
        (await get('/api/notifications?status=UNREAD', 'CUSTOMER')).body as {
          total: number;
        }
      ).total,
    ).toBe(3);
  });
  it('persists failed SMTP delivery and retries safely through Mailpit', async () => {
    const id = await order();
    await post('/api/orders/' + id + '/cancel', 'CUSTOMER')
      .send(operation())
      .expect(200);
    const failed = new NotificationWorkerService(db, mailConfig('1'));
    await failed.processBatch();
    let notice = await db.orderNotification.findFirstOrThrow({
      where: { orderId: id },
    });
    expect(notice.deliveredAt).toBeNull();
    expect(notice.attempts).toBe(1);
    expect(notice.lastError).toBe('No se pudo confirmar la entrega por SMTP');
    expect(notice.leaseUntil).toBeNull();
    await post(
      '/api/notifications/' + notice.notificationId + '/retry',
      'CUSTOMER',
    ).expect(403);
    await post('/api/notifications/' + notice.notificationId + '/retry').expect(
      201,
    );
    const worker = new NotificationWorkerService(db, mailConfig());
    const second = new NotificationWorkerService(db, mailConfig());
    await Promise.all([worker.processBatch(), second.processBatch()]);
    notice = await db.orderNotification.findUniqueOrThrow({
      where: { notificationId: notice.notificationId },
    });
    expect(notice.deliveredAt).not.toBeNull();
    expect(notice.attempts).toBe(1);
    await post('/api/notifications/' + notice.notificationId + '/retry').expect(
      409,
    );
    const mailbox = await fetch(
      process.env.TEST_MAILPIT_URL + '/api/v1/messages',
    );
    const messages = (await mailbox.json()) as {
      messages: { To: { Address: string }[]; Subject: string }[];
    };
    expect(
      messages.messages.filter(
        (m) =>
          m.Subject === notice.subject &&
          m.To.some((to) => to.Address === notice.recipient),
      ),
    ).toHaveLength(1);
  });
  it('does not queue notifications from a rolled-back order change', async () => {
    const id = await order();
    await expect(
      db.catalogWrite(async (tx) => {
        await tx.order.update({
          where: { orderId: id },
          data: { status: 'CANCELLED' },
        });
        throw new Error('Rollback');
      }),
    ).rejects.toThrow('Rollback');
    expect(await db.orderNotification.count({ where: { orderId: id } })).toBe(
      0,
    );
    expect(
      (await db.order.findUniqueOrThrow({ where: { orderId: id } })).status,
    ).toBe('PENDING');
  });
});
