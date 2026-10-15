import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';
import { PromotionsModule } from './promotions/promotions.module';
import { CashModule } from './cash/cash.module';
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
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchasesModule } from './purchases/purchases.module';

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
    SuppliersModule,
    PurchasesModule,
    CashModule,
    AuditModule,
    NotificationsModule,
    PromotionsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
