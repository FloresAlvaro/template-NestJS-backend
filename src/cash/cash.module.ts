import { Module } from '@nestjs/common';
import { CashController } from './controllers/cash.controller';
import { CashService } from './services/cash.service';
@Module({ controllers: [CashController], providers: [CashService] })
export class CashModule {}
