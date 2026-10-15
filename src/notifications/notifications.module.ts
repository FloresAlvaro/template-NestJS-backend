import { Module } from '@nestjs/common';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationsService } from './services/notifications.service';
import { NotificationWorkerService } from './services/notification-worker.service';
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationWorkerService],
})
export class NotificationsModule {}
