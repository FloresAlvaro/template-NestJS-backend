import { StockAlertsService } from './services/stock-alerts.service';
import { StockAlertsController } from './controllers/stock-alerts.controller';
import { Module } from '@nestjs/common';
import { InventoryService } from './services/inventory.service';
import { InventoryController } from './controllers/inventory.controller';
@Module({
  controllers: [InventoryController, StockAlertsController],
  providers: [InventoryService, StockAlertsService],
})
export class InventoryModule {}
