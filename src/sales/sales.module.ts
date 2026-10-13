import { SaleOperationsService } from './sale-operations.service';
import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
@Module({
  controllers: [SalesController],
  providers: [SalesService, SaleOperationsService],
})
export class SalesModule {}
