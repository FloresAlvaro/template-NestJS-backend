import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderExpiryService } from './order-expiry.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrderExpiryService],
})
export class OrdersModule {}
