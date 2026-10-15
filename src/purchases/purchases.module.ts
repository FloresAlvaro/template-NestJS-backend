import { Module } from '@nestjs/common';
import { PurchasesController } from './controllers/purchases.controller';
import { PurchasesService } from './services/purchases.service';
@Module({ controllers: [PurchasesController], providers: [PurchasesService] })
export class PurchasesModule {}
