import { Module } from '@nestjs/common';
import { ProductsController } from './controllers/products.controller';
import { ProductsService } from './services/products.service';
import { ProductImagesController } from './controllers/product-images.controller';
import { ProductImagesService } from './services/product-images.service';

@Module({
  controllers: [ProductsController, ProductImagesController],
  providers: [ProductsService, ProductImagesService],
  exports: [ProductImagesService],
})
export class ProductsModule {}
