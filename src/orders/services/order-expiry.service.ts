import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/services/prisma.service';

export function expirePendingOrders(
  tx: Prisma.TransactionClient,
  at = new Date(),
) {
  return tx.order.updateMany({
    where: { status: 'PENDING', expiresAt: { lte: at } },
    data: { status: 'EXPIRED' },
  });
}

@Injectable()
export class OrderExpiryService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private readonly logger = new Logger(OrderExpiryService.name);
  constructor(private readonly db: PrismaService) {}
  async onModuleInit() {
    await this.db.catalogWrite((tx) => expirePendingOrders(tx));
    this.timer = setInterval(() => {
      void this.db
        .catalogWrite((tx) => expirePendingOrders(tx))
        .catch(() =>
          this.logger.error(
            'Failed to persist expired orders; reservation eligibility still follows expiresAt',
          ),
        );
    }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
