import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationDto } from '../dto/pagination.dto';
import { parseStatusFilter } from '../utils/status-filter';
import { readSessionToken } from '../../auth/security/session-cookie';

describe('Shared input boundaries', () => {
  it.each([0, -1, 1.5, null, 'invalid', 101])(
    'rejects invalid pagination limit %p',
    async (limit) => {
      expect(
        await validate(plainToInstance(PaginationDto, { limit })),
      ).not.toHaveLength(0);
    },
  );
  it('keeps defaults and transforms numeric query strings', async () => {
    const dto = plainToInstance(PaginationDto, { page: '2', limit: '10' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({ page: 2, limit: 10 });
    expect(new PaginationDto()).toMatchObject({ page: 1, limit: 20 });
  });
  it('rejects array-shaped status queries and accepts existing uppercase filters', () => {
    expect(parseStatusFilter('ACTIVE')).toBe('active');
    expect(() => parseStatusFilter(['active'] as unknown as string)).toThrow();
  });
  it('reads only the exact session cookie and rejects malformed tokens', () => {
    const token = 'a'.repeat(64);
    expect(readSessionToken(`other=1; tienda_session=${token}; extra=2`)).toBe(
      token,
    );
    expect(readSessionToken(`other_tienda_session=${token}`)).toBeUndefined();
    expect(readSessionToken('tienda_session=malformed')).toBeUndefined();
  });
});
