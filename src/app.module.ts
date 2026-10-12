import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { ConfigModule } from '@nestjs/config';
import { CategoriesModule } from './categories/categories.module';
import { SubCategoriesModule } from './sub-categories/sub-categories.module';
import { DatabaseModule } from './database/database.module';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HealthModule,
    DatabaseModule,
    CategoriesModule,
    SubCategoriesModule,
    ProductsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
