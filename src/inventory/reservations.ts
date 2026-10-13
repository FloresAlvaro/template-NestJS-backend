import type { Prisma } from '../../generated/prisma/client';

// Only unexpired pending orders reserve units. Physical stock is unchanged.
export async function reservedQuantities(
  tx: Prisma.TransactionClient,
  productIds: number[],
  at = new Date(),
  excludeOrderId?: number,
): Promise<Map<number, number>> {
  if (!productIds.length) return new Map();
  const rows = await tx.orderItem.groupBy({
    by: ['productId'],
    where: {
      productId: { in: productIds },
      orderId:
        excludeOrderId === undefined ? undefined : { not: excludeOrderId },
      order: { status: 'PENDING', expiresAt: { gt: at } },
    },
    _sum: { quantity: true },
  });
  return new Map(rows.map((row) => [row.productId, row._sum.quantity ?? 0]));
}

export function availableQuantity(physical: number, reserved: number): number {
  return Math.max(0, physical - reserved);
}
