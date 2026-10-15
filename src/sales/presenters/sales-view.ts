import { Prisma } from '../../../generated/prisma/client';
export const saleInclude = {
  items: true,
  operations: {
    include: { items: true, cashMovement: { select: { shiftId: true } } },
    orderBy: { operationId: 'asc' as const },
  },
} satisfies Prisma.SaleInclude;
export type SaleDetail = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;
export function saleBalance(sale: SaleDetail) {
  let paid = new Prisma.Decimal(0),
    refunded = new Prisma.Decimal(0),
    returned = new Prisma.Decimal(0);
  const cancelled = sale.operations.some((op) => op.kind === 'CANCEL');
  for (const op of sale.operations) {
    if (op.kind === 'PAYMENT') paid = paid.add(op.amount);
    if (op.kind === 'REFUND') refunded = refunded.add(op.amount);
    if (op.kind === 'RETURN' || op.kind === 'CANCEL')
      returned = returned.add(op.amount);
  }
  const adjustedTotal = cancelled
    ? new Prisma.Decimal(0)
    : sale.total.sub(returned);
  const netPaid = paid.sub(refunded);
  return {
    cancelled,
    paid,
    refunded,
    returned,
    adjustedTotal,
    netPaid,
    balanceDue: Prisma.Decimal.max(0, adjustedTotal.sub(netPaid)),
    refundDue: Prisma.Decimal.max(0, netPaid.sub(adjustedTotal)),
  };
}
export function serializeSale(sale: SaleDetail) {
  const balance = saleBalance(sale);
  const returnedQuantity = (id: number) =>
    sale.operations
      .flatMap((op) => op.items)
      .filter((line) => line.saleItemId === id)
      .reduce((sum, line) => sum + line.quantity, 0);
  return {
    ...sale,
    requestHash: undefined,
    grossTotal: (sale.grossTotal ?? sale.total).toFixed(2),
    discountTotal: (sale.discountTotal ?? new Prisma.Decimal(0)).toFixed(2),
    total: sale.total.toFixed(2),
    status: balance.cancelled
      ? 'CANCELLED'
      : sale.items.every(
            (item) => returnedQuantity(item.saleItemId) === item.quantity,
          )
        ? 'RETURNED'
        : sale.operations.some((op) => op.kind === 'RETURN')
          ? 'PARTIALLY_RETURNED'
          : 'ACTIVE',
    paid: balance.paid.toFixed(2),
    refunded: balance.refunded.toFixed(2),
    adjustedTotal: balance.adjustedTotal.toFixed(2),
    balanceDue: balance.balanceDue.toFixed(2),
    refundDue: balance.refundDue.toFixed(2),
    items: sale.items.map((item) => ({
      ...item,
      listUnitPrice: (item.listUnitPrice ?? item.unitPrice).toFixed(2),
      unitDiscount: (item.unitDiscount ?? new Prisma.Decimal(0)).toFixed(2),
      unitPrice: item.unitPrice.toFixed(2),
      subtotal: item.subtotal.toFixed(2),
      returnedQuantity: returnedQuantity(item.saleItemId),
    })),
    operations: sale.operations.map((op) => ({
      ...op,
      requestHash: undefined,
      amount: op.amount.toFixed(2),
      items: op.items.map((line) => ({
        ...line,
        subtotal: line.subtotal.toFixed(2),
      })),
    })),
  };
}
