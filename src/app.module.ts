import { ShopModule } from './shop/shop.module';
import { CustomersModule } from './customers/customers.module';
import { SalesModule } from './sales/sales.module';
import { InventoryModule } from './inventory/inventory.module';
import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { ConfigModule } from '@nestjs/config';
import { CategoriesModule } from './categories/categories.module';
import { SubCategoriesModule } from './sub-categories/sub-categories.module';
import { DatabaseModule } from './database/database.module';
import { ProductsModule } from './products/products.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ReportsModule } from './reports/reports.module';
import { OrdersModule } from './orders/orders.module';

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
    AuthModule,
    UsersModule,
    ShopModule,
    InventoryModule,
    CustomersModule,
    SalesModule,
    ReportsModule,
    OrdersModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
