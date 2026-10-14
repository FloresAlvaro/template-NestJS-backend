import { trustedOrigins } from '../../config/config-origins';
import { readSessionToken } from '../security/session-cookie';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/services/prisma.service';
import { Role } from '../../../generated/prisma/client';
import { AuthRequest, userSelect } from '../types/auth.types';
import { tokenHash } from '../security/password';

@Injectable()
export class AccessGuard implements CanActivate {
  private readonly attempts = new Map<
    string,
    { count: number; until: number }
  >();
  constructor(
    private readonly reflector: Reflector,
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {}
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
      const now = Date.now();
      for (const [key, value] of this.attempts)
        if (value.until <= now) this.attempts.delete(key);
      const key = `${recovery ? 'recovery:' : ''}${req.ip ?? 'unknown'}`;
      const bucket = this.attempts.get(key) ?? { count: 0, until: now + 60000 };
      if (++bucket.count > 10 || this.attempts.size >= 10000)
        throw new HttpException('Too many attempts. Try again later.', 429);
      this.attempts.set(key, bucket);
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
