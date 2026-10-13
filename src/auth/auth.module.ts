import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './access.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessGuard,
    { provide: APP_GUARD, useExisting: AccessGuard },
  ],
  exports: [AccessGuard, AuthService],
})
export class AuthModule {}
