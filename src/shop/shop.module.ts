import { Module } from '@nestjs/common';
import { ShopController } from './controllers/shop.controller';
import { ShopService } from './services/shop.service';
import { ProductsModule } from '../products/products.module';
@Module({
  imports: [ProductsModule],
  controllers: [ShopController],
  providers: [ShopService],
})
export class ShopModule {}
