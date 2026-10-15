import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './guards/access.guard';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { PasswordRecoveryController } from './controllers/password-recovery.controller';
import { PasswordRecoveryService } from './services/password-recovery.service';
import { RecoveryMailService } from './services/recovery-mail.service';
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
