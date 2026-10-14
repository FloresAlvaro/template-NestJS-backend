import { Module } from '@nestjs/common';
import { InventoryService } from './services/inventory.service';
import { InventoryController } from './controllers/inventory.controller';
@Module({ controllers: [InventoryController], providers: [InventoryService] })
export class InventoryModule {}
