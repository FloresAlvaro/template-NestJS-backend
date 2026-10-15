import { ConflictException } from '@nestjs/common';
import {
  OrderOperationKind,
  OrderStatus,
} from '../../../generated/prisma/client';

export function effectiveOrderStatus(
  status: OrderStatus,
  expiresAt: Date,
  at = new Date(),
): OrderStatus {
  return status === OrderStatus.PENDING && expiresAt <= at
    ? OrderStatus.EXPIRED
    : status;
}

export function nextOrderStatus(
  status: OrderStatus,
  kind: OrderOperationKind,
): OrderStatus {
  const transitions: Record<
    OrderOperationKind,
    readonly [OrderStatus, OrderStatus]
  > = {
    CONFIRM: [OrderStatus.PENDING, OrderStatus.CONFIRMED],
    READY: [OrderStatus.CONFIRMED, OrderStatus.READY],
    COMPLETE: [OrderStatus.READY, OrderStatus.COMPLETED],
    CANCEL: [OrderStatus.PENDING, OrderStatus.CANCELLED],
  };
  const [expected, next] = transitions[kind];
  if (status !== expected)
    throw new ConflictException(
      `No se puede ejecutar ${kind} sobre un pedido ${status}`,
    );
  return next;
}
