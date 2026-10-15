import { SaleOperationsService } from './services/sale-operations.service';
import { Module } from '@nestjs/common';
import { SalesController } from './controllers/sales.controller';
import { SalesService } from './services/sales.service';
@Module({
  controllers: [SalesController],
  providers: [SalesService, SaleOperationsService],
})
export class SalesModule {}
