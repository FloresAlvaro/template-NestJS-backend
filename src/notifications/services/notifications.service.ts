import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/services/prisma.service';
import type { AuthUser } from '../../auth/types/auth.types';
import { NotificationListDto } from '../dto/notifications.dto';
import { Prisma } from '../../../generated/prisma/client';
@Injectable()
export class NotificationsService {
  constructor(private readonly db: PrismaService) {}
  async list(dto: NotificationListDto, user: AuthUser) {
    const scope: Prisma.OrderNotificationWhereInput =
      user.role === 'ADMIN' ? {} : { userId: user.userId };
    const where: Prisma.OrderNotificationWhereInput = {
      ...scope,
      ...(dto.status === 'SENT'
        ? { deliveredAt: { not: null } }
        : dto.status === 'PENDING'
          ? { deliveredAt: null, attempts: { lt: 8 } }
          : dto.status === 'FAILED'
            ? { deliveredAt: null, attempts: { gte: 8 } }
            : dto.status === 'UNREAD'
              ? { readAt: null }
              : {}),
    };
    const [items, total, unread] = await this.db.$transaction([
      this.db.orderNotification.findMany({
        where,
        orderBy: { notificationId: 'desc' },
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
      }),
      this.db.orderNotification.count({ where }),
      this.db.orderNotification.count({ where: { ...scope, readAt: null } }),
    ]);
    return {
      items: items.map(({ leaseUntil, ...notice }) => {
        void leaseUntil;
        return notice;
      }),
      total,
      unread,
      page: dto.page,
      limit: dto.limit,
    };
  }
  async read(notificationId: number, user: AuthUser) {
    const result = await this.db.orderNotification.updateMany({
      where: { notificationId, userId: user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (
      !result.count &&
      !(await this.db.orderNotification.findFirst({
        where: { notificationId, userId: user.userId },
      }))
    )
      throw new NotFoundException('Aviso no encontrado');
    return { success: true };
  }
  async retry(notificationId: number) {
    const at = new Date();
    const updated = await this.db.orderNotification.updateMany({
      where: {
        notificationId,
        deliveredAt: null,
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: at } }],
      },
      data: {
        attempts: 0,
        lastError: null,
        nextAttemptAt: at,
        leaseUntil: null,
      },
    });
    if (!updated.count)
      throw new ConflictException(
        'El aviso ya fue enviado, está en proceso o no existe',
      );
    return { success: true };
  }
}
