import { Prisma } from '../../../generated/prisma/client';
import { saleInclude, serializeSale } from '../../sales/presenters/sales-view';
import { effectiveOrderStatus } from '../rules/order-rules';

export const orderInclude = {
  items: { orderBy: { orderItemId: 'asc' as const } },
  sale: { include: saleInclude },
  operations: {
    orderBy: { operationId: 'asc' as const },
    select: {
      operationId: true,
      kind: true,
      userId: true,
      userName: true,
      reason: true,
      createdAt: true,
    },
  },
} satisfies Prisma.OrderInclude;
export type OrderDetail = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

export function serializeOrder(
  order: OrderDetail,
  staff: boolean,
  at = new Date(),
) {
  const sale = order.sale ? serializeSale(order.sale) : null;
  return {
    orderId: order.orderId,
    requestId: order.requestId,
    customerId: order.customerId,
    customerName: order.customerName,
    customerDocument: order.customerDocument,
    status: effectiveOrderStatus(order.status, order.expiresAt, at),
    fulfillment: 'PICKUP' as const,
    total: order.total.toFixed(2),
    expiresAt: order.expiresAt,
    createdAt: order.createdAt,
    confirmedAt: order.confirmedAt,
    readyAt: order.readyAt,
    completedAt: order.completedAt,
    cancelledAt: order.cancelledAt,
    items: order.items.map((item) => ({
      orderItemId: item.orderItemId,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      subtotal: item.subtotal.toFixed(2),
    })),
    sale: sale
      ? {
          saleId: sale.saleId,
          status: sale.status,
          total: sale.total,
          adjustedTotal: sale.adjustedTotal,
          paid: sale.paid,
          refunded: sale.refunded,
          balanceDue: sale.balanceDue,
          refundDue: sale.refundDue,
        }
      : null,
    ...(staff ? { userId: order.userId, operations: order.operations } : {}),
  };
}
