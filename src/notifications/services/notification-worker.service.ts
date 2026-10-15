import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/services/prisma.service';
import { smtpTransport } from '../../common/mail/smtp-transport';
import type { OrderNotification } from '../../../generated/prisma/client';
@Injectable()
export class NotificationWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private readonly logger = new Logger(NotificationWorkerService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    if (
      process.env.NODE_ENV === 'test' ||
      this.config.get<string>('ORDER_NOTIFICATIONS_ENABLED', 'true') === 'false'
    )
      return;
    this.timer = setInterval(() => {
      void this.processBatch().catch(() =>
        this.logger.error('Could not process order notification queue'),
      );
    }, 15000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async processBatch() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let i = 0; i < 10; i++) {
        const lease = new Date(Date.now() + 120000);
        const rows = await this.db.$queryRaw<
          OrderNotification[]
        >`UPDATE "OrderNotification" SET "leaseUntil"=${lease},attempts=attempts+1 WHERE "notificationId"=(SELECT "notificationId" FROM "OrderNotification" WHERE "deliveredAt" IS NULL AND attempts<8 AND "nextAttemptAt"<=NOW() AND ("leaseUntil" IS NULL OR "leaseUntil"<=NOW()) ORDER BY "notificationId" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
        const notice = rows[0];
        if (!notice) break;
        try {
          const { transport, from } = smtpTransport(this.config);
          try {
            await transport.sendMail({
              from,
              to: notice.recipient,
              subject: notice.subject,
              text: notice.body,
              messageId:
                '<order-notice-' + notice.notificationId + '@tienda.local>',
            });
          } finally {
            transport.close();
          }
          await this.db.orderNotification.updateMany({
            where: { notificationId: notice.notificationId, leaseUntil: lease },
            data: {
              deliveredAt: new Date(),
              leaseUntil: null,
              lastError: null,
            },
          });
        } catch {
          await this.db.orderNotification.updateMany({
            where: { notificationId: notice.notificationId, leaseUntil: lease },
            data: {
              leaseUntil: null,
              lastError: 'No se pudo confirmar la entrega por SMTP',
              nextAttemptAt: new Date(
                Date.now() +
                  Math.min(3600000, 30000 * 2 ** (notice.attempts - 1)),
              ),
            },
          });
        }
      }
    } finally {
      this.busy = false;
    }
  }
}
