import { Prisma } from '../../../generated/prisma/client';

export const purchaseInclude = {
  items: { orderBy: { purchaseItemId: 'asc' as const } },
  operations: { orderBy: { operationId: 'asc' as const } },
} satisfies Prisma.PurchaseInclude;
export type PurchaseDetail = Prisma.PurchaseGetPayload<{
  include: typeof purchaseInclude;
}>;
export function serializePurchase(purchase: PurchaseDetail) {
  const { requestHash: _hash, ...fields } = purchase;
  void _hash;
  return {
    ...fields,
    total: purchase.total.toFixed(2),
    items: purchase.items.map((item) => ({
      ...item,
      unitCost: item.unitCost.toFixed(2),
      subtotal: item.subtotal.toFixed(2),
    })),
    operations: purchase.operations.map(({ requestHash, ...operation }) => {
      void requestHash;
      return operation;
    }),
  };
}
