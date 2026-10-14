import { ConflictException } from '@nestjs/common';
import {
  OrderOperationKind,
  OrderStatus,
} from '../../../generated/prisma/client';
import { effectiveOrderStatus, nextOrderStatus } from './order-rules';
import { availableQuantity } from '../../inventory/utils/reservations';

describe('Order lifecycle and stock eligibility', () => {
  it.each([
    [OrderStatus.PENDING, OrderOperationKind.CONFIRM, OrderStatus.CONFIRMED],
    [OrderStatus.CONFIRMED, OrderOperationKind.READY, OrderStatus.READY],
    [OrderStatus.READY, OrderOperationKind.COMPLETE, OrderStatus.COMPLETED],
    [OrderStatus.PENDING, OrderOperationKind.CANCEL, OrderStatus.CANCELLED],
  ])('allows %s -> %s -> %s', (current, action, expected) => {
    expect(nextOrderStatus(current, action)).toBe(expected);
  });
  it.each([
    [OrderStatus.EXPIRED, OrderOperationKind.CONFIRM],
    [OrderStatus.CANCELLED, OrderOperationKind.CONFIRM],
    [OrderStatus.COMPLETED, OrderOperationKind.READY],
    [OrderStatus.PENDING, OrderOperationKind.COMPLETE],
    [OrderStatus.CONFIRMED, OrderOperationKind.COMPLETE],
    [OrderStatus.CONFIRMED, OrderOperationKind.CANCEL],
    [OrderStatus.READY, OrderOperationKind.CANCEL],
  ])(
    'rejects operation %s / %s rather than skipping lifecycle steps',
    (current, action) => {
      expect(() => nextOrderStatus(current, action)).toThrow(ConflictException);
    },
  );
  it('expires a pending reservation at the exact deadline without expiring a confirmed order', () => {
    const deadline = new Date('2026-10-14T12:00:00Z');
    expect(
      effectiveOrderStatus(
        OrderStatus.PENDING,
        deadline,
        new Date(deadline.getTime() - 1),
      ),
    ).toBe(OrderStatus.PENDING);
    expect(effectiveOrderStatus(OrderStatus.PENDING, deadline, deadline)).toBe(
      OrderStatus.EXPIRED,
    );
    expect(
      effectiveOrderStatus(
        OrderStatus.CONFIRMED,
        deadline,
        new Date(deadline.getTime() + 1),
      ),
    ).toBe(OrderStatus.CONFIRMED);
  });
  it('separates physical and sellable stock and never exposes negative availability', () => {
    expect(availableQuantity(5, 3)).toBe(2);
    expect(availableQuantity(5, 5)).toBe(0);
    expect(availableQuantity(0, 0)).toBe(0);
    expect(availableQuantity(2, 3)).toBe(0);
  });
});
