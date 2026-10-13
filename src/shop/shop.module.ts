import { Module } from '@nestjs/common';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';
import { ProductsModule } from '../products/products.module';
@Module({
  imports: [ProductsModule],
  controllers: [ShopController],
  providers: [ShopService],
})
export class ShopModule {}
