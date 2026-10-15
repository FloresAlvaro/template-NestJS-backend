import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { ForbiddenException } from '@nestjs/common';
import type { AuthRequest } from '../types/auth.types';

// Only the holder of the private shared secret can assert a client address.
// Forwarded/X-Forwarded-For alone never establishes trust.
export function authClientAddress(req: AuthRequest, secret?: string): string {
  const ip = req.headers['x-tienda-client-ip'];
  const at = req.headers['x-tienda-client-at'];
  const signature = req.headers['x-tienda-client-signature'];
  if (!secret || (!ip && !at && !signature)) return req.ip ?? 'unknown';
  if (
    secret.length < 32 ||
    typeof ip !== 'string' ||
    !isIP(ip) ||
    typeof at !== 'string' ||
    !/^\d{13}$/.test(at) ||
    Math.abs(Date.now() - Number(at)) > 30000 ||
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    throw new ForbiddenException('Invalid proxy client identity');
  const expected = createHmac('sha256', secret).update(`${at}\n${ip}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
    throw new ForbiddenException('Invalid proxy client identity');
  return ip;
}
