import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Role } from '../../../generated/prisma/client';
import type { PrismaService } from '../../database/services/prisma.service';
import type { AuthRequest } from '../types/auth.types';
import { AccessGuard } from './access.guard';
import { tokenHash } from '../security/password';

function fixture(role: Role = Role.ADMIN, method = 'GET') {
  const controller = class {};
  const handler = () => undefined;
  const token = 'a'.repeat(64);
  const req = {
    method,
    path: '/api/example',
    headers: {
      origin: 'http://localhost:3000',
      cookie: `tienda_session=${token}`,
    },
    ip: '127.0.0.1',
  } as AuthRequest;
  const session = {
    expiresAt: new Date(Date.now() + 600000),
    user: {
      userId: 1,
      name: 'User',
      email: 'user@example.test',
      role,
      isActive: true,
    },
  };
  const findUnique = jest.fn((): Promise<typeof session | null> =>
    Promise.resolve(session),
  );
  const db = { session: { findUnique } } as unknown as PrismaService;
  const guard = new AccessGuard(
    new Reflector(),
    db,
    new ConfigService({ TRUSTED_ORIGINS: 'http://localhost:3000' }),
  );
  const context = {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return {
    guard,
    context,
    req,
    session,
    findUnique,
    handler,
    controller,
    token,
  };
}

describe('Global access policy', () => {
  afterEach(() => jest.useRealTimers());
  it.each([Role.ADMIN, Role.SELLER])(
    'allows management reads for %s and attaches the authenticated actor',
    async (role) => {
      const f = fixture(role);
      await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
      expect(f.req.user?.userId).toBe(1);
      expect(f.req.sessionHash).toBe(tokenHash(f.token));
    },
  );
  it.each([Role.SELLER, Role.CUSTOMER])(
    'rejects default writes for %s',
    async (role) => {
      const f = fixture(role, 'POST');
      await expect(f.guard.canActivate(f.context)).rejects.toThrow(
        ForbiddenException,
      );
    },
  );
  it('rejects a customer management read', async () => {
    const f = fixture(Role.CUSTOMER);
    await expect(f.guard.canActivate(f.context)).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('lets a method restriction override the broader controller role set', async () => {
    const f = fixture(Role.SELLER, 'POST');
    Reflect.defineMetadata('roles', [Role.ADMIN, Role.SELLER], f.controller);
    Reflect.defineMetadata('roles', [Role.ADMIN], f.handler);
    await expect(f.guard.canActivate(f.context)).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('honors an explicit staff write exception', async () => {
    const f = fixture(Role.SELLER, 'POST');
    Reflect.defineMetadata('roles', [Role.ADMIN, Role.SELLER], f.handler);
    await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
  });
  it('allows a public read without contacting session storage', async () => {
    const f = fixture();
    Reflect.defineMetadata('public', true, f.controller);
    delete f.req.headers.cookie;
    await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
    expect(f.findUnique).not.toHaveBeenCalled();
  });
  it('still rejects a foreign Origin on public writes', async () => {
    const f = fixture(Role.ADMIN, 'POST');
    Reflect.defineMetadata('public', true, f.handler);
    f.req.headers.origin = 'https://foreign.example';
    await expect(f.guard.canActivate(f.context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(f.findUnique).not.toHaveBeenCalled();
  });
  it('rejects missing cookies without querying the database', async () => {
    const f = fixture();
    delete f.req.headers.cookie;
    await expect(f.guard.canActivate(f.context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(f.findUnique).not.toHaveBeenCalled();
  });
  it.each(['revoked', 'expired', 'inactive'] as const)(
    'rejects a %s session',
    async (state) => {
      const f = fixture();
      if (state === 'revoked') f.findUnique.mockResolvedValue(null);
      if (state === 'expired') f.session.expiresAt = new Date(Date.now() - 1);
      if (state === 'inactive') f.session.user.isActive = false;
      await expect(f.guard.canActivate(f.context)).rejects.toThrow(
        UnauthorizedException,
      );
    },
  );
  it('propagates database failures instead of treating them as revoked sessions', async () => {
    const f = fixture();
    const outage = new Error('database unavailable');
    f.findUnique.mockRejectedValue(outage);
    await expect(f.guard.canActivate(f.context)).rejects.toBe(outage);
  });
  it('expires the recovery throttle window without weakening the public-write Origin check', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const f = fixture(Role.ADMIN, 'POST');
    Reflect.defineMetadata('public', true, f.controller);
    Reflect.defineMetadata('recoveryThrottle', true, f.controller);
    for (let i = 0; i < 10; i++)
      await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
      status: 429,
    });
    jest.advanceTimersByTime(60000);
    await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
    f.req.headers.origin = 'https://foreign.example';
    await expect(f.guard.canActivate(f.context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
