import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../database/services/prisma.service';
import { ReportsService } from './reports.service';

describe('Report period boundaries', () => {
  const query = jest.fn(() => Promise.resolve([{}]));
  const service = new ReportsService({
    $queryRaw: query,
  } as unknown as PrismaService);
  beforeEach(() => query.mockClear());
  it.each([
    ['2026-01-01', '2026-01-02'],
    ['invalid', '2026-01-02T00:00:00Z'],
    ['2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'],
    ['2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z'],
    ['2025-01-01T00:00:00Z', '2026-01-03T00:00:00Z'],
  ])(
    'rejects %s through %s before querying sales or ranking',
    async (from, to) => {
      await expect(service.sales({ from, to })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.topProducts({ from, to })).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.salesSeries({ from, to, group: 'DAY' }),
      ).rejects.toThrow(BadRequestException);
      await expect(service.sellers({ from, to })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.paymentMethods({ from, to })).rejects.toThrow(
        BadRequestException,
      );
      expect(query).not.toHaveBeenCalled();
    },
  );
  it('accepts the 366-day boundary', async () => {
    await expect(
      service.sales({
        from: '2024-01-01T00:00:00Z',
        to: '2025-01-01T00:00:00Z',
      }),
    ).resolves.toMatchObject({
      from: '2024-01-01T00:00:00.000Z',
      to: '2025-01-01T00:00:00.000Z',
    });
  });
  it('normalizes a local timezone interval to UTC', async () => {
    await expect(
      service.sales({
        from: '2026-10-13T00:00:00-04:00',
        to: '2026-10-14T00:00:00-04:00',
      }),
    ).resolves.toMatchObject({
      from: '2026-10-13T04:00:00.000Z',
      to: '2026-10-14T04:00:00.000Z',
    });
  });
  it('does not disguise SQL failures as an empty successful report', async () => {
    const error = new Error('query failed');
    query.mockRejectedValueOnce(error);
    await expect(
      service.sales({
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-02T00:00:00Z',
      }),
    ).rejects.toBe(error);
  });
});
