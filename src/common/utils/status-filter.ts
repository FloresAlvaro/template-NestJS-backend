import { BadRequestException } from '@nestjs/common';
export type StatusFilter = 'active' | 'inactive' | 'all';
export function parseStatusFilter(value?: string): StatusFilter {
  if (value !== undefined && typeof value !== 'string')
    throw new BadRequestException(
      'Invalid status filter. Use active, inactive, or all.',
    );
  const status = (value ?? 'all').toLowerCase();
  if (status !== 'active' && status !== 'inactive' && status !== 'all')
    throw new BadRequestException(
      'Invalid status filter. Use active, inactive, or all.',
    );
  return status;
}
export function activeStatusWhere(status: StatusFilter) {
  return status === 'all' ? {} : { isActive: status === 'active' };
}
