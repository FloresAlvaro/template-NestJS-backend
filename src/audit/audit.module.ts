import { AuditService } from './services/audit.service';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditController } from './controllers/audit.controller';
import { AuditContextInterceptor } from './interceptors/audit-context.interceptor';
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditContextInterceptor },
  ],
})
export class AuditModule {}
