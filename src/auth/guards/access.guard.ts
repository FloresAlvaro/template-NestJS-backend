import { trustedOrigins } from '../../config/config-origins';
import { readSessionToken } from '../security/session-cookie';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/services/prisma.service';
import { Role } from '../../../generated/prisma/client';
import { AuthRequest, userSelect } from '../types/auth.types';
import { tokenHash } from '../security/password';
import { authClientAddress } from '../security/proxy-client';
import { consumeAuthAttempt } from '../security/auth-throttle';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {
    const secret = this.config.get<string>('AUTH_PROXY_SECRET');
    if (secret && secret.length < 32)
      throw new Error('AUTH_PROXY_SECRET must contain at least 32 characters');
  }
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const targets = [context.getHandler(), context.getClass()];
    const recovery =
      !safe &&
      this.reflector.getAllAndOverride<boolean>('recoveryThrottle', targets);
    const authentication =
      !safe &&
      this.reflector.getAllAndOverride<boolean>('authThrottle', targets);
    if (!safe) {
      const origins = trustedOrigins(
        this.config.get<string>('TRUSTED_ORIGINS'),
      );
      if (!req.headers.origin || !origins.includes(req.headers.origin))
        throw new ForbiddenException('Untrusted request origin');
    }
    if (recovery || authentication) {
      const address = authClientAddress(
        req,
        this.config.get<string>('AUTH_PROXY_SECRET'),
      );
      await consumeAuthAttempt(
        this.db,
        `${recovery ? 'recovery:' : 'auth:'}${address}`,
      );
    }
    if (this.reflector.getAllAndOverride<boolean>('public', targets))
      return true;
    const token = readSessionToken(req.headers.cookie);
    if (!token) throw new UnauthorizedException('Login required');
    const hash = tokenHash(token);
    const session = await this.db.session.findUnique({
      where: { tokenHash: hash },
      include: { user: { select: userSelect } },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.isActive)
      throw new UnauthorizedException('Session expired or revoked');
    req.user = session.user;
    req.sessionHash = hash;
    // Management endpoints default to staff reads and administrator writes.
    const roles =
      this.reflector.getAllAndOverride<Role[]>('roles', targets) ??
      (safe ? [Role.ADMIN, Role.SELLER] : [Role.ADMIN]);
    if (!roles.includes(session.user.role))
      throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
