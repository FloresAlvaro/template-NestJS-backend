import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './access.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordRecoveryController } from './password-recovery.controller';
import { PasswordRecoveryService } from './password-recovery.service';
import { RecoveryMailService } from './recovery-mail.service';
@Global()
@Module({
  controllers: [AuthController, PasswordRecoveryController],
  providers: [
    AuthService,
    PasswordRecoveryService,
    RecoveryMailService,
    AccessGuard,
    { provide: APP_GUARD, useExisting: AccessGuard },
  ],
  exports: [AccessGuard, AuthService],
})
export class AuthModule {}
