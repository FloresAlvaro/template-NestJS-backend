import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from './auth.service';
import { hashPassword, tokenHash } from './password';
import { RecoveryMailService } from './recovery-mail.service';

@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly db: PrismaService,
    private readonly auth: AuthService,
    private readonly mail: RecoveryMailService,
  ) {}

  async request(email: string) {
    // Check infrastructure for every address, including unknown/inactive accounts.
    await this.mail.ready();
    const token = randomBytes(32).toString('hex');
    const hash = tokenHash(token);
    const user = await this.db.catalogWrite(async (tx) => {
      await tx.passwordReset.deleteMany({
        where: { expiresAt: { lte: new Date() } },
      });
      const user = await tx.user.findUnique({
        where: { email },
        select: { userId: true, email: true, isActive: true },
      });
      if (!user?.isActive) return null;
      const data = {
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 15 * 60000),
      };
      await tx.passwordReset.upsert({
        where: { userId: user.userId },
        create: { ...data, userId: user.userId },
        update: data,
      });
      return user;
    });
    if (user) {
      try {
        await this.mail.send(user.email, token);
      } catch (error) {
        await this.db.passwordReset.deleteMany({ where: { tokenHash: hash } });
        throw error;
      }
    }
    return {
      message:
        'Si la cuenta está activa, recibirás un enlace para recuperar tu contraseña.',
    };
  }

  async reset(token: string, password: string) {
    const passwordHash = await hashPassword(password);
    return this.db.catalogWrite(async (tx) => {
      const reset = await tx.passwordReset.findUnique({
        where: { tokenHash: tokenHash(token) },
        include: { user: { select: { isActive: true } } },
      });
      if (!reset || reset.expiresAt <= new Date() || !reset.user.isActive)
        throw new BadRequestException('El enlace es inválido o ha caducado');
      await this.auth.replacePasswordInTransaction(
        tx,
        reset.userId,
        passwordHash,
      );
      return { success: true };
    });
  }
}
