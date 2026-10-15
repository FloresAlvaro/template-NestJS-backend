import { createHmac } from 'node:crypto';
import type { AuthRequest } from '../types/auth.types';
import { authClientAddress } from './proxy-client';

const secret = 'test-secret-with-at-least-32-characters';
function fixture(ip = '203.0.113.1', at = String(Date.now())) {
  return {
    ip: '127.0.0.1',
    headers: {
      'x-forwarded-for': '198.51.100.1',
      'x-tienda-client-ip': ip,
      'x-tienda-client-at': at,
      'x-tienda-client-signature': createHmac('sha256', secret)
        .update(`${at}\n${ip}`)
        .digest('hex'),
    },
  } as unknown as AuthRequest;
}
describe('Authenticated proxy address', () => {
  it('ignores forwarded addresses without a private proxy secret', () => {
    expect(authClientAddress(fixture())).toBe('127.0.0.1');
  });
  it('accepts an address signed by the proxy, including IPv6', () => {
    expect(authClientAddress(fixture(), secret)).toBe('203.0.113.1');
    expect(authClientAddress(fixture('::1'), secret)).toBe('::1');
  });
  it('rejects forged and stale assertions', () => {
    const req = fixture();
    req.headers['x-tienda-client-ip'] = '203.0.113.2';
    expect(() => authClientAddress(req, secret)).toThrow('Invalid proxy');
    expect(() =>
      authClientAddress(
        fixture('203.0.113.1', String(Date.now() - 60000)),
        secret,
      ),
    ).toThrow('Invalid proxy');
  });
  it('uses the direct peer when the request has no assertion', () => {
    expect(
      authClientAddress(
        {
          ip: '::1',
          headers: { 'x-forwarded-for': '203.0.113.1' },
        } as unknown as AuthRequest,
        secret,
      ),
    ).toBe('::1');
  });
});
